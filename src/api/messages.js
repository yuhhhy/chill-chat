import { apiGet, apiPatch, apiPost, apiDelete } from './client.js';

export const fetchMessages = (sessionId) => apiGet(`/api/sessions/${sessionId}/messages`);
export const saveMessages = (sessionId, messages) =>
  apiPost(`/api/sessions/${sessionId}/messages`, { messages });
export const updateMessage = (sessionId, messageId, content) =>
  apiPatch(`/api/sessions/${sessionId}/messages/${messageId}`, { content });
export const deleteMessage = (sessionId, messageId) =>
  apiDelete(`/api/sessions/${sessionId}/messages/${messageId}`);
