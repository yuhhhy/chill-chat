import { Router } from 'express';
import { createChatRun, subscribeChatRun, cancelChatRun, getActiveChatRun, getChatRun } from '../handlers/chatRuns.js';

const router = Router();

router.post('/', createChatRun);
router.get('/active', getActiveChatRun);
router.get('/:runId', getChatRun);
router.get('/:runId/events', subscribeChatRun);
router.post('/:runId/cancel', cancelChatRun);

export default router;
