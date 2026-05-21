import React, { useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import MarkdownRenderer from "../MarkdownRenderer/MarkdownRenderer";
import ModelAvatar from "../ModelAvatar/ModelAvatar";
import MoreActionMenu from "../MoreActionMenu/MoreActionMenu";

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

const SourcePanel = ({ expandedSources, onToggleSource, retrievalStatus, showAllSources, sourceRefs, sources = [], toggleShowAllSources }) => {
  if (!sources.length) {
    if (retrievalStatus !== 'empty') return null;
    return (
      <div className="source-panel source-panel-empty" aria-label="引用来源">
        当前知识库未命中可靠片段
      </div>
    );
  }

  const visibleSources = showAllSources ? sources : sources.slice(0, 3);
  const hiddenCount = Math.max(0, sources.length - visibleSources.length);

  return (
    <div className="source-panel" aria-label="引用来源">
      <div className="source-status">已检索到 {sources.length} 条来源</div>
      {visibleSources.map((source, index) => (
        <details
          className="source-chip"
          key={source.id || source.chunkId || index}
          open={expandedSources.has(source.order || index + 1)}
          ref={(node) => {
            if (node) sourceRefs.current.set(source.order || index + 1, node);
            else sourceRefs.current.delete(source.order || index + 1);
          }}
          onToggle={(event) => onToggleSource(source.order || index + 1, event.currentTarget.open)}
        >
          <summary>
            <span className="source-number">[{source.order || index + 1}]</span>
            <span className="source-name" title={source.documentName}>{source.documentName}</span>
            <span className="source-chunk">chunk {(source.chunkIndex ?? 0) + 1}</span>
            <span className="source-score">匹配度 {(source.score || 0).toFixed(3)}</span>
          </summary>
          {source.content && source.content !== source.excerpt ? (
            <pre className="source-full-content">{source.content}</pre>
          ) : (
            <p>{source.excerpt}</p>
          )}
        </details>
      ))}
      {hiddenCount > 0 || showAllSources ? (
        <button type="button" className="source-toggle" onClick={toggleShowAllSources}>
          {showAllSources ? '收起来源' : '展开全部'}
        </button>
      ) : null}
    </div>
  );
};

const MessageRow = ({ message, isLastAI }) => {
  const deleteChatMessage = useChatStore(s => s.deleteChatMessage);
  const regenerate = useChatStore(s => s.regenerate);
  const isGenerating = useChatStore(s => s.isGenerating);
  const sendEditedUserMessage = useChatStore(s => s.sendEditedUserMessage);
  const updateChatMessage = useChatStore(s => s.updateChatMessage);
  const modelNames = useSettingsStore(s => s.modelNames);

  const [copied, setCopied] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [isEditing, setIsEditing] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [expandedSources, setExpandedSources] = useState(() => new Set());
  const [showAllSources, setShowAllSources] = useState(false);
  const sourceRefs = useRef(new Map());
  const messageProvider = message.modelProvider || 'deepseek';
  const isMessageGenerating = message.status === "generating";
  const citationOrders = (message.sources || []).map((source, index) => Number(source.order || index + 1));

  const handleToggleSource = (order, isOpen) => {
    setExpandedSources((current) => {
      const next = new Set(current);
      if (isOpen) next.add(order);
      else next.delete(order);
      return next;
    });
  };

  const handleCitationClick = (order) => {
    const index = citationOrders.indexOf(order);
    if (index >= 3) setShowAllSources(true);
    setExpandedSources((current) => new Set(current).add(order));
    window.setTimeout(() => {
      sourceRefs.current.get(order)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  };

  const startEditing = () => {
    setEditText(message.content);
    setIsEditing(true);
    setIsMoreOpen(false);
  };

  const cancelEditing = () => {
    setEditText(message.content);
    setIsEditing(false);
  };

  const handleDelete = () => {
    setIsMoreOpen(false);
    deleteChatMessage(message.id);
  };

  const handleSaveEdit = async () => {
    const nextContent = editText;
    if (!nextContent.trim()) {
      setIsEditing(false);
      setEditText(message.content);
      return;
    }
    if (message.role !== "user" && nextContent === message.content) {
      setIsEditing(false);
      setEditText(message.content);
      return;
    }

    setIsSavingEdit(true);
    try {
      if (message.role === "user") {
        setIsEditing(false);
        await sendEditedUserMessage(message.id, nextContent);
      } else {
        await updateChatMessage(message.id, nextContent);
        setIsEditing(false);
      }
    } catch {
      setEditText(message.content);
      setIsEditing(true);
    } finally {
      setIsSavingEdit(false);
    }
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
        <div className={`user-message-stack${isEditing ? " editing" : ""}`}>
          <div className={`message-content${isEditing ? " editing" : ""}`}>
            {isEditing ? (
              <div className="message-edit-form">
                <textarea
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                  autoFocus
                  rows={Math.min(Math.max(editText.split('\n').length, 2), 8)}
                />
                <div className="message-edit-actions">
                  <button type="button" onClick={cancelEditing} disabled={isSavingEdit}>取消</button>
                  <button type="button" className="primary" onClick={handleSaveEdit} disabled={isSavingEdit || isGenerating || !editText.trim()}>
                    发送
                  </button>
                </div>
              </div>
            ) : (
              <p>{message.content}</p>
            )}
          </div>
          {!isEditing && <div className="action-bar user-action-bar">
            <MoreActionMenu
              align="right"
              isOpen={isMoreOpen}
              onClose={() => setIsMoreOpen(false)}
              onDelete={handleDelete}
              onEdit={startEditing}
              onToggle={() => setIsMoreOpen(open => !open)}
            />
          </div>}
        </div>
      </div>
    );
  }

  return (
    <div className="message-item ai-message">
      <ModelAvatar provider={messageProvider} className="message-avatar" />
      <div className={`message-content${isEditing ? " editing" : ""}`}>
        <ReasoningPanel content={message.reasoningContent} isGenerating={isMessageGenerating} />
        {isEditing ? (
          <div className="message-edit-form">
            <textarea
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              autoFocus
              rows={Math.min(Math.max(editText.split('\n').length, 3), 12)}
            />
            <div className="message-edit-actions">
              <button type="button" onClick={cancelEditing} disabled={isSavingEdit}>取消</button>
              <button type="button" className="primary" onClick={handleSaveEdit} disabled={isSavingEdit || !editText.trim()}>
                保存
              </button>
            </div>
          </div>
        ) : isMessageGenerating && !message.content ? (
          <div className="thinking-indicator">
            <div className="thinking-spinner" />
            <span>{message.reasoningContent ? "正在生成回复" : "思考中"}</span>
          </div>
        ) : (
          <div className="markdown-content">
            <MarkdownRenderer
              citationOrders={citationOrders}
              content={message.content}
              onCitationClick={handleCitationClick}
            />
          </div>
        )}
        {!isEditing && (
          <SourcePanel
            expandedSources={expandedSources}
            onToggleSource={handleToggleSource}
            retrievalStatus={message.ragStatus}
            showAllSources={showAllSources}
            sourceRefs={sourceRefs}
            sources={message.sources}
            toggleShowAllSources={() => setShowAllSources(open => !open)}
          />
        )}
        {message.status === "aborted" && (
          <div className="message-status aborted" role="status">已中断</div>
        )}
        {message.status === "failed" && <p className="message-status failed">生成失败，请重试</p>}
        {!isMessageGenerating && !isEditing && (
          <div className="action-bar">
            <button type="button" onClick={handleCopy} title={copied ? "已复制" : "复制"} aria-label={copied ? "已复制" : "复制"}>
              <CopyIcon />
            </button>
            {isLastAI && (
              <button type="button" onClick={regenerate} disabled={isGenerating} title="重新生成" aria-label="重新生成">
                <RegenerateIcon />
              </button>
            )}
            <MoreActionMenu
              isOpen={isMoreOpen}
              onClose={() => setIsMoreOpen(false)}
              onDelete={handleDelete}
              onEdit={startEditing}
              onToggle={() => setIsMoreOpen(open => !open)}
            />
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
  const messages = useChatStore(s => s.messages);
  const setIsAtBottom = useUIStore(s => s.setIsAtBottom);
  const virtuosoRef = useUIStore(s => s.virtuosoRef);
  const lastAiIndex = messages.findLastIndex(m => m.role === "assistant");

  return (
    <div className="result">
      <div className="chat-messages">
        <Virtuoso
          ref={virtuosoRef}
          className="chat-virtuoso"
          data={messages}
          followOutput={(atBottom) => atBottom ? "auto" : false}
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
