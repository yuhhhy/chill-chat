const DEFAULT_OPTIONS = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.2
};

const activeRequests = new Map();

function normalizeBaseUrl(url) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_OPTIONS.apiBaseUrl;
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

async function getOptions() {
  const stored = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  return { ...DEFAULT_OPTIONS, ...stored };
}

function buildPrompt({ selectedText, pageTitle, pageUrl, surroundingText, userPrompt = '', intent = 'explain' }) {
  if (intent === 'translate') {
    return `你是一个上下文翻译助手。请结合网页上下文翻译用户选中的文本，只输出译文，不要标题，不要解释翻译过程。

网页上下文是辅助材料，用来判断术语、指代、省略和语气。不要翻译或解释网页 UI 位置、区域类型或控件属性，除非用户选中的内容本身就是 UI 名称。

网页标题：
${pageTitle || '无'}

网页地址：
${pageUrl || '无'}

网页上下文：
${surroundingText || '无'}

选中文本：
「${selectedText}」

如果选中文本主要是中文，请翻译成自然、准确的英文；如果主要是非中文，请翻译成自然、准确的中文。保留原意、语气、术语和必要的 Markdown 格式。`;
  }

  const trimmedUserPrompt = String(userPrompt || '').trim();
  const defaultInstruction = `请先判断「${selectedText}」更像一个词语/短语，还是一段话。

如果是词语/短语：请生成 200 个中文字符以内的维基百科式解释。使用 md 格式，禁止标题，禁止复述问题，尽量提供上下文之外但与此处含义相关的解释。

如果是一段话：请解释这句话在当前上下文里是什么意思，500 个中文字符以内。使用 md 格式，禁止标题，禁止复述问题。`;
  const userInstruction = `请根据用户追加提问回答，同时结合网页上下文和选中文本。使用 md 格式，禁止标题，禁止复述问题。`;

  return `你是一个上下文术语解释助手。请先根据网页上下文判断用户选中文本在这里指什么，但不要把上下文里已经明说或显而易见的信息再说一遍。

网页上下文是辅助材料，用来判断选中文本的语义边界、所属主题、前后指代和必要背景。不要解释选中文本在页面中的位置、区域或 UI 类型，例如“这是导航栏”“这是搜索结果页的相关问题”“这是按钮文字”。除非用户明确询问 UI 名称，否则直接解释选中文本表达的知识含义。

网页标题：
${pageTitle || '无'}

网页地址：
${pageUrl || '无'}

网页上下文：
${surroundingText || '无'}

选中文本：
「${selectedText}」

用户追加提问：
${trimmedUserPrompt || '无'}

${trimmedUserPrompt ? userInstruction : defaultInstruction}`;
}

async function readOpenAiStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content || '';
        if (delta) onChunk(delta);
      }
    }
  }
}

async function explainSelection(payload, sender) {
  const options = await getOptions();
  if (!options.apiKey) {
    throw new Error('请先在扩展设置中填写 API Key');
  }

  const controller = new AbortController();
  activeRequests.set(payload.requestId, controller);

  try {
    const res = await fetch(normalizeBaseUrl(options.apiBaseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        temperature: Number(options.temperature) || DEFAULT_OPTIONS.temperature,
        stream: true,
        messages: [
          {
            role: 'user',
            content: buildPrompt(payload)
          }
        ]
      })
    });

    if (!res.ok) {
      let message = `模型请求失败：HTTP ${res.status}`;
      try {
        const data = await res.json();
        message = data?.error?.message || data?.error || message;
      } catch {
        // Keep status fallback.
      }
      throw new Error(message);
    }

    let content = '';
    await readOpenAiStream(res, (chunk) => {
      content += chunk;
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'ASK_CHAT_DELTA',
        requestId: payload.requestId,
        chunk
      }).catch(() => {});
    });

    return { content };
  } finally {
    activeRequests.delete(payload.requestId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ASK_CHAT_CANCEL') {
    const controller = activeRequests.get(message.requestId);
    controller?.abort();
    activeRequests.delete(message.requestId);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type !== 'ASK_CHAT_EXPLAIN') return false;

  explainSelection(message.payload, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      if (error.name === 'AbortError') {
        sendResponse({ ok: false, cancelled: true });
        return;
      }
      sendResponse({ ok: false, error: error.message || '解释失败' });
    });

  return true;
});
