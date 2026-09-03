export type AppRole = 'OWNER' | 'WORKER';

export const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  OWNER: [
    'FARM_VIEW',
    'FARM_MANAGE',
    'POND_VIEW',
    'POND_CREATE',
    'POND_UPDATE',
    'POND_ARCHIVE',
    'FINANCE_VIEW',
    'FINANCE_MANAGE',
    'INVENTORY_VIEW',
    'INVENTORY_MANAGE',
    'AI_VIEW',
    'AI_USE',
    'TASK_CREATE',
    'TASK_ASSIGN',
    'TASK_COMPLETE',
  ],
  WORKER: ['POND_VIEW_ASSIGNED', 'FEEDING_CREATE', 'MORTALITY_CREATE', 'TASK_COMPLETE', 'AI_USE'],
};

export function hasPermission(role: AppRole | undefined, permission: string): boolean {
  if (!role) {
    return false;
  }
  return ROLE_PERMISSIONS[role].includes(permission);
}
