import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, hasRequestPermission } from '../middleware/auth';
import { nextReportReference } from '../lib/financeTransactionId';
import { calculateWeightedAverageIssueCost } from '../lib/productionCosting';
import { pondBelongsToTenant } from '../lib/tenant';

function withoutInventoryTransactionCosts<T extends { transactions: Array<{ unitCost: number | null }> }>(item: T) {
  return {
    ...item,
    transactions: item.transactions.map((transaction) => {
      const { unitCost, ...safeTransaction } = transaction;
      void unitCost;
      return safeTransaction;
    }),
  };
}

export async function getInventory(req: AuthRequest, res: Response) {
  const items = await prisma.inventoryItem.findMany({
    where: { tenantId: req.tenantId },
    orderBy: { currentStock: 'asc' },
    include: {
      transactions: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { pond: { select: { number: true } } },
      },
    },
  });

  const summary = {
    totalItems: items.length,
    lowStockItems: items.filter((item) => item.currentStock <= (item.minStock || 0)).length,
    totalUnits: items.reduce((sum, item) => sum + item.currentStock, 0),
  };

  const itemsWithCost = items.map((item) => {
    if (!hasRequestPermission(req, 'INVENTORY_COST_VIEW')) {
      return {
        ...item,
        transactions: item.transactions.map((transaction) => ({
          id: transaction.id,
          itemId: transaction.itemId,
          pondId: transaction.pondId,
          change: transaction.change,
          reason: transaction.reason,
          createdAt: transaction.createdAt,
          pond: transaction.pond,
        })),
      };
    }
    const costMovements = item.transactions.map((transaction) => ({
      change: transaction.change,
      unitCost: transaction.unitCost,
    })).reverse();
    const weightedAverageUnitCost = item.currentStock > 0
      ? calculateWeightedAverageIssueCost(costMovements, Math.min(item.currentStock, 0.000001))
      : null;
    return {
      ...item,
      weightedAverageUnitCost,
      hasUncostedStock: item.currentStock > 0 && weightedAverageUnitCost == null,
    };
  });

  res.json({ items: itemsWithCost, summary });
}

export async function createInventoryItem(req: AuthRequest, res: Response) {
  const { name, category, unit, currentStock, minStock, sku, unitCost } = req.body as {
    name?: string;
    category?: string;
    unit?: string;
    currentStock?: number;
    minStock?: number;
    sku?: string;
    unitCost?: number | string | null;
  };

  if (!name || !category || !unit) {
    return res.status(400).json({ error: 'name, category, and unit are required' });
  }

  const initialStock = Number(currentStock ?? 0);
  const minimumStock = Number(minStock ?? 0);
  const initialUnitCost = unitCost == null || unitCost === '' ? undefined : Number(unitCost);
  if (!Number.isFinite(initialStock) || initialStock < 0 || !Number.isFinite(minimumStock) || minimumStock < 0) {
    return res.status(400).json({ error: 'Initial and minimum stock must be non-negative numbers.' });
  }
  if (initialUnitCost !== undefined && (!Number.isFinite(initialUnitCost) || initialUnitCost < 0)) {
    return res.status(400).json({ error: 'Unit cost must be a non-negative number.' });
  }

  const item = await prisma.$transaction(async (tx) => tx.inventoryItem.create({
    data: {
      reportId: await nextReportReference(tx),
      tenantId: req.tenantId!,
      name,
      category,
      unit,
      sku: sku || null,
      currentStock: initialStock,
      minStock: minimumStock,
      transactions: initialStock !== 0 ? {
        create: [{
          change: initialStock,
          unitCost: initialUnitCost ?? null,
          reason: 'Initial stock',
        }],
      } : undefined,
    },
    include: { transactions: { include: { pond: { select: { number: true } } } } },
  }));

  res.status(201).json({ item: hasRequestPermission(req, 'INVENTORY_COST_VIEW') ? item : withoutInventoryTransactionCosts(item) });
}

export async function adjustInventoryItem(req: AuthRequest, res: Response) {
  const { itemId, change, reason, unitCost, pondId } = req.body as {
    itemId?: string;
    change?: number;
    reason?: string;
    unitCost?: number | string | null;
    pondId?: string;
  };

  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const quantity = Number(change ?? 0);
  if (!Number.isFinite(quantity) || quantity === 0) {
    return res.status(400).json({ error: 'A non-zero stock adjustment is required' });
  }

  const incomingUnitCost = unitCost == null || unitCost === '' ? undefined : Number(unitCost);
  if (quantity > 0 && incomingUnitCost === undefined) {
    return res.status(400).json({ error: 'Enter the purchase cost per unit when adding stock.' });
  }
  if (incomingUnitCost !== undefined && (!Number.isFinite(incomingUnitCost) || incomingUnitCost < 0)) {
    return res.status(400).json({ error: 'Unit cost must be a non-negative number.' });
  }
  if (pondId && !(await pondBelongsToTenant(pondId, req.tenantId || ''))) {
    return res.status(404).json({ error: 'Pond not found' });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${itemId}))::text AS locked`;
      const item = await tx.inventoryItem.findFirst({
        where: { id: itemId, tenantId: req.tenantId },
        include: { transactions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      });
      if (!item) throw new Error('Inventory item not found');
      const nextStock = item.currentStock + quantity;
      if (nextStock < 0) throw new Error('Stock cannot go below zero');

      const issueUnitCost = quantity < 0
        ? calculateWeightedAverageIssueCost(item.transactions, Math.abs(quantity))
        : incomingUnitCost ?? null;
      await tx.inventoryItem.update({ where: { id: itemId }, data: { currentStock: nextStock } });
      await tx.inventoryTransaction.create({
        data: {
          itemId,
          pondId: pondId || null,
          change: quantity,
          unitCost: issueUnitCost,
          reason: reason || (quantity > 0 ? 'Stock adjusted in' : 'Stock used out'),
        },
      });

      return tx.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
        include: { transactions: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { pond: { select: { number: true } } } } },
      });
    });

    res.json({ item: hasRequestPermission(req, 'INVENTORY_COST_VIEW') ? updated : withoutInventoryTransactionCosts(updated) });
  } catch (error) {
    if (error instanceof Error && ['Inventory item not found', 'Stock cannot go below zero'].includes(error.message)) {
      return res.status(error.message === 'Inventory item not found' ? 404 : 400).json({ error: error.message });
    }
    throw error;
  }
}
