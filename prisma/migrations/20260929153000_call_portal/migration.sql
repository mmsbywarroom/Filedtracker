ALTER TABLE "CallContact" ADD COLUMN IF NOT EXISTS "block" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CallContact" ADD COLUMN IF NOT EXISTS "age" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CallContact" ADD COLUMN IF NOT EXISTS "gender" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CallContact" ADD COLUMN IF NOT EXISTS "education" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CallContact" ADD COLUMN IF NOT EXISTS "position" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CallContact" ADD COLUMN IF NOT EXISTS "fatherName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CallContact" ADD COLUMN IF NOT EXISTS "assigneePhone" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "CallContact_assigneePhone_idx" ON "CallContact"("assigneePhone");

CREATE TABLE IF NOT EXISTS "CallForm" (
    "id" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL DEFAULT 'Booth Member Verification',
    "openingScript" TEXT NOT NULL DEFAULT '',
    "closingScript" TEXT NOT NULL DEFAULT '',
    "questions" JSONB NOT NULL,
    "statuses" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallForm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CallPortalResponse" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "callerPhone" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT '',
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallPortalResponse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CallPortalResponse_contactId_createdAt_idx" ON "CallPortalResponse"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "CallPortalResponse_callerPhone_idx" ON "CallPortalResponse"("callerPhone");

DO $$ BEGIN
  ALTER TABLE "CallPortalResponse" ADD CONSTRAINT "CallPortalResponse_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CallContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
