import itertools
import networkx as nx
from fastapi import HTTPException

def calc_distance(G, order, node_map):
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
    return dist / 1000  # meter → km

def solve_tsp(G, req, day_plan, node_map):
    result = []
    days = list(day_plan.keys())

    required_names = set()
    required_names.add(req.start.name)
    required_names.add(req.end.name)
    for d in req.destinations:
        required_names.add(d.name)
    for accom in req.accommodations.values():
        if accom.name:
            required_names.add(accom.name)

    missing = [name for name in required_names if name not in node_map]
    if missing:
        raise HTTPException(status_code=400, detail=f"다음 장소가 누락되어 경로를 계산할 수 없습니다: {', '.join(missing)}")

    for idx, day in enumerate(days):
        places = day_plan[day]
        day_index = int(day[3:])  # "Day2" → 2

        if day_index > req.days:
            last_accom = req.accommodations.get(f"Day{req.days}")
            start = last_accom.name if last_accom else req.start.name
            mid = places[:-1]
            end = places[-1]

            if len(mid) == 0:
                route = [
                    {"name": start, "role": "출발지"},
                    {"name": end, "role": "도착지"}
                ]
            else:
                routes = list(itertools.permutations(mid))
                best = min(routes, key=lambda x: calc_distance(G, [start] + list(x) + [end], node_map))
                route = [{"name": start, "role": "출발지"}] + \
                        [{"name": name} for name in best] + \
                        [{"name": end, "role": "도착지"}]
            result.append({"date": day, "route": route})
            continue

        if not places:
            w = req.accommodations[day]
            result.append({
                "date": day,
                "route": [{"name": w.name, "role": "숙소"}]
            })
            continue

        w = req.accommodations[day]
        if day == "Day1":
            start = req.start.name
        else:
            prev_day = f"Day{day_index - 1}"
            prev_accom = req.accommodations.get(prev_day)
            start = prev_accom.name if prev_accom and prev_accom.name else req.start.name

        mid = places.copy()
        routes = list(itertools.permutations(mid))
        best = min(routes, key=lambda x: calc_distance(G, [start] + list(x) + [w.name], node_map))

        full_route = [{"name": start, "role": "출발지"}] + \
                    [{"name": name} for name in best] + \
                    [{"name": w.name, "role": "숙소"}]

        result.append({"date": day, "route": full_route})

    return {"days": result}
