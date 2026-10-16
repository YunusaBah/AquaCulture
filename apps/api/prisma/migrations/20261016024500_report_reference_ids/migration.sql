ALTER SEQUENCE "finance_transaction_reference_seq" RENAME TO "report_reference_seq";

CREATE FUNCTION next_report_reference() RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  sequence_number BIGINT;
  prefix_number BIGINT;
  prefix TEXT := '';
  position INTEGER;
BEGIN
  sequence_number := nextval('"report_reference_seq"');
  prefix_number := (sequence_number - 1) / 100;

  FOR position IN 1..5 LOOP
    prefix := CHR(65 + (prefix_number % 26)::INTEGER) || prefix;
    prefix_number := prefix_number / 26;
  END LOOP;

  IF prefix_number > 0 THEN
    RAISE EXCEPTION 'Report reference ID sequence is exhausted';
  END IF;

  RETURN prefix || '-' || LPAD((sequence_number % 100)::TEXT, 2, '0');
END;
$$;

ALTER TABLE "User" ADD COLUMN "reportId" TEXT;
ALTER TABLE "Task" ADD COLUMN "reportId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "reportId" TEXT;

UPDATE "User" SET "reportId" = next_report_reference();
UPDATE "Task" SET "reportId" = next_report_reference();
UPDATE "InventoryItem" SET "reportId" = next_report_reference();

ALTER TABLE "User" ALTER COLUMN "reportId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "reportId" SET NOT NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "reportId" SET NOT NULL;

CREATE UNIQUE INDEX "User_reportId_key" ON "User"("reportId");
CREATE UNIQUE INDEX "Task_reportId_key" ON "Task"("reportId");
CREATE UNIQUE INDEX "InventoryItem_reportId_key" ON "InventoryItem"("reportId");
