-- CreateTable
CREATE TABLE "Rally" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rally_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RallyUser" (
    "id" TEXT NOT NULL,
    "rallyId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "acName" TEXT NOT NULL,
    "villageWard" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL DEFAULT '',
    "pocName" TEXT NOT NULL DEFAULT '',
    "pocNumber" TEXT NOT NULL DEFAULT '',
    "vehicleType" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RallyUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RallyCheckin" (
    "id" TEXT NOT NULL,
    "rallyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "photo" TEXT NOT NULL,
    "headCount" INTEGER NOT NULL DEFAULT 0,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "etaSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RallyCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RallyUser_phone_key" ON "RallyUser"("phone");

-- CreateIndex
CREATE INDEX "RallyUser_rallyId_idx" ON "RallyUser"("rallyId");

-- CreateIndex
CREATE INDEX "RallyUser_zone_district_acName_idx" ON "RallyUser"("zone", "district", "acName");

-- CreateIndex
CREATE INDEX "RallyCheckin_rallyId_startedAt_idx" ON "RallyCheckin"("rallyId", "startedAt");

-- CreateIndex
CREATE INDEX "RallyCheckin_userId_startedAt_idx" ON "RallyCheckin"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "RallyUser" ADD CONSTRAINT "RallyUser_rallyId_fkey" FOREIGN KEY ("rallyId") REFERENCES "Rally"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RallyCheckin" ADD CONSTRAINT "RallyCheckin_rallyId_fkey" FOREIGN KEY ("rallyId") REFERENCES "Rally"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RallyCheckin" ADD CONSTRAINT "RallyCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RallyUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
