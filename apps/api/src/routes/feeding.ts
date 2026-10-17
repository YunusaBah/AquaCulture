import { Router } from 'express';
import { getFeedings, createFeeding } from '../controllers/feeding';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, requirePermission('FEEDING_VIEW', 'FEEDING_VIEW_ASSIGNED'), getFeedings);
router.post('/', requireAuth, requirePermission('FEEDING_CREATE'), createFeeding);

export default router;
