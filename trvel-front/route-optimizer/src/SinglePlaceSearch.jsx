import React, { useState } from 'react';
import axios from 'axios';

const SinglePlaceSearch = ({ label, onSelect }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selected, setSelected] = useState(null);

    const KAKAO_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY;

    const searchPlaces = async () => {
        if (!query.trim()) return;
        setIsLoading(true);
        try {
            const res = await axios.get(
                'https://dapi.kakao.com/v2/local/search/keyword.json',
                {
                    params: { query },
                    headers: {
                        Authorization: `KakaoAK ${KAKAO_API_KEY}`,
                    },
                }
            );
            setResults(res.data.documents || []);
        } catch (error) {
            console.error('❌ 장소 검색 실패:', error);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = (place) => {
        const selectedPlace = {
            name: place.place_name,
            lat: parseFloat(place.y),
            lng: parseFloat(place.x),
        };
        setSelected(selectedPlace);
        setQuery('');
        setResults([]);
        onSelect(selectedPlace);
    };

    return (
        <div className="mb-4">
            <label className="block font-semibold mb-1">{label}</label>

            {selected ? (
                <div className="p-2 bg-green-50 border border-green-300 rounded">
                    ✅ 선택됨: {selected.name}
                    <button
                        onClick={() => setSelected(null)}
                        className="ml-4 text-sm text-red-500 hover:underline"
                    >
                        변경하기
                    </button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={query}
                        placeholder={`${label} 검색`}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                searchPlaces();
                            }
                        }}
                        className="flex-1 p-2 border border-gray-300 rounded"
                    />
                    <button
                        onClick={searchPlaces}
                        className="px-3 py-2 bg-indigo-600 text-white rounded"
                    >
                        검색
                    </button>
                </div>
            )}

            {isLoading && <p className="text-sm mt-1">검색 중...</p>}

            {results.length > 0 && (
                <ul className="mt-2 border rounded overflow-hidden">
                    {results.map((place, index) => (
                        <li
                            key={index}
                            onClick={() => handleSelect(place)}
                            className="cursor-pointer p-2 hover:bg-indigo-100 border-b text-sm"
                        >
                            <strong>{place.place_name}</strong>
                            <br />
                            <span className="text-gray-500">{place.address_name}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SinglePlaceSearch;
