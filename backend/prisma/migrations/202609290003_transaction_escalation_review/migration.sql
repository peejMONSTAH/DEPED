-- Escalation after repeated corrections (BR-27): when it happened and when HRMO
-- reviewed it. Nullable and additive; safe while the app is running.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "escalated_at" TIMESTAMP(3);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "escalation_reviewed_at" TIMESTAMP(3);

-- Transactions already escalated under the old rule (marked by the escalation
-- remark) are recorded as escalated so HRMO sees the correct next step.
UPDATE "transactions" SET "escalated_at" = COALESCE("submission_date", "updated_at")
WHERE "status" = 'FOR_APPROVAL' AND "remarks" LIKE 'Escalated to HRMO after three correction cycles%' AND "escalated_at" IS NULL;
