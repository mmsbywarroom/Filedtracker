CREATE TABLE IF NOT EXISTS "CallContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CallContact_phone_key" ON "CallContact"("phone");

CREATE TABLE IF NOT EXISTS "CallAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CallAssignment_userId_contactId_key" ON "CallAssignment"("userId", "contactId");
CREATE INDEX IF NOT EXISTS "CallAssignment_userId_idx" ON "CallAssignment"("userId");
CREATE INDEX IF NOT EXISTS "CallAssignment_contactId_idx" ON "CallAssignment"("contactId");

CREATE TABLE IF NOT EXISTS "CallOutcome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CallOutcome_userId_contactId_key" ON "CallOutcome"("userId", "contactId");
CREATE INDEX IF NOT EXISTS "CallOutcome_userId_idx" ON "CallOutcome"("userId");

DO $$ BEGIN
  ALTER TABLE "CallAssignment" ADD CONSTRAINT "CallAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallAssignment" ADD CONSTRAINT "CallAssignment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CallContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallOutcome" ADD CONSTRAINT "CallOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallOutcome" ADD CONSTRAINT "CallOutcome_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CallContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
