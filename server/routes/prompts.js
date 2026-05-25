import { Router } from 'express';
import { getPrompts, createPrompt, updatePrompt, deletePrompt } from '../handlers/prompts.js';

const router = Router();

router.get('/', getPrompts);
router.post('/', createPrompt);
router.patch('/:promptId', updatePrompt);
router.delete('/:promptId', deletePrompt);

export default router;
