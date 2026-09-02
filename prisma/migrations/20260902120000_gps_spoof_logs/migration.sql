-- CreateTable
CREATE TABLE "GpsSpoofLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userPhone" TEXT NOT NULL,
    "userDesignation" TEXT NOT NULL DEFAULT '',
    "assemblyName" TEXT NOT NULL DEFAULT '',
    "zone" TEXT NOT NULL DEFAULT '',
    "district" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "maxSpreadM" DOUBLE PRECISION,
    "detail" TEXT NOT NULL,
    "attendanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GpsSpoofLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GpsSpoofLog_createdAt_idx" ON "GpsSpoofLog"("createdAt");

-- CreateIndex
CREATE INDEX "GpsSpoofLog_userId_idx" ON "GpsSpoofLog"("userId");

-- CreateIndex
CREATE INDEX "GpsSpoofLog_outcome_idx" ON "GpsSpoofLog"("outcome");
