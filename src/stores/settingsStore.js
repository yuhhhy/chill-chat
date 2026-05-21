import { create } from 'zustand';
import { fetchCustomModels } from '../api/modelConfig.js';

const MODEL_PROVIDER_KEY = 'chill-chat:model-provider';
const THEME_KEY = 'chill-chat:theme';
const CONTEXT_TURN_KEY = 'chill-chat:context-turn-count';
const SYSTEM_PROMPTS_KEY = 'chill-chat:system-prompts';
const SELECTED_SYSTEM_PROMPT_KEY = 'chill-chat:selected-system-prompt';
const DEFAULT_PROVIDER = 'deepseek';
const DEFAULT_THEME = 'light';
const DEFAULT_TURN_COUNT = 5;
const VALID_TURN_COUNTS = new Set([-1, 0, 1, 2, 5, 10, 20]);

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function readSystemPrompts() {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(SYSTEM_PROMPTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(prompt => prompt && typeof prompt === 'object')
      .map(prompt => ({
        id: String(prompt.id || crypto.randomUUID()),
        title: String(prompt.title || '').trim(),
        content: String(prompt.content || '').trim(),
        createdAt: Number(prompt.createdAt) || Date.now(),
        updatedAt: Number(prompt.updatedAt) || Number(prompt.createdAt) || Date.now()
      }))
      .filter(prompt => prompt.title && prompt.content);
  } catch {
    return [];
  }
}

function writeSystemPrompts(systemPrompts) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SYSTEM_PROMPTS_KEY, JSON.stringify(systemPrompts));
}

function readSelectedSystemPromptId(systemPrompts) {
  const selectedId = readStorage(SELECTED_SYSTEM_PROMPT_KEY, '');
  return systemPrompts.some(prompt => prompt.id === selectedId) ? selectedId : '';
}

function readTurnCount() {
  if (typeof window === 'undefined') return DEFAULT_TURN_COUNT;
  const stored = Number(window.localStorage.getItem(CONTEXT_TURN_KEY));
  return VALID_TURN_COUNTS.has(stored) ? stored : DEFAULT_TURN_COUNT;
}

const initialSystemPrompts = readSystemPrompts();

export const useSettingsStore = create((set) => ({
  theme: readStorage(THEME_KEY, DEFAULT_THEME),
  modelProvider: readStorage(MODEL_PROVIDER_KEY, DEFAULT_PROVIDER),
  contextTurnCount: readTurnCount(),
  systemPrompts: initialSystemPrompts,
  selectedSystemPromptId: readSelectedSystemPromptId(initialSystemPrompts),
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

  setSelectedSystemPromptId: (promptId) => {
    set((state) => {
      const selectedSystemPromptId = state.systemPrompts.some(prompt => prompt.id === promptId) ? promptId : '';
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SELECTED_SYSTEM_PROMPT_KEY, selectedSystemPromptId);
      }
      return { selectedSystemPromptId };
    });
  },

  createSystemPrompt: ({ title, content }) => {
    const now = Date.now();
    const prompt = {
      id: crypto.randomUUID(),
      title: title.trim(),
      content: content.trim(),
      createdAt: now,
      updatedAt: now
    };

    set((state) => {
      const systemPrompts = [...state.systemPrompts, prompt];
      writeSystemPrompts(systemPrompts);
      return { systemPrompts };
    });

    return prompt;
  },

  updateSystemPrompt: (promptId, { title, content }) => {
    set((state) => {
      const systemPrompts = state.systemPrompts.map(prompt => (
        prompt.id === promptId
          ? { ...prompt, title: title.trim(), content: content.trim(), updatedAt: Date.now() }
          : prompt
      ));
      writeSystemPrompts(systemPrompts);
      return { systemPrompts };
    });
  },

  deleteSystemPrompt: (promptId) => {
    set((state) => {
      const systemPrompts = state.systemPrompts.filter(prompt => prompt.id !== promptId);
      const selectedSystemPromptId = state.selectedSystemPromptId === promptId ? '' : state.selectedSystemPromptId;
      writeSystemPrompts(systemPrompts);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SELECTED_SYSTEM_PROMPT_KEY, selectedSystemPromptId);
      }
      return { systemPrompts, selectedSystemPromptId };
    });
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
