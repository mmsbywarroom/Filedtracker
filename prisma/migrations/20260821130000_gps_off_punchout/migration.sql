-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "punchOutReason" TEXT;
CREATE INDEX IF NOT EXISTS "Attendance_punchOutReason_idx" ON "Attendance"("punchOutReason");
