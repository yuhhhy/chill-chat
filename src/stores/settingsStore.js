import { create } from 'zustand';
import { fetchCustomModels } from '../api/modelConfig.js';

const MODEL_PROVIDER_KEY = 'chill-chat:model-provider';
const THEME_KEY = 'chill-chat:theme';
const CONTEXT_TURN_KEY = 'chill-chat:context-turn-count';
const DEFAULT_PROVIDER = 'deepseek';
const DEFAULT_THEME = 'light';
const DEFAULT_TURN_COUNT = 5;
const VALID_TURN_COUNTS = new Set([-1, 0, 1, 2, 5, 10, 20]);

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function readTurnCount() {
  if (typeof window === 'undefined') return DEFAULT_TURN_COUNT;
  const stored = Number(window.localStorage.getItem(CONTEXT_TURN_KEY));
  return VALID_TURN_COUNTS.has(stored) ? stored : DEFAULT_TURN_COUNT;
}

export const useSettingsStore = create((set) => ({
  theme: readStorage(THEME_KEY, DEFAULT_THEME),
  modelProvider: readStorage(MODEL_PROVIDER_KEY, DEFAULT_PROVIDER),
  contextTurnCount: readTurnCount(),
  customModels: [],
  modelNames: {},

  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== 'undefined') window.localStorage.setItem(THEME_KEY, theme);
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
  },

  setModelProvider: (provider) => {
    set({ modelProvider: provider });
    if (typeof window !== 'undefined') window.localStorage.setItem(MODEL_PROVIDER_KEY, provider);
  },

  setContextTurnCount: (count) => {
    set({ contextTurnCount: count });
    if (typeof window !== 'undefined') window.localStorage.setItem(CONTEXT_TURN_KEY, String(count));
  },

  refreshModelConfig: () => {
    fetch('/api/config/models')
      .then(r => r.json())
      .then(modelNames => set({ modelNames }))
      .catch(() => {});
    fetchCustomModels()
      .then(customModels => set({ customModels }))
      .catch(() => {});
  }
}));
