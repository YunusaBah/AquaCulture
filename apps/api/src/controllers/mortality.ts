import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotificationForUser } from './notifications';

export async function getMortality(req: AuthRequest, res: Response) {
  const where = req.userRole === 'WORKER' ? { pond: { assignedUserId: req.userId } } : {};
  const mortalityLogs = await prisma.mortalityLog.findMany({
    where,
    orderBy: { observedAt: 'desc' },
    include: {
      pond: true,
      worker: { select: { id: true, name: true, email: true } },
    },
  });

  res.json({ mortalityLogs });
}

export async function createMortality(req: AuthRequest, res: Response) {
  const { pondId, numberDead, avgSizeGrams, possibleCause, observedAt } = req.body as {
    pondId?: string;
    numberDead?: number;
    avgSizeGrams?: number;
    possibleCause?: string;
    observedAt?: string;
  };

  if (!pondId || !numberDead) {
    return res.status(400).json({ error: 'pondId and numberDead are required' });
  }

  if (req.userRole === 'WORKER') {
    const pond = await prisma.pond.findUnique({ where: { id: pondId }, select: { assignedUserId: true } });
    if (!pond || pond.assignedUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  }

  const mortalityLog = await prisma.mortalityLog.create({
    data: {
      pondId,
      workerId: req.userId || null,
      numberDead,
      avgSizeGrams: avgSizeGrams ?? null,
      possibleCause: possibleCause || 'Unspecified',
      observedAt: observedAt ? new Date(observedAt) : new Date(),
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
      `Pond ${mortalityLog.pond.number} mortality recorded`,
      `${mortalityLog.worker?.name || 'Worker'} recorded ${mortalityLog.numberDead} dead fish.`,
      { pondId, mortalityLogId: mortalityLog.id, type: 'MORTALITY_RECORDED' },
    );
  }

  res.status(201).json({ mortalityLog });
}
