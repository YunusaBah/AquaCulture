import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const DEFAULT_THEME = 'light';

export async function getTheme(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { theme: true } });
  res.json({ theme: user?.theme === 'dark' ? 'dark' : DEFAULT_THEME });
}

export async function updateTheme(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const theme = req.body?.theme;
  if (theme !== 'light' && theme !== 'dark') {
    return res.status(400).json({ error: 'Theme must be light or dark' });
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { theme },
    select: { theme: true },
  });

  res.json({ theme: user.theme });
}
