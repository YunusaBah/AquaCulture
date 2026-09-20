import { Router } from 'express';
import { getTheme, updateTheme } from '../controllers/settings';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.get('/theme', requireAuth, getTheme);
router.put('/theme', requireAuth, updateTheme);

export default router;
