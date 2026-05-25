import React, { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import SideBar from './components/SideBar/SideBar'
import Main from './components/Main/Main'
import RagPage from './components/RagPage/RagPage'
import SettingsModal from './components/Settings/SettingsModal'
import { useSettingsStore } from './stores/settingsStore'

const LEGACY_PROMPTS_KEY = 'chill-chat:system-prompts';

async function migrateLegacyPrompts(createSystemPrompt) {
  const raw = window.localStorage.getItem(LEGACY_PROMPTS_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      window.localStorage.removeItem(LEGACY_PROMPTS_KEY);
      return;
    }
    const valid = parsed.filter(p => p && p.title && p.content);
    for (const p of valid) {
      await createSystemPrompt({ title: p.title, content: p.content });
    }
    window.localStorage.removeItem(LEGACY_PROMPTS_KEY);
  } catch {
    // ignore parse errors
  }
}

const App = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const loadSystemPrompts = useSettingsStore(s => s.loadSystemPrompts);
  const createSystemPrompt = useSettingsStore(s => s.createSystemPrompt);

  useEffect(() => {
    migrateLegacyPrompts(createSystemPrompt)
      .then(() => loadSystemPrompts())
      .catch(() => loadSystemPrompts());
  }, []);

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
