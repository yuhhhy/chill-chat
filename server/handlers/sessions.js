import { randomUUID } from 'crypto';
import * as sessionsDb from '../db/sessions.js';

export function getSessions(req, res) {
  res.json(sessionsDb.listSessions());
}

export function createSession(req, res) {
  const id = randomUUID();
  const session = sessionsDb.insertSession(id);
  res.status(201).json(session);
}

export function deleteSession(req, res) {
  sessionsDb.deleteSession(req.params.sessionId);
  res.json({ ok: true });
}
