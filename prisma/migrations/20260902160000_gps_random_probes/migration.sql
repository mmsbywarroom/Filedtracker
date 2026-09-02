-- Random GPS probe schedule + stored probe readings per session
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "gpsProbeSchedule" JSONB;

CREATE TABLE IF NOT EXISTS "GpsRandomProbe" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GpsRandomProbe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GpsRandomProbe_attendanceId_slot_key" ON "GpsRandomProbe"("attendanceId", "slot");
CREATE INDEX IF NOT EXISTS "GpsRandomProbe_attendanceId_idx" ON "GpsRandomProbe"("attendanceId");

DO $$ BEGIN
    ALTER TABLE "GpsRandomProbe" ADD CONSTRAINT "GpsRandomProbe_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
