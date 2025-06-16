import React, { useState } from 'react'
import axios from 'axios'

const dayOptions = ['빡빡', '중간', '널널', '휴식']

function App() {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [days, setDays] = useState(3)
  const [pois, setPois] = useState([])
  const [poiInput, setPoiInput] = useState('')
  const [dailyWeights, setDailyWeights] = useState(Array(3).fill('중간'))
  const [accommodations, setAccommodations] = useState(
    Array(3).fill({ name: '', drop: false, rest: false })
  )
  const [result, setResult] = useState([])
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleAddPoi = () => {
    if (poiInput.trim()) {
      setPois([...pois, poiInput.trim()])
      setPoiInput('')
    }
  }

  const handleRemovePoi = (index) => {
    setPois(pois.filter((_, i) => i !== index))
  }

  const handleDaysChange = (e) => {
    const d = parseInt(e.target.value)
    setDays(d)
    setDailyWeights(Array(d).fill('중간'))
    setAccommodations(Array(d).fill({ name: '', drop: false, rest: false }))
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
        destinations: pois,
        daily_weights: dailyWeights.map(w => ({ '빡빡': 3, '중간': 2, '널널': 1, '휴식': 0 })[w]),
        accommodations: Object.fromEntries(
          accommodations.map((a, i) => [
            `Day${i + 1}`,
            { name: a.name, drop_luggage: a.drop, midday_rest: a.rest }
          ])
        )
      }
      const res = await axios.post('http://localhost:8000/api/v1/optimize/', payload)
      setResult(res.data.days)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '서버 오류 발생')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">대한민국 여행 경로 최적화</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input className="w-full p-2 border rounded" placeholder="출발지" value={start} onChange={e => setStart(e.target.value)} />
        <input className="w-full p-2 border rounded" placeholder="도착지 (여행 마지막 목적지)" value={end} onChange={e => setEnd(e.target.value)} />

        <div>
          <label className="block font-semibold mb-1">몇 박 며칠?</label>
          <select value={days} onChange={handleDaysChange} className="p-2 border rounded">
            {[...Array(7)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}박 {i + 2}일</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-semibold">경유지 목록</label>
          <div className="flex gap-2">
            <input className="flex-1 p-2 border rounded" placeholder="경유지 입력 후 추가" value={poiInput} onChange={e => setPoiInput(e.target.value)} />
            <button type="button" onClick={handleAddPoi} className="bg-blue-500 text-white px-3 py-1 rounded">추가</button>
          </div>
          <ul className="mt-2 list-disc list-inside">
            {pois.map((p, i) => (
              <li key={i} className="flex justify-between items-center">
                {p} <button type="button" onClick={() => handleRemovePoi(i)} className="text-red-500">삭제</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {dailyWeights.map((w, i) => (
            <div key={i}>
              <label className="block font-semibold mb-1">{i + 1}일차 여행 강도</label>
              <select value={w} onChange={e => {
                const newWeights = [...dailyWeights]
                newWeights[i] = e.target.value
                setDailyWeights(newWeights)
              }} className="w-full p-2 border rounded">
                {dayOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {accommodations.map((a, i) => (
            <div key={i} className="border p-4 rounded">
              <h2 className="font-bold mb-2">{i + 1}일차 숙소</h2>
              <input placeholder="숙소명" className="w-full p-2 border rounded mb-2" value={a.name} onChange={e => {
                const updated = [...accommodations]
                updated[i] = { ...updated[i], name: e.target.value }
                setAccommodations(updated)
              }} />
              <div className="flex gap-4">
                <label><input type="checkbox" checked={a.drop} onChange={e => {
                  const updated = [...accommodations]
                  updated[i] = { ...updated[i], drop: e.target.checked }
                  setAccommodations(updated)
                }} /> 짐 놓기</label>
                <label><input type="checkbox" checked={a.rest} onChange={e => {
                  const updated = [...accommodations]
                  updated[i] = { ...updated[i], rest: e.target.checked }
                  setAccommodations(updated)
                }} /> 중간 휴식</label>
              </div>
            </div>
          ))}
        </div>

        <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700" disabled={isLoading}>
          {isLoading ? '처리 중...' : '경로 최적화 실행'}
        </button>
      </form>

      {isLoading && <p className="mt-4 text-blue-500 font-semibold">⏳ 요청 처리 중입니다...</p>}
      {error && <div className="mt-4 text-red-600 font-semibold">❌ {error}</div>}

      {result.length > 0 && (
        <div className="mt-6 space-y-4">
          <h2 className="text-xl font-bold">📍 최적 경로 결과</h2>
          {result.map((r, i) => (
            <div key={i} className="border p-3 rounded">
              <h3 className="font-semibold">{r.date}</h3>
              <ul className="list-disc list-inside">
                {r.order.map((place, idx) => <li key={idx}>{place}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App
