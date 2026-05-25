import { apiGet, apiPost } from './client.js';

export async function createChatRun(messages, provider, ragCollectionId = '', metadata = {}) {
  return apiPost('/api/chat-runs', { messages, provider, ragCollectionId, ...metadata });
}

export async function fetchChatRun(runId) {
  return apiGet(`/api/chat-runs/${encodeURIComponent(runId)}`);
}

export async function cancelChatRun(runId) {
  return apiPost(`/api/chat-runs/${encodeURIComponent(runId)}/cancel`, {});
}
