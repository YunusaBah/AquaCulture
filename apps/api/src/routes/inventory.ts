import { Router } from 'express';
import { getInventory, createInventoryItem, adjustInventoryItem } from '../controllers/inventory';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, requirePermission('INVENTORY_VIEW'), getInventory);
router.post('/', requireAuth, requirePermission('INVENTORY_MANAGE'), createInventoryItem);
router.post('/adjust', requireAuth, requirePermission('INVENTORY_MANAGE'), adjustInventoryItem);
router.delete('/:id', requireAuth, requirePermission('INVENTORY_MANAGE'), requireRole('OWNER'), async (req, res) => {
  // inline delete handler to keep route simple
  const id = req.params.id;
  try {
    // remove transactions then delete item
    await prisma.inventoryTransaction.deleteMany({ where: { itemId: id } });
    await prisma.inventoryItem.delete({ where: { id } });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete inventory item' });
  }
});

export default router;
