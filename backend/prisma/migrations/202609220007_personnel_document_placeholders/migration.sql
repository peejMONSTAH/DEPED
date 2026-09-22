-- Rebuild PersonnelDocumentStatus enum so new values can be referenced immediately
ALTER TABLE "personnel_files" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "PersonnelDocumentStatus" RENAME TO "PersonnelDocumentStatus_old";
CREATE TYPE "PersonnelDocumentStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REPLACEMENT_REQUIRED');
ALTER TABLE "personnel_files" ALTER COLUMN "status" TYPE "PersonnelDocumentStatus" USING "status"::text::"PersonnelDocumentStatus";
DROP TYPE "PersonnelDocumentStatus_old";
ALTER TABLE "personnel_files" ALTER COLUMN "status" SET DEFAULT 'NOT_SUBMITTED';

-- AlterTable: make file columns nullable in personnel_files and add is_required
ALTER TABLE "personnel_files" ALTER COLUMN "original_file_name" DROP NOT NULL;
ALTER TABLE "personnel_files" ALTER COLUMN "stored_file_name" DROP NOT NULL;
ALTER TABLE "personnel_files" ALTER COLUMN "storage_path" DROP NOT NULL;
ALTER TABLE "personnel_files" ALTER COLUMN "mime_type" DROP NOT NULL;
ALTER TABLE "personnel_files" ALTER COLUMN "file_size" DROP NOT NULL;

ALTER TABLE "personnel_files" ADD COLUMN IF NOT EXISTS "is_required" BOOLEAN NOT NULL DEFAULT true;
