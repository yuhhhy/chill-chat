import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import './components/ModelAvatar/ModelAvatar.css'
import StoreSync from './stores/StoreSync.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <StoreSync />
    <App />
  </BrowserRouter>
)
