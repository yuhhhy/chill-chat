import { create } from 'zustand';
import { fetchRagCollections } from '../api/rag.js';

const RAG_COLLECTION_KEY = 'chill-chat:rag-collection';

function readSelectedId() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(RAG_COLLECTION_KEY) || '';
}

export const useRagStore = create((set, get) => ({
  ragCollections: [],
  selectedRagCollectionId: readSelectedId(),

  setSelectedRagCollectionId: (id) => {
    set({ selectedRagCollectionId: id });
    if (typeof window !== 'undefined') {
      if (id) {
        window.localStorage.setItem(RAG_COLLECTION_KEY, id);
      } else {
        window.localStorage.removeItem(RAG_COLLECTION_KEY);
      }
    }
  },

  refreshRagCollections: async () => {
    try {
      const collections = await fetchRagCollections();
      const currentId = get().selectedRagCollectionId;
      const stillExists = !currentId || collections.some(c => c.id === currentId);

      set({
        ragCollections: collections,
        ...(stillExists ? {} : { selectedRagCollectionId: '' })
      });

      if (!stillExists && typeof window !== 'undefined') {
        window.localStorage.removeItem(RAG_COLLECTION_KEY);
      }

      return collections;
    } catch {
      return [];
    }
  }
}));
