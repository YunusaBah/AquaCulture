import { Router } from 'express';
import { listTasks, createTask, getTask, updateTaskStatus, addComment } from '../controllers/tasks';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, listTasks);
router.post('/', requireAuth, requirePermission('TASK_CREATE'), createTask);
router.get('/:id', requireAuth, getTask);
router.patch('/:id/status', requireAuth, requirePermission('TASK_COMPLETE'), updateTaskStatus);
router.post('/:id/comments', requireAuth, requirePermission('TASK_COMMENT'), addComment);

export default router;
