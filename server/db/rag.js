import db from './connection.js';

const queries = {
  listCollections: db.prepare(`
    SELECT c.*,
      COUNT(DISTINCT d.id) AS document_count,
      COUNT(ch.id) AS chunk_count
    FROM rag_collections c
    LEFT JOIN rag_documents d ON d.collection_id = c.id
    LEFT JOIN rag_chunks ch ON ch.document_id = d.id
    GROUP BY c.id
    ORDER BY c.updated_at DESC, c.created_at DESC
  `),
  getCollection:     db.prepare('SELECT * FROM rag_collections WHERE id = ?'),
  insertCollection:  db.prepare('INSERT INTO rag_collections (id, name, description) VALUES (?, ?, ?)'),
  updateCollection:  db.prepare('UPDATE rag_collections SET name = ?, description = ?, updated_at = unixepoch() WHERE id = ?'),
  deleteCollection:  db.prepare('DELETE FROM rag_collections WHERE id = ?'),
  touchCollection:   db.prepare('UPDATE rag_collections SET updated_at = unixepoch() WHERE id = ?'),
  listDocuments:     db.prepare('SELECT * FROM rag_documents WHERE collection_id = ? ORDER BY created_at DESC'),
  getDocument:       db.prepare('SELECT * FROM rag_documents WHERE id = ?'),
  insertDocument:    db.prepare(`INSERT INTO rag_documents (
    id, collection_id, filename, mime_type, size, status
  ) VALUES (?, ?, ?, ?, ?, ?)`),
  updateDocumentStatus: db.prepare(`UPDATE rag_documents
    SET status = ?, error_message = ?, chunk_count = ?, updated_at = unixepoch()
    WHERE id = ?`),
  deleteDocument:       db.prepare('DELETE FROM rag_documents WHERE id = ?'),
  deleteDocumentChunks: db.prepare('DELETE FROM rag_chunks WHERE document_id = ?'),
  insertChunk: db.prepare(`INSERT INTO rag_chunks (
    id, document_id, collection_id, chunk_index, content, char_count, embedding
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  listChunksForCollection: db.prepare(`
    SELECT ch.*, d.filename AS document_name
    FROM rag_chunks ch
    JOIN rag_documents d ON d.id = ch.document_id
    WHERE ch.collection_id = ?
  `)
};

export function listCollections() {
  return queries.listCollections.all();
}

export function getCollection(id) {
  return queries.getCollection.get(id);
}

export function insertCollection(id, name, description) {
  queries.insertCollection.run(id, name, description);
}

export function updateCollection(name, description, id) {
  return queries.updateCollection.run(name, description, id);
}

export function deleteCollection(id) {
  queries.deleteCollection.run(id);
}

export function touchCollection(id) {
  queries.touchCollection.run(id);
}

export function listDocuments(collectionId) {
  return queries.listDocuments.all(collectionId);
}

export function getDocument(id) {
  return queries.getDocument.get(id);
}

export function insertDocument(id, collectionId, filename, mimeType, size, status) {
  queries.insertDocument.run(id, collectionId, filename, mimeType, size, status);
}

export function updateDocumentStatus(status, errorMessage, chunkCount, id) {
  queries.updateDocumentStatus.run(status, errorMessage, chunkCount, id);
}

export function deleteDocument(id) {
  queries.deleteDocument.run(id);
}

export function deleteDocumentChunks(documentId) {
  queries.deleteDocumentChunks.run(documentId);
}

export function insertChunk(id, documentId, collectionId, chunkIndex, content, charCount, embedding) {
  queries.insertChunk.run(id, documentId, collectionId, chunkIndex, content, charCount, embedding);
}

export function listChunksForCollection(collectionId) {
  return queries.listChunksForCollection.all(collectionId);
}

export function replaceDocumentChunks(documentId, collectionId, chunks, vectors) {
  const replace = db.transaction(() => {
    deleteDocumentChunks(documentId);
    chunks.forEach((content, index) => {
      insertChunk(
        crypto.randomUUID(),
        documentId,
        collectionId,
        index,
        content,
        content.length,
        JSON.stringify(vectors[index])
      );
    });
    updateDocumentStatus('ready', '', chunks.length, documentId);
    touchCollection(collectionId);
  });
  replace();
}
