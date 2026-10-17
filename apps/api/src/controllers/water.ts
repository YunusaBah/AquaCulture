import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotificationForUser } from './notifications';
import { pondTenantWhere } from '../lib/tenant';

function workerCanAccessPond(assignedUserId: string | null | undefined, workerId?: string) {
  return !assignedUserId || assignedUserId === workerId;
}

export async function getWaterQuality(req: AuthRequest, res: Response) {
  const where = {
    pond: {
      AND: [
        pondTenantWhere(req.tenantId || ''),
        ...(req.userRole === 'WORKER' ? [{ OR: [{ assignedUserId: req.userId }, { assignedUserId: null }] }] : []),
      ],
    },
  };
  const waterLogs = await prisma.waterQualityLog.findMany({
    where,
    orderBy: { measuredAt: 'desc' },
    include: {
      pond: true,
      worker: { select: { id: true, name: true, email: true } },
    },
  });

  res.json({ waterLogs });
}

export async function createWaterQuality(req: AuthRequest, res: Response) {
  const { pondId, ph, temperature, ammonia, nitrite, nitrate, dissolvedO2, conductivity, salinity, turbidity, waterLevel, waterAddedPercent, waterRemovedPercent, comment } = req.body as {
    pondId?: string;
    ph?: number;
    temperature?: number;
    ammonia?: number;
    nitrite?: number;
    nitrate?: number;
    dissolvedO2?: number;
    conductivity?: number;
    salinity?: number;
    turbidity?: number;
    waterLevel?: number;
    waterAddedPercent?: number;
    waterRemovedPercent?: number;
    comment?: string;
  };

  if (!pondId) {
    return res.status(400).json({ error: 'pondId is required' });
  }

  const accessiblePond = await prisma.pond.findFirst({ where: { id: pondId, ...pondTenantWhere(req.tenantId || '') }, select: { assignedUserId: true } });
  if (!accessiblePond || (req.userRole === 'WORKER' && !workerCanAccessPond(accessiblePond.assignedUserId, req.userId))) return res.status(403).json({ error: 'Forbidden' });

  const waterLog = await prisma.waterQualityLog.create({
    data: {
      pondId,
      workerId: req.userId || null,
      ph: ph ?? null,
      temperature: temperature ?? null,
      ammonia: ammonia ?? null,
      nitrite: nitrite ?? null,
      nitrate: nitrate ?? null,
      dissolvedO2: dissolvedO2 ?? null,
      conductivity: conductivity ?? null,
      salinity: salinity ?? null,
      turbidity: turbidity ?? null,
      waterLevel: waterLevel ?? null,
      waterAddedPercent: waterAddedPercent ?? null,
      waterRemovedPercent: waterRemovedPercent ?? null,
      comment: comment || 'Routine water inspection',
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
      `Pond ${waterLog.pond.number} water updated`,
      `${waterLog.worker?.name || 'Worker'} recorded pH ${waterLog.ph ?? 'not set'} and water movement.`,
      { pondId, waterLogId: waterLog.id, type: 'WATER_RECORDED' },
    );
  }

  res.status(201).json({ waterLog });
}
