-- AlterTable
ALTER TABLE "OtpRequestLog" ADD COLUMN "deviceOwnerUserId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OtpRequestLog" ADD COLUMN "deviceOwnerName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OtpRequestLog" ADD COLUMN "deviceOwnerPhone" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "OtpRequestLog_androidId_createdAt_idx" ON "OtpRequestLog"("androidId", "createdAt");
CREATE INDEX "OtpRequestLog_deviceOwnerUserId_createdAt_idx" ON "OtpRequestLog"("deviceOwnerUserId", "createdAt");
