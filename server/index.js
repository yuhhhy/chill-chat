import http from 'http';
import dotenv from 'dotenv';
import { getSessions, createSession, deleteSession } from './handlers/sessions.js';
import { getMessages, addMessages, deleteMessage } from './handlers/messages.js';
import { handleChatStream } from './handlers/chat.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
  if (req.method === 'GET'  && path === '/health')       return json(res, { status: 'ok' });

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
    if (req.method === 'DELETE') return deleteMessage(req, res, { ...ctx, sessionId, messageId });
  }

  res.statusCode = 404;
  res.end();
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
