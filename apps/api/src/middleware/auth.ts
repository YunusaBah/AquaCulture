import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { hasPermissionForRole, normalizeRole } from '../config/permissions';
import { prisma } from '../lib/prisma';
import { getFallbackUserById } from '../lib/devUsers';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: 'OWNER' | 'WORKER';
  user?: {
    id: string;
    email: string;
    name: string | null;
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
      req.userId = fallbackUser.id;
      req.userRole = fallbackUser.role;
      req.user = {
        id: fallbackUser.id,
        email: fallbackUser.email,
        name: fallbackUser.name,
        role: { name: fallbackUser.role },
      } as any;
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: { select: { name: true } } },
    });
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    const normalizedRole = normalizeRole(user.role.name);
    if (!normalizedRole) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.userId = user.id;
    req.userRole = normalizedRole;
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

export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !hasPermissionForRole(req.userRole, permission)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}
