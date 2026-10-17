import { Router } from 'express';
import { getMortality, createMortality } from '../controllers/mortality';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, requirePermission('MORTALITY_VIEW', 'MORTALITY_VIEW_ASSIGNED'), getMortality);
router.post('/', requireAuth, requirePermission('MORTALITY_CREATE'), createMortality);

export default router;
