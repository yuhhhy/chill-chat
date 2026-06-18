const ASK_CHAT_ROOT_ID = 'ask-chat-selection-root';
const MAX_CONTEXT_CHARS = 5000;
const MAX_LOCAL_CONTEXT_CHARS = 1800;
const MAX_PAGE_CONTEXT_CHARS = 1600;
const LOW_VALUE_SELECTOR = [
  'nav',
  'header',
  'footer',
  'aside',
  'script',
  'style',
  'noscript',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]'
].join(',');
const THINKING_STATUS_INTERVAL_MS = 4400;
const THINKING_STATUS_MESSAGES = [
  '思考中',
  '少女祈祷中',
  '正在烧高香，祈求 GPU 不过热',
  'AI 正在抽卡',
  '正在与服务器搏斗',
  '正在翻越防火长城',
  '向量空间迷路中',
  'Token 正在排队',
  '正在打开次元裂缝'
];

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

function getRandomThinkingStatusIndex(excludedIndex = -1) {
  if (THINKING_STATUS_MESSAGES.length <= 1) return 0;

  let nextIndex = excludedIndex;
  while (nextIndex === excludedIndex) {
    nextIndex = Math.floor(Math.random() * THINKING_STATUS_MESSAGES.length);
  }

  return nextIndex;
}

function getMetaDescription() {
  return document.querySelector('meta[name="description"], meta[property="og:description"]')?.content || '';
}

function getElementText(element) {
  return normalizeText(element?.innerText || element?.textContent || '');
}

function getCleanElementText(element) {
  if (!element) return '';
  const clone = element.cloneNode(true);
  clone.querySelectorAll(LOW_VALUE_SELECTOR).forEach(node => node.remove());
  return getElementText(clone);
}

function getPageLanguage() {
  return document.documentElement.lang || document.querySelector('meta[http-equiv="content-language"]')?.content || '';
}

function isLowValueElement(element) {
  return Boolean(element?.closest?.(LOW_VALUE_SELECTOR));
}

function getBlockElement(node) {
  return node?.parentElement?.closest('p, li, blockquote, td, th, pre, tr, article, section, main, div') || document.body;
}

function getSemanticBlock(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!element) return document.body;
  return element.closest('td, th, tr, li, p, blockquote, pre, article, section, main, [role="article"], [role="main"], div') || document.body;
}

function getHeadingText(element) {
  const text = getElementText(element);
  return text.length > 160 ? `${text.slice(0, 160)}...` : text;
}

function getHeadingChain(element) {
  const headings = [];
  let current = element;
  while (current && current !== document.body) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (/^H[1-6]$/.test(sibling.tagName)) {
        headings.unshift(getHeadingText(sibling));
        break;
      }
      const heading = sibling.querySelector?.('h1, h2, h3, h4, h5, h6');
      if (heading) {
        headings.unshift(getHeadingText(heading));
        break;
      }
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }

  const pageTitle = getHeadingText(document.querySelector('h1')) || document.title;
  return [pageTitle, ...headings]
    .filter(Boolean);
}

function getLinkDensity(element) {
  const textLength = getCleanElementText(element).length || 1;
  const linkLength = Array.from(element?.querySelectorAll?.('a') || [])
    .reduce((sum, link) => sum + getElementText(link).length, 0);
  return linkLength / textLength;
}

function scoreMainCandidate(element, selectedText) {
  if (!element || isLowValueElement(element)) return -Infinity;
  const text = getCleanElementText(element);
  if (text.length < 40) return -Infinity;
  const linkDensity = getLinkDensity(element);
  let score = Math.min(text.length, 3500);
  if (text.includes(selectedText)) score += 2400;
  if (element.matches?.('article, main, [role="main"], [role="article"]')) score += 800;
  if (element.querySelector?.('h1, h2, h3')) score += 250;
  score -= linkDensity * 1800;
  return score;
}

function getMainText(selectedText) {
  const candidates = [
    document.querySelector('article'),
    document.querySelector('main'),
    document.querySelector('[role="main"]'),
    document.querySelector('[role="article"]'),
    ...Array.from(document.querySelectorAll('section, article, main, [role="main"], [role="article"]')).slice(0, 80),
    document.body
  ].filter(Boolean);

  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = scoreMainCandidate(candidate, selectedText);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return getCleanElementText(best || document.body);
}

