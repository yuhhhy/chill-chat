const {
  MarkdownRenderer,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting
} = require('obsidian');

const DEFAULT_SETTINGS = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  enableAnswerFormatInstruction: true,
  answerFormatInstruction: ''
};

const REQUEST_TOTAL_TIMEOUT_MS = 180000;
const REQUEST_IDLE_TIMEOUT_MS = 45000;
const MAX_CONTEXT_CHARS = 5000;
const MAX_LOCAL_CONTEXT_CHARS = 2200;
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

function normalizeBaseUrl(url) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');
  if (!trimmed) return `${DEFAULT_SETTINGS.apiBaseUrl}/chat/completions`;
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function clampText(text, maxChars) {
  const value = String(text || '').trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function getRandomThinkingStatusIndex(excludedIndex = -1) {
  if (THINKING_STATUS_MESSAGES.length <= 1) return 0;

  let nextIndex = excludedIndex;
  while (nextIndex === excludedIndex) {
    nextIndex = Math.floor(Math.random() * THINKING_STATUS_MESSAGES.length);
  }

  return nextIndex;
}

function getCustomInstructionText(answerFormatInstruction) {
  const text = String(answerFormatInstruction || '').trim();
  return text ? `\n\n用户自定义回答要求：\n${text}` : '';
}

function getHeadingChain(lines, selectionStartLine) {
  const headings = [];
  for (let index = 0; index <= selectionStartLine; index += 1) {
    const match = lines[index]?.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length;
    headings.splice(level - 1);
    headings[level - 1] = match[2].trim();
  }
  return headings.filter(Boolean);
}

function getParagraphBounds(lines, lineNumber) {
  let start = lineNumber;
  let end = lineNumber;

  while (start > 0 && lines[start - 1]?.trim()) start -= 1;
  while (end < lines.length - 1 && lines[end + 1]?.trim()) end += 1;

  return { start, end };
}

function getParagraphText(lines, start, end) {
  if (start < 0 || end < 0 || start >= lines.length || end >= lines.length || start > end) return '';
  return lines.slice(start, end + 1).join('\n').trim();
}

function formatContextSection(title, content) {
  const text = String(content || '').trim();
  return text ? `【${title}】\n${text}` : '';
}

function buildSelectionContext(editor, view) {
  const selectedText = editor.getSelection();
  const cursorFrom = editor.getCursor('from');
  const cursorTo = editor.getCursor('to');
  const fullText = editor.getValue();
  const lines = fullText.split(/\r?\n/);
  const bounds = getParagraphBounds(lines, cursorFrom.line);
  const previousBounds = bounds.start > 0 ? getParagraphBounds(lines, bounds.start - 1) : null;
  const nextBounds = bounds.end < lines.length - 1 ? getParagraphBounds(lines, bounds.end + 1) : null;
  const currentFile = view?.file;
  const headingChain = getHeadingChain(lines, cursorFrom.line);
  const currentText = getParagraphText(lines, bounds.start, bounds.end);
  const previousText = previousBounds ? getParagraphText(lines, previousBounds.start, previousBounds.end) : '';
  const nextText = nextBounds ? getParagraphText(lines, nextBounds.start, nextBounds.end) : '';

  const contextParts = [
    formatContextSection('选区结构', [
      `笔记：${currentFile?.basename || '当前 Obsidian 笔记'}`,
      currentFile?.path && `路径：${currentFile.path}`,
      `标题链路：${headingChain.join(' > ') || '无'}`,
      `选区行号：${cursorFrom.line + 1}-${cursorTo.line + 1}`
    ].filter(Boolean).join('\n')),
    formatContextSection('附近正文', [
      previousText && `前一段：${clampText(previousText, 900)}`,
      currentText && `当前语义块：${clampText(currentText, MAX_LOCAL_CONTEXT_CHARS)}`,
      nextText && `后一段：${clampText(nextText, 900)}`
    ].filter(Boolean).join('\n')),
    formatContextSection('笔记信息', [
      `标题：${currentFile?.basename || '无'}`,
      currentFile?.path && `文件路径：${currentFile.path}`
    ].filter(Boolean).join('\n'))
  ].filter(Boolean);

  return {
    selectedText: normalizeText(selectedText),
    pageTitle: currentFile?.basename || 'Obsidian 当前笔记',
    pageUrl: currentFile?.path || '',
    surroundingText: contextParts.join('\n\n').slice(0, MAX_CONTEXT_CHARS)
  };
}

function buildPrompt({
  selectedText,
  pageTitle,
  pageUrl,
  surroundingText,
  userPrompt = '',
  intent = 'explain',
  answerFormatInstruction = '',
  enableAnswerFormatInstruction = true
}) {
  const customInstructionText = enableAnswerFormatInstruction
    ? getCustomInstructionText(answerFormatInstruction)
    : '';

  if (intent === 'translate') {
    return `你是一个上下文翻译助手。请结合 Obsidian 笔记上下文翻译用户选中的文本，只输出译文，不要标题，不要解释翻译过程。

笔记上下文是辅助材料，用来判断术语、指代、省略和语气。不要翻译或解释笔记路径、区域类型或行号，除非用户选中的内容本身就是这些信息。

笔记标题：
${pageTitle || '无'}

笔记路径：
${pageUrl || '无'}

笔记上下文：
${surroundingText || '无'}

选中文本：
「${selectedText}」

如果选中文本主要是中文，请翻译成自然、准确的英文；如果主要是非中文，请翻译成自然、准确的中文。保留原意、语气、术语和必要的 Markdown 格式。${customInstructionText}`;
  }

  const trimmedUserPrompt = String(userPrompt || '').trim();
  const defaultInstruction = `请先判断「${selectedText}」更像一个词语/短语，还是一段话。

如果是词语/短语：请生成 200 个中文字符以内的维基百科式解释。使用 md 格式，禁止标题，禁止复述问题，尽量提供上下文之外但与此处含义相关的解释。

如果是一段话：请解释这句话在当前上下文里是什么意思，500 个中文字符以内。使用 md 格式，禁止标题，禁止复述问题。`;
  const userInstruction = '请根据用户追加提问回答，同时结合笔记上下文和选中文本。使用 md 格式，禁止标题，禁止复述问题。';

  return `你是一个上下文术语解释助手。请先根据 Obsidian 笔记上下文判断用户选中文本在这里指什么，但不要把上下文里已经明说或显而易见的信息再说一遍。

笔记上下文是辅助材料，用来判断选中文本的语义边界、所属主题、前后指代和必要背景。不要解释选中文本在笔记中的位置、区域或行号。

笔记标题：
${pageTitle || '无'}

笔记路径：
${pageUrl || '无'}

笔记上下文：
${surroundingText || '无'}

选中文本：
「${selectedText}」

用户追加提问：
${trimmedUserPrompt || '无'}

${trimmedUserPrompt ? userInstruction : defaultInstruction}${customInstructionText}`;
}

async function readOpenAiStream(response, onChunk, onActivity) {
  if (!response.body) {
    throw new Error('模型没有返回可读取的流式内容');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onActivity?.();

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') return;

        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = parsed.choices?.[0]?.delta?.content || '';
        if (delta) onChunk(delta);
      }
    }
  }
}

