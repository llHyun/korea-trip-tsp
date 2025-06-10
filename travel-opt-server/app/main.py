from fastapi import FastAPI
from app.api.v1.routes import optimize
from fastapi.middleware.cors import CORSMiddleware

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

@app.get("/")
def root():
    return {"message": "Korea Trip TSP API is running!"}
