import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { nextReportReference } from '../lib/financeTransactionId';
import { pondBelongsToTenant } from '../lib/tenant';
import { calculateProductionCosting, filterTenantPondMovements, normalizeWeekStart } from '../lib/productionCosting';

function financeSummary(records: Array<{ type: string; amount: number; pondId: string | null }>) {
  const salesRecords = records.filter((record) => record.type === 'SALES');
  const runningCostRecords = records.filter((record) => record.type === 'RUNNING_COST');
  const fixedCostRecords = records.filter((record) => record.type === 'FIXED_COST');
  const sales = salesRecords.reduce((sum: number, record) => sum + record.amount, 0);
  const runningCosts = runningCostRecords.reduce((sum: number, record) => sum + record.amount, 0);
  const fixedCosts = fixedCostRecords.reduce((sum: number, record) => sum + record.amount, 0);
  const totalCosts = runningCosts + fixedCosts;
  const netProfitLoss = sales - totalCosts;
  const breakEvenAmount = totalCosts - sales;
  const salesNeededToBreakEven = Math.max(0, breakEvenAmount);

  let status: 'PROFIT' | 'LOSS' | 'BREAK_EVEN' = 'BREAK_EVEN';
  if (netProfitLoss > 0) status = 'PROFIT';
  else if (netProfitLoss < 0) status = 'LOSS';

  const pondTotals = records.reduce<Record<string, { sales: number; runningCosts: number; fixedCosts: number; netProfitLoss: number }>>((totals, record) => {
    if (!record.pondId) return totals;
    const current = totals[record.pondId] || { sales: 0, runningCosts: 0, fixedCosts: 0, netProfitLoss: 0 };
    if (record.type === 'SALES') current.sales += record.amount;
    if (record.type === 'RUNNING_COST') current.runningCosts += record.amount;
    if (record.type === 'FIXED_COST') current.fixedCosts += record.amount;
    current.netProfitLoss = current.sales - current.runningCosts - current.fixedCosts;
    totals[record.pondId] = current;
    return totals;
  }, {});

  return {
    sales,
    salesCount: salesRecords.length,
    runningCosts,
    runningCostCount: runningCostRecords.length,
    fixedCosts,
    fixedCostCount: fixedCostRecords.length,
    totalCosts,
    netProfitLoss,
    breakEvenAmount,
    salesNeededToBreakEven,
    status,
    profitMargin: totalCosts > 0 ? Number(((netProfitLoss / totalCosts) * 100).toFixed(1)) : 0,
    budgetUsedPercent: totalCosts > 0 ? Number(((runningCosts / totalCosts) * 100).toFixed(1)) : 0,
    pondTotals,
    income: sales,
    expenses: runningCosts,
    budget: fixedCosts,
    profit: netProfitLoss,
    budgetRemaining: breakEvenAmount,
  };
}

export async function getFinanceOverview(req: AuthRequest, res: Response) {
  const records = await prisma.financeRecord.findMany({
    where: { tenantId: req.tenantId },
    orderBy: { recordedAt: 'desc' },
    include: {
      pond: { select: { id: true, number: true } },
      recordedBy: { select: { id: true, name: true, email: true } },
    },
  });

  res.json({ records, dashboard: financeSummary(records) });
}

