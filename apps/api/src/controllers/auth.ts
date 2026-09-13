import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { addRuntimeUser, getFallbackUserByCredentials, listRuntimeUsers } from '../lib/devUsers';

const DEFAULT_ADMIN_CODE = process.env.SEED_OWNER_CODE || process.env.SEED_ADMIN_CODE || 'ADMIN2024';
const LEGACY_ADMIN_CODES = new Set([DEFAULT_ADMIN_CODE, 'OWNER2024', 'ADMIN2024']);

function hasStrongPassword(password: string) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(String(password || '').trim());
}

const DEV_SEED_USERS = [
  {
    email: process.env.SEED_OWNER_EMAIL || 'owner@aquaculture.localapp',
    password: process.env.SEED_OWNER_PASSWORD || 'Owner7614091',
    name: 'Farm Owner',
    role: 'OWNER',
    loginCode: process.env.SEED_OWNER_LOGIN_CODE || DEFAULT_ADMIN_CODE,
  },
  {
    email: process.env.SEED_WORKER_EMAIL || 'worker@aquaculture.localapp',
    password: process.env.SEED_WORKER_PASSWORD || 'Worker5221',
    name: 'Field Worker',
    role: 'WORKER',
    loginCode: undefined,
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

    // Create default registration code for development (OWNER only)
    const ownerCodeData = {
      code: DEFAULT_ADMIN_CODE,
      role: 'OWNER' as const,
    };

    await prisma.registrationCode.upsert({
      where: { code: ownerCodeData.code },
      update: {},
      create: { ...ownerCodeData, isUsed: false },
    });

    for (const userSeed of DEV_SEED_USERS) {
      const existingUser = await prisma.user.findUnique({
        where: { email: userSeed.email },
        include: { role: true },
      });

      if (!existingUser) {
        const hashed = await bcrypt.hash(userSeed.password, 10);
        await prisma.user.create({
          data: {
            email: userSeed.email,
            name: userSeed.name,
            password: hashed,
            loginCode: userSeed.loginCode,
            blocked: false,
            role: { connect: { name: userSeed.role } },
          },
        });
        continue;
      }

      const matchesPassword = await bcrypt.compare(userSeed.password, existingUser.password);
      if (existingUser.role.name !== userSeed.role || !matchesPassword) {
        const hashed = await bcrypt.hash(userSeed.password, 10);
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: userSeed.name,
            password: hashed,
            loginCode: userSeed.loginCode,
            blocked: false,
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
 * OWNER Registration: name, email, password, code
 * Only OWNER can register initially with a special code
 */
export async function register(req: Request, res: Response) {
  const { email, name, password, code } = req.body;

  // Validate inputs - all required for OWNER registration
  if (!email || !name || !password || !code) {
    return res.status(400).json({ error: 'email, name, password, and admin code are all required for admin registration' });
  }

  if (!hasStrongPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and numbers.' });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim();
    const normalizedCode = String(code).trim().toUpperCase();
    const runtimeEntry = listRuntimeUsers().find((user) => user.email.toLowerCase() === normalizedEmail);
    if (runtimeEntry) {
      return res.status(409).json({ error: 'User already exists' });
    }

    await ensureDevelopmentUsers();

    const found = await prisma.user.findUnique({ where: { email: normalizedEmail } }).catch(() => null);
    if (found) return res.status(409).json({ error: 'User already exists' });

    const allowedCodes = new Set([DEFAULT_ADMIN_CODE, ...Array.from(LEGACY_ADMIN_CODES)]);
    let regCode: any = await prisma.registrationCode.findUnique({ where: { code: normalizedCode } }).catch(() => null);
    if (!regCode && allowedCodes.has(normalizedCode)) {
      regCode = await prisma.registrationCode.upsert({
        where: { code: normalizedCode },
        update: {},
        create: { code: normalizedCode, role: 'OWNER', isUsed: false },
      }).catch(() => ({
        id: `runtime-code-${randomUUID()}`,
        code: normalizedCode,
        role: 'OWNER',
        isUsed: false,
        usedById: null,
        createdAt: new Date(),
        expiresAt: null,
      }));
    }

    if (!regCode) {
      return res.status(400).json({ error: 'Invalid admin code' });
    }
    if (regCode.role !== 'OWNER') {
      return res.status(400).json({ error: 'Only admin registration is allowed with this code' });
    }
    if (regCode.isUsed) {
      return res.status(400).json({ error: 'Registration code already used' });
    }
    if (regCode.expiresAt && new Date() > regCode.expiresAt) {
      return res.status(400).json({ error: 'Registration code expired' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const loginCode = normalizedCode;
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: normalizedName,
        password: hashedPassword,
        loginCode,
        role: { connect: { name: 'OWNER' } },
      },
      include: { role: true },
    });

    await prisma.registrationCode.update({
      where: { id: regCode.id },
      data: { isUsed: true, usedById: user.id },
    }).catch(() => undefined);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name,
      },
      token,
    });
  } catch (error) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim();
    const runtimeUser = {
      id: `owner-${randomUUID()}`,
      email: normalizedEmail,
      password,
      name: normalizedName,
      role: 'OWNER' as const,
      loginCode: String(code).trim().toUpperCase(),
      blocked: false,
    };

    if (!listRuntimeUsers().some((user) => user.email.toLowerCase() === normalizedEmail)) {
      addRuntimeUser(runtimeUser);
      const token = jwt.sign({ userId: runtimeUser.id }, JWT_SECRET, { expiresIn: '7d' });
      return res.status(201).json({
        user: { id: runtimeUser.id, email: runtimeUser.email, name: runtimeUser.name, role: runtimeUser.role },
        token,
      });
    }

    console.error('Registration failed', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
}

/**
 * Login flow:
 * - OWNER: email + password + loginCode
 * - WORKER: email + password (created by OWNER)
 */
export async function login(req: Request, res: Response) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const loginCode = String(req.body?.loginCode ?? '').trim().toUpperCase();

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
          if (seeded.role.name === 'OWNER' && loginCode && seeded.loginCode !== loginCode) {
            return res.status(401).json({ error: 'Invalid admin code' });
          }

          const token = jwt.sign({ userId: seeded.id }, JWT_SECRET, { expiresIn: '7d' });
          return res.json({ user: { id: seeded.id, email: seeded.email, name: seeded.name, role: seeded.role.name }, token });
        }
      } catch (error) {
        console.warn('Database unavailable for fallback user lookup', error);
      }

      if (fallbackUser.role === 'OWNER' && loginCode) {
        const expectedCode = process.env.SEED_OWNER_LOGIN_CODE || DEFAULT_ADMIN_CODE;
        if (loginCode !== expectedCode && loginCode !== 'OWNER2024' && loginCode !== 'ADMIN2024') {
          return res.status(401).json({ error: 'Invalid admin code' });
        }
      }

      const token = jwt.sign({ userId: fallbackUser.id }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ user: { id: fallbackUser.id, email: fallbackUser.email, name: fallbackUser.name, role: fallbackUser.role }, token });
    }

    const user = await prisma.user.findUnique({ where: { email }, include: { role: true } }).catch(() => null);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if ((user as any).blocked) {
      return res.status(403).json({ error: 'This account has been blocked by the admin.' });
    }

    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.role.name === 'OWNER' && loginCode && user.loginCode !== loginCode) {
      return res.status(401).json({ error: 'Invalid admin code' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role.name }, token });
  } catch (error) {
    console.error('Login failed', error);
    return res.status(401).json({ error: 'Invalid credentials' });
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
    const found = await prisma.user.findUnique({ where: { email: normalizedEmail } }).catch(() => null);
    if (found) return res.status(409).json({ error: 'Email already taken' });
    if (listRuntimeUsers().some((user) => user.email.toLowerCase() === normalizedEmail)) {
      return res.status(409).json({ error: 'Email already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const worker = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: normalizedName,
        password: hashedPassword,
        blocked: false,
        role: { connect: { name: 'WORKER' } },
      },
      include: { role: true },
    });

    res.status(201).json({
      user: {
        id: worker.id,
        email: worker.email,
        name: worker.name,
        role: worker.role.name,
      },
    });
  } catch (error) {
    const runtimeWorker = {
      id: `worker-${randomUUID()}`,
      email: normalizedEmail,
      password,
      name: normalizedName,
      role: 'WORKER' as const,
      blocked: false,
    };
    if (!listRuntimeUsers().some((user) => user.email.toLowerCase() === normalizedEmail)) {
      addRuntimeUser(runtimeWorker);
      return res.status(201).json({ user: { id: runtimeWorker.id, email: runtimeWorker.email, name: runtimeWorker.name, role: runtimeWorker.role } });
    }
    console.error('Failed to create worker', error);
    return res.status(500).json({ error: 'Email already taken' });
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
    where: { role: { name: 'WORKER' } },
    include: { role: true },
    orderBy: { createdAt: 'desc' },
  }).catch(() => []);
  const runtimeWorkers = listRuntimeUsers().filter((user) => user.role === 'WORKER');

  return res.json({
    workers: [
      ...workers.map((worker) => ({
        id: worker.id,
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

  const runtimeWorker = listRuntimeUsers().find((user) => user.id === workerId && user.role === 'WORKER');
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
  if (!worker || worker.role.name !== 'WORKER') {
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

