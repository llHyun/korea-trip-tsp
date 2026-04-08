import networkx as nx
import numpy as np

def calc_distance(G, order, node_map):
    """
    주어진 노드 순서에 따라 OSMnx 그래프(G) 상의 실제 도로망 최단 거리를 계산합니다.
    """
    dist = 0
    for i in range(len(order) - 1):
        a = order[i]
        b = order[i + 1]
        try:
            d = nx.shortest_path_length(G, node_map[a], node_map[b], weight="length")
            dist += d
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            print(f"⚠️ 경로 없음: {a} → {b} → fallback 처리됨 (1e9m)")
            dist += 1e9
        except Exception as e:
            print(f"❌ 예기치 않은 에러: {a} → {b}: {str(e)}")
            raise e
    return dist / 1000  # meter를 km로 변환하여 반환

def solve_tsp(G, req, day_plan, node_map, coord_map):
    """
    일자별 할당된 목적지들을 기반으로 최적의 방문 순서를 계산합니다.
    - 이동일(Start != End): Vector Projection을 이용한 방향성 정렬
    - 연박일(Start == End): Sweep Algorithm(각도 기반)을 이용한 순환 동선 구성
    - 공통: 2-Opt 알고리즘을 통한 교차 경로(Self-Intersection) 해소
    """
    result = []
    
    for day, places in day_plan.items():
        day_index = int(day.replace("Day", ""))
        
        # 1. 일자별 출발지(Start Anchor) 설정
        if day_index == 1:
            start = req.start.name
        else:
            prev_accom = req.accommodations.get(f"Day{day_index - 1}")
            start = prev_accom.name if prev_accom and prev_accom.name else req.start.name
            
        # 2. 일자별 도착지(End Anchor) 설정
        if day_index > req.days:
            end = req.end.name
            end_role = "도착지"
        else:
            curr_accom = req.accommodations.get(day)
            end = curr_accom.name if curr_accom and curr_accom.name else req.end.name
            end_role = "숙소"

        if not places:
            result.append({"date": day, "route": [{"name": start, "role": "출발지"}, {"name": end, "role": end_role}]})
            continue

        start_coord = np.array(coord_map[start])
        end_coord = np.array(coord_map[end])
        vec_ab = end_coord - start_coord
        
        route_names = list(places)
        
        # 3. 일정 성격에 따른 1차 동선 정렬 알고리즘 분기
        if np.linalg.norm(vec_ab) > 1e-5:
            # [이동일 모드] 출발지와 도착지가 다를 경우 (Vector Projection 정렬)
            # 출발지에서 도착지로 향하는 벡터를 기준으로 내적(Dot Product)하여 진행 방향 순서대로 정렬
            route_names.sort(key=lambda name: np.dot(np.array(coord_map[name]) - start_coord, vec_ab))
        else:
            # [연박/Basecamp 모드] 출발지와 도착지가 같을 경우 (Sweep Algorithm 정렬)
            # 거점(숙소)을 중심으로 각 목적지의 각도(-180° ~ 180°)를 계산하여 시계 방향으로 원형 정렬
            route_names.sort(key=lambda name: np.arctan2(coord_map[name][1] - start_coord[1], coord_map[name][0] - start_coord[0]))

        # 4. 2-Opt 알고리즘 수행 (Local Search)
        # 1차 정렬된 동선에서 X자로 교차하는 비효율적인 구간을 찾아 일자로 풀어줌
        optimized = True
        while optimized:
            optimized = False
            for i in range(len(route_names) - 1):
                for j in range(i + 2, len(route_names)):
                    node_i = route_names[i]
                    node_i_next = route_names[i+1]
                    node_j = route_names[j]
                    node_j_next = route_names[j+1] if j + 1 < len(route_names) else end

                    # 기존 동선과 교차를 푼(Swapped) 동선의 실제 도로망 거리 비교
                    dist_current = calc_distance(G, [node_i, node_i_next], node_map) + \
                                calc_distance(G, [node_j, node_j_next], node_map)
                    
                    dist_swapped = calc_distance(G, [node_i, node_j], node_map) + \
                                calc_distance(G, [node_i_next, node_j_next], node_map)

                    if dist_swapped < dist_current:
                        route_names[i+1:j+1] = reversed(route_names[i+1:j+1])
                        optimized = True

        # 5. 최종 Route 조립
        full_route = [{"name": start, "role": "출발지"}] + \
                    [{"name": n} for n in route_names] + \
                    [{"name": end, "role": end_role}]
                    
        result.append({"date": day, "route": full_route})

    return {"days": result}