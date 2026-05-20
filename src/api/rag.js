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

export function uploadRagDocument(collectionId, file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('files', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/rag/collections/${encodeURIComponent(collectionId)}/documents`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.round((event.loaded / event.total) * 100)
      });
    };

    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        // Keep null response fallback.
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data?.error || `上传失败：${xhr.status}`));
        return;
      }

      resolve(data);
    };

    xhr.onerror = () => reject(new Error('上传失败，请检查网络连接'));
    xhr.onabort = () => reject(new Error('上传已取消'));
    xhr.send(formData);
  });
}

export function subscribeRagIndexJob(jobId, { onDone, onError, onProgress } = {}) {
  const eventSource = new EventSource(`/api/rag/index-jobs/${encodeURIComponent(jobId)}/events`);

  const parseEvent = (event) => {
    try {
      return JSON.parse(event.data || '{}');
    } catch {
      return {};
    }
  };

  eventSource.addEventListener('progress', (event) => {
    onProgress?.(parseEvent(event));
  });

  eventSource.addEventListener('done', (event) => {
    const data = parseEvent(event);
    onProgress?.(data);
    onDone?.(data);
    eventSource.close();
  });

  eventSource.addEventListener('error', (event) => {
    if (event.data) {
      const data = parseEvent(event);
      onError?.(new Error(data.error || data.message || '索引失败'), data);
      eventSource.close();
    }
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) return;
    onError?.(new Error('索引进度连接断开'));
    eventSource.close();
  };

  return () => eventSource.close();
}

export function deleteRagDocument(documentId) {
  return apiDelete(`/api/rag/documents/${encodeURIComponent(documentId)}`);
}
