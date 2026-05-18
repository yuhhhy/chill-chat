import React, { useContext, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { assets } from "../../assets/assets";
import { Context } from "../../context/Context";
import MarkdownRenderer from "../MarkdownRenderer/MarkdownRenderer";

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const RegenerateIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
  </svg>
);

const MessageRow = ({ message, isLastAI }) => {
  const { regenerate, isGenerating } = useContext(Context);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  if (message.role === "user") {
    return (
      <div className="message-item user-message">
        <div className="message-content">
          <p>{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-item ai-message">
      <img src={assets.deepseek_icon} alt="" className="message-avatar" />
      <div className="message-content">
        {message.status === "generating" && !message.content ? (
          <div className="thinking-indicator">
            <div className="thinking-spinner" />
            <span>思考中</span>
          </div>
        ) : (
          <div className="markdown-content">
            <MarkdownRenderer content={message.content} />
          </div>
        )}
        {message.status === "aborted" && <p className="message-status aborted">— 已中断</p>}
        {message.status === "failed"  && <p className="message-status failed">生成失败，请重试</p>}
        {message.status !== "generating" && (
          <div className="action-bar">
            <button onClick={handleCopy} title="复制">
              <CopyIcon />
              {copied ? "已复制" : "复制"}
            </button>
            {isLastAI && (
              <button onClick={regenerate} disabled={isGenerating} title="重新生成">
                <RegenerateIcon />
                重新生成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const MessageList = () => {
  const { messages, isAtBottom, setIsAtBottom, virtuosoRef } = useContext(Context);
  const lastAiIndex = messages.findLastIndex(m => m.role === "assistant");

  return (
    <div className="result">
      <div className="chat-messages">
        <Virtuoso
          ref={virtuosoRef}
          className="chat-virtuoso"
          data={messages}
          followOutput={isAtBottom ? "auto" : false}
          itemContent={(index, message) => (
            <MessageRow
              key={message.id || index}
              message={message}
              isLastAI={index === lastAiIndex}
            />
          )}
          atBottomStateChange={(bottom) => setIsAtBottom(bottom)}
          overscan={240}
        />
      </div>
    </div>
  );
};

export default MessageList;
