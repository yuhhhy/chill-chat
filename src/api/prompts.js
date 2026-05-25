import { apiGet, apiPost, apiPatch, apiDelete } from './client.js';

export const fetchPrompts = () => apiGet('/api/prompts');
export const createPrompt = (title, content) => apiPost('/api/prompts', { title, content });
export const updatePrompt = (id, title, content) => apiPatch(`/api/prompts/${id}`, { title, content });
export const deletePrompt = (id) => apiDelete(`/api/prompts/${id}`);
