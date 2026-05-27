import React, { useCallback, useEffect, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import MarkdownRenderer from "../MarkdownRenderer/MarkdownRenderer";
import ModelAvatar from "../ModelAvatar/ModelAvatar";
import MoreActionMenu from "../MoreActionMenu/MoreActionMenu";
import SelectionLookupPopover from "./SelectionLookupPopover";

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

const THINKING_STATUS_INTERVAL_MS = 4400;

const thinkingStatusMessages = [
  "思考中",
  "少女祈祷中",
  "正在烧高香，祈求 GPU 不过热",
  "AI 正在抽卡",
  "正在与服务器搏斗",
  "正在翻越防火长城",
  "向量空间迷路中",
  "Token 正在排队",
  "正在打开次元裂缝",
];

const getRandomThinkingStatusIndex = (excludedIndex = -1) => {
  if (thinkingStatusMessages.length <= 1) return 0;

  let nextIndex = excludedIndex;
  while (nextIndex === excludedIndex) {
    nextIndex = Math.floor(Math.random() * thinkingStatusMessages.length);
  }

  return nextIndex;
};

const RotatingThinkingStatus = () => {
  const [messageIndex, setMessageIndex] = useState(() => getRandomThinkingStatusIndex());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => getRandomThinkingStatusIndex(current));
    }, THINKING_STATUS_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return <span className="thinking-status-text">{thinkingStatusMessages[messageIndex]}</span>;
};

const ReasoningPanel = ({ content, hasResponseContent, isGenerating }) => {
  const [isOpen, setIsOpen] = useState(() => isGenerating && !hasResponseContent);
  const hadResponseContent = useRef(hasResponseContent);

  useEffect(() => {
    if (!content) return;

    if (isGenerating && !hasResponseContent) {
      setIsOpen(true);
    }

    if (!hadResponseContent.current && hasResponseContent) {
      setIsOpen(false);
    }

    hadResponseContent.current = hasResponseContent;
  }, [content, hasResponseContent, isGenerating]);

  if (!content) return null;
  return (
    <details
      className="reasoning-panel"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
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

function getSelectionRect(range) {
  const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
  const rect = rects[rects.length - 1] || range.getBoundingClientRect();
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
}

const MessageRow = React.memo(({ message, isLastAI, onSelectionLookup, previousUserContent }) => {
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
  const markdownRef = useRef(null);
  const messageProvider = message.modelProvider || 'deepseek';
  const isMessageGenerating = message.status === "generating";
  const citationOrders = (message.sources || []).map((source, index) => Number(source.order || index + 1));

  const handleSelectionLookup = () => {
    if (isEditing || !markdownRef.current) return;

    window.setTimeout(() => {
      const selection = window.getSelection?.();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      if (!anchorNode || !focusNode || !markdownRef.current) return;
      if (!markdownRef.current.contains(anchorNode) || !markdownRef.current.contains(focusNode)) return;

      const range = selection.getRangeAt(0);
      if (!markdownRef.current.contains(range.commonAncestorContainer)) return;

      const text = selection.toString().trim().replace(/\s+/g, ' ');
      if (!text) return;

      onSelectionLookup({
        id: `${message.id}:${Date.now()}`,
        assistantContent: message.content,
        previousUserContent,
        rect: getSelectionRect(range),
        text
      });
    }, 0);
  };

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
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (!isSavingEdit && !isGenerating && editText.trim()) handleSaveEdit();
                    }
                  }}
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
        <ReasoningPanel
          content={message.reasoningContent}
          hasResponseContent={Boolean(message.content)}
          isGenerating={isMessageGenerating}
        />
        {isEditing ? (
          <div className="message-edit-form">
            <textarea
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!isSavingEdit && editText.trim()) handleSaveEdit();
                }
              }}
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
            {message.reasoningContent ? <span>正在生成回复</span> : <RotatingThinkingStatus />}
          </div>
        ) : (
          <div
            className="markdown-content"
            ref={markdownRef}
            onMouseUp={handleSelectionLookup}
            onKeyUp={handleSelectionLookup}
          >
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
}, (prev, next) => (
  prev.message === next.message
  && prev.isLastAI === next.isLastAI
  && prev.previousUserContent === next.previousUserContent
));

function getPreviousUserContent(messages, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return messages[i].content || '';
  }
  return '';
}

const MessageList = () => {
  const messages = useChatStore(s => s.messages);
  const setIsAtBottom = useUIStore(s => s.setIsAtBottom);
  const virtuosoRef = useUIStore(s => s.virtuosoRef);
  const currentProvider = useSettingsStore(s => s.modelProvider);
  const customModels = useSettingsStore(s => s.customModels);
  const modelNames = useSettingsStore(s => s.modelNames);
  const [lookupTargets, setLookupTargets] = useState([]);
  const lastAiIndex = messages.findLastIndex(m => m.role === "assistant");

  const handleSelectionLookup = useCallback((target) => {
    setLookupTargets(current => [
      ...current.filter(item => item.mode !== 'button'),
      { ...target, mode: 'button' }
    ]);
  }, []);

  const closeSelectionLookup = useCallback((targetId) => {
    setLookupTargets(current => current.filter(target => target.id !== targetId));
  }, []);

  const markSelectionLookupActive = useCallback((targetId) => {
    setLookupTargets(current => current.map(target =>
      target.id === targetId ? { ...target, mode: 'result' } : target
    ));
  }, []);

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
              onSelectionLookup={handleSelectionLookup}
              previousUserContent={getPreviousUserContent(messages, index)}
            />
          )}
          atBottomStateChange={(bottom) => setIsAtBottom(bottom)}
          overscan={240}
        />
      </div>
      {lookupTargets.map((lookupTarget) => (
        <SelectionLookupPopover
          key={lookupTarget.id}
          currentProvider={currentProvider}
          customModels={customModels}
          modelNames={modelNames}
          onClose={() => closeSelectionLookup(lookupTarget.id)}
          onActivate={() => markSelectionLookupActive(lookupTarget.id)}
          onRecursiveLookup={handleSelectionLookup}
          target={lookupTarget}
        />
      ))}
    </div>
  );
};

export default MessageList;
