import { Router } from 'express';
import { createFinanceRecord, deleteFinanceRecord, getFinanceOverview } from '../controllers/finance';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, requirePermission('FINANCE_VIEW'), getFinanceOverview);
router.post('/', requireAuth, requirePermission('FINANCE_MANAGE'), createFinanceRecord);
router.delete('/:id', requireAuth, requirePermission('FINANCE_MANAGE'), deleteFinanceRecord);

export default router;
