from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict
import osmnx as ox
import itertools
import networkx as nx
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.services.graph_loader import get_graph
from app.services.tsp_solver import solve_tsp

router = APIRouter()

class Accommodation(BaseModel):
    name: str
    drop_luggage: bool
    midday_rest: bool

class OptimizeRequest(BaseModel):
    start: str
    end: str
    days: int
    destinations: List[str]
    daily_weights: List[int]
    accommodations: Dict[str, Accommodation]

@router.post("/")
def optimize_route(req: OptimizeRequest):
    logger.info("📍 요청 수신 - optimize_route 시작")
    G = get_graph()
    logger.info("✅ 도로망 그래프 로딩 완료")

    intensity = req.daily_weights
    total_weight = sum(intensity)
    destinations = [d for d in req.destinations if d != req.end]
    logger.info(f"📌 목적지 {len(destinations)}개 분배 시작 (총 일수: {req.days})")

    # 목적지 분배
    per_day = {
        f"Day{i+1}": round(len(destinations) * (w / total_weight))
        for i, w in enumerate(intensity)
    }
    leftover = len(destinations) - sum(per_day.values())
    for i in range(abs(leftover)):
        day = f"Day{(i % req.days)+1}"
        per_day[day] += 1 if leftover > 0 else -1
    logger.info(f"📦 일별 목적지 분배 완료: {per_day}")

    # 목적지 순서 분배
    day_plan = {f"Day{i+1}": [] for i in range(req.days)}
    idx = 0
    for day in day_plan:
        day_plan[day] = destinations[idx:idx+per_day[day]]
        idx += per_day[day]
    day_plan[f"Day{req.days}"].append(req.end)
    logger.info(f"🗓️ 일별 경로 설정 완료: {day_plan}")

    # 지오코딩 및 노드 매핑
    full_places = set(req.destinations + [req.start, req.end] + [a.name for a in req.accommodations.values()])
    coord_map = {}
    try:
        for p in full_places:
            logger.info(f"🧭 지오코딩 중: {p}")
            coord_map[p] = ox.geocode(p + ", South Korea")
    except Exception as e:
        logger.error(f"❌ 지오코딩 실패: {p}")
        raise HTTPException(status_code=400, detail=f"Geocoding failed: {p}")

    logger.info("📍 지오코딩 완료")

    node_map = {name: ox.distance.nearest_nodes(G, lon, lat) for name, (lat, lon) in coord_map.items()}
    logger.info("🧩 노드 매핑 완료")

    result = solve_tsp(G, req, day_plan, node_map)
    logger.info("🚀 TSP 최적화 완료")

    return result
