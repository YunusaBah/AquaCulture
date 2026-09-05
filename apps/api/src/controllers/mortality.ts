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

  // ensure pond exists
  const pondWithLogs = await prisma.pond.findUnique({ where: { id: pondId } });
  if (!pondWithLogs) return res.status(404).json({ error: 'Pond not found' });

  let mortalityLog;
  try {
    mortalityLog = await prisma.$transaction(async (tx) => {
      const t = tx as any;
      const pondRec = await t.pond.findUnique({ where: { id: pondId }, select: { current_population: true, initial_population: true } });
      const initial = pondRec?.initial_population ?? 0;
      const currentPool = pondRec?.current_population ?? initial;
      if (numberDead > currentPool) {
        throw new Error('Mortality cannot exceed the current live fish count.');
      }

      const created = await t.mortalityLog.create({
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

      await t.pond.update({ where: { id: pondId }, data: { current_population: Math.max(0, currentPool - numberDead) } });

      return created;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid mortality request';
    return res.status(400).json({ error: message });
  }

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
