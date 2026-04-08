import matplotlib
matplotlib.use('Agg')

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import osmnx as ox
import logging
import numpy as np
from collections import defaultdict
from sklearn.cluster import KMeans

from app.services.graph_loader import get_graph
from app.services.tsp_solver import solve_tsp

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# ==========================================
# 📌 Pydantic Request / Response 모델 정의
# ==========================================

class Destination(BaseModel):
    name: str
    lat: float
    lng: float
    type: str  # (프론트엔드 호환성을 위해 타입은 남겨둠)

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
    include_last_day: bool = True
    is_same_accommodation: bool = False

class Suggestion(BaseModel):
    name: str
    type: str
    suggestions: List[str]

class OptimizeResponse(BaseModel):
    days: List[Dict[str, Any]]
    unplaced_suggestions: List[Suggestion]


# ==========================================
# 📌 유틸리티 함수
# ==========================================

def get_dist_to_segment(p, a, b):
    """
    점(목적지)에서 선분(출발지-도착지 경로) 사이의 최단 거리를 계산합니다.
    일반적인 이동일(이동 경로) 최적화에 사용됩니다.
    """
    if np.array_equal(a, b):
        return np.linalg.norm(p - a)
    l2 = np.sum((a - b)**2)
    t = max(0, min(1, np.dot(p - a, b - a) / l2))
    projection = a + t * (b - a)
    return np.linalg.norm(p - projection)


# ==========================================
# 📌 메인 라우팅 (경로 분할 및 최적화 할당)
# ==========================================

