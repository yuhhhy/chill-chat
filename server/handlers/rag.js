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

export function getRagCollections(req, res) {
  res.json(listCollections());
}

export async function createRagCollection(req, res) {
  try {
    res.status(201).json(createCollection(req.body));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function updateRagCollection(req, res) {
  try {
    res.json(updateCollection(req.params.collectionId, req.body));
  } catch (error) {
    res.status(error.message === '知识库不存在' ? 404 : 400).json({ error: error.message });
  }
}

export function deleteRagCollection(req, res) {
  deleteCollection(req.params.collectionId);
  res.json({ ok: true });
}

export function getRagDocuments(req, res) {
  res.json(listDocuments(req.params.collectionId));
}

export async function uploadRagDocuments(req, res) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    res.status(400).json({ error: '请使用 multipart/form-data 上传文件' });
    return;
  }

  try {
    const buffer = await readRequestBuffer(req);
    const { files } = parseMultipartForm(buffer, contentType);
    if (files.length === 0) {
      res.status(400).json({ error: '没有收到文件' });
      return;
    }

    const documents = [];
    for (const file of files) {
      documents.push(await indexDocument(req.params.collectionId, file));
    }

    res.json({ documents });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export function deleteRagDocument(req, res) {
  deleteDocument(req.params.documentId);
  res.json({ ok: true });
}

export async function searchRagCollection(req, res) {
  try {
    res.json(await searchCollection(req.params.collectionId, req.query.q || ''));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
