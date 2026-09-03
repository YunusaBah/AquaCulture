export const ROLE_NAMES = ['OWNER', 'WORKER'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  OWNER: [
    'FARM_VIEW',
    'FARM_MANAGE',
    'POND_VIEW',
    'POND_CREATE',
    'POND_UPDATE',
    'POND_ARCHIVE',
    'POND_ASSIGN',
    'FEEDING_CREATE',
    'FEEDING_VIEW',
    'FEEDING_UPDATE',
    'WATER_QUALITY_CREATE',
    'WATER_QUALITY_VIEW',
    'WATER_QUALITY_UPDATE',
    'WATER_CHANGE_CREATE',
    'WATER_CHANGE_VIEW_ASSIGNED',
    'MORTALITY_CREATE',
    'MORTALITY_VIEW',
    'MORTALITY_UPDATE',
    'OBSERVATION_CREATE',
    'OBSERVATION_VIEW',
    'OBSERVATION_UPDATE',
    'HARVEST_CREATE',
    'HARVEST_VIEW',
    'HARVEST_UPDATE',
    'TASK_CREATE',
    'TASK_ASSIGN',
    'TASK_VIEW',
    'TASK_UPDATE',
    'TASK_COMPLETE',
    'TASK_COMMENT',
    'INVENTORY_VIEW',
    'INVENTORY_MANAGE',
    'INVENTORY_COST_VIEW',
    'FINANCE_VIEW',
    'FINANCE_MANAGE',
    'FINANCE_REPORT_VIEW',
    'USER_VIEW',
    'USER_CREATE',
    'USER_APPROVE',
    'USER_DEACTIVATE',
    'USER_ROLE_MANAGE',
    'REPORT_VIEW',
    'REPORT_EXPORT',
    'AI_VIEW',
    'AI_USE',
    'AUDIT_VIEW',
  ],
  WORKER: [
    'POND_VIEW_ASSIGNED',
    'FEEDING_CREATE',
    'FEEDING_VIEW_ASSIGNED',
    'FEEDING_UPDATE_OWN',
    'WATER_QUALITY_CREATE',
    'WATER_QUALITY_VIEW_ASSIGNED',
    'WATER_CHANGE_CREATE',
    'WATER_CHANGE_VIEW_ASSIGNED',
    'MORTALITY_CREATE',
    'MORTALITY_VIEW_ASSIGNED',
    'OBSERVATION_CREATE',
    'OBSERVATION_VIEW_ASSIGNED',
    'TASK_VIEW_ASSIGNED',
    'TASK_COMPLETE',
    'TASK_COMMENT',
    'AI_USE',
    'ATTACHMENT_CREATE',
  ],
};

export function normalizeRole(role?: string): RoleName | null {
  if (role === 'OWNER' || role === 'WORKER') {
    return role;
  }
  return null;
}

export function hasPermissionForRole(role: string | undefined, permission: string): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return false;
  }
  return ROLE_PERMISSIONS[normalizedRole].includes(permission);
}
