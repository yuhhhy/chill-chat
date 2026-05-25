import { create } from 'zustand';
import { fetchMessages, saveMessages, saveMessagesOnUnload, updateMessage as updateMessageApi, deleteMessage as deleteMessageApi } from '../api/messages.js';
import { createChatRun, fetchChatRun, cancelChatRun } from '../api/chatRuns.js';
import StreamParser from '../services/streamParser.js';
import { useSessionStore } from './sessionStore.js';
import { useSettingsStore } from './settingsStore.js';
import { useRagStore } from './ragStore.js';

const PENDING_KEY = 'chill-chat:pending-deleted-messages';
const ACTIVE_RUNS_KEY = 'chill-chat:active-runs';

function toViewMessage(m) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    modelProvider: m.model_provider || 'deepseek',
    reasoningContent: m.reasoning_content || '',
    ragStatus: Array.isArray(m.sources) && m.sources.length ? 'retrieved' : '',
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

function readActiveRuns() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ACTIVE_RUNS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeActiveRuns(activeRuns) {
  const hasActiveRuns = Object.keys(activeRuns).length > 0;
  if (!hasActiveRuns) {
    window.localStorage.removeItem(ACTIVE_RUNS_KEY);
  } else {
    window.localStorage.setItem(ACTIVE_RUNS_KEY, JSON.stringify(activeRuns));
  }
}

function rememberActiveRun(sessionId, meta) {
  const activeRuns = readActiveRuns();
  activeRuns[sessionId] = { ...meta, updatedAt: Date.now() };
  writeActiveRuns(activeRuns);
}

function getRememberedActiveRun(sessionId) {
  return readActiveRuns()[sessionId] || null;
}

function forgetActiveRun(sessionId) {
  const activeRuns = readActiveRuns();
  delete activeRuns[sessionId];
  writeActiveRuns(activeRuns);
}

