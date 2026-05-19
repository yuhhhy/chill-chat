import { BaseProvider } from './base.js';
import { parseSseStream } from '../lib/httpClient.js';
import { writeOpenAiChunk, writeOpenAiDone } from './sse.js';

export class ClaudeProvider extends BaseProvider {
  buildRequestHeaders() {
    return {
      'anthropic-version': process.env.CLAUDE_API_VERSION || '2023-06-01',
      'x-api-key': this.apiKey
    };
  }

  buildRequestBody(messages) {
    const body = {
      model: this.model,
      messages: this._mapMessages(messages),
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: true
    };
    const systemPrompt = this.getSystemPrompt(messages);
    if (systemPrompt) body.system = systemPrompt;
    return body;
  }

  _consumeUpstream(upstreamRes, res) {
    parseSseStream(upstreamRes, (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta') {
          writeOpenAiChunk(res, parsed.delta?.text || '');
        }
      } catch (error) {
        console.error('Claude stream parse error:', error);
      }
    }, () => writeOpenAiDone(res));
  }

  _mapMessages(messages) {
    return messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));
  }
}
