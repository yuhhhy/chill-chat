import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMessages, saveMessages } from '../api/messages.js';
import streamParser from '../services/streamParser.js';

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

  const streamedContentRef = useRef('');
  const currentSessionIdRef = useRef(currentSessionId);
  const generatingSessionsRef = useRef(new Set());
  const sessionMessagesRef = useRef(new Map());

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Load (or restore) messages when the active session changes
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
      if (currentSessionIdRef.current !== currentSessionId) return; // stale response
      setMessages(rows.map(toViewMessage));
      setIsLoadingMessages(false);
    });
  }, [currentSessionId]);

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
    streamedContentRef.current = '';

    const capturedSessionId = currentSessionId;
    generatingSessionsRef.current.add(capturedSessionId);
    sessionMessagesRef.current.set(capturedSessionId, messagesWithAI);

    const syncMessages = (updated) => {
      sessionMessagesRef.current.set(capturedSessionId, updated);
      if (currentSessionIdRef.current === capturedSessionId) {
        setMessages(updated);
      }
    };

    const finishGeneration = () => {
      generatingSessionsRef.current.delete(capturedSessionId);
      sessionMessagesRef.current.delete(capturedSessionId);
      if (currentSessionIdRef.current === capturedSessionId) {
        setIsGenerating(false);
      }
    };

    try {
      const apiMessages = nextMessages.map(m => ({ role: m.role, content: m.content }));

      await streamParser.fetchStream(
        apiMessages,
        (chunk) => {
          streamedContentRef.current += chunk;
          syncMessages(messagesWithAI.map(msg =>
            msg.id === aiMessage.id
              ? { ...msg, content: streamedContentRef.current }
              : msg
          ));
        },
        (error) => {
          console.error('Stream error:', error);
          const failed = messagesWithAI.map(msg =>
            msg.id === aiMessage.id
              ? { ...msg, status: 'failed', content: streamedContentRef.current || '生成失败，请重试' }
              : msg
          );
          finishGeneration();
          syncMessages(failed);
        },
        () => {
          const completed = messagesWithAI.map(msg =>
            msg.id === aiMessage.id
              ? { ...msg, status: 'completed', content: streamedContentRef.current }
              : msg
          );
          finishGeneration();
          syncMessages(completed);
          saveMessages(capturedSessionId, [{ role: 'assistant', content: streamedContentRef.current }]);
        },
        () => {
          const aborted = messagesWithAI.map(msg =>
            msg.id === aiMessage.id
              ? { ...msg, status: 'aborted', content: streamedContentRef.current }
              : msg
          );
          finishGeneration();
          syncMessages(aborted);
        }
      );
    } catch (error) {
      console.error('Error:', error);
      const failed = messagesWithAI.map(msg =>
        msg.id === aiMessage.id
          ? { ...msg, status: 'failed', content: '生成失败，请重试' }
          : msg
      );
      finishGeneration();
      syncMessages(failed);
    }
  }, [messages, currentSessionId, onSessionUpdated]);

  const abortGeneration = useCallback(() => {
    const sid = currentSessionIdRef.current;
    streamParser.abort();
    generatingSessionsRef.current.delete(sid);
    sessionMessagesRef.current.delete(sid);
    setIsGenerating(false);
    setMessages(prev =>
      prev.map(msg => msg.status === 'generating' ? { ...msg, status: 'aborted' } : msg)
    );
  }, []);

  return { messages, isLoadingMessages, isGenerating, send, abortGeneration };
}
