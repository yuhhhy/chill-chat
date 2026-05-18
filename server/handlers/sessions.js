import { randomUUID } from 'crypto';
import { stmt } from '../db.js';

export function getSessions(req, res, { json }) {
  json(res, stmt.listSessions.all());
}

export function createSession(req, res, { json }) {
  const id = randomUUID();
  stmt.createSession.run(id);
  json(res, stmt.getSession.get(id), 201);
}

export function deleteSession(req, res, { json, sessionId }) {
  stmt.deleteSession.run(sessionId);
  json(res, { ok: true });
}
