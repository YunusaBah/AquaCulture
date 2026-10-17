import { prisma } from './prisma';

export function pondTenantWhere(tenantId: string) {
  return { site: { farm: { ownerId: tenantId } } };
}

export async function pondBelongsToTenant(pondId: string, tenantId: string) {
  return Boolean(await prisma.pond.findFirst({
    where: { id: pondId, ...pondTenantWhere(tenantId) },
    select: { id: true },
  }));
}
