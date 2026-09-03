import { Router } from 'express';
import { createSite } from '../controllers/sites';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();
router.post('/', requireAuth, requirePermission('FARM_MANAGE'), createSite);

export default router;
