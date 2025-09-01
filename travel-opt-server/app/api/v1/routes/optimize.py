from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict
import osmnx as ox
import networkx as nx
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.services.graph_loader import get_graph
from app.services.tsp_solver import solve_tsp

router = APIRouter()


class Destination(BaseModel):
    name: str
    lat: float
    lng: float


class Accommodation(BaseModel):
    name: str
    lat: float
    lng: float
    drop_luggage: bool


class OptimizeRequest(BaseModel):
    start: Destination
    end: Destination
    days: int
    destinations: List[Destination]
    daily_weights: List[int]
    accommodations: Dict[str, Accommodation]


@router.post("/")
def optimize_route(req: OptimizeRequest):
    try:
        logger.info("📍 요청 수신 - optimize_route 시작")
        G = get_graph()
        logger.info("✅ 도로망 그래프 로딩 완료")

        intensity = req.daily_weights
        total_weight = sum(intensity)

        # 출발점, 도착점 제외하고 목적지 분배
        exclude = [req.start.name, req.end.name]
        dest_names = [d.name for d in req.destinations if d.name not in exclude]
        logger.info(f"📌 목적지 {len(dest_names)}개 분배 시작 (총 일수: {req.days + 1})")

        # 목적지 개수 일자별 비례 분배
        per_day = {
            f"Day{i+1}": round(len(dest_names) * (w / total_weight))
            for i, w in enumerate(intensity)
        }
        leftover = len(dest_names) - sum(per_day.values())
        for i in range(abs(leftover)):
            day = f"Day{(i % (req.days + 1)) + 1}"
            if day in per_day:
                per_day[day] += 1 if leftover > 0 else -1
        logger.info(f"📦 일별 목적지 분배 완료: {per_day}")

        # 목적지 배치
        day_plan = {f"Day{i+1}": [] for i in range(req.days + 1)}
        idx = 0
        for day in day_plan:
            day_plan[day] = dest_names[idx:idx + per_day[day]]
            idx += per_day[day]

        # 마지막 날에 도착지 추가
        day_plan[f"Day{req.days+1}"].append(req.end.name)
        logger.info(f"🗓️ 일별 경로 설정 완료: {day_plan}")

        # 좌표 맵 구성
        coord_map = {
            d.name: (d.lat, d.lng) for d in req.destinations
        }
        coord_map[req.start.name] = (req.start.lat, req.start.lng)
        coord_map[req.end.name] = (req.end.lat, req.end.lng)
        for accom in req.accommodations.values():
            if accom.name:
                coord_map[accom.name] = (accom.lat, accom.lng)

        logger.info("📍 좌표 맵 구성 완료")

        # 노드 매핑
        try:
            node_map = {
                name: ox.distance.nearest_nodes(G, lon, lat)
                for name, (lat, lon) in coord_map.items()
            }
        except Exception as e:
            logger.error(f"❌ 노드 매핑 실패: {str(e)}")
            raise HTTPException(status_code=400, detail="Node mapping failed.")

        logger.info("🧩 노드 매핑 완료")

        # 최적 경로 계산
        result = solve_tsp(G, req, day_plan, node_map)
        logger.info("🚀 TSP 최적화 완료")

        return result
    except Exception as e:
            # 오류가 발생하면 터미널에 오류 메시지를 명확히 출력합니다.
            print(f"오류 발생: {e}")
            # 클라이언트에게도 오류 메시지를 전달합니다.
            raise HTTPException(status_code=400, detail=str(e))