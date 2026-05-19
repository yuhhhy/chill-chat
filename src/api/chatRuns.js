import { apiPost } from './client.js';

export async function createChatRun(messages, provider, ragCollectionId = '') {
  return apiPost('/api/chat-runs', { messages, provider, ragCollectionId });
}

export async function cancelChatRun(runId) {
  return apiPost(`/api/chat-runs/${encodeURIComponent(runId)}/cancel`, {});
}
