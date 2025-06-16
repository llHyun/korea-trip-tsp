from fastapi import FastAPI
from app.api.v1.routes import optimize
from fastapi.middleware.cors import CORSMiddleware
from app.services.graph_loader import get_graph

app = FastAPI()

# CORS 허용 설정 (필요에 따라 수정)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(optimize.router, prefix="/api/v1/optimize", tags=["Optimize"])

get_graph()  # 서버 시작 시 1회 실행, 그래프 메모리에 고정


@app.get("/")
def root():
    return {"message": "Korea Trip TSP API is running!"}
