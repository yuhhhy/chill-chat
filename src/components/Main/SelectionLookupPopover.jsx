import React, { useEffect, useMemo, useRef, useState } from "react";
import MarkdownRenderer from "../MarkdownRenderer/MarkdownRenderer";
import {
  buildSelectionLookupMessages,
  buildSelectionLookupProviders,
  runSelectionLookup
} from "../../services/selectionLookup";

function clampPosition(rect, mode) {
  const margin = 12;
  const width = mode === 'result' ? 340 : 260;
  const height = mode === 'result' ? 190 : 42;
  const preferredLeft = rect.right + 8;
  const preferredTop = rect.bottom + 8;
  const left = preferredLeft + width > window.innerWidth - margin
    ? Math.max(margin, rect.right - width)
    : Math.max(margin, preferredLeft);
  const top = preferredTop + height > window.innerHeight - margin
    ? Math.max(margin, rect.bottom - height)
    : Math.max(margin, preferredTop);

  return { left, top };
}

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

function clampPanelPosition(left, top, panel) {
  const margin = 8;
  const rect = panel.getBoundingClientRect();
  return {
    left: Math.min(Math.max(left, margin), Math.max(margin, window.innerWidth - rect.width - margin)),
    top: Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - rect.height - margin))
  };
}

const LoadingDots = () => (
  <span className="selection-lookup-dots" aria-hidden="true">
    <span />
    <span />
    <span />
  </span>
);

const PinIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14.5 3.5 20.5 9.5 18.4 11.6 16.8 10 13 13.8V18L11.8 19.2 8.2 15.6 4 19.8 3.2 19 7.4 14.8 3.8 11.2 5 10H9.2L13 6.2 11.4 4.6 14.5 3.5Z" />
  </svg>
);

