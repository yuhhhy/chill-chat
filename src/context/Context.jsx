import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessions } from "../hooks/useSessions.js";
import { useChat } from "../hooks/useChat.js";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";
import { useFileAttachment } from "../hooks/useFileAttachment.js";

export const Context = createContext();

const MODEL_PROVIDER_STORAGE_KEY = "chill-chat:model-provider";
const DEFAULT_MODEL_PROVIDER = "deepseek";

const ContextProvider = ({ children }) => {
  const [input, setInput] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [modelProvider, setModelProviderState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_MODEL_PROVIDER;
    return window.localStorage.getItem(MODEL_PROVIDER_STORAGE_KEY) || DEFAULT_MODEL_PROVIDER;
  });
  const virtuosoRef = useRef(null);
  const inputDraftsRef = useRef(new Map()); // sessionId -> draft text
  const prevSessionIdRef = useRef(null);

  const {
    sessions, currentSessionId,
    createNewSession, loadSession, deleteSession, updateSession
  } = useSessions();

  const { messages, isLoadingMessages, isGenerating, send, abortGeneration, regenerate } = useChat({
    currentSessionId,
    modelProvider,
    onSessionUpdated: updateSession
  });

  const { attachedFiles, fileInputRef, openFilePicker, addFiles, removeFile, clearFiles } = useFileAttachment();

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

  const setModelProvider = useCallback((provider) => {
    setModelProviderState(provider);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODEL_PROVIDER_STORAGE_KEY, provider);
    }
  }, []);

  const onSent = useCallback(async (prompt) => {
    if (isGenerating) return;
    const text = (prompt !== undefined ? prompt : input).trim();
    if (!text) return;
    setInput("");
    inputDraftsRef.current.delete(currentSessionId);
    clearFiles();
    setIsAtBottom(true);
    await send(text);
  }, [isGenerating, input, send, currentSessionId, clearFiles]);

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
    addFiles,
    attachedFiles,
    createNewSession,
    currentSessionId,
    deleteSession,
    fileInputRef,
    input,
    isAtBottom,
    isGenerating,
    isLoadingMessages,
    isVoiceSupported,
    loadSession,
    messages,
    modelProvider,
    onSent,
    openFilePicker,
    regenerate,
    removeFile,
    scrollToBottom,
    sessions,
    setInput,
    setIsAtBottom,
    setModelProvider,
    toggleVoiceInput,
    virtuosoRef,
    voiceError,
    voiceInputStatus,
    voiceTranscript
  }), [
    abortGeneration,
    addFiles,
    attachedFiles,
    createNewSession,
    currentSessionId,
    deleteSession,
    fileInputRef,
    input,
    isAtBottom,
    isGenerating,
    isLoadingMessages,
    isVoiceSupported,
    loadSession,
    messages,
    modelProvider,
    onSent,
    openFilePicker,
    regenerate,
    removeFile,
    scrollToBottom,
    sessions,
    setModelProvider,
    toggleVoiceInput,
    voiceError,
    voiceInputStatus,
    voiceTranscript
  ]);

  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
};

export default ContextProvider;
