import { apiGet, apiPost } from './client.js';

export const fetchMessages = (sessionId) => apiGet(`/api/sessions/${sessionId}/messages`);
export const saveMessages = (sessionId, messages) =>
  apiPost(`/api/sessions/${sessionId}/messages`, { messages });
