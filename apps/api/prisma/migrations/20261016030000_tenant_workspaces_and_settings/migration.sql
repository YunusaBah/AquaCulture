ALTER TABLE "User"
ADD COLUMN "adminId" TEXT,
ADD COLUMN "permissions" JSONB,
ADD COLUMN "profilePhoto" TEXT,
ADD COLUMN "fontSize" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN "highContrast" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "User_adminId_idx" ON "User"("adminId");
ALTER TABLE "User"
ADD CONSTRAINT "User_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "User" AS worker
SET "adminId" = assigned_farms."ownerId"
FROM (
  SELECT user_farms."userId", MIN(user_farms."ownerId") AS "ownerId"
  FROM (
    SELECT pond."assignedUserId" AS "userId", farm."ownerId"
    FROM "Pond" AS pond
    JOIN "FarmSite" AS site ON site."id" = pond."siteId"
    JOIN "Farm" AS farm ON farm."id" = site."farmId"
    WHERE pond."assignedUserId" IS NOT NULL
    UNION
    SELECT membership."B" AS "userId", farm."ownerId"
    FROM "_farm_members" AS membership
    JOIN "Farm" AS farm ON farm."id" = membership."A"
  ) AS user_farms
  GROUP BY user_farms."userId"
  HAVING COUNT(DISTINCT user_farms."ownerId") = 1
) AS assigned_farms
WHERE worker."id" = assigned_farms."userId"
  AND worker."adminId" IS NULL
  AND worker."roleId" IN (SELECT "id" FROM "Role" WHERE "name" = 'WORKER');

ALTER TABLE "FinanceRecord" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Task" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "tenantId" TEXT;

DROP INDEX "InventoryItem_sku_key";
CREATE UNIQUE INDEX "InventoryItem_tenantId_sku_key" ON "InventoryItem"("tenantId", "sku");

UPDATE "FinanceRecord" AS record
SET "tenantId" = farm."ownerId"
FROM "Pond" AS pond
JOIN "FarmSite" AS site ON site."id" = pond."siteId"
JOIN "Farm" AS farm ON farm."id" = site."farmId"
WHERE record."pondId" = pond."id";

UPDATE "FinanceRecord" AS record
SET "tenantId" = CASE
  WHEN r."name" = 'OWNER' THEN u."id"
  ELSE u."adminId"
END
FROM "User" AS u
JOIN "Role" AS r ON r."id" = u."roleId"
WHERE record."recordedById" = u."id"
  AND record."tenantId" IS NULL;

UPDATE "InventoryItem" AS item
SET "tenantId" = item_tenants."ownerId"
FROM (
  SELECT item_tx."itemId", MIN(farm."ownerId") AS "ownerId"
  FROM "InventoryTransaction" AS item_tx
  JOIN "Pond" AS pond ON pond."id" = item_tx."pondId"
  JOIN "FarmSite" AS site ON site."id" = pond."siteId"
  JOIN "Farm" AS farm ON farm."id" = site."farmId"
  GROUP BY item_tx."itemId"
  HAVING COUNT(DISTINCT farm."ownerId") = 1
) AS item_tenants
WHERE item_tenants."itemId" = item."id";

UPDATE "InventoryItem" AS item
SET "tenantId" = (
  SELECT owner."id"
  FROM "User" AS owner
  JOIN "Role" AS role ON role."id" = owner."roleId"
  WHERE role."name" = 'OWNER'
  ORDER BY owner."createdAt" ASC
  LIMIT 1
)
WHERE item."tenantId" IS NULL
  AND (SELECT COUNT(*) FROM "User" AS owner JOIN "Role" AS role ON role."id" = owner."roleId" WHERE role."name" = 'OWNER') = 1;

UPDATE "Task" AS task
SET "tenantId" = CASE
  WHEN r."name" = 'OWNER' THEN u."id"
  ELSE u."adminId"
END
FROM "User" AS u
JOIN "Role" AS r ON r."id" = u."roleId"
WHERE task."creatorId" = u."id";

UPDATE "ChatMessage" AS message
SET "tenantId" = CASE
  WHEN r."name" = 'OWNER' THEN u."id"
  ELSE u."adminId"
END
FROM "User" AS u
JOIN "Role" AS r ON r."id" = u."roleId"
WHERE message."senderId" = u."id";
