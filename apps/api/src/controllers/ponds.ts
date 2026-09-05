import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import multer from 'multer';
import { createNotificationForUser } from './notifications';
import type { FeedingLog, MortalityLog, HarvestLog, GrowthMeasurement, WaterQualityLog } from '@prisma/client';

const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function getRecommendedFeedSize(avgWeightGrams: number | null | undefined) {
  if (!avgWeightGrams || avgWeightGrams <= 0) return '4mm';
  if (avgWeightGrams < 50) return '1mm';
  if (avgWeightGrams < 100) return '1.5mm';
  if (avgWeightGrams < 200) return '2mm';
  if (avgWeightGrams < 350) return '2.5mm';
  if (avgWeightGrams < 500) return '3mm';
  if (avgWeightGrams < 700) return '3.5mm';
  if (avgWeightGrams < 900) return '4mm';
  return '4.5mm';
}

function buildHarvestProjection(pond: {
  stockedAt: Date | null;
  initialAvgWeightG: number | null;
  targetHarvestKg: number | null;
  expectedGrowthGDay: number | null;
}) {
  if (!pond.stockedAt || !pond.initialAvgWeightG || !pond.targetHarvestKg || !pond.expectedGrowthGDay) {
    return null;
  }

  const targetWeightG = pond.targetHarvestKg * 1000;
  const daysToTarget = Math.max(0, Math.ceil((targetWeightG - pond.initialAvgWeightG) / pond.expectedGrowthGDay));
  const expectedHarvestDate = new Date(pond.stockedAt);
  expectedHarvestDate.setDate(expectedHarvestDate.getDate() + daysToTarget);
  const daysRemaining = Math.ceil((expectedHarvestDate.getTime() - Date.now()) / 86400000);
  const daysSinceStocking = Math.max(0, Math.floor((Date.now() - pond.stockedAt.getTime()) / 86400000));
  const estimatedCurrentWeightG = pond.initialAvgWeightG + daysSinceStocking * pond.expectedGrowthGDay;

  return {
    targetWeightKg: pond.targetHarvestKg,
    expectedHarvestDate,
    daysToTarget,
    daysRemaining,
    estimatedCurrentWeightG: Number(estimatedCurrentWeightG.toFixed(1)),
    progressPercent: Number(Math.min(100, (estimatedCurrentWeightG / targetWeightG) * 100).toFixed(1)),
  };
}

export async function getPonds(req: AuthRequest, res: Response) {
  const ponds = await prisma.pond.findMany({
    where: {},
    orderBy: { number: 'asc' },
    include: {
      site: true,
      assignedUser: { select: { id: true, name: true, email: true } },
      current_batch: true,
      attachments: true,
    },
  });

  res.json({ ponds });
}

