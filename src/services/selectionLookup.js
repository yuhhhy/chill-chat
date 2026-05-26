import { createChatRun, cancelChatRun } from '../api/chatRuns.js';
import StreamParser from './streamParser.js';

export const BUILT_IN_LOOKUP_PROVIDERS = ['chatgpt', 'gemini', 'deepseek', 'claude'];

export function buildSelectionLookupMessages({ selectedText, assistantMessage, previousUserMessage }) {
  const prompt = `你是一个上下文术语解释助手。请先根据上下文判断用户选中文本在这里指什么，但不要把上下文里已经明说或显而易见的信息再说一遍。

用户上一问：
${previousUserMessage || '无'}

助手回复：
${assistantMessage || '无'}

选中文本：
「${selectedText}」

请先判断「${selectedText}」更像一个词语/短语，还是一段话。

如果是词语/短语：请生成 100 个中文字符以内的维基百科式解释。使用 Markdown，禁止标题，禁止复述问题，尽量提供上下文之外但与此处含义相关的解释。

如果是一段话：请解释这句话在当前上下文里是什么意思，300 个中文字符以内。使用 Markdown，禁止标题，禁止复述问题。`;

  return [{ role: 'user', content: prompt }];
}

export function buildSelectionLookupProviders({ currentProvider, customModels = [], modelNames = {} }) {
  const customIds = customModels.map(model => model.id).filter(Boolean);
  const knownProviders = new Set([
    ...BUILT_IN_LOOKUP_PROVIDERS,
    ...customIds,
    ...Object.keys(modelNames || {})
  ]);

  return [currentProvider, ...BUILT_IN_LOOKUP_PROVIDERS, ...customIds]
    .filter(Boolean)
    .filter((provider, index, providers) => providers.indexOf(provider) === index)
    .filter(provider => knownProviders.has(provider));
}

export function runSelectionLookup({ messages, providers, onAttempt, onChunk }) {
  let cancelled = false;
  let activeParser = null;
  let activeRunId = '';

  const cancel = () => {
    cancelled = true;
    activeParser?.abort(false);
    if (activeRunId) {
      cancelChatRun(activeRunId).catch(() => {});
      activeRunId = '';
    }
  };

  const promise = (async () => {
    let lastError = null;

    for (const provider of providers) {
      if (cancelled) throw new DOMException('Aborted', 'AbortError');

      let content = '';
      let runError = null;
      let wasAborted = false;
      activeParser = new StreamParser();
      activeRunId = '';
      onAttempt?.(provider);

      try {
        const { runId } = await createChatRun(messages, provider);
        activeRunId = runId;

        await new Promise((resolve) => {
          activeParser.fetchRunEvents(
            runId,
            (chunk) => {
              if (cancelled || chunk.type !== 'content') return;
              content += chunk.content || '';
              onChunk?.(chunk.content || '', provider);
            },
            (error) => {
              runError = error;
              resolve();
            },
            resolve,
            () => {
              wasAborted = true;
              resolve();
            }
          ).catch((error) => {
            runError = error;
            resolve();
          });
        });

        if (cancelled) throw new DOMException('Aborted', 'AbortError');
        if (wasAborted) throw new DOMException('Aborted', 'AbortError');
        if (runError) throw runError;
        if (content.trim()) return { provider, content };
        lastError = new Error(`${provider} 未返回内容`);
      } catch (error) {
        if (cancelled || error.name === 'AbortError') throw error;
        lastError = error;
      } finally {
        activeParser?.abort(false);
        activeParser = null;
        activeRunId = '';
      }
    }

    throw lastError || new Error('没有可用模型');
  })();

  return { promise, cancel };
}
