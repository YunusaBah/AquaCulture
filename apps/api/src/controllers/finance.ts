import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

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
    orderBy: { recordedAt: 'desc' },
    include: {
      pond: { select: { id: true, number: true } },
      recordedBy: { select: { id: true, name: true, email: true } },
    },
  });

  res.json({ records, dashboard: financeSummary(records) });
}

export async function createFinanceRecord(req: AuthRequest, res: Response) {
  const { type, category, description, quantity, unit, unitPrice, amount, pondId, recordedAt } = req.body as any;

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

  const record = await prisma.financeRecord.create({
    data: {
      type: financeType as any,
      category,
      description: description || undefined,
      quantity: qNum ?? null,
      unit: unit || undefined,
      unitPrice: uNum ?? null,
      amount: resolvedAmount,
      pondId: pondId || null,
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      recordedById: req.userId!,
    },
    include: {
      pond: { select: { id: true, number: true } },
      recordedBy: { select: { id: true, name: true, email: true } },
    },
  });

  res.status(201).json({ record });
}

export async function deleteFinanceRecord(req: AuthRequest, res: Response) {
  const { id } = req.params;

  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the farm owner can delete financial records.' });
  }

  await prisma.financeRecord.delete({ where: { id } });
  res.status(204).send();
}
