-- Silent location-integrity evidence (admin-only). Does not affect punch success.
-- INTENTIONAL: no FK from evidence tables → Attendance/User cascade.
-- Forensic rows must survive attendance edits/deletes; orphaned IDs remain queryable by userId/punchId.

CREATE TABLE IF NOT EXISTS "DeviceAppInstallation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appInstallationId" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL DEFAULT '',
    "versionCode" INTEGER NOT NULL DEFAULT 0,
    "androidVersion" TEXT NOT NULL DEFAULT '',
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceAppInstallation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceAppInstallation_userId_appInstallationId_key"
  ON "DeviceAppInstallation"("userId", "appInstallationId");
CREATE INDEX IF NOT EXISTS "DeviceAppInstallation_userId_idx" ON "DeviceAppInstallation"("userId");
CREATE INDEX IF NOT EXISTS "DeviceAppInstallation_appInstallationId_idx" ON "DeviceAppInstallation"("appInstallationId");

CREATE TABLE IF NOT EXISTS "PunchSecurityChallenge" (
    "id" TEXT NOT NULL,
    "punchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "punchType" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "PunchSecurityChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PunchSecurityChallenge_punchId_key" ON "PunchSecurityChallenge"("punchId");
CREATE INDEX IF NOT EXISTS "PunchSecurityChallenge_userId_createdAt_idx" ON "PunchSecurityChallenge"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PunchSecurityChallenge_expiresAt_idx" ON "PunchSecurityChallenge"("expiresAt");

CREATE TABLE IF NOT EXISTS "AttendanceSecuritySummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "punchId" TEXT NOT NULL,
    "punchType" TEXT NOT NULL,
    "attendanceStatus" TEXT NOT NULL DEFAULT 'SUCCESS',
    "appInstallationId" TEXT NOT NULL DEFAULT '',
    "mockLocationDetected" BOOLEAN NOT NULL DEFAULT false,
    "directMockSampleCount" INTEGER NOT NULL DEFAULT 0,
    "playIntegrityStatus" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
    "vpnActive" BOOLEAN NOT NULL DEFAULT false,
    "impossibleTravelDetected" BOOLEAN NOT NULL DEFAULT false,
    "sensorMismatchDetected" BOOLEAN NOT NULL DEFAULT false,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "securityStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "reasonsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceSecuritySummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceSecuritySummary_punchId_key" ON "AttendanceSecuritySummary"("punchId");
CREATE INDEX IF NOT EXISTS "AttendanceSecuritySummary_userId_createdAt_idx" ON "AttendanceSecuritySummary"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AttendanceSecuritySummary_attendanceId_idx" ON "AttendanceSecuritySummary"("attendanceId");
CREATE INDEX IF NOT EXISTS "AttendanceSecuritySummary_securityStatus_idx" ON "AttendanceSecuritySummary"("securityStatus");
CREATE INDEX IF NOT EXISTS "AttendanceSecuritySummary_riskScore_idx" ON "AttendanceSecuritySummary"("riskScore");

CREATE TABLE IF NOT EXISTS "AttendanceSecurityEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "punchId" TEXT,
    "appInstallationId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL,
    "eventTimestamp" TIMESTAMP(3) NOT NULL,
    "serverTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT '',
    "vpnActive" BOOLEAN NOT NULL DEFAULT false,
    "riskWeight" INTEGER NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'SUPPORTING',
    "playIntegritySummary" TEXT NOT NULL DEFAULT '',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceSecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceSecurityEvent_eventId_key" ON "AttendanceSecurityEvent"("eventId");
CREATE INDEX IF NOT EXISTS "AttendanceSecurityEvent_userId_eventTimestamp_idx" ON "AttendanceSecurityEvent"("userId", "eventTimestamp");
CREATE INDEX IF NOT EXISTS "AttendanceSecurityEvent_attendanceId_eventTimestamp_idx" ON "AttendanceSecurityEvent"("attendanceId", "eventTimestamp");
CREATE INDEX IF NOT EXISTS "AttendanceSecurityEvent_punchId_idx" ON "AttendanceSecurityEvent"("punchId");
CREATE INDEX IF NOT EXISTS "AttendanceSecurityEvent_eventType_idx" ON "AttendanceSecurityEvent"("eventType");
CREATE INDEX IF NOT EXISTS "AttendanceSecurityEvent_appInstallationId_idx" ON "AttendanceSecurityEvent"("appInstallationId");
CREATE INDEX IF NOT EXISTS "AttendanceSecurityEvent_isMock_idx" ON "AttendanceSecurityEvent"("isMock");

CREATE TABLE IF NOT EXISTS "AttendanceLocationSample" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "punchId" TEXT,
    "appInstallationId" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'background',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "bearing" DOUBLE PRECISION,
    "provider" TEXT NOT NULL DEFAULT '',
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "locationTimestamp" TIMESTAMP(3) NOT NULL,
    "elapsedRealtimeNanos" TEXT NOT NULL DEFAULT '',
    "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vpnActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceLocationSample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceLocationSample_sampleId_key" ON "AttendanceLocationSample"("sampleId");
CREATE INDEX IF NOT EXISTS "AttendanceLocationSample_userId_locationTimestamp_idx" ON "AttendanceLocationSample"("userId", "locationTimestamp");
CREATE INDEX IF NOT EXISTS "AttendanceLocationSample_attendanceId_locationTimestamp_idx" ON "AttendanceLocationSample"("attendanceId", "locationTimestamp");
CREATE INDEX IF NOT EXISTS "AttendanceLocationSample_punchId_idx" ON "AttendanceLocationSample"("punchId");
CREATE INDEX IF NOT EXISTS "AttendanceLocationSample_isMock_idx" ON "AttendanceLocationSample"("isMock");
CREATE INDEX IF NOT EXISTS "AttendanceLocationSample_appInstallationId_idx" ON "AttendanceLocationSample"("appInstallationId");
