CREATE SEQUENCE "finance_transaction_reference_seq" START WITH 1;

ALTER TABLE "FinanceRecord" ADD COLUMN "transactionId" TEXT;

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "recordedAt", "id") AS sequence_number
  FROM "FinanceRecord"
),
encoded AS (
  SELECT
    "id",
    (sequence_number - 1) / 100 AS prefix_number,
    sequence_number % 100 AS suffix_number
  FROM numbered
)
UPDATE "FinanceRecord" AS record
SET "transactionId" =
  CHR(65 + ((encoded.prefix_number / 456976) % 26)::INTEGER) ||
  CHR(65 + ((encoded.prefix_number / 17576) % 26)::INTEGER) ||
  CHR(65 + ((encoded.prefix_number / 676) % 26)::INTEGER) ||
  CHR(65 + ((encoded.prefix_number / 26) % 26)::INTEGER) ||
  CHR(65 + (encoded.prefix_number % 26)::INTEGER) ||
  '-' ||
  LPAD(encoded.suffix_number::TEXT, 2, '0')
FROM encoded
WHERE record."id" = encoded."id";

ALTER TABLE "FinanceRecord" ALTER COLUMN "transactionId" SET NOT NULL;
CREATE UNIQUE INDEX "FinanceRecord_transactionId_key" ON "FinanceRecord"("transactionId");

SELECT SETVAL(
  '"finance_transaction_reference_seq"',
  GREATEST((SELECT COUNT(*) + 1 FROM "FinanceRecord"), 1),
  FALSE
);
