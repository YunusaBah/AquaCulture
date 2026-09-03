import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import multer from 'multer';
import { createNotificationForUser } from './notifications';

const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
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
  const pond = await prisma.pond.findUnique({
    where: { id },
    include: {
      site: true,
      assignedUser: { select: { id: true, name: true, email: true } },
      current_batch: true,
      attachments: true,
      feedLogs: { where: { date: { gte: today } }, orderBy: { date: 'desc' }, include: { worker: { select: { id: true, name: true, email: true } } } },
      waterLogs: { orderBy: { measuredAt: 'desc' }, take: 1, include: { worker: { select: { id: true, name: true, email: true } } } },
      mortalityLogs: { where: { observedAt: { gte: today } }, orderBy: { observedAt: 'desc' }, include: { worker: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!pond) return res.status(404).json({ error: 'Pond not found' });

  const todayFeedKg = pond.feedLogs.reduce((sum, log) => sum + log.quantityKg, 0);
  const todayMortality = pond.mortalityLogs.reduce((sum, log) => sum + log.numberDead, 0);
  const latestWater = pond.waterLogs[0] || null;
  const latestFeeding = pond.feedLogs[0] || null;
  const summary = {
    todayFeedKg,
    todayMortality,
    fedToday: todayFeedKg > 0,
    appetite: latestFeeding?.appetite ?? null,
    behavior: latestFeeding?.observation || null,
    reactive: latestFeeding?.appetite ? latestFeeding.appetite >= 4 : null,
    ph: latestWater?.ph ?? null,
    dissolvedO2: latestWater?.dissolvedO2 ?? null,
    ammonia: latestWater?.ammonia ?? null,
    waterIssue: latestWater ? Boolean((latestWater.ph && (latestWater.ph < 6.5 || latestWater.ph > 8.5)) || (latestWater.dissolvedO2 && latestWater.dissolvedO2 < 5) || (latestWater.ammonia && latestWater.ammonia > 0.05)) : false,
    waterAddedPercent: latestWater?.waterAddedPercent ?? null,
    waterRemovedPercent: latestWater?.waterRemovedPercent ?? null,
    lastUpdatedBy: latestFeeding?.worker || latestWater?.worker || pond.mortalityLogs[0]?.worker || null,
    lastUpdatedAt: latestFeeding?.date || latestWater?.measuredAt || pond.mortalityLogs[0]?.observedAt || null,
    harvest: buildHarvestProjection(pond),
  };

  res.json({ pond, summary });
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
    await prisma.pond.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
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