function windowAroundSelection(text, selectedText, maxChars) {
  if (text.length <= maxChars) return text;

  const index = text.indexOf(selectedText);
  if (index === -1) return text.slice(0, maxChars);

  const half = Math.floor((maxChars - selectedText.length) / 2);
  const start = Math.max(0, index - half);
  return text.slice(start, start + maxChars);
}

function getSiblingContext(block, direction) {
  let sibling = direction === 'previous' ? block?.previousElementSibling : block?.nextElementSibling;
  while (sibling) {
    if (!isLowValueElement(sibling)) {
      const text = getCleanElementText(sibling);
      if (text) return text.slice(0, 900);
    }
    sibling = direction === 'previous' ? sibling.previousElementSibling : sibling.nextElementSibling;
  }
  return '';
}

function getSelectionStructure(selection, block) {
  const element = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode
    : selection.anchorNode?.parentElement;
  const link = element?.closest?.('a[href]');
  const button = element?.closest?.('button, [role="button"]');
  const tableCell = element?.closest?.('td, th');
  const tableRow = element?.closest?.('tr');
  const listItem = element?.closest?.('li');
  const codeBlock = element?.closest?.('pre, code');

  return [
    `所在标签：${block?.tagName?.toLowerCase() || 'unknown'}`,
    link && `链接地址：${link.href}`,
    button && '位于按钮/可点击控件中',
    tableCell && '位于表格单元格中',
    tableRow && '位于表格行中',
    listItem && '位于列表项中',
    codeBlock && '位于代码/预格式文本中'
  ].filter(Boolean).join('\n');
}

function getTableContext(selection) {
  const element = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode
    : selection.anchorNode?.parentElement;
  const row = element?.closest?.('tr');
  const table = element?.closest?.('table');
  if (!row || !table) return '';

  const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
  const headers = Array.from(headerRow?.children || [])
    .map(cell => getElementText(cell))
    .filter(Boolean)
    .join(' | ');
  const rowText = Array.from(row.children || [])
    .map(cell => getElementText(cell))
    .filter(Boolean)
    .join(' | ');

  return [
    headers && `表头：${headers}`,
    rowText && `当前行：${rowText}`
  ].filter(Boolean).join('\n');
}

function formatContextSection(title, content) {
  const text = String(content || '').trim();
  return text ? `【${title}】\n${text}` : '';
}

function buildSelectionContext(selection) {
  const selectedText = normalizeText(selection.toString());
  const block = getSemanticBlock(selection.anchorNode) || getBlockElement(selection.anchorNode);
  const localText = windowAroundSelection(getCleanElementText(block), selectedText, MAX_LOCAL_CONTEXT_CHARS);
  const previousText = getSiblingContext(block, 'previous');
  const nextText = getSiblingContext(block, 'next');
  const tableContext = getTableContext(selection);
  const mainText = windowAroundSelection(getMainText(selectedText), selectedText, MAX_PAGE_CONTEXT_CHARS);
  const context = {
    selectedText,
    page: {
      title: document.title || '',
      url: location.href,
      language: getPageLanguage() || '',
      description: getMetaDescription()
    },
    selection: {
      blockTag: block?.tagName?.toLowerCase() || 'unknown',
      structureText: getSelectionStructure(selection, block),
      tableContext
    },
    domPath: getHeadingChain(block),
    localContext: {
      previousText,
      currentText: localText,
      nextText
    },
    mainContext: mainText
  };

  context.formattedText = formatSelectionContext(context);
  return context;
}

