import { Router } from 'express';
import { getModelNames } from '../providers/registry.js';
import { getCustomModels, createCustomModel, updateCustomModel, deleteCustomModel } from '../handlers/modelConfig.js';

const router = Router();

router.get('/models', (req, res) => res.json(getModelNames()));
router.get('/custom-models', getCustomModels);
router.post('/custom-models', createCustomModel);
router.patch('/custom-models/:customModelId', updateCustomModel);
router.delete('/custom-models/:customModelId', deleteCustomModel);

export default router;
