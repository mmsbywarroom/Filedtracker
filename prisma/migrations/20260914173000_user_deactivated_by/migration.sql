-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedByAdminId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedByName" TEXT;
