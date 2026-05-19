import { Router } from 'express';
import { createChatRun, subscribeChatRun, cancelChatRun } from '../handlers/chatRuns.js';

const router = Router();

router.post('/', createChatRun);
router.get('/:runId/events', subscribeChatRun);
router.post('/:runId/cancel', cancelChatRun);

export default router;
