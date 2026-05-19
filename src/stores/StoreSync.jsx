import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSessionStore } from './sessionStore.js';
import { useSettingsStore } from './settingsStore.js';
import { useRagStore } from './ragStore.js';
import { useChatStore } from './chatStore.js';
import { useUIStore } from './uiStore.js';

export default function StoreSync() {
  const navigate = useNavigate();
  const location = useLocation();
  const prevSessionIdRef = useRef(null);

  useEffect(() => {
    useSessionStore.getState().setNavigate(navigate);
  }, [navigate]);

  useEffect(() => {
    const id = location.pathname.match(/^\/chat\/(.+)$/)?.[1] ?? null;
    const prevId = prevSessionIdRef.current;
    prevSessionIdRef.current = id;

    useSessionStore.getState().setCurrentSessionId(id);

    if (prevId !== id) {
      useUIStore.getState().switchSession(prevId, id);
      useChatStore.getState().loadMessages(id);
    }
  }, [location.pathname]);

  useEffect(() => {
    const initialId = location.pathname.match(/^\/chat\/(.+)$/)?.[1] ?? null;
    useSessionStore.getState().initialize(initialId, location.pathname);
    useSettingsStore.getState().refreshModelConfig();
    useRagStore.getState().refreshRagCollections();

    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = useSettingsStore.getState().theme;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
