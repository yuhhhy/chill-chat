class StreamParser {
  constructor() {
    this.sseBuffer = '';
    this.renderQueue = [];
    this.textDecoder = new TextDecoder('utf-8', { stream: true });
    this.abortController = null;
    this.flushInterval = null;
    this.isFlushing = false;
    this.currentOnChunk = null;
    this.currentOnAbort = null;
    this.pendingComplete = null;
    this.streamDone = false;
  }

  async fetchStream(messages, provider, onChunk, onError, onComplete, onAbort) {
    // Abort any previous stream and notify the old caller
    if (this.abortController) {
      this.stopFlush();
      this.renderQueue = [];
      this.streamDone = false;
      this.pendingComplete = null;
      this.currentOnChunk = null;
      const prevOnAbort = this.currentOnAbort;
      this.currentOnAbort = null;
      this.abortController.abort();
      if (prevOnAbort) prevOnAbort();
    }
    this.abortController = new AbortController();
    this.currentOnAbort = onAbort ?? null;
    this.sseBuffer = '';
    this.renderQueue = [];
    this.isFlushing = false;
    this.streamDone = false;
    this.pendingComplete = null;
    this.currentOnChunk = onChunk;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages, provider }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.markStreamDone(onComplete);
          break;
        }

        const chunk = this.textDecoder.decode(value, { stream: true });
        this.sseBuffer += chunk;

        const lines = this.sseBuffer.split('\n');
        this.sseBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              this.markStreamDone(onComplete);
              return;
            }

            try {
              const json = JSON.parse(data);

              if (json.error) {
                this.currentOnAbort = null;
                this.pendingComplete = null;
                this.stopFlush();
                onError(new Error(json.error));
                return;
              }

              if (json.choices && json.choices.length > 0) {
                const delta = json.choices[0].delta;

                if (delta?.reasoning_content) {
                  this.addToRenderBuffer(delta.reasoning_content, 'reasoning');
                }

                if (delta?.content) {
                  this.addToRenderBuffer(delta.content, 'content');
                }
              }
            } catch (jsonError) {
              console.error('JSON parse error:', jsonError);
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Stream aborted');
        this.flushAll();
      } else {
        this.currentOnAbort = null;
        this.pendingComplete = null;
        this.stopFlush();
        onError(error);
      }
    }
  }

  markStreamDone(onComplete) {
    this.currentOnAbort = null;
    if (this.renderQueue.length === 0) {
      this.stopFlush();
      onComplete();
    } else {
      // Let the interval drain naturally, fire onComplete when queue empties
      this.streamDone = true;
      this.pendingComplete = onComplete;
    }
  }

  addToRenderBuffer(content, type = 'content') {
    this.renderQueue.push({ type, content });

    if (!this.isFlushing) {
      this.startFlush();
    }
  }

  startFlush() {
    this.isFlushing = true;
    this.flushInterval = setInterval(() => {
      this.flushChunk();
    }, 16);
  }

  stopFlush() {
    this.isFlushing = false;
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  flushChunk() {
    if (this.renderQueue.length === 0) {
      if (this.streamDone) {
        this.streamDone = false;
        const onComplete = this.pendingComplete;
        this.pendingComplete = null;
        this.stopFlush();
        if (onComplete) onComplete();
      }
      return;
    }

    // Adaptive: drain buffer in ~20 ticks (1s), minimum 6 chars/tick for typewriter feel
    const pendingChars = this.renderQueue.reduce((sum, item) => sum + item.content.length, 0);
    const chunkSize = Math.max(12, Math.ceil(pendingChars / 20));

    const current = this.renderQueue[0];
    const take = Math.min(chunkSize, current.content.length);
    const chunk = current.content.substring(0, take);
    current.content = current.content.substring(take);

    if (current.content.length === 0) {
      this.renderQueue.shift();
    }

    if (this.currentOnChunk) {
      this.currentOnChunk({ type: current.type, content: chunk });
    }
  }

  flushAll() {
    this.streamDone = false;
    this.pendingComplete = null;
    while (this.renderQueue.length > 0) {
      const current = this.renderQueue[0];
      if (this.currentOnChunk) {
        this.currentOnChunk({ type: current.type, content: current.content });
      }
      this.renderQueue.shift();
    }
  }

  abort(flush = true) {
    if (!flush) {
      this.renderQueue = [];
      this.currentOnChunk = null;
    }
    this.currentOnAbort = null;
    this.streamDone = false;
    this.pendingComplete = null;
    this.stopFlush();
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  reset() {
    this.stopFlush();
    this.sseBuffer = '';
    this.renderQueue = [];
    this.textDecoder = new TextDecoder('utf-8', { stream: true });
    this.abortController = null;
    this.isFlushing = false;
    this.currentOnChunk = null;
    this.streamDone = false;
    this.pendingComplete = null;
  }
}

export default StreamParser;
