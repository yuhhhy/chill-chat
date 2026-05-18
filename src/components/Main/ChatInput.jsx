import React, { useContext, useEffect, useRef } from "react";
import { assets } from "../../assets/assets";
import { Context } from "../../context/Context";

const PaperclipIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30" fill="none">
    <circle cx="12" cy="12" r="12" fill="#4b90ff" />
    <path d="M12 7v10M8 11l4-4 4 4" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChatInput = () => {
  const {
    abortGeneration,
    addFiles,
    attachedFiles,
    fileInputRef,
    input,
    isGenerating,
    isVoiceSupported,
    onSent,
    openFilePicker,
    removeFile,
    setInput,
    toggleVoiceInput,
    voiceError,
    voiceInputStatus,
    voiceTranscript
  } = useContext(Context);

  const textareaRef = useRef(null);

  // Reset textarea height when input is cleared (after send)
  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input]);

  const handleChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      onSent();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files?.length) {
      addFiles(e.target.files);
    }
  };

  return (
    <div className="main-bottom">
      {attachedFiles.length > 0 && (
        <div className="attachment-preview">
          {attachedFiles.map((file, index) => (
            <div key={index} className="attachment-chip">
              <span className="attachment-chip-name" title={file.name}>{file.name}</span>
              <button
                type="button"
                className="attachment-chip-remove"
                onClick={() => removeFile(index)}
                aria-label={`移除 ${file.name}`}
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
          multiple
          style={{ display: "none" }}
        />
        <textarea
          ref={textareaRef}
          rows={1}
          onChange={handleChange}
          value={voiceInputStatus === "recording" ? voiceTranscript || input : input}
          onKeyDown={handleKeyDown}
          placeholder="在这里输入"
        />
        <div className="search-actions">
          <button
            type="button"
            className="icon-button attachment-button"
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
                width="28"
                height="28"
                style={{ cursor: "pointer", display: "block" }}
              >
                <circle cx="12" cy="12" r="11" fill="none" stroke="#888" strokeWidth="1.8" />
                <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" fill="#888" />
              </svg>
            </span>
            <span className={`action-slot-item ${!isGenerating && input ? "slot-visible" : "slot-hidden"}`}>
              <button
                type="button"
                className="icon-button send-button"
                onClick={() => {
                  if (textareaRef.current) textareaRef.current.style.height = "auto";
                  onSent();
                }}
                title="发送"
              >
                <SendIcon />
              </button>
            </span>
            <span className={`action-slot-item ${!isGenerating && !input ? "slot-visible" : "slot-hidden"}`}>
              <button
                type="button"
                onClick={toggleVoiceInput}
                className={`icon-button mic-button mic-${voiceInputStatus}`}
                title={
                  !isVoiceSupported
                    ? "当前浏览器不支持语音输入"
                    : voiceInputStatus === "recording"
                      ? "结束录音"
                      : "开始语音输入"
                }
                disabled={!isVoiceSupported || voiceInputStatus === "processing"}
              >
                <img src={assets.mic_icon} alt="麦克风图标" className="mic-button-icon" />
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
