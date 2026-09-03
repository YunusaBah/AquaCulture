import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function getInventory(req: AuthRequest, res: Response) {
  const items = await prisma.inventoryItem.findMany({
    orderBy: { currentStock: 'asc' },
    include: {
      transactions: true,
    },
  });

  res.json({ items });
}

export async function createInventoryItem(req: AuthRequest, res: Response) {
  const { name, category, unit, currentStock, minStock } = req.body as {
    name?: string;
    category?: string;
    unit?: string;
    currentStock?: number;
    minStock?: number;
  };

  if (!name || !category || !unit) {
    return res.status(400).json({ error: 'name, category, and unit are required' });
  }

  const item = await prisma.inventoryItem.create({
    data: {
      name,
      category,
      unit,
      currentStock: currentStock ?? 0,
      minStock: minStock ?? 0,
    },
  });

  res.status(201).json({ item });
}
