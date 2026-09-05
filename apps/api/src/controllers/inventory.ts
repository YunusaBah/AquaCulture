import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function getInventory(req: AuthRequest, res: Response) {
  const items = await prisma.inventoryItem.findMany({
    orderBy: { currentStock: 'asc' },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  const summary = {
    totalItems: items.length,
    lowStockItems: items.filter((item) => item.currentStock <= (item.minStock || 0)).length,
    totalUnits: items.reduce((sum, item) => sum + item.currentStock, 0),
  };

  res.json({ items, summary });
}

export async function createInventoryItem(req: AuthRequest, res: Response) {
  const { name, category, unit, currentStock, minStock, sku } = req.body as {
    name?: string;
    category?: string;
    unit?: string;
    currentStock?: number;
    minStock?: number;
    sku?: string;
  };

  if (!name || !category || !unit) {
    return res.status(400).json({ error: 'name, category, and unit are required' });
  }

  const initialStock = Number(currentStock ?? 0);
  const minimumStock = Number(minStock ?? 0);

  const item = await prisma.inventoryItem.create({
    data: {
      name,
      category,
      unit,
      sku: sku || null,
      currentStock: initialStock,
      minStock: minimumStock,
      transactions: initialStock !== 0 ? {
        create: [{
          change: initialStock,
          reason: 'Initial stock',
        }],
      } : undefined,
    },
    include: { transactions: true },
  });

  res.status(201).json({ item });
}

export async function adjustInventoryItem(req: AuthRequest, res: Response) {
  const { itemId, change, reason } = req.body as {
    itemId?: string;
    change?: number;
    reason?: string;
  };

  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const quantity = Number(change ?? 0);
  if (!Number.isFinite(quantity) || quantity === 0) {
    return res.status(400).json({ error: 'A non-zero stock adjustment is required' });
  }

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) {
    return res.status(404).json({ error: 'Inventory item not found' });
  }

  const nextStock = item.currentStock + quantity;
  if (nextStock < 0) {
    return res.status(400).json({ error: 'Stock cannot go below zero' });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.inventoryItem.update({
      where: { id: itemId },
      data: { currentStock: nextStock },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });

    await tx.inventoryTransaction.create({
      data: {
        itemId,
        change: quantity,
        reason: reason || (quantity > 0 ? 'Stock adjusted in' : 'Stock used out'),
      },
    });

    return current;
  });

  res.json({ item: updated });
}