export async function createFinanceRecord(req: AuthRequest, res: Response) {
  const { type, category, description, quantity, unit, unitPrice, amount, pondId, coverageStart, coverageEnd } = req.body as {
    type?: string;
    category?: string;
    description?: string;
    quantity?: number | string;
    unit?: string;
    unitPrice?: number | string;
    amount?: number | string;
    pondId?: string;
    coverageStart?: string;
    coverageEnd?: string;
  };

  if (!type || !category) {
    return res.status(400).json({ error: 'type and category are required' });
  }

  const normalizedType = String(type).toUpperCase();
  const financeTypeMap: Record<string, string> = {
    INCOME: 'SALES',
    EXPENSE: 'RUNNING_COST',
    BUDGET: 'FIXED_COST',
  };
  const financeType = financeTypeMap[normalizedType] || normalizedType;
  const validTypes = ['SALES', 'RUNNING_COST', 'FIXED_COST'];

  if (!validTypes.includes(financeType)) {
    return res.status(400).json({ error: 'Invalid finance type. Use SALES, RUNNING_COST, or FIXED_COST.' });
  }

  // parse numeric inputs defensively
  const qNum = quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : undefined;
  const uNum = unitPrice !== undefined && unitPrice !== null && unitPrice !== '' ? Number(unitPrice) : undefined;
  const aNum = amount !== undefined && amount !== null && amount !== '' ? Number(amount) : undefined;

  let resolvedAmount: number | undefined = undefined;
  if (aNum !== undefined && !Number.isNaN(aNum)) {
    resolvedAmount = aNum;
  } else if (Number.isFinite(qNum as number) && Number.isFinite(uNum as number)) {
    resolvedAmount = (qNum as number) * (uNum as number);
  }

  if (resolvedAmount === undefined || !Number.isFinite(resolvedAmount)) {
    return res.status(400).json({ error: 'Provide a numeric amount, or both numeric quantity and unitPrice to calculate amount' });
  }

  if (resolvedAmount < 0) {
    return res.status(400).json({ error: 'amount must be non-negative' });
  }
  if (pondId && !(await pondBelongsToTenant(String(pondId), req.tenantId || ''))) {
    return res.status(404).json({ error: 'Pond not found' });
  }

  const coverageStartValue = coverageStart || coverageEnd;
  const coverageEndValue = coverageEnd || coverageStart;
  const parsedCoverageStart = coverageStartValue ? new Date(`${coverageStartValue.slice(0, 10)}T00:00:00.000Z`) : null;
  const parsedCoverageEnd = coverageEndValue ? new Date(`${coverageEndValue.slice(0, 10)}T00:00:00.000Z`) : null;
  if ((coverageStart && Number.isNaN(parsedCoverageStart?.getTime()))
    || (coverageEnd && Number.isNaN(parsedCoverageEnd?.getTime()))
    || (parsedCoverageStart && parsedCoverageEnd && parsedCoverageEnd < parsedCoverageStart)) {
    return res.status(400).json({ error: 'Cost coverage dates must be valid and the end date cannot be before the start date.' });
  }

  const record = await prisma.$transaction(async (tx) => tx.financeRecord.create({
    data: {
      transactionId: await nextReportReference(tx),
      type: financeType as any,
      category,
      description: description || undefined,
      quantity: qNum ?? null,
      unit: unit || undefined,
      unitPrice: uNum ?? null,
      amount: resolvedAmount,
      pondId: pondId || null,
      coverageStart: parsedCoverageStart,
      coverageEnd: parsedCoverageEnd,
      recordedById: req.userId!,
      tenantId: req.tenantId!,
    },
    include: {
      pond: { select: { id: true, number: true } },
      recordedBy: { select: { id: true, name: true, email: true } },
    },
  }));

  res.status(201).json({ record });
}

export async function getProductionCosting(req: AuthRequest, res: Response) {
  let weekStart: Date;
  try {
    weekStart = normalizeWeekStart(req.query.weekStart);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid week start.' });
  }

  const now = new Date();
  const [pondRows, movements, expenses, harvests] = await Promise.all([
    prisma.pond.findMany({
      where: { site: { farm: { ownerId: req.tenantId } } },
      select: {
        id: true,
        number: true,
        species: true,
        status: true,
        stockedAt: true,
        createdAt: true,
        harvestLogs: { orderBy: { recordedAt: 'desc' }, take: 1, select: { recordedAt: true } },
      },
    }),
    prisma.inventoryTransaction.findMany({
      where: { item: { tenantId: req.tenantId } },
      select: { pondId: true, change: true, unitCost: true, createdAt: true, item: { select: { category: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.financeRecord.findMany({
      where: { tenantId: req.tenantId, type: { in: ['RUNNING_COST', 'FIXED_COST', 'SALES'] } },
      select: { id: true, type: true, amount: true, pondId: true, coverageStart: true, coverageEnd: true, recordedAt: true, category: true, description: true },
    }),
    prisma.harvestLog.findMany({
      where: { pond: { site: { farm: { ownerId: req.tenantId } } } },
      select: { pondId: true, numberHarvested: true, biomassKg: true, avgWeightGrams: true, recordedAt: true },
    }),
  ]);
  const tenantPondIds = new Set(pondRows.map((pond) => pond.id));
  const ponds = pondRows.map((pond) => ({
    id: pond.id,
    number: pond.number,
    species: pond.species,
    status: pond.status,
    stockedAt: pond.stockedAt,
    createdAt: pond.createdAt,
    harvestedAt: pond.harvestLogs[0]?.recordedAt || null,
  }));

  res.json(calculateProductionCosting({
    ponds,
    movements: filterTenantPondMovements(tenantPondIds, movements)
      .map((movement) => ({
        pondId: movement.pondId,
        category: movement.item.category,
        change: movement.change,
        unitCost: movement.unitCost,
        createdAt: movement.createdAt,
      })),
    expenses: expenses
      .filter((expense) => !expense.pondId || tenantPondIds.has(expense.pondId))
      .map((expense) => ({ ...expense, pondId: expense.pondId })),
    harvests: harvests.map((harvest) => ({
      pondId: harvest.pondId,
      numberHarvested: harvest.numberHarvested,
      biomassKg: harvest.biomassKg,
      avgWeightGrams: harvest.avgWeightGrams,
      recordedAt: harvest.recordedAt,
    })),
    weekStart,
    now,
  }));
}

export async function deleteFinanceRecord(req: AuthRequest, res: Response) {
  const { id } = req.params;

  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the farm owner can delete financial records.' });
  }

  const record = await prisma.financeRecord.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!record) return res.status(404).json({ error: 'Finance record not found' });
  await prisma.financeRecord.delete({ where: { id: record.id } });
  res.status(204).send();
}
