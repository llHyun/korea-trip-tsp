# 🇰🇷 korea-trip-tsp

한국 내 차량 여행 시, 사용자가 입력한 장소 리스트를 기반으로  

**최적의 방문 순서**를 계산해주는 Python 기반 경로 최적화 프로젝트입니다.  

사용자가 방문하고 싶은 장소와 여행 조건을 입력하면, 

AI가 지리적 분포와 사용자 설정을 모두 고려하여 실행 가능한 **최적의 여행 일정을 자동으로 생성**하고,

실제 도로 기준으로 이동 **효율이 가장 높은 일정**을 제안합니다.

마지막 결과를 지도 위에 시각화해주는 **지능형 여행 계획 프로젝트**입니다.




---

## 🗺️ 프로젝트 소개

기존의 국내 여행 서비스들은 추천 위주이거나 단순 경로 제공에 그치는 경우가 많습니다.  

**korea-trip-tsp**는 사용자가 직접 입력한 장소들을 기반으로 하여,  

**TSP(Traveling Salesman Problem)** 알고리즘을 이용해  

최적의 방문 순서를 계산하고, 그 일정을 시뮬레이션하는 데 초점을 맞추고 있습니다.

단순히 최단 거리를 계산하는 것을 넘어, **"어떤 장소들을 어떤 날에 함께 방문하는 것이 가장 합리적인가?"** 라는 근본적인 질문을 해결하기 위해서도 노력했습니다.

AI 클러스터링 기술을 통해 목적지들을 지능적으로 그룹화하고, 

사용자가 직접 설정한 '하루 최대 방문 개수' 등의 제약 조건을 반영하여,

기계적인 결과가 아닌 실제 사람처럼 생각하는 **현실적인 여행 계획**을 제안합니다.

---

## ✅ 주요 기능
### 📍 경로 최적화
- 장소 리스트 기반 **최적 방문 순서 산출** (TSP 기반)
- **직선 거리 대신 도로 기반 실거리 계산**
- 카카오맵 API 연동 → 최적화된 경로 시각화
### 🗓️ 일정 자동 분할
- 실루엣 점수 클러스터링 + 실루엣 점수로 효율적인 **날짜별 그룹** 생성
- 하루 최대 방문 개수 설정으로 **여행 강도 조절 가능**
- '전체 일정 동일 숙소', '마지막 날 일정 포함 여부' 등 다양한 편의 옵션 지원
### 🍴 관광 & 식사 배치
- 관광지 우선 동선 최적화 → 식당 효율적 배치
- 일정이 비는 날은 남은 장소를 지능적으로 재배치
### 🔎 추가 기능
- 날짜별 탭 기능 → 특정 날짜의 경로만 확인 가능
- 포함되지 못한 장소는 → **추천 추가일 및 가이드** 제공


---

## 🛠️ 구현 예정 기능

- 장소별 예상 체류 시간 및 실제 운영 시간(Opening Hours) 반영

- 사용자 계정 시스템 도입 및 여행 일정 저장/공유 기능

- 도로 교통상황을 반영한 실시간 경로 시간 예측

- '대체 장소' 추천 기능 (예: "A 대신 근처의 B는 어떠세요?")

---

## 🧰 기술 스택

| 항목               | 사용 기술                              |
|--------------------|----------------------------------------|
| **Programming Languages** | Python, JavaScript               |
| **Frameworks**     | FastAPI (백엔드), React (Vite) (프론트엔드) |
| **Core Libraries**      | scikit-learn, OSMnx (백엔드), Kakao Maps API, Tailwind CSS (프론트엔드)|
| **Version Control**| Git                                    |
| **Cloud Services** | AWS                                    |
| **Deployment Tools**| Docker                                |
| **API**            | RESTful API                           |

---

## 📂 프로젝트 구조
```
KOREA-TRIP-TSP/
├── travel-opt-server/        # 🐍 백엔드 (FastAPI)
│   ├── app/
│   │   ├── api/v1/
│   │   │   └── routes/
│   │   │       └── optimize.py   # 핵심 경로 최적화 API 로직
│   │   ├── services/
│   │   │   ├── graph_loader.py   # 도로망 데이터(그래프) 로딩 및 캐싱
│   │   │   └── tsp_solver.py     # 일자별 내부 방문 순서 최적화 (TSP)
│   │   └── main.py               # FastAPI 앱 초기화 및 설정
│   ├── cache/                    # 다운로드된 도로망 데이터 캐시 폴더
│   └── requirements.txt          # Python 의존성 목록
│
└── trvel-front/route-optimizer/  # ⚛️ 프론트엔드 (React + Vite)
    ├── public/
    │   └── index.html            # 카카오맵 API 스크립트 로딩
    ├── src/
    │   ├── components/           # (PlaceSearch.jsx, SinglePlaceSearch.jsx 등)
    │   ├── App.jsx               # 메인 애플리케이션 컴포넌트 (UI 및 상태 관리)
    │   └── main.jsx              # React 앱 진입점
	│   └── PlaceSearch.jsx       # kakao api 이용 경유지 검색
	│   └── SinglePlaceSearch.jsx # kakao api 이용 숙소 검색
    ├── .env                      # API 키 등 환경 변수 관리
    ├── index.css                 # Tailwind CSS 설정
    └── package.json              # JavaScript 의존성 목록


```
