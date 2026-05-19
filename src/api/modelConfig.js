import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export async function fetchCustomModels() {
  const data = await apiGet('/api/config/custom-models');
  return data.customModels || [];
}

export async function createCustomModel(model) {
  const data = await apiPost('/api/config/custom-models', model);
  return data.customModels || [];
}

export async function updateCustomModel(id, model) {
  const data = await apiPatch(`/api/config/custom-models/${encodeURIComponent(id)}`, model);
  return data.customModels || [];
}

export async function deleteCustomModel(id) {
  const data = await apiDelete(`/api/config/custom-models/${encodeURIComponent(id)}`);
  return data.customModels || [];
}
