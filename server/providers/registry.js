import { OpenAiProvider, resolveOpenAiUrl } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { ClaudeProvider } from './claude.js';
import { getCustomModel, parseCustomModels } from './customModels.js';
import { writeSseHeaders, writeSseError, writeOpenAiChunk, writeOpenAiDone } from './sse.js';

const MAX_TOKENS = 8192;
const DEFAULT_PROVIDER = 'deepseek';

const providerDefs = {
  chatgpt: {
    label: 'ChatGPT',
    envKey: 'CHATGPT_API_KEY',
    envUrl: 'CHATGPT_API_URL',
    envModel: 'CHATGPT_MODEL',
    envType: 'CHATGPT_API_TYPE',
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
    type: 'openai-compatible',
    Provider: OpenAiProvider
  },
  deepseek: {
    label: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    envUrl: 'DEEPSEEK_API_URL',
    envModel: 'DEEPSEEK_MODEL',
    envType: 'DEEPSEEK_API_TYPE',
    defaultUrl: 'https://api.deepseek.com/v1/chat/completions',
    type: 'openai-compatible',
    Provider: OpenAiProvider
  },
  gemini: {
    label: 'Gemini',
    envKey: 'GEMINI_API_KEY',
    envUrl: 'GEMINI_API_URL',
    envModel: 'GEMINI_MODEL',
    envType: 'GEMINI_API_TYPE',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    type: 'gemini',
    Provider: GeminiProvider
  },
  claude: {
    label: 'Claude',
    envKey: 'CLAUDE_API_KEY',
    envUrl: 'CLAUDE_API_URL',
    envModel: 'CLAUDE_MODEL',
    envType: 'CLAUDE_API_TYPE',
    defaultUrl: 'https://api.anthropic.com/v1/messages',
    type: 'claude',
    Provider: ClaudeProvider
  }
};

function resolveProviderId(provider) {
  const normalized = String(provider || DEFAULT_PROVIDER).toLowerCase();
  if (providerDefs[normalized]) return normalized;
  return getCustomModel(String(provider || '')) ? String(provider) : DEFAULT_PROVIDER;
}

function createProvider(providerId) {
  const customModel = getCustomModel(providerId);
  if (customModel) {
    return new OpenAiProvider({
      label: customModel.label,
      apiKey: customModel.apiKey,
      apiUrl: resolveOpenAiUrl(customModel.apiUrl),
      model: customModel.model,
      maxTokens: MAX_TOKENS
    });
  }

  const def = providerDefs[providerId];
  const apiType = (process.env[def.envType] || def.type).toLowerCase();
  const apiUrl = process.env[def.envUrl] || def.defaultUrl;
  const apiKey = process.env[def.envKey];
  const model = process.env[def.envModel];

  const ProviderClass = (apiType === 'openai' || apiType === 'openai-compatible')
    ? OpenAiProvider
    : def.Provider;

  return new ProviderClass({
    label: def.label,
    apiKey,
    apiUrl,
    model,
    maxTokens: MAX_TOKENS
  });
}

export function getModelNames() {
  const builtIn = Object.fromEntries(
    Object.entries(providerDefs).map(([id, def]) => [id, process.env[def.envModel] || ''])
  );
  const custom = Object.fromEntries(
    parseCustomModels().map(m => [m.id, m.model])
  );
  return { ...builtIn, ...custom };
}

export function streamChat(messages, res, provider) {
  if (provider === '__mock_stream__' && process.env.ENABLE_MOCK_PROVIDER === '1') {
    writeSseHeaders(res);
    const chunks = ['mock ', 'stream ', 'chunk ', 'reconnect ', 'ok'];
    let index = 0;
    const timer = setInterval(() => {
      if (index >= chunks.length) {
        clearInterval(timer);
        writeOpenAiDone(res);
        return;
      }
      writeOpenAiChunk(res, chunks[index]);
      index += 1;
    }, 40);
    return { destroy() { clearInterval(timer); writeSseError(res, 'mock stream cancelled'); } };
  }

  const resolvedId = resolveProviderId(provider);
  const instance = createProvider(resolvedId);

  try {
    return instance.stream(messages, res);
  } catch (error) {
    writeSseError(res, `${instance.label} 配置错误：${error.message}`);
  }
}
