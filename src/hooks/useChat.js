import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMessages, saveMessages, deleteMessage as deleteMessageApi } from '../api/messages.js';
import StreamParser from '../services/streamParser.js';

function toViewMessage(m) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.created_at * 1000).toLocaleString(),
    status: 'completed'
  };
}

export function useChat({ currentSessionId, onSessionUpdated }) {
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const currentSessionIdRef = useRef(currentSessionId);
  const generatingSessionsRef = useRef(new Set());
  const sessionMessagesRef = useRef(new Map());
  const streamParsersRef = useRef(new Map());

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

    fetchMessages(currentSessionId).then(rows => {
      if (currentSessionIdRef.current !== currentSessionId) return;
      setMessages(rows.map(toViewMessage));
      setIsLoadingMessages(false);
    });
  }, [currentSessionId]);

  // Core streaming logic — shared by send() and regenerate()
  const _runStream = useCallback(async (apiMessages, stateWithPlaceholder, aiMessagePlaceholder, capturedSessionId) => {
    let streamedContent = '';

    generatingSessionsRef.current.add(capturedSessionId);
    sessionMessagesRef.current.set(capturedSessionId, stateWithPlaceholder);

    const parser = new StreamParser();
    streamParsersRef.current.set(capturedSessionId, parser);

    const syncMessages = (updated) => {
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
      await parser.fetchStream(
        apiMessages,
        (chunk) => {
          streamedContent += chunk;
          syncMessages(stateWithPlaceholder.map(msg =>
            msg.id === aiMessagePlaceholder.id
              ? { ...msg, content: streamedContent }
              : msg
          ));
        },
        (error) => {
          console.error('Stream error:', error);
          const failed = stateWithPlaceholder.map(msg =>
            msg.id === aiMessagePlaceholder.id
              ? { ...msg, status: 'failed', content: streamedContent || '生成失败，请重试' }
              : msg
          );
          finishGeneration();
          syncMessages(failed);
        },
        () => {
          const completed = stateWithPlaceholder.map(msg =>
            msg.id === aiMessagePlaceholder.id
              ? { ...msg, status: 'completed', content: streamedContent }
              : msg
          );
          finishGeneration();
          syncMessages(completed);
          saveMessages(capturedSessionId, [{ role: 'assistant', content: streamedContent }]);
        },
        () => {
          const aborted = stateWithPlaceholder.map(msg =>
            msg.id === aiMessagePlaceholder.id
              ? { ...msg, status: 'aborted', content: streamedContent }
              : msg
          );
          finishGeneration();
          syncMessages(aborted);
        }
      );
    } catch (error) {
      console.error('Error:', error);
      const failed = stateWithPlaceholder.map(msg =>
        msg.id === aiMessagePlaceholder.id
          ? { ...msg, status: 'failed', content: '生成失败，请重试' }
          : msg
      );
      finishGeneration();
      syncMessages(failed);
    }
  }, []); // refs and setters are stable

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

    saveMessages(currentSessionId, [{ role: 'user', content: messageText }])
      .then(updatedSession => onSessionUpdated(updatedSession));

    const aiMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleString(),
      status: 'generating'
    };
    const messagesWithAI = [...nextMessages, aiMessage];
    setMessages(messagesWithAI);

    await _runStream(
      nextMessages.map(m => ({ role: m.role, content: m.content })),
      messagesWithAI,
      aiMessage,
      currentSessionId
    );
  }, [messages, currentSessionId, onSessionUpdated, _runStream]);

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
      timestamp: new Date().toLocaleString(),
      status: 'generating'
    };
    const withPlaceholder = [...historyMessages, aiPlaceholder];
    setMessages(withPlaceholder);

    await _runStream(
      historyMessages.map(m => ({ role: m.role, content: m.content })),
      withPlaceholder,
      aiPlaceholder,
      currentSessionId
    );
  }, [messages, currentSessionId, isGenerating, _runStream]);

  const abortGeneration = useCallback(() => {
    const sid = currentSessionIdRef.current;
    const parser = streamParsersRef.current.get(sid);
    if (parser) {
      parser.abort();
      streamParsersRef.current.delete(sid);
    }
    generatingSessionsRef.current.delete(sid);
    sessionMessagesRef.current.delete(sid);
    setIsGenerating(false);
    setMessages(prev =>
      prev.map(msg => msg.status === 'generating' ? { ...msg, status: 'aborted' } : msg)
    );
  }, []);

  return { messages, isLoadingMessages, isGenerating, send, abortGeneration, regenerate };
}
