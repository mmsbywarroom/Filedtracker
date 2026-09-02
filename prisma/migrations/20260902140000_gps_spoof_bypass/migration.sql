-- CreateTable
CREATE TABLE "GpsSpoofBypass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminName" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "logId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GpsSpoofBypass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GpsSpoofBypass_userId_expiresAt_idx" ON "GpsSpoofBypass"("userId", "expiresAt");
