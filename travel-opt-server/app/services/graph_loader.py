import os
import networkx as nx
import osmnx as ox
from osmnx import graph_from_gdfs
import logging
import pickle

CACHE_PATH = "/Users/hyun/Desktop/University/solo-project/korea-trip-tsp/korea-road-graph.gpickle"
GRAPH = None

logger = logging.getLogger(__name__)

def get_graph():
    global GRAPH
    if GRAPH is not None:
        return GRAPH

    if os.path.exists(CACHE_PATH):
        logger.info("📁 캐시 그래프 로딩 중...")
        with open(CACHE_PATH, "rb") as f:
            GRAPH = pickle.load(f)
        logger.info("✅ 캐시 그래프 로딩 완료")
        return GRAPH

    logger.info("📦 대한민국 도로망 그래프 생성 시작...")
    ox.settings.use_cache = True
    ox.settings.log_console = True

    # ✅ 전국 도로망 생성
    G = ox.graph_from_place("South Korea", network_type="drive")
    GRAPH = G.to_undirected()

    logger.info("✅ 그래프 생성 완료, 캐시 저장 중...")
    with open(CACHE_PATH, "wb") as f:
        pickle.dump(GRAPH, f)

    return GRAPH
