ALTER TABLE promotion_applications ADD COLUMN assigned_transaction_id INTEGER REFERENCES transactions(id), ADD COLUMN applicant_number TEXT;
CREATE UNIQUE INDEX promotion_applications_applicant_number_key ON promotion_applications(applicant_number);
UPDATE promotion_applications p SET assigned_transaction_id = t.id FROM transactions t
WHERE p.score_details_json->>'transactionId' = t.id::text AND p.personnel_id = t.personnel_id;

CREATE TABLE personnel_files (
 id SERIAL PRIMARY KEY, personnel_id INTEGER NOT NULL REFERENCES personnel(id), payload JSONB NOT NULL,
 deleted_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX personnel_files_personnel_id_idx ON personnel_files(personnel_id);
CREATE TABLE document_revisions (
 id TEXT PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES uploaded_documents(id), snapshot JSONB NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX document_revisions_document_id_idx ON document_revisions(document_id);
CREATE TABLE workflow_outbox (
 id TEXT PRIMARY KEY, event_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, payload JSONB NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 processed_at TIMESTAMP(3), last_error TEXT, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX workflow_outbox_processed_at_available_at_idx ON workflow_outbox(processed_at, available_at);
