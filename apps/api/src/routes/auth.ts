import { Router } from 'express';
import { register, login, createWorker, getCurrentUser, listWorkers, updateWorkerAccess, deleteWorker } from '../controllers/auth';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, getCurrentUser);
router.get('/workers', requireAuth, requireRole('OWNER'), listWorkers);
router.patch('/workers/:id/access', requireAuth, requireRole('OWNER'), updateWorkerAccess);
router.delete('/workers/:id', requireAuth, requireRole('OWNER'), deleteWorker);
router.post('/create-worker', requireAuth, requireRole('OWNER'), createWorker);

export default router;