export async function getPond(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const today = startOfToday();

  // basic pond record
  const pond = await prisma.pond.findUnique({
    where: { id },
    include: {
      site: true,
      assignedUser: { select: { id: true, name: true, email: true } },
      current_batch: true,
      attachments: true,
    },
  });
  if (!pond) return res.status(404).json({ error: 'Pond not found' });

  // load related logs separately to avoid typed include mismatches
  const [feedLogs, waterLogs, mortalityLogs, harvestLogs, growthMeasurements] = await Promise.all([
    prisma.feedingLog.findMany({ where: { pondId: id }, orderBy: { date: 'desc' }, include: { worker: { select: { id: true, name: true, email: true } } } }),
    prisma.waterQualityLog.findMany({ where: { pondId: id }, orderBy: { measuredAt: 'desc' }, take: 1, include: { worker: { select: { id: true, name: true, email: true } } } }),
    prisma.mortalityLog.findMany({ where: { pondId: id }, orderBy: { observedAt: 'desc' }, include: { worker: { select: { id: true, name: true, email: true } } } }),
    prisma.harvestLog.findMany({ where: { pondId: id }, orderBy: { recordedAt: 'desc' }, include: { worker: { select: { id: true, name: true, email: true } } } }),
    prisma.growthMeasurement.findMany({ where: { pondId: id }, orderBy: { measuredAt: 'desc' }, include: { worker: { select: { id: true, name: true, email: true } } } }),
  ]);

  const latestWater = waterLogs[0] || null;
  const latestFeeding = feedLogs[0] || null;
  const latestGrowth = growthMeasurements[0] || null;

  const totalFeedKg = feedLogs.reduce((sum: number, log: FeedingLog) => sum + (log.quantityKg || 0), 0);
  const totalMortality = mortalityLogs.reduce((sum: number, log: MortalityLog) => sum + (log.numberDead || 0), 0);
  const totalHarvested = harvestLogs.reduce((sum: number, h: HarvestLog) => sum + (h.numberHarvested || 0), 0);

  const initialStock = pond.initial_population ?? pond.current_population ?? 0;
  const currentLive = initialStock - totalMortality - totalHarvested;

  const fedToday = feedLogs.some((f: FeedingLog) => new Date(f.date) >= today);
  const todayFeedKg = feedLogs.filter((f: FeedingLog) => new Date(f.date) >= today).reduce((s: number, f: FeedingLog) => s + (f.quantityKg || 0), 0);
  const todayMortality = mortalityLogs.filter((m: MortalityLog) => new Date(m.observedAt) >= today).reduce((s: number, m: MortalityLog) => s + (m.numberDead || 0), 0);

  const latestFeedSize = latestFeeding?.feedSize || null;
  const recommendedFeedSize = getRecommendedFeedSize(latestGrowth?.avgWeightGrams ?? pond.initialAvgWeightG ?? null);
  const todayFeedLogs = feedLogs.filter((f: FeedingLog) => new Date(f.date) >= today);

  const summary = {
    totalFeedKg,
    totalMortality,
    totalHarvested,
    currentLive,
    fedToday,
    todayFeedKg,
    todayFeedLogs: todayFeedLogs.map((log: FeedingLog & { worker?: any }) => ({
      id: log.id,
      date: log.date,
      quantityKg: log.quantityKg,
      feedType: log.feedType,
      feedSize: log.feedSize,
      appetite: log.appetite,
      observation: log.observation,
      worker: log.worker,
    })),
    todayMortality,
    appetite: latestFeeding?.appetite ?? null,
    behavior: latestFeeding?.observation || null,
    reactive: latestFeeding?.appetite ? latestFeeding.appetite >= 4 : null,
    latestFeedSize,
    latestFeedType: latestFeeding?.feedType || null,
    recommendedFeedSize,
    ph: latestWater?.ph ?? null,
    dissolvedO2: latestWater?.dissolvedO2 ?? null,
    ammonia: latestWater?.ammonia ?? null,
    waterIssue: latestWater ? Boolean((latestWater.ph && (latestWater.ph < 6.5 || latestWater.ph > 8.5)) || (latestWater.dissolvedO2 && latestWater.dissolvedO2 < 5) || (latestWater.ammonia && latestWater.ammonia > 0.05)) : false,
    waterAddedPercent: latestWater?.waterAddedPercent ?? null,
    waterRemovedPercent: latestWater?.waterRemovedPercent ?? null,
    lastUpdatedBy: latestFeeding?.worker || latestWater?.worker || latestGrowth?.worker || (mortalityLogs[0]?.worker ?? null),
    lastUpdatedAt: latestFeeding?.date || latestWater?.measuredAt || latestGrowth?.measuredAt || (mortalityLogs[0]?.observedAt ?? null),
    harvest: buildHarvestProjection(pond),
    growthHistory: growthMeasurements.map((g) => ({ measuredAt: g.measuredAt, avgWeightGrams: g.avgWeightGrams, worker: g.worker })),
    harvestHistory: harvestLogs.map((h) => ({ recordedAt: h.recordedAt, numberHarvested: h.numberHarvested, avgWeightGrams: h.avgWeightGrams, biomassKg: h.biomassKg })),
  };

  res.json({ pond: { ...pond, feedLogs, mortalityLogs, harvestLogs, growthMeasurements }, summary });
}

export async function createPond(req: AuthRequest, res: Response) {
  if (req.userRole === 'WORKER') {
    return res.status(403).json({ error: 'Workers cannot create ponds' });
  }
  const { siteId, number, species, capacity, currentVolume, assignedUserId, status, createdAt, initialPopulation, stockedAt, initialAvgWeightG, targetHarvestKg, expectedGrowthGDay } = req.body as {
    siteId?: string;
    number?: number;
    species?: string;
    capacity?: number;
    currentVolume?: number;
    assignedUserId?: string;
    status?: string;
    createdAt?: string;
    initialPopulation?: number;
    stockedAt?: string;
    initialAvgWeightG?: number;
    targetHarvestKg?: number;
    expectedGrowthGDay?: number;
  };

  if (!siteId || !number || !species || !capacity) {
    return res.status(400).json({ error: 'siteId, number, species, and capacity are required' });
  }

  const pond = await prisma.pond.create({
    data: {
      siteId,
      number,
      species: species as any,
      capacity,
      current_volume: currentVolume ?? null,
      initial_population: initialPopulation ?? null,
      current_population: initialPopulation ?? null,
      stockedAt: stockedAt ? new Date(stockedAt) : null,
      initialAvgWeightG: initialAvgWeightG ?? null,
      targetHarvestKg: targetHarvestKg ?? null,
      expectedGrowthGDay: expectedGrowthGDay ?? null,
      assignedUserId: assignedUserId || null,
      status: (status as any) || 'ACTIVE',
      createdAt: createdAt ? new Date(createdAt) : undefined,
    },
    include: {
      site: true,
      assignedUser: { select: { id: true, name: true, email: true } },
    },
  });

  // generate and save QR code data URI into pond record
  try {
    const qrData = `pond:${pond.id}`;
    const dataUri = await QRCode.toDataURL(qrData);
    await prisma.pond.update({ where: { id: pond.id }, data: { qrCode: dataUri } });
    pond.qrCode = dataUri as any;
  } catch (e) {
    console.warn('QR generation failed', e);
  }

  const workers = await prisma.user.findMany({
    where: { role: { name: 'WORKER' } },
    select: { id: true },
  });
  await Promise.all(workers.map((worker) => createNotificationForUser(
    worker.id,
    `Pond ${pond.number} created`,
    `${req.user?.name || 'Farm Owner'} created Pond ${pond.number}.`,
    { pondId: pond.id, type: 'POND_CREATED' },
  )));

  res.status(201).json({ pond });
}

