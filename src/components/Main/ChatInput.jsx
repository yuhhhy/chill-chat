import React, { useCallback, useEffect, useRef } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { useRagStore } from "../../stores/ragStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useFileAttachment, FILE_ACCEPT } from "../../hooks/useFileAttachment";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";

const PaperclipIcon = () => (
  <svg className="input-action-icon attachment-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const MicIcon = () => (
  <svg className="input-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <path d="M12 19v3" />
  </svg>
);

const BookIcon = () => (
  <svg className="input-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.05" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
  </svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30" fill="none">
    <circle cx="12" cy="12" r="12" fill="var(--accent)" />
    <path d="M12 7v10M8 11l4-4 4 4" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </svg>
);

const INPUT_MAX_HEIGHT = 116;

const ChatInput = () => {
  const send = useChatStore(s => s.send);
  const abortGeneration = useChatStore(s => s.abortGeneration);
  const isGenerating = useChatStore(s => s.isGenerating);
  const messages = useChatStore(s => s.messages);
  const input = useUIStore(s => s.input);
  const setInput = useUIStore(s => s.setInput);
  const isAtBottom = useUIStore(s => s.isAtBottom);
  const scrollToBottom = useUIStore(s => s.scrollToBottom);
  const clearInputForSession = useUIStore(s => s.clearInputForSession);
  const ragCollections = useRagStore(s => s.ragCollections);
  const selectedRagCollectionId = useRagStore(s => s.selectedRagCollectionId);
  const setSelectedRagCollectionId = useRagStore(s => s.setSelectedRagCollectionId);
  const currentSessionId = useSessionStore(s => s.currentSessionId);

  const { attachedFiles, fileInputRef, openFilePicker, addFiles, removeFile, clearFiles } = useFileAttachment();

  const handleVoiceTranscript = useCallback((transcript) => {
    const text = transcript.trim();
    if (!text || useChatStore.getState().isGenerating) return;

    clearInputForSession(currentSessionId);
    send(text);
  }, [clearInputForSession, currentSessionId, send]);

  const {
    error: voiceError,
    isSupported: isVoiceSupported,
    status: voiceInputStatus,
    toggle: toggleVoiceInput,
    transcript: voiceTranscript
  } = useSpeechRecognition({ onTranscript: handleVoiceTranscript, sessionId: currentSessionId });

  const textareaRef = useRef(null);

  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input]);

  const handleChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, INPUT_MAX_HEIGHT) + "px";
  };

  const handleSend = useCallback((prompt) => {
    if (isGenerating) return;
    const text = (prompt !== undefined ? prompt : useUIStore.getState().input).trim();
    const readyFiles = attachedFiles.filter(f => !f.loading && !f.error && f.content !== null);
    if (!text && readyFiles.length === 0) return;

    const fileParts = readyFiles.map(f => `\n\n--- ${f.file.name} ---\n${f.content}`).join("");
    const fullText = text + fileParts;

    clearInputForSession(currentSessionId);
    clearFiles();
    send(fullText);
  }, [isGenerating, attachedFiles, clearInputForSession, currentSessionId, clearFiles, send]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      handleSend();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files?.length) addFiles(e.target.files);
  };

  return (
    <div className="main-bottom">
      {messages.length > 0 && !isAtBottom && (
        <button
          type="button"
          className="scroll-to-bottom-button"
          onClick={() => scrollToBottom("smooth", messages.length)}
          aria-label="跳转到底部"
          title="跳转到底部"
        >
          <ArrowDownIcon />
        </button>
      )}
      {attachedFiles.length > 0 && (
        <div className="attachment-preview">
          {attachedFiles.map((entry, index) => (
            <div key={entry.id} className={`attachment-chip${entry.error ? " attachment-chip-error" : ""}`}>
              <span className="attachment-chip-name" title={entry.file.name}>{entry.file.name}</span>
              {entry.loading && <span className="attachment-chip-status">读取中…</span>}
              {!entry.loading && !entry.error && (
                <span className="attachment-chip-status">{entry.content.length} 字符</span>
              )}
              {entry.error && <span className="attachment-chip-status">读取失败</span>}
              <button
                type="button"
                className="attachment-chip-remove"
                onClick={() => removeFile(index)}
                aria-label={`移除 ${entry.file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="search-box">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept={FILE_ACCEPT}
          multiple
          style={{ display: "none" }}
        />
        <textarea
          ref={textareaRef}
          rows={1}
          onChange={handleChange}
          value={voiceInputStatus === "recording" ? voiceTranscript || input : input}
          onKeyDown={handleKeyDown}
          placeholder="给 chillAI 发送消息"
        />
        <div className="search-actions">
          <label
            className={`rag-select ${selectedRagCollectionId ? "active" : "empty"}`}
            title={selectedRagCollectionId ? "当前聊天使用已选择的 RAG 知识库" : "选择 RAG 知识库"}
          >
            <BookIcon />
            <select
              value={selectedRagCollectionId}
              onChange={(event) => setSelectedRagCollectionId(event.target.value)}
              aria-label="选择 RAG 知识库"
            >
              <option value="">无知识库</option>
              {ragCollections.map(collection => (
                <option value={collection.id} key={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="icon-button input-action-button attachment-button"
            onClick={openFilePicker}
            title="添加附件"
          >
            <PaperclipIcon />
          </button>
          <div className="action-slot">
            <span className={`action-slot-item ${isGenerating ? "slot-visible" : "slot-hidden"}`}>
              <svg
                onClick={abortGeneration}
                className="stop-icon"
                title="停止生成"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                style={{ cursor: "pointer", display: "block" }}
              >
                <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" fill="currentColor" />
              </svg>
            </span>
            <span className={`action-slot-item ${!isGenerating && (input || attachedFiles.some(f => !f.loading && !f.error)) ? "slot-visible" : "slot-hidden"}`}>
              <button
                type="button"
                className="icon-button send-button"
                onClick={() => {
                  if (textareaRef.current) textareaRef.current.style.height = "auto";
                  handleSend();
                }}
                title="发送"
              >
                <SendIcon />
              </button>
            </span>
            <span className={`action-slot-item ${!isGenerating && !input && !attachedFiles.some(f => !f.loading && !f.error) ? "slot-visible" : "slot-hidden"}`}>
              <button
                type="button"
                onClick={toggleVoiceInput}
                className={`icon-button input-action-button mic-button mic-${voiceInputStatus}`}
                title={
                  !isVoiceSupported
                    ? "当前浏览器不支持语音输入"
                    : voiceInputStatus === "recording"
                      ? "结束录音"
                      : "开始语音输入"
                }
                disabled={!isVoiceSupported || voiceInputStatus === "processing"}
              >
                <MicIcon />
              </button>
            </span>
          </div>
        </div>
      </div>
      {(voiceInputStatus !== "idle" || voiceError) && (
        <div className="voice-status-bar">
          <span className={`voice-status-chip ${voiceInputStatus}`}>
            {voiceInputStatus === "recording"
              ? "录音中"
              : voiceInputStatus === "processing"
                ? "识别中"
                : "语音输入"}
          </span>
          <p>{voiceError || (voiceInputStatus === "recording" ? "请开始说话，点击麦克风结束录音。" : "正在处理语音内容…")}</p>
        </div>
      )}
    </div>
  );
};

export default ChatInput;
