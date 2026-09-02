CREATE TABLE IF NOT EXISTS "SecurityViolationLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "userPhone" TEXT NOT NULL,
  "userDesignation" TEXT NOT NULL DEFAULT '',
  "assemblyName" TEXT NOT NULL DEFAULT '',
  "zone" TEXT NOT NULL DEFAULT '',
  "district" TEXT NOT NULL DEFAULT '',
  "violationType" TEXT NOT NULL,
  "clientSource" TEXT NOT NULL DEFAULT 'native',
  "action" TEXT NOT NULL DEFAULT 'blocked',
  "detail" TEXT NOT NULL DEFAULT '',
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityViolationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SecurityViolationLog_createdAt_idx" ON "SecurityViolationLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SecurityViolationLog_userId_idx" ON "SecurityViolationLog"("userId");
CREATE INDEX IF NOT EXISTS "SecurityViolationLog_violationType_idx" ON "SecurityViolationLog"("violationType");
