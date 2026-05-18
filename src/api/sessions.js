import { apiGet, apiPost, apiDelete } from './client.js';

export const fetchSessions = () => apiGet('/api/sessions');
export const createSession = () => apiPost('/api/sessions', {});
export const deleteSession = (id) => apiDelete(`/api/sessions/${id}`);
