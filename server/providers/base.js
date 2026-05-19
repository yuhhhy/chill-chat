import { requestStream } from '../lib/httpClient.js';
import { writeSseHeaders, writeSseError, writeOpenAiChunk, writeOpenAiDone } from './sse.js';

export class BaseProvider {
  constructor(config) {
    this.label = config.label;
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl;
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 8192;
    this.temperature = config.temperature ?? 0.7;
  }

  validate() {
    if (!this.apiKey) throw new Error(`${this.label} API Key 未配置`);
    if (!this.model) throw new Error(`${this.label} 模型名称未配置`);
  }

  buildRequestBody(messages) {
    throw new Error('subclass must implement buildRequestBody');
  }

  buildRequestUrl() {
    return this.apiUrl;
  }

  buildRequestHeaders() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  handleUpstreamChunk(_parsed, _writeChunk) {
    throw new Error('subclass must implement handleUpstreamChunk');
  }

  getSystemPrompt(messages) {
    return messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n');
  }

  stream(messages, res) {
    this.validate();
    writeSseHeaders(res);

    const upstream = requestStream({
      url: this.buildRequestUrl(messages),
      body: this.buildRequestBody(messages),
      headers: this.buildRequestHeaders()
    }, (upstreamRes) => {
      if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
        this._handleUpstreamError(upstreamRes, res);
        return;
      }
      this._consumeUpstream(upstreamRes, res);
    });

    upstream.on('error', (error) => writeSseError(res, `流式请求失败：${error.message}`));
    upstream.on('timeout', () => {
      upstream.destroy();
      writeSseError(res, '请求超时');
    });

    return upstream;
  }

  _consumeUpstream(upstreamRes, res) {
    upstreamRes.pipe(res);
  }

  _handleUpstreamError(upstreamRes, res) {
    let body = '';
    upstreamRes.on('data', chunk => { body += chunk; });
    upstreamRes.on('end', () => {
      let message = `${this.label} 请求失败：HTTP ${upstreamRes.statusCode}`;
      try {
        const parsed = JSON.parse(body);
        message = parsed?.error?.message || parsed?.error?.status || message;
      } catch {
        if (body.trim()) message = body.trim();
      }
      writeSseError(res, message);
    });
  }
}
