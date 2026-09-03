import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function listNotifications(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ notifications });
}

export async function markRead(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const n = await prisma.notification.update({ where: { id }, data: { read: true } });
  res.json({ notification: n });
}

// Internal utility: create notification (can be used by server side modules)
export async function createNotificationForUser(userId: string, title: string, body?: string, meta?: any) {
  return prisma.notification.create({ data: { userId, title, body, meta } });
}
