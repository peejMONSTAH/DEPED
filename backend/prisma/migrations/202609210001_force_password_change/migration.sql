-- Accounts created or reset by an administrator must set their own password
-- before they can use the system. Existing rows default to false so nobody
-- already working is locked out by the deploy.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
