import { apiGet, apiPatch, apiPost, apiDelete } from './client.js';

export const fetchMessages = (sessionId) => apiGet(`/api/sessions/${sessionId}/messages`);
export const saveMessages = (sessionId, messages) =>
  apiPost(`/api/sessions/${sessionId}/messages`, { messages });
export const saveMessagesOnUnload = (sessionId, messages) => {
  const body = JSON.stringify({ messages });
  const url = `/api/sessions/${sessionId}/messages`;

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon(url, blob)) return true;
  }

  if (typeof fetch !== 'undefined') {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(err => console.error('Failed to save messages on unload:', err));
  }

  return false;
};
export const updateMessage = (sessionId, messageId, content) =>
  apiPatch(`/api/sessions/${sessionId}/messages/${messageId}`, { content });
export const deleteMessage = (sessionId, messageId) =>
  apiDelete(`/api/sessions/${sessionId}/messages/${messageId}`);
