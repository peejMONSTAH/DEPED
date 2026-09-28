-- Evidence reported by backup and restore-drill jobs. The application reads
-- status from here; it never infers success from files existing.
-- Rollback: DROP TABLE "backup_runs"; (no other table references it)
CREATE TABLE "backup_runs" (
    "id" SERIAL NOT NULL,
    "run_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "size_bytes" BIGINT,
    "encrypted" BOOLEAN,
    "manifest_verified" BOOLEAN,
    "missing_objects" INTEGER,
    "object_count" INTEGER,
    "retention_days" INTEGER,
    "error" TEXT,
    "source" TEXT,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "backup_runs_run_key_key" ON "backup_runs"("run_key");
CREATE INDEX "backup_runs_kind_reported_at_idx" ON "backup_runs"("kind", "reported_at");
