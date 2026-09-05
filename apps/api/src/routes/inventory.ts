import { Router } from 'express';
import { getInventory, createInventoryItem, adjustInventoryItem } from '../controllers/inventory';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, requirePermission('INVENTORY_VIEW'), getInventory);
router.post('/', requireAuth, requirePermission('INVENTORY_MANAGE'), createInventoryItem);
router.post('/adjust', requireAuth, requirePermission('INVENTORY_MANAGE'), adjustInventoryItem);

export default router;
