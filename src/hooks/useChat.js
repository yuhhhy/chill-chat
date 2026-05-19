import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMessages, saveMessages, deleteMessage as deleteMessageApi } from '../api/messages.js';
import { createChatRun, cancelChatRun } from '../api/chatRuns.js';
import StreamParser from '../services/streamParser.js';

const PENDING_DELETED_MESSAGES_STORAGE_KEY = 'chill-chat:pending-deleted-messages';

function toViewMessage(m) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    modelProvider: m.model_provider || 'deepseek',
    reasoningContent: m.reasoning_content || '',
    timestamp: new Date(m.created_at * 1000).toLocaleString(),
    status: m.status || 'completed'
  };
}

function readPendingDeletedMessages() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_DELETED_MESSAGES_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePendingDeletedMessages(pending) {
  if (typeof window === 'undefined') return;
  const hasPending = Object.values(pending).some(ids => Array.isArray(ids) && ids.length > 0);
  if (!hasPending) {
    window.localStorage.removeItem(PENDING_DELETED_MESSAGES_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(PENDING_DELETED_MESSAGES_STORAGE_KEY, JSON.stringify(pending));
}

function addPendingDeletedMessage(sessionId, messageId) {
  const pending = readPendingDeletedMessages();
  const ids = new Set(pending[sessionId] || []);
  ids.add(messageId);
  pending[sessionId] = [...ids];
  writePendingDeletedMessages(pending);
}

function removePendingDeletedMessage(sessionId, messageId) {
  const pending = readPendingDeletedMessages();
  pending[sessionId] = (pending[sessionId] || []).filter(id => id !== messageId);
  if (pending[sessionId].length === 0) {
    delete pending[sessionId];
  }
  writePendingDeletedMessages(pending);
}

function getPendingDeletedMessageIds(sessionId) {
  return new Set(readPendingDeletedMessages()[sessionId] || []);
}

function getMessagesWithContextTurnLimit(messages, contextTurnCount) {
  if (contextTurnCount === -1) {
    return messages;
  }

  const userMessageIndexes = messages.reduce((indexes, message, index) => {
    if (message.role === 'user') {
      indexes.push(index);
    }
    return indexes;
  }, []);
  const keepFromUserIndex = Math.max(userMessageIndexes.length - contextTurnCount - 1, 0);
  const keepFromMessageIndex = userMessageIndexes[keepFromUserIndex] ?? 0;

  return messages.slice(keepFromMessageIndex);
}

export function useChat({ currentSessionId, contextTurnCount = 5, modelProvider = 'deepseek', onSessionUpdated }) {
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const currentSessionIdRef = useRef(currentSessionId);
  const generatingSessionsRef = useRef(new Set());
  const sessionMessagesRef = useRef(new Map());
  const streamParsersRef = useRef(new Map());

  const persistPartialAssistant = useCallback((parser, sessionId, message, status = 'aborted') => {
    if (!message || parser?.assistantPersisted) return;
    if (!message.content?.trim() && !message.reasoningContent?.trim()) return;

    if (parser) parser.assistantPersisted = true;
    saveMessages(sessionId, [{
      id: message.id,
      role: 'assistant',
      content: message.content || '',
      reasoningContent: message.reasoningContent || '',
      modelProvider: message.modelProvider || modelProvider,
      status
    }]).catch(err =>
      console.error('Failed to save partial assistant message:', err)
    );
  }, [modelProvider]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    if (!currentSessionId) return;

    if (
      generatingSessionsRef.current.has(currentSessionId) &&
      sessionMessagesRef.current.has(currentSessionId)
    ) {
      setMessages(sessionMessagesRef.current.get(currentSessionId));
      setIsLoadingMessages(false);
      setIsGenerating(true);
      return;
    }

    setMessages([]);
    setIsGenerating(false);
    setIsLoadingMessages(true);

    const pendingDeletedIds = getPendingDeletedMessageIds(currentSessionId);
    pendingDeletedIds.forEach(messageId => {
      deleteMessageApi(currentSessionId, messageId)
        .then(() => removePendingDeletedMessage(currentSessionId, messageId))
        .catch(err => console.error('Failed to flush pending deleted message:', err));
    });

    fetchMessages(currentSessionId).then(rows => {
      if (currentSessionIdRef.current !== currentSessionId) return;
      setMessages(rows.filter(row => !pendingDeletedIds.has(row.id)).map(toViewMessage));
      setIsLoadingMessages(false);
    });
  }, [currentSessionId]);

  // Core streaming logic — shared by send() and regenerate()
  const _runStream = useCallback(async (apiMessages, stateWithPlaceholder, aiMessagePlaceholder, capturedSessionId, provider) => {
    let streamedContent = '';
    let streamedReasoningContent = '';

    generatingSessionsRef.current.add(capturedSessionId);
    sessionMessagesRef.current.set(capturedSessionId, stateWithPlaceholder);

    const parser = new StreamParser();
    streamParsersRef.current.set(capturedSessionId, parser);

    const syncMessages = (updatedOrUpdater) => {
      const previous = sessionMessagesRef.current.get(capturedSessionId) || stateWithPlaceholder;
      const updated = typeof updatedOrUpdater === 'function'
        ? updatedOrUpdater(previous)
        : updatedOrUpdater;
      sessionMessagesRef.current.set(capturedSessionId, updated);
      if (currentSessionIdRef.current === capturedSessionId) {
        setMessages(updated);
      }
    };

    const finishGeneration = () => {
      generatingSessionsRef.current.delete(capturedSessionId);
      sessionMessagesRef.current.delete(capturedSessionId);
      streamParsersRef.current.delete(capturedSessionId);
      if (currentSessionIdRef.current === capturedSessionId) {
        setIsGenerating(false);
      }
    };

    try {
      const { runId } = await createChatRun(apiMessages, provider);
      parser.runId = runId;

      await parser.fetchRunEvents(
        runId,
        (chunk) => {
          const chunkType = typeof chunk === 'string' ? 'content' : chunk.type;
          const chunkContent = typeof chunk === 'string' ? chunk : chunk.content;

          if (chunkType === 'reasoning') {
            streamedReasoningContent += chunkContent;
          } else {
            streamedContent += chunkContent;
          }

          syncMessages(prev => prev.map(msg =>
            msg.id === aiMessagePlaceholder.id
              ? { ...msg, content: streamedContent, reasoningContent: streamedReasoningContent }
              : msg
          ));
        },
        (error) => {
          console.error('Stream error:', error);
          const failed = stateWithPlaceholder.map(msg =>
            msg.id === aiMessagePlaceholder.id
              ? { ...msg, status: 'failed', content: streamedContent || '生成失败，请重试', reasoningContent: streamedReasoningContent }
              : msg
          );
          finishGeneration();
          syncMessages(failed);
        },
        () => {
          if (!streamedContent.trim()) {
            const failed = stateWithPlaceholder.map(msg =>
              msg.id === aiMessagePlaceholder.id
                ? { ...msg, status: 'failed', content: '生成失败，请重试', reasoningContent: streamedReasoningContent }
                : msg
            );
            finishGeneration();
            syncMessages(failed);
            return;
          }

          const completed = stateWithPlaceholder.map(msg =>
            msg.id === aiMessagePlaceholder.id
              ? { ...msg, status: 'completed', content: streamedContent, reasoningContent: streamedReasoningContent }
              : msg
          );
          finishGeneration();
          syncMessages(completed);
          parser.assistantPersisted = true;
          saveMessages(capturedSessionId, [{
            id: aiMessagePlaceholder.id,
            role: 'assistant',
            content: streamedContent,
            reasoningContent: streamedReasoningContent,
            modelProvider: provider,
            status: 'completed'
          }]);
        },
        () => {
          const aborted = stateWithPlaceholder.map(msg =>
            msg.id === aiMessagePlaceholder.id
              ? { ...msg, status: 'aborted', content: streamedContent, reasoningContent: streamedReasoningContent }
              : msg
          );
          finishGeneration();
          syncMessages(aborted);
          persistPartialAssistant(parser, capturedSessionId, aborted.find(msg => msg.id === aiMessagePlaceholder.id), 'aborted');
        }
      );
    } catch (error) {
      console.error('Error:', error);
      const failed = stateWithPlaceholder.map(msg =>
        msg.id === aiMessagePlaceholder.id
          ? { ...msg, status: 'failed', content: '生成失败，请重试', reasoningContent: streamedReasoningContent }
          : msg
      );
      finishGeneration();
      syncMessages(failed);
    }
  }, [persistPartialAssistant]); // refs and setters are stable

  const send = useCallback(async (messageText) => {
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toLocaleString(),
      status: 'completed'
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setIsGenerating(true);

    saveMessages(currentSessionId, [{ id: userMessage.id, role: 'user', content: messageText }])
      .then(updatedSession => onSessionUpdated(updatedSession));

    const aiMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      modelProvider,
      reasoningContent: '',
      timestamp: new Date().toLocaleString(),
      status: 'generating'
    };
    const messagesWithAI = [...nextMessages, aiMessage];
    setMessages(messagesWithAI);

    await _runStream(
      getMessagesWithContextTurnLimit(nextMessages, contextTurnCount).map(m => ({ role: m.role, content: m.content })),
      messagesWithAI,
      aiMessage,
      currentSessionId,
      modelProvider
    );
  }, [messages, currentSessionId, contextTurnCount, modelProvider, onSessionUpdated, _runStream]);

  const regenerate = useCallback(async () => {
    if (isGenerating) return;
    const lastAiIdx = messages.findLastIndex(m => m.role === 'assistant');
    if (lastAiIdx === -1) return;
    const lastAiMsg = messages[lastAiIdx];
    const historyMessages = messages.slice(0, lastAiIdx);

    setMessages(historyMessages);
    setIsGenerating(true);

    deleteMessageApi(currentSessionId, lastAiMsg.id).catch(err =>
      console.error('Failed to delete message from DB:', err)
    );

    const aiPlaceholder = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      modelProvider,
      reasoningContent: '',
      timestamp: new Date().toLocaleString(),
      status: 'generating'
    };
    const withPlaceholder = [...historyMessages, aiPlaceholder];
    setMessages(withPlaceholder);

    await _runStream(
      getMessagesWithContextTurnLimit(historyMessages, contextTurnCount).map(m => ({ role: m.role, content: m.content })),
      withPlaceholder,
      aiPlaceholder,
      currentSessionId,
      modelProvider
    );
  }, [messages, currentSessionId, contextTurnCount, isGenerating, modelProvider, _runStream]);

  const abortGeneration = useCallback(() => {
    const sid = currentSessionIdRef.current;
    const parser = streamParsersRef.current.get(sid);
    if (parser) {
      if (parser.runId) {
        cancelChatRun(parser.runId).catch(err =>
          console.error('Failed to cancel chat run:', err)
        );
      }
      parser.abort();
      const flushedMessages = sessionMessagesRef.current.get(sid);
      const partialAssistant = flushedMessages?.findLast(msg => msg.role === 'assistant' && msg.status === 'generating');
      persistPartialAssistant(parser, sid, partialAssistant, 'aborted');
      streamParsersRef.current.delete(sid);
    }
    generatingSessionsRef.current.delete(sid);
    sessionMessagesRef.current.delete(sid);
    setIsGenerating(false);
    setMessages(prev =>
      prev.map(msg => msg.status === 'generating' ? { ...msg, status: 'aborted' } : msg)
    );
  }, []);

  const deleteChatMessage = useCallback(async (messageId) => {
    if (!currentSessionId || !messageId) return;

    addPendingDeletedMessage(currentSessionId, messageId);

    const cachedMessages = sessionMessagesRef.current.get(currentSessionId);
    const previousMessages = cachedMessages || messages;
    const nextMessages = previousMessages.filter(message => message.id !== messageId);

    setMessages(nextMessages);
    if (cachedMessages) {
      sessionMessagesRef.current.set(currentSessionId, nextMessages);
    }

    try {
      await deleteMessageApi(currentSessionId, messageId);
      removePendingDeletedMessage(currentSessionId, messageId);
    } catch (err) {
      console.error('Failed to delete message from DB:', err);
    }
  }, [currentSessionId, messages]);

  return { messages, isLoadingMessages, isGenerating, send, abortGeneration, regenerate, deleteChatMessage };
}