function formatSelectionContext(context) {
  const contextParts = [
    formatContextSection('选区结构', [
      `标题链路：${context.domPath.join(' > ') || '无'}`,
      context.selection.structureText,
      context.selection.tableContext
    ].filter(Boolean).join('\n')),
    formatContextSection('附近正文', [
      context.localContext.previousText && `前一段：${context.localContext.previousText}`,
      context.localContext.currentText && `当前语义块：${context.localContext.currentText}`,
      context.localContext.nextText && `后一段：${context.localContext.nextText}`
    ].filter(Boolean).join('\n')),
    formatContextSection('页面正文片段', context.mainContext),
    formatContextSection('页面信息', [
      `标题：${context.page.title || '无'}`,
      `语言：${context.page.language || '未知'}`,
      context.page.description && `摘要：${context.page.description}`
    ].filter(Boolean).join('\n'))
  ].filter(Boolean);

  return contextParts.join('\n\n').slice(0, MAX_CONTEXT_CHARS);
}

function buildFallbackSelectionContext(selection, selectedText) {
  const block = getBlockElement(selection.anchorNode);
  const currentText = windowAroundSelection(getElementText(block), selectedText, MAX_LOCAL_CONTEXT_CHARS);
  return {
    selectedText,
    page: {
      title: document.title || '',
      url: location.href,
      language: getPageLanguage() || '',
      description: getMetaDescription()
    },
    selection: {
      blockTag: block?.tagName?.toLowerCase() || 'unknown',
      structureText: `所在标签：${block?.tagName?.toLowerCase() || 'unknown'}`,
      tableContext: ''
    },
    domPath: getHeadingChain(block),
    localContext: {
      previousText: '',
      currentText,
      nextText: ''
    },
    mainContext: ''
  };
}

