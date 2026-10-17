import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotificationForUser } from './notifications';
import { nextReportReference } from '../lib/financeTransactionId';
import { pondTenantWhere } from '../lib/tenant';
import { hasPermissionForRole } from '../config/permissions';

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function applyQueuedSyncItem(
  userId: string,
  tenantId: string,
  userRole: 'OWNER' | 'WORKER',
  item: { action?: string; tableName?: string; recordId?: string; payload?: Record<string, any> },
) {
  const payload = item.payload || {};

  switch (item.action) {
    case 'pond_create': {
      if (userRole !== 'OWNER') throw new Error('Only admins can create ponds.');
      const siteName = String(payload.siteName || 'Primary Farm Site').trim();
      const species = String(payload.species || 'CATFISH');
      const requestedNumber = asNumber(payload.number);
      const capacity = asNumber(payload.capacity) ?? 5000;
      const initialPopulation = asNumber(payload.initialPopulation);
      if (!initialPopulation) {
        throw new Error('pond_create payload requires initialPopulation');
      }

      let site = payload.siteId
        ? await prisma.farmSite.findFirst({ where: { id: String(payload.siteId), farm: { ownerId: tenantId } } })
        : null;
      if (!site) {
        site = await prisma.farmSite.findFirst({ where: { name: { equals: siteName, mode: 'insensitive' }, farm: { ownerId: tenantId } } });
      }
      if (!site) {
        const ownerFarm =
          (await prisma.farm.findFirst({ where: { ownerId: tenantId }, orderBy: { createdAt: 'asc' } })) ||
          (await prisma.farm.create({ data: { name: siteName, ownerId: tenantId } }));
        site = await prisma.farmSite.create({
          data: { name: siteName, farmId: ownerFarm.id, location: 'Farm site', timezone: 'UTC' },
        });
      }

      const assignedUserId = typeof payload.assignedUserId === 'string' && payload.assignedUserId ? payload.assignedUserId : null;
      if (assignedUserId && !(await prisma.user.findFirst({
        where: { id: assignedUserId, adminId: tenantId, role: { name: 'WORKER' } },
        select: { id: true },
      }))) throw new Error('The selected worker does not belong to this workspace.');
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(74152861)::text AS locked`;
        const highestNumberedPond = await tx.pond.findFirst({ where: pondTenantWhere(tenantId), orderBy: { number: 'desc' }, select: { number: true } });
        const number = Math.max(requestedNumber || 0, (highestNumberedPond?.number ?? 0) + 1);
        return tx.pond.create({
          data: {
            siteId: site.id,
            number,
            species: species as any,
            capacity,
            current_volume: asNumber(payload.currentVolume) ?? null,
            initial_population: initialPopulation,
            current_population: initialPopulation,
            stockedAt: new Date(),
            initialAvgWeightG: asNumber(payload.initialAvgWeightG) ?? null,
            targetHarvestKg: asNumber(payload.targetHarvestKg) ?? null,
            targetHarvestDate: payload.targetHarvestDate ? new Date(String(payload.targetHarvestDate)) : null,
            recommendedFeedSize: payload.recommendedFeedSize ? String(payload.recommendedFeedSize) : null,
            expectedGrowthGDay: asNumber(payload.expectedGrowthGDay) ?? null,
            assignedUserId: assignedUserId || null,
            status: (payload.status as any) || 'ACTIVE',
          },
        });
      });
    }

    case 'task_create': {
      if (userRole !== 'OWNER') throw new Error('Only admins can create tasks.');
      const assigneeIds = (Array.isArray(payload.assigneeIds) ? payload.assigneeIds : payload.assigneeId ? [payload.assigneeId] : [])
        .filter((value): value is string => typeof value === 'string' && Boolean(value));
      const title = String(payload.title || '').trim();
      const description = payload.description ? String(payload.description) : null;
      if (!title) {
        throw new Error('task_create payload requires title');
      }
      const workers = await prisma.user.findMany({
        where: { id: { in: assigneeIds }, adminId: tenantId, role: { name: 'WORKER' } },
        select: { id: true },
      });
      if (workers.length !== assigneeIds.length) throw new Error('Task assignees must belong to this workspace.');

      const task = await prisma.$transaction(async (tx) => tx.task.create({
        data: {
          reportId: await nextReportReference(tx),
          tenantId,
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
      }));

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
      if (userRole !== 'OWNER') throw new Error('Only admins can create finance records.');
      const normalizedType = String(payload.type ?? 'RUNNING_COST').toUpperCase();
      const financeTypeMap: Record<string, string> = {
        INCOME: 'SALES',
        EXPENSE: 'RUNNING_COST',
        BUDGET: 'FIXED_COST',
      };
      const type = financeTypeMap[normalizedType] || normalizedType;
      if (payload.pondId && !(await prisma.pond.findFirst({
        where: { id: String(payload.pondId), ...pondTenantWhere(tenantId) },
        select: { id: true },
      }))) throw new Error('Pond not found in this workspace.');
      return prisma.$transaction(async (tx) => tx.financeRecord.create({
        data: {
          transactionId: await nextReportReference(tx),
          type: type as any,
          category: String(payload.category || 'General'),
          description: payload.description ? String(payload.description) : null,
          quantity: asNumber(payload.quantity) ?? null,
          unit: payload.unit ? String(payload.unit) : null,
          unitPrice: asNumber(payload.unitPrice) ?? null,
          amount: asNumber(payload.amount) ?? 0,
          pondId: payload.pondId ? String(payload.pondId) : null,
          recordedById: userId,
          tenantId,
        },
      }));
    }

    case 'pond_update': {
      const pondId = item.recordId || payload.pondId;
      if (!pondId) {
        throw new Error('pond_update payload requires pondId');
      }
      const pond = await prisma.pond.findFirst({
        where: { id: String(pondId), ...pondTenantWhere(tenantId) },
        select: { id: true, assignedUserId: true },
      });
      if (!pond) throw new Error('Pond not found in this workspace.');
      if (userRole === 'WORKER' && pond.assignedUserId !== userId) throw new Error('Workers can only update ponds assigned to them.');

      // perform all pond updates inside a transaction so denormalized population stays consistent
      const result = await prisma.$transaction(async (tx) => {
        const created: any[] = [];
        const pondRec = await tx.pond.findUnique({ where: { id: String(pondId) }, select: { current_population: true, initial_population: true } });
        const initial = pondRec?.initial_population ?? 0;
        let currentPool = pondRec?.current_population ?? initial;

        const feedKgFromGrams = asNumber(payload.feedGrams);
        const feedKg = asNumber(payload.feedKg) ?? (feedKgFromGrams ? feedKgFromGrams / 1000 : undefined);
        if (feedKg && feedKg > 0) {
          const f = await tx.feedingLog.create({
            data: {
              pondId: String(pondId),
              workerId: userId,
              quantityKg: feedKg,
              feedType: typeof payload.feedType === 'string' && payload.feedType ? String(payload.feedType) : 'Pellet',
              feedSize: typeof payload.feedSize === 'string' && payload.feedSize ? String(payload.feedSize) : '4mm',
              appetite: asNumber(payload.appetite) ?? null,
              observation: payload.behavior ? String(payload.behavior) : null,
              date: new Date(),
            },
          });
          created.push(f);
        }

        if (
          payload.ph !== undefined ||
          payload.dissolvedO2 !== undefined ||
          payload.ammonia !== undefined ||
          payload.waterAddedPercent !== undefined ||
          payload.waterRemovedPercent !== undefined ||
          payload.waterComment
        ) {
          const w = await tx.waterQualityLog.create({
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
          });
          created.push(w);
        }

        const mortality = asNumber(payload.mortality);
        if (mortality && mortality > 0) {
          if (mortality > currentPool) throw new Error('Mortality cannot exceed current live fish');
          const m = await tx.mortalityLog.create({
            data: {
              pondId: String(pondId),
              workerId: userId,
              numberDead: mortality,
              possibleCause: payload.mortalityCause ? String(payload.mortalityCause) : 'Unspecified',
              observedAt: new Date(),
            },
          });
          currentPool = Math.max(0, currentPool - mortality);
          await tx.pond.update({ where: { id: String(pondId) }, data: { current_population: currentPool } });
          created.push(m);
        }

        const harvestQty = asNumber(payload.harvestQuantity);
        if (harvestQty && harvestQty > 0) {
          if (harvestQty > currentPool) throw new Error('Harvest quantity cannot exceed current live fish');
          const h = await (tx as any).harvestLog.create({
            data: {
              pondId: String(pondId),
              workerId: userId,
              numberHarvested: harvestQty,
              avgWeightGrams: asNumber(payload.harvestAvgWeight) ?? null,
              biomassKg: asNumber(payload.harvestBiomassKg) ?? null,
              method: payload.harvestMethod ? String(payload.harvestMethod) : null,
              destination: payload.harvestDestination ? String(payload.harvestDestination) : null,
              recordedAt: new Date(),
            },
          });
          currentPool = Math.max(0, currentPool - harvestQty);
          await tx.pond.update({ where: { id: String(pondId) }, data: { current_population: currentPool } });
          created.push(h);
        }

        const growth = asNumber(payload.avgWeightGrams);
        if (growth && growth > 0) {
          const g = await (tx as any).growthMeasurement.create({
            data: {
              pondId: String(pondId),
              workerId: userId,
              avgWeightGrams: growth,
              measuredAt: new Date(),
              comment: payload.growthComment ? String(payload.growthComment) : null,
            },
          });
          created.push(g);
        }

        return created;
      });

      return result;
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
      clientId?: string;
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
  if (items.some((item) => typeof item.clientId !== 'string' || !item.clientId.trim())) {
    return res.status(400).json({ error: 'Every sync item must include its clientId' });
  }

  const queued = await Promise.all(
    items.map((item) =>
      prisma.deviceSync.upsert({
        where: {
          userId_clientId: {
            userId: req.userId!,
            clientId: item.clientId!.trim(),
          },
        },
        update: {},
        create: {
          userId: req.userId!,
          clientId: item.clientId!.trim(),
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
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { permissions: true } });
  const pending = await prisma.deviceSync.findMany({
    where: { userId: req.userId!, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });

  if (pending.length === 0) {
    return res.json({ flushed: 0, items: [] });
  }

  const flushed: Array<{ id: string; clientId: string | null; action: string; status: string; error?: string }> = [];

  for (const item of pending) {
    try {
      const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
        ? item.payload as Record<string, unknown>
        : {};
      const requiredPermissions: string[] = item.action === 'pond_create'
        ? ['POND_CREATE']
        : item.action === 'task_create'
          ? ['TASK_CREATE']
          : item.action === 'finance_record_create'
            ? ['FINANCE_MANAGE']
            : item.action === 'pond_update'
              ? [
                ...(payload.feedKg || payload.feedGrams ? ['FEEDING_CREATE'] : []),
                ...(payload.ph !== undefined || payload.dissolvedO2 !== undefined || payload.ammonia !== undefined || payload.waterAddedPercent !== undefined || payload.waterRemovedPercent !== undefined || payload.waterComment ? ['WATER_QUALITY_CREATE'] : []),
                ...(payload.mortality ? ['MORTALITY_CREATE'] : []),
                ...(payload.harvestQuantity ? ['HARVEST_CREATE'] : []),
                ...(payload.avgWeightGrams ? ['OBSERVATION_CREATE'] : []),
              ]
              : [];
      const overrides = user?.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
        ? user.permissions as Record<string, unknown>
        : {};
      if (requiredPermissions.some((permission) => {
        const override = overrides[permission];
        return typeof override === 'boolean'
          ? !override
          : !hasPermissionForRole(req.userRole, permission);
      })) throw new Error('One or more permissions required for this offline change have been disabled.');
      await applyQueuedSyncItem(req.userId!, req.tenantId!, req.userRole!, item as any);
      await prisma.deviceSync.update({
        where: { id: item.id },
        data: { status: 'SYNCHRONIZED', syncedAt: new Date() },
      });
      flushed.push({ id: item.id, clientId: item.clientId, action: item.action, status: 'SYNCHRONIZED' });
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
      const message = error instanceof Error ? error.message : String(error);
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
            error: message,
          },
        },
      });
      flushed.push({ id: item.id, clientId: item.clientId, action: item.action, status: 'REJECTED', error: message });
    }
  }

  return res.json({ flushed: flushed.length, items: flushed });
}
