import { Router } from 'express';
import {
  getRagCollections, createRagCollection, updateRagCollection, deleteRagCollection,
  getRagDocuments, uploadRagDocuments, subscribeRagIndexJob, deleteRagDocument, searchRagCollection
} from '../handlers/rag.js';

const router = Router();

router.get('/collections', getRagCollections);
router.post('/collections', createRagCollection);
router.patch('/collections/:collectionId', updateRagCollection);
router.delete('/collections/:collectionId', deleteRagCollection);
router.get('/collections/:collectionId/documents', getRagDocuments);
router.post('/collections/:collectionId/documents', uploadRagDocuments);
router.get('/index-jobs/:jobId/events', subscribeRagIndexJob);
router.get('/collections/:collectionId/search', searchRagCollection);
router.delete('/documents/:documentId', deleteRagDocument);

export default router;
