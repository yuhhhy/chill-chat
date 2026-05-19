import { randomUUID } from 'crypto';
import db from '../db.js';
import { chunkText } from './chunking.js';
import { createEmbeddings } from './embedding.js';
import { extractTextFromFile } from './fileParsers.js';

const TOP_K = 5;
const MIN_SCORE = 0.2;
const MAX_CONTEXT_CHARS = 6000;
const EMBEDDING_BATCH_SIZE = 16;

const queries = {
  listCollections: db.prepare(`
    SELECT c.*,
      COUNT(DISTINCT d.id) AS document_count,
      COUNT(ch.id) AS chunk_count
    FROM rag_collections c
    LEFT JOIN rag_documents d ON d.collection_id = c.id
    LEFT JOIN rag_chunks ch ON ch.collection_id = c.id
    GROUP BY c.id
    ORDER BY c.updated_at DESC, c.created_at DESC
  `),
  getCollection: db.prepare('SELECT * FROM rag_collections WHERE id = ?'),
  insertCollection: db.prepare('INSERT INTO rag_collections (id, name, description) VALUES (?, ?, ?)'),
  updateCollection: db.prepare('UPDATE rag_collections SET name = ?, description = ?, updated_at = unixepoch() WHERE id = ?'),
  deleteCollection: db.prepare('DELETE FROM rag_collections WHERE id = ?'),
  touchCollection: db.prepare('UPDATE rag_collections SET updated_at = unixepoch() WHERE id = ?'),
  listDocuments: db.prepare('SELECT * FROM rag_documents WHERE collection_id = ? ORDER BY created_at DESC'),
  getDocument: db.prepare('SELECT * FROM rag_documents WHERE id = ?'),
  insertDocument: db.prepare(`INSERT INTO rag_documents (
    id, collection_id, filename, mime_type, size, status
  ) VALUES (?, ?, ?, ?, ?, ?)`),
  updateDocumentStatus: db.prepare(`UPDATE rag_documents
    SET status = ?, error_message = ?, chunk_count = ?, updated_at = unixepoch()
    WHERE id = ?`),
  deleteDocument: db.prepare('DELETE FROM rag_documents WHERE id = ?'),
  deleteDocumentChunks: db.prepare('DELETE FROM rag_chunks WHERE document_id = ?'),
  insertChunk: db.prepare(`INSERT INTO rag_chunks (
    id, document_id, collection_id, chunk_index, content, char_count, embedding
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  listChunksForCollection: db.prepare(`
    SELECT ch.*, d.filename AS document_name
    FROM rag_chunks ch
    JOIN rag_documents d ON d.id = ch.document_id
    WHERE ch.collection_id = ?
  `)
};

function toCollection(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    documentCount: row.document_count || 0,
    chunkCount: row.chunk_count || 0
  };
}

function toDocument(row) {
  return {
    id: row.id,
    collectionId: row.collection_id,
    filename: row.filename,
    mimeType: row.mime_type,
    size: row.size,
    status: row.status,
    errorMessage: row.error_message,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  const length = Math.min(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }

  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function excerptFor(content) {
  return content.replace(/\s+/g, ' ').trim().slice(0, 360);
}

async function embedInBatches(chunks) {
  const vectors = [];
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    vectors.push(...await createEmbeddings(batch));
  }
  return vectors;
}

export function listCollections() {
  return queries.listCollections.all().map(toCollection);
}

export function createCollection({ name, description = '' }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('知识库名称不能为空');

  const id = randomUUID();
  queries.insertCollection.run(id, cleanName.slice(0, 80), String(description || '').trim().slice(0, 500));
  return toCollection({ ...queries.getCollection.get(id), document_count: 0, chunk_count: 0 });
}

export function updateCollection(id, { name, description = '' }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('知识库名称不能为空');

  const result = queries.updateCollection.run(cleanName.slice(0, 80), String(description || '').trim().slice(0, 500), id);
  if (result.changes === 0) throw new Error('知识库不存在');
  return listCollections().find(collection => collection.id === id);
}

export function deleteCollection(id) {
  queries.deleteCollection.run(id);
}

export function listDocuments(collectionId) {
  return queries.listDocuments.all(collectionId).map(toDocument);
}

export async function indexDocument(collectionId, file) {
  if (!queries.getCollection.get(collectionId)) throw new Error('知识库不存在');

  const documentId = randomUUID();
  queries.insertDocument.run(documentId, collectionId, file.filename, file.mimeType, file.size, 'indexing');
  queries.touchCollection.run(collectionId);

  try {
    const text = await extractTextFromFile(file);
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('文档没有可索引的文本内容');

    const vectors = await embedInBatches(chunks);

    const replaceChunks = db.transaction(() => {
      queries.deleteDocumentChunks.run(documentId);
      chunks.forEach((content, index) => {
        queries.insertChunk.run(
          randomUUID(),
          documentId,
          collectionId,
          index,
          content,
          content.length,
          JSON.stringify(vectors[index])
        );
      });
      queries.updateDocumentStatus.run('ready', '', chunks.length, documentId);
      queries.touchCollection.run(collectionId);
    });
    replaceChunks();
  } catch (error) {
    queries.updateDocumentStatus.run('failed', error.message, 0, documentId);
  }

  return toDocument(queries.getDocument.get(documentId));
}

export function deleteDocument(documentId) {
  queries.deleteDocument.run(documentId);
}

export async function searchCollection(collectionId, query, { topK = TOP_K, minScore = MIN_SCORE } = {}) {
  const text = String(query || '').trim();
  if (!text) return [];

  const [queryVector] = await createEmbeddings(text);
  const rows = queries.listChunksForCollection.all(collectionId);

  return rows
    .map((row) => {
      let embedding = [];
      try {
        embedding = JSON.parse(row.embedding);
      } catch {
        embedding = [];
      }

      return {
        chunkId: row.id,
        collectionId: row.collection_id,
        documentId: row.document_id,
        documentName: row.document_name,
        chunkIndex: row.chunk_index,
        content: row.content,
        excerpt: excerptFor(row.content),
        score: cosineSimilarity(queryVector, embedding)
      };
    })
    .filter(result => result.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((result, index) => ({ ...result, order: index + 1 }));
}

export async function buildRagContext(collectionId, messages) {
  if (!collectionId) return { messages, sources: [] };

  const latestUser = [...messages].reverse().find(message => message.role === 'user');
  if (!latestUser?.content?.trim()) return { messages, sources: [] };

  const sources = await searchCollection(collectionId, latestUser.content, { topK: TOP_K, minScore: MIN_SCORE });
  if (sources.length === 0) return { messages, sources: [] };

  let usedChars = 0;
  const selected = [];
  for (const source of sources) {
    if (usedChars >= MAX_CONTEXT_CHARS) break;
    const remaining = MAX_CONTEXT_CHARS - usedChars;
    const content = source.content.slice(0, remaining);
    usedChars += content.length;
    selected.push({ ...source, content });
  }

  const contextText = selected
    .map(source => `[${source.order}] ${source.documentName} · chunk ${source.chunkIndex + 1} · similarity ${source.score.toFixed(3)}\n${source.content}`)
    .join('\n\n');

  const systemMessage = {
    role: 'system',
    content: [
      '你正在使用本地 RAG 知识库回答问题。',
      '请优先依据下面的检索上下文作答；如果上下文不足以支持结论，请明确说明不确定或缺少资料。',
      '引用资料时使用 [1]、[2] 这样的编号，对应上下文编号。',
      '',
      '检索上下文：',
      contextText
    ].join('\n')
  };

  return { messages: [systemMessage, ...messages], sources: selected };
}

export const ragInternals = {
  chunkText,
  cosineSimilarity
};
