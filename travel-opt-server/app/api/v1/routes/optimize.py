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
    drop_luggage: bool

class OptimizeRequest(BaseModel):
    start: str
    end: str
    days: int
    destinations: List[Destination]
    daily_weights: List[int]
    accommodations: Dict[str, Accommodation]

@router.post("/")
def optimize_route(req: OptimizeRequest):
    logger.info("📍 요청 수신 - optimize_route 시작")
    G = get_graph()
    logger.info("✅ 도로망 그래프 로딩 완료")

    intensity = req.daily_weights
    total_weight = sum(intensity)

    # 출발점, 도착점 제외하고 목적지 분배
    dest_names = [d.name for d in req.destinations if d.name not in [req.start, req.end]]
    logger.info(f"📌 목적지 {len(dest_names)}개 분배 시작 (총 일수: {req.days + 1})")

    # 목적지 개수 일자별 비례 분배
    per_day = {
        f"Day{i+1}": round(len(dest_names) * (w / total_weight))
        for i, w in enumerate(intensity)
    }
    leftover = len(dest_names) - sum(per_day.values())
    for i in range(abs(leftover)):
        day = f"Day{(i % (req.days + 1)) + 1}"
        per_day[f"Day{day}"] += 1 if leftover > 0 else -1
    logger.info(f"📦 일별 목적지 분배 완료: {per_day}")

    # 목적지 배치
    day_plan = {f"Day{i+1}": [] for i in range(req.days + 1)}
    idx = 0
    for day in day_plan:
        day_plan[day] = dest_names[idx:idx+per_day[day]]
        idx += per_day[day]

    # 마지막 날에 도착지 추가
    day_plan[f"Day{req.days+1}"].append(req.end)
    logger.info(f"🗓️ 일별 경로 설정 완료: {day_plan}")

    # 좌표 맵 구성
    coord_map = {d.name: (d.lat, d.lng) for d in req.destinations}

    # 출발지, 도착지, 숙소는 geocode 사용
    try:
        if req.start not in coord_map:
            logger.info(f"🧭 출발지 지오코딩: {req.start}")
            coord_map[req.start] = ox.geocode(req.start + ", South Korea")

        if req.end not in coord_map:
            logger.info(f"🧭 도착지 지오코딩: {req.end}")
            coord_map[req.end] = ox.geocode(req.end + ", South Korea")

        for a in req.accommodations.values():
            if a.name and a.name not in coord_map:
                logger.info(f"🛏️ 숙소 지오코딩: {a.name}")
                coord_map[a.name] = ox.geocode(a.name + ", South Korea")
    except Exception as e:
        logger.error(f"❌ 지오코딩 실패: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Geocoding failed: {str(e)}")

    logger.info("📍 지오코딩 완료")

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
