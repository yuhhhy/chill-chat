import http from 'http';
import dotenv from 'dotenv';
import { getSessions, createSession, deleteSession } from './handlers/sessions.js';
import { getMessages, addMessages, deleteMessage, updateMessage } from './handlers/messages.js';
import { handleChatStream } from './handlers/chat.js';
import { createChatRun, subscribeChatRun, cancelChatRun } from './handlers/chatRuns.js';
import { createCustomModel, deleteCustomModel, getCustomModels, updateCustomModel } from './handlers/modelConfig.js';
import {
  createRagCollection,
  deleteRagCollection,
  deleteRagDocument,
  getRagCollections,
  getRagDocuments,
  searchRagCollection,
  updateRagCollection,
  uploadRagDocuments
} from './handlers/rag.js';
import { getModelNames } from './providers/modelProviders.js';

dotenv.config();

const PORT = process.env.PORT || 3001;

function json(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const ctx = { json, parseBody };
  const path = req.url;

  if (req.method === 'GET'  && path === '/api/sessions') return getSessions(req, res, ctx);
  if (req.method === 'POST' && path === '/api/sessions') return createSession(req, res, ctx);
  if (req.method === 'POST' && path === '/api/chat')     return handleChatStream(req, res, ctx);
  if (req.method === 'POST' && path === '/api/chat-runs') return createChatRun(req, res, ctx);
  if (req.method === 'GET'  && path === '/health')            return json(res, { status: 'ok' });
  if (req.method === 'GET'  && path === '/api/config/models') return json(res, getModelNames());
  if (req.method === 'GET'  && path === '/api/config/custom-models') return getCustomModels(req, res, ctx);
  if (req.method === 'POST' && path === '/api/config/custom-models') return createCustomModel(req, res, ctx);
  if (req.method === 'GET'  && path === '/api/rag/collections') return getRagCollections(req, res, ctx);
  if (req.method === 'POST' && path === '/api/rag/collections') return createRagCollection(req, res, ctx);

  const ragCollectionMatch = path.match(/^\/api\/rag\/collections\/([^/?]+)$/);
  if (ragCollectionMatch) {
    const collectionId = decodeURIComponent(ragCollectionMatch[1]);
    if (req.method === 'PATCH') return updateRagCollection(req, res, { ...ctx, collectionId });
    if (req.method === 'DELETE') return deleteRagCollection(req, res, { ...ctx, collectionId });
  }

  const ragDocumentsMatch = path.match(/^\/api\/rag\/collections\/([^/?]+)\/documents$/);
  if (ragDocumentsMatch) {
    const collectionId = decodeURIComponent(ragDocumentsMatch[1]);
    if (req.method === 'GET') return getRagDocuments(req, res, { ...ctx, collectionId });
    if (req.method === 'POST') return uploadRagDocuments(req, res, { ...ctx, collectionId });
  }

  const ragSearchMatch = path.match(/^\/api\/rag\/collections\/([^/?]+)\/search(?:\?.*)?$/);
  if (ragSearchMatch) {
    const collectionId = decodeURIComponent(ragSearchMatch[1]);
    if (req.method === 'GET') return searchRagCollection(req, res, { ...ctx, collectionId });
  }

  const ragDocumentMatch = path.match(/^\/api\/rag\/documents\/([^/?]+)$/);
  if (ragDocumentMatch) {
    const documentId = decodeURIComponent(ragDocumentMatch[1]);
    if (req.method === 'DELETE') return deleteRagDocument(req, res, { ...ctx, documentId });
  }

  const customModelMatch = path.match(/^\/api\/config\/custom-models\/([^/?]+)$/);
  if (customModelMatch) {
    const customModelId = decodeURIComponent(customModelMatch[1]);
    if (req.method === 'PATCH') return updateCustomModel(req, res, { ...ctx, customModelId });
    if (req.method === 'DELETE') return deleteCustomModel(req, res, { ...ctx, customModelId });
  }

  const chatRunEventsMatch = path.match(/^\/api\/chat-runs\/([^/?]+)\/events(?:\?.*)?$/);
  if (chatRunEventsMatch) {
    const runId = decodeURIComponent(chatRunEventsMatch[1]);
    if (req.method === 'GET') return subscribeChatRun(req, res, { ...ctx, runId });
  }

  const chatRunCancelMatch = path.match(/^\/api\/chat-runs\/([^/?]+)\/cancel$/);
  if (chatRunCancelMatch) {
    const runId = decodeURIComponent(chatRunCancelMatch[1]);
    if (req.method === 'POST') return cancelChatRun(req, res, { ...ctx, runId });
  }

  const sessionMatch = path.match(/^\/api\/sessions\/([^/?]+)$/);
  if (sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    if (req.method === 'DELETE') return deleteSession(req, res, { ...ctx, sessionId });
  }

  const messagesMatch = path.match(/^\/api\/sessions\/([^/?]+)\/messages$/);
  if (messagesMatch) {
    const sessionId = decodeURIComponent(messagesMatch[1]);
    if (req.method === 'GET')  return getMessages(req, res, { ...ctx, sessionId });
    if (req.method === 'POST') return addMessages(req, res, { ...ctx, sessionId });
  }

  const messageItemMatch = path.match(/^\/api\/sessions\/([^/?]+)\/messages\/([^/?]+)$/);
  if (messageItemMatch) {
    const sessionId  = decodeURIComponent(messageItemMatch[1]);
    const messageId  = decodeURIComponent(messageItemMatch[2]);
    if (req.method === 'PATCH')  return updateMessage(req, res, { ...ctx, sessionId, messageId });
    if (req.method === 'DELETE') return deleteMessage(req, res, { ...ctx, sessionId, messageId });
  }

  res.statusCode = 404;
  res.end();
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
