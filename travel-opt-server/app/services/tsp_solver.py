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
    for day, places in day_plan.items():
        w = req.accommodations[day]
        if req.daily_weights[int(day[3:])-1] == 0:
            result.append({"date": day, "order": [w.name]})
            continue

        start = w.name if w.drop_luggage else req.start
        mid = places.copy()
        if w.midday_rest:
            mid.insert(len(mid)//2, w.name)

        routes = list(itertools.permutations(mid))
        best = min(routes, key=lambda x: calc_distance(G, [start] + list(x) + [w.name], node_map))
        final = [start] + list(best) + [w.name]
        result.append({"date": day, "order": final})

    return {"days": result}