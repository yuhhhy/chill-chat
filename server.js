import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

dotenv.config();

const API_KEY = process.env.DEEPSEEK_API_KEY;
const PORT = process.env.PORT || 3001;

// --- Database ---

const db = new Database('./chat.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

const stmt = {
  listSessions:  db.prepare('SELECT * FROM sessions ORDER BY created_at DESC'),
  getSession:    db.prepare('SELECT * FROM sessions WHERE id = ?'),
  createSession: db.prepare('INSERT INTO sessions (id) VALUES (?)'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
  updateTitle:   db.prepare('UPDATE sessions SET title = ? WHERE id = ?'),
  listMessages:  db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'),
  insertMessage: db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)'),
  countMessages: db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?'),
};

// --- Helpers ---

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

function json(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// --- Session handlers ---

function getSessions(req, res) {
  json(res, stmt.listSessions.all());
}

function createSession(req, res) {
  const id = randomUUID();
  stmt.createSession.run(id);
  json(res, stmt.getSession.get(id), 201);
}

function deleteSession(req, res, sessionId) {
  stmt.deleteSession.run(sessionId);
  json(res, { ok: true });
}

function getMessages(req, res, sessionId) {
  json(res, stmt.listMessages.all(sessionId));
}

async function addMessages(req, res, sessionId) {
  try {
    const { messages } = await parseBody(req);

    const isFirstBatch = stmt.countMessages.get(sessionId).count === 0;

    const insertAll = db.transaction((msgs) => {
      for (const msg of msgs) {
        stmt.insertMessage.run(randomUUID(), sessionId, msg.role, msg.content);
      }
    });
    insertAll(messages);

    if (isFirstBatch) {
      const firstUser = messages.find(m => m.role === 'user');
      if (firstUser) {
        stmt.updateTitle.run(firstUser.content.slice(0, 20), sessionId);
      }
    }

    json(res, stmt.getSession.get(sessionId));
  } catch (err) {
    json(res, { error: err.message }, 400);
  }
}

// --- Streaming handler ---

async function handleChatStream(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { messages } = JSON.parse(body);
      streamToDeepSeek(messages, res);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: '请求格式错误' }));
    }
  });
}

function streamToDeepSeek(messages, res) {
  const requestBody = {
    model: 'deepseek-v4-flash',
    messages,
    max_tokens: 4000,
    temperature: 0.7,
    stream: true
  };

  const options = {
    hostname: 'api.deepseek.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'User-Agent': 'Node.js-Client',
      'Accept': '*/*'
    }
  };

  const maasReq = https.request(options, (maasRes) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    maasRes.pipe(res);
  });

  maasReq.on('error', (error) => {
    res.write(`data: {"error": "流式请求失败：${error.message}"}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  maasReq.on('timeout', () => {
    maasReq.destroy();
    res.write('data: {"error": "请求超时"}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  });

  maasReq.write(JSON.stringify(requestBody));
  maasReq.end();
}

// --- Router ---

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const path = req.url;

  if (req.method === 'GET'  && path === '/api/sessions') return getSessions(req, res);
  if (req.method === 'POST' && path === '/api/sessions') return createSession(req, res);
  if (req.method === 'POST' && path === '/api/chat')     return handleChatStream(req, res);
  if (req.method === 'GET'  && path === '/health')       return json(res, { status: 'ok' });

  const sessionMatch = path.match(/^\/api\/sessions\/([^/?]+)$/);
  if (sessionMatch) {
    const sid = decodeURIComponent(sessionMatch[1]);
    if (req.method === 'DELETE') return deleteSession(req, res, sid);
  }

  const messagesMatch = path.match(/^\/api\/sessions\/([^/?]+)\/messages$/);
  if (messagesMatch) {
    const sid = decodeURIComponent(messagesMatch[1]);
    if (req.method === 'GET')  return getMessages(req, res, sid);
    if (req.method === 'POST') return addMessages(req, res, sid);
  }

  res.statusCode = 404;
  res.end();
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
