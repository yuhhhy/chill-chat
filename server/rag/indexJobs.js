const JOB_TTL_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 15000;
const jobs = new Map();

function snapshot(job) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    current: job.current,
    total: job.total,
    percent: job.percent,
    message: job.message,
    document: job.document,
    error: job.error
  };
}

function sendSse(res, event) {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event.data ?? {})}\n\n`);
}

function writeSseHeaders(res) {
  if (res.headersSent) return;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

function appendEvent(job, type) {
  const event = {
    id: job.events.length + 1,
    type,
    data: snapshot(job)
  };

  job.events.push(event);
  job.updatedAt = Date.now();

  for (const subscriber of job.subscribers) {
    sendSse(subscriber.res, event);
  }

  if (type === 'done' || type === 'error') {
    for (const subscriber of job.subscribers) {
      clearInterval(subscriber.heartbeat);
      subscriber.res.end();
    }
    job.subscribers.clear();
  }
}

function createJob(document) {
  const job = {
    id: crypto.randomUUID(),
    status: 'running',
    phase: 'waiting',
    current: 0,
    total: 0,
    percent: 0,
    message: '等待索引',
    document,
    error: '',
    events: [],
    subscribers: new Set(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  jobs.set(job.id, job);
  appendEvent(job, 'progress');
  return snapshot(job);
}

function updateJob(jobId, patch = {}) {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'running') return null;

  Object.assign(job, patch);
  appendEvent(job, 'progress');
  return snapshot(job);
}

function completeJob(jobId, document) {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'running') return null;

  Object.assign(job, {
    status: 'completed',
    phase: 'done',
    current: 1,
    total: 1,
    percent: 100,
    message: '索引完成',
    document,
    error: ''
  });
  appendEvent(job, 'done');
  return snapshot(job);
}

function failJob(jobId, error, document) {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'running') return null;

  Object.assign(job, {
    status: 'failed',
    phase: 'error',
    percent: 100,
    message: error.message || '索引失败',
    document: document || job.document,
    error: error.message || '索引失败'
  });
  appendEvent(job, 'error');
  return snapshot(job);
}

function subscribeJob(jobId, afterEventId, req, res) {
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: '索引任务不存在或已过期' });
    return;
  }

  writeSseHeaders(res);

  const lastSeen = Number.isFinite(afterEventId) ? afterEventId : 0;
  for (const event of job.events) {
    if (event.id > lastSeen) sendSse(res, event);
  }

  if (job.status !== 'running') {
    res.end();
    return;
  }

  const subscriber = {
    res,
    heartbeat: setInterval(() => {
      res.write(': heartbeat\n\n');
    }, HEARTBEAT_MS)
  };

  job.subscribers.add(subscriber);

  req.on('close', () => {
    clearInterval(subscriber.heartbeat);
    job.subscribers.delete(subscriber);
  });
}

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

setInterval(cleanupJobs, 5 * 60 * 1000).unref?.();

export const indexJobs = {
  completeJob,
  createJob,
  failJob,
  subscribeJob,
  updateJob
};
