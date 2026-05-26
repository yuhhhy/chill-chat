const ASK_CHAT_ROOT_ID = 'ask-chat-selection-root';
const MAX_CONTEXT_CHARS = 5000;
const MAX_LOCAL_CONTEXT_CHARS = 1800;
const MAX_PAGE_CONTEXT_CHARS = 2600;

let currentTarget = null;
let currentRequestId = '';
let root = null;
let panelPosition = null;
let dragState = null;

function ensureRoot() {
  if (root) return root;
  root = document.createElement('div');
  root.id = ASK_CHAT_ROOT_ID;
  document.documentElement.appendChild(root);
  return root;
}

function isInsideAskChat(node) {
  return Boolean(node && ensureRoot().contains(node));
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

function clampPosition(rect, mode) {
  const margin = 12;
  const width = mode === 'panel' ? 360 : 98;
  const height = mode === 'panel' ? 220 : 42;
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

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function getMetaDescription() {
  return document.querySelector('meta[name="description"], meta[property="og:description"]')?.content || '';
}

function getElementText(element) {
  return normalizeText(element?.innerText || element?.textContent || '');
}

function getBlockElement(node) {
  return node?.parentElement?.closest('p, li, blockquote, td, th, pre, article, section, main, div') || document.body;
}

function getNearestHeading(element) {
  let current = element;
  while (current && current !== document.body) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (/^H[1-6]$/.test(sibling.tagName)) return getElementText(sibling);
      const heading = sibling.querySelector?.('h1, h2, h3, h4, h5, h6');
      if (heading) return getElementText(heading);
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }

  const visibleHeadings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map(getElementText)
    .filter(Boolean);
  return visibleHeadings.slice(0, 3).join(' / ');
}

function getMainText() {
  const candidates = [
    document.querySelector('article'),
    document.querySelector('main'),
    document.querySelector('[role="main"]'),
    document.body
  ].filter(Boolean);

  let best = '';
  for (const candidate of candidates) {
    const text = getElementText(candidate);
    if (text.length > best.length) best = text;
  }
  return best;
}

function windowAroundSelection(text, selectedText, maxChars) {
  if (text.length <= maxChars) return text;

  const index = text.indexOf(selectedText);
  if (index === -1) return text.slice(0, MAX_CONTEXT_CHARS);

  const half = Math.floor((maxChars - selectedText.length) / 2);
  const start = Math.max(0, index - half);
  return text.slice(start, start + maxChars);
}

function getSurroundingText(selection) {
  const selectedText = normalizeText(selection.toString());
  const block = getBlockElement(selection.anchorNode);
  const localText = windowAroundSelection(getElementText(block), selectedText, MAX_LOCAL_CONTEXT_CHARS);
  const pageText = windowAroundSelection(getMainText(), selectedText, MAX_PAGE_CONTEXT_CHARS);
  const contextParts = [
    getMetaDescription() && `页面摘要：${getMetaDescription()}`,
    getNearestHeading(block) && `附近标题：${getNearestHeading(block)}`,
    localText && `选区所在段落/区块：${localText}`,
    pageText && `页面正文相关片段：${pageText}`
  ].filter(Boolean);

  return contextParts.join('\n\n').slice(0, MAX_CONTEXT_CHARS);
}

function closePopover() {
  currentTarget = null;
  currentRequestId = '';
  panelPosition = null;
  dragState = null;
  ensureRoot().innerHTML = '';
}

function renderButton(target) {
  const host = ensureRoot();
  const position = clampPosition(target.rect, 'button');
  host.innerHTML = `
    <div class="ask-chat-popover ask-chat-trigger" style="left:${position.left}px;top:${position.top}px">
      <button type="button">Ask Chat</button>
    </div>
  `;
  host.querySelector('button')?.addEventListener('click', () => startLookup(target));
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPanel(target, { status = 'loading', content = '', error = '' } = {}) {
  const host = ensureRoot();
  const position = panelPosition || clampPosition(target.rect, 'panel');
  panelPosition = position;
  const body = content
    ? escapeHtml(content).replace(/\n/g, '<br>')
    : status === 'error'
      ? `<span class="ask-chat-error">${escapeHtml(error)}</span>`
      : '<span class="ask-chat-muted">等待模型返回解释</span>';

  host.innerHTML = `
    <section class="ask-chat-popover ask-chat-panel" style="left:${position.left}px;top:${position.top}px">
      <div class="ask-chat-header">
        <span title="${escapeHtml(target.text)}">「${escapeHtml(target.text)}」</span>
        <button type="button" aria-label="Close">×</button>
      </div>
      <div class="ask-chat-meta">${status === 'loading' ? '正在询问模型' : status === 'error' ? '解释失败' : 'Ask Chat'}</div>
      <div class="ask-chat-body">${body}</div>
    </section>
  `;
  host.querySelector('.ask-chat-header button')?.addEventListener('click', closePopover);
  attachPanelDrag();
}

function clampPanelPosition(left, top, panel) {
  const margin = 8;
  const rect = panel.getBoundingClientRect();
  return {
    left: Math.min(Math.max(left, margin), Math.max(margin, window.innerWidth - rect.width - margin)),
    top: Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - rect.height - margin))
  };
}

