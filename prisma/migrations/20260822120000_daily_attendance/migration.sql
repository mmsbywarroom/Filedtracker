-- Daily attendance marks (manual override + cached auto status)
CREATE TABLE "DailyAttendanceMark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "hoursWorked" DOUBLE PRECISION,
    "note" TEXT,
    "markedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAttendanceMark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyAttendanceMark_userId_date_key" ON "DailyAttendanceMark"("userId", "date");
CREATE INDEX "DailyAttendanceMark_date_status_idx" ON "DailyAttendanceMark"("date", "status");

ALTER TABLE "DailyAttendanceMark" ADD CONSTRAINT "DailyAttendanceMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
