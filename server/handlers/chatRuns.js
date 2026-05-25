import { runManager } from '../runs/runManager.js';

export function createChatRun(req, res) {
  const { messages, provider, ragCollectionId, sessionId, assistantMessageId } = req.body;
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: 'messages 必须是数组' });
    return;
  }

  const run = runManager.createRun(messages, provider, { ragCollectionId, sessionId, assistantMessageId });
  res.json({ runId: run.id, status: run.status });
}

function serializeRun(run) {
  return {
    runId: run.id,
    status: run.status,
    sessionId: run.sessionId,
    assistantMessageId: run.assistantMessageId,
    provider: run.provider,
    ragCollectionId: run.ragCollectionId,
    lastEventId: run.events.at(-1)?.id ?? 0
  };
}

export function getChatRun(req, res) {
  const run = runManager.getRun(req.params.runId);
  if (!run) {
    res.status(404).json({ error: '生成任务不存在或已过期' });
    return;
  }

  res.json(serializeRun(run));
}

export function getActiveChatRun(req, res) {
  const { sessionId } = req.query;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId 必填' });
    return;
  }

  const run = runManager.getActiveRunForSession(sessionId);
  res.json(run ? serializeRun(run) : null);
}

export function subscribeChatRun(req, res) {
  const after = Number(req.query.after || req.headers['last-event-id'] || 0);
  runManager.subscribeRun(req.params.runId, after, req, res);
}

export function cancelChatRun(req, res) {
  const run = runManager.cancelRun(req.params.runId);
  if (!run) {
    res.status(404).json({ error: '生成任务不存在或已过期' });
    return;
  }

  res.json({ runId: req.params.runId, status: run.status });
}
