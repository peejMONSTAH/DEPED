-- Reverses 202609230001_canonical_station_identity. Prisma never runs this file.
--
-- 1. Deploy the previous application release first; it works against both
--    schemas, so there is no window where the running code and the columns
--    disagree.
-- 2. Run this file in one session: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f rollback.sql
--
-- It also removes the migration's row from _prisma_migrations, in the same
-- transaction, so Prisma sees the migration as never applied. (`prisma migrate
-- resolve --rolled-back` refuses a migration that succeeded: P3012.) Deploying
-- this release again re-applies it.
--
-- Only rows whose station has not been edited since the migration are restored
-- to their original bytes. A station an administrator has changed since then
-- is kept as it is now, not overwritten with the pre-migration value.

BEGIN;

DROP TRIGGER IF EXISTS personnel_canonical_station ON personnel;
DROP FUNCTION IF EXISTS canonicalize_personnel_station();

ALTER TABLE personnel ALTER COLUMN school TYPE text;
ALTER TABLE personnel ALTER COLUMN district TYPE text;

UPDATE personnel p
SET school = b.school
FROM migration_backup.station_identity_202609230001 b
WHERE b.personnel_id = p.id
  AND p.school IS NOT DISTINCT FROM NULLIF(btrim(regexp_replace(b.school, '[ \t\n\r\f\v]+', ' ', 'g')), '');

UPDATE personnel p
SET district = b.district
FROM migration_backup.station_identity_202609230001 b
WHERE b.personnel_id = p.id
  AND p.district IS NOT DISTINCT FROM NULLIF(btrim(regexp_replace(b.district, '[ \t\n\r\f\v]+', ' ', 'g')), '');

DROP TABLE migration_backup.station_identity_202609230001;

-- The schema is shared with any later migration backup; drop it only when empty.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'migration_backup') THEN
    DROP SCHEMA migration_backup;
  END IF;
END $$;

-- citext stays: users.email and account_creation_requests.email use it.

DELETE FROM _prisma_migrations WHERE migration_name = '202609230001_canonical_station_identity';

COMMIT;
