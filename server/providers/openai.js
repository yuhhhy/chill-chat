import { BaseProvider } from './base.js';

export class OpenAiProvider extends BaseProvider {
  buildRequestBody(messages) {
    return {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: true
    };
  }

  buildRequestUrl() {
    return resolveOpenAiUrl(this.apiUrl);
  }
}

export function resolveOpenAiUrl(apiUrl) {
  let endpoint;
  try {
    endpoint = new URL(apiUrl);
  } catch {
    throw new Error('自定义模型 API 地址必须包含协议和域名，例如：https://api.example.com/v1');
  }

  const pathname = endpoint.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/chat/completions')) {
    endpoint.pathname = `${pathname || ''}/chat/completions`;
  }
  return endpoint.toString();
}