const SelectionLookupPopover = ({
  customModels,
  modelNames,
  onActivate,
  onClose,
  onRecursiveLookup,
  target,
  currentProvider
}) => {
  const [mode, setMode] = useState('button');
  const [status, setStatus] = useState('idle');
  const [content, setContent] = useState('');
  const [activeProvider, setActiveProvider] = useState('');
  const [error, setError] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [userPrompt, setUserPrompt] = useState('');
  const [intent, setIntent] = useState(target.intent || 'explain');
  const [panelPosition, setPanelPosition] = useState(null);
  const lookupRef = useRef(null);
  const popoverRef = useRef(null);
  const bodyRef = useRef(null);
  const dragRef = useRef(null);
  const startLookupRef = useRef(null);

  const position = useMemo(() => {
    if (mode === 'result' && panelPosition) return panelPosition;
    return clampPosition(target.rect, mode);
  }, [target.rect, mode, panelPosition]);

  useEffect(() => {
    setMode('button');
    setStatus('idle');
    setContent('');
    setActiveProvider('');
    setError('');
    setIsPinned(false);
    setUserPrompt('');
    setIntent(target.intent || 'explain');
    setPanelPosition(null);
    lookupRef.current?.cancel();
    lookupRef.current = null;
  }, [target.id]);

  useEffect(() => {
    if (mode !== 'button' && (mode !== 'result' || isPinned)) return undefined;

    const handlePointerDown = (event) => {
      if (popoverRef.current?.contains(event.target)) return;
      window.getSelection?.()?.removeAllRanges();
      onClose();
    };

    const handleKeyDown = (event) => {
      if (event.isComposing) return;
      const eventTarget = event.target;
      const isInteractive = (
        eventTarget.tagName === 'INPUT' ||
        eventTarget.tagName === 'TEXTAREA' ||
        eventTarget.contentEditable === 'true'
      );
      if (event.key === 'Enter') {
        const isOtherInteractive = !popoverRef.current?.contains(eventTarget) && isInteractive;
        if (isOtherInteractive) return;
        event.preventDefault();
        startLookupRef.current?.('explain');
        return;
      }
      if (event.key.toLowerCase() === 't' && mode === 'button') {
        if (isInteractive) return;
        event.preventDefault();
        startLookupRef.current?.('translate');
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPinned, mode, onClose]);

  useEffect(() => {
    return () => {
      lookupRef.current?.cancel();
    };
  }, []);

  const startLookup = (nextIntent = 'explain') => {
    window.getSelection?.()?.removeAllRanges();
    setIntent(nextIntent);
    const providers = buildSelectionLookupProviders({
      currentProvider,
      customModels,
      modelNames
    });

    if (!providers.length) {
      setMode('result');
      setStatus('error');
      setError('没有可用模型');
      return;
    }

    lookupRef.current?.cancel();
    setMode('result');
    onActivate?.();
    setStatus('loading');
    setContent('');
    setError('');
    setPanelPosition(current => current || clampPosition(target.rect, 'result'));

    const lookup = runSelectionLookup({
      messages: buildSelectionLookupMessages({
        selectedText: target.text,
        assistantMessage: target.assistantContent,
        previousUserMessage: target.previousUserContent,
        userPrompt: nextIntent === 'translate' ? '' : userPrompt,
        intent: nextIntent
      }),
      providers,
      onAttempt: (provider) => {
        setActiveProvider(provider);
        setContent('');
      },
      onChunk: (chunk) => {
        setContent(current => current + chunk);
      }
    });

    lookupRef.current = lookup;
    lookup.promise
      .then(() => {
        setStatus('done');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setStatus('error');
        setError(err.message || '解释失败');
      })
      .finally(() => {
        if (lookupRef.current === lookup) lookupRef.current = null;
      });
  };
  startLookupRef.current = startLookup;

  const close = () => {
    lookupRef.current?.cancel();
    lookupRef.current = null;
    onClose();
  };

  const handleHeaderPointerDown = (event) => {
    if (event.target.closest('button') || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    popoverRef.current.classList.add('dragging');
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleHeaderPointerMove = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId || !popoverRef.current) return;
    const next = clampPanelPosition(
      event.clientX - dragRef.current.offsetX,
      event.clientY - dragRef.current.offsetY,
      popoverRef.current
    );
    setPanelPosition(next);
  };

  const endHeaderDrag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    popoverRef.current?.classList.remove('dragging');
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
  };

  const handleBodySelection = () => {
    window.setTimeout(() => {
      const selection = window.getSelection?.();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !bodyRef.current) return;
      if (!bodyRef.current.contains(selection.anchorNode) || !bodyRef.current.contains(selection.focusNode)) return;

      const text = selection.toString().trim().replace(/\s+/g, ' ');
      if (!text) return;

      const range = selection.getRangeAt(0);
      onRecursiveLookup?.({
        id: `selection-lookup-recursive:${Date.now()}`,
        assistantContent: content,
        previousUserContent: '用户在上一层 Ask Chat 回答中选中了文本',
        rect: getSelectionRect(range),
        text
      });
    }, 0);
  };

  if (mode === 'button') {
    return (
      <div
        ref={popoverRef}
        className="selection-lookup-popover selection-lookup-trigger"
        style={{ left: position.left, top: position.top }}
      >
        <button type="button" onClick={() => startLookup('explain')}>Ask Chat</button>
        <input
          type="text"
          value={userPrompt}
          onChange={(event) => setUserPrompt(event.target.value)}
          placeholder="Ask more..."
          aria-label="Ask Chat 自定义提示词"
        />
      </div>
    );
  }

  return (
    <section
      ref={popoverRef}
      className={`selection-lookup-popover selection-lookup-panel${isPinned ? ' pinned' : ''}`}
      style={{ left: position.left, top: position.top }}
      aria-live="polite"
    >
      <div
        className="selection-lookup-header"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={endHeaderDrag}
        onPointerCancel={endHeaderDrag}
      >
        <button
          type="button"
          className="selection-lookup-pin"
          onClick={() => setIsPinned(pinned => !pinned)}
          aria-label={isPinned ? '取消钉住 Ask Chat 弹窗' : '钉住 Ask Chat 弹窗'}
          aria-pressed={isPinned}
          title={isPinned ? '取消钉住' : '钉住'}
        >
          <PinIcon />
        </button>
        <div className="selection-lookup-header-text">
          <span className="selection-lookup-term" title={target.text}>「{target.text}」</span>
          {userPrompt && <span className="selection-lookup-user-prompt" title={userPrompt}>{userPrompt}</span>}
        </div>
        <button type="button" onClick={close} aria-label="关闭选中搜索">×</button>
      </div>
      <div className="selection-lookup-meta">
        {status === 'loading' ? (
          <>
            <LoadingDots />
            <span>{intent === 'translate' ? '正在翻译' : '正在尝试'} {modelNames[activeProvider] || activeProvider || '模型'}</span>
          </>
        ) : status === 'done' ? (
          <span>{modelNames[activeProvider] || activeProvider || '模型'} {intent === 'translate' ? '已翻译' : '已解释'}</span>
        ) : (
          <span>{intent === 'translate' ? '翻译失败' : '解释失败'}</span>
        )}
      </div>
      <div
        className="selection-lookup-body"
        ref={bodyRef}
        onMouseUp={handleBodySelection}
        onKeyUp={handleBodySelection}
      >
        {content ? (
          <MarkdownRenderer content={content} />
        ) : status === 'error' ? (
          <p className="selection-lookup-error">{error}</p>
        ) : (
          <p className="selection-lookup-placeholder">等待模型返回{intent === 'translate' ? '翻译' : '解释'}</p>
        )}
      </div>
      {status === 'error' && content && <p className="selection-lookup-error">{error}</p>}
    </section>
  );
};

export default SelectionLookupPopover;
