import { apiGet, apiPost, apiPatch, apiDelete } from './client.js';

export const fetchSessions = () => apiGet('/api/sessions');
export const createSession = () => apiPost('/api/sessions', {});
export const renameSession = (id, title) => apiPatch(`/api/sessions/${id}`, { title });
export const deleteSession = (id) => apiDelete(`/api/sessions/${id}`);
