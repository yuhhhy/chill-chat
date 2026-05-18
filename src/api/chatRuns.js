import { apiPost } from './client.js';

export async function createChatRun(messages, provider) {
  return apiPost('/api/chat-runs', { messages, provider });
}

export async function cancelChatRun(runId) {
  return apiPost(`/api/chat-runs/${encodeURIComponent(runId)}/cancel`, {});
}