function buildSafeSelectionContext(selection, selectedText) {
  try {
    return buildSelectionContext(selection);
  } catch (error) {
    console.warn('[Ask Chat] failed to build structured selection context', error);
    const context = buildFallbackSelectionContext(selection, selectedText);
    context.formattedText = formatSelectionContext(context);
    return context;
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

function renderMarkdown(text) {
  const lines = String(text || '').split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let listStack = [];
  let blockquote = [];
  let tableRows = [];
  let codeBlock = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushLists = () => {
    while (listStack.length) {
      html.push(`</${listStack.pop().type}>`);
    }
  };

  const flushBlockquote = () => {
    if (!blockquote.length) return;
    html.push(`<blockquote>${blockquote.map(item => `<p>${renderInlineMarkdown(item)}</p>`).join('')}</blockquote>`);
    blockquote = [];
  };

  const isSeparatorRow = (cells) => cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()));

  const renderTable = (rows) => {
    if (rows.length < 2) {
      rows.forEach(row => paragraph.push(row.raw));
      return;
    }

    const [header, separator, ...body] = rows;
    if (!isSeparatorRow(separator.cells)) {
      rows.forEach(row => paragraph.push(row.raw));
      return;
    }

    const head = `<thead><tr>${header.cells.map(cell => `<th>${renderInlineMarkdown(cell.trim())}</th>`).join('')}</tr></thead>`;
    const bodyHtml = body.length
      ? `<tbody>${body.map(row => `<tr>${row.cells.map(cell => `<td>${renderInlineMarkdown(cell.trim())}</td>`).join('')}</tr>`).join('')}</tbody>`
      : '';
    html.push(`<table>${head}${bodyHtml}</table>`);
  };

  const flushTable = () => {
    if (!tableRows.length) return;
    renderTable(tableRows);
    tableRows = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^```(.*)$/);
    if (fenceMatch) {
      flushParagraph();
      flushLists();
      flushBlockquote();
      flushTable();
      if (codeBlock) {
        html.push(`<pre><code>${escapeHtml(codeBlock.lines.join('\n'))}</code></pre>`);
        codeBlock = null;
      } else {
        codeBlock = { language: fenceMatch[1].trim(), lines: [] };
      }
      continue;
    }

    if (codeBlock) {
      codeBlock.lines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushLists();
      flushBlockquote();
      flushTable();
      continue;
    }

    const tableMatch = trimmed.includes('|') ? trimmed.split('|').map(cell => cell.trim()).filter((cell, index, cells) => !(index === 0 && cell === '') && !(index === cells.length - 1 && cell === '')) : null;
    if (tableMatch && tableMatch.length >= 2) {
      flushParagraph();
      flushLists();
      flushBlockquote();
      tableRows.push({ raw: trimmed, cells: tableMatch });
      continue;
    }

    flushTable();

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushLists();
      blockquote.push(quoteMatch[1]);
      continue;
    }

    flushBlockquote();

    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      const indent = Math.floor(listMatch[1].replace(/\t/g, '  ').length / 2);
      const type = /^\d+\.$/.test(listMatch[2]) ? 'ol' : 'ul';

      while (listStack.length > indent + 1) {
        html.push(`</${listStack.pop().type}>`);
      }
      while (listStack.length < indent + 1) {
        html.push(`<${type}>`);
        listStack.push({ type });
      }
      if (listStack[listStack.length - 1].type !== type) {
        html.push(`</${listStack.pop().type}>`);
        html.push(`<${type}>`);
        listStack.push({ type });
      }
      html.push(`<li>${renderInlineMarkdown(listMatch[3])}</li>`);
      continue;
    }

    flushLists();
    paragraph.push(trimmed);
  }

  if (codeBlock) {
    html.push(`<pre><code>${escapeHtml(codeBlock.lines.join('\n'))}</code></pre>`);
  }
  flushParagraph();
  flushLists();
  flushBlockquote();
  flushTable();
  return html.join('');
}

function createPopover(target) {
  const id = `ask-chat-${nextPopoverId}`;
  nextPopoverId += 1;
  popovers.set(id, {
    id,
    target,
    requestId: '',
    content: '',
    intent: target.intent || 'explain',
    waitingIndex: getRandomThinkingStatusIndex(),
    waitingTimer: null,
    actionMenuPosition: null,
    pinned: false,
    panelPosition: null,
    dragState: null
  });
  return id;
}

function removePopoverElement(id) {
  ensureRoot().querySelector(`[data-ask-chat-id="${id}"]`)?.remove();
  ensureRoot().querySelector(`[data-ask-chat-menu-id="${id}"]`)?.remove();
}

function closePopover(id) {
  const state = popovers.get(id);
  stopWaitingRotation(state);
  cancelActiveRequest(state);
  removePopoverElement(id);
  popovers.delete(id);
}

function cancelActiveRequest(state) {
  if (!state?.requestId) return;
  chrome.runtime.sendMessage({
    type: 'ASK_CHAT_CANCEL',
    requestId: state.requestId
  }).catch(() => {});
  state.requestId = '';
}

function stopWaitingRotation(state) {
  if (!state?.waitingTimer) return;
  window.clearInterval(state.waitingTimer);
  state.waitingTimer = null;
}

function startWaitingRotation(id) {
  const state = popovers.get(id);
  if (!state) return;

  stopWaitingRotation(state);
  state.waitingIndex = getRandomThinkingStatusIndex(state.waitingIndex);
  state.waitingTimer = window.setInterval(() => {
    const current = popovers.get(id);
    if (!current || current.content) {
      stopWaitingRotation(current);
      return;
    }
    current.waitingIndex = getRandomThinkingStatusIndex(current.waitingIndex);
    const waitingText = ensureRoot().querySelector(`[data-ask-chat-id="${id}"] .ask-chat-waiting-text`);
    if (waitingText) waitingText.textContent = THINKING_STATUS_MESSAGES[current.waitingIndex];
  }, THINKING_STATUS_INTERVAL_MS);
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
  trigger.querySelector('button')?.addEventListener('click', () => startLookup(id, 'explain'));
  trigger.querySelector('input')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    startLookup(id, 'explain');
  });
  return id;
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

function closeActionMenus(exceptId = '') {
  for (const [id, state] of popovers) {
    if (id !== exceptId) state.actionMenuPosition = null;
  }
  ensureRoot().querySelectorAll('[data-ask-chat-menu-id]').forEach((menu) => {
    if (menu.dataset.askChatMenuId !== exceptId) menu.remove();
  });
}

function clampActionMenuPosition(left, top) {
  const margin = 8;
  const width = 132;
  const height = 42;
  return {
    left: Math.min(Math.max(left, margin), Math.max(margin, window.innerWidth - width - margin)),
    top: Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - height - margin))
  };
}

function renderActionMenu(id, clientX, clientY) {
  const state = popovers.get(id);
  if (!state) return;

  closeActionMenus(id);
  const position = clampActionMenuPosition(clientX, clientY);
  state.actionMenuPosition = position;
  const hasContent = Boolean(normalizeText(state.content));
  ensureRoot().querySelector(`[data-ask-chat-menu-id="${id}"]`)?.remove();
  ensureRoot().insertAdjacentHTML('beforeend', `
    <div class="ask-chat-action-menu" data-ask-chat-menu-id="${id}" style="left:${position.left}px;top:${position.top}px">
      <button type="button" data-action="copy"${hasContent ? '' : ' disabled'}>复制</button>
      <button type="button" data-action="regenerate">重新生成</button>
    </div>
  `);

  const menu = ensureRoot().querySelector(`[data-ask-chat-menu-id="${id}"]`);
  menu.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
    if (!normalizeText(state.content)) return;
    try {
      await navigator.clipboard.writeText(state.content);
    } catch {
      // Clipboard may be unavailable on restricted pages.
    }
    closeActionMenus();
  });
  menu.querySelector('[data-action="regenerate"]')?.addEventListener('click', () => {
    closeActionMenus();
    startLookup(id, state.intent || 'explain');
  });
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
    ? renderMarkdown(state.content)
    : status === 'error'
      ? `<span class="ask-chat-error">${escapeHtml(error)}</span>`
      : `<span class="ask-chat-muted ask-chat-waiting"><span class="ask-chat-waiting-spinner" aria-hidden="true"></span><span class="ask-chat-waiting-text">${escapeHtml(THINKING_STATUS_MESSAGES[state.waitingIndex])}</span></span>`;

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
      <div class="ask-chat-meta">${status === 'loading' ? (state.intent === 'translate' ? '正在翻译' : '正在询问模型') : status === 'error' ? (state.intent === 'translate' ? '翻译失败' : '解释失败') : (state.intent === 'translate' ? '翻译完成' : 'Ask Chat')}</div>
      <div class="ask-chat-body" data-content="${escapeHtml(state.content)}">${body}</div>
    </section>
  `);

  const panel = host.querySelector(`[data-ask-chat-id="${id}"]`);
  panel.querySelector('.ask-chat-pin')?.addEventListener('click', () => togglePinned(id));
  panel.querySelector('.ask-chat-header button[aria-label="Close"]')?.addEventListener('click', () => closePopover(id));
  panel.querySelector('.ask-chat-body')?.addEventListener('mouseup', () => handlePanelSelection(id));
  panel.querySelector('.ask-chat-body')?.addEventListener('keyup', () => handlePanelSelection(id));
  panel.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    renderActionMenu(id, event.clientX, event.clientY);
  });
  attachPanelDrag(id);
}

