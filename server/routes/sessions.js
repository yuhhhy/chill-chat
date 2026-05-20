import { Router } from 'express';
import { getSessions, createSession, updateSession, deleteSession } from '../handlers/sessions.js';

const router = Router();

router.get('/', getSessions);
router.post('/', createSession);
router.patch('/:sessionId', updateSession);
router.delete('/:sessionId', deleteSession);

export default router;
