import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { getFallbackUserByCredentials, listRuntimeUsers, runtimeUsers } from '../lib/devUsers';
import { nextReportReference } from '../lib/financeTransactionId';
import { hasStrongPassword } from '../lib/password';

export function getCurrentUser(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  return res.json({
    user: {
      id: req.user.id,
      reportId: req.user.reportId,
      email: req.user.email,
      name: req.user.name,
      profilePhoto: req.user.profilePhoto,
      fontSize: req.user.fontSize,
      highContrast: req.user.highContrast,
      permissions: req.user.permissions,
      role: req.userRole,
    },
  });
}

const DEV_SEED_USERS = [
  {
    email: process.env.SEED_OWNER_EMAIL || 'owner@aquaculture.localapp',
    password: process.env.SEED_OWNER_PASSWORD || 'Owner7614091',
    name: 'Farm Owner',
    role: 'OWNER',
  },
  {
    email: process.env.SEED_WORKER_EMAIL || 'worker@aquaculture.localapp',
    password: process.env.SEED_WORKER_PASSWORD || 'Worker5221',
    name: 'Field Worker',
    role: 'WORKER',
  },
] as const;

async function ensureDevelopmentUsers() {
  if (process.env.NODE_ENV === 'production') return;

  try {
    for (const roleName of ['OWNER', 'WORKER'] as const) {
      await prisma.role.upsert({
        where: { name: roleName },
        update: {},
        create: { name: roleName },
      });
    }

    for (const userSeed of DEV_SEED_USERS) {
      const developmentOwner = userSeed.role === 'WORKER'
        ? await prisma.user.findUnique({ where: { email: DEV_SEED_USERS[0].email }, select: { id: true } })
        : null;
      const existingUser = await prisma.user.findUnique({
        where: { email: userSeed.email },
        include: { role: true },
      });

      if (!existingUser) {
        const hashed = await bcrypt.hash(userSeed.password, 10);
        await prisma.user.create({
          data: {
            reportId: await nextReportReference(prisma),
            email: userSeed.email,
            name: userSeed.name,
            password: hashed,
            blocked: false,
            ...(developmentOwner ? { admin: { connect: { id: developmentOwner.id } } } : {}),
            role: { connect: { name: userSeed.role } },
          },
        });
        continue;
      }

      const matchesPassword = await bcrypt.compare(userSeed.password, existingUser.password);
      if (existingUser.role.name !== userSeed.role || !matchesPassword || (developmentOwner && existingUser.adminId !== developmentOwner.id)) {
        const hashed = await bcrypt.hash(userSeed.password, 10);
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: userSeed.name,
            password: hashed,
            blocked: false,
            ...(developmentOwner ? { admin: { connect: { id: developmentOwner.id } } } : {}),
            role: { connect: { name: userSeed.role } },
          },
        });
      }
    }
  } catch (error) {
    console.warn('Development user sync is unavailable', error);
  }
}

/**
 * Public registration always creates an isolated OWNER workspace.
 */
export async function register(req: Request, res: Response) {
  const { email, name, password } = req.body;

  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name, and password are required' });
  }

  if (!hasStrongPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and numbers.' });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim();
    const runtimeEntry = listRuntimeUsers().find((user) => user.email.toLowerCase() === normalizedEmail);
    if (runtimeEntry) {
      return res.status(409).json({ error: 'User already exists' });
    }

    await ensureDevelopmentUsers();
    await prisma.role.upsert({ where: { name: 'OWNER' }, update: {}, create: { name: 'OWNER' } });
    await prisma.role.upsert({ where: { name: 'WORKER' }, update: {}, create: { name: 'WORKER' } });

    const found = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (found) return res.status(409).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        reportId: await nextReportReference(prisma),
        email: normalizedEmail,
        name: normalizedName,
        password: hashedPassword,
        role: { connect: { name: 'OWNER' } },
      },
      include: { role: true },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({
      user: {
        id: user.id,
        reportId: user.reportId,
        email: user.email,
        name: user.name,
        role: user.role.name,
      },
      token,
    });
  } catch (error) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim();
    console.error('Registration failed', error);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'User already exists' });
    }
    return res.status(500).json({ error: 'Registration failed' });
  }
}

/**
 * Login flow: email and password for both admins and workers.
 */
