import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessions } from "../hooks/useSessions.js";
import { useChat } from "../hooks/useChat.js";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";

export const Context = createContext();

const ContextProvider = ({ children }) => {
  const [input, setInput] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  const virtuosoRef = useRef(null);
  const inputDraftsRef = useRef(new Map()); // sessionId -> draft text
  const prevSessionIdRef = useRef(null);

  const {
    sessions, currentSessionId,
    createNewSession, loadSession, deleteSession, updateSession
  } = useSessions();

  const { messages, isLoadingMessages, isGenerating, send, abortGeneration } = useChat({
    currentSessionId,
    onSessionUpdated: updateSession
  });

  // On session switch: save draft for the session we're leaving, restore draft for the new one
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = currentSessionId;
    if (prev !== null) {
      inputDraftsRef.current.set(prev, input);
    }
    setInput(inputDraftsRef.current.get(currentSessionId) ?? "");
    setIsAtBottom(true);
  }, [currentSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const text = (prompt !== undefined ? prompt : input).trim();
    if (!text) return;
    setInput("");
    inputDraftsRef.current.delete(currentSessionId);
    setIsAtBottom(true);
    await send(text);
  }, [isGenerating, input, send, currentSessionId]);

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

  const contextValue = useMemo(() => ({
    abortGeneration,
    createNewSession,
    currentSessionId,
    deleteSession,
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
    toggleVoiceInput,
    voiceError,
    voiceInputStatus,
    voiceTranscript
  ]);

  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
};

export default ContextProvider;
