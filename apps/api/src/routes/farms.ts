import { Router } from 'express';
import { getFarms, createFarm } from '../controllers/farms';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, requirePermission('FARM_VIEW'), getFarms);
router.post('/', requireAuth, requirePermission('FARM_MANAGE'), createFarm);

export default router;
