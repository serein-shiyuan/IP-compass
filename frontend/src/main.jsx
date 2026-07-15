import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { track, TrackingEvents } from './lib/tracking.js'

track(TrackingEvents.APP_OPEN, {
  source: window.location.search.includes('ref=') ? 'direct_url' : 'welcome'
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
