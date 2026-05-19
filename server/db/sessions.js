import db from './connection.js';

const queries = {
  list:   db.prepare('SELECT * FROM sessions ORDER BY created_at DESC'),
  get:    db.prepare('SELECT * FROM sessions WHERE id = ?'),
  insert: db.prepare('INSERT INTO sessions (id) VALUES (?)'),
  delete: db.prepare('DELETE FROM sessions WHERE id = ?'),
  updateTitle: db.prepare('UPDATE sessions SET title = ? WHERE id = ?')
};

export function listSessions() {
  return queries.list.all();
}

export function getSession(id) {
  return queries.get.get(id);
}

export function insertSession(id) {
  queries.insert.run(id);
  return queries.get.get(id);
}

export function deleteSession(id) {
  queries.delete.run(id);
}

export function updateSessionTitle(id, title) {
  queries.updateTitle.run(title, id);
}
