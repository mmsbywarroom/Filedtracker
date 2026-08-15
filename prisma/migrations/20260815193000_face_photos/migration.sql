-- AlterTable
ALTER TABLE "User" ADD COLUMN "faceImage" TEXT;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN "punchInFace" TEXT;
ALTER TABLE "Attendance" ADD COLUMN "punchOutFace" TEXT;
