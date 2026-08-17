-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "designation" TEXT NOT NULL DEFAULT 'Sector Incharge';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cluster" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "accessLevel" TEXT NOT NULL DEFAULT 'State';
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "isSuper" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "designations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "zone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "district" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "assemblyName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "cluster" TEXT NOT NULL DEFAULT '';

UPDATE "Admin"
SET
  "isSuper" = true,
  "accessLevel" = 'State',
  "name" = CASE WHEN "name" = '' THEN 'State Admin' ELSE "name" END,
  "designations" = ARRAY['State','ZLC','DLC','Cluster','ALC','Sector Incharge']::TEXT[]
WHERE "isSuper" = false AND cardinality("designations") = 0;
