import { Router } from 'express';
import { getSessions, createSession, deleteSession } from '../handlers/sessions.js';

const router = Router();

router.get('/', getSessions);
router.post('/', createSession);
router.delete('/:sessionId', deleteSession);

export default router;
