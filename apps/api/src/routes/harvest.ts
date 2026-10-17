import express from 'express';
import { requireAuth, requirePermission } from '../middleware/auth';
import { getHarvests, createHarvest, updateHarvest, deleteHarvest } from '../controllers/harvest';

const router = express.Router();

router.get('/', requireAuth, requirePermission('HARVEST_VIEW', 'HARVEST_VIEW_ASSIGNED'), getHarvests);
router.post('/', requireAuth, requirePermission('HARVEST_CREATE'), createHarvest);
router.put('/:id', requireAuth, requirePermission('HARVEST_UPDATE', 'HARVEST_CREATE'), updateHarvest);
router.delete('/:id', requireAuth, requirePermission('HARVEST_UPDATE', 'HARVEST_CREATE'), deleteHarvest);

export default router;
