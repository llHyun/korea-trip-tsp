// PlaceSearch.jsx
import React, { useState } from 'react';
import axios from 'axios';

const PlaceSearch = ({ onPlaceSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const KAKAO_API_KEY = import.meta.env.REACT_APP_KAKAO_API_KEY;


  const searchPlaces = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    try {
      const res = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
        params: { query },
        headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
      });
      setResults(Array.isArray(res.data.documents) ? res.data.documents : []);
    } catch (error) {
      console.error('카카오 장소 검색 실패:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (place) => {
    if (!place || typeof place !== 'object') return;
    const name = place['place_name'] || '이름없음';
    const lat = parseFloat(place['y']);
    const lng = parseFloat(place['x']);
    onPlaceSelect({ name, lat, lng });
    setQuery('');
    setResults([]);
  };

  return (
    <div style={{ maxWidth: '600px', margin: '1rem auto' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={query}
          placeholder="목적지 입력 (예: 경복궁)"
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <button
          onClick={searchPlaces}
          style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', borderRadius: '4px' }}
        >
          검색
        </button>
      </div>
      {isLoading && <p style={{ marginTop: '0.5rem' }}>검색 중...</p>}
      {Array.isArray(results) && results.length > 0 && (
        <ul style={{ marginTop: '0.5rem', padding: 0, listStyle: 'none', border: '1px solid #eee', borderRadius: '4px' }}>
          {results.map((place, index) => {
            const name = place['place_name'] || '이름없음';
            const address = place['address_name'] || '주소없음';
            return (
              <li
                key={`${name}_${address}_${index}`}
                onClick={() => handleSelect(place)}
                style={{
                  padding: '0.75rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid #eee',
                  backgroundColor: '#fafafa',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#fafafa')}
              >
                <strong>{name}</strong>
                <br />
                <span style={{ fontSize: '0.9rem', color: '#777' }}>{address}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default PlaceSearch;
