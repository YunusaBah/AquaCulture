import { Router } from 'express';
import { getFeedings, createFeeding } from '../controllers/feeding';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, getFeedings);
router.post('/', requireAuth, createFeeding);

export default router;
