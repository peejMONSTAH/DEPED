-- Hardened Audit Trail Migration for Digital 201 (DepEd HRIS)
-- Adds canonical columns, integrity checksums, and performance query indexes to validation_logs
-- Reversible DDL: see rollback instructions below.

ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "severity" TEXT DEFAULT 'INFO';
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "outcome" TEXT DEFAULT 'SUCCESS';
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "action_label" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "target_type" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "target_id" INTEGER;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "target_reference" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "actor_email" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "actor_role" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "actor_station" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "client_source" TEXT DEFAULT 'web';
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "request_id" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "failure_reason" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "record_hash" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "previous_hash" TEXT;
ALTER TABLE "validation_logs" ADD COLUMN IF NOT EXISTS "hash_version" INTEGER;

-- Performance indexes for incident investigation and compliance filtering
CREATE INDEX IF NOT EXISTS "validation_logs_category_idx" ON "validation_logs"("category");
CREATE INDEX IF NOT EXISTS "validation_logs_severity_idx" ON "validation_logs"("severity");
CREATE INDEX IF NOT EXISTS "validation_logs_outcome_idx" ON "validation_logs"("outcome");
CREATE INDEX IF NOT EXISTS "validation_logs_action_idx" ON "validation_logs"("action");
CREATE INDEX IF NOT EXISTS "validation_logs_request_id_idx" ON "validation_logs"("request_id");
CREATE INDEX IF NOT EXISTS "validation_logs_target_type_target_id_idx" ON "validation_logs"("target_type", "target_id");

-- Conservative backfill for legacy records where details_json carries historical metadata
UPDATE "validation_logs"
SET "category" = COALESCE("category", CASE
      WHEN "action" ~* 'LOGIN|LOGOUT|PASSWORD|DEVICE|MAGIC_LOGIN' THEN 'Authentication'
      WHEN "action" ~* 'ACCESS_DENIED|FORBIDDEN|ROLE_|PRIVILEGE' THEN 'Roles and permissions'
      WHEN "action" ~* 'DOCUMENT|OCR|PDS_EXTRACTION' THEN 'Documents'
      WHEN "action" ~* 'TRANSACTION|VALIDAT|APPROV' THEN 'Transactions'
      WHEN "action" ~* 'PROMOTION|RANKING|CAR_' THEN 'Promotions and ranking'
      WHEN "action" ~* 'PERSONNEL|201_|PLANTILLA|SERVICE_RECORD' THEN 'Personnel records'
      WHEN "action" ~* 'REPORT|EXPORT' THEN 'Reports and exports'
      WHEN "action" ~* 'EMAIL|DELIVERY|NOTIFICATION' THEN 'Email and notification delivery'
      WHEN "action" ~* 'BACKUP|RESTORE' THEN 'Backup and recovery'
      ELSE 'System configuration'
    END),
    "severity" = CASE WHEN "status" = 'FAILED' THEN 'WARNING' ELSE 'INFO' END,
    "outcome"  = CASE
      WHEN "action" ~* 'DENIED|FORBIDDEN|REFUSED' THEN 'DENIED'
      WHEN "status" = 'FAILED' THEN 'FAILURE'
      ELSE 'SUCCESS'
    END
WHERE "category" IS NULL;

-- Compatibility guard for older write sites that still create the compact legacy row.
-- Canonical writers supply these values explicitly; this trigger only fills omissions.
CREATE OR REPLACE FUNCTION "validation_logs_fill_canonical_defaults"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."category" IS NULL THEN
    NEW."category" := CASE
      WHEN NEW."action" ~* 'LOGIN|LOGOUT|PASSWORD|DEVICE|MAGIC_LOGIN' THEN 'Authentication'
      WHEN NEW."action" ~* 'ACCESS_DENIED|FORBIDDEN|ROLE_|PRIVILEGE' THEN 'Roles and permissions'
      WHEN NEW."action" ~* 'DOCUMENT|OCR|PDS_EXTRACTION' THEN 'Documents'
      WHEN NEW."action" ~* 'TRANSACTION|VALIDAT|APPROV' THEN 'Transactions'
      WHEN NEW."action" ~* 'PROMOTION|RANKING|CAR_' THEN 'Promotions and ranking'
      WHEN NEW."action" ~* 'PERSONNEL|201_|PLANTILLA|SERVICE_RECORD' THEN 'Personnel records'
      WHEN NEW."action" ~* 'REPORT|EXPORT' THEN 'Reports and exports'
      WHEN NEW."action" ~* 'EMAIL|DELIVERY|NOTIFICATION' THEN 'Email and notification delivery'
      WHEN NEW."action" ~* 'BACKUP|RESTORE' THEN 'Backup and recovery'
      ELSE 'System configuration'
    END;
  END IF;
  NEW."target_type" := COALESCE(NEW."target_type", NEW."entity_type");
  NEW."target_id" := COALESCE(NEW."target_id", NEW."entity_id");
  IF NEW."status" = 'FAILED' AND NEW."outcome" = 'SUCCESS' THEN
    NEW."outcome" := CASE WHEN NEW."action" ~* 'DENIED|FORBIDDEN|REFUSED' THEN 'DENIED' ELSE 'FAILURE' END;
  END IF;
  IF NEW."status" = 'FAILED' AND NEW."severity" = 'INFO' THEN
    NEW."severity" := 'WARNING';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "validation_logs_canonical_defaults" ON "validation_logs";
CREATE TRIGGER "validation_logs_canonical_defaults"
BEFORE INSERT ON "validation_logs"
FOR EACH ROW EXECUTE FUNCTION "validation_logs_fill_canonical_defaults"();

/*
-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To safely roll back this migration without losing primary log records:

DROP TRIGGER IF EXISTS "validation_logs_canonical_defaults" ON "validation_logs";
DROP FUNCTION IF EXISTS "validation_logs_fill_canonical_defaults"();

DROP INDEX IF EXISTS "validation_logs_target_type_target_id_idx";
DROP INDEX IF EXISTS "validation_logs_request_id_idx";
DROP INDEX IF EXISTS "validation_logs_action_idx";
DROP INDEX IF EXISTS "validation_logs_outcome_idx";
DROP INDEX IF EXISTS "validation_logs_severity_idx";
DROP INDEX IF EXISTS "validation_logs_category_idx";

ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "hash_version";

ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "previous_hash";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "record_hash";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "failure_reason";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "request_id";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "client_source";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "actor_station";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "actor_role";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "actor_email";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "target_reference";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "target_id";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "target_type";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "action_label";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "outcome";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "severity";
ALTER TABLE "validation_logs" DROP COLUMN IF EXISTS "category";
*/