class AskChatResultModal extends Modal {
  constructor(app, plugin, payload) {
    super(app);
    this.plugin = plugin;
    this.payload = payload;
    this.content = '';
    this.controller = null;
    this.abortMessage = '';
    this.totalTimer = null;
    this.idleTimer = null;
    this.waitingIndex = getRandomThinkingStatusIndex();
    this.waitingTimer = null;
  }

  onOpen() {
    this.modalEl.addClass('ask-chat-modal');
    this.renderShell();
    this.start();
  }

  onClose() {
    this.cancel();
    this.stopWaitingRotation();
  }

  renderShell() {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.payload.intent === 'translate' ? 'Ask Chat Translation' : 'Ask Chat');
    contentEl.empty();

    const selected = normalizeText(this.payload.selectedText);
    contentEl.createDiv({ cls: 'ask-chat-selected', text: `「${selected.slice(0, 180)}${selected.length > 180 ? '...' : ''}」` });
    if (this.payload.userPrompt) {
      contentEl.createDiv({ cls: 'ask-chat-user-prompt', text: this.payload.userPrompt });
    }

    this.metaEl = contentEl.createDiv({ cls: 'ask-chat-meta', text: this.getStatusText('loading') });
    this.bodyEl = contentEl.createDiv({ cls: 'ask-chat-body ask-chat-loading' });
    this.bodyEl.createSpan({ cls: 'ask-chat-waiting-spinner' });
    this.waitingTextEl = this.bodyEl.createSpan({
      cls: 'ask-chat-waiting-text',
      text: THINKING_STATUS_MESSAGES[this.waitingIndex]
    });

