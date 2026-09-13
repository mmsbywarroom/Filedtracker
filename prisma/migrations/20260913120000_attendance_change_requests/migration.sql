-- CreateTable
CREATE TABLE IF NOT EXISTS "AttendanceChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "proposedStatus" TEXT NOT NULL,
    "previousStatus" TEXT,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL DEFAULT '',
    "requestedByEmail" TEXT NOT NULL DEFAULT '',
    "requestedByLevel" TEXT NOT NULL DEFAULT '',
    "reviewLevel" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedByEmail" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AttendanceChangeRequest_status_reviewLevel_createdAt_idx" ON "AttendanceChangeRequest"("status", "reviewLevel", "createdAt");
CREATE INDEX IF NOT EXISTS "AttendanceChangeRequest_userId_date_idx" ON "AttendanceChangeRequest"("userId", "date");
CREATE INDEX IF NOT EXISTS "AttendanceChangeRequest_requestedById_createdAt_idx" ON "AttendanceChangeRequest"("requestedById", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AttendanceChangeRequest" ADD CONSTRAINT "AttendanceChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
