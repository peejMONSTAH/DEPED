CREATE TABLE "trusted_devices" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token_hash" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "trusted_devices_token_hash_key" ON "trusted_devices"("token_hash");
CREATE INDEX "trusted_devices_user_id_idx" ON "trusted_devices"("user_id");

CREATE TABLE "login_challenges" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token_hash" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "ip_address" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "login_challenges_token_hash_key" ON "login_challenges"("token_hash");
CREATE INDEX "login_challenges_user_id_idx" ON "login_challenges"("user_id");
