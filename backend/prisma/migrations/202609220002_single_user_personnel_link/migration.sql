-- One link between an account and its personnel record, not two.
--
-- users.personnel_id and personnel.user_id both described the same 1:1
-- relationship and nothing kept them in step. users.controller.ts wrote the
-- pair as three separate statements, and one path -- linking a NEW account to
-- an EXISTING personnel record -- wrote only the users side, leaving
-- personnel.user_id naming the previous account.
--
-- That matters because authorization reads this link: req.user.personnelId
-- decides whose 201 file, transactions and promotion applications an account
-- can see. Two columns that can disagree is two answers to "whose records are
-- these".
--
-- personnel.user_id survives: it is NOT NULL and UNIQUE, so every personnel
-- record already names exactly one account, which is the stronger guarantee.

-- Refuse to drop the column while the two sides disagree. Dropping it then
-- would not resolve the conflict, it would pick a winner by accident.
-- If the guard below fires, this migration is rolled back in full: nothing in
-- it is applied and no data is touched. Prisma then records it as failed and
-- refuses further deploys with P3009 until you clear it. The recovery is:
--
--   1. run the query the error prints, and correct those rows
--   2. npx prisma migrate resolve --rolled-back <this migration name>
--   3. npx prisma migrate deploy

DO $$
DECLARE
  mismatched integer;
BEGIN
  SELECT count(*) INTO mismatched
  FROM users u
  JOIN personnel p ON p.id = u.personnel_id
  WHERE p.user_id <> u.id;

  IF mismatched > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop users.personnel_id: % account(s) point at a personnel record that points back at a different account. Dropping the column would silently choose one side. List them with: SELECT u.id AS user_id, u.email, u.personnel_id, p.user_id AS personnel_points_at FROM users u JOIN personnel p ON p.id = u.personnel_id WHERE p.user_id <> u.id;',
      mismatched;
  END IF;
END $$;

-- Accounts whose personnel record named them but which had a NULL
-- personnel_id were locked out of their own 201 file, because authorization
-- read the empty side. Dropping the column repairs them; say how many.
DO $$
DECLARE
  repaired integer;
BEGIN
  SELECT count(*) INTO repaired
  FROM personnel p
  JOIN users u ON u.id = p.user_id
  WHERE u.personnel_id IS NULL;

  IF repaired > 0 THEN
    RAISE NOTICE
      '% account(s) had a personnel record that named them while their own personnel_id was empty. They could not reach their 201 file; the single link restores access.',
      repaired;
  END IF;
END $$;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_personnel_id_fkey";
DROP INDEX IF EXISTS "users_personnel_id_key";
ALTER TABLE "users" DROP COLUMN "personnel_id";
