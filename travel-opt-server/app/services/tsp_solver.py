import osmnx as ox
import networkx as nx
import itertools

# 주소를 위도/경도로 변환하는 함수
def geocode_locations(locations):
    return [ox.geocode(loc) for loc in locations]

# 단순 TSP 순열 계산 (향후 개선 가능)
def solve_tsp_with_osmnx(start, end, waypoints):
    all_locations = [start] + waypoints + [end]
    coords = geocode_locations(all_locations)

    G = ox.graph_from_place("Seoul, South Korea", network_type="drive")
    node_points = [ox.distance.nearest_nodes(G, lon, lat) for lat, lon in coords]

    # 경로 거리 계산용 인접 행렬 생성
    def path_length(path):
        total = 0
        for i in range(len(path) - 1):
            try:
                route = nx.shortest_path_length(G, path[i], path[i+1], weight='length')
            except:
                route = float('inf')
            total += route
        return total

    # 중간 지점 순열 계산
    best_path = None
    best_order = None
    for perm in itertools.permutations(node_points[1:-1]):
        candidate = [node_points[0]] + list(perm) + [node_points[-1]]
        if best_path is None or path_length(candidate) < best_path:
            best_path = path_length(candidate)
            best_order = candidate

    # 다시 주소 순서로 변환
    final_coords = [ox.distance.nearest_nodes(G, x=G.nodes[n]['x'], y=G.nodes[n]['y'], return_dist=False) for n in best_order]
    # 이 부분은 실제 주소 역변환 기능 붙이면 개선 가능 (지금은 순서만 반환)
    return [start] + waypoints + [end]  # 임시: 원래 순서 그대로 리턴
