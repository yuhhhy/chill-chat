import React, { useContext, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { Context } from "../../context/Context";
import MarkdownRenderer from "../MarkdownRenderer/MarkdownRenderer";
import ModelAvatar from "../ModelAvatar/ModelAvatar";

const CopyIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const RegenerateIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 11a8 8 0 0 0-14.1-5.1" />
    <path d="M6 3v4h4" />
    <path d="M4 13a8 8 0 0 0 14.1 5.1" />
    <path d="M18 21v-4h-4" />
  </svg>
);

const TrashIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v5" />
    <path d="M14 11v5" />
  </svg>
);

const MoreIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

const ReasoningPanel = ({ content, isGenerating }) => {
  if (!content) return null;

  return (
    <details className="reasoning-panel" open={isGenerating}>
      <summary>
        <span className="reasoning-chevron" />
        <span>{isGenerating ? "正在思考" : "思考过程"}</span>
      </summary>
      <div className="reasoning-content">
        <MarkdownRenderer content={content} />
      </div>
    </details>
  );
};

const MessageRow = ({ message, isLastAI }) => {
  const { deleteChatMessage, regenerate, isGenerating, modelNames } = useContext(Context);
  const [copied, setCopied] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const messageProvider = message.modelProvider || 'deepseek';
  const isMessageGenerating = message.status === "generating";

  const handleDelete = () => {
    setIsMoreOpen(false);
    deleteChatMessage(message.id);
  };

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
        <div className="user-message-stack">
          <div className="message-content">
            <p>{message.content}</p>
          </div>
          <div className="action-bar user-action-bar">
            <div
              className="more-action"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setIsMoreOpen(false);
                }
              }}
            >
              <button
                type="button"
                className="more-action-button"
                onClick={() => setIsMoreOpen(open => !open)}
                title="更多操作"
                aria-label="更多操作"
                aria-expanded={isMoreOpen}
              >
                <MoreIcon />
              </button>
              {isMoreOpen && (
                <div className="more-action-menu" role="menu">
                  <button type="button" className="more-action-item danger" role="menuitem" onClick={handleDelete}>
                    <TrashIcon />
                    <span>删除</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="message-item ai-message">
      <ModelAvatar provider={messageProvider} className="message-avatar" />
      <div className="message-content">
        <ReasoningPanel
          content={message.reasoningContent}
          isGenerating={isMessageGenerating}
        />
        {isMessageGenerating && !message.content ? (
          <div className="thinking-indicator">
            <div className="thinking-spinner" />
            <span>{message.reasoningContent ? "正在生成回复" : "思考中"}</span>
          </div>
        ) : (
          <div className="markdown-content">
            <MarkdownRenderer content={message.content} />
          </div>
        )}
        {message.status === "aborted" && <p className="message-status aborted">— 已中断</p>}
        {message.status === "failed"  && <p className="message-status failed">生成失败，请重试</p>}
        {!isMessageGenerating && (
          <div className="message-action-block">
            <div className="action-bar">
              <button
                type="button"
                onClick={handleCopy}
                title={copied ? "已复制" : "复制"}
                aria-label={copied ? "已复制" : "复制"}
              >
                <CopyIcon />
              </button>
              {isLastAI && (
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={isGenerating}
                  title="重新生成"
                  aria-label="重新生成"
                >
                  <RegenerateIcon />
                </button>
              )}
              <div
                className="more-action"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setIsMoreOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  className="more-action-button"
                  onClick={() => setIsMoreOpen(open => !open)}
                  title="更多操作"
                  aria-label="更多操作"
                  aria-expanded={isMoreOpen}
                >
                  <MoreIcon />
                </button>
                {isMoreOpen && (
                  <div className="more-action-menu" role="menu">
                    <button type="button" className="more-action-item danger" role="menuitem" onClick={handleDelete}>
                      <TrashIcon />
                      <span>删除</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            {modelNames[messageProvider] && (
              <span className="action-model-name">{modelNames[messageProvider]}</span>
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
