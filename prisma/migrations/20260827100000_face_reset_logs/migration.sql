-- CreateTable
CREATE TABLE "FaceResetLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userPhone" TEXT NOT NULL,
    "userDesignation" TEXT NOT NULL DEFAULT '',
    "adminId" TEXT NOT NULL,
    "adminName" TEXT NOT NULL DEFAULT '',
    "adminEmail" TEXT NOT NULL DEFAULT '',
    "adminAccessLevel" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaceResetLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FaceResetLog_createdAt_idx" ON "FaceResetLog"("createdAt");

-- CreateIndex
CREATE INDEX "FaceResetLog_userId_idx" ON "FaceResetLog"("userId");

-- CreateIndex
CREATE INDEX "FaceResetLog_adminId_idx" ON "FaceResetLog"("adminId");
