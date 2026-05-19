import {
  createCollection,
  deleteCollection,
  deleteDocument,
  indexDocument,
  listCollections,
  listDocuments,
  searchCollection,
  updateCollection
} from '../rag/store.js';
import { parseMultipartForm, readRequestBuffer } from '../rag/multipart.js';

export function getRagCollections(_req, res, { json }) {
  json(res, listCollections());
}

export async function createRagCollection(_req, res, { json, parseBody }) {
  try {
    const body = await parseBody(_req);
    json(res, createCollection(body), 201);
  } catch (error) {
    json(res, { error: error.message }, 400);
  }
}

export async function updateRagCollection(req, res, { json, parseBody, collectionId }) {
  try {
    const body = await parseBody(req);
    json(res, updateCollection(collectionId, body));
  } catch (error) {
    json(res, { error: error.message }, error.message === '知识库不存在' ? 404 : 400);
  }
}

export function deleteRagCollection(_req, res, { json, collectionId }) {
  deleteCollection(collectionId);
  json(res, { ok: true });
}

export function getRagDocuments(_req, res, { json, collectionId }) {
  json(res, listDocuments(collectionId));
}

export async function uploadRagDocuments(req, res, { json, collectionId }) {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      json(res, { error: '请使用 multipart/form-data 上传文件' }, 400);
      return;
    }

    const buffer = await readRequestBuffer(req);
    const { files } = parseMultipartForm(buffer, contentType);
    if (files.length === 0) {
      json(res, { error: '没有收到文件' }, 400);
      return;
    }

    const documents = [];
    for (const file of files) {
      documents.push(await indexDocument(collectionId, file));
    }

    json(res, { documents });
  } catch (error) {
    json(res, { error: error.message }, 400);
  }
}

export function deleteRagDocument(_req, res, { json, documentId }) {
  deleteDocument(documentId);
  json(res, { ok: true });
}

export async function searchRagCollection(req, res, { json, collectionId }) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const q = url.searchParams.get('q') || '';
    json(res, await searchCollection(collectionId, q));
  } catch (error) {
    json(res, { error: error.message }, 400);
  }
}
