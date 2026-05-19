import express from 'express';
import dotenv from 'dotenv';
import { getSessions, createSession, deleteSession } from './handlers/sessions.js';
import { getMessages, addMessages, deleteMessage, updateMessage } from './handlers/messages.js';
import { createChatRun, subscribeChatRun, cancelChatRun } from './handlers/chatRuns.js';
import { getCustomModels, createCustomModel, updateCustomModel, deleteCustomModel } from './handlers/modelConfig.js';
import {
  getRagCollections, createRagCollection, updateRagCollection, deleteRagCollection,
  getRagDocuments, uploadRagDocuments, deleteRagDocument, searchRagCollection
} from './handlers/rag.js';
import { getModelNames } from './providers/modelProviders.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

// Health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Sessions
app.get('/api/sessions', getSessions);
app.post('/api/sessions', createSession);
app.delete('/api/sessions/:sessionId', deleteSession);

// Messages
app.get('/api/sessions/:sessionId/messages', getMessages);
app.post('/api/sessions/:sessionId/messages', addMessages);
app.patch('/api/sessions/:sessionId/messages/:messageId', updateMessage);
app.delete('/api/sessions/:sessionId/messages/:messageId', deleteMessage);

// Chat runs
app.post('/api/chat-runs', createChatRun);
app.get('/api/chat-runs/:runId/events', subscribeChatRun);
app.post('/api/chat-runs/:runId/cancel', cancelChatRun);

// Model config
app.get('/api/config/models', (req, res) => res.json(getModelNames()));
app.get('/api/config/custom-models', getCustomModels);
app.post('/api/config/custom-models', createCustomModel);
app.patch('/api/config/custom-models/:customModelId', updateCustomModel);
app.delete('/api/config/custom-models/:customModelId', deleteCustomModel);

// RAG
app.get('/api/rag/collections', getRagCollections);
app.post('/api/rag/collections', createRagCollection);
app.patch('/api/rag/collections/:collectionId', updateRagCollection);
app.delete('/api/rag/collections/:collectionId', deleteRagCollection);
app.get('/api/rag/collections/:collectionId/documents', getRagDocuments);
app.post('/api/rag/collections/:collectionId/documents', uploadRagDocuments);
app.get('/api/rag/collections/:collectionId/search', searchRagCollection);
app.delete('/api/rag/documents/:documentId', deleteRagDocument);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
