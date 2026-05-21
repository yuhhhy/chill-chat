import db from './connection.js';

const queries = {
  list:    db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'),
  insert:  db.prepare('INSERT INTO messages (id, session_id, role, content, reasoning_content, model_provider, status) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  count:   db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?'),
  update:  db.prepare('UPDATE messages SET content = ? WHERE id = ? AND session_id = ?'),
  delete:  db.prepare('DELETE FROM messages WHERE id = ? AND session_id = ?'),
  listSources:    db.prepare('SELECT * FROM message_sources WHERE message_id = ? ORDER BY citation_order ASC'),
  insertSource:   db.prepare(`INSERT INTO message_sources (
    id, message_id, chunk_id, citation_order, score, collection_id, document_id, document_name, chunk_index, excerpt, content
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  deleteSources:  db.prepare('DELETE FROM message_sources WHERE message_id = ?')
};

export function listMessages(sessionId) {
  return queries.list.all(sessionId);
}

export function insertMessage(id, sessionId, role, content, reasoningContent, modelProvider, status) {
  queries.insert.run(id, sessionId, role, content, reasoningContent, modelProvider, status);
}

export function countMessages(sessionId) {
  return queries.count.get(sessionId).count;
}

export function updateMessage(content, messageId, sessionId) {
  return queries.update.run(content, messageId, sessionId);
}

export function deleteMessage(messageId, sessionId) {
  queries.delete.run(messageId, sessionId);
}

export function listMessageSources(messageId) {
  return queries.listSources.all(messageId);
}

export function insertMessageSource(id, messageId, chunkId, citationOrder, score, collectionId, documentId, documentName, chunkIndex, excerpt, content = '') {
  queries.insertSource.run(id, messageId, chunkId, citationOrder, score, collectionId, documentId, documentName, chunkIndex, excerpt, content);
}

export function deleteMessageSources(messageId) {
  queries.deleteSources.run(messageId);
}

export function insertMessagesInTransaction(sessionId, msgs) {
  const insertAll = db.transaction((messages) => {
    for (const msg of messages) {
      const reasoningContent = msg.reasoningContent ?? msg.reasoning_content ?? '';
      const modelProvider = msg.modelProvider ?? msg.model_provider ?? '';
      const status = msg.status ?? 'completed';
      const messageId = msg.id || crypto.randomUUID();
      insertMessage(messageId, sessionId, msg.role, msg.content, reasoningContent, modelProvider, status);
      deleteMessageSources(messageId);
      if (Array.isArray(msg.sources)) {
        msg.sources.slice(0, 12).forEach((source, index) => {
          insertMessageSource(
            crypto.randomUUID(),
            messageId,
            source.chunkId || source.chunk_id || null,
            Number(source.order ?? source.citation_order ?? index + 1),
            Number(source.score ?? 0),
            source.collectionId || source.collection_id || '',
            source.documentId || source.document_id || '',
            source.documentName || source.document_name || 'Unknown source',
            Number(source.chunkIndex ?? source.chunk_index ?? 0),
            source.excerpt || '',
            source.content || ''
          );
        });
      }
    }
  });
  insertAll(msgs);
}
