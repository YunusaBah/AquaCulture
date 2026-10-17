import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateProductionCosting,
  calculateWeightedAverageIssueCost,
  filterTenantPondMovements,
  normalizeWeekStart,
  type ProductionExpense,
  type ProductionPond,
} from '../lib/productionCosting';

const weekStart = new Date('2026-10-12T00:00:00.000Z');
const now = new Date('2026-10-18T12:00:00.000Z');
const pond = (id: string, stockedAt = weekStart): ProductionPond => ({
  id,
  number: Number(id.replace(/\D/g, '')) || 1,
  species: 'TILAPIA',
  status: 'ACTIVE',
  stockedAt,
  createdAt: stockedAt,
  harvestedAt: null,
});
const expense = (overrides: Partial<ProductionExpense> = {}): ProductionExpense => ({
  id: 'expense-1',
  type: 'RUNNING_COST',
  amount: 70,
  pondId: null,
  coverageStart: weekStart,
  coverageEnd: new Date('2026-10-18T00:00:00.000Z'),
  recordedAt: weekStart,
  category: 'Power',
  description: 'Shared power',
  ...overrides,
});

test('weighted average uses purchase prices and ignores depleted stock', () => {
  const movements = [
    { change: 10, unitCost: 2 },
    { change: -5, unitCost: 2 },
    { change: 10, unitCost: 4 },
  ];
  assert.equal(calculateWeightedAverageIssueCost(movements, 5), 50 / 15);
});

test('unknown purchase cost is surfaced instead of estimated', () => {
  assert.equal(calculateWeightedAverageIssueCost([
    { change: 10, unitCost: 2 },
    { change: 5, unitCost: null },
  ], 1), null);
});

test('uncosted feed blocks misleading break-even values', () => {
  const result = calculateProductionCosting({
    ponds: [pond('pond-1')],
    movements: [{ pondId: 'pond-1', category: 'FEED', change: -2, unitCost: null, createdAt: now }],
    expenses: [],
    harvests: [{ pondId: 'pond-1', numberHarvested: 4, biomassKg: 2, avgWeightGrams: null, recordedAt: now }],
    weekStart,
    now,
  });
  assert.equal(result.ponds[0].cycle.breakEvenPerKg, null);
  assert.equal(result.ponds[0].cycle.breakEvenPerFish, null);
  assert.equal(result.ponds[0].cycle.provisional, true);
  assert.equal(result.ponds[0].cycle.uncostedFeedKg, 2);
});

test('shared expense is divided equally over active pond-days', () => {
  const result = calculateProductionCosting({
    ponds: [pond('pond-1'), pond('pond-2', new Date('2026-10-14T00:00:00.000Z'))],
    movements: [],
    expenses: [expense()],
    harvests: [],
    weekStart,
    now,
  });
  assert.equal(result.ponds.find((item) => item.pondId === 'pond-1')?.weekly.runningCosts, 45);
  assert.equal(result.ponds.find((item) => item.pondId === 'pond-2')?.weekly.runningCosts, 25);
  assert.equal(result.weeklyUnallocatedSharedCosts, 0);
});

test('fixed expense is apportioned by coverage days into the selected week', () => {
  const result = calculateProductionCosting({
    ponds: [pond('pond-1')],
    movements: [],
    expenses: [expense({ type: 'FIXED_COST', amount: 140, coverageStart: weekStart, coverageEnd: new Date('2026-10-25T00:00:00.000Z') })],
    harvests: [],
    weekStart,
    now: new Date('2026-11-01T00:00:00.000Z'),
  });
  assert.equal(result.ponds[0].weekly.fixedCosts, 70);
  assert.equal(result.ponds[0].cycle.fixedCosts, 140);
  const followingWeek = calculateProductionCosting({
    ponds: [pond('pond-1')],
    movements: [],
    expenses: [expense({ type: 'FIXED_COST', amount: 140, coverageStart: weekStart, coverageEnd: new Date('2026-10-25T00:00:00.000Z') })],
    harvests: [],
    weekStart: new Date('2026-10-19T00:00:00.000Z'),
    now: new Date('2026-11-01T00:00:00.000Z'),
  });
  assert.equal(followingWeek.ponds[0].weekly.fixedCosts, 70);
});

