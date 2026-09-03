import { Router } from 'express';
import { getMortality, createMortality } from '../controllers/mortality';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, getMortality);
router.post('/', requireAuth, createMortality);

export default router;
