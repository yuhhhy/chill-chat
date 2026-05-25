import { create } from 'zustand';
import { fetchCustomModels } from '../api/modelConfig.js';
import * as promptsApi from '../api/prompts.js';

const MODEL_PROVIDER_KEY = 'chill-chat:model-provider';
const THEME_KEY = 'chill-chat:theme';
const CONTEXT_TURN_KEY = 'chill-chat:context-turn-count';
const SELECTED_SYSTEM_PROMPT_KEY = 'chill-chat:selected-system-prompt';
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

function fromDb(p) {
  return {
    id: p.id,
    title: p.title,
    content: p.content,
    createdAt: p.created_at * 1000,
    updatedAt: p.updated_at * 1000,
  };
}

export const useSettingsStore = create((set, get) => ({
  theme: readStorage(THEME_KEY, DEFAULT_THEME),
  modelProvider: readStorage(MODEL_PROVIDER_KEY, DEFAULT_PROVIDER),
  contextTurnCount: readTurnCount(),
  systemPrompts: [],
  selectedSystemPromptId: readStorage(SELECTED_SYSTEM_PROMPT_KEY, ''),
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
      const selectedSystemPromptId = state.systemPrompts.some(p => p.id === promptId) ? promptId : '';
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SELECTED_SYSTEM_PROMPT_KEY, selectedSystemPromptId);
      }
      return { selectedSystemPromptId };
    });
  },

  loadSystemPrompts: async () => {
    const data = await promptsApi.fetchPrompts();
    const systemPrompts = data.map(fromDb);
    const stored = readStorage(SELECTED_SYSTEM_PROMPT_KEY, '');
    const selectedSystemPromptId = systemPrompts.some(p => p.id === stored) ? stored : '';
    set({ systemPrompts, selectedSystemPromptId });
  },

  createSystemPrompt: async ({ title, content }) => {
    const data = await promptsApi.createPrompt(title, content);
    const prompt = fromDb(data);
    set((state) => ({ systemPrompts: [...state.systemPrompts, prompt] }));
    return prompt;
  },

  updateSystemPrompt: async (promptId, { title, content }) => {
    const data = await promptsApi.updatePrompt(promptId, title, content);
    const updated = fromDb(data);
    set((state) => ({
      systemPrompts: state.systemPrompts.map(p => p.id === promptId ? updated : p)
    }));
  },

  deleteSystemPrompt: async (promptId) => {
    await promptsApi.deletePrompt(promptId);
    set((state) => {
      const systemPrompts = state.systemPrompts.filter(p => p.id !== promptId);
      const selectedSystemPromptId = state.selectedSystemPromptId === promptId ? '' : state.selectedSystemPromptId;
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
