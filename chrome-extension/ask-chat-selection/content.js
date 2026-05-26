const ASK_CHAT_ROOT_ID = 'ask-chat-selection-root';
const MAX_CONTEXT_CHARS = 5000;
const MAX_LOCAL_CONTEXT_CHARS = 1800;
const MAX_PAGE_CONTEXT_CHARS = 2600;

let root = null;
let nextPopoverId = 1;
let suppressNextSelection = false;
const popovers = new Map();

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
  const width = mode === 'panel' ? 360 : 260;
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
  if (index === -1) return text.slice(0, maxChars);

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

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPopover(target) {
  const id = `ask-chat-${nextPopoverId}`;
  nextPopoverId += 1;
  popovers.set(id, {
    id,
    target,
    requestId: '',
    content: '',
    pinned: false,
    panelPosition: null,
    dragState: null
  });
  return id;
}

function removePopoverElement(id) {
  ensureRoot().querySelector(`[data-ask-chat-id="${id}"]`)?.remove();
}

function closePopover(id) {
  removePopoverElement(id);
  popovers.delete(id);
}

function renderButton(target) {
  closeButtonPopovers();
  const id = createPopover(target);
  const host = ensureRoot();
  const position = clampPosition(target.rect, 'button');
  const state = popovers.get(id);
  state.mode = 'button';
  host.insertAdjacentHTML('beforeend', `
    <div class="ask-chat-popover ask-chat-trigger" data-ask-chat-id="${id}" style="left:${position.left}px;top:${position.top}px">
      <button type="button">Ask Chat</button>
      <input type="text" placeholder="Ask more..." aria-label="Ask Chat custom prompt">
    </div>
  `);
  const trigger = host.querySelector(`[data-ask-chat-id="${id}"]`);
  trigger.querySelector('button')?.addEventListener('click', () => startLookup(id));
  trigger.querySelector('input')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    startLookup(id);
  });
}

function closeButtonPopovers(exceptId = '') {
  let closed = false;
  for (const [id, state] of popovers) {
    if (state.mode === 'button' && id !== exceptId) {
      closePopover(id);
      closed = true;
    }
  }
  return closed;
}

function renderPanel(id, { status = 'loading', content = '', error = '' } = {}) {
  const state = popovers.get(id);
  if (!state) return;

  state.mode = 'panel';
  const host = ensureRoot();
  const position = state.panelPosition || clampPosition(state.target.rect, 'panel');
  state.panelPosition = position;
  if (content) state.content = content;

  const body = state.content
    ? escapeHtml(state.content).replace(/\n/g, '<br>')
    : status === 'error'
      ? `<span class="ask-chat-error">${escapeHtml(error)}</span>`
      : '<span class="ask-chat-muted">等待模型返回解释</span>';

  const headerInner = state.userPrompt
    ? `<div class="ask-chat-header-text"><span title="${escapeHtml(state.target.text)}">「${escapeHtml(state.target.text)}」</span><span class="ask-chat-user-prompt" title="${escapeHtml(state.userPrompt)}">${escapeHtml(state.userPrompt)}</span></div>`
    : `<span title="${escapeHtml(state.target.text)}">「${escapeHtml(state.target.text)}」</span>`;

  removePopoverElement(id);
  host.insertAdjacentHTML('beforeend', `
    <section class="ask-chat-popover ask-chat-panel${state.pinned ? ' pinned' : ''}" data-ask-chat-id="${id}" style="left:${position.left}px;top:${position.top}px">
      <div class="ask-chat-header">
        <button type="button" class="ask-chat-pin" aria-label="${state.pinned ? 'Unpin Ask Chat popup' : 'Pin Ask Chat popup'}" aria-pressed="${state.pinned}" title="${state.pinned ? 'Unpin' : 'Pin'}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 3.5 20.5 9.5 18.4 11.6 16.8 10 13 13.8V18L11.8 19.2 8.2 15.6 4 19.8 3.2 19 7.4 14.8 3.8 11.2 5 10H9.2L13 6.2 11.4 4.6 14.5 3.5Z"></path>
          </svg>
        </button>
        ${headerInner}
        <button type="button" aria-label="Close">×</button>
      </div>
      <div class="ask-chat-meta">${status === 'loading' ? '正在询问模型' : status === 'error' ? '解释失败' : 'Ask Chat'}</div>
      <div class="ask-chat-body" data-content="${escapeHtml(state.content)}">${body}</div>
    </section>
  `);

  const panel = host.querySelector(`[data-ask-chat-id="${id}"]`);
  panel.querySelector('.ask-chat-pin')?.addEventListener('click', () => togglePinned(id));
  panel.querySelector('.ask-chat-header button[aria-label="Close"]')?.addEventListener('click', () => closePopover(id));
  panel.querySelector('.ask-chat-body')?.addEventListener('mouseup', () => handlePanelSelection(id));
  panel.querySelector('.ask-chat-body')?.addEventListener('keyup', () => handlePanelSelection(id));
  attachPanelDrag(id);
}

function togglePinned(id) {
  const state = popovers.get(id);
  const panel = ensureRoot().querySelector(`[data-ask-chat-id="${id}"]`);
  if (!state || !panel) return;

  state.pinned = !state.pinned;
  panel.classList.toggle('pinned', state.pinned);
  const pin = panel.querySelector('.ask-chat-pin');
  if (pin) {
    pin.setAttribute('aria-label', state.pinned ? 'Unpin Ask Chat popup' : 'Pin Ask Chat popup');
    pin.setAttribute('aria-pressed', String(state.pinned));
    pin.setAttribute('title', state.pinned ? 'Unpin' : 'Pin');
  }
}

