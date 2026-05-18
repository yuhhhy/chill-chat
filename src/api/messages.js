import { apiGet, apiPost, apiDelete } from './client.js';

export const fetchMessages = (sessionId) => apiGet(`/api/sessions/${sessionId}/messages`);
export const saveMessages = (sessionId, messages) =>
  apiPost(`/api/sessions/${sessionId}/messages`, { messages });
export const deleteMessage = (sessionId, messageId) =>
  apiDelete(`/api/sessions/${sessionId}/messages/${messageId}`);
