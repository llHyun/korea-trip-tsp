import React, { useState } from 'react'
import axios from 'axios'
import PlaceSearch from './PlaceSearch'

const dayOptions = ['빡빡', '중간', '널널', '휴식']

function App() {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [days, setDays] = useState(3)
  const [pois, setPois] = useState([]) // { name, lat, lng } 구조
  const [dailyWeights, setDailyWeights] = useState(Array(4).fill('중간'))
  const [accommodations, setAccommodations] = useState(Array(3).fill({ name: '', drop: false }))
  const [result, setResult] = useState([])
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleRemovePoi = (index) => {
    setPois(pois.filter((_, i) => i !== index))
  }

  const handleDaysChange = (e) => {
    const d = parseInt(e.target.value)
    setDays(d)
    setDailyWeights(Array(d + 1).fill('중간'))
    setAccommodations(Array(d).fill({ name: '', drop: false }))
  }

  const handlePlaceSelect = (place) => {
    setPois([...pois, place]) // place = { name, lat, lng }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setResult([])
    setIsLoading(true)
    try {
      const payload = {
        start,
        end,
        days,
        destinations: pois.map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
        daily_weights: dailyWeights.map(w => ({ '빡빡': 3, '중간': 2, '널널': 1, '휴식': 0 })[w]),
        accommodations: Object.fromEntries(
          accommodations.map((a, i) => [
            `Day${i + 1}`,
            { name: a.name, drop_luggage: a.drop }
          ])
        )
      }
      const res = await axios.post('http://localhost:8000/api/v1/optimize/', payload)
      setResult(res.data.days)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '서버 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const formatPlace = (place, day) => {
    const acc = accommodations[parseInt(day.replace("Day", "")) - 1]
    if (acc && place === acc.name) return `${place} [숙소]`
    if (place === start) return `${place} [출발지]`
    if (place === end) return `${place} [도착지]`
    return place
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] text-gray-800 font-sans py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-center text-indigo-700">대한민국 여행 경로 최적화</h1>

        <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="grid md:grid-cols-2 gap-4">
            <input className="p-3 border border-gray-300 rounded w-full" placeholder="출발지" value={start} onChange={e => setStart(e.target.value)} />
            <input className="p-3 border border-gray-300 rounded w-full" placeholder="도착지 (여행 마지막 목적지)" value={end} onChange={e => setEnd(e.target.value)} />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium mb-1">여행 기간</label>
              <select value={days} onChange={handleDaysChange} className="p-2 border border-gray-300 rounded w-full">
                {[...Array(7)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}박 {i + 2}일</option>
                ))}
              </select>
            </div>
            {dailyWeights.map((w, i) => (
              <div key={i}>
                <label className="block font-medium mb-1">{i + 1}일차 여행 강도</label>
                <select value={w} onChange={e => {
                  const newWeights = [...dailyWeights]
                  newWeights[i] = e.target.value
                  setDailyWeights(newWeights)
                }} className="p-2 border border-gray-300 rounded w-full">
                  {dayOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 p-4 rounded border border-gray-200">
            <label className="block font-medium mb-2">경유지 목록</label>
            <PlaceSearch onPlaceSelect={handlePlaceSelect} />
            <ul className="mt-2 list-disc list-inside text-sm text-gray-700">
              {pois.map((p, i) => (
                <li key={i} className="flex justify-between items-center">
                  {p.name} ({p.lat.toFixed(5)}, {p.lng.toFixed(5)}){" "}
                  <button type="button" onClick={() => handleRemovePoi(i)} className="text-red-500 hover:underline">삭제</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {accommodations.map((a, i) => (
              <div key={i} className="bg-white border border-gray-200 p-4 rounded">
                <h2 className="font-semibold mb-2 text-indigo-600">🏨 {i + 1}일차 숙소</h2>
                <input className="w-full p-2 border border-gray-300 rounded mb-2" placeholder="숙소명" value={a.name} onChange={e => {
                  const updated = [...accommodations]
                  updated[i] = { ...updated[i], name: e.target.value }
                  setAccommodations(updated)
                }} />
                <label className="block text-sm text-gray-700">
                  <input type="checkbox" className="mr-2" checked={a.drop} onChange={e => {
                    const updated = [...accommodations]
                    updated[i] = { ...updated[i], drop: e.target.checked }
                    setAccommodations(updated)
                  }} /> 짐 놓기
                </label>
              </div>
            ))}
          </div>

          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-lg text-base font-semibold hover:bg-indigo-700 transition">
            {isLoading ? '경로 최적화 중...' : '경로 최적화 시작하기'}
          </button>
        </form>

        {error && <div className="text-red-600 font-semibold">❌ {error}</div>}

        {result.length > 0 && (
          <div className="mt-8 space-y-4">
            <h2 className="text-2xl font-semibold text-indigo-700">최적 경로 결과</h2>
            {result.map((r, i) => (
              <div key={i} className="bg-white border border-gray-200 p-4 rounded">
                <h3 className="text-lg font-semibold mb-2 text-gray-800">{r.date}</h3>
                <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                  {r.order.map((place, idx) => (
                    <li key={idx}>{formatPlace(place, r.date)}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
