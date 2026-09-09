import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotificationForUser } from './notifications';

function workerCanAccessPond(assignedUserId: string | null | undefined, workerId?: string) {
  return !assignedUserId || assignedUserId === workerId;
}

export async function getFeedings(req: AuthRequest, res: Response) {
  const where = req.userRole === 'WORKER' ? {
    pond: {
      OR: [
        { assignedUserId: req.userId },
        { assignedUserId: null },
      ],
    },
  } : {};
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

  if (!pondId || !quantityKg) {
    return res.status(400).json({ error: 'pondId and quantityKg are required' });
  }

  if (req.userRole === 'WORKER') {
    const pond = await prisma.pond.findUnique({ where: { id: pondId }, select: { assignedUserId: true } });
    if (!pond || !workerCanAccessPond(pond.assignedUserId, req.userId)) return res.status(403).json({ error: 'Forbidden' });
  }

  let matchedInventoryItem = null as Awaited<ReturnType<typeof prisma.inventoryItem.findUnique>> | null;
  if (inventoryItemId) {
    matchedInventoryItem = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  }

  if (!matchedInventoryItem) {
    const feedLabel = (feedType || feedBrand || 'Pellet').toLowerCase();
    matchedInventoryItem = await prisma.inventoryItem.findFirst({
      where: {
        OR: [
          { name: { contains: feedLabel, mode: 'insensitive' } },
          { category: { contains: 'feed', mode: 'insensitive' } },
        ],
      },
      orderBy: { currentStock: 'desc' },
    });
  }

  if (matchedInventoryItem && matchedInventoryItem.currentStock < quantityKg) {
    return res.status(400).json({ error: `Not enough ${matchedInventoryItem.name} in stock for this feeding record.` });
  }

  const feeding = await prisma.$transaction(async (tx) => {
    const createdFeeding = await tx.feedingLog.create({
      data: {
        pondId,
        workerId: req.userId || null,
        feedBrand: feedBrand || matchedInventoryItem?.name || 'Standard Feed',
        feedType: feedType || matchedInventoryItem?.name || 'Pellet',
        feedSize: feedSize || '4mm',
        quantityKg,
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

    if (matchedInventoryItem && (matchedInventoryItem.category.toLowerCase().includes('feed') || matchedInventoryItem.unit.toLowerCase() === 'kg')) {
      await tx.inventoryItem.update({
        where: { id: matchedInventoryItem.id },
        data: {
          currentStock: matchedInventoryItem.currentStock - quantityKg,
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          itemId: matchedInventoryItem.id,
          change: -quantityKg,
          reason: `Feed used on pond ${pondId}`,
        },
      });
    }

    return createdFeeding;
  });

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

  res.status(201).json({ feeding });
}
