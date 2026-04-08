import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import PlaceSearch from './PlaceSearch';
import SinglePlaceSearch from './SinglePlaceSearch';

// ==========================================
// 🗺️ 카카오맵 렌더링 컴포넌트
// ==========================================
const KakaoMap = ({ result, allPlacesCoords, selectedDay }) => {
    const mapContainer = useRef(null);

    useEffect(() => {
        if (!result || !window.kakao || !window.kakao.maps) return;

        const kakao = window.kakao;

        kakao.maps.load(() => {
            if (!mapContainer.current) return;

            // 선택된 날짜의 동선 데이터만 필터링
            const daysToDisplay = result.days.filter(day => selectedDay === 'all' || day.date === selectedDay);
            const allPathPoints = daysToDisplay.flatMap(day => day.route.map(p => allPlacesCoords[p.name]).filter(Boolean));
            
            if (allPathPoints.length === 0) {
                mapContainer.current.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">선택된 날짜에 표시할 경로가 없습니다.</div>';
                return;
            };

            // 동선에 맞춰 지도의 중심축 및 줌 레벨 자동 조정
            const bounds = new kakao.maps.LatLngBounds();
            allPathPoints.forEach(p => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
            
            const initialCenter = new kakao.maps.LatLng(allPathPoints[0].lat, allPathPoints[0].lng);
            const mapOptions = { center: initialCenter, level: 7 };
            const map = new kakao.maps.Map(mapContainer.current, mapOptions);

            // 일자별 동선 구분을 위한 컬러 팔레트
            const lineColors = ['#FF5733', '#335BFF', '#33FF57', '#FF33A1', '#A133FF', '#33FFF6', '#F6FF33'];

            daysToDisplay.forEach((day) => {
                const dayIndex = result.days.findIndex(d => d.date === day.date);
                const path = day.route
                    .map(p => allPlacesCoords[p.name])
                    .filter(Boolean)
                    .map(coords => new kakao.maps.LatLng(coords.lat, coords.lng));

                // 2개 이상의 지점이 있을 경우 경로 선(Polyline) 그리기
                if (path.length > 1) {
                    const polyline = new kakao.maps.Polyline({ path, strokeWeight: 5, strokeColor: lineColors[dayIndex % lineColors.length], strokeOpacity: 0.8, strokeStyle: 'solid' });
                    polyline.setMap(map);
                }

                // 각 지점 마커(Marker) 및 인포윈도우(InfoWindow) 렌더링
                day.route.forEach((p, placeIndex) => {
                    const coords = allPlacesCoords[p.name];
                    if(coords) {
                        const markerPosition = new kakao.maps.LatLng(coords.lat, coords.lng);
                        const marker = new kakao.maps.Marker({ position: markerPosition, map, title: p.name });
                        const infowindow = new kakao.maps.InfoWindow({ content: `<div style="padding:5px;font-size:12px;text-align:center;"><strong>${day.date}</strong><br>${placeIndex + 1}. ${p.name}</div>`, disableAutoPan: true });
                        kakao.maps.event.addListener(marker, 'mouseover', () => infowindow.open(map, marker));
                        kakao.maps.event.addListener(marker, 'mouseout', () => infowindow.close());
                    }
                });
            });
            
            map.setBounds(bounds);
        });
    }, [result, allPlacesCoords, selectedDay]);

    return <div ref={mapContainer} className="w-full h-full rounded-lg shadow-md border" />;
};

// ==========================================
// 📱 메인 App 컴포넌트
// ==========================================
function App() {
    // --- 상태 관리 (State) ---
    const [startPlace, setStartPlace] = useState(null);
    const [endPlace, setEndPlace] = useState(null);
    const [days, setDays] = useState(1);
    const [pois, setPois] = useState([]);
    const [accommodations, setAccommodations] = useState(Array(1).fill({ name: '', lat: null, lng: null }));
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // 로직 옵션 상태
    const [isSameAccommodation, setIsSameAccommodation] = useState(false);
    const [includeLastDay, setIncludeLastDay] = useState(true);
    const [selectedDay, setSelectedDay] = useState('all');

    // 입력된 모든 장소의 좌표를 매핑하여 지도 렌더링 시 참조 (최적화)
    const allPlacesCoords = useMemo(() => {
        const coords = {};
        if (startPlace) coords[startPlace.name] = { lat: startPlace.lat, lng: startPlace.lng };
        if (endPlace) coords[endPlace.name] = { lat: endPlace.lat, lng: endPlace.lng };
        pois.forEach(p => coords[p.name] = { lat: p.lat, lng: p.lng });
        accommodations.forEach(a => {
            if (a.name) coords[a.name] = { lat: a.lat, lng: a.lng };
        });
        return coords;
    }, [startPlace, endPlace, pois, accommodations]);

    // --- 핸들러 함수 ---
    const handleRemovePoi = (index) => {
        setPois(pois.filter((_, i) => i !== index));
    };

    const handleDaysChange = (e) => {
        const newDays = parseInt(e.target.value);
        setDays(newDays);
        setAccommodations(prev => {
            const currentLength = prev.length;
            if (newDays > currentLength) {
                return [...prev, ...Array(newDays - currentLength).fill({ name: '', lat: null, lng: null })];
            } else if (newDays < currentLength) {
                return prev.slice(0, newDays);
            }
            return prev;
        });
    };

    const handlePlaceSelect = (place) => {
        if (!pois.some(p => p.name === place.name)) {
            setPois([...pois, { ...place, type: '목적지' }]); // 백엔드 모델 호환을 위해 일괄 목적지로 타입 지정
        }
    };

    const handleAccommodationSelect = (index, place) => {
        const updated = [...accommodations];
        updated[index] = { ...updated[index], ...(place || { name: '', lat: null, lng: null }) };
        setAccommodations(updated);
    };

    // --- API 요청 및 최적화 실행 ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!startPlace || !endPlace) {
            setError("출발지와 도착지를 모두 설정해주세요.");
            return;
        }
        setError(null);
        setResult(null);
        setIsLoading(true);
        
        try {
            // '전체 일정 동일 숙소' 체크 시, 1일차 숙소 데이터로 전체 배열 덮어쓰기
            let finalAccommodations = accommodations;
            if (isSameAccommodation) {
                const firstDayAccom = accommodations[0];
                finalAccommodations = accommodations.map(() => firstDayAccom);
            }
            
            const payload = {
                start: { ...startPlace, type: '목적지' },
                end: { ...endPlace, type: '목적지' },
                days,
                destinations: pois,
                accommodations: Object.fromEntries(
                    finalAccommodations.map((a, i) => [
                        `Day${i + 1}`,
                        { name: a.name, lat: a.lat, lng: a.lng },
                    ])
                ),
                is_same_accommodation: isSameAccommodation,
                include_last_day: includeLastDay,
            };
            
            const res = await axios.post('http://localhost:8000/api/v1/optimize/', payload);
            setResult(res.data);
            setSelectedDay('all');
        } catch (err) {
            let errorMessage = '서버 오류가 발생했습니다.';
            if (err.response?.data?.detail) {
                const detail = err.response.data.detail;
                if (typeof detail === 'string') {
                    errorMessage = detail;
                } else if (Array.isArray(detail) && detail[0]?.msg) {
                    errorMessage = `입력 값 오류: ${detail[0].msg}`;
                }
            } else if (err.message) {
                errorMessage = err.message;
            }
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    // 장소 출력 포맷터 (출발/도착/숙소 태그 부착)
    const formatPlace = (place, day) => {
        const dayIndex = parseInt(day.replace('Day', '')) - 1;
        const acc = isSameAccommodation ? accommodations[0] : accommodations[dayIndex];
        if (acc && place === acc.name) return `${place} [숙소]`;
        if (place === startPlace?.name) return `${place} [출발지]`;
        if (place === endPlace?.name) return `${place} [도착지]`;
        return place;
    };

    // --- UI 렌더링 ---
    return (
        <div className="min-h-screen bg-[#f9fafb] text-gray-800 font-sans py-10 px-4">
            <div className="max-w-7xl mx-auto flex flex-col items-center space-y-8">
                <div className="w-full max-w-5xl">
                    <h1 className="text-4xl font-bold text-center text-indigo-700 mb-8">대한민국 경로 최적화</h1>
                    <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                        <SinglePlaceSearch label="출발지" onSelect={setStartPlace} />
                        <SinglePlaceSearch label="도착지 (최종 목적지)" onSelect={setEndPlace} />
                        
                        <div className="grid md:grid-cols-2 gap-4 items-end">
                            <div>
                                <label className="block font-medium mb-1">여행/이동 기간</label>
                                <select value={days} onChange={handleDaysChange} className="p-2 border border-gray-300 rounded w-full">
                                    {[...Array(7)].map((_, i) => (
                                        <option key={i + 1} value={i + 1}>{i + 1}박 {i + 2}일</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block font-medium mb-1">마지막 날 일정 포함 여부</label>
                                <div className="flex items-center h-[42px]">
                                    <button
                                        type="button"
                                        className={`${includeLastDay ? 'bg-indigo-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
                                        onClick={() => setIncludeLastDay(!includeLastDay)}
                                    >
                                        <span className={`${includeLastDay ? 'translate-x-5' : 'translate-x-0'} inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out`}/>
                                    </button>
                                    <span className="ml-3 text-sm text-gray-700">{includeLastDay ? '일정에 목적지 포함' : '숙소/출발지에서 바로 도착지로 이동'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="bg-gray-50 p-4 rounded border border-gray-200">
                            <label className="block font-medium mb-2">경유지(목적지) 목록</label>
                            <PlaceSearch onPlaceSelect={handlePlaceSelect} />
                            <ul className="mt-4 space-y-3">
                                {pois.map((p, i) => (
                                    <li key={i} className="flex justify-between items-center bg-white p-3 rounded-md border shadow-sm">
                                        <span className="font-medium text-gray-800">{p.name}</span>
                                        <button type="button" onClick={() => handleRemovePoi(i)} className="text-red-500 hover:text-red-700 font-medium">삭제</button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <div className="mb-4">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" checked={isSameAccommodation} onChange={(e) => setIsSameAccommodation(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/>
                                    <span className="text-gray-700 font-medium">전체 일정 동일 숙소(연박) 사용</span>
                                </label>
                            </div>
                            <div className="grid md:grid-cols-3 gap-4">
                                {accommodations.map((a, i) => (
                                    (isSameAccommodation && i > 0) ? null :
                                    <div key={i} className="bg-white border border-gray-200 p-4 rounded">
                                        <h2 className="font-semibold mb-2 text-indigo-600">🏨 {isSameAccommodation ? '전체 숙소' : `${i + 1}일차 숙소`}</h2>
                                        <SinglePlaceSearch label={`숙소`} onSelect={(place) => handleAccommodationSelect(i, place)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-lg text-base font-semibold hover:bg-indigo-700 transition">
                            {isLoading ? '경로 최적화 중...' : '최적 경로 계산하기'}
                        </button>
                    </form>
                </div>

                {isLoading && (
                    <div className="text-center p-8">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                        <p className="mt-4 text-gray-600">AI가 최적의 동선을 계산하고 있습니다...</p>
                    </div>
                )}
                
                {error && <div className="max-w-5xl w-full mx-auto text-red-600 font-semibold bg-red-100 p-4 rounded-md">❌ {error}</div>}

                {result && (
                    <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h2 className="text-2xl font-semibold text-indigo-700">최적 경로 결과</h2>
                            
                            <div className="flex space-x-2 border-b border-gray-200">
                                <button onClick={() => setSelectedDay('all')} className={`px-4 py-2 text-sm font-medium rounded-t-lg ${selectedDay === 'all' ? 'border-indigo-500 border-b-2 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                                    전체
                                </button>
                                {result.days.map((day) => (
                                    <button key={day.date} onClick={() => setSelectedDay(day.date)} className={`px-4 py-2 text-sm font-medium rounded-t-lg ${selectedDay === day.date ? 'border-indigo-500 border-b-2 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                                        {day.date.replace('Day', 'Day ')}
                                    </button>
                                ))}
                            </div>
                            
                            {result.days
                                .filter(day => selectedDay === 'all' || day.date === selectedDay)
                                .map((r, i) => (
                                <div key={i} className="bg-white border border-gray-200 p-4 rounded shadow-sm">
                                    <h3 className="text-lg font-semibold mb-3 text-gray-800 border-b pb-2">{r.date.replace('Day', 'Day ')}</h3>
                                    {r.route && r.route.length > 1 ? (
                                        <ol className="list-decimal list-inside space-y-2 text-base text-gray-700 font-medium">
                                            {r.route.map((place, idx) => (<li key={idx}>{formatPlace(place?.name || '이름없음', r.date)}</li>))}
                                        </ol>
                                    ) : (<p className="text-sm text-gray-500">배정된 목적지가 없습니다.</p>)}
                                </div>
                            ))}
                        </div>
                        <div className="h-[600px] sticky top-4">
                            <KakaoMap result={result} allPlacesCoords={allPlacesCoords} selectedDay={selectedDay} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;