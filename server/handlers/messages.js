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
  const messages = stmt.listMessages.all(sessionId).map((message) => ({
    ...message,
    sources: stmt.listMessageSources.all(message.id).map((source) => ({
      id: source.id,
      chunkId: source.chunk_id,
      order: source.citation_order,
      score: source.score,
      collectionId: source.collection_id,
      documentId: source.document_id,
      documentName: source.document_name,
      chunkIndex: source.chunk_index,
      excerpt: source.excerpt
    }))
  }));
  json(res, messages);
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
        const messageId = msg.id || randomUUID();
        stmt.insertMessage.run(messageId, sessionId, msg.role, msg.content, reasoningContent, modelProvider, status);
        stmt.deleteMessageSources.run(messageId);
        if (Array.isArray(msg.sources)) {
          msg.sources.slice(0, 12).forEach((source, index) => {
            stmt.insertMessageSource.run(
              randomUUID(),
              messageId,
              source.chunkId || source.chunk_id || null,
              Number(source.order ?? source.citation_order ?? index + 1),
              Number(source.score ?? 0),
              source.collectionId || source.collection_id || '',
              source.documentId || source.document_id || '',
              source.documentName || source.document_name || 'Unknown source',
              Number(source.chunkIndex ?? source.chunk_index ?? 0),
              source.excerpt || ''
            );
          });
        }
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
