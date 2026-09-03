import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotificationForUser } from './notifications';

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function applyQueuedSyncItem(
  userId: string,
  item: { action?: string; tableName?: string; recordId?: string; payload?: Record<string, any> },
) {
  const payload = item.payload || {};

  switch (item.action) {
    case 'pond_create': {
      const siteName = String(payload.siteName || 'Primary Farm Site').trim();
      const species = String(payload.species || 'CATFISH');
      const number = asNumber(payload.number);
      const capacity = asNumber(payload.capacity);
      if (!number || !capacity) {
        throw new Error('pond_create payload requires number and capacity');
      }

      let site = payload.siteId ? await prisma.farmSite.findUnique({ where: { id: String(payload.siteId) } }) : null;
      if (!site) {
        site = await prisma.farmSite.findFirst({ where: { name: { equals: siteName, mode: 'insensitive' } } });
      }
      if (!site) {
        const ownerFarm =
          (await prisma.farm.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } })) ||
          (await prisma.farm.create({ data: { name: siteName, ownerId: userId } }));
        site = await prisma.farmSite.create({
          data: { name: siteName, farmId: ownerFarm.id, location: 'Farm site', timezone: 'UTC' },
        });
      }

      const assignedUserId = typeof payload.assignedUserId === 'string' && payload.assignedUserId ? payload.assignedUserId : null;
      return prisma.pond.create({
        data: {
          siteId: site.id,
          number,
          species: species as any,
          capacity,
          current_volume: asNumber(payload.currentVolume) ?? null,
          initial_population: asNumber(payload.initialPopulation) ?? null,
          current_population: asNumber(payload.initialPopulation) ?? null,
          stockedAt: payload.stockedAt ? new Date(payload.stockedAt) : null,
          initialAvgWeightG: asNumber(payload.initialAvgWeightG) ?? null,
          targetHarvestKg: asNumber(payload.targetHarvestKg) ?? null,
          expectedGrowthGDay: asNumber(payload.expectedGrowthGDay) ?? null,
          assignedUserId: assignedUserId || null,
          status: (payload.status as any) || 'ACTIVE',
          createdAt: payload.createdAt ? new Date(payload.createdAt) : undefined,
        },
      });
    }

    case 'task_create': {
      const assigneeIds = (Array.isArray(payload.assigneeIds) ? payload.assigneeIds : payload.assigneeId ? [payload.assigneeId] : [])
        .filter((value): value is string => typeof value === 'string' && Boolean(value));
      const title = String(payload.title || '').trim();
      const description = payload.description ? String(payload.description) : null;
      if (!title) {
        throw new Error('task_create payload requires title');
      }

      const task = await prisma.task.create({
        data: {
          title,
          description,
          creatorId: userId,
          dueAt: payload.dueAt ? new Date(payload.dueAt) : undefined,
          priority: (payload.priority as any) || 'MEDIUM',
          checklist: payload.checklist ?? undefined,
          assignees: {
            create: assigneeIds.map((assigneeUserId) => ({ userId: assigneeUserId })),
          },
        },
      });

      await Promise.all(
        assigneeIds.map((assigneeUserId) =>
          createNotificationForUser(
            assigneeUserId,
            'New task assigned',
            `${payload.creatorName || 'Farm Owner'} assigned: ${task.title}`,
            { taskId: task.id, type: 'TASK_ASSIGNED' },
          ),
        ),
      );

      return task;
    }

    case 'finance_record_create': {
      return prisma.financeRecord.create({
        data: {
          type: (payload.type as any) || 'EXPENSE',
          category: String(payload.category || 'General'),
          description: payload.description ? String(payload.description) : null,
          quantity: asNumber(payload.quantity) ?? null,
          unit: payload.unit ? String(payload.unit) : null,
          unitPrice: asNumber(payload.unitPrice) ?? null,
          amount: asNumber(payload.amount) ?? 0,
          pondId: payload.pondId ? String(payload.pondId) : null,
          recordedById: userId,
          recordedAt: payload.recordedAt ? new Date(payload.recordedAt) : undefined,
        },
      });
    }

    case 'pond_update': {
      const pondId = item.recordId || payload.pondId;
      if (!pondId) {
        throw new Error('pond_update payload requires pondId');
      }

      const calls: Promise<any>[] = [];
      const feedKg = asNumber(payload.feedKg);
      if (feedKg && feedKg > 0) {
        calls.push(
          prisma.feedingLog.create({
            data: {
              pondId: String(pondId),
              workerId: userId,
              quantityKg: feedKg,
              appetite: asNumber(payload.appetite) ?? null,
              observation: payload.behavior ? String(payload.behavior) : null,
              date: new Date(),
            },
          }),
        );
      }

      if (
        payload.ph !== undefined ||
        payload.dissolvedO2 !== undefined ||
        payload.ammonia !== undefined ||
        payload.waterAddedPercent !== undefined ||
        payload.waterRemovedPercent !== undefined ||
        payload.waterComment
      ) {
        calls.push(
          prisma.waterQualityLog.create({
            data: {
              pondId: String(pondId),
              workerId: userId,
              measuredAt: new Date(),
              ph: asNumber(payload.ph) ?? null,
              dissolvedO2: asNumber(payload.dissolvedO2) ?? null,
              ammonia: asNumber(payload.ammonia) ?? null,
              waterAddedPercent: asNumber(payload.waterAddedPercent) ?? null,
              waterRemovedPercent: asNumber(payload.waterRemovedPercent) ?? null,
              comment: payload.waterComment ? String(payload.waterComment) : 'Worker pond update',
            },
          }),
        );
      }

      const mortality = asNumber(payload.mortality);
      if (mortality && mortality > 0) {
        calls.push(
          prisma.mortalityLog.create({
            data: {
              pondId: String(pondId),
              workerId: userId,
              numberDead: mortality,
              possibleCause: payload.mortalityCause ? String(payload.mortalityCause) : 'Unspecified',
              observedAt: new Date(),
            },
          }),
        );
      }

      if (calls.length === 0) {
        return null;
      }

      return Promise.all(calls);
    }

    default:
      return null;
  }
}

