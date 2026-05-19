import { create } from 'zustand';
import {
  fetchSessions,
  createSession as apiCreateSession,
  deleteSession as apiDeleteSession
} from '../api/sessions.js';

export const useSessionStore = create((set, get) => ({
  sessions: [],
  currentSessionId: null,
  _navigate: null,

  setNavigate: (fn) => set({ _navigate: fn }),

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  initialize: async (initialSessionId, pathname) => {
    const data = await fetchSessions();
    set({ sessions: data });

    const navigate = get()._navigate;
    if (initialSessionId) return;
    if (pathname !== '/') return;

    if (data.length > 0) {
      navigate(`/chat/${data[0].id}`, { replace: true });
    } else {
      const session = await apiCreateSession();
      set({ sessions: [session] });
      navigate(`/chat/${session.id}`, { replace: true });
    }
  },

  createNewSession: async () => {
    const session = await apiCreateSession();
    set(state => ({ sessions: [session, ...state.sessions] }));
    get()._navigate(`/chat/${session.id}`);
  },

  loadSession: (id) => {
    get()._navigate(`/chat/${id}`);
  },

  deleteSession: async (id) => {
    await apiDeleteSession(id);
    const { sessions, currentSessionId, _navigate } = get();
    const remaining = sessions.filter(s => s.id !== id);
    set({ sessions: remaining });

    if (currentSessionId === id) {
      if (remaining.length > 0) {
        _navigate(`/chat/${remaining[0].id}`);
      } else {
        const session = await apiCreateSession();
        set({ sessions: [session] });
        _navigate(`/chat/${session.id}`);
      }
    }
  },

  updateSession: (session) => {
    set(state => ({
      sessions: state.sessions.map(s => s.id === session.id ? session : s)
    }));
  }
}));
