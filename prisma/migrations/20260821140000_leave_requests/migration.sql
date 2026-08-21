-- CreateTable
CREATE TABLE IF NOT EXISTS "LeaveRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeaveRequest_userId_createdAt_idx" ON "LeaveRequest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeaveRequest_status_createdAt_idx" ON "LeaveRequest"("status", "createdAt");

ALTER TABLE "LeaveRequest" DROP CONSTRAINT IF EXISTS "LeaveRequest_userId_fkey";
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
