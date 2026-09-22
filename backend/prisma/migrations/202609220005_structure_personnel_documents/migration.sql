-- Give the Digital 201 file real columns.
--
-- personnel_files held every document as one JSONB `payload`. The shape was
-- declared in TypeScript (PersonnelDocumentRecord, 18 fields) and enforced
-- nowhere, so the database could not:
--
--   * reject a documentTypeId that is not in the catalogue,
--   * reject a status outside the workflow -- it was a free string,
--   * reject a file with no storage path, a negative size or a missing name,
--   * or answer "which PRC licences and NBI clearances expire next month"
--     without reading and parsing every row in the table.
--
-- That last one is the single most ordinary question an HR office asks about
-- a 201 file, and it was the one shape the storage could not answer.
--
-- The wire format is unchanged: personnel-documents.controller.ts serialises
-- these columns back into exactly the JSON the web and mobile clients already
-- parse, so no client release is required alongside this migration.

CREATE TYPE "PersonnelDocumentStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- ---------------------------------------------------------------------------
-- Refuse to proceed on data that cannot be represented, naming the rows.
-- A backfill that quietly drops what it cannot parse is worse than no backfill.
-- ---------------------------------------------------------------------------
-- If the guard below fires, this migration is rolled back in full: nothing in
-- it is applied and no data is touched. Prisma then records it as failed and
-- refuses further deploys with P3009 until you clear it. The recovery is:
--
--   1. run the query the error prints, and correct those rows
--   2. npx prisma migrate resolve --rolled-back <this migration name>
--   3. npx prisma migrate deploy

DO $$
DECLARE
  bad_ids integer[];
BEGIN
  -- Required fields must be present and non-empty.
  SELECT array_agg(id) INTO bad_ids FROM personnel_files
  WHERE coalesce(payload->>'documentTypeId', '') = ''
     OR coalesce(payload->>'documentTypeName', '') = ''
     OR coalesce(payload->>'originalFileName', '') = ''
     OR coalesce(payload->>'storagePath', '') = ''
     OR coalesce(payload->>'mimeType', '') = ''
     OR payload->>'fileSize' IS NULL;
  IF bad_ids IS NOT NULL THEN
    RAISE EXCEPTION 'personnel_files rows % are missing a required field (documentTypeId, documentTypeName, originalFileName, storagePath, mimeType or fileSize). Inspect them with: SELECT id, payload FROM personnel_files WHERE id = ANY(''%'');', bad_ids, bad_ids;
  END IF;

  -- fileSize must be a number.
  SELECT array_agg(id) INTO bad_ids FROM personnel_files
  WHERE payload->>'fileSize' !~ '^[0-9]+$';
  IF bad_ids IS NOT NULL THEN
    RAISE EXCEPTION 'personnel_files rows % hold a non-numeric fileSize.', bad_ids;
  END IF;

  -- Dates are written straight from the request body without validation, so
  -- anything could be in there. Accept an ISO date or an ISO timestamp.
  SELECT array_agg(id) INTO bad_ids FROM personnel_files
  WHERE (nullif(btrim(payload->>'issueDate'), '') IS NOT NULL
         AND left(btrim(payload->>'issueDate'), 10) !~ '^\d{4}-\d{2}-\d{2}$')
     OR (nullif(btrim(payload->>'expirationDate'), '') IS NOT NULL
         AND left(btrim(payload->>'expirationDate'), 10) !~ '^\d{4}-\d{2}-\d{2}$');
  IF bad_ids IS NOT NULL THEN
    RAISE EXCEPTION 'personnel_files rows % hold an issueDate or expirationDate that is not an ISO date. Correct or clear them before migrating: SELECT id, payload->>''issueDate'', payload->>''expirationDate'' FROM personnel_files WHERE id = ANY(''%'');', bad_ids, bad_ids;
  END IF;

  -- Status must be a value the workflow recognises. The aliases below are the
  -- ones the mobile client already folds together in its own parser.
  SELECT array_agg(id) INTO bad_ids FROM personnel_files
  WHERE upper(coalesce(payload->>'status', 'SUBMITTED')) NOT IN
    ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'VERIFIED', 'VALIDATED',
     'REJECTED', 'DEFICIENT', 'EXPIRED');
  IF bad_ids IS NOT NULL THEN
    RAISE EXCEPTION 'personnel_files rows % hold an unrecognised status.', bad_ids;
  END IF;

  -- reviewedAt is cast to a timestamp below. Check it first, so a bad value
  -- names its rows instead of aborting the migration with a driver error.
  SELECT array_agg(id) INTO bad_ids FROM personnel_files
  WHERE nullif(btrim(coalesce(payload->>'reviewedAt', '')), '') IS NOT NULL
    AND nullif(btrim(payload->>'reviewedAt'), '') !~ '^\d{4}-\d{2}-\d{2}[T ]';
  IF bad_ids IS NOT NULL THEN
    RAISE EXCEPTION 'personnel_files rows % hold a reviewedAt that is not a timestamp. Correct or clear them with: SELECT id, payload->>''reviewedAt'' FROM personnel_files WHERE id = ANY(''%'');', bad_ids, bad_ids;
  END IF;

  -- reviewedBy was a display name, not an id, so it cannot be resolved to a
  -- user. Nothing has ever written it; fail rather than discard it if it has.
  SELECT array_agg(id) INTO bad_ids FROM personnel_files
  WHERE nullif(btrim(coalesce(payload->>'reviewedBy', '')), '') IS NOT NULL;
  IF bad_ids IS NOT NULL THEN
    RAISE EXCEPTION 'personnel_files rows % record a reviewer name that cannot be resolved to a user id. Map them manually before migrating.', bad_ids;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Columns, nullable for the moment so the backfill can run.
