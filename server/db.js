import Database from 'better-sqlite3';

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
  CREATE TABLE IF NOT EXISTS rag_collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS rag_documents (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT NOT NULL DEFAULT '',
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (collection_id) REFERENCES rag_collections(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS rag_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    embedding TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (document_id) REFERENCES rag_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES rag_collections(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS message_sources (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    chunk_id TEXT,
    citation_order INTEGER NOT NULL,
    score REAL NOT NULL,
    collection_id TEXT NOT NULL DEFAULT '',
    document_id TEXT NOT NULL DEFAULT '',
    document_name TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    excerpt TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_rag_documents_collection ON rag_documents(collection_id);
  CREATE INDEX IF NOT EXISTS idx_rag_chunks_collection ON rag_chunks(collection_id);
  CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_message_sources_message ON message_sources(message_id);
`);

const messageColumns = db.prepare('PRAGMA table_info(messages)').all().map(column => column.name);
if (!messageColumns.includes('reasoning_content')) {
  db.exec("ALTER TABLE messages ADD COLUMN reasoning_content TEXT NOT NULL DEFAULT ''");
}
if (!messageColumns.includes('model_provider')) {
  db.exec("ALTER TABLE messages ADD COLUMN model_provider TEXT NOT NULL DEFAULT ''");
}
if (!messageColumns.includes('status')) {
  db.exec("ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'");
}

export const stmt = {
  listSessions:  db.prepare('SELECT * FROM sessions ORDER BY created_at DESC'),
  getSession:    db.prepare('SELECT * FROM sessions WHERE id = ?'),
  createSession: db.prepare('INSERT INTO sessions (id) VALUES (?)'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
  updateTitle:   db.prepare('UPDATE sessions SET title = ? WHERE id = ?'),
  listMessages:  db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'),
  insertMessage: db.prepare('INSERT INTO messages (id, session_id, role, content, reasoning_content, model_provider, status) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  countMessages:  db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?'),
  updateMessage:  db.prepare('UPDATE messages SET content = ? WHERE id = ? AND session_id = ?'),
  deleteMessage:  db.prepare('DELETE FROM messages WHERE id = ? AND session_id = ?'),
  listMessageSources: db.prepare('SELECT * FROM message_sources WHERE message_id = ? ORDER BY citation_order ASC'),
  insertMessageSource: db.prepare(`INSERT INTO message_sources (
    id, message_id, chunk_id, citation_order, score, collection_id, document_id, document_name, chunk_index, excerpt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  deleteMessageSources: db.prepare('DELETE FROM message_sources WHERE message_id = ?'),
};

export default db;
