import { randomUUID } from 'crypto';
import * as ragDb from '../db/rag.js';
import { chunkText } from './chunking.js';
import { createEmbeddings } from './embedding.js';
import { extractTextFromFile } from './fileParsers.js';

const TOP_K = 8;
const MIN_SCORE = 0.25;
const MAX_CONTEXT_CHARS = 8000;
const EMBEDDING_BATCH_SIZE = 16;

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

async function embedInBatches(chunks, onProgress) {
  const vectors = [];
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    vectors.push(...await createEmbeddings(batch));
    onProgress?.({
      phase: 'embedding',
      current: vectors.length,
      total: chunks.length,
      percent: Math.round((vectors.length / chunks.length) * 100),
      message: `向量化中 ${vectors.length}/${chunks.length}`
    });
  }
  return vectors;
}

export function listCollections() {
  return ragDb.listCollections().map(toCollection);
}

export function createCollection({ name, description = '' }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('知识库名称不能为空');

  const id = randomUUID();
  ragDb.insertCollection(id, cleanName.slice(0, 80), String(description || '').trim().slice(0, 500));
  return toCollection({ ...ragDb.getCollection(id), document_count: 0, chunk_count: 0 });
}

export function updateCollection(id, { name, description = '' }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('知识库名称不能为空');

  const result = ragDb.updateCollection(cleanName.slice(0, 80), String(description || '').trim().slice(0, 500), id);
  if (result.changes === 0) throw new Error('知识库不存在');
  return listCollections().find(collection => collection.id === id);
}

export function deleteCollection(id) {
  ragDb.deleteCollection(id);
}

export function listDocuments(collectionId) {
  return ragDb.listDocuments(collectionId).map(toDocument);
}

export async function indexDocument(collectionId, file) {
  if (!ragDb.getCollection(collectionId)) throw new Error('知识库不存在');

  const documentId = randomUUID();
  ragDb.insertDocument(documentId, collectionId, file.filename, file.mimeType, file.size, 'indexing');
  ragDb.touchCollection(collectionId);

export async function processDocumentIndex(documentId, file, onProgress) {
  try {
    const indexingDocument = queries.getDocument.get(documentId);
    if (!indexingDocument) throw new Error('文档不存在');

    onProgress?.({ phase: 'parsing', current: 0, total: 0, percent: 5, message: '解析文档中' });
    const text = await extractTextFromFile(file);

    onProgress?.({ phase: 'chunking', current: 0, total: 0, percent: 10, message: '分块中' });
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('文档没有可索引的文本内容');
    onProgress?.({
      phase: 'chunking',
      current: chunks.length,
      total: chunks.length,
      percent: 15,
      message: `已切分 ${chunks.length} 个片段`
    });

    const vectors = await embedInBatches(chunks);
    ragDb.replaceDocumentChunks(documentId, collectionId, chunks, vectors);
  } catch (error) {
    ragDb.updateDocumentStatus('failed', error.message, 0, documentId);
  }

  return toDocument(ragDb.getDocument(documentId));
}

export function deleteDocument(documentId) {
  ragDb.deleteDocument(documentId);
}

export async function searchCollection(collectionId, query, { topK = TOP_K, minScore = MIN_SCORE } = {}) {
  const text = String(query || '').trim();
  if (!text) return [];

  const [queryVector] = await createEmbeddings(text);
  const rows = ragDb.listChunksForCollection(collectionId);

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
