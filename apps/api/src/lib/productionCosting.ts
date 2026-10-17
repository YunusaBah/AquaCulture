export type CostMovement = {
  change: number;
  unitCost: number | null;
};

export type ProductionPond = {
  id: string;
  number: number;
  species: string;
  status: string;
  stockedAt: Date | null;
  createdAt: Date;
  harvestedAt: Date | null;
};

export type ProductionMovement = CostMovement & {
  pondId: string | null;
  category: string;
  createdAt: Date;
};

export type ProductionExpense = {
  id: string;
  type: string;
  amount: number;
  pondId: string | null;
  coverageStart: Date | null;
  coverageEnd: Date | null;
  recordedAt: Date;
  category: string;
  description: string | null;
};

export type ProductionHarvest = {
  pondId: string;
  numberHarvested: number;
  biomassKg: number | null;
  avgWeightGrams: number | null;
  recordedAt: Date;
};

export type CostTotals = {
  feedCost: number;
  runningCosts: number;
  fixedCosts: number;
  otherDirectCosts: number;
  totalCost: number;
  uncostedFeedKg: number;
  uncostedInventoryUnits: number;
  harvestFish: number;
  harvestKg: number;
  sales: number;
  profitLoss: number;
  breakEvenPerKg: number | null;
  breakEvenPerFish: number | null;
  provisional: boolean;
  expenseAllocations: Array<{
    expenseId: string;
    category: string;
    description: string | null;
    amount: number;
    method: 'direct-pond' | 'active-pond-days';
  }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function createCostTotals(): CostTotals {
  return {
    feedCost: 0,
    runningCosts: 0,
    fixedCosts: 0,
    otherDirectCosts: 0,
    totalCost: 0,
    uncostedFeedKg: 0,
    uncostedInventoryUnits: 0,
    harvestFish: 0,
    harvestKg: 0,
    sales: 0,
    profitLoss: 0,
    breakEvenPerKg: null,
    breakEvenPerFish: null,
    provisional: true,
    expenseAllocations: [],
  };
}

function isInRange(date: Date, start: Date, endExclusive: Date) {
  const timestamp = date.getTime();
  return timestamp >= start.getTime() && timestamp < endExclusive.getTime();
}

function cycleStart(pond: ProductionPond) {
  return pond.stockedAt || pond.createdAt;
}

function cycleEndExclusive(pond: ProductionPond, now: Date) {
  if (pond.status !== 'HARVESTED' || !pond.harvestedAt) return new Date(utcDay(now) + DAY_MS);
  return new Date(utcDay(pond.harvestedAt) + DAY_MS);
}

function pondActiveOnDay(pond: ProductionPond, day: number, now: Date) {
  return day >= utcDay(cycleStart(pond)) && day < cycleEndExclusive(pond, now).getTime();
}

function expensePeriod(expense: ProductionExpense) {
  const start = utcDay(expense.coverageStart || expense.recordedAt);
  const end = expense.coverageEnd ? utcDay(expense.coverageEnd) + DAY_MS : start + DAY_MS;
  return { start, end: Math.max(end, start + DAY_MS) };
}

function allocateExpense(
  expense: ProductionExpense,
  ponds: ProductionPond[],
  now: Date,
  rangeStart: Date,
  rangeEndExclusive: Date,
  totalsByPond: Map<string, CostTotals>,
  activeCycleOnly = false,
) {
  const { start, end } = expensePeriod(expense);
  const days = (end - start) / DAY_MS;
  const dailyAmount = expense.amount / days;
  let unallocated = 0;

  for (let day = Math.max(start, utcDay(rangeStart)); day < Math.min(end, rangeEndExclusive.getTime()); day += DAY_MS) {
    if (expense.pondId) {
      const pond = ponds.find((item) => item.id === expense.pondId);
      if (!pond || (activeCycleOnly && !pondActiveOnDay(pond, day, now))) continue;
      const totals = totalsByPond.get(expense.pondId);
      if (totals) {
        if (expense.type === 'FIXED_COST') totals.fixedCosts += dailyAmount;
        else totals.runningCosts += dailyAmount;
        addExpenseAllocation(totals, expense, dailyAmount, 'direct-pond');
      }
      continue;
    }

    const activePonds = ponds.filter((pond) => pondActiveOnDay(pond, day, now));
    if (!activePonds.length) {
      unallocated += dailyAmount;
      continue;
    }
    const share = dailyAmount / activePonds.length;
    for (const pond of activePonds) {
      const totals = totalsByPond.get(pond.id);
      if (!totals) continue;
      if (expense.type === 'FIXED_COST') totals.fixedCosts += share;
      else totals.runningCosts += share;
      addExpenseAllocation(totals, expense, share, 'active-pond-days');
    }
  }

  return unallocated;
}

function addExpenseAllocation(
  totals: CostTotals,
  expense: ProductionExpense,
  amount: number,
  method: 'direct-pond' | 'active-pond-days',
) {
  const existing = totals.expenseAllocations.find((allocation) => allocation.expenseId === expense.id);
  if (existing) {
    existing.amount += amount;
    return;
  }
  totals.expenseAllocations.push({
    expenseId: expense.id,
    category: expense.category,
    description: expense.description,
    amount,
    method,
  });
}

function finishTotals(totals: CostTotals) {
  totals.totalCost = totals.feedCost + totals.runningCosts + totals.fixedCosts + totals.otherDirectCosts;
  totals.profitLoss = totals.sales - totals.totalCost;
  const hasUncostedUsage = totals.uncostedFeedKg > 0 || totals.uncostedInventoryUnits > 0;
  totals.breakEvenPerKg = totals.harvestKg > 0 && !hasUncostedUsage ? totals.totalCost / totals.harvestKg : null;
  totals.breakEvenPerFish = totals.harvestFish > 0 && !hasUncostedUsage ? totals.totalCost / totals.harvestFish : null;
  totals.provisional = totals.harvestKg <= 0 || totals.harvestFish <= 0 || hasUncostedUsage;
  return totals;
}

export function calculateWeightedAverageIssueCost(movements: CostMovement[], issueQuantity: number) {
  if (!Number.isFinite(issueQuantity) || issueQuantity <= 0) return null;
  let quantity = 0;
  let knownQuantity = 0;
  let unknownQuantity = 0;
  let knownCost = 0;

  for (const movement of movements) {
    if (!Number.isFinite(movement.change) || movement.change === 0) continue;
    if (movement.change > 0) {
      quantity += movement.change;
      if (movement.unitCost != null && Number.isFinite(movement.unitCost) && movement.unitCost >= 0) {
        knownQuantity += movement.change;
        knownCost += movement.change * movement.unitCost;
      } else {
        unknownQuantity += movement.change;
      }
      continue;
    }

    const removed = Math.min(quantity, Math.abs(movement.change));
    if (removed <= 0 || quantity <= 0) continue;
    const ratio = removed / quantity;
    quantity -= removed;
    knownQuantity *= 1 - ratio;
    unknownQuantity *= 1 - ratio;
    knownCost *= 1 - ratio;
    if (quantity < 1e-9) {
      quantity = 0;
      knownQuantity = 0;
      unknownQuantity = 0;
      knownCost = 0;
    }
  }

  if (quantity + 1e-9 < issueQuantity || unknownQuantity > 1e-9 || knownQuantity <= 0) return null;
  return knownCost / knownQuantity;
}

export function filterTenantPondMovements<T extends { pondId: string | null }>(
  tenantPondIds: Set<string>,
  movements: T[],
) {
  return movements.filter((movement) => movement.pondId != null && tenantPondIds.has(movement.pondId));
}

export function calculateProductionCosting(input: {
  ponds: ProductionPond[];
  movements: ProductionMovement[];
  expenses: ProductionExpense[];
  harvests: ProductionHarvest[];
  weekStart: Date;
  now: Date;
}) {
  const { ponds, movements, expenses, harvests, weekStart, now } = input;
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
  const todayEnd = new Date(utcDay(now) + DAY_MS);
  const weekly = new Map(ponds.map((pond) => [pond.id, createCostTotals()]));
  const cycle = new Map(ponds.map((pond) => [pond.id, createCostTotals()]));

  for (const movement of movements) {
    if (movement.change >= 0 || !movement.pondId) continue;
    const pond = ponds.find((item) => item.id === movement.pondId);
    if (!pond) continue;
    const quantity = Math.abs(movement.change);
    const isFeed = movement.category.toLowerCase().includes('feed');
    const movementCost = movement.unitCost == null ? null : quantity * movement.unitCost;
    const pondStart = cycleStart(pond);
    const pondEnd = cycleEndExclusive(pond, now);
    const weeklyTotals = weekly.get(pond.id)!;
    const cycleTotals = cycle.get(pond.id)!;

    if (isInRange(movement.createdAt, weekStart, weekEnd)) {
      if (movementCost == null) {
        if (isFeed) weeklyTotals.uncostedFeedKg += quantity;
        else weeklyTotals.uncostedInventoryUnits += quantity;
      } else if (isFeed) weeklyTotals.feedCost += movementCost;
      else weeklyTotals.otherDirectCosts += movementCost;
    }
    if (isInRange(movement.createdAt, pondStart, pondEnd)) {
      if (movementCost == null) {
        if (isFeed) cycleTotals.uncostedFeedKg += quantity;
        else cycleTotals.uncostedInventoryUnits += quantity;
      } else if (isFeed) cycleTotals.feedCost += movementCost;
      else cycleTotals.otherDirectCosts += movementCost;
    }
  }

  let weeklyUnallocatedSharedCosts = 0;
  let cycleUnallocatedSharedCosts = 0;
  for (const expense of expenses) {
    if (expense.type === 'SALES') {
      if (expense.pondId && Number.isFinite(expense.amount)) {
        const pond = ponds.find((item) => item.id === expense.pondId);
        if (!pond) continue;
        if (isInRange(expense.recordedAt, weekStart, weekEnd)) weekly.get(pond.id)!.sales += expense.amount;
        if (isInRange(expense.recordedAt, cycleStart(pond), cycleEndExclusive(pond, now))) cycle.get(pond.id)!.sales += expense.amount;
      }
      continue;
    }
    weeklyUnallocatedSharedCosts += allocateExpense(expense, ponds, now, weekStart, weekEnd, weekly);
    const earliestCycle = ponds.reduce((earliest, pond) => Math.min(earliest, utcDay(cycleStart(pond))), todayEnd.getTime());
    if (earliestCycle < todayEnd.getTime()) {
      cycleUnallocatedSharedCosts += allocateExpense(
        expense,
        ponds,
        now,
        new Date(earliestCycle),
        todayEnd,
        cycle,
        true,
      );
    }
  }

  for (const harvest of harvests) {
    const pond = ponds.find((item) => item.id === harvest.pondId);
    if (!pond) continue;
    const weightKg = harvest.biomassKg != null && harvest.biomassKg > 0
      ? harvest.biomassKg
      : harvest.avgWeightGrams != null && harvest.avgWeightGrams > 0
        ? harvest.numberHarvested * harvest.avgWeightGrams / 1000
        : 0;
    const weeklyTotals = weekly.get(pond.id)!;
    const cycleTotals = cycle.get(pond.id)!;
    if (isInRange(harvest.recordedAt, weekStart, weekEnd)) {
      weeklyTotals.harvestFish += harvest.numberHarvested;
      weeklyTotals.harvestKg += weightKg;
    }
    if (isInRange(harvest.recordedAt, cycleStart(pond), cycleEndExclusive(pond, now))) {
      cycleTotals.harvestFish += harvest.numberHarvested;
      cycleTotals.harvestKg += weightKg;
    }
  }

  const pondTotals = ponds.map((pond) => ({
    pondId: pond.id,
    number: pond.number,
    species: pond.species,
    status: pond.status,
    cycleStart: cycleStart(pond),
    weekly: finishTotals(weekly.get(pond.id)!),
    cycle: finishTotals(cycle.get(pond.id)!),
  }));

  return {
    weekStart,
    weekEnd: new Date(weekEnd.getTime() - 1),
    weeklyUnallocatedSharedCosts,
    cycleUnallocatedSharedCosts,
    ponds: pondTotals,
  };
}

export function normalizeWeekStart(value: unknown, now = new Date()) {
  if (value === undefined || value === null || value === '') {
    const start = utcDay(now);
    const dayOfWeek = new Date(start).getUTCDay();
    return new Date(start - ((dayOfWeek + 6) % 7) * DAY_MS);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('weekStart must be a date in YYYY-MM-DD format.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('weekStart must be a valid calendar date.');
  }
  const dayOfWeek = date.getUTCDay();
  return new Date(utcDay(date) - ((dayOfWeek + 6) % 7) * DAY_MS);
}
