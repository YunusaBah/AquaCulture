import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function createSite(req: AuthRequest, res: Response) {
  const { name, farmId, location, timezone } = req.body as { name?: string; farmId?: string; location?: string; timezone?: string };
  if (!name) return res.status(400).json({ error: 'name is required' });

  if (farmId) {
    // create site under existing farm
    const site = await prisma.farmSite.create({ data: { name, farmId, location, timezone } });
    return res.status(201).json({ site });
  }

  // create a new farm with this site
  const farm = await prisma.farm.create({
    data: {
      name,
      ownerId: req.userId || '',
      sites: { create: { name, location: location || 'Farm site', timezone: timezone || 'UTC' } },
    },
    include: { sites: true },
  });

  res.status(201).json({ site: farm.sites[0], farm });
}
