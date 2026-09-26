-- Existing accounts are exempt (false); accounts created from now on get the check.
ALTER TABLE "users" ADD COLUMN "device_verification" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ALTER COLUMN "device_verification" SET DEFAULT true;
