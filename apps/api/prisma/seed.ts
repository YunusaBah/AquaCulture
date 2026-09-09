import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { prisma } from '../src/lib/prisma';

dotenv.config();

type SeedUser = {
  email: string;
  password: string;
  name: string;
  role: 'OWNER' | 'WORKER';
};

const seedUsers: SeedUser[] = [
  {
    email: process.env.SEED_OWNER_EMAIL || 'owner@aquaculture.localapp',
    password: process.env.SEED_OWNER_PASSWORD || 'Owner7614091',
    name: 'Farm Owner',
    role: 'OWNER',
  },
  {
    email: process.env.SEED_WORKER_EMAIL || 'worker@aquaculture.localapp',
    password: process.env.SEED_WORKER_PASSWORD || 'Worker5221',
    name: 'Field Worker',
    role: 'WORKER',
  },
];

async function upsertUser(user: (typeof seedUsers)[number]) {
  const password = await bcrypt.hash(user.password, 10);

  return prisma.user.upsert({
    where: { email: user.email },
    update: {
      name: user.name,
      password,
      role: { connect: { name: user.role } },
    },
    create: {
      email: user.email,
      name: user.name,
      password,
      role: { connect: { name: user.role } },
    },
    include: { role: true },
  });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('DATABASE_URL not set - skipping seed. Configure your database and re-run the seed.');
    return;
  }

  console.log('Running seed against', dbUrl.replace(/:[^:]+@/, ':***@'));

  const roles: Array<'OWNER' | 'WORKER'> = ['OWNER', 'WORKER'];
  for (const role of roles) {
    await prisma.role.upsert({ where: { name: role }, update: {}, create: { name: role } });
  }

  const [owner, worker] = await Promise.all(seedUsers.map(upsertUser));

  const farm = await prisma.farm.upsert({
    where: { id: 'demo-farm-aquaculture' },
    update: {
    name: 'AquaCulture Demonstration Farm',
      ownerId: owner.id,
      members: { set: [{ id: owner.id }, { id: worker.id }] },
    },
    create: {
      id: 'demo-farm-aquaculture',
      name: 'AquaCulture Demonstration Farm',
      ownerId: owner.id,
      members: { connect: [{ id: owner.id }, { id: worker.id }] },
    },
  });

  const site = await prisma.farmSite.upsert({
    where: { id: 'demo-main-site' },
    update: {
      farmId: farm.id,
      name: 'Main Production Site',
      location: 'Farm site',
      timezone: 'Atlantic/Reykjavik',
    },
    create: {
      id: 'demo-main-site',
      farmId: farm.id,
      name: 'Main Production Site',
      location: 'Farm site',
      timezone: 'Atlantic/Reykjavik',
    },
  });

  const pondSeeds = [
    { id: 'demo-pond-1', number: 1, assignedUserId: worker.id, capacity: 6000, population: 5100, initialAvgWeightG: 40, targetHarvestKg: 1.2, expectedGrowthGDay: 6 },
    { id: 'demo-pond-2', number: 2, assignedUserId: worker.id, capacity: 6200, population: 4800, initialAvgWeightG: 35, targetHarvestKg: 1.1, expectedGrowthGDay: 5.5 },
    { id: 'demo-pond-3', number: 3, assignedUserId: worker.id, capacity: 5800, population: 4520, initialAvgWeightG: 50, targetHarvestKg: 1.3, expectedGrowthGDay: 6.2 },
    { id: 'demo-pond-7', number: 7, assignedUserId: worker.id, capacity: 7000, population: 6300, initialAvgWeightG: 28, targetHarvestKg: 1, expectedGrowthGDay: 5 },
  ];

  for (const pond of pondSeeds) {
    await prisma.pond.upsert({
      where: { id: pond.id },
      update: {
        siteId: site.id,
        number: pond.number,
        species: 'CATFISH',
        capacity: pond.capacity,
        initial_population: pond.population,
        current_population: pond.population,
        stockedAt: new Date('2026-08-01T08:00:00.000Z'),
        initialAvgWeightG: pond.initialAvgWeightG,
        targetHarvestKg: pond.targetHarvestKg,
        expectedGrowthGDay: pond.expectedGrowthGDay,
        assignedUserId: pond.assignedUserId,
        status: 'ACTIVE',
      },
      create: {
        id: pond.id,
        siteId: site.id,
        number: pond.number,
        species: 'CATFISH',
        capacity: pond.capacity,
        initial_population: pond.population,
        current_population: pond.population,
        stockedAt: new Date('2026-08-01T08:00:00.000Z'),
        initialAvgWeightG: pond.initialAvgWeightG,
        targetHarvestKg: pond.targetHarvestKg,
        expectedGrowthGDay: pond.expectedGrowthGDay,
        assignedUserId: pond.assignedUserId,
        status: 'ACTIVE',
      },
    });
  }

  await prisma.inventoryItem.upsert({
    where: { sku: 'FEED-CATFISH-001' },
    update: { name: 'Catfish Feed', category: 'Feed', unit: 'bags', currentStock: 18, minStock: 25 },
    create: { sku: 'FEED-CATFISH-001', name: 'Catfish Feed', category: 'Feed', unit: 'bags', currentStock: 18, minStock: 25 },
  });

  await prisma.inventoryItem.upsert({
    where: { sku: 'MED-OXY-001' },
    update: { name: 'Oxygen Treatment', category: 'Medicine', unit: 'packs', currentStock: 12, minStock: 5 },
    create: { sku: 'MED-OXY-001', name: 'Oxygen Treatment', category: 'Medicine', unit: 'packs', currentStock: 12, minStock: 5 },
  });

  const task = await prisma.task.upsert({
    where: { id: 'demo-task-morning-checklist' },
    update: {
      title: 'Morning pond checklist',
      description: 'Feed assigned ponds, observe behavior, record water level, and upload photos.',
      creatorId: owner.id,
      status: 'OPEN',
      priority: 'HIGH',
      checklist: ['Feed Pond 1', 'Feed Pond 2', 'Observe Fish', 'Upload Photos', 'Record Water Level'],
    },
    create: {
      id: 'demo-task-morning-checklist',
      title: 'Morning pond checklist',
      description: 'Feed assigned ponds, observe behavior, record water level, and upload photos.',
      creatorId: owner.id,
      status: 'OPEN',
      priority: 'HIGH',
      checklist: ['Feed Pond 1', 'Feed Pond 2', 'Observe Fish', 'Upload Photos', 'Record Water Level'],
    },
  });

  await prisma.taskAssignment.upsert({
    where: { id: `demo-assignment-${worker.id}` },
    update: { taskId: task.id, userId: worker.id },
    create: { id: `demo-assignment-${worker.id}`, taskId: task.id, userId: worker.id },
  });


  const financeRecords = [
    { id: 'demo-finance-feed', type: 'EXPENSE', category: 'Feed', description: 'Purchased feed', quantity: 100, unit: 'bags', unitPrice: 950, amount: 95000 },
    { id: 'demo-finance-medicine', type: 'EXPENSE', category: 'Medicine', description: 'Medicine purchase', quantity: 1, unit: 'batch', unitPrice: 8500, amount: 8500 },
    { id: 'demo-finance-fuel', type: 'EXPENSE', category: 'Fuel', description: 'Generator fuel', quantity: 1, unit: 'month', unitPrice: 3200, amount: 3200 },
    { id: 'demo-finance-workers', type: 'EXPENSE', category: 'Workers', description: 'Worker allowance', quantity: 1, unit: 'month', unitPrice: 15000, amount: 15000 },
    { id: 'demo-finance-harvest', type: 'INCOME', category: 'Harvest', description: 'Sold harvested fish', quantity: 1300, unit: 'kg', unitPrice: 220, amount: 286000 },
    { id: 'demo-finance-budget', type: 'BUDGET', category: 'Operating Budget', description: 'Monthly operating budget', quantity: 1, unit: 'month', unitPrice: 150000, amount: 150000 },
  ];

  for (const record of financeRecords) {
    await prisma.financeRecord.upsert({
      where: { id: record.id },
      update: { ...record, type: record.type as any, recordedById: owner.id },
      create: { ...record, type: record.type as any, recordedById: owner.id },
    });
  }

  console.log('Seed complete. Demo logins:');
  for (const user of seedUsers) {
    console.log(`${user.role}: ${user.email} / ${user.password}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
