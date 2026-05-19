import { randomUUID } from 'crypto';
import { stmt } from '../db.js';

export function getSessions(req, res) {
  res.json(stmt.listSessions.all());
}

export function createSession(req, res) {
  const id = randomUUID();
  stmt.createSession.run(id);
  res.status(201).json(stmt.getSession.get(id));
}

export function deleteSession(req, res) {
  stmt.deleteSession.run(req.params.sessionId);
  res.json({ ok: true });
}
