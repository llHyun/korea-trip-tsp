import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import PlaceSearch from './PlaceSearch';
import SinglePlaceSearch from './SinglePlaceSearch'; // 추가


const KakaoMap = ({ result, allPlacesCoords, selectedDay }) => {
    const mapContainer = useRef(null);

    useEffect(() => {
        if (!result || !window.kakao || !window.kakao.maps) {
            return;
        }

        const kakao = window.kakao;

        kakao.maps.load(() => {
            if (!mapContainer.current) return;

            const daysToDisplay = result.days.filter(day => selectedDay === 'all' || day.date === selectedDay);
            const allPathPoints = daysToDisplay.flatMap(day => day.route.map(p => allPlacesCoords[p.name]).filter(Boolean));
            
            if (allPathPoints.length === 0) {
                mapContainer.current.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">선택된 날짜에 표시할 경로가 없습니다.</div>';
                return;
            };

            const bounds = new kakao.maps.LatLngBounds();
            allPathPoints.forEach(p => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
            
            const initialCenter = new kakao.maps.LatLng(allPathPoints[0].lat, allPathPoints[0].lng);
            const mapOptions = { center: initialCenter, level: 7 };
            const map = new kakao.maps.Map(mapContainer.current, mapOptions);

            const lineColors = ['#FF5733', '#335BFF', '#33FF57', '#FF33A1', '#A133FF', '#33FFF6', '#F6FF33'];

            daysToDisplay.forEach((day) => {
                const dayIndex = result.days.findIndex(d => d.date === day.date);
                const path = day.route
                    .map(p => allPlacesCoords[p.name])
                    .filter(Boolean)
                    .map(coords => new kakao.maps.LatLng(coords.lat, coords.lng));

                if (path.length > 1) {
                    const polyline = new kakao.maps.Polyline({ path, strokeWeight: 5, strokeColor: lineColors[dayIndex % lineColors.length], strokeOpacity: 0.8, strokeStyle: 'solid' });
                    polyline.setMap(map);
                }

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


function App() {
    const [startPlace, setStartPlace] = useState(null);
    const [endPlace, setEndPlace] = useState(null);
    const [days, setDays] = useState(1);
    const [pois, setPois] = useState([]);
    const [accommodations, setAccommodations] = useState(Array(1).fill({ name: '', lat: null, lng: null }));
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSameAccommodation, setIsSameAccommodation] = useState(false);
    const [poiType, setPoiType] = useState('관광지');
    const [maxSpotsPerDay, setMaxSpotsPerDay] = useState(3);
    const [maxRestaurantsPerDay, setMaxRestaurantsPerDay] = useState(2);
    const [includeLastDay, setIncludeLastDay] = useState(true);
    
    const [selectedDay, setSelectedDay] = useState('all');

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
            setPois([...pois, { ...place, type: poiType }]);
        }
    };

    const handleAccommodationSelect = (index, place) => {
        const updated = [...accommodations];
        updated[index] = { ...updated[index], ...(place || { name: '', lat: null, lng: null }) };
        setAccommodations(updated);
    };

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
            let finalAccommodations = accommodations;
            if (isSameAccommodation) {
                const firstDayAccom = accommodations[0];
                finalAccommodations = accommodations.map(() => firstDayAccom);
            }
            const payload = {
                start: { ...startPlace, type: '관광지' },
                end: { ...endPlace, type: '관광지' },
                days,
                destinations: pois,
                accommodations: Object.fromEntries(
                    finalAccommodations.map((a, i) => [
                        `Day${i + 1}`,
                        { name: a.name, lat: a.lat, lng: a.lng },
                    ])
                ),
                max_spots_per_day: maxSpotsPerDay,
                max_restaurants_per_day: maxRestaurantsPerDay,
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

    const formatPlace = (place, day) => {
        const dayIndex = parseInt(day.replace('Day', '')) - 1;
        const acc = isSameAccommodation ? accommodations[0] : accommodations[dayIndex];
        if (acc && place === acc.name) return `${place} [숙소]`;
        if (place === startPlace?.name) return `${place} [출발지]`;
        if (place === endPlace?.name) return `${place} [도착지]`;
        const poi = pois.find(p => p.name === place);
        if (poi && poi.type === '식당') return `${place} [식당]`;
        return place;
    };

    return (
        <div className="min-h-screen bg-[#f9fafb] text-gray-800 font-sans py-10 px-4">
            <div className="max-w-7xl mx-auto flex flex-col items-center space-y-8">
                <div className="w-full max-w-5xl">
                    <h1 className="text-4xl font-bold text-center text-indigo-700 mb-8">대한민국 여행 경로 최적화</h1>
                    <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                        <SinglePlaceSearch label="출발지" onSelect={setStartPlace} />
                        <SinglePlaceSearch label="도착지 (여행 마지막 목적지)" onSelect={setEndPlace} />
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                            <div>
                                <label className="block font-medium mb-1">여행 기간</label>
                                <select value={days} onChange={handleDaysChange} className="p-2 border border-gray-300 rounded w-full">
                                    {[...Array(7)].map((_, i) => (
                                        <option key={i + 1} value={i + 1}>{i + 1}박 {i + 2}일</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block font-medium mb-1">하루 최대 관광지</label>
                                <select value={maxSpotsPerDay} onChange={(e) => setMaxSpotsPerDay(parseInt(e.target.value))} className="p-2 border border-gray-300 rounded w-full">
                                    {[...Array(5)].map((_, i) => (<option key={i + 1} value={i + 1}>{i + 1}개</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="block font-medium mb-1">하루 최대 식당</label>
                                <select value={maxRestaurantsPerDay} onChange={(e) => setMaxRestaurantsPerDay(parseInt(e.target.value))} className="p-2 border border-gray-300 rounded w-full">
                                    {[...Array(3)].map((_, i) => (<option key={i + 1} value={i + 1}>{i + 1}개</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="block font-medium mb-1">마지막 날</label>
                                <div className="flex items-center h-[42px]">
                                    <button
                                        type="button"
                                        className={`${includeLastDay ? 'bg-indigo-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
                                        onClick={() => setIncludeLastDay(!includeLastDay)}
                                    >
                                        <span className={`${includeLastDay ? 'translate-x-5' : 'translate-x-0'} inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out`}/>
                                    </button>
                                    <span className="ml-3 text-sm text-gray-700">{includeLastDay ? '일정 포함' : '포함 안함'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded border border-gray-200">
                            <label className="block font-medium mb-2">경유지 목록</label>
                            <div className="my-3 flex items-center space-x-4">
                                <span className="font-medium text-sm text-gray-600">유형 선택:</span>
                                <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="poiType" value="관광지" checked={poiType === '관광지'} onChange={(e) => setPoiType(e.target.value)} className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"/><span className="text-sm">관광지</span></label>
                                <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="poiType" value="식당" checked={poiType === '식당'} onChange={(e) => setPoiType(e.target.value)} className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"/><span className="text-sm">식당</span></label>
                            </div>
                            <PlaceSearch onPlaceSelect={handlePlaceSelect} />
                            <ul className="mt-4 space-y-3">
                                {pois.map((p, i) => (
                                    <li key={i} className="flex justify-between items-center bg-white p-3 rounded-md border shadow-sm">
                                        <div className="flex items-center">
                                            <span className="font-medium text-gray-800">{p.name}</span>
                                            <span className={`ml-3 text-xs font-semibold px-2.5 py-1 rounded-full ${p.type === '식당' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>{p.type}</span>
                                        </div>
                                        <button type="button" onClick={() => handleRemovePoi(i)} className="text-red-500 hover:text-red-700 font-medium">삭제</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <div className="mb-4">
                                <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={isSameAccommodation} onChange={(e) => setIsSameAccommodation(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/><span className="text-gray-700 font-medium">전체 일정 동일 숙소 사용</span></label>
                            </div>
                            <div className="grid md:grid-cols-3 gap-4">
                                {accommodations.map((a, i) => (
                                    (isSameAccommodation && i > 0) ? null :
                                    <div key={i} className="bg-white border border-gray-200 p-4 rounded"><h2 className="font-semibold mb-2 text-indigo-600">🏨 {isSameAccommodation ? '전체 숙소' : `${i + 1}일차 숙소`}</h2><SinglePlaceSearch label={`숙소`} onSelect={(place) => handleAccommodationSelect(i, place)} /></div>
                                ))}
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-lg text-base font-semibold hover:bg-indigo-700 transition">{isLoading ? '경로 최적화 중...' : '경로 최적화 시작하기'}</button>
                    </form>
                </div>

                {isLoading && (
                    <div className="text-center p-8"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div><p className="mt-4 text-gray-600">최적의 경로를 계산 중입니다...</p></div>
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

                            {result.unplaced_suggestions && result.unplaced_suggestions.length > 0 && (
                                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                                    <h3 className="font-bold text-yellow-800">💡 아쉽게 일정에 포함되지 못한 장소</h3>
                                    <p className="text-sm text-yellow-700 mt-1">설정하신 일일 최대 방문 개수에 따라 아래 장소들은 경로에 포함되지 않았습니다.<br/>여행 중 계획을 변경하고 싶을 때 참고해 보세요!</p>
                                    <ul className="mt-3 list-disc list-inside space-y-1 text-sm text-gray-800">
                                        {result.unplaced_suggestions.map((s, idx) => (
                                            <li key={idx}><strong>{s.name}</strong> ({s.type})<span className="text-gray-600"> ➡️ {s.suggestions.join(' 또는 ')} 경로와 가깝습니다.</span></li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            
                            {result.days
                                .filter(day => selectedDay === 'all' || day.date === selectedDay)
                                .map((r, i) => (
                                <div key={i} className="bg-white border border-gray-200 p-4 rounded">
                                    <h3 className="text-lg font-semibold mb-2 text-gray-800">{r.date}</h3>
                                    {r.route && r.route.length > 1 ? (
                                        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                                            {r.route.map((place, idx) => (<li key={idx}>{formatPlace(place?.name || '이름없음', r.date)}</li>))}
                                        </ol>
                                    ) : (<p className="text-sm text-gray-500">자유시간 또는 이동일입니다.</p>)}
                                </div>
                            ))}
                        </div>
                        <div className="h-[600px]">
                            <KakaoMap result={result} allPlacesCoords={allPlacesCoords} selectedDay={selectedDay} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;

