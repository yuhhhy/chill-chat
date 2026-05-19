import { Router } from 'express';
import { getMessages, addMessages, updateMessage, deleteMessage } from '../handlers/messages.js';

const router = Router({ mergeParams: true });

router.get('/', getMessages);
router.post('/', addMessages);
router.patch('/:messageId', updateMessage);
router.delete('/:messageId', deleteMessage);

export default router;
