import { create } from 'zustand';
import { fetchMessages, saveMessages, updateMessage as updateMessageApi, deleteMessage as deleteMessageApi } from '../api/messages.js';
import { createChatRun, cancelChatRun } from '../api/chatRuns.js';
import StreamParser from '../services/streamParser.js';
import { useSessionStore } from './sessionStore.js';
import { useSettingsStore } from './settingsStore.js';
import { useRagStore } from './ragStore.js';

const PENDING_KEY = 'chill-chat:pending-deleted-messages';

function toViewMessage(m) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    modelProvider: m.model_provider || 'deepseek',
    reasoningContent: m.reasoning_content || '',
    sources: Array.isArray(m.sources) ? m.sources : [],
    timestamp: new Date(m.created_at * 1000).toLocaleString(),
    status: m.status || 'completed'
  };
}

function readPending() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writePending(pending) {
  const hasPending = Object.values(pending).some(ids => Array.isArray(ids) && ids.length > 0);
  if (!hasPending) {
    window.localStorage.removeItem(PENDING_KEY);
  } else {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  }
}

function addPending(sessionId, messageId) {
  const pending = readPending();
  const ids = new Set(pending[sessionId] || []);
  ids.add(messageId);
  pending[sessionId] = [...ids];
  writePending(pending);
}

function removePending(sessionId, messageId) {
  const pending = readPending();
  pending[sessionId] = (pending[sessionId] || []).filter(id => id !== messageId);
  if (pending[sessionId].length === 0) delete pending[sessionId];
  writePending(pending);
}

function getPendingIds(sessionId) {
  return new Set(readPending()[sessionId] || []);
}

function limitContext(messages, contextTurnCount) {
  if (contextTurnCount === -1) return messages;
  const userIndexes = messages.reduce((acc, msg, i) => {
    if (msg.role === 'user') acc.push(i);
    return acc;
  }, []);
  const keepFrom = Math.max(userIndexes.length - contextTurnCount - 1, 0);
  return messages.slice(userIndexes[keepFrom] ?? 0);
}

function buildApiMessages(messages, contextTurnCount) {
  const apiMessages = limitContext(messages, contextTurnCount)
    .map(m => ({ role: m.role, content: m.content }));
  const { selectedSystemPromptId, systemPrompts } = useSettingsStore.getState();
  const selectedPrompt = systemPrompts.find(prompt => prompt.id === selectedSystemPromptId);
  const systemPrompt = selectedPrompt?.content?.trim();

  return systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...apiMessages]
    : apiMessages;
}

const generatingSessions = new Map();
const sessionMessages = new Map();
const streamParsers = new Map();

function persistPartial(parser, sessionId, message, status = 'aborted') {
  if (!message || parser?.assistantPersisted) return;
  if (!message.content?.trim() && !message.reasoningContent?.trim()) return;
  if (parser) parser.assistantPersisted = true;
  const provider = useSettingsStore.getState().modelProvider;
  saveMessages(sessionId, [{
    id: message.id,
    role: 'assistant',
    content: message.content || '',
    reasoningContent: message.reasoningContent || '',
    modelProvider: message.modelProvider || provider,
    status
  }]).catch(err => console.error('Failed to save partial assistant message:', err));
}

