-- Safe migration for the two-role RBAC model.
-- Unexpected legacy rows are preserved as OWNER so access is not reduced.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoleName') THEN
    CREATE TYPE "RoleName" AS ENUM ('OWNER', 'WORKER');
  END IF;
END $$;

ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "name_new" "RoleName";

UPDATE "Role"
SET "name_new" = CASE
  WHEN "name" = 'OWNER' THEN 'OWNER'
  WHEN "name" = 'WORKER' THEN 'WORKER'
  ELSE 'OWNER'
END;

ALTER TABLE "Role" DROP CONSTRAINT IF EXISTS "Role_name_key";
ALTER TABLE "Role" DROP COLUMN "name";
ALTER TABLE "Role" RENAME COLUMN "name_new" TO "name";
ALTER TABLE "Role" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "Role" ADD CONSTRAINT "Role_name_key" UNIQUE ("name");