function getPanelStatusText(state, status) {
  if (status === 'loading') return state.intent === 'translate' ? '正在翻译' : '正在询问模型';
  if (status === 'error') return state.intent === 'translate' ? '翻译失败' : '解释失败';
  return state.intent === 'translate' ? '翻译完成' : 'Ask Chat';
}

function updatePanelMeta(id, status) {
  const state = popovers.get(id);
  const meta = ensureRoot().querySelector(`[data-ask-chat-id="${id}"] .ask-chat-meta`);
  if (!state || !meta) return;
  meta.textContent = getPanelStatusText(state, status);
}

function updatePanelBodyContent(id, content) {
  const body = ensureRoot().querySelector(`[data-ask-chat-id="${id}"] .ask-chat-body`);
  if (!body) return;

  const previousScrollTop = body.scrollTop;
  const wasNearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
  body.dataset.content = content;
  body.innerHTML = renderMarkdown(content);
  if (wasNearBottom) {
    body.scrollTop = body.scrollHeight;
  } else {
    body.scrollTop = previousScrollTop;
  }
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

async function startLookup(id, intent = 'explain') {
  const state = popovers.get(id);
  if (!state) return;

  const requestId = crypto.randomUUID();
  const trigger = ensureRoot().querySelector(`[data-ask-chat-id="${id}"]`);
  stopWaitingRotation(state);
  cancelActiveRequest(state);
  closeActionMenus();
  state.requestId = requestId;
  state.content = '';
  state.intent = intent;
  state.userPrompt = intent === 'translate' ? '' : (trigger?.querySelector('input')?.value?.trim() || state.userPrompt || '');
  renderPanel(id, { status: 'loading' });
  startWaitingRotation(id);

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
        userPrompt: state.userPrompt,
        intent
      }
    });
  } catch {
    if (popovers.has(id) && popovers.get(id).requestId === requestId) {
      stopWaitingRotation(popovers.get(id));
      renderPanel(id, { status: 'error', error: '扩展已重载，请刷新页面后重试' });
    }
    return;
  }

  if (!popovers.has(id) || popovers.get(id).requestId !== requestId) return;
  if (!response?.ok) {
    stopWaitingRotation(state);
    renderPanel(id, { status: 'error', error: response?.error || '解释失败' });
    return;
  }
  stopWaitingRotation(state);
  state.content = response.data?.content || state.content;
  if (ensureRoot().querySelector(`[data-ask-chat-id="${id}"]`)) {
    updatePanelMeta(id, 'done');
    updatePanelBodyContent(id, state.content);
  } else {
    renderPanel(id, { status: 'done', content: state.content });
  }
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
    const fallbackContext = buildFallbackSelectionContext(selection, text);
    fallbackContext.formattedText = formatSelectionContext(fallbackContext);
    const id = renderButton({
      rect: getSelectionRect(range),
      pageTitle: fallbackContext.page.title || document.title,
      pageUrl: fallbackContext.page.url || location.href,
      surroundingText: fallbackContext.formattedText,
      text
    });
    window.setTimeout(() => {
      const state = popovers.get(id);
      if (!state) return;
      const context = buildSafeSelectionContext(selection, text);
      state.target = {
        ...state.target,
        pageTitle: context.page.title || document.title,
        pageUrl: context.page.url || location.href,
        surroundingText: context.formattedText
      };
    }, 0);
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

  stopWaitingRotation(state);
  state.content += message.chunk || '';
  updatePanelBodyContent(state.id, state.content);
});

