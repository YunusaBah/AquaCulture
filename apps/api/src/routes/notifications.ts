import { Router } from 'express';
import { listNotifications, markRead } from '../controllers/notifications';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, listNotifications);
router.post('/:id/read', requireAuth, markRead);

export default router;
