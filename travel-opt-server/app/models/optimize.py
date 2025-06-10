from pydantic import BaseModel
from typing import List

class OptimizeRequest(BaseModel):
    start: str
    end: str
    destinations: List[str]

class OptimizeResponse(BaseModel):
    ordered_locations: List[str]
