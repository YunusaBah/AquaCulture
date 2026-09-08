import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

function financeSummary(records: Array<{ type: string; amount: number; pondId: string | null }>) {
  const income = records.filter((record) => record.type === 'INCOME').reduce((sum: number, record) => sum + record.amount, 0);
  const expenses = records.filter((record) => record.type === 'EXPENSE').reduce((sum: number, record) => sum + record.amount, 0);
  const budget = records.filter((record) => record.type === 'BUDGET').reduce((sum: number, record) => sum + record.amount, 0);
  const profit = income - expenses;
  const budgetRemaining = budget - expenses;
  const pondTotals = records.reduce<Record<string, { income: number; expenses: number; profit: number }>>((totals, record) => {
    if (!record.pondId) return totals;
    const current = totals[record.pondId] || { income: 0, expenses: 0, profit: 0 };
    if (record.type === 'INCOME') current.income += record.amount;
    if (record.type === 'EXPENSE') current.expenses += record.amount;
    current.profit = current.income - current.expenses;
    totals[record.pondId] = current;
    return totals;
  }, {});

  return {
    income,
    expenses,
    budget,
    profit,
    budgetRemaining,
    status: profit >= 0 ? 'PROFIT' : 'LOSS',
    profitMargin: income > 0 ? Number(((profit / income) * 100).toFixed(1)) : 0,
    budgetUsedPercent: budget > 0 ? Number(((expenses / budget) * 100).toFixed(1)) : 0,
    pondTotals,
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
      type: type as any,
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
