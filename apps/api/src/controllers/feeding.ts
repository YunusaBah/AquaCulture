import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotificationForUser } from './notifications';

export async function getFeedings(req: AuthRequest, res: Response) {
  const where = req.userRole === 'WORKER' ? { pond: { assignedUserId: req.userId } } : {};
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
  const { pondId, feedBrand, feedType, feedSize, quantityKg, appetite, observation, gpsLat, gpsLng } = req.body as {
    pondId?: string;
    feedBrand?: string;
    feedType?: string;
    feedSize?: string;
    quantityKg?: number;
    appetite?: number;
    observation?: string;
    gpsLat?: number;
    gpsLng?: number;
  };

  if (!pondId || !quantityKg) {
    return res.status(400).json({ error: 'pondId and quantityKg are required' });
  }

  if (req.userRole === 'WORKER') {
    const pond = await prisma.pond.findUnique({ where: { id: pondId }, select: { assignedUserId: true } });
    if (!pond || pond.assignedUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  }

  const feeding = await prisma.feedingLog.create({
    data: {
      pondId,
      workerId: req.userId || null,
      feedBrand: feedBrand || 'Standard Feed',
      feedType: feedType || 'Pellet',
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