document.addEventListener('mouseup', (event) => {
  if (isInsideAskChat(event.target)) return;
  handlePageSelection();
});

document.addEventListener('keyup', handlePageSelection);

document.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  const key = event.key.toLowerCase();
  if (event.key !== 'Enter' && key !== 't') return;

  const buttonPopovers = [...popovers.entries()].filter(([, state]) => state.mode === 'button');
  if (!buttonPopovers.length) return;

  const target = event.target;
  const isOtherInteractive = !isInsideAskChat(target) && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.contentEditable === 'true'
  );
  if (isOtherInteractive || (key === 't' && isInsideAskChat(target))) return;

  event.preventDefault();
  suppressNextSelection = true;
  for (const [id] of buttonPopovers) {
    startLookup(id, key === 't' ? 'translate' : 'explain');
  }
});
document.addEventListener('pointerdown', (event) => {
  const clickedAskChat = event.target.closest?.('[data-ask-chat-id]');
  const clickedAskChatId = clickedAskChat?.dataset?.askChatId || '';
  const clickedActionMenu = event.target.closest?.('[data-ask-chat-menu-id]');
  const clickedInsideAskChat = Boolean(clickedAskChat) || Boolean(clickedActionMenu);
  let closedButtonPopover = false;
  let closedPanelPopover = false;

  if (closeButtonPopovers(clickedAskChatId)) {
    closedButtonPopover = true;
  }

  if (clickedInsideAskChat) {
    if (!clickedActionMenu) {
      closeActionMenus();
    }
    if (closedButtonPopover) {
      suppressNextSelection = true;
    }
    return;
  }

  for (const [id, state] of popovers) {
    if (state.mode === 'panel' && !state.pinned) {
      closePopover(id);
      closedPanelPopover = true;
    }
  }
  closeActionMenus();
  if (closedButtonPopover || closedPanelPopover) {
    suppressNextSelection = true;
  }
  if (closedPanelPopover) {
    window.getSelection()?.removeAllRanges();
  }
}, true);