export async function updatePond(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const data = req.body;
  try {
    const pond = await prisma.pond.update({ where: { id }, data, include: { site: true, assignedUser: true, attachments: true } });
    res.json({ pond });
  } catch (e) {
    res.status(400).json({ error: 'Failed to update pond' });
  }
}

export async function deletePond(req: AuthRequest, res: Response) {
  const { id } = req.params;

  try {
    const [feedLogs, waterLogs, mortalityLogs, harvestLogs, growthMeasurements, attachments] = await Promise.all([
      prisma.feedingLog.findMany({ where: { pondId: id }, select: { id: true } }),
      prisma.waterQualityLog.findMany({ where: { pondId: id }, select: { id: true } }),
      prisma.mortalityLog.findMany({ where: { pondId: id }, select: { id: true } }),
      prisma.harvestLog.findMany({ where: { pondId: id }, select: { id: true } }),
      prisma.growthMeasurement.findMany({ where: { pondId: id }, select: { id: true } }),
      prisma.attachment.findMany({ where: { pondId: id }, select: { id: true } }),
    ]);

    const feedIds = feedLogs.map((entry) => entry.id);
    const waterIds = waterLogs.map((entry) => entry.id);
    const mortalityIds = mortalityLogs.map((entry) => entry.id);
    const harvestIds = harvestLogs.map((entry) => entry.id);
    const growthIds = growthMeasurements.map((entry) => entry.id);
    const attachmentIds = attachments.map((entry) => entry.id);

    await prisma.$transaction(async (tx) => {
      if (attachmentIds.length > 0) {
        await tx.attachment.deleteMany({
          where: {
            OR: [
              { id: { in: attachmentIds } },
              { feedingLogId: { in: feedIds } },
              { mortalityLogId: { in: mortalityIds } },
              { harvestLogId: { in: harvestIds } },
              { growthMeasurementId: { in: growthIds } },
            ],
          },
        });
      }

      await tx.financeRecord.deleteMany({ where: { pondId: id } });
      await tx.feedingLog.deleteMany({ where: { pondId: id } });
      await tx.waterQualityLog.deleteMany({ where: { pondId: id } });
      await tx.mortalityLog.deleteMany({ where: { pondId: id } });
      await tx.harvestLog.deleteMany({ where: { pondId: id } });
      await tx.growthMeasurement.deleteMany({ where: { pondId: id } });
      await tx.pond.delete({ where: { id } });
    });

    res.status(204).send();
  } catch (e) {
    console.error('Pond deletion failed', e);
    res.status(400).json({ error: 'Pond cannot be deleted while it has related records. Archive it instead or remove related records first.' });
  }
}

// express middleware wrapper for multer when used directly in routes file
export function photoUploadMiddleware() {
  return upload.single('photo');
}

export async function uploadPondPhoto(req: AuthRequest, res: Response) {
  const { id } = req.params;
  if (req.userRole === 'WORKER') {
    const pond = await prisma.pond.findUnique({ where: { id }, select: { assignedUserId: true } });
    if (!pond || pond.assignedUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const file = req.file;
  // move file to a stable path with original name
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const target = path.join(uploadsDir, `${Date.now()}-${file.originalname}`);
  fs.renameSync(file.path, target);

  const url = `/uploads/${path.basename(target)}`; // static serving assumed
  const attachment = await prisma.attachment.create({ data: { url, mime: file.mimetype, uploadedById: req.userId || null, pondId: id } });

  res.status(201).json({ attachment });
}

export async function getPondQr(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const pond = await prisma.pond.findUnique({ where: { id } });
  if (!pond) return res.status(404).send('Not found');
  if (req.userRole === 'WORKER' && pond.assignedUserId !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (pond.qrCode) {
    return res.json({ qr: pond.qrCode });
  }
  try {
    const dataUri = await QRCode.toDataURL(`pond:${pond.id}`);
    await prisma.pond.update({ where: { id }, data: { qrCode: dataUri } });
    res.json({ qr: dataUri });
  } catch (e) {
    res.status(500).json({ error: 'QR generation failed' });
  }
}
