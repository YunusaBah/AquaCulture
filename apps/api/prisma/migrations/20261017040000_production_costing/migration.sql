ALTER TABLE "InventoryTransaction"
ADD COLUMN "unitCost" DOUBLE PRECISION;

ALTER TABLE "FinanceRecord"
ADD COLUMN "coverageStart" TIMESTAMP(3),
ADD COLUMN "coverageEnd" TIMESTAMP(3);
