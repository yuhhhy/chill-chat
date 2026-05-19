import React, { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import SideBar from './components/SideBar/SideBar'
import Main from './components/Main/Main'
import RagPage from './components/RagPage/RagPage'
import SettingsModal from './components/Settings/SettingsModal'

const App = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <SideBar onOpenSettings={() => setIsSettingsOpen(true)} />
      <Routes>
        <Route path="/rag" element={<RagPage />} />
        <Route path="/chat/:id" element={<Main />} />
        <Route path="*" element={<Main />} />
      </Routes>
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </>
  )
}

export default App
