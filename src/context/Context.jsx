import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessions } from "../hooks/useSessions.js";
import { useChat } from "../hooks/useChat.js";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";
import { useFileAttachment } from "../hooks/useFileAttachment.js";

export const Context = createContext();

const MODEL_PROVIDER_STORAGE_KEY = "chill-chat:model-provider";
const THEME_STORAGE_KEY = "chill-chat:theme";
const DEFAULT_MODEL_PROVIDER = "deepseek";
const DEFAULT_THEME = "light";

const ContextProvider = ({ children }) => {
  const [input, setInput] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [modelProvider, setModelProviderState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_MODEL_PROVIDER;
    return window.localStorage.getItem(MODEL_PROVIDER_STORAGE_KEY) || DEFAULT_MODEL_PROVIDER;
  });
  const [theme, setThemeState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    return window.localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
  });
  const [modelNames, setModelNames] = useState({});
  const virtuosoRef = useRef(null);
  const inputDraftsRef = useRef(new Map()); // sessionId -> draft text
  const prevSessionIdRef = useRef(null);

  useEffect(() => {
    fetch('/api/config/models')
      .then(r => r.json())
      .then(setModelNames)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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

  const setTheme = useCallback((nextTheme) => {
    setThemeState(nextTheme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    }
  }, []);

  const onSent = useCallback(async (prompt) => {
    if (isGenerating) return;
    const text = (prompt !== undefined ? prompt : input).trim();
    const readyFiles = attachedFiles.filter(f => !f.loading && !f.error && f.content !== null);
    if (!text && readyFiles.length === 0) return;

    const fileParts = readyFiles
      .map(f => `\n\n--- ${f.file.name} ---\n${f.content}`)
      .join("");
    const fullText = text + fileParts;

    setInput("");
    inputDraftsRef.current.delete(currentSessionId);
    clearFiles();
    setIsAtBottom(true);
    await send(fullText);
  }, [isGenerating, input, attachedFiles, send, currentSessionId, clearFiles]);

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
    modelNames,
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
    setTheme,
    theme,
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
    modelNames,
    modelProvider,
    onSent,
    openFilePicker,
    regenerate,
    removeFile,
    scrollToBottom,
    sessions,
    setModelProvider,
    setTheme,
    theme,
    toggleVoiceInput,
    voiceError,
    voiceInputStatus,
    voiceTranscript
  ]);

  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
};

export default ContextProvider;
