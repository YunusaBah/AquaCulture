import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function createSite(req: AuthRequest, res: Response) {
  const { name, farmId, location, timezone } = req.body as { name?: string; farmId?: string; location?: string; timezone?: string };
  if (!name) return res.status(400).json({ error: 'name is required' });

  if (farmId) {
    const farm = await prisma.farm.findFirst({ where: { id: farmId, ownerId: req.tenantId } });
    if (!farm) return res.status(404).json({ error: 'Farm not found' });
    const site = await prisma.farmSite.create({ data: { name, farmId, location, timezone } });
    return res.status(201).json({ site });
  }

  // create a new farm with this site
  const farm = await prisma.farm.create({
    data: {
      name,
      ownerId: req.tenantId || '',
      members: { connect: await prisma.user.findMany({ where: { adminId: req.tenantId }, select: { id: true } }) },
      sites: { create: { name, location: location || 'Farm site', timezone: timezone || 'UTC' } },
    },
    include: { sites: true },
  });

  res.status(201).json({ site: farm.sites[0], farm });
}
