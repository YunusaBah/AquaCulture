import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function getFarms(req: AuthRequest, res: Response) {
  const farms = await prisma.farm.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      sites: { include: { ponds: true } },
      members: { select: { id: true, name: true, email: true, role: { select: { name: true } } } },
    },
  });

  res.json({ farms });
}

export async function createFarm(req: AuthRequest, res: Response) {
  const { name, location, timezone } = req.body as { name?: string; location?: string; timezone?: string };

  if (!name) {
    return res.status(400).json({ error: 'Farm name is required' });
  }

  const farm = await prisma.farm.create({
    data: {
      name,
      ownerId: req.userId || '',
      sites: {
        create: {
          name: `${name} - Main Site`,
          location: location || 'Farm site',
          timezone: timezone || 'UTC',
        },
      },
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      sites: true,
    },
  });

  res.status(201).json({ farm });
}
