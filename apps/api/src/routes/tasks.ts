import { Router } from 'express';
import { listTasks, createTask, getTask, updateTaskStatus, addComment } from '../controllers/tasks';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, requirePermission('TASK_VIEW', 'TASK_VIEW_ASSIGNED'), listTasks);
router.post('/', requireAuth, requirePermission('TASK_CREATE'), createTask);
router.get('/:id', requireAuth, requirePermission('TASK_VIEW', 'TASK_VIEW_ASSIGNED'), getTask);
router.patch('/:id/status', requireAuth, requirePermission('TASK_COMPLETE'), updateTaskStatus);
router.post('/:id/comments', requireAuth, requirePermission('TASK_COMMENT'), addComment);

export default router;