export const useChatStore = create((set, get) => ({
  messages: [],
  isLoadingMessages: true,
  isGenerating: false,

  loadMessages: async (sessionId) => {
    if (!sessionId) return;

    const currentSessionId = () => useSessionStore.getState().currentSessionId;

    if (generatingSessions.has(sessionId) && sessionMessages.has(sessionId)) {
      set({
        messages: sessionMessages.get(sessionId),
        isLoadingMessages: false,
        isGenerating: true
      });
      return;
    }

    set({ messages: [], isGenerating: false, isLoadingMessages: true });

    const pendingIds = getPendingIds(sessionId);
    pendingIds.forEach(messageId => {
      deleteMessageApi(sessionId, messageId)
        .then(() => removePending(sessionId, messageId))
        .catch(err => console.error('Failed to flush pending deleted message:', err));
    });

    const rows = await fetchMessages(sessionId);
    if (currentSessionId() !== sessionId) return;
    set({
      messages: rows.filter(r => !pendingIds.has(r.id)).map(toViewMessage),
      isLoadingMessages: false
    });
  },

  send: async (messageText) => {
    const sessionId = useSessionStore.getState().currentSessionId;
    const { messages } = get();

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toLocaleString(),
      status: 'completed'
    };

    const nextMessages = [...messages, userMessage];
    set({ messages: nextMessages, isGenerating: true });

    saveMessages(sessionId, [{ id: userMessage.id, role: 'user', content: messageText }])
      .then(updatedSession => useSessionStore.getState().updateSession(updatedSession));

    const { modelProvider, contextTurnCount } = useSettingsStore.getState();
    const { selectedRagCollectionId } = useRagStore.getState();

    const aiMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      modelProvider,
      reasoningContent: '',
      sources: [],
      timestamp: new Date().toLocaleString(),
      status: 'generating'
    };
    const withAI = [...nextMessages, aiMessage];
    set({ messages: withAI });

    await runStream(
      buildApiMessages(nextMessages, contextTurnCount),
      withAI, aiMessage, sessionId, modelProvider, selectedRagCollectionId
    );
  },

  regenerate: async () => {
    const { messages, isGenerating } = get();
    if (isGenerating) return;

    const lastAiIdx = messages.findLastIndex(m => m.role === 'assistant');
    if (lastAiIdx === -1) return;

    const lastAiMsg = messages[lastAiIdx];
    const history = messages.slice(0, lastAiIdx);
    const sessionId = useSessionStore.getState().currentSessionId;
    const { modelProvider, contextTurnCount } = useSettingsStore.getState();
    const { selectedRagCollectionId } = useRagStore.getState();

    set({ messages: history, isGenerating: true });
    deleteMessageApi(sessionId, lastAiMsg.id).catch(err =>
      console.error('Failed to delete message from DB:', err));

    const aiPlaceholder = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      modelProvider,
      reasoningContent: '',
      sources: [],
      timestamp: new Date().toLocaleString(),
      status: 'generating'
    };
    const withPlaceholder = [...history, aiPlaceholder];
    set({ messages: withPlaceholder });

    await runStream(
      buildApiMessages(history, contextTurnCount),
      withPlaceholder, aiPlaceholder, sessionId, modelProvider, selectedRagCollectionId
    );
  },

  abortGeneration: () => {
    const sessionId = useSessionStore.getState().currentSessionId;
    const parser = streamParsers.get(sessionId);
    if (parser) {
      if (parser.runId) {
        cancelChatRun(parser.runId).catch(err =>
          console.error('Failed to cancel chat run:', err));
      }
      parser.abort();
      const flushed = sessionMessages.get(sessionId);
      const partial = flushed?.findLast(msg => msg.role === 'assistant' && msg.status === 'generating');
      persistPartial(parser, sessionId, partial, 'aborted');
      streamParsers.delete(sessionId);
    }
    generatingSessions.delete(sessionId);
    sessionMessages.delete(sessionId);
    set(state => ({
      isGenerating: false,
      messages: state.messages.map(msg =>
        msg.status === 'generating' ? { ...msg, status: 'aborted' } : msg)
    }));
  },

  deleteChatMessage: async (messageId) => {
    const sessionId = useSessionStore.getState().currentSessionId;
    if (!sessionId || !messageId) return;

    addPending(sessionId, messageId);
    const cached = sessionMessages.get(sessionId);
    const prev = cached || get().messages;
    const next = prev.filter(m => m.id !== messageId);

    set({ messages: next });
    if (cached) sessionMessages.set(sessionId, next);

    try {
      await deleteMessageApi(sessionId, messageId);
      removePending(sessionId, messageId);
    } catch (err) {
      console.error('Failed to delete message from DB:', err);
    }
  },

  updateChatMessage: async (messageId, content) => {
    const sessionId = useSessionStore.getState().currentSessionId;
    if (!sessionId || !messageId) return;

    const cached = sessionMessages.get(sessionId);
    const prev = cached || get().messages;
    const next = prev.map(m => m.id === messageId ? { ...m, content } : m);

    set({ messages: next });
    if (cached) sessionMessages.set(sessionId, next);

    try {
      await updateMessageApi(sessionId, messageId, content);
    } catch (err) {
      console.error('Failed to update message in DB:', err);
      set({ messages: prev });
      if (cached) sessionMessages.set(sessionId, prev);
      throw err;
    }
  },

  sendEditedUserMessage: async (messageId, content) => {
    const sessionId = useSessionStore.getState().currentSessionId;
    const { messages, isGenerating } = get();
    if (!sessionId || !messageId || isGenerating) return;

    const cached = sessionMessages.get(sessionId);
    const prev = cached || messages;
    const editedIdx = prev.findIndex(m => m.id === messageId);
    if (editedIdx === -1) return;

    const editedMessage = { ...prev[editedIdx], content, status: 'completed' };
    const history = [...prev.slice(0, editedIdx), editedMessage];
    const trailing = prev.slice(editedIdx + 1);

    await updateMessageApi(sessionId, messageId, content);
    trailing.forEach(m => {
      if (!m.id) return;
      addPending(sessionId, m.id);
      deleteMessageApi(sessionId, m.id)
        .then(() => removePending(sessionId, m.id))
        .catch(err => console.error('Failed to delete stale message:', err));
    });

    const { modelProvider, contextTurnCount } = useSettingsStore.getState();
    const { selectedRagCollectionId } = useRagStore.getState();

    set({ messages: history, isGenerating: true });
    if (cached) sessionMessages.set(sessionId, history);

    const aiPlaceholder = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      modelProvider,
      reasoningContent: '',
      sources: [],
      timestamp: new Date().toLocaleString(),
      status: 'generating'
    };
    const withPlaceholder = [...history, aiPlaceholder];
    set({ messages: withPlaceholder });

    await runStream(
      buildApiMessages(history, contextTurnCount),
      withPlaceholder, aiPlaceholder, sessionId, modelProvider, selectedRagCollectionId
    );
  }
}));