@router.post("/", response_model=OptimizeResponse)
def optimize_route(req: OptimizeRequest):
    try:
        logger.info("📍 경로 최적화 API 호출: 이동 경로 및 연박 감지 로직 시작")
        G = get_graph()
        
        num_days = req.days + 1
        # 출발지/도착지와 겹치는 목적지는 제외
        all_destinations = [d for d in req.destinations if d.name not in {req.start.name, req.end.name}]
        
        final_day_plan = {f"Day{i+1}": [] for i in range(num_days)}
        active_days = [f"Day{i}" for i in range(1, num_days + 1) if not (not req.include_last_day and i == num_days)]

        # ---------------------------------------------------------
        # 1. 일자별 앵커(시작점/도착점) 정보 추출
        # ---------------------------------------------------------
        day_info = {}
        for i in range(1, num_days + 1):
            day_key = f"Day{i}"
            if day_key not in active_days: continue

            # 시작점 설정 (1일차는 출발지, 나머지는 전날 숙소)
            if i == 1: 
                start_name, start_pt = req.start.name, np.array([req.start.lat, req.start.lng])
            else:
                prev_accom = req.accommodations.get(f"Day{i-1}")
                if prev_accom and prev_accom.name and prev_accom.lat:
                    start_name, start_pt = prev_accom.name, np.array([prev_accom.lat, prev_accom.lng])
                else:
                    start_name, start_pt = req.start.name, np.array([req.start.lat, req.start.lng])
            
            # 도착점 설정 (마지막 날은 최종 도착지, 나머지는 당일 숙소)
            if i == num_days: 
                end_name, end_pt = req.end.name, np.array([req.end.lat, req.end.lng])
            else:
                curr_accom = req.accommodations.get(day_key)
                if curr_accom and curr_accom.name and curr_accom.lat:
                    end_name, end_pt = curr_accom.name, np.array([curr_accom.lat, curr_accom.lng])
                else:
                    end_name, end_pt = req.end.name, np.array([req.end.lat, req.end.lng])
            
            day_info[day_key] = {
                'start_name': start_name, 'end_name': end_name,
                'start_pt': start_pt, 'end_pt': end_pt
            }

        # ---------------------------------------------------------
        # 2. 케이스 분류: 전체 연박(Basecamp) vs 부분 연박 및 이동
        # ---------------------------------------------------------
        
        # [Case A] 명시적인 '전체 일정 동일 숙소' 플래그가 켜진 경우
        if getattr(req, 'is_same_accommodation', False):
            logger.info("🏨 전체 일정 동일 숙소(Basecamp) 모드 감지됨 -> K-Means 각도 분할 적용")
            
            if len(all_destinations) >= len(active_days):
                coords = np.array([[d.lat, d.lng] for d in all_destinations])
                kmeans = KMeans(n_clusters=len(active_days), random_state=42, n_init='auto').fit(coords)
                
                # 동선 꼬임 방지를 위해 1일차 기준점(공항 등)을 기준으로 시계 방향 정렬
                basecamp_pt = day_info[active_days[0]]['start_pt']
                cluster_order = np.argsort([np.arctan2(c[1] - basecamp_pt[1], c[0] - basecamp_pt[0]) for c in kmeans.cluster_centers_])
                
                for label_idx, cluster_id in enumerate(cluster_order):
                    assigned_day = active_days[label_idx]
                    cluster_items = [all_destinations[i].name for i, l in enumerate(kmeans.labels_) if l == cluster_id]
                    final_day_plan[assigned_day].extend(cluster_items)
            else:
                # 목적지 수가 일수보다 적은 예외 상황 처리
                for idx, item in enumerate(all_destinations):
                    final_day_plan[active_days[idx % len(active_days)]].append(item.name)

        # [Case B] 부분 연박 및 일반 이동 일정이 혼합된 경우
        else:
            # Step 1: 이동 경로(선분)를 기준으로 모든 목적지 1차 할당
            day_assignments = {day: [] for day in active_days}
            for item in all_destinations:
                p = np.array([item.lat, item.lng])
                best_day = min(active_days, key=lambda d: get_dist_to_segment(p, day_info[d]['start_pt'], day_info[d]['end_pt']))
                day_assignments[best_day].append(item)

            # Step 2: 숙소 명칭을 기준으로 진정한 의미의 '연박(2박 이상)' 그룹 도출
            hotel_names = set(a.name for a in req.accommodations.values() if a and a.name)
            accom_groups = defaultdict(list)
            assigned_days = set()

            for day in active_days:
                accom = req.accommodations.get(day)
                if accom and accom.name:
                    accom_groups[accom.name].append(day)
                    assigned_days.add(day)

            # 마지막 날(체크아웃 후 이동일)을 이전 연박 그룹에 포함하여 공평한 분배 유도
            for day in active_days:
                if day in assigned_days: continue
                start_name = day_info[day]['start_name']
                if start_name in hotel_names:
                    accom_groups[start_name].append(day)
                    assigned_days.add(day)
                else:
                    accom_groups[f"nomad_{day}"].append(day)

            # Step 3: 그룹 성격에 따른 목적지 분배 (이동일 vs 연박일)
            for group_key, days in accom_groups.items():
                sorted_days = sorted(days, key=lambda x: int(x.replace("Day", "")))
                
                # 그룹 내 실제 체류 박수 계산
                nights = sum(1 for d in sorted_days if req.accommodations.get(d) and req.accommodations.get(d).name == group_key)

                # 진정한 연박(2박 이상)일 경우 K-Means 클러스터링 기반 분할 적용
                if nights >= 2:
                    items = []
                    for d in sorted_days:
                        items.extend(day_assignments[d])
                        
                    if not items: continue
                    
                    logger.info(f"🔄 부분 연박 그룹 결성 ({nights}박): {group_key} (적용 날짜: {sorted_days})")
                    coords = np.array([[item.lat, item.lng] for item in items])
                    n_clusters = len(sorted_days)
                    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init='auto').fit(coords)
                    
                    # 지그재그 방지 및 Sweep Algorithm 효과를 위한 각도 정렬
                    center_pt = day_info[sorted_days[0]]['end_pt']
                    cluster_order = np.argsort([np.arctan2(c[1] - center_pt[1], c[0] - center_pt[0]) for c in kmeans.cluster_centers_])
                    
                    for label_idx, cluster_id in enumerate(cluster_order):
                        if label_idx < len(sorted_days):
                            target_day = sorted_days[label_idx]
                            final_day_plan[target_day].extend([items[i].name for i, l in enumerate(kmeans.labels_) if l == cluster_id])
                
                # 1박 또는 순수 이동일일 경우 1차 할당 결과 유지
                else:
                    for d in sorted_days:
                        final_day_plan[d].extend([item.name for item in day_assignments[d]])

        # ---------------------------------------------------------
        # 3. 노드 맵핑 및 TSP(외판원 문제) 알고리즘 실행
        # ---------------------------------------------------------
        coord_map = {d.name: (d.lat, d.lng) for d in all_destinations}
        coord_map[req.start.name] = (req.start.lat, req.start.lng)
        coord_map[req.end.name] = (req.end.lat, req.end.lng)
        
        for accom in req.accommodations.values():
            if accom and accom.name and accom.lat: 
                coord_map[accom.name] = (accom.lat, accom.lng)
        
        try:
            # OSMnx를 사용해 좌표를 실제 도로망(Graph) 노드에 매핑
            node_map = {name: ox.distance.nearest_nodes(G, lon, lat) for name, (lat, lon) in coord_map.items() if name}
        except Exception as e:
            logger.error(f"❌ 노드 매핑 실패: {str(e)}")
            raise HTTPException(status_code=400, detail="Node mapping failed.")
        
        # 분리된 목적지들을 바탕으로 세부 동선 최적화 (2-Opt, Sweep 등 적용)
        tsp_result = solve_tsp(G, req, final_day_plan, node_map, coord_map)
        
        return OptimizeResponse(days=tsp_result['days'], unplaced_suggestions=[])

    except Exception as e:
        logger.error(f"💥 서버 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))