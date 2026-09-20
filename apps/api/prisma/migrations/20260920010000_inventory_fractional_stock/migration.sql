ALTER TABLE "InventoryItem"
  ALTER COLUMN "currentStock" TYPE DOUBLE PRECISION USING "currentStock"::double precision,
  ALTER COLUMN "minStock" TYPE DOUBLE PRECISION USING "minStock"::double precision;

ALTER TABLE "InventoryTransaction"
  ALTER COLUMN "change" TYPE DOUBLE PRECISION USING "change"::double precision;
