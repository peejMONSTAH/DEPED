ALTER TABLE "personnel_files"
  ADD COLUMN "ocr_extracted_data_json" JSONB,
  ADD COLUMN "ocr_confidence_score" DOUBLE PRECISION,
  ADD COLUMN "ocr_status" TEXT,
  ADD COLUMN "ocr_processed_at" TIMESTAMP(3),
  ADD COLUMN "ocr_error_message" TEXT;
