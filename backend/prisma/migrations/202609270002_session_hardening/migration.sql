-- Session limits: idle tracking per refresh token, and which client holds it.
-- Existing sessions are marked "app" so the deploy does not sign anyone out;
-- every session issued from now on records its real client.
ALTER TABLE "refresh_tokens" ADD COLUMN "client" TEXT NOT NULL DEFAULT 'app';
ALTER TABLE "refresh_tokens" ALTER COLUMN "client" SET DEFAULT 'web';
ALTER TABLE "refresh_tokens" ADD COLUMN "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Refresh tokens are stored as SHA-256 hashes from now on. Existing ones are
-- hashed in place, so current sessions keep working.
UPDATE "refresh_tokens" SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex');

-- Lookups that every page load or list performs.
CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");
CREATE INDEX IF NOT EXISTS "transactions_personnel_id_idx" ON "transactions"("personnel_id");
CREATE INDEX IF NOT EXISTS "transactions_status_idx" ON "transactions"("status");
CREATE INDEX IF NOT EXISTS "promotion_applications_promotion_cycle_id_idx" ON "promotion_applications"("promotion_cycle_id");
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
