from fastapi import APIRouter
from app.models.optimize import OptimizeRequest, OptimizeResponse
from app.services.tsp_solver import solve_tsp_with_osmnx

router = APIRouter()

@router.post("/", response_model=OptimizeResponse)
def optimize_route(data: OptimizeRequest):
    route = solve_tsp_with_osmnx(
        start=data.start,
        end=data.end,
        waypoints=data.destinations
    )
    return OptimizeResponse(ordered_locations=route)
