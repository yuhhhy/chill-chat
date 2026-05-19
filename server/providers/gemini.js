import { BaseProvider } from './base.js';
import { parseSseStream } from '../lib/httpClient.js';
import { writeOpenAiChunk, writeOpenAiDone, writeSseError } from './sse.js';

export class GeminiProvider extends BaseProvider {
  buildRequestUrl() {
    const baseUrl = this.apiUrl.replace(/\/$/, '');
    return `${baseUrl}/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`;
  }

  buildRequestHeaders() {
    return { 'x-goog-api-key': this.apiKey };
  }

  buildRequestBody(messages) {
    const body = {
      contents: this._mapMessages(messages),
      generationConfig: { maxOutputTokens: this.maxTokens, temperature: this.temperature }
    };
    const systemPrompt = this.getSystemPrompt(messages);
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
    return body;
  }

  _consumeUpstream(upstreamRes, res) {
    parseSseStream(upstreamRes, (data) => {
      try {
        const parsed = JSON.parse(data);
        for (const part of parsed?.candidates?.[0]?.content?.parts || []) {
          writeOpenAiChunk(res, part.text || '');
        }
      } catch (error) {
        console.error('Gemini stream parse error:', error);
      }
    }, () => writeOpenAiDone(res));
  }

  _mapMessages(messages) {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
  }
}
