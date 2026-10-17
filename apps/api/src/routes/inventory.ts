import { Router } from 'express';
import { getInventory, createInventoryItem, adjustInventoryItem } from '../controllers/inventory';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireAuth, requirePermission, requireRole } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, requirePermission('INVENTORY_VIEW'), getInventory);
router.post('/', requireAuth, requirePermission('INVENTORY_MANAGE'), createInventoryItem);
router.post('/adjust', requireAuth, requirePermission('INVENTORY_MANAGE'), adjustInventoryItem);
router.delete('/:id', requireAuth, requirePermission('INVENTORY_MANAGE'), requireRole('OWNER'), async (req: AuthRequest, res) => {
  // inline delete handler to keep route simple
  const id = req.params.id;
  try {
    // remove transactions then delete item
    const item = await prisma.inventoryItem.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });
    await prisma.inventoryTransaction.deleteMany({ where: { itemId: item.id } });
    await prisma.inventoryItem.delete({ where: { id: item.id } });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete inventory item' });
  }
});

export default router;