test('direct pond expense is charged only to its pond and retains its source', () => {
  const result = calculateProductionCosting({
    ponds: [pond('pond-1'), pond('pond-2')],
    movements: [],
    expenses: [expense({ id: 'direct', pondId: 'pond-2', amount: 50, coverageStart: null, coverageEnd: null })],
    harvests: [],
    weekStart,
    now,
  });
  assert.equal(result.ponds[0].weekly.runningCosts, 0);
  assert.equal(result.ponds[1].weekly.runningCosts, 50);
  assert.deepEqual(result.ponds[1].weekly.expenseAllocations[0], {
    expenseId: 'direct',
    category: 'Power',
    description: 'Shared power',
    amount: 50,
    method: 'direct-pond',
  });
});

test('feed usage, direct inventory, and harvest weights determine pond break-even', () => {
  const result = calculateProductionCosting({
    ponds: [pond('pond-1')],
    movements: [
      { pondId: 'pond-1', category: 'FEED', change: -10, unitCost: 4, createdAt: new Date('2026-10-13T12:00:00.000Z') },
      { pondId: 'pond-1', category: 'MEDICINE', change: -2, unitCost: 5, createdAt: new Date('2026-10-13T12:00:00.000Z') },
    ],
    expenses: [],
    harvests: [{
      pondId: 'pond-1',
      numberHarvested: 20,
      biomassKg: null,
      avgWeightGrams: 500,
      recordedAt: new Date('2026-10-15T12:00:00.000Z'),
    }],
    weekStart,
    now,
  });
  assert.equal(result.ponds[0].cycle.feedCost, 40);
  assert.equal(result.ponds[0].cycle.otherDirectCosts, 10);
  assert.equal(result.ponds[0].cycle.harvestKg, 10);
  assert.equal(result.ponds[0].cycle.breakEvenPerKg, 5);
  assert.equal(result.ponds[0].cycle.breakEvenPerFish, 2.5);
  assert.equal(result.ponds[0].cycle.provisional, false);
});

test('pond sales are compared with cycle costs to show profit or loss', () => {
  const result = calculateProductionCosting({
    ponds: [pond('pond-1')],
    movements: [{ pondId: 'pond-1', category: 'FEED', change: -10, unitCost: 4, createdAt: now }],
    expenses: [expense({ type: 'SALES', amount: 60, pondId: 'pond-1', recordedAt: now })],
    harvests: [],
    weekStart,
    now,
  });
  assert.equal(result.ponds[0].weekly.sales, 60);
  assert.equal(result.ponds[0].weekly.profitLoss, 20);
  assert.equal(result.ponds[0].cycle.profitLoss, 20);
});

test('zero harvest never produces a break-even price and missing biomass is flagged', () => {
  const noHarvest = calculateProductionCosting({ ponds: [pond('pond-1')], movements: [], expenses: [], harvests: [], weekStart, now });
  assert.equal(noHarvest.ponds[0].cycle.breakEvenPerKg, null);
  assert.equal(noHarvest.ponds[0].cycle.breakEvenPerFish, null);
  const missingWeight = calculateProductionCosting({
    ponds: [pond('pond-1')],
    movements: [],
    expenses: [],
    harvests: [{ pondId: 'pond-1', numberHarvested: 3, biomassKg: null, avgWeightGrams: null, recordedAt: now }],
    weekStart,
    now,
  });
  assert.equal(missingWeight.ponds[0].cycle.breakEvenPerKg, null);
  assert.equal(missingWeight.ponds[0].cycle.breakEvenPerFish, 0);
  assert.equal(missingWeight.ponds[0].cycle.provisional, true);
});

test('late corrections change derived weeks and repeated recalculation is idempotent', () => {
  const input = { ponds: [pond('pond-1')], movements: [], expenses: [expense()], harvests: [], weekStart, now };
  const first = calculateProductionCosting(input);
  const second = calculateProductionCosting(input);
  assert.deepEqual(second, first);
  const corrected = calculateProductionCosting({
    ...input,
    expenses: [expense({ amount: 140 })],
  });
  assert.equal(corrected.ponds[0].weekly.runningCosts, first.ponds[0].weekly.runningCosts * 2);
});

test('tenant pond allowlist excludes movements linked to another workspace', () => {
  const scoped = filterTenantPondMovements(new Set(['pond-1']), [
    { pondId: 'pond-1', change: -1 },
    { pondId: 'foreign-pond', change: -1 },
    { pondId: null, change: -1 },
  ]);
  assert.deepEqual(scoped, [{ pondId: 'pond-1', change: -1 }]);
});

test('week selection normalizes to Monday and rejects invalid dates', () => {
  assert.equal(normalizeWeekStart('2026-10-14').toISOString(), weekStart.toISOString());
  assert.throws(() => normalizeWeekStart('2026-02-30'), /valid calendar date/);
});
