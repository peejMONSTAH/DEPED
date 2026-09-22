-- Make the database agree with the application about what "the same email" is.
--
-- Every lookup in the codebase compares email case-insensitively -- login,
-- the duplicate-account guard, the duplicate account-request guard -- but the
-- unique index was plain text and therefore case-SENSITIVE. Two consequences:
--
--   1. Juan@deped.gov.ph and juan@deped.gov.ph could both exist as separate
--      accounts, while every guard in the code believed they were one address.
--      findFirst then returned whichever the planner reached first, so which
--      account a person signed into was not deterministic.
--
--   2. Prisma's `mode: 'insensitive'` compiles to ILIKE, which cannot use
--      users_email_key. Every sign-in sequentially scanned the users table.
--
-- citext resolves both at once: comparison is case-insensitive, so the unique
-- index now genuinely forbids case-variant duplicates, and a plain equality
-- lookup matches any case *while still using the index*.

CREATE EXTENSION IF NOT EXISTS citext;

-- If case-variant duplicates already exist, the unique index cannot be rebuilt
-- over citext. Fail here with the list rather than half-way through the ALTER.
-- If the guard below fires, this migration is rolled back in full: nothing in
-- it is applied and no data is touched. Prisma then records it as failed and
-- refuses further deploys with P3009 until you clear it. The recovery is:
--
--   1. run the query the error prints, and correct those rows
--   2. npx prisma migrate resolve --rolled-back <this migration name>
--   3. npx prisma migrate deploy

DO $$
DECLARE
  collisions integer;
BEGIN
  SELECT count(*) INTO collisions
  FROM (SELECT lower(email) FROM users GROUP BY 1 HAVING count(*) > 1) AS d;

  IF collisions > 0 THEN
    RAISE EXCEPTION
      'Refusing to make users.email case-insensitive: % address(es) are held by more than one account once case is ignored. Merge or rename them first. List them with: SELECT lower(email) AS address, count(*), array_agg(id) AS user_ids FROM users GROUP BY 1 HAVING count(*) > 1;',
      collisions;
  END IF;
END $$;

ALTER TABLE "users" ALTER COLUMN "email" TYPE citext;

-- The account-request queue is checked against the same addresses, so it has
-- to answer "is this the same person" the same way.
ALTER TABLE "account_creation_requests" ALTER COLUMN "email" TYPE citext;
