import db from './connection.js';

const queries = {
  list:   db.prepare('SELECT * FROM system_prompts ORDER BY created_at ASC'),
  get:    db.prepare('SELECT * FROM system_prompts WHERE id = ?'),
  insert: db.prepare('INSERT INTO system_prompts (id, title, content) VALUES (?, ?, ?)'),
  update: db.prepare('UPDATE system_prompts SET title = ?, content = ?, updated_at = unixepoch() WHERE id = ?'),
  delete: db.prepare('DELETE FROM system_prompts WHERE id = ?'),
};

export function listPrompts() {
  return queries.list.all();
}

export function getPrompt(id) {
  return queries.get.get(id);
}

export function insertPrompt(id, title, content) {
  queries.insert.run(id, title, content);
  return queries.get.get(id);
}

export function updatePrompt(id, title, content) {
  queries.update.run(title, content, id);
  return queries.get.get(id);
}

export function deletePrompt(id) {
  queries.delete.run(id);
}
