import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'  // 파일명은 실제 CSS 위치에 따라 다를 수 있음


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)