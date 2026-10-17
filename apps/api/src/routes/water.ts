import { Router } from 'express';
import { getWaterQuality, createWaterQuality } from '../controllers/water';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, requirePermission('WATER_QUALITY_VIEW', 'WATER_QUALITY_VIEW_ASSIGNED'), getWaterQuality);
router.post('/', requireAuth, requirePermission('WATER_QUALITY_CREATE'), createWaterQuality);

export default router;
