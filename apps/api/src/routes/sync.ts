import { Router } from 'express';
import { flushSyncQueue, listSyncQueue, queueSyncItems } from '../controllers/sync';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, listSyncQueue);
router.post('/queue', requireAuth, queueSyncItems);
router.post('/flush', requireAuth, flushSyncQueue);

export default router;
