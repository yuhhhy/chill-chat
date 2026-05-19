import { randomUUID } from 'crypto';
import db, { stmt } from '../db.js';

export function deleteMessage(req, res, { json, sessionId, messageId }) {
  stmt.deleteMessage.run(messageId, sessionId);
  json(res, { ok: true });
}

export async function updateMessage(req, res, { json, parseBody, sessionId, messageId }) {
  try {
    const { content } = await parseBody(req);
    if (typeof content !== 'string') {
      json(res, { error: 'content 必须是字符串' }, 400);
      return;
    }

    const result = stmt.updateMessage.run(content, messageId, sessionId);
    if (result.changes === 0) {
      json(res, { error: '消息不存在' }, 404);
      return;
    }

    json(res, { ok: true });
  } catch (err) {
    json(res, { error: err.message }, 400);
  }
}

export function getMessages(req, res, { json, sessionId }) {
  json(res, stmt.listMessages.all(sessionId));
}

export async function addMessages(req, res, { json, parseBody, sessionId }) {
  try {
    const { messages } = await parseBody(req);
    const isFirstBatch = stmt.countMessages.get(sessionId).count === 0;

    const insertAll = db.transaction((msgs) => {
      for (const msg of msgs) {
        const reasoningContent = msg.reasoningContent ?? msg.reasoning_content ?? '';
        const modelProvider = msg.modelProvider ?? msg.model_provider ?? '';
        const status = msg.status ?? 'completed';
        stmt.insertMessage.run(msg.id || randomUUID(), sessionId, msg.role, msg.content, reasoningContent, modelProvider, status);
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
