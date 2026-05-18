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
`);

export const stmt = {
  listSessions:  db.prepare('SELECT * FROM sessions ORDER BY created_at DESC'),
  getSession:    db.prepare('SELECT * FROM sessions WHERE id = ?'),
  createSession: db.prepare('INSERT INTO sessions (id) VALUES (?)'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
  updateTitle:   db.prepare('UPDATE sessions SET title = ? WHERE id = ?'),
  listMessages:  db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'),
  insertMessage: db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)'),
  countMessages:  db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?'),
  deleteMessage:  db.prepare('DELETE FROM messages WHERE id = ? AND session_id = ?'),
};

export default db;
