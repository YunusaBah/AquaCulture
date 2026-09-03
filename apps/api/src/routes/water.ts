import { Router } from 'express';
import { getWaterQuality, createWaterQuality } from '../controllers/water';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, getWaterQuality);
router.post('/', requireAuth, createWaterQuality);

export default router;
