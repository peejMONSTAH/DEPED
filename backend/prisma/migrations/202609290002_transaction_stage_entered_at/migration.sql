-- When a transaction entered its current status. Nullable and additive, so the
-- running app keeps working before and after deploy.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "stage_entered_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Best evidence for existing rows: the date that started the current stage.
UPDATE "transactions" SET "stage_entered_at" = CASE
  WHEN "status" = 'FOR_APPROVAL' THEN COALESCE("validation_date", "submission_date", "updated_at")
  WHEN "status" = 'PENDING_VALIDATION' THEN COALESCE("submission_date", "updated_at")
  WHEN "status" IN ('APPROVED', 'COMPLETED', 'REJECTED') THEN COALESCE("approval_date", "validation_date", "updated_at")
  ELSE "updated_at"
END;

CREATE INDEX IF NOT EXISTS "transactions_status_stage_entered_at_idx" ON "transactions"("status", "stage_entered_at");