function markStaleGeneratingAsAborted(messages) {
  return messages.map(msg => msg.status === 'generating' ? { ...msg, status: 'aborted' } : msg);
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
const activeAssistantDrafts = new Map();

function toPersistedAssistantMessage(message, provider, status) {
  return {
    id: message.id,
    role: 'assistant',
    content: message.content || '',
    reasoningContent: message.reasoningContent || '',
    modelProvider: message.modelProvider || provider,
    sources: message.sources || [],
    status
  };
}

function persistPartial(_parser, sessionId, message, status = 'aborted') {
  if (!message) return;
  if (!message.content?.trim() && !message.reasoningContent?.trim()) return;
  const provider = useSettingsStore.getState().modelProvider;
  saveMessages(sessionId, [toPersistedAssistantMessage(message, provider, status)])
    .catch(err => console.error('Failed to save partial assistant message:', err));
}

function flushActiveAssistantDraftsOnUnload() {
  for (const parser of streamParsers.values()) {
    parser.flushAll?.();
  }

  for (const [sessionId, draft] of activeAssistantDrafts) {
    if (!draft.content?.trim() && !draft.reasoningContent?.trim()) continue;
    saveMessagesOnUnload(sessionId, [toPersistedAssistantMessage(draft, draft.modelProvider, 'generating')]);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushActiveAssistantDraftsOnUnload);
}

export const useChatStore = create((set, get) => ({
  messages: [],
  isLoadingMessages: true,
  isGenerating: false,

  loadMessages: async (sessionId) => {
    if (!sessionId) return;

    const currentSessionId = () => useSessionStore.getState().currentSessionId;
    const rememberedRun = getRememberedActiveRun(sessionId);
    let resumableRun = null;

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
    let viewMessages = rows.filter(r => !pendingIds.has(r.id)).map(toViewMessage);

    if (rememberedRun?.runId) {
      try {
        const run = await fetchChatRun(rememberedRun.runId);
        if (run?.sessionId === sessionId) {
          resumableRun = { ...rememberedRun, ...run };
        } else {
          forgetActiveRun(sessionId);
        }
      } catch (err) {
        forgetActiveRun(sessionId);
        console.warn('Active chat run is no longer resumable:', err);
      }
    }

    if (!resumableRun) {
      viewMessages = markStaleGeneratingAsAborted(viewMessages);
    }

    set({
      messages: viewMessages,
      isLoadingMessages: false,
      isGenerating: Boolean(resumableRun && resumableRun.status === 'running')
    });

    if (resumableRun) {
      const assistantMessageId = resumableRun.assistantMessageId;
      const existingAssistant = viewMessages.find(msg => msg.id === assistantMessageId);
      const provider = resumableRun.provider || existingAssistant?.modelProvider || useSettingsStore.getState().modelProvider;
      const aiMessage = existingAssistant || {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        modelProvider: provider,
        ragStatus: '',
        reasoningContent: '',
        sources: [],
        timestamp: new Date().toLocaleString(),
        status: 'generating'
      };
      const stateWithAssistant = existingAssistant
        ? viewMessages.map(msg => msg.id === assistantMessageId ? { ...msg, status: 'generating' } : msg)
        : [...viewMessages, aiMessage];

      set({ messages: stateWithAssistant, isGenerating: resumableRun.status === 'running' });
      runStream([], stateWithAssistant, { ...aiMessage, status: 'generating' }, sessionId, provider, resumableRun.ragCollectionId || '', {
        runId: resumableRun.runId,
        replay: true
      }).catch(err => console.error('Failed to resume chat run:', err));
    }
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
      ragStatus: '',
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
      ragStatus: '',
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
    activeAssistantDrafts.delete(sessionId);
    forgetActiveRun(sessionId);
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
      ragStatus: '',
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

async function runStream(apiMessages, stateWithPlaceholder, aiMessage, sessionId, provider, ragCollectionId = '', options = {}) {
  let streamedContent = '';
  let streamedReasoning = '';
  let retrievedSources = [];
  let ragStatus = '';
  let partialSaveTimer = null;
  let lastSavedPartial = '';

  generatingSessions.set(sessionId, true);
  sessionMessages.set(sessionId, stateWithPlaceholder);
  activeAssistantDrafts.set(sessionId, aiMessage);

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
    if (partialSaveTimer) {
      clearTimeout(partialSaveTimer);
      partialSaveTimer = null;
    }
    generatingSessions.delete(sessionId);
    sessionMessages.delete(sessionId);
    streamParsers.delete(sessionId);
    activeAssistantDrafts.delete(sessionId);
    if (currentSessionId() === sessionId) {
      useChatStore.setState({ isGenerating: false });
    }
  };

  const updateActiveDraft = (status = 'generating') => {
    activeAssistantDrafts.set(sessionId, {
      ...aiMessage,
      content: streamedContent,
      reasoningContent: streamedReasoning,
      ragStatus,
      sources: retrievedSources,
      status
    });
  };

  const savePartialDraft = (status = 'generating') => {
    if (!streamedContent.trim() && !streamedReasoning.trim()) return;

    const message = activeAssistantDrafts.get(sessionId);
    if (!message) return;

    const persisted = toPersistedAssistantMessage(message, provider, status);
    const signature = JSON.stringify(persisted);
    if (signature === lastSavedPartial) return;

    lastSavedPartial = signature;
    saveMessages(sessionId, [persisted])
      .catch(err => console.error('Failed to save streaming assistant draft:', err));
  };

  const schedulePartialSave = () => {
    if (partialSaveTimer) return;
    partialSaveTimer = setTimeout(() => {
      partialSaveTimer = null;
      savePartialDraft('generating');
    }, 750);
  };

  try {
    const { runId } = options.runId
      ? { runId: options.runId }
      : await createChatRun(apiMessages, provider, ragCollectionId, {
        sessionId,
        assistantMessageId: aiMessage.id
      });
    parser.runId = runId;
    rememberActiveRun(sessionId, {
      runId,
      assistantMessageId: aiMessage.id,
      provider,
      ragCollectionId
    });

    await parser.fetchRunEvents(
      runId,
      (chunk) => {
        const chunkType = typeof chunk === 'string' ? 'content' : chunk.type;
        const chunkContent = typeof chunk === 'string' ? chunk : chunk.content;

        if (chunkType === 'reasoning') {
          streamedReasoning += chunkContent;
        } else if (chunkType === 'sources') {
          retrievedSources = Array.isArray(chunk.sources) ? chunk.sources : [];
          ragStatus = retrievedSources.length ? 'retrieved' : 'empty';
        } else {
          streamedContent += chunkContent;
        }

        updateActiveDraft('generating');
        schedulePartialSave();
        syncMessages(prev => prev.map(msg =>
          msg.id === aiMessage.id
            ? { ...msg, content: streamedContent, ragStatus, reasoningContent: streamedReasoning, sources: retrievedSources, status: 'generating' }
            : msg
        ));
      },
      (error) => {
        console.error('Stream error:', error);
        updateActiveDraft('failed');
        savePartialDraft('failed');
        finishGeneration();
        forgetActiveRun(sessionId);
        syncMessages(prev => prev.map(msg =>
          msg.id === aiMessage.id
            ? { ...msg, status: 'failed', content: streamedContent || '生成失败，请重试', ragStatus, reasoningContent: streamedReasoning, sources: retrievedSources }
            : msg
        ));
      },
      () => {
        if (!streamedContent.trim()) {
          finishGeneration();
          forgetActiveRun(sessionId);
          syncMessages(prev => prev.map(msg =>
            msg.id === aiMessage.id
              ? { ...msg, status: 'failed', content: '生成失败，请重试', ragStatus, reasoningContent: streamedReasoning, sources: retrievedSources }
              : msg
          ));
          return;
        }

        finishGeneration();
        forgetActiveRun(sessionId);
        syncMessages(prev => prev.map(msg =>
          msg.id === aiMessage.id
            ? { ...msg, status: 'completed', content: streamedContent, ragStatus, reasoningContent: streamedReasoning, sources: retrievedSources }
            : msg
        ));
        parser.assistantPersisted = true;
        saveMessages(sessionId, [{
          id: aiMessage.id,
          role: 'assistant',
          content: streamedContent,
          reasoningContent: streamedReasoning,
          modelProvider: provider,
          ragStatus,
          sources: retrievedSources,
          status: 'completed'
        }]);
      },
      () => {
        updateActiveDraft('aborted');
        savePartialDraft('aborted');
        finishGeneration();
        forgetActiveRun(sessionId);
        syncMessages(prev => prev.map(msg =>
          msg.id === aiMessage.id
            ? { ...msg, status: 'aborted', content: streamedContent, ragStatus, reasoningContent: streamedReasoning, sources: retrievedSources }
            : msg
        ));
        const aborted = sessionMessages.get(sessionId);
        persistPartial(parser, sessionId, aborted?.find(msg => msg.id === aiMessage.id), 'aborted');
      }
    );
  } catch (error) {
    console.error('Error:', error);
    updateActiveDraft('failed');
    savePartialDraft('failed');
    finishGeneration();
    forgetActiveRun(sessionId);
    syncMessages(prev => prev.map(msg =>
      msg.id === aiMessage.id
        ? { ...msg, status: 'failed', content: '生成失败，请重试', ragStatus, reasoningContent: streamedReasoning, sources: retrievedSources }
        : msg
    ));
  }
}
