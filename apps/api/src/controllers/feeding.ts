import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, hasRequestPermission } from '../middleware/auth';
import { createNotificationForUser } from './notifications';
import { pondTenantWhere } from '../lib/tenant';
import { calculateWeightedAverageIssueCost } from '../lib/productionCosting';

function workerCanAccessPond(assignedUserId: string | null | undefined, workerId?: string) {
  return !assignedUserId || assignedUserId === workerId;
}

export async function getFeedings(req: AuthRequest, res: Response) {
  const where = {
    pond: {
      AND: [
        pondTenantWhere(req.tenantId || ''),
        ...(req.userRole === 'WORKER' ? [{ OR: [{ assignedUserId: req.userId }, { assignedUserId: null }] }] : []),
      ],
    },
  };
  const feedings = await prisma.feedingLog.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      pond: true,
      worker: { select: { id: true, name: true, email: true } },
    },
  });

  res.json({ feedings });
}

export async function createFeeding(req: AuthRequest, res: Response) {
  const { pondId, feedBrand, feedType, feedSize, quantityKg, appetite, observation, gpsLat, gpsLng, inventoryItemId } = req.body as {
    pondId?: string;
    feedBrand?: string;
    feedType?: string;
    feedSize?: string;
    quantityKg?: number;
    appetite?: number;
    observation?: string;
    gpsLat?: number;
    gpsLng?: number;
    inventoryItemId?: string;
  };

  const feedQuantity = Number(quantityKg);
  if (!pondId || !Number.isFinite(feedQuantity) || feedQuantity <= 0) {
    return res.status(400).json({ error: 'pondId and quantityKg are required' });
  }

  const accessiblePond = await prisma.pond.findFirst({ where: { id: pondId, ...pondTenantWhere(req.tenantId || '') }, select: { assignedUserId: true } });
  if (!accessiblePond || (req.userRole === 'WORKER' && !workerCanAccessPond(accessiblePond.assignedUserId, req.userId))) return res.status(403).json({ error: 'Forbidden' });

  let matchedInventoryItem = null as Awaited<ReturnType<typeof prisma.inventoryItem.findUnique>> | null;
  if (inventoryItemId) {
    matchedInventoryItem = await prisma.inventoryItem.findFirst({ where: { id: inventoryItemId, tenantId: req.tenantId } });
    if (matchedInventoryItem && !matchedInventoryItem.category.toLowerCase().includes('feed') && matchedInventoryItem.unit.toLowerCase() !== 'kg') {
      return res.status(400).json({ error: 'Selected inventory item is not feed stock.' });
    }
  }

  if (!matchedInventoryItem) {
    const feedLabel = (feedType || feedBrand || 'Pellet').toLowerCase();
    matchedInventoryItem = await prisma.inventoryItem.findFirst({
      where: {
        tenantId: req.tenantId,
        OR: [
          { name: { contains: feedLabel, mode: 'insensitive' } },
          { category: { contains: 'feed', mode: 'insensitive' } },
        ],
      },
      orderBy: { currentStock: 'desc' },
    });
  }

  if (!matchedInventoryItem) {
    return res.status(400).json({ error: 'No feed stock is available for this feeding record.' });
  }

  let feedUnitCost: number | null = null;
  let feeding;
  try {
    feeding = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${matchedInventoryItem.id}))::text AS locked`;
      const currentItem = await tx.inventoryItem.findFirst({
        where: { id: matchedInventoryItem!.id, tenantId: req.tenantId },
        include: { transactions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      });
      if (!currentItem) throw new Error('The selected feed item is no longer available.');
      if (currentItem.currentStock < feedQuantity) throw new Error(`Not enough ${currentItem.name} in stock for this feeding record.`);

      feedUnitCost = calculateWeightedAverageIssueCost(currentItem.transactions, feedQuantity);
      const createdFeeding = await tx.feedingLog.create({
        data: {
          pondId,
          workerId: req.userId || null,
          feedBrand: feedBrand || currentItem.name || 'Standard Feed',
          feedType: feedType || currentItem.name || 'Pellet',
          feedSize: feedSize || '4mm',
          quantityKg: feedQuantity,
          appetite: appetite ?? 0,
          observation: observation || 'Routine feeding',
          gpsLat: gpsLat ?? null,
          gpsLng: gpsLng ?? null,
        },
        include: {
          pond: true,
          worker: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.inventoryItem.update({
        where: { id: currentItem.id },
        data: { currentStock: currentItem.currentStock - feedQuantity },
      });
      await tx.inventoryTransaction.create({
        data: {
          itemId: currentItem.id,
          pondId,
          change: -feedQuantity,
          unitCost: feedUnitCost,
          reason: 'Feed used',
        },
      });
      return createdFeeding;
    });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('The selected feed item') || error.message.startsWith('Not enough'))) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }

  const pond = await prisma.pond.findUnique({
    where: { id: pondId },
    include: { site: { include: { farm: { select: { ownerId: true } } } } },
  });
  if (pond?.site.farm.ownerId && pond.site.farm.ownerId !== req.userId) {
    await createNotificationForUser(
      pond.site.farm.ownerId,
      `Pond ${feeding.pond.number} feeding completed`,
      `${feeding.worker?.name || 'Worker'} recorded ${feeding.quantityKg} kg feed.`,
      { pondId, feedingId: feeding.id, type: 'FEEDING_RECORDED' },
    );
  }

  res.status(201).json({
    feeding,
    ...(hasRequestPermission(req, 'INVENTORY_COST_VIEW') ? {
      feedUnitCost,
      feedCost: feedUnitCost == null ? null : feedUnitCost * feedQuantity,
    } : {}),
  });
}
