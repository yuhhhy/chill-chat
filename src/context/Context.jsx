import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import streamParser from "../services/streamParser";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";

export const Context = createContext();

const ContextProvider = (props) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const virtuosoRef = useRef(null);
  const streamedContentRef = useRef("");

  const currentSessionId = useMemo(() => {
    const match = location.pathname.match(/^\/chat\/(.+)$/);
    return match ? match[1] : null;
  }, [location.pathname]);

  const showResult = messages.length > 0;

  // On mount: load sessions, navigate to first or create one
  useEffect(() => {
    const initialSessionId = location.pathname.match(/^\/chat\/(.+)$/)?.[1] ?? null;

    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => {
        setSessions(data);
        if (initialSessionId) return; // URL already has a session
        if (data.length > 0) {
          navigate(`/chat/${data[0].id}`, { replace: true });
        } else {
          fetch('/api/sessions', { method: 'POST' })
            .then(r => r.json())
            .then(session => {
              setSessions([session]);
              navigate(`/chat/${session.id}`, { replace: true });
            });
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages whenever the session in the URL changes
  useEffect(() => {
    if (!currentSessionId) return;
    streamParser.abort(false);
    setMessages([]);
    setIsLoadingMessages(true);
    setInput("");
    setIsGenerating(false);
    setIsAtBottom(true);

    fetch(`/api/sessions/${currentSessionId}/messages`)
      .then(r => r.json())
      .then(rows => {
        setMessages(rows.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at * 1000).toLocaleString(),
          status: "completed"
        })));
        setIsLoadingMessages(false);
      });
  }, [currentSessionId]);

  const createNewSession = useCallback(async () => {
    const res = await fetch('/api/sessions', { method: 'POST' });
    const session = await res.json();
    setSessions(prev => [session, ...prev]);
    navigate(`/chat/${session.id}`);
  }, [navigate]);

  const loadSession = useCallback((sessionId) => {
    navigate(`/chat/${sessionId}`);
  }, [navigate]);

  const deleteSession = useCallback(async (sessionId) => {
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });

    const remaining = sessions.filter(s => s.id !== sessionId);
    setSessions(remaining);

    if (currentSessionId === sessionId) {
      if (remaining.length > 0) {
        navigate(`/chat/${remaining[0].id}`);
      } else {
        const res = await fetch('/api/sessions', { method: 'POST' });
        const session = await res.json();
        setSessions([session]);
        navigate(`/chat/${session.id}`);
      }
    }
  }, [currentSessionId, navigate, sessions]);

  const scrollToBottom = useCallback((behavior = "auto") => {
    if (!virtuosoRef.current) return;
    virtuosoRef.current.scrollToIndex({
      align: "end",
      behavior,
      index: Math.max(messages.length - 1, 0)
    });
  }, [messages.length]);

  const onSent = useCallback(async (prompt) => {
    if (isGenerating) return;

    const messageText = prompt !== undefined ? prompt : input;
    if (!messageText.trim()) return;

    const normalizedText = messageText.trim();
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: normalizedText,
      timestamp: new Date().toLocaleString(),
      status: "completed"
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsGenerating(true);
    setIsAtBottom(true);

    // Save user message and update session title
    fetch(`/api/sessions/${currentSessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: normalizedText }] })
    })
      .then(r => r.json())
      .then(updatedSession => {
        setSessions(prev => prev.map(s => s.id === currentSessionId ? updatedSession : s));
      });

    const aiMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date().toLocaleString(),
      status: "generating"
    };
    const messagesWithAI = [...nextMessages, aiMessage];
    setMessages(messagesWithAI);
    streamedContentRef.current = "";

    const capturedSessionId = currentSessionId;

    try {
      const apiMessages = nextMessages.map(m => ({ role: m.role, content: m.content }));

      await streamParser.fetchStream(
        apiMessages,
        (chunk) => {
          streamedContentRef.current += chunk;
          setMessages(messagesWithAI.map(msg =>
            msg.id === aiMessage.id
              ? { ...msg, content: streamedContentRef.current }
              : msg
          ));
        },
        (error) => {
          console.error("Stream error:", error);
          setMessages(messagesWithAI.map(msg =>
            msg.id === aiMessage.id
              ? { ...msg, status: "failed", content: streamedContentRef.current || "生成失败，请重试" }
              : msg
          ));
          setIsGenerating(false);
        },
        () => {
          setMessages(messagesWithAI.map(msg =>
            msg.id === aiMessage.id
              ? { ...msg, status: "completed", content: streamedContentRef.current }
              : msg
          ));
          setIsGenerating(false);

          // Save assistant message
          fetch(`/api/sessions/${capturedSessionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "assistant", content: streamedContentRef.current }] })
          });
        }
      );
    } catch (error) {
      console.error("Error:", error);
      setMessages(messagesWithAI.map(msg =>
        msg.id === aiMessage.id
          ? { ...msg, status: "failed", content: "生成失败，请重试" }
          : msg
      ));
      setIsGenerating(false);
    }
  }, [input, isGenerating, messages, currentSessionId]);

  const handleVoiceTranscript = useCallback((transcript) => {
    setInput(transcript);
    onSent(transcript);
  }, [onSent]);

  const {
    error: voiceError,
    isSupported: isVoiceSupported,
    status: voiceInputStatus,
    toggle: toggleVoiceInput,
    transcript: voiceTranscript
  } = useSpeechRecognition({ onTranscript: handleVoiceTranscript, sessionId: currentSessionId });

  const abortGeneration = useCallback(() => {
    streamParser.abort();
    setIsGenerating(false);
    setMessages(prev =>
      prev.map(msg => msg.status === "generating" ? { ...msg, status: "aborted" } : msg)
    );
  }, []);

  const handleKeyPress = useCallback((event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSent();
    }
  }, [onSent]);

  const contextValue = useMemo(() => ({
    abortGeneration,
    createNewSession,
    currentSessionId,
    deleteSession,
    handleKeyPress,
    input,
    isAtBottom,
    isGenerating,
    isLoadingMessages,
    isVoiceSupported,
    loadSession,
    messages,
    onSent,
    scrollToBottom,
    sessions,
    setInput,
    setIsAtBottom,
    showResult,
    toggleVoiceInput,
    virtuosoRef,
    voiceError,
    voiceInputStatus,
    voiceTranscript
  }), [
    abortGeneration,
    createNewSession,
    currentSessionId,
    deleteSession,
    handleKeyPress,
    input,
    isAtBottom,
    isGenerating,
    isLoadingMessages,
    isVoiceSupported,
    loadSession,
    messages,
    onSent,
    scrollToBottom,
    sessions,
    showResult,
    toggleVoiceInput,
    voiceError,
    voiceInputStatus,
    voiceTranscript
  ]);

  return <Context.Provider value={contextValue}>{props.children}</Context.Provider>;
};

export default ContextProvider;
