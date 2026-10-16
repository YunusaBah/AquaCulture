import type { Prisma, PrismaClient } from '@prisma/client';

export async function nextReportReference(tx: Prisma.TransactionClient | PrismaClient) {
  const [result] = await tx.$queryRaw<Array<{ value: string }>>`SELECT next_report_reference() AS value`;
  return result.value;
}