async function runStream(apiMessages, stateWithPlaceholder, aiMessage, sessionId, provider, ragCollectionId = '') {
  let streamedContent = '';
  let streamedReasoning = '';
  let retrievedSources = [];

  generatingSessions.set(sessionId, true);
  sessionMessages.set(sessionId, stateWithPlaceholder);

  const parser = new StreamParser();
  streamParsers.set(sessionId, parser);

  const currentSessionId = () => useSessionStore.getState().currentSessionId;

  const syncMessages = (updater) => {
    const prev = sessionMessages.get(sessionId) || stateWithPlaceholder;
    const updated = typeof updater === 'function' ? updater(prev) : updater;
    sessionMessages.set(sessionId, updated);
    if (currentSessionId() === sessionId) {
      useChatStore.setState({ messages: updated });
    }
  };

  const finishGeneration = () => {
    generatingSessions.delete(sessionId);
    sessionMessages.delete(sessionId);
    streamParsers.delete(sessionId);
    if (currentSessionId() === sessionId) {
      useChatStore.setState({ isGenerating: false });
    }
  };

  try {
    const { runId } = await createChatRun(apiMessages, provider, ragCollectionId);
    parser.runId = runId;

    await parser.fetchRunEvents(
      runId,
      (chunk) => {
        const chunkType = typeof chunk === 'string' ? 'content' : chunk.type;
        const chunkContent = typeof chunk === 'string' ? chunk : chunk.content;

        if (chunkType === 'reasoning') {
          streamedReasoning += chunkContent;
        } else if (chunkType === 'sources') {
          retrievedSources = Array.isArray(chunk.sources) ? chunk.sources : [];
        } else {
          streamedContent += chunkContent;
        }

        syncMessages(prev => prev.map(msg =>
          msg.id === aiMessage.id
            ? { ...msg, content: streamedContent, reasoningContent: streamedReasoning, sources: retrievedSources }
            : msg
        ));
      },
      (error) => {
        console.error('Stream error:', error);
        finishGeneration();
        syncMessages(prev => prev.map(msg =>
          msg.id === aiMessage.id
            ? { ...msg, status: 'failed', content: streamedContent || '生成失败，请重试', reasoningContent: streamedReasoning, sources: retrievedSources }
            : msg
        ));
      },
      () => {
        if (!streamedContent.trim()) {
          finishGeneration();
          syncMessages(prev => prev.map(msg =>
            msg.id === aiMessage.id
              ? { ...msg, status: 'failed', content: '生成失败，请重试', reasoningContent: streamedReasoning, sources: retrievedSources }
              : msg
          ));
          return;
        }

        finishGeneration();
        syncMessages(prev => prev.map(msg =>
          msg.id === aiMessage.id
            ? { ...msg, status: 'completed', content: streamedContent, reasoningContent: streamedReasoning, sources: retrievedSources }
            : msg
        ));
        parser.assistantPersisted = true;
        saveMessages(sessionId, [{
          id: aiMessage.id,
          role: 'assistant',
          content: streamedContent,
          reasoningContent: streamedReasoning,
          modelProvider: provider,
          sources: retrievedSources,
          status: 'completed'
        }]);
      },
      () => {
        finishGeneration();
        syncMessages(prev => prev.map(msg =>
          msg.id === aiMessage.id
            ? { ...msg, status: 'aborted', content: streamedContent, reasoningContent: streamedReasoning, sources: retrievedSources }
            : msg
        ));
        const aborted = sessionMessages.get(sessionId);
        persistPartial(parser, sessionId, aborted?.find(msg => msg.id === aiMessage.id), 'aborted');
      }
    );
  } catch (error) {
    console.error('Error:', error);
    finishGeneration();
    syncMessages(prev => prev.map(msg =>
      msg.id === aiMessage.id
        ? { ...msg, status: 'failed', content: '生成失败，请重试', reasoningContent: streamedReasoning, sources: retrievedSources }
        : msg
    ));
  }
}
