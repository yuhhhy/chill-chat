import * as messagesDb from '../db/messages.js';
import * as sessionsDb from '../db/sessions.js';

export function deleteMessage(req, res) {
  messagesDb.deleteMessage(req.params.messageId, req.params.sessionId);
  res.json({ ok: true });
}

export function updateMessage(req, res) {
  const { content } = req.body;
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content 必须是字符串' });
    return;
  }

  const result = messagesDb.updateMessage(content, req.params.messageId, req.params.sessionId);
  if (result.changes === 0) {
    res.status(404).json({ error: '消息不存在' });
    return;
  }

  res.json({ ok: true });
}

export function getMessages(req, res) {
  const messages = messagesDb.listMessages(req.params.sessionId).map((message) => ({
    ...message,
    sources: messagesDb.listMessageSources(message.id).map((source) => ({
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
  res.json(messages);
}

export function addMessages(req, res) {
  const { sessionId } = req.params;
  const { messages } = req.body;
  const isFirstBatch = messagesDb.countMessages(sessionId) === 0;

  messagesDb.insertMessagesInTransaction(sessionId, messages);

  if (isFirstBatch) {
    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser) sessionsDb.updateSessionTitle(sessionId, firstUser.content.slice(0, 20));
  }

  res.json(sessionsDb.getSession(sessionId));
}
