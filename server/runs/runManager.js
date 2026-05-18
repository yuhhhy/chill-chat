import { Writable } from 'stream';
import { streamChat } from '../providers/modelProviders.js';

const RUN_TTL_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 15000;
const runs = new Map();

function writeSseHeaders(res) {
  if (res.headersSent) return;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

function sendSse(res, event) {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event.data ?? {})}\n\n`);
}

function terminalStatusForEvent(type) {
  if (type === 'done') return 'completed';
  if (type === 'error') return 'failed';
  if (type === 'cancelled') return 'cancelled';
  return null;
}

function createRun(messages, provider) {
  const run = {
    id: crypto.randomUUID(),
    messages,
    provider,
    status: 'running',
    events: [],
    subscribers: new Set(),
    upstream: null,
    sseBuffer: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  runs.set(run.id, run);
  startRun(run);
  return run;
}

function appendEvent(run, type, data = {}) {
  if (run.status !== 'running' && type !== 'delta') return;

  const event = {
    id: run.events.length + 1,
    type,
    data
  };

  run.events.push(event);
  run.updatedAt = Date.now();

  const terminalStatus = terminalStatusForEvent(type);
  if (terminalStatus) {
    run.status = terminalStatus;
  }

  for (const subscriber of run.subscribers) {
    sendSse(subscriber.res, event);
    subscriber.lastSentId = event.id;
  }

  if (terminalStatus) {
    closeSubscribers(run);
  }
}

function closeSubscribers(run) {
  for (const subscriber of run.subscribers) {
    clearInterval(subscriber.heartbeat);
    subscriber.res.end();
  }
  run.subscribers.clear();
}

function parseProviderData(run, data) {
  if (!data) return;

  if (data === '[DONE]') {
    appendEvent(run, 'done');
    return;
  }

  try {
    const parsed = JSON.parse(data);
    if (parsed.error) {
      appendEvent(run, 'error', { message: parsed.error });
      return;
    }

    const delta = parsed.choices?.[0]?.delta;
    if (delta?.reasoning_content) {
      appendEvent(run, 'delta', { type: 'reasoning', content: delta.reasoning_content });
    }
    if (delta?.content) {
      appendEvent(run, 'delta', { type: 'content', content: delta.content });
    }
  } catch (error) {
    appendEvent(run, 'error', { message: `SSE 解析失败：${error.message}` });
  }
}

function consumeProviderSse(run, chunk) {
  run.sseBuffer += chunk.toString('utf8');
  const lines = run.sseBuffer.split('\n');
  run.sseBuffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    parseProviderData(run, line.slice(6).trim());
  }
}

class RunWritable extends Writable {
  constructor(run) {
    super();
    this.run = run;
    this.headersSent = false;
  }

  setHeader() {
    this.headersSent = true;
  }

  _write(chunk, _encoding, callback) {
    consumeProviderSse(this.run, chunk);
    callback();
  }

  end(chunk, encoding, callback) {
    if (typeof chunk === 'function') {
      return super.end(chunk);
    }

    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    if (chunk) {
      consumeProviderSse(this.run, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    }

    super.end(callback);
  }
}

function startRun(run) {
  const sink = new RunWritable(run);
  sink.on('finish', () => {
    if (run.status === 'running') appendEvent(run, 'done');
  });
  sink.on('error', (error) => {
    if (run.status === 'running') appendEvent(run, 'error', { message: error.message });
  });

  run.upstream = streamChat(run.messages, sink, run.provider);
}

function subscribeRun(runId, afterEventId, req, res) {
  const run = runs.get(runId);
  if (!run) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: '生成任务不存在或已过期' }));
    return;
  }

  writeSseHeaders(res);

  const lastSeen = Number.isFinite(afterEventId) ? afterEventId : 0;
  for (const event of run.events) {
    if (event.id > lastSeen) sendSse(res, event);
  }

  if (run.status !== 'running') {
    res.end();
    return;
  }

  const subscriber = {
    res,
    lastSentId: run.events.at(-1)?.id ?? 0,
    heartbeat: setInterval(() => {
      res.write(': heartbeat\n\n');
    }, HEARTBEAT_MS)
  };

  run.subscribers.add(subscriber);

  req.on('close', () => {
    clearInterval(subscriber.heartbeat);
    run.subscribers.delete(subscriber);
  });
}

function cancelRun(runId) {
  const run = runs.get(runId);
  if (!run || run.status !== 'running') return run;

  appendEvent(run, 'cancelled');
  run.upstream?.destroy?.();
  return run;
}

function cleanupRuns() {
  const now = Date.now();
  for (const [id, run] of runs) {
    if (run.status !== 'running' && now - run.updatedAt > RUN_TTL_MS) {
      runs.delete(id);
    }
  }
}

setInterval(cleanupRuns, 5 * 60 * 1000).unref?.();

export const runManager = {
  createRun,
  subscribeRun,
  cancelRun,
  getRun: (runId) => runs.get(runId)
};
