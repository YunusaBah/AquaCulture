-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('OWNER', 'WORKER', 'VIEWER');

-- CreateEnum
CREATE TYPE "Species" AS ENUM ('CATFISH', 'TILAPIA', 'TROUT', 'SHRIMP', 'OTHER');

-- CreateEnum
CREATE TYPE "PondStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'HARVESTED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCHRONIZED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FinanceRecordType" AS ENUM ('INCOME', 'EXPENSE', 'BUDGET');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" "RoleName" NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "usedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "RegistrationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmSite" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pond" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "species" "Species" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "current_volume" DOUBLE PRECISION,
    "initial_population" INTEGER,
    "current_population" INTEGER,
    "stockedAt" TIMESTAMP(3),
    "initialAvgWeightG" DOUBLE PRECISION,
    "targetHarvestKg" DOUBLE PRECISION,
    "targetHarvestDate" TIMESTAMP(3),
    "expectedGrowthGDay" DOUBLE PRECISION,
    "status" "PondStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_batchId" TEXT,
    "assignedUserId" TEXT,
    "qrCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pond_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceRecord" (
    "id" TEXT NOT NULL,
    "type" "FinanceRecordType" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,
    "pondId" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FishBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "stockingDate" TIMESTAMP(3) NOT NULL,
    "supplier" TEXT,
    "purchasePrice" DOUBLE PRECISION,
    "initialQuantity" INTEGER NOT NULL,
    "currentQuantity" INTEGER NOT NULL,
    "expectedHarvest" TIMESTAMP(3),

    CONSTRAINT "FishBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedingLog" (
    "id" TEXT NOT NULL,
    "pondId" TEXT NOT NULL,
    "workerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedBrand" TEXT,
    "feedType" TEXT,
    "feedSize" TEXT,
    "quantityKg" DOUBLE PRECISION NOT NULL,
    "appetite" INTEGER,
    "observation" TEXT,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,

    CONSTRAINT "FeedingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterQualityLog" (
    "id" TEXT NOT NULL,
    "pondId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ph" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "ammonia" DOUBLE PRECISION,
    "nitrite" DOUBLE PRECISION,
    "nitrate" DOUBLE PRECISION,
    "dissolvedO2" DOUBLE PRECISION,
    "conductivity" DOUBLE PRECISION,
    "salinity" DOUBLE PRECISION,
    "turbidity" DOUBLE PRECISION,
    "waterLevel" DOUBLE PRECISION,
    "waterAddedPercent" DOUBLE PRECISION,
    "waterRemovedPercent" DOUBLE PRECISION,
    "comment" TEXT,
    "workerId" TEXT,

    CONSTRAINT "WaterQualityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MortalityLog" (
    "id" TEXT NOT NULL,
    "pondId" TEXT NOT NULL,
    "numberDead" INTEGER NOT NULL,
    "avgSizeGrams" DOUBLE PRECISION,
    "possibleCause" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workerId" TEXT,

    CONSTRAINT "MortalityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarvestLog" (
    "id" TEXT NOT NULL,
    "pondId" TEXT NOT NULL,
    "numberHarvested" INTEGER NOT NULL,
    "avgWeightGrams" DOUBLE PRECISION,
    "biomassKg" DOUBLE PRECISION,
    "method" TEXT,
    "destination" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workerId" TEXT,

    CONSTRAINT "HarvestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthMeasurement" (
    "id" TEXT NOT NULL,
    "pondId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avgWeightGrams" DOUBLE PRECISION NOT NULL,
    "workerId" TEXT,
    "comment" TEXT,

    CONSTRAINT "GrowthMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "change" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT,
    "uploadedById" TEXT,
    "feedingLogId" TEXT,
    "mortalityLogId" TEXT,
    "harvestLogId" TEXT,
    "growthMeasurementId" TEXT,
    "taskId" TEXT,
    "pondId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "tableName" TEXT,
    "recordId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "creatorId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3),
    "checklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted" BOOLEAN DEFAULT false,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSync" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tableName" TEXT,
    "recordId" TEXT,
    "payload" JSONB,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_farm_members" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationCode_code_key" ON "RegistrationCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationCode_usedById_key" ON "RegistrationCode"("usedById");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "FishBatch_batchNumber_key" ON "FishBatch"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "_farm_members_AB_unique" ON "_farm_members"("A", "B");

-- CreateIndex
CREATE INDEX "_farm_members_B_index" ON "_farm_members"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationCode" ADD CONSTRAINT "RegistrationCode_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farm" ADD CONSTRAINT "Farm_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmSite" ADD CONSTRAINT "FarmSite_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pond" ADD CONSTRAINT "Pond_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "FarmSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pond" ADD CONSTRAINT "Pond_current_batchId_fkey" FOREIGN KEY ("current_batchId") REFERENCES "FishBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pond" ADD CONSTRAINT "Pond_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingLog" ADD CONSTRAINT "FeedingLog_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingLog" ADD CONSTRAINT "FeedingLog_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterQualityLog" ADD CONSTRAINT "WaterQualityLog_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterQualityLog" ADD CONSTRAINT "WaterQualityLog_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortalityLog" ADD CONSTRAINT "MortalityLog_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortalityLog" ADD CONSTRAINT "MortalityLog_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestLog" ADD CONSTRAINT "HarvestLog_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestLog" ADD CONSTRAINT "HarvestLog_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthMeasurement" ADD CONSTRAINT "GrowthMeasurement_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthMeasurement" ADD CONSTRAINT "GrowthMeasurement_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_feedingLogId_fkey" FOREIGN KEY ("feedingLogId") REFERENCES "FeedingLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_mortalityLogId_fkey" FOREIGN KEY ("mortalityLogId") REFERENCES "MortalityLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_harvestLogId_fkey" FOREIGN KEY ("harvestLogId") REFERENCES "HarvestLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_growthMeasurementId_fkey" FOREIGN KEY ("growthMeasurementId") REFERENCES "GrowthMeasurement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSync" ADD CONSTRAINT "DeviceSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_farm_members" ADD CONSTRAINT "_farm_members_A_fkey" FOREIGN KEY ("A") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_farm_members" ADD CONSTRAINT "_farm_members_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