function attachPanelDrag() {
  const panel = ensureRoot().querySelector('.ask-chat-panel');
  const header = ensureRoot().querySelector('.ask-chat-header');
  if (!panel || !header) return;

  header.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    header.setPointerCapture(event.pointerId);
    panel.classList.add('dragging');
    event.preventDefault();
  });

  header.addEventListener('pointermove', (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const next = clampPanelPosition(
      event.clientX - dragState.offsetX,
      event.clientY - dragState.offsetY,
      panel
    );
    panelPosition = next;
    panel.style.left = `${next.left}px`;
    panel.style.top = `${next.top}px`;
  });

  const endDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragState = null;
    panel.classList.remove('dragging');
    try {
      header.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
  };

  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);
}

async function startLookup(target) {
  const requestId = crypto.randomUUID();
  currentRequestId = requestId;
  renderPanel(target, { status: 'loading' });

  const response = await chrome.runtime.sendMessage({
    type: 'ASK_CHAT_EXPLAIN',
    payload: {
      requestId,
      selectedText: target.text,
      surroundingText: target.surroundingText,
      pageTitle: document.title,
      pageUrl: location.href
    }
  });

  if (currentRequestId !== requestId) return;
  if (!response?.ok) {
    renderPanel(target, { status: 'error', error: response?.error || '解释失败' });
    return;
  }
  renderPanel(target, { status: 'done', content: response.data?.content || '' });
}

function handleSelection() {
  window.setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    if (isInsideAskChat(selection.anchorNode) || isInsideAskChat(selection.focusNode)) return;

    const text = selection.toString().trim().replace(/\s+/g, ' ');
    if (!text) return;

    const range = selection.getRangeAt(0);
    currentTarget = {
      rect: getSelectionRect(range),
      surroundingText: getSurroundingText(selection),
      text
    };
    renderButton(currentTarget);
  }, 0);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'ASK_CHAT_DELTA') return;
  if (message.requestId !== currentRequestId || !currentTarget) return;

  const body = ensureRoot().querySelector('.ask-chat-body');
  if (!body) return;
  const current = body.dataset.content || '';
  const next = current + (message.chunk || '');
  body.dataset.content = next;
  body.innerHTML = escapeHtml(next).replace(/\n/g, '<br>');
});

document.addEventListener('mouseup', (event) => {
  if (isInsideAskChat(event.target)) return;
  handleSelection();
});

document.addEventListener('keyup', handleSelection);
document.addEventListener('pointerdown', (event) => {
  if (isInsideAskChat(event.target)) return;
  if (!window.getSelection()?.toString().trim()) closePopover();
});
