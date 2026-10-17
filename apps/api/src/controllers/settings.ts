import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { ROLE_PERMISSIONS } from '../config/permissions';
import { hasStrongPassword } from '../lib/password';

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

export async function updateProfile(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { name, email, profilePhoto, fontSize, highContrast } = req.body ?? {};
  const data: {
    name?: string;
    email?: string;
    profilePhoto?: string | null;
    fontSize?: string;
    highContrast?: boolean;
  } = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    data.name = name.trim();
  }
  if (email !== undefined) {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    data.email = email.trim().toLowerCase();
  }
  if (profilePhoto !== undefined) {
    if (profilePhoto !== null && (typeof profilePhoto !== 'string' || profilePhoto.length > 1_100_000)) {
      return res.status(400).json({ error: 'Profile photo must be an image URL or an image smaller than 1 MB' });
    }
    if (typeof profilePhoto === 'string' && profilePhoto
      && !/^data:image\/(png|jpeg|webp|gif|avif);base64,/i.test(profilePhoto)
      && !profilePhoto.startsWith('https://')
      && !profilePhoto.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Profile photo must use a supported image format or secure image URL' });
    }
    data.profilePhoto = profilePhoto || null;
  }
  if (fontSize !== undefined) {
    if (!['small', 'medium', 'large'].includes(fontSize)) return res.status(400).json({ error: 'Font size must be small, medium, or large' });
    data.fontSize = fontSize;
  }
  if (highContrast !== undefined) {
    if (typeof highContrast !== 'boolean') return res.status(400).json({ error: 'High contrast must be a boolean' });
    data.highContrast = highContrast;
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: { id: true, name: true, email: true, profilePhoto: true, fontSize: true, highContrast: true },
    });
    res.json({ user });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'That email address is already in use' });
    }
    throw error;
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  if (!hasStrongPassword(newPassword)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and numbers.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { password: true } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  await prisma.user.update({
    where: { id: req.userId },
    data: { password: await bcrypt.hash(newPassword, 10) },
  });
  res.json({ success: true });
}

export async function getUserPermissions(req: AuthRequest, res: Response) {
  if (!req.userId || !req.tenantId) return res.status(401).json({ error: 'Unauthorized' });
  if (req.userRole === 'OWNER') {
    const workers = await prisma.user.findMany({
      where: { adminId: req.tenantId, role: { name: 'WORKER' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, permissions: true },
    });
    return res.json({
      permissions: ROLE_PERMISSIONS.WORKER,
      workers: workers.map((worker) => ({
        ...worker,
        permissions: {
          ...Object.fromEntries(ROLE_PERMISSIONS.WORKER.map((permission) => [permission, true])),
          ...(worker.permissions && typeof worker.permissions === 'object' && !Array.isArray(worker.permissions) ? worker.permissions : {}),
        },
      })),
    });
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { permissions: true } });
  const defaults = Object.fromEntries(ROLE_PERMISSIONS.WORKER.map((permission) => [permission, true]));
  return res.json({
    permissions: ROLE_PERMISSIONS.WORKER,
    workers: [],
    userPermissions: { ...defaults, ...(user?.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions) ? user.permissions : {}) },
  });
}

export async function updateUserPermissions(req: AuthRequest, res: Response) {
  if (req.userRole !== 'OWNER' || !req.tenantId) return res.status(403).json({ error: 'Only admins can manage user permissions' });
  const permissions = req.body?.permissions;
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return res.status(400).json({ error: 'A permission map is required' });
  }
  const allowedKeys = new Set(ROLE_PERMISSIONS.WORKER);
  if (Object.entries(permissions).some(([key, value]) => !allowedKeys.has(key) || typeof value !== 'boolean')) {
    return res.status(400).json({ error: 'The permission map contains an invalid permission' });
  }
  const worker = await prisma.user.findFirst({
    where: { id: req.params.userId, adminId: req.tenantId, role: { name: 'WORKER' } },
    select: { id: true },
  });
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  const updated = await prisma.user.update({
    where: { id: worker.id },
    data: { permissions },
    select: { id: true, permissions: true },
  });
  res.json({ user: updated });
}
