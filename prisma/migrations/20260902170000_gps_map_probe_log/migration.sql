-- Raw map GPS probes (lat/lng/accuracy) for defensible anti-spoof audit
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "gpsMapProbeLog" JSONB;
