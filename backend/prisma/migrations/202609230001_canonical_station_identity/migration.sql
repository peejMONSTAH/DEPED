-- Station identity becomes an exact, case-insensitive key.
--
-- AO II authorization compares an officer's personnel.school with the school
-- of every record they reach. That comparison was written as Prisma's `equals`
-- with `mode: 'insensitive'`, which compiles to ILIKE -- a pattern match, where
-- `_` matches any one character and `%` any run of characters. A station value
-- of "M%" reached both Morales and Matulas. Stored values were also not
-- trimmed consistently (202609200002 copied plantilla departments verbatim), so
-- a list query and a single-record check could disagree about the same row.
--
-- citext makes a plain `=` case-insensitive and exact -- no wildcards, no
-- prefixes, no substrings -- while still using personnel_school_idx, the same
-- reasoning as 202609220004 for users.email. A trigger canonicalises
-- whitespace on every write, whichever code path or tool performs it, so both
-- sides of the comparison are always in one form.
--
-- The previous application release runs unchanged against this schema: its
-- ILIKE comparisons work on citext. To reverse the migration itself, run
-- rollback.sql in this directory. It restores TEXT columns and the exact
-- original value of every row this migration rewrote, which are kept in the
-- migration_backup schema -- outside `public`, so Prisma does not report the
-- backup table as schema drift or try to drop it.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS migration_backup;

-- A table left behind by a reset of `public` describes a different database.
DROP TABLE IF EXISTS migration_backup.station_identity_202609230001;
CREATE TABLE migration_backup.station_identity_202609230001 (
  personnel_id integer PRIMARY KEY,
  school text,
  district text,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

-- The same rule as normalizeStationName() in src/utils/scope.util.ts.
INSERT INTO migration_backup.station_identity_202609230001 (personnel_id, school, district)
SELECT id, school, district
FROM personnel
WHERE school IS DISTINCT FROM NULLIF(btrim(regexp_replace(school, '[ \t\n\r\f\v]+', ' ', 'g')), '')
   OR district IS DISTINCT FROM NULLIF(btrim(regexp_replace(district, '[ \t\n\r\f\v]+', ' ', 'g')), '');

UPDATE personnel
SET school = NULLIF(btrim(regexp_replace(school, '[ \t\n\r\f\v]+', ' ', 'g')), ''),
    district = NULLIF(btrim(regexp_replace(district, '[ \t\n\r\f\v]+', ' ', 'g')), '')
WHERE id IN (SELECT personnel_id FROM migration_backup.station_identity_202609230001);

DO $$
DECLARE
  rewritten integer;
BEGIN
  SELECT count(*) INTO rewritten FROM migration_backup.station_identity_202609230001;
  IF rewritten > 0 THEN
    RAISE NOTICE
      '% personnel record(s) had untrimmed or empty station values. They were normalised; originals are in migration_backup.station_identity_202609230001.',
      rewritten;
  END IF;
END $$;

ALTER TABLE personnel ALTER COLUMN school TYPE citext;
ALTER TABLE personnel ALTER COLUMN district TYPE citext;

CREATE OR REPLACE FUNCTION canonicalize_personnel_station() RETURNS trigger AS $$
BEGIN
  NEW.school := NULLIF(btrim(regexp_replace(NEW.school, '[ \t\n\r\f\v]+', ' ', 'g')), '');
  NEW.district := NULLIF(btrim(regexp_replace(NEW.district, '[ \t\n\r\f\v]+', ' ', 'g')), '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personnel_canonical_station
BEFORE INSERT OR UPDATE OF school, district ON personnel
FOR EACH ROW EXECUTE FUNCTION canonicalize_personnel_station();