export async function login(req: Request, res: Response) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }

  try {
    await ensureDevelopmentUsers();

    const fallbackUser = getFallbackUserByCredentials(email, password);
    if (fallbackUser) {
      try {
        const seeded = await prisma.user.findUnique({ where: { email: fallbackUser.email }, include: { role: true } }).catch(() => null);
        if (seeded) {
          if ((seeded as any).blocked) {
            return res.status(403).json({ error: 'This account has been blocked by the admin.' });
          }

          const token = jwt.sign({ userId: seeded.id }, JWT_SECRET, { expiresIn: '7d' });
          return res.json({ user: { id: seeded.id, reportId: seeded.reportId, email: seeded.email, name: seeded.name, role: seeded.role.name }, token });
        }
      } catch (error) {
        console.warn('Database unavailable for fallback user lookup', error);
      }

      const token = jwt.sign({ userId: fallbackUser.id }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ user: { id: fallbackUser.id, email: fallbackUser.email, name: fallbackUser.name, role: fallbackUser.role }, token });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { role: true },
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if ((user as any).blocked) {
      return res.status(403).json({ error: 'This account has been blocked by the admin.' });
    }

    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ user: { id: user.id, reportId: user.reportId, email: user.email, name: user.name, role: user.role.name }, token });
  } catch (error) {
    console.error('Login failed', error);
    return res.status(503).json({ error: 'Login service is temporarily unavailable. Please try again shortly.' });
  }
}

/**
 * OWNER creates WORKER account
 * Only OWNER can call this endpoint
 */
export async function createWorker(req: Request, res: Response) {
  const { email, name, password } = req.body;
  const ownerId = (req as any).userId;

  if (!ownerId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const runtimeOwner = listRuntimeUsers().find((user) => user.id === ownerId && user.role === 'OWNER');
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, include: { role: true } }).catch(() => null);
  if ((!owner || owner.role.name !== 'OWNER') && !runtimeOwner) {
    return res.status(403).json({ error: 'Only OWNER can create workers' });
  }

  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name, and password are required' });
  }

  if (!hasStrongPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and numbers.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedName = String(name).trim();

  try {
    const found = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (found) return res.status(409).json({ error: 'Email already taken' });
    if (listRuntimeUsers().some((user) => user.email.toLowerCase() === normalizedEmail)) {
      return res.status(409).json({ error: 'Email already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const worker = await prisma.user.create({
      data: {
        reportId: await nextReportReference(prisma),
        email: normalizedEmail,
        name: normalizedName,
        password: hashedPassword,
        blocked: false,
        role: { connect: { name: 'WORKER' } },
        adminId: ownerId,
        farms: { connect: await prisma.farm.findMany({ where: { ownerId }, select: { id: true } }) },
      },
      include: { role: true },
    });

    res.status(201).json({
      user: {
        id: worker.id,
        reportId: worker.reportId,
        email: worker.email,
        name: worker.name,
        role: worker.role.name,
      },
    });
  } catch (error) {
    console.error('Failed to create worker', error);
    return res.status(500).json({ error: 'Worker account could not be created' });
  }
}

export async function listWorkers(req: Request, res: Response) {
  const ownerId = (req as any).userId;
  if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

  const runtimeOwner = listRuntimeUsers().find((user) => user.id === ownerId && user.role === 'OWNER');
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, include: { role: true } }).catch(() => null);
  if ((!owner || owner.role.name !== 'OWNER') && !runtimeOwner) {
    return res.status(403).json({ error: 'Only OWNER can view workers' });
  }

  const workers = await prisma.user.findMany({
    where: { role: { name: 'WORKER' }, adminId: ownerId },
    include: { role: true },
    orderBy: { createdAt: 'desc' },
  }).catch(() => []);
  const runtimeWorkers = listRuntimeUsers().filter((user) => user.role === 'WORKER' && user.adminId === ownerId);

  return res.json({
    workers: [
      ...workers.map((worker) => ({
        id: worker.id,
        reportId: worker.reportId,
        email: worker.email,
        name: worker.name,
        role: worker.role.name,
        blocked: Boolean((worker as any).blocked),
        createdAt: worker.createdAt,
      })),
      ...runtimeWorkers.map((worker) => ({
        id: worker.id,
        email: worker.email,
        name: worker.name,
        role: worker.role,
        blocked: Boolean(worker.blocked),
        createdAt: new Date().toISOString(),
      })),
    ],
  });
}

