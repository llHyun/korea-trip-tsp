import itertools
import networkx as nx
from fastapi import HTTPException

def calc_distance(G, order, node_map):
    dist = 0
    for i in range(len(order)-1):
        try:
            d = nx.shortest_path_length(G, node_map[order[i]], node_map[order[i+1]], weight="length")
            dist += d
        except:
            dist += 1e9
    return dist / 1000

def solve_tsp(G, req, day_plan, node_map):
    result = []
    days = list(day_plan.keys())

    for idx, day in enumerate(days):
        places = day_plan[day]
        day_index = int(day[3:])

        if day_index > req.days:
            last_accom = req.accommodations.get(f"Day{req.days}")
            start = last_accom.name if last_accom else req.start
            mid = places[:-1]
            end = places[-1]

            if len(mid) == 0:
                route = [
                    {"name": start, "role": "출발지"},
                    {"name": end, "role": "도착지"}
                ]
                result.append({"date": day, "route": route})
            else:
                routes = list(itertools.permutations(mid))
                best = min(routes, key=lambda x: calc_distance(G, [start] + list(x) + [end], node_map))
                route = [{"name": start, "role": "출발지"}] + \
                        [{"name": name} for name in best] + \
                        [{"name": end, "role": "도착지"}]
                result.append({"date": day, "route": route})
            continue

        w = req.accommodations[day]
        if req.daily_weights[day_index - 1] == 0:
            result.append({
                "date": day,
                "route": [{"name": w.name, "role": "숙소"}]
            })
            continue

        if day == "Day1":
            start = req.start
        else:
            prev_day = f"Day{day_index - 1}"
            prev_accom = req.accommodations.get(prev_day)
            start = w.name if w.drop_luggage else (prev_accom.name if prev_accom else req.start)

        mid = places.copy()
        if mid and mid[-1] == w.name:
            mid.pop()

        routes = list(itertools.permutations(mid))
        best = min(routes, key=lambda x: calc_distance(G, [start] + list(x) + [w.name], node_map))

        full_route = [{"name": start, "role": "출발지"}]
        for name in best:
            full_route.append({"name": name})  # no role
        full_route.append({"name": w.name, "role": "숙소"})

        result.append({"date": day, "route": full_route})

    return {"days": result}
