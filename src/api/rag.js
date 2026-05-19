import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export function fetchRagCollections() {
  return apiGet('/api/rag/collections');
}

export function createRagCollection(data) {
  return apiPost('/api/rag/collections', data);
}

export function updateRagCollection(collectionId, data) {
  return apiPatch(`/api/rag/collections/${encodeURIComponent(collectionId)}`, data);
}

export function deleteRagCollection(collectionId) {
  return apiDelete(`/api/rag/collections/${encodeURIComponent(collectionId)}`);
}

export function fetchRagDocuments(collectionId) {
  return apiGet(`/api/rag/collections/${encodeURIComponent(collectionId)}/documents`);
}

export async function uploadRagDocuments(collectionId, files) {
  const formData = new FormData();
  Array.from(files).forEach(file => formData.append('files', file));

  const res = await fetch(`/api/rag/collections/${encodeURIComponent(collectionId)}/documents`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    let message = `上传失败：${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // Keep status fallback.
    }
    throw new Error(message);
  }

  return res.json();
}

export function deleteRagDocument(documentId) {
  return apiDelete(`/api/rag/documents/${encodeURIComponent(documentId)}`);
}
