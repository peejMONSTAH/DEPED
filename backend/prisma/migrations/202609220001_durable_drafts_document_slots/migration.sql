-- Preserve existing data. If duplicate slots exist, resolve them with their
-- revisions and dependent records intact before deploying this constraint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM uploaded_documents
    GROUP BY transaction_id, requirement_template_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate transaction document slots exist. Review uploaded_documents grouped by transaction_id, requirement_template_id before deploying; no records have been deleted.';
  END IF;
END $$;

CREATE UNIQUE INDEX "uploaded_documents_transaction_id_requirement_template_id_key"
  ON "uploaded_documents" ("transaction_id", "requirement_template_id");

CREATE TABLE "form_drafts" (
  "transaction_id" INTEGER NOT NULL,
  "template_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "form_drafts_pkey" PRIMARY KEY ("transaction_id", "template_id"),
  CONSTRAINT "form_drafts_transaction_id_fkey" FOREIGN KEY ("transaction_id")
    REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