export async function listSyncQueue(req: AuthRequest, res: Response) {
  const items = await prisma.deviceSync.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json({ items, count: items.length });
}

export async function queueSyncItems(req: AuthRequest, res: Response) {
  const { items } = req.body as {
    items?: Array<{
      action?: string;
      tableName?: string;
      recordId?: string;
      payload?: Record<string, any>;
      deviceId?: string;
    }>;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items[] is required' });
  }

  const queued = await Promise.all(
    items.map((item) =>
      prisma.deviceSync.create({
        data: {
          userId: req.userId!,
          deviceId: item.deviceId || 'browser-web',
          action: item.action || 'UPDATE',
          tableName: item.tableName || 'unknown_table',
          recordId: item.recordId || undefined,
          payload: item.payload || {},
        },
      }),
    ),
  );

  return res.status(201).json({ items: queued, count: queued.length });
}

export async function flushSyncQueue(req: AuthRequest, res: Response) {
  const pending = await prisma.deviceSync.findMany({
    where: { userId: req.userId!, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });

  if (pending.length === 0) {
    return res.json({ flushed: 0, items: [] });
  }

  const flushed: Array<{ id: string; action: string; status: string }> = [];

  for (const item of pending) {
    try {
      await applyQueuedSyncItem(req.userId!, item as any);
      await prisma.deviceSync.update({
        where: { id: item.id },
        data: { status: 'SYNCHRONIZED', syncedAt: new Date() },
      });
      flushed.push({ id: item.id, action: item.action, status: 'SYNCHRONIZED' });
      await prisma.auditLog.create({
        data: {
          userId: req.userId!,
          action: `SYNC:${item.action}`,
          tableName: item.tableName,
          recordId: item.recordId,
          meta: {
            deviceId: item.deviceId,
            payload: item.payload,
            status: 'SYNCHRONIZED',
          },
        },
      });
    } catch (error) {
      await prisma.deviceSync.update({
        where: { id: item.id },
        data: { status: 'REJECTED', syncedAt: new Date() },
      });
      await prisma.auditLog.create({
        data: {
          userId: req.userId!,
          action: `SYNC_REJECTED:${item.action}`,
          tableName: item.tableName,
          recordId: item.recordId,
          meta: {
            deviceId: item.deviceId,
            payload: item.payload,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      });
    }
  }

  return res.json({ flushed: flushed.length, items: flushed });
}