export async function updateWorkerAccess(req: Request, res: Response) {
  const ownerId = (req as any).userId;
  const workerId = req.params.id;
  const { blocked } = req.body ?? {};

  if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });
  if (!workerId) return res.status(400).json({ error: 'Worker ID is required' });

  const runtimeOwner = listRuntimeUsers().find((user) => user.id === ownerId && user.role === 'OWNER');
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, include: { role: true } }).catch(() => null);
  if ((!owner || owner.role.name !== 'OWNER') && !runtimeOwner) {
    return res.status(403).json({ error: 'Only OWNER can manage worker access' });
  }

  const runtimeWorker = listRuntimeUsers().find((user) => user.id === workerId && user.role === 'WORKER' && user.adminId === ownerId);
  if (runtimeWorker) {
    runtimeWorker.blocked = Boolean(blocked);
    return res.json({
      worker: {
        id: runtimeWorker.id,
        email: runtimeWorker.email,
        name: runtimeWorker.name,
        role: runtimeWorker.role,
        blocked: runtimeWorker.blocked,
      },
    });
  }

  const worker = await prisma.user.findUnique({ where: { id: workerId }, include: { role: true } }).catch(() => null);
  if (!worker || worker.role.name !== 'WORKER' || worker.adminId !== ownerId) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  const updatedWorker = await prisma.user.update({
    where: { id: workerId },
    data: { blocked: Boolean(blocked) },
    include: { role: true },
  });

  return res.json({
    worker: {
      id: updatedWorker.id,
      email: updatedWorker.email,
      name: updatedWorker.name,
      role: updatedWorker.role.name,
      blocked: Boolean((updatedWorker as any).blocked),
      createdAt: updatedWorker.createdAt,
    },
  });
}

export async function deleteWorker(req: Request, res: Response) {
  const ownerId = (req as any).userId;
  const workerId = req.params.id;

  if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });
  if (!workerId) return res.status(400).json({ error: 'Worker ID is required' });

  const runtimeOwner = listRuntimeUsers().find((user) => user.id === ownerId && user.role === 'OWNER');
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, include: { role: true } }).catch(() => null);
  if ((!owner || owner.role.name !== 'OWNER') && !runtimeOwner) {
    return res.status(403).json({ error: 'Only OWNER can delete workers' });
  }

  const runtimeWorker = listRuntimeUsers().find((user) => user.id === workerId && user.role === 'WORKER' && user.adminId === ownerId);
  if (runtimeWorker) {
    runtimeUsers.delete(runtimeWorker.id);
    runtimeUsers.delete(runtimeWorker.email.toLowerCase());
    return res.json({ success: true, deleted: { id: runtimeWorker.id, email: runtimeWorker.email } });
  }

  const worker = await prisma.user.findUnique({ where: { id: workerId }, include: { role: true } }).catch(() => null);
  if (!worker || worker.role.name !== 'WORKER' || worker.adminId !== ownerId) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pond.updateMany({ where: { assignedUserId: workerId }, data: { assignedUserId: null } });
      await tx.feedingLog.updateMany({ where: { workerId }, data: { workerId: null } });
      await tx.waterQualityLog.updateMany({ where: { workerId }, data: { workerId: null } });
      await tx.mortalityLog.updateMany({ where: { workerId }, data: { workerId: null } });
      await tx.harvestLog.updateMany({ where: { workerId }, data: { workerId: null } });
      await tx.growthMeasurement.updateMany({ where: { workerId }, data: { workerId: null } });
      await tx.attachment.updateMany({ where: { uploadedById: workerId }, data: { uploadedById: null } });
      await tx.notification.updateMany({ where: { userId: workerId }, data: { userId: null } });
      await tx.auditLog.updateMany({ where: { userId: workerId }, data: { userId: null } });
      await tx.registrationCode.updateMany({ where: { usedById: workerId }, data: { usedById: null } });
      await tx.session.deleteMany({ where: { userId: workerId } });
      await tx.taskComment.deleteMany({ where: { userId: workerId } });
      await tx.taskAssignment.deleteMany({ where: { userId: workerId } });
      await tx.chatMessage.deleteMany({ where: { senderId: workerId } });
      await tx.financeRecord.deleteMany({ where: { recordedById: workerId } });
      await tx.user.delete({ where: { id: workerId } });
    });
  } catch (error) {
    console.error('Failed to delete worker', error);
    return res.status(409).json({ error: 'Worker cannot be deleted while dependent records prevent removal.' });
  }
  return res.json({ success: true, deleted: { id: worker.id, email: worker.email } });
}
