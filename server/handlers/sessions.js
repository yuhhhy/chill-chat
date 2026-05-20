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

export function updateSession(req, res) {
  const { title } = req.body;
  if (typeof title !== 'string') {
    res.status(400).json({ error: 'title 必须是字符串' });
    return;
  }

  const nextTitle = title.trim();
  if (!nextTitle) {
    res.status(400).json({ error: '会话名称不能为空' });
    return;
  }

  const result = stmt.updateTitle.run(nextTitle.slice(0, 80), req.params.sessionId);
  if (result.changes === 0) {
    res.status(404).json({ error: '会话不存在' });
    return;
  }

  res.json(stmt.getSession.get(req.params.sessionId));
}

export function deleteSession(req, res) {
  sessionsDb.deleteSession(req.params.sessionId);
  res.json({ ok: true });
}
