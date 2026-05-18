import { randomUUID } from 'crypto';
import db, { stmt } from '../db.js';

export function getMessages(req, res, { json, sessionId }) {
  json(res, stmt.listMessages.all(sessionId));
}

export async function addMessages(req, res, { json, parseBody, sessionId }) {
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
