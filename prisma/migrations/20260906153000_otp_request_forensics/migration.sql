-- Append-only OTP request forensic log (device/IP attribution). No FK cascades.

CREATE TABLE IF NOT EXISTS "OtpRequestLog" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "clientSource" TEXT NOT NULL DEFAULT 'web',
    "appInstallationId" TEXT NOT NULL DEFAULT '',
    "androidId" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OtpRequestLog_phone_createdAt_idx" ON "OtpRequestLog"("phone", "createdAt");
CREATE INDEX IF NOT EXISTS "OtpRequestLog_ip_createdAt_idx" ON "OtpRequestLog"("ip", "createdAt");
CREATE INDEX IF NOT EXISTS "OtpRequestLog_appInstallationId_createdAt_idx" ON "OtpRequestLog"("appInstallationId", "createdAt");
CREATE INDEX IF NOT EXISTS "OtpRequestLog_createdAt_idx" ON "OtpRequestLog"("createdAt");
