import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { hasPermissionForRole, normalizeRole } from '../config/permissions';
import { prisma } from '../lib/prisma';
import { getFallbackUserById } from '../lib/devUsers';
export interface AuthRequest extends Request {
  userId?: string;
  tenantId?: string;
  userRole?: 'OWNER' | 'WORKER';
  user?: {
    id: string;
    adminId?: string | null;
    reportId?: string;
    email: string;
    name: string | null;
    profilePhoto?: string | null;
    fontSize?: string;
    highContrast?: boolean;
    permissions?: Record<string, boolean> | null;
    blocked?: boolean;
    role: {
      name: 'OWNER' | 'WORKER';
    };
  };
}
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const fallbackUser = getFallbackUserById(payload.userId);
    if (fallbackUser) {
      if (fallbackUser.blocked) return res.status(403).json({ error: 'This account has been blocked by the admin.' });
      req.userId = fallbackUser.id;
      req.userRole = fallbackUser.role;
      req.user = {
        id: fallbackUser.id,
        reportId: undefined,
        email: fallbackUser.email,
        name: fallbackUser.name,
        role: { name: fallbackUser.role },
      } as any;
        req.tenantId = fallbackUser.role === 'OWNER' ? fallbackUser.id : fallbackUser.adminId || fallbackUser.id;
        return next();
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        adminId: true,
        reportId: true,
        email: true,
        name: true,
        profilePhoto: true,
        fontSize: true,
        highContrast: true,
        permissions: true,
        blocked: true,
        role: { select: { name: true } },
      },
    });
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    if (user.blocked) return res.status(403).json({ error: 'This account has been blocked by the admin.' });
    const normalizedRole = normalizeRole(user.role.name);
    if (!normalizedRole) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.userId = user.id;
    req.userRole = normalizedRole;
    req.tenantId = normalizedRole === 'OWNER' ? user.id : user.adminId || user.id;
    req.user = user as any;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
export function requireRole(...roles: Array<'OWNER' | 'WORKER'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
export function hasRequestPermission(req: AuthRequest, permission: string) {
  const override = req.user?.permissions?.[permission];
  return typeof override === 'boolean' ? override : hasPermissionForRole(req.userRole, permission);
}
export function requirePermission(...permissions: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { permissions: true },
      });
      const allowed = permissions.some((permission) => {
        const override = user?.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
          ? (user.permissions as Record<string, unknown>)[permission]
          : undefined;
        return typeof override === 'boolean' ? override : hasPermissionForRole(req.userRole, permission);
      });
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
