import { runManager } from '../runs/runManager.js';

export async function createChatRun(req, res, { json, parseBody }) {
  try {
    const { messages, provider, ragCollectionId } = await parseBody(req);
    if (!Array.isArray(messages)) {
      json(res, { error: 'messages 必须是数组' }, 400);
      return;
    }

    const run = runManager.createRun(messages, provider, { ragCollectionId });
    json(res, { runId: run.id, status: run.status });
  } catch {
    json(res, { error: '请求格式错误' }, 400);
  }
}

export function subscribeChatRun(req, res, { runId }) {
  const url = new URL(req.url, 'http://localhost');
  const after = Number(url.searchParams.get('after') || req.headers['last-event-id'] || 0);
  runManager.subscribeRun(runId, after, req, res);
}

export function cancelChatRun(_req, res, { json, runId }) {
  const run = runManager.cancelRun(runId);
  if (!run) {
    json(res, { error: '生成任务不存在或已过期' }, 404);
    return;
  }

  json(res, { runId, status: run.status });
}
