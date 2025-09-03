import matplotlib
matplotlib.use('Agg')

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any
import osmnx as ox
import networkx as nx
import logging
import numpy as np
import itertools
from collections import deque

from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import euclidean_distances

from app.services.graph_loader import get_graph
from app.services.tsp_solver import solve_tsp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# --- Pydantic 모델 정의 ---

class Destination(BaseModel):
    name: str
    lat: float
    lng: float
    type: str

class Accommodation(BaseModel):
    name: str
    lat: float
    lng: float

class OptimizeRequest(BaseModel):
    start: Destination
    end: Destination
    days: int
    destinations: List[Destination]
    accommodations: Dict[str, Accommodation]
    max_spots_per_day: int = Field(..., ge=1, le=5)
    max_restaurants_per_day: int = Field(..., ge=1, le=3)
    include_last_day: bool = True

class Suggestion(BaseModel):
    name: str
    type: str
    suggestions: List[str]

class OptimizeResponse(BaseModel):
    days: List[Dict[str, Any]]
    unplaced_suggestions: List[Suggestion]


# --- API 라우트 함수 ---

@router.post("/", response_model=OptimizeResponse)
def optimize_route(req: OptimizeRequest):
    try:
        logger.info("📍 요청 수신 - optimize_route 시작")
        G = get_graph()
        logger.info("✅ 도로망 그래프 로딩 완료")

        num_days = req.days + 1
        exclude = {req.start.name, req.end.name}
        
        # 0. 초기 설정 및 목적지 분류
        all_valid_destinations = [d for d in req.destinations if d.name not in exclude]
        tourist_spots = [d for d in all_valid_destinations if d.type == '관광지']
        restaurants = [d for d in all_valid_destinations if d.type == '식당']
        logger.info(f"분류: 관광지 {len(tourist_spots)}개, 식당 {len(restaurants)}개")
        
        final_day_plan = {f"Day{i+1}": [] for i in range(num_days)}
        daily_capacity = {f"Day{i+1}": {'spots': req.max_spots_per_day, 'restaurants': req.max_restaurants_per_day} for i in range(num_days)}
        waiting_list = []
        unplaced_suggestions = []
        
        if not req.include_last_day:
            last_day_key = f"Day{num_days}"
            daily_capacity[last_day_key] = {'spots': 0, 'restaurants': 0}
            logger.info(f"ℹ️ 마지막 날({last_day_key})은 일정에 포함되지 않도록 설정되었습니다.")
        
        # 1. 관광지로 뼈대 세우기 및 1차 배정
        if tourist_spots:
            coords = np.array([[d.lat, d.lng] for d in tourist_spots])
            dest_map = { (d.lat, d.lng): d.name for d in tourist_spots }
            
            n_samples = len(tourist_spots)
            k_upper_bound = n_samples - 1
            max_k_to_test = min(k_upper_bound, num_days)
            optimal_k = 1
            if max_k_to_test >= 2:
                best_k = 2
                best_score = -1
                for k in range(2, max_k_to_test + 1):
                    kmeans = KMeans(n_clusters=k, random_state=42, n_init='auto').fit(coords)
                    if len(set(kmeans.labels_)) < 2: continue
                    score = silhouette_score(coords, kmeans.labels_)
                    if score > best_score: best_score, best_k = score, k
                optimal_k = best_k

            logger.info(f"✅ 최적 관광지 그룹 수: {optimal_k}")
            kmeans = KMeans(n_clusters=optimal_k, random_state=42, n_init='auto').fit(coords)
            clusters = {i: [] for i in range(optimal_k)}
            for i, label in enumerate(kmeans.labels_): clusters[label].append(dest_map[tuple(coords[i])])
            
            ordered_cluster_indices = list(range(optimal_k))
            if optimal_k > 1:
                centroids = kmeans.cluster_centers_
                start_coord = np.array([[req.start.lat, req.start.lng]])
                end_coord = np.array([[req.end.lat, req.end.lng]])
                points = np.vstack([start_coord, centroids, end_coord])
                dist_matrix = np.linalg.norm(points[:, np.newaxis, :] - points[np.newaxis, :, :], axis=2)
                min_path_len = float('inf')
                best_permutation = []
                num_intermediate_points = len(centroids)
                base_path = list(range(1, num_intermediate_points + 1))
                for p in itertools.permutations(base_path):
                    current_path = [0] + list(p) + [num_intermediate_points + 1]
                    current_len = sum(dist_matrix[current_path[i], current_path[i+1]] for i in range(len(current_path) - 1))
                    if current_len < min_path_len:
                        min_path_len = current_len
                        best_permutation = list(p)
                ordered_cluster_indices = [idx - 1 for idx in best_permutation]

            for i, cluster_idx in enumerate(ordered_cluster_indices):
                day_key = f"Day{i+1}"
                # 마지막 날 용량이 0이면 배정하지 않음
                if daily_capacity[day_key]['spots'] == 0:
                    waiting_list.extend([d for d in tourist_spots if d.name in clusters[cluster_idx]])
                    continue
                
                spots_for_day = clusters[cluster_idx]
                centroid = kmeans.cluster_centers_[cluster_idx]
                spots_for_day.sort(key=lambda name: euclidean_distances(
                    np.array([[d.lat, d.lng] for d in tourist_spots if d.name == name]), centroid.reshape(1, -1)
                )[0][0], reverse=True)
                
                while len(spots_for_day) > daily_capacity[day_key]['spots']:
                    waiting_list.append(next(d for d in tourist_spots if d.name == spots_for_day.pop(0)))
                
                final_day_plan[day_key].extend(spots_for_day)
                daily_capacity[day_key]['spots'] -= len(spots_for_day)
        
        if restaurants:
            anchor_coords_1st_pass = {}
            for day, spots in final_day_plan.items():
                if spots:
                    anchor_coords_1st_pass[day] = np.array(
                        [[d.lat, d.lng] for d in tourist_spots if d.name in spots]
                    )
            
            if anchor_coords_1st_pass:
                for r in restaurants:
                    r_coord = np.array([[r.lat, r.lng]])
                    avg_distances = {
                        day: np.mean(euclidean_distances(r_coord, coords_in_day))
                        for day, coords_in_day in anchor_coords_1st_pass.items()
                    }
                    sorted_days = sorted(avg_distances.keys(), key=lambda d: avg_distances[d])
                    placed = False
                    for day in sorted_days:
                        if daily_capacity[day]['restaurants'] > 0:
                            final_day_plan[day].append(r.name)
                            daily_capacity[day]['restaurants'] -= 1
                            placed = True
                            break
                    if not placed:
                        waiting_list.append(r)
            else:
                waiting_list.extend(restaurants)

        # 2. 스마트 재배치 (빈 날 활용)
        empty_days = [day for day, spots in final_day_plan.items() if not spots]
        if empty_days and waiting_list:
            logger.info(f"♻️ 빈 날({empty_days})을 활용한 스마트 재배치 시작")
            
            anchor_points_rebalance = {}
            for day in empty_days:
                # 마지막 날 용량이 0이면 재배치 후보에서 제외
                if daily_capacity[day]['spots'] == 0 and daily_capacity[day]['restaurants'] == 0:
                    continue
                    
                found_accom = None
                day_num = int(day.replace('Day', ''))
                for i in range(day_num, 0, -1):
                    key = f"Day{i}"
                    accom = req.accommodations.get(key)
                    if accom and accom.name:
                        found_accom = accom
                        break
                if found_accom:
                    anchor_points_rebalance[day] = np.array([[found_accom.lat, found_accom.lng]])

            if anchor_points_rebalance:
                waiting_list_q = deque(waiting_list)
                waiting_list = []
                while waiting_list_q:
                    item = waiting_list_q.popleft()
                    item_coord = np.array([[item.lat, item.lng]])
                    day_distances = {day: euclidean_distances(item_coord, accom_coord)[0][0] for day, accom_coord in anchor_points_rebalance.items()}
                    if not day_distances:
                        waiting_list.append(item)
                        continue
                    sorted_empty_days = sorted(day_distances.keys(), key=lambda d: day_distances[d])
                    placed = False
                    for closest_day in sorted_empty_days:
                        item_type = 'spots' if item.type == '관광지' else 'restaurants'
                        if daily_capacity[closest_day][item_type] > 0:
                            final_day_plan[closest_day].append(item.name)
                            daily_capacity[closest_day][item_type] -= 1
                            logger.info(f"   - '{item.name}'을(를) {closest_day}에 재배치 성공")
                            placed = True
                            break
                    if not placed:
                        waiting_list.append(item)

        if waiting_list:
            logger.info(f"ℹ️ 최종적으로 포함되지 못한 장소 {len(waiting_list)}개에 대한 가이드 생성")
            
            final_day_anchors = {}
            for day, items in final_day_plan.items():
                items_without_end = [i for i in items if i != req.end.name]
                if items_without_end:
                    coords_in_day = np.array([[d.lat, d.lng] for d in all_valid_destinations if d.name in items_without_end])
                    if coords_in_day.size > 0:
                        final_day_anchors[day] = coords_in_day

            if final_day_anchors:
                for item in waiting_list:
                    item_coord = np.array([[item.lat, item.lng]])
                    avg_distances = {
                        day: np.mean(euclidean_distances(item_coord, coords_in_day))
                        for day, coords_in_day in final_day_anchors.items()
                    }
                    sorted_days = sorted(avg_distances.keys(), key=lambda d: avg_distances[d])
                    suggestions = sorted_days[:1]
                    unplaced_suggestions.append(Suggestion(name=item.name, type=item.type, suggestions=[d.replace('Day', '일차') for d in suggestions]))
        
        # 3. 최종 도착지를 마지막 날 일정에 추가
        if req.end.name not in final_day_plan[f"Day{num_days}"]:
            final_day_plan[f"Day{num_days}"].append(req.end.name)
        
        coord_map = {d.name: (d.lat, d.lng) for d in all_valid_destinations}
        coord_map[req.start.name] = (req.start.lat, req.start.lng)
        coord_map[req.end.name] = (req.end.lat, req.end.lng)
        for accom in req.accommodations.values():
            if accom and accom.name:
                coord_map[accom.name] = (accom.lat, accom.lng)
        try:
            node_map = {name: ox.distance.nearest_nodes(G, lon, lat) for name, (lat, lon) in coord_map.items() if name}
        except Exception as e:
            logger.error(f"❌ 노드 매핑 실패: {str(e)}")
            raise HTTPException(status_code=400, detail="Node mapping failed.")
        logger.info("🧩 최종 노드 매핑 완료")

        tsp_result = solve_tsp(G, req, final_day_plan, node_map)
        
        return OptimizeResponse(days=tsp_result['days'], unplaced_suggestions=unplaced_suggestions)

    except Exception as e:
        logger.error(f"💥 서버 오류 발생: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