-- ---------------------------------------------------------------------------
ALTER TABLE "personnel_files"
  ADD COLUMN "document_type_id"     TEXT,
  ADD COLUMN "document_type_name"   TEXT,
  ADD COLUMN "original_file_name"   TEXT,
  ADD COLUMN "stored_file_name"     TEXT,
  ADD COLUMN "storage_path"         TEXT,
  ADD COLUMN "mime_type"            TEXT,
  ADD COLUMN "file_size"            INTEGER,
  ADD COLUMN "issue_date"           DATE,
  ADD COLUMN "expiration_date"      DATE,
  ADD COLUMN "remarks"              TEXT,
  ADD COLUMN "status"               "PersonnelDocumentStatus" NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN "rejection_reason"     TEXT,
  ADD COLUMN "reviewed_at"          TIMESTAMP(3),
  ADD COLUMN "reviewed_by_user_id"  INTEGER,
  ADD COLUMN "replaces_document_id" INTEGER,
  ADD COLUMN "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "personnel_files" SET
  "document_type_id"   = payload->>'documentTypeId',
  "document_type_name" = payload->>'documentTypeName',
  "original_file_name" = payload->>'originalFileName',
  -- storedFileName was derived from the storage path at upload; recompute it
  -- for any row where it was not recorded.
  "stored_file_name"   = coalesce(
                           nullif(btrim(coalesce(payload->>'storedFileName', '')), ''),
                           regexp_replace(payload->>'storagePath', '^.*/', '')
                         ),
  "storage_path"       = payload->>'storagePath',
  "mime_type"          = payload->>'mimeType',
  "file_size"          = (payload->>'fileSize')::integer,
  "issue_date"         = left(nullif(btrim(payload->>'issueDate'), ''), 10)::date,
  "expiration_date"    = left(nullif(btrim(payload->>'expirationDate'), ''), 10)::date,
  "remarks"            = nullif(btrim(coalesce(payload->>'remarks', '')), ''),
  "status"             = CASE upper(coalesce(payload->>'status', 'SUBMITTED'))
                           WHEN 'UNDER_REVIEW' THEN 'UNDER_REVIEW'
                           WHEN 'APPROVED'  THEN 'APPROVED'
                           WHEN 'VERIFIED'  THEN 'APPROVED'
                           WHEN 'VALIDATED' THEN 'APPROVED'
                           WHEN 'REJECTED'  THEN 'REJECTED'
                           WHEN 'DEFICIENT' THEN 'REJECTED'
                           -- PENDING and EXPIRED were never stored states.
                           -- Expiry is derived from expiration_date, so it does
                           -- not need -- and must not have -- a column of its own.
                           ELSE 'SUBMITTED'
                         END::"PersonnelDocumentStatus",
  "rejection_reason"   = nullif(btrim(coalesce(payload->>'rejectionReason', '')), ''),
  "reviewed_at"        = nullif(btrim(coalesce(payload->>'reviewedAt', '')), '')::timestamp(3),
  "replaces_document_id" = nullif(btrim(coalesce(payload->>'replacesDocumentId', '')), '')::integer,
  -- created_at was set by the column default at insert; payload.uploadedAt was
  -- taken a moment earlier in the same request. Prefer the recorded value so
  -- the timestamp the clients have already displayed does not shift.
  "created_at"         = coalesce(
                           nullif(btrim(coalesce(payload->>'uploadedAt', '')), '')::timestamp(3),
                           created_at
                         ),
  "updated_at"         = coalesce(
                           nullif(btrim(coalesce(payload->>'updatedAt', '')), '')::timestamp(3),
                           nullif(btrim(coalesce(payload->>'uploadedAt', '')), '')::timestamp(3),
                           created_at
                         );

-- A replacement must point at a real earlier document.
DO $$
DECLARE
  dangling integer[];
BEGIN
  SELECT array_agg(f.id) INTO dangling
  FROM personnel_files f
  WHERE f.replaces_document_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM personnel_files t WHERE t.id = f.replaces_document_id);
  IF dangling IS NOT NULL THEN
    RAISE NOTICE 'personnel_files rows % named a replaced document that no longer exists; the reference has been cleared.', dangling;
    UPDATE personnel_files f SET replaces_document_id = NULL
    WHERE f.id = ANY(dangling);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Lock the shape in.
-- ---------------------------------------------------------------------------
ALTER TABLE "personnel_files"
  ALTER COLUMN "document_type_id"   SET NOT NULL,
  ALTER COLUMN "document_type_name" SET NOT NULL,
  ALTER COLUMN "original_file_name" SET NOT NULL,
  ALTER COLUMN "stored_file_name"   SET NOT NULL,
  ALTER COLUMN "storage_path"       SET NOT NULL,
  ALTER COLUMN "mime_type"          SET NOT NULL,
  ALTER COLUMN "file_size"          SET NOT NULL,
  ALTER COLUMN "updated_at"         DROP DEFAULT;

ALTER TABLE "personnel_files" DROP COLUMN "payload";

ALTER TABLE "personnel_files"
  ADD CONSTRAINT "personnel_files_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "personnel_files"
  ADD CONSTRAINT "personnel_files_replaces_document_id_fkey"
  FOREIGN KEY ("replaces_document_id") REFERENCES "personnel_files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The listing always filters on both columns together.
DROP INDEX IF EXISTS "personnel_files_personnel_id_idx";
CREATE INDEX "personnel_files_personnel_id_deleted_at_idx"
  ON "personnel_files" ("personnel_id", "deleted_at");

-- The question the JSONB store could not answer.
CREATE INDEX "personnel_files_expiration_date_idx"
  ON "personnel_files" ("expiration_date");
