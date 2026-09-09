import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { getFallbackUserByCredentials } from '../lib/devUsers';

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
            role: { connect: { name: userSeed.role } },
          },
        });
      }
    }
  } catch (error) {
    console.warn('Development user sync is unavailable because the database is not running. Falling back to the in-memory demo account flow.', error);
  }
}

export async function register(req: Request, res: Response) {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const found = await prisma.user.findUnique({ where: { email } });
  if (found) return res.status(409).json({ error: 'User exists' });
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashed, name, role: { connect: { name: 'WORKER' } } },
    include: { role: true },
  });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role.name }, token });
}

export async function login(req: Request, res: Response) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    // Ensure development seed users exist so tokens map to real DB users when the DB is available.
    await ensureDevelopmentUsers();

    // If credentials match one of the in-memory fallback users, login should still work even when
    // Postgres is stopped locally. This keeps the demo accounts usable during early development.
    const fallbackUser = getFallbackUserByCredentials(email, password);
    if (fallbackUser) {
      try {
        const seeded = await prisma.user.findUnique({ where: { email: fallbackUser.email }, include: { role: true } });
        if (seeded) {
          const token = jwt.sign({ userId: seeded.id }, JWT_SECRET, { expiresIn: '7d' });
          return res.json({ user: { id: seeded.id, email: seeded.email, name: seeded.name, role: seeded.role.name }, token });
        }
      } catch (error) {
        console.warn('Database unavailable for fallback user lookup; continuing with in-memory demo auth.', error);
      }

      const token = jwt.sign({ userId: fallbackUser.id }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ user: { id: fallbackUser.id, email: fallbackUser.email, name: fallbackUser.name, role: fallbackUser.role }, token });
    }

    const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role.name }, token });
  } catch (error) {
    console.error('Login failed', error);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
}
