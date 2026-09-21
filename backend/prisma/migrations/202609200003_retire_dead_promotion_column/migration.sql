-- promotion_applications.assigned_transaction_id was added by 202609200001_workflow_integrity
-- and backfilled, but no code has ever read or written it: a promotion's documents are
-- attached through the Digital 201 store (personnel_files), not through a linked transaction.
--
-- Dropping it removes a foreign key that suggests a relationship the system does not have.
ALTER TABLE "promotion_applications" DROP CONSTRAINT IF EXISTS "promotion_applications_assigned_transaction_id_fkey";
ALTER TABLE "promotion_applications" DROP COLUMN IF EXISTS "assigned_transaction_id";
