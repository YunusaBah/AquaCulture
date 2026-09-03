import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { prisma } from '../src/lib/prisma';

dotenv.config();

async function main() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.warn('DATABASE_URL not set — skipping seed. Configure your database and re-run the seed.');
        return;
    }

    console.log('Running seed against', dbUrl.replace(/:[^:]+@/, ':***@'));

    const roles = ['OWNER', 'WORKER'];
    for (const role of roles) {
        await prisma.role.upsert({ where: { name: role }, update: {}, create: { name: role } });
    }

    const ownerEmail = process.env.SEED_OWNER_EMAIL || 'owner@aquaculture.localapp';
    const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'Owner7614091';
    const workerEmail = process.env.SEED_WORKER_EMAIL || 'worker@aquaculture.localapp';
    const workerPassword = process.env.SEED_WORKER_PASSWORD || 'Worker5221';

    const ownerHash = await bcrypt.hash(ownerPassword, 10);
    const workerHash = await bcrypt.hash(workerPassword, 10);

    await prisma.user.upsert({
        where: { email: ownerEmail },
        update: { name: 'Farm Owner', password: ownerHash },
        create: {
            email: ownerEmail,
            name: 'Farm Owner',
            password: ownerHash,
            role: { connect: { name: 'OWNER' } },
        },
    });

    await prisma.user.upsert({
        where: { email: workerEmail },
        update: { name: 'Field Worker', password: workerHash },
        create: {
            email: workerEmail,
            name: 'Field Worker',
            password: workerHash,
            role: { connect: { name: 'WORKER' } },
        },
    });

    console.log('Seed complete. Development roles: OWNER and WORKER only.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
