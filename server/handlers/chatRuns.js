import { runManager } from '../runs/runManager.js';

export function createChatRun(req, res) {
  const { messages, provider, ragCollectionId } = req.body;
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: 'messages 必须是数组' });
    return;
  }

  const run = runManager.createRun(messages, provider, { ragCollectionId });
  res.json({ runId: run.id, status: run.status });
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
