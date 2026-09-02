-- CreateTable
CREATE TABLE "AttendanceIntervalSnapshot" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceIntervalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceIntervalSnapshot_attendanceId_slot_key" ON "AttendanceIntervalSnapshot"("attendanceId", "slot");

-- CreateIndex
CREATE INDEX "AttendanceIntervalSnapshot_attendanceId_idx" ON "AttendanceIntervalSnapshot"("attendanceId");

-- AddForeignKey
ALTER TABLE "AttendanceIntervalSnapshot" ADD CONSTRAINT "AttendanceIntervalSnapshot_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
