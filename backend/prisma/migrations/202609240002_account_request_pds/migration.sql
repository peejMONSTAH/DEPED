ALTER TABLE "account_creation_requests"
  ADD COLUMN "pds_original_file_name" TEXT,
  ADD COLUMN "pds_storage_path" TEXT,
  ADD COLUMN "pds_mime_type" TEXT,
  ADD COLUMN "pds_file_size" INTEGER;
