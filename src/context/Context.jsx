import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import streamParser from "../services/streamParser";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";

export const Context = createContext();

const ContextProvider = (props) => {
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const virtuosoRef = useRef(null);
  const streamedContentRef = useRef("");

  const showResult = messages.length > 0;

  const createNewSession = useCallback(() => {
    const newSession = {
      id: Date.now(),
      title: "New Chat",
      messages: [],
      createdAt: new Date().toISOString(),
      isGenerating: false,
      input: ""
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages([]);
    setInput("");
    setIsGenerating(false);
    setIsAtBottom(true);
  }, []);

  const loadSession = useCallback(
    (sessionId) => {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) return;

      setCurrentSessionId(sessionId);
      setMessages(session.messages);
      setIsGenerating(session.isGenerating || false);
      setInput(session.input || "");
      setIsAtBottom(true);
    },
    [sessions]
  );

  const deleteSession = useCallback(
    (sessionId) => {
      setSessions((prev) => {
        const updatedSessions = prev.filter((session) => session.id !== sessionId);

        if (currentSessionId === sessionId && updatedSessions.length > 0) {
          setTimeout(() => loadSession(updatedSessions[0].id), 0);
        }

        return updatedSessions;
      });
    },
    [currentSessionId, loadSession]
  );

  const updateSessionMessages = useCallback(
    (newMessages, additionalState = {}) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentSessionId
            ? {
                ...session,
                messages: newMessages,
                title:
                  newMessages.find((message) => message.role === "user")?.content?.slice(0, 20) ||
                  "New Chat",
                isGenerating:
                  additionalState.isGenerating !== undefined
                    ? additionalState.isGenerating
                    : session.isGenerating,
                input: additionalState.input !== undefined ? additionalState.input : session.input
              }
            : session
        )
      );
    },
    [currentSessionId]
  );

  const setSessionInput = useCallback(
    (value) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId ? { ...s, input: value } : s))
      );
    },
    [currentSessionId]
  );

  useEffect(() => {
    if (sessions.length === 0) {
      createNewSession();
    }
  }, [createNewSession, sessions.length]);

  const scrollToBottom = useCallback(
    (behavior = "auto") => {
      if (!virtuosoRef.current) return;
      virtuosoRef.current.scrollToIndex({
        align: "end",
        behavior,
        index: Math.max(messages.length - 1, 0)
      });
    },
    [messages.length]
  );

  const onSent = useCallback(
    async (prompt) => {
      if (isGenerating) return;

      const messageText = prompt !== undefined ? prompt : input;
      if (!messageText.trim()) return;

      const normalizedText = messageText.trim();
      const userMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: normalizedText,
        timestamp: new Date().toLocaleString()
      };

      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      updateSessionMessages(nextMessages, { input: "", isGenerating: true });
      setInput("");
      setIsGenerating(true);
      setIsAtBottom(true);

      const aiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date().toLocaleString(),
        status: "generating"
      };

      const messagesWithAI = [...nextMessages, aiMessage];
      setMessages(messagesWithAI);
      updateSessionMessages(messagesWithAI, { input: "", isGenerating: true });

      streamedContentRef.current = "";

      try {
        const apiMessages = nextMessages.map((message) => ({
          role: message.role,
          content: message.content
        }));

        await streamParser.fetchStream(
          apiMessages,
          (chunk) => {
            streamedContentRef.current += chunk;
            const updatedMessages = messagesWithAI.map((msg) =>
              msg.id === aiMessage.id
                ? { ...msg, content: streamedContentRef.current }
                : msg
            );
            setMessages(updatedMessages);
            updateSessionMessages(updatedMessages);
          },
          (error) => {
            console.error("Stream error:", error);
            const errorMessages = messagesWithAI.map((msg) =>
              msg.id === aiMessage.id
                ? { ...msg, status: "failed", content: streamedContentRef.current || "生成失败，请重试" }
                : msg
            );
            setMessages(errorMessages);
            updateSessionMessages(errorMessages, { isGenerating: false });
            setIsGenerating(false);
          },
          () => {
            const completedMessages = messagesWithAI.map((msg) =>
              msg.id === aiMessage.id
                ? { ...msg, status: "completed", content: streamedContentRef.current }
                : msg
            );
            setMessages(completedMessages);
            updateSessionMessages(completedMessages, { isGenerating: false });
            setIsGenerating(false);
          }
        );
      } catch (error) {
        console.error("Error:", error);
        const errorMessages = messagesWithAI.map((msg) =>
          msg.id === aiMessage.id
            ? { ...msg, status: "failed", content: "生成失败，请重试" }
            : msg
        );
        setMessages(errorMessages);
        updateSessionMessages(errorMessages, { isGenerating: false });
        setIsGenerating(false);
      }
    },
    [input, isGenerating, messages, updateSessionMessages]
  );

  const handleVoiceTranscript = useCallback(
    (transcript) => {
      setInput(transcript);
      onSent(transcript);
    },
    [onSent]
  );

  const {
    error: voiceError,
    isSupported: isVoiceSupported,
    status: voiceInputStatus,
    toggle: toggleVoiceInput,
    transcript: voiceTranscript
  } = useSpeechRecognition({ onTranscript: handleVoiceTranscript });

  const abortGeneration = useCallback(() => {
    streamParser.abort();
    setIsGenerating(false);
    const updatedMessages = messages.map((message) =>
      message.status === "generating" ? { ...message, status: "aborted" } : message
    );
    setMessages(updatedMessages);
    updateSessionMessages(updatedMessages, { isGenerating: false });
  }, [messages, updateSessionMessages]);

  const handleKeyPress = useCallback(
    (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSent();
      }
    },
    [onSent]
  );

  const contextValue = useMemo(
    () => ({
      abortGeneration,
      createNewSession,
      currentSessionId,
      deleteSession,
      handleKeyPress,
      input,
      isAtBottom,
      isGenerating,
      isVoiceSupported,
      loadSession,
      messages,
      onSent,
      scrollToBottom,
      sessions,
      setInput,
      setIsAtBottom,
      setSessionInput,
      showResult,
      toggleVoiceInput,
      virtuosoRef,
      voiceError,
      voiceInputStatus,
      voiceTranscript
    }),
    [
      abortGeneration,
      createNewSession,
      currentSessionId,
      deleteSession,
      handleKeyPress,
      input,
      isAtBottom,
      isGenerating,
      isVoiceSupported,
      loadSession,
      messages,
      onSent,
      scrollToBottom,
      sessions,
      setSessionInput,
      showResult,
      toggleVoiceInput,
      voiceError,
      voiceInputStatus,
      voiceTranscript
    ]
  );

  return <Context.Provider value={contextValue}>{props.children}</Context.Provider>;
};

export default ContextProvider;
