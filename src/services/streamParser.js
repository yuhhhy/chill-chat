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
    this.lastEventId = 0;
    this.terminalEventReceived = false;
  }

  async fetchRunEvents(runId, onChunk, onError, onComplete, onAbort) {
    if (this.abortController) {
      const prevOnAbort = this.currentOnAbort;
      this.abort(false);
      if (prevOnAbort) prevOnAbort();
    }

    this.abortController = new AbortController();
    this.currentOnAbort = onAbort ?? null;
    this.currentOnChunk = onChunk;
    this.sseBuffer = '';
    this.renderQueue = [];
    this.textDecoder = new TextDecoder('utf-8', { stream: true });
    this.isFlushing = false;
    this.streamDone = false;
    this.pendingComplete = null;
    this.lastEventId = 0;
    this.terminalEventReceived = false;

    const maxReconnects = 6;
    let reconnects = 0;

    while (!this.abortController.signal.aborted) {
      try {
        await this.readRunEventStream(runId, onError, onComplete, onAbort);
        return;
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('Stream aborted');
          this.flushAll();
          return;
        }

        reconnects += 1;
        if (reconnects > maxReconnects) {
          this.currentOnAbort = null;
          this.pendingComplete = null;
          this.stopFlush();
          onError(error);
          return;
        }

        await this.waitForReconnect(reconnects);
      }
    }
  }

  async readRunEventStream(runId, onError, onComplete, onAbort) {
    const response = await fetch(`/api/chat-runs/${encodeURIComponent(runId)}/events?after=${this.lastEventId}`, {
      signal: this.abortController.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (!this.terminalEventReceived) {
          throw new Error('SSE 连接意外断开');
        }
        return;
      }

      this.sseBuffer += this.textDecoder.decode(value, { stream: true });
      const frames = this.sseBuffer.split('\n\n');
      this.sseBuffer = frames.pop() || '';

      for (const frame of frames) {
        this.handleRunEventFrame(frame, onError, onComplete, onAbort);
      }
    }
  }

  handleRunEventFrame(frame, onError, onComplete, onAbort) {
    if (!frame.trim() || frame.startsWith(':')) return;

    const event = { id: null, type: 'message', data: '' };
    for (const line of frame.split('\n')) {
      if (line.startsWith('id:')) {
        event.id = Number(line.slice(3).trim());
      } else if (line.startsWith('event:')) {
        event.type = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        event.data += line.slice(5).trim();
      }
    }

    if (Number.isFinite(event.id)) {
      this.lastEventId = Math.max(this.lastEventId, event.id);
    }

    let data = {};
    if (event.data) {
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        onError(new Error(`SSE 事件解析失败：${error.message}`));
        return;
      }
    }

    if (event.type === 'delta') {
      this.addToRenderBuffer(data.content || '', data.type || 'content');
      return;
    }

    if (event.type === 'sources') {
      if (this.currentOnChunk) {
        this.currentOnChunk({ type: 'sources', sources: data.sources || [] });
      }
      return;
    }

    if (event.type === 'done') {
      this.terminalEventReceived = true;
      this.markStreamDone(onComplete);
      return;
    }

    if (event.type === 'cancelled') {
      this.terminalEventReceived = true;
      this.streamDone = true;
      this.flushAll();
      this.currentOnAbort = null;
      if (onAbort) onAbort();
      return;
    }

    if (event.type === 'error') {
      this.terminalEventReceived = true;
      this.streamDone = true;
      this.currentOnAbort = null;
      this.pendingComplete = null;
      this.stopFlush();
      onError(new Error(data.message || '生成失败'));
    }
  }

  waitForReconnect(attempt) {
    const delay = Math.min(3000, 250 * (2 ** (attempt - 1)));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      this.abortController.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
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
    if (flush) {
      this.flushAll();
      this.currentOnChunk = null;
    }
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
    this.lastEventId = 0;
    this.terminalEventReceived = false;
  }
}

export default StreamParser;
