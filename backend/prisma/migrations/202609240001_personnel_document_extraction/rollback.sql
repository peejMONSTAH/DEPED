-- Apply only after the document extraction feature is no longer in use.
-- Existing OCR evidence will be lost if this rollback is executed.
ALTER TABLE "personnel_files"
  DROP COLUMN "ocr_error_message",
  DROP COLUMN "ocr_processed_at",
  DROP COLUMN "ocr_status",
  DROP COLUMN "ocr_confidence_score",
  DROP COLUMN "ocr_extracted_data_json";
