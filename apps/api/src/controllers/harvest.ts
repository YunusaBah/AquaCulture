import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotificationForUser } from './notifications';

export async function getHarvests(req: AuthRequest, res: Response) {
  const where = req.userRole === 'WORKER' ? { pond: { assignedUserId: req.userId } } : {};
  const harvests = await prisma.harvestLog.findMany({
    where,
    orderBy: { recordedAt: 'desc' },
    include: { pond: true, worker: { select: { id: true, name: true, email: true } } },
  });
  res.json({ harvests });
}

export async function createHarvest(req: AuthRequest, res: Response) {
  const { pondId, numberHarvested, avgWeightGrams, biomassKg, method, destination } = req.body as {
    pondId?: string;
    numberHarvested?: number;
    avgWeightGrams?: number;
    biomassKg?: number;
    method?: string;
    destination?: string;
  };

  if (!pondId || !numberHarvested) {
    return res.status(400).json({ error: 'pondId and numberHarvested are required' });
  }

  if (numberHarvested < 0) return res.status(400).json({ error: 'Invalid harvest quantity' });

  if (req.userRole === 'WORKER') {
    return res.status(403).json({ error: 'Workers are not allowed to create harvests' });
  }

  // ensure pond exists
  const pondWithLogs = await prisma.pond.findUnique({ where: { id: pondId } });
  if (!pondWithLogs) return res.status(404).json({ error: 'Pond not found' });

  let harvest;
  try {
    harvest = await prisma.$transaction(async (tx) => {
      const t = tx as any;
      const pondRec = await t.pond.findUnique({ where: { id: pondId }, select: { current_population: true, initial_population: true } });
      const initial = pondRec?.initial_population ?? 0;
      const currentPool = pondRec?.current_population ?? initial;
      if (numberHarvested > currentPool) {
        throw new Error('Harvest quantity cannot exceed the current live fish count.');
      }

      const created = await t.harvestLog.create({
        data: {
          pondId,
          numberHarvested,
          avgWeightGrams: avgWeightGrams ?? null,
          biomassKg: biomassKg ?? null,
          method: method || null,
          destination: destination || null,
          recordedAt: new Date(),
          workerId: req.userId || null,
        },
        include: { pond: true, worker: { select: { id: true, name: true, email: true } } },
      });

      await t.pond.update({ where: { id: pondId }, data: { current_population: Math.max(0, currentPool - numberHarvested) } });

      return created;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid harvest request';
    return res.status(400).json({ error: message });
  }

  const pond = await prisma.pond.findUnique({ where: { id: pondId }, include: { site: { include: { farm: { select: { ownerId: true } } } } } });
  if (pond?.site.farm.ownerId && pond.site.farm.ownerId !== req.userId) {
    await createNotificationForUser(
      pond.site.farm.ownerId,
      `Pond ${harvest.pond.number} harvest recorded`,
      `${harvest.worker?.name || 'Worker'} harvested ${harvest.numberHarvested} fish.`,
      { pondId, harvestId: harvest.id, type: 'HARVEST_RECORDED' },
    );
  }

  res.status(201).json({ harvest });
}

export async function deleteHarvest(req: AuthRequest, res: Response) {
  const { id } = req.params as { id?: string };
  if (!id) return res.status(400).json({ error: 'harvest id required' });

  const harvest = await prisma.harvestLog.findUnique({ where: { id } });
  if (!harvest) return res.status(404).json({ error: 'Harvest not found' });

  // workers may only delete their own harvest records
  if (req.userRole === 'WORKER' && harvest.workerId !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const t = tx as any;
      // restore pond population
      await t.pond.update({ where: { id: harvest.pondId }, data: { current_population: { increment: harvest.numberHarvested } } });
      // remove the harvest record
      await t.harvestLog.delete({ where: { id } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to undo harvest';
    return res.status(400).json({ error: message });
  }

  res.json({ success: true });
}
