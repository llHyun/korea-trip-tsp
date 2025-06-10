from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_optimize_basic():
    response = client.post("/api/v1/optimize/", json={
        "start": "청량리역",
        "end": "서울역",
        "destinations": ["경복궁", "망원시장", "남산서울타워"]
    })
    assert response.status_code == 200
    data = response.json()
    assert "ordered_locations" in data
    assert isinstance(data["ordered_locations"], list)
