import React, { useContext } from "react";
import { assets } from "../../assets/assets";
import { Context } from "../../context/Context";

const ChatInput = () => {
  const {
    abortGeneration,
    input,
    isGenerating,
    isVoiceSupported,
    onSent,
    setInput,
    toggleVoiceInput,
    voiceError,
    voiceInputStatus,
    voiceTranscript
  } = useContext(Context);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSent();
    }
  };

  return (
    <div className="main-bottom">
      <div className="search-box">
        <input
          onChange={(e) => setInput(e.target.value)}
          value={voiceInputStatus === "recording" ? voiceTranscript || input : input}
          type="text"
          onKeyDown={handleKeyDown}
          placeholder="在这里输入"
        />
        <div className="search-actions">
          <img src={assets.gallery_icon} alt="" />
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
          {isGenerating ? (
            <svg
              onClick={abortGeneration}
              className="stop-icon"
              title="停止生成"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              style={{ cursor: "pointer", flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="11" fill="none" stroke="#555" strokeWidth="1.8" />
              <rect x="8" y="8" width="8" height="8" rx="1.5" fill="#555" />
            </svg>
          ) : input ? (
            <img onClick={() => onSent()} src={assets.send_icon} alt="" />
          ) : null}
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