function clampPanelPosition(left, top, panel) {
  const margin = 8;
  const rect = panel.getBoundingClientRect();
  return {
    left: Math.min(Math.max(left, margin), Math.max(margin, window.innerWidth - rect.width - margin)),
    top: Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - rect.height - margin))
  };
}

function attachPanelDrag(id) {
  const state = popovers.get(id);
  const panel = ensureRoot().querySelector(`[data-ask-chat-id="${id}"]`);
  const header = panel?.querySelector('.ask-chat-header');
  if (!state || !panel || !header) return;

  header.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    state.dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    header.setPointerCapture(event.pointerId);
    panel.classList.add('dragging');
    event.preventDefault();
  });

  header.addEventListener('pointermove', (event) => {
    if (!state.dragState || state.dragState.pointerId !== event.pointerId) return;
    const next = clampPanelPosition(
      event.clientX - state.dragState.offsetX,
      event.clientY - state.dragState.offsetY,
      panel
    );
    state.panelPosition = next;
    panel.style.left = `${next.left}px`;
    panel.style.top = `${next.top}px`;
  });

  const endDrag = (event) => {
    if (!state.dragState || state.dragState.pointerId !== event.pointerId) return;
    state.dragState = null;
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

async function startLookup(id) {
  const state = popovers.get(id);
  if (!state) return;

  const requestId = crypto.randomUUID();
  const trigger = ensureRoot().querySelector(`[data-ask-chat-id="${id}"]`);
  state.requestId = requestId;
  state.content = '';
  state.userPrompt = trigger?.querySelector('input')?.value?.trim() || state.userPrompt || '';
  renderPanel(id, { status: 'loading' });

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'ASK_CHAT_EXPLAIN',
      payload: {
        requestId,
        selectedText: state.target.text,
        surroundingText: state.target.surroundingText,
        pageTitle: state.target.pageTitle || document.title,
        pageUrl: state.target.pageUrl || location.href,
        userPrompt: state.userPrompt
      }
    });
  } catch {
    if (popovers.has(id) && popovers.get(id).requestId === requestId) {
      renderPanel(id, { status: 'error', error: '扩展已重载，请刷新页面后重试' });
    }
    return;
  }

  if (!popovers.has(id) || popovers.get(id).requestId !== requestId) return;
  if (!response?.ok) {
    renderPanel(id, { status: 'error', error: response?.error || '解释失败' });
    return;
  }
  state.content = response.data?.content || state.content;
  renderPanel(id, { status: 'done', content: state.content });
}

function handlePageSelection() {
  window.setTimeout(() => {
    if (suppressNextSelection) {
      suppressNextSelection = false;
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    if (isInsideAskChat(selection.anchorNode) || isInsideAskChat(selection.focusNode)) return;

    const text = normalizeText(selection.toString());
    if (!text) return;

    const range = selection.getRangeAt(0);
    renderButton({
      rect: getSelectionRect(range),
      pageTitle: document.title,
      pageUrl: location.href,
      surroundingText: getSurroundingText(selection),
      text
    });
  }, 0);
}

function handlePanelSelection(id) {
  window.setTimeout(() => {
    const state = popovers.get(id);
    const selection = window.getSelection();
    const body = ensureRoot().querySelector(`[data-ask-chat-id="${id}"] .ask-chat-body`);
    if (!state || !body || !selection || selection.isCollapsed || selection.rangeCount === 0) return;
    if (!body.contains(selection.anchorNode) || !body.contains(selection.focusNode)) return;

    const text = normalizeText(selection.toString());
    if (!text) return;

    const range = selection.getRangeAt(0);
    const answerText = normalizeText(body.dataset.content || body.innerText || body.textContent);
    renderButton({
      rect: getSelectionRect(range),
      pageTitle: 'Ask Chat 上一层回答',
      pageUrl: location.href,
      surroundingText: `上一层 Ask Chat 回答：${answerText || '无'}`,
      text
    });
  }, 0);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'ASK_CHAT_DELTA') return;

  const state = Array.from(popovers.values()).find(item => item.requestId === message.requestId);
  if (!state) return;

  state.content += message.chunk || '';
  const body = ensureRoot().querySelector(`[data-ask-chat-id="${state.id}"] .ask-chat-body`);
  if (!body) return;
  body.dataset.content = state.content;
  body.innerHTML = escapeHtml(state.content).replace(/\n/g, '<br>');
});

document.addEventListener('mouseup', (event) => {
  if (isInsideAskChat(event.target)) return;
  handlePageSelection();
});

document.addEventListener('keyup', handlePageSelection);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return;

  const buttonPopovers = [...popovers.entries()].filter(([, state]) => state.mode === 'button');
  if (!buttonPopovers.length) return;

  const target = event.target;
  const isOtherInteractive = !isInsideAskChat(target) && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.contentEditable === 'true'
  );
  if (isOtherInteractive) return;

  event.preventDefault();
  suppressNextSelection = true;
  for (const [id] of buttonPopovers) {
    startLookup(id);
  }
});
document.addEventListener('pointerdown', (event) => {
  const clickedAskChat = event.target.closest?.('[data-ask-chat-id]');
  const clickedAskChatId = clickedAskChat?.dataset?.askChatId || '';
  const clickedInsideAskChat = Boolean(clickedAskChat);
  let closedPopover = false;

  if (closeButtonPopovers(clickedAskChatId)) {
    closedPopover = true;
  }

  if (clickedInsideAskChat) {
    if (closedPopover) {
      suppressNextSelection = true;
      window.getSelection()?.removeAllRanges();
    }
    return;
  }

  for (const [id, state] of popovers) {
    if (state.mode === 'panel' && !state.pinned) {
      closePopover(id);
      closedPopover = true;
    }
  }
  if (closedPopover) {
    suppressNextSelection = true;
    window.getSelection()?.removeAllRanges();
  }
}, true);