    const actions = contentEl.createDiv({ cls: 'ask-chat-actions' });
    new Setting(actions)
      .addButton((button) => {
        button
          .setButtonText('Copy')
          .onClick(async () => {
            await navigator.clipboard.writeText(this.content);
            new Notice('Ask Chat: 已复制');
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Regenerate')
          .onClick(() => {
            this.cancel();
            this.content = '';
            this.renderShell();
            this.start();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Close')
          .onClick(() => this.close());
      });
  }

  getStatusText(status) {
    if (status === 'loading') return this.payload.intent === 'translate' ? '正在翻译' : '正在询问模型';
    if (status === 'error') return this.payload.intent === 'translate' ? '翻译失败' : '解释失败';
    return this.payload.intent === 'translate' ? '翻译完成' : 'Ask Chat';
  }

  startWaitingRotation() {
    this.stopWaitingRotation();
    this.waitingTimer = window.setInterval(() => {
      if (this.content) {
        this.stopWaitingRotation();
        return;
      }
      this.waitingIndex = getRandomThinkingStatusIndex(this.waitingIndex);
      this.waitingTextEl?.setText(THINKING_STATUS_MESSAGES[this.waitingIndex]);
    }, THINKING_STATUS_INTERVAL_MS);
  }

  stopWaitingRotation() {
    if (!this.waitingTimer) return;
    window.clearInterval(this.waitingTimer);
    this.waitingTimer = null;
  }

  resetIdleTimer() {
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      this.abortWithMessage('模型长时间没有返回新内容，请稍后重试或切换模型');
    }, REQUEST_IDLE_TIMEOUT_MS);
  }

  clearTimers() {
    if (this.totalTimer) window.clearTimeout(this.totalTimer);
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.totalTimer = null;
    this.idleTimer = null;
  }

  abortWithMessage(message) {
    if (this.controller?.signal.aborted) return;
    this.abortMessage = message;
    this.controller?.abort();
  }

  cancel() {
    this.clearTimers();
    this.abortWithMessage('已取消');
  }

  async start() {
    if (!this.plugin.settings.apiKey) {
      this.renderError('请先在 Ask Chat Selection 设置中填写 API Key');
      return;
    }

    this.controller = new AbortController();
    this.abortMessage = '';
    this.totalTimer = window.setTimeout(() => {
      this.abortWithMessage('模型生成超时，请稍后重试或缩短选中文本');
    }, REQUEST_TOTAL_TIMEOUT_MS);
    this.resetIdleTimer();
    this.startWaitingRotation();

    try {
      const response = await fetch(normalizeBaseUrl(this.plugin.settings.apiBaseUrl), {
        method: 'POST',
        signal: this.controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.plugin.settings.apiKey}`
        },
        body: JSON.stringify({
          model: this.plugin.settings.model,
          temperature: Number(this.plugin.settings.temperature) || DEFAULT_SETTINGS.temperature,
          stream: true,
          messages: [
            {
              role: 'user',
              content: buildPrompt({
                ...this.payload,
                answerFormatInstruction: this.plugin.settings.answerFormatInstruction,
                enableAnswerFormatInstruction: this.plugin.settings.enableAnswerFormatInstruction
              })
            }
          ]
        })
      });

      if (!response.ok) {
        let message = `模型请求失败：HTTP ${response.status}`;
        try {
          const data = await response.json();
          message = data?.error?.message || data?.error || message;
        } catch {
          // Keep status fallback.
        }
        throw new Error(message);
      }

      await readOpenAiStream(response, (chunk) => {
        this.content += chunk;
        this.renderContent();
      }, () => this.resetIdleTimer());

      if (!this.content.trim()) {
        throw new Error('模型没有返回内容，请稍后重试或切换模型');
      }
      this.metaEl?.setText(this.getStatusText('done'));
    } catch (error) {
      if (error.name === 'AbortError' && this.abortMessage === '已取消') return;
      this.renderError(error.name === 'AbortError' && this.abortMessage ? this.abortMessage : error.message || '解释失败');
    } finally {
      this.clearTimers();
      this.stopWaitingRotation();
    }
  }

  async renderContent() {
    if (!this.bodyEl) return;
    this.bodyEl.removeClass('ask-chat-loading');
    this.bodyEl.empty();
    await MarkdownRenderer.render(this.app, this.content, this.bodyEl, this.payload.pageUrl || '', this.plugin);
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  renderError(message) {
    this.clearTimers();
    this.stopWaitingRotation();
    this.metaEl?.setText(this.getStatusText('error'));
    if (!this.bodyEl) return;
    this.bodyEl.empty();
    this.bodyEl.removeClass('ask-chat-loading');
    this.bodyEl.createSpan({ cls: 'ask-chat-error', text: message });
  }
}

class AskPromptModal extends Modal {
  constructor(app, selectedText, onSubmit) {
    super(app);
    this.selectedText = selectedText;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.titleEl.setText('Ask Chat');
    this.contentEl.createDiv({
      cls: 'ask-chat-selected',
      text: `「${normalizeText(this.selectedText).slice(0, 180)}」`
    });

    new Setting(this.contentEl)
      .setName('追加提问')
      .addTextArea((text) => {
        this.promptInput = text;
        text.inputEl.rows = 5;
        text.setPlaceholder('例如：用三条 bullet 解释这里的技术含义');
      });

    new Setting(this.contentEl)
      .addButton((button) => {
        button
          .setButtonText('Ask')
          .setCta()
          .onClick(() => {
            const value = this.promptInput?.getValue?.().trim() || '';
            this.close();
            this.onSubmit(value);
          });
      })
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()));
  }
}

class AskChatSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Ask Chat Selection' });

    new Setting(containerEl)
      .setName('OpenAI-compatible Base URL')
      .setDesc('填到 /v1 即可，也可以填完整 /chat/completions。')
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.apiBaseUrl)
        .setValue(this.plugin.settings.apiBaseUrl)
        .onChange(async (value) => {
          this.plugin.settings.apiBaseUrl = value.trim() || DEFAULT_SETTINGS.apiBaseUrl;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Model')
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.model)
        .setValue(this.plugin.settings.model)
        .onChange(async (value) => {
          this.plugin.settings.model = value.trim() || DEFAULT_SETTINGS.model;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('API Key')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Temperature')
      .addText((text) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text.inputEl.max = '2';
        text.inputEl.step = '0.1';
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.temperature))
          .setValue(String(this.plugin.settings.temperature))
          .onChange(async (value) => {
            this.plugin.settings.temperature = Number(value) || DEFAULT_SETTINGS.temperature;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('启用自定义回答要求')
      .addToggle((toggle) => toggle
        .setValue(Boolean(this.plugin.settings.enableAnswerFormatInstruction))
        .onChange(async (value) => {
          this.plugin.settings.enableAnswerFormatInstruction = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('自定义回答要求')
      .setDesc('例如：用三条 bullet 回答；中英双语；先给结论再解释。')
      .addTextArea((text) => {
        text.inputEl.rows = 4;
        text
          .setValue(this.plugin.settings.answerFormatInstruction)
          .onChange(async (value) => {
            this.plugin.settings.answerFormatInstruction = value.trim();
            await this.plugin.saveSettings();
          });
      });
  }
}

module.exports = class AskChatSelectionPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AskChatSettingTab(this.app, this));

    this.addCommand({
      id: 'explain-selection',
      name: 'Explain selected text',
      editorCheckCallback: (checking, editor, view) => this.runEditorCommand(checking, editor, view, 'explain')
    });

    this.addCommand({
      id: 'translate-selection',
      name: 'Translate selected text',
      editorCheckCallback: (checking, editor, view) => this.runEditorCommand(checking, editor, view, 'translate')
    });

    this.addCommand({
      id: 'ask-selection',
      name: 'Ask about selected text',
      editorCheckCallback: (checking, editor, view) => this.runEditorCommand(checking, editor, view, 'ask')
    });

    this.addRibbonIcon('messages-square', 'Ask Chat Selection', () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        new Notice('Ask Chat: 请先打开一篇 Markdown 笔记');
        return;
      }
      this.openForEditor(view.editor, view, 'ask');
    });

    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, view) => {
      if (!normalizeText(editor.getSelection())) return;

      menu.addSeparator();
      menu.addItem((item) => item
        .setTitle('Ask Chat: Explain selection')
        .setIcon('message-circle')
        .onClick(() => this.openForEditor(editor, view, 'explain')));
      menu.addItem((item) => item
        .setTitle('Ask Chat: Translate selection')
        .setIcon('languages')
        .onClick(() => this.openForEditor(editor, view, 'translate')));
      menu.addItem((item) => item
        .setTitle('Ask Chat: Ask about selection')
        .setIcon('messages-square')
        .onClick(() => this.openForEditor(editor, view, 'ask')));
    }));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  runEditorCommand(checking, editor, view, intent) {
    if (!normalizeText(editor.getSelection())) return false;
    if (checking) return true;
    this.openForEditor(editor, view, intent);
    return true;
  }

  openForEditor(editor, view, intent) {
    const context = buildSelectionContext(editor, view);
    if (!context.selectedText) {
      new Notice('Ask Chat: 请先选中文字');
      return;
    }

    if (intent === 'ask') {
      new AskPromptModal(this.app, context.selectedText, (userPrompt) => {
        new AskChatResultModal(this.app, this, {
          ...context,
          intent: 'explain',
          userPrompt
        }).open();
      }).open();
      return;
    }

    new AskChatResultModal(this.app, this, {
      ...context,
      intent,
      userPrompt: ''
    }).open();
  }
};
