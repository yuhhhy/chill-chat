import React, { useEffect, useMemo, useRef, useState } from "react";
import MarkdownRenderer from "../MarkdownRenderer/MarkdownRenderer";
import {
  buildSelectionLookupMessages,
  buildSelectionLookupProviders,
  runSelectionLookup
} from "../../services/selectionLookup";

function clampPosition(rect, mode) {
  const margin = 12;
  const width = mode === 'result' ? 340 : 84;
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
  target,
  currentProvider
}) => {
  const [mode, setMode] = useState('button');
  const [status, setStatus] = useState('idle');
  const [content, setContent] = useState('');
  const [activeProvider, setActiveProvider] = useState('');
  const [error, setError] = useState('');
  const lookupRef = useRef(null);
  const popoverRef = useRef(null);

  const position = useMemo(() => clampPosition(target.rect, mode), [target.rect, mode]);

  useEffect(() => {
    setMode('button');
    setStatus('idle');
    setContent('');
    setActiveProvider('');
    setError('');
    lookupRef.current?.cancel();
    lookupRef.current = null;
  }, [target.id]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (popoverRef.current?.contains(event.target)) return;
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => () => {
    lookupRef.current?.cancel();
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
      <div className="selection-lookup-header">
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
      <div className="selection-lookup-body">
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
