import { create } from 'zustand';

const inputDrafts = new Map();

export const useUIStore = create((set, get) => ({
  input: '',
  isAtBottom: true,
  virtuosoRef: { current: null },

  setInput: (input) => set({ input }),
  setIsAtBottom: (isAtBottom) => set({ isAtBottom }),

  scrollToBottom: (behavior = 'auto', messageCount = 0) => {
    const ref = get().virtuosoRef;
    if (!ref.current) return;
    ref.current.scrollToIndex({
      align: 'end',
      behavior,
      index: Math.max(messageCount - 1, 0)
    });
  },

  switchSession: (prevSessionId, nextSessionId) => {
    if (prevSessionId) {
      inputDrafts.set(prevSessionId, get().input);
    }
    set({
      input: inputDrafts.get(nextSessionId) ?? '',
      isAtBottom: true
    });
  },

  clearInputForSession: (sessionId) => {
    inputDrafts.delete(sessionId);
    set({ input: '' });
  }
}));
