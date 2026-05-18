import React, { useState } from 'react'
import SideBar from './components/SideBar/SideBar'
import Main from './components/Main/Main'
import SettingsModal from './components/Settings/SettingsModal'

const App = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <SideBar onOpenSettings={() => setIsSettingsOpen(true)} />
      <Main/>
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </>
  )
}

export default App
