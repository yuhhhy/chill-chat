import React, { useEffect, useMemo, useRef, useState } from "react";
import MarkdownRenderer from "../MarkdownRenderer/MarkdownRenderer";
import {
  buildSelectionLookupMessages,
  buildSelectionLookupProviders,
  runSelectionLookup
} from "../../services/selectionLookup";

function clampPosition(rect, mode) {
  const margin = 12;
  const width = mode === 'result' ? 340 : 98;
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

const SelectionLookupPopover = ({
  customModels,
  modelNames,
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
  const [panelPosition, setPanelPosition] = useState(null);
  const lookupRef = useRef(null);
  const popoverRef = useRef(null);
  const bodyRef = useRef(null);
  const dragRef = useRef(null);

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
    setPanelPosition(null);
    lookupRef.current?.cancel();
    lookupRef.current = null;
  }, [target.id]);

  useEffect(() => {
    if (mode !== 'button') return undefined;

    const handlePointerDown = (event) => {
      if (popoverRef.current?.contains(event.target)) return;
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [mode, onClose]);

  useEffect(() => {
    return () => {
      lookupRef.current?.cancel();
    };
  }, []);

  const startLookup = () => {
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
    setStatus('loading');
    setContent('');
    setError('');
    setPanelPosition(current => current || clampPosition(target.rect, 'result'));

    const lookup = runSelectionLookup({
      messages: buildSelectionLookupMessages({
        selectedText: target.text,
        assistantMessage: target.assistantContent,
        previousUserMessage: target.previousUserContent
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
        <button type="button" onClick={startLookup}>Ask Chat</button>
      </div>
    );
  }

  return (
    <section
      ref={popoverRef}
      className="selection-lookup-popover selection-lookup-panel"
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
        <span className="selection-lookup-term" title={target.text}>「{target.text}」</span>
        <button type="button" onClick={close} aria-label="关闭选中搜索">×</button>
      </div>
      <div className="selection-lookup-meta">
        {status === 'loading' ? (
          <>
            <LoadingDots />
            <span>正在尝试 {modelNames[activeProvider] || activeProvider || '模型'}</span>
          </>
        ) : status === 'done' ? (
          <span>{modelNames[activeProvider] || activeProvider || '模型'} 已解释</span>
        ) : (
          <span>解释失败</span>
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
          <p className="selection-lookup-placeholder">等待模型返回解释</p>
        )}
      </div>
      {status === 'error' && content && <p className="selection-lookup-error">{error}</p>}
    </section>
  );
};

export default SelectionLookupPopover;
