ALTER TABLE "InventoryTransaction" ADD COLUMN "pondId" TEXT;

UPDATE "InventoryTransaction" AS transaction
SET "pondId" = pond.id
FROM "Pond" AS pond
WHERE transaction.reason LIKE 'Feed used on pond %'
  AND pond.id::text = substring(transaction.reason from 18);

ALTER TABLE "InventoryTransaction"
ADD CONSTRAINT "InventoryTransaction_pondId_fkey"
FOREIGN KEY ("pondId") REFERENCES "Pond"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InventoryTransaction_pondId_idx" ON "InventoryTransaction"("pondId");
