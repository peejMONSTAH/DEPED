-- ============================================================
-- Remove RECORDS_PERSONNEL role and the archiving subsystem
-- (ArchivedRecord table + ARCHIVED status) — workflow now ends
-- at HRMO approval.
-- ============================================================

-- 1. Drop archived_records table and its sequence
DROP TABLE IF EXISTS public.archived_records;
DROP SEQUENCE IF EXISTS public.archived_records_id_seq;

-- 2. Delete any users holding the RECORDS_PERSONNEL role, plus pending
--    account-creation requests for that role, then the role row itself
DELETE FROM public.users
WHERE role_id IN (SELECT id FROM public.roles WHERE name = 'RECORDS_PERSONNEL');

DELETE FROM public.account_creation_requests
WHERE role = 'RECORDS_PERSONNEL';

DELETE FROM public.roles
WHERE name = 'RECORDS_PERSONNEL';

-- 3. Remove RECORDS_PERSONNEL from the UserRole enum (Postgres 12+)
ALTER TYPE public."UserRole" DROP VALUE IF EXISTS 'RECORDS_PERSONNEL';

-- 4. Re-map any ARCHIVED transactions to COMPLETED before dropping the value
UPDATE public.transactions
SET status = 'COMPLETED'
WHERE status = 'ARCHIVED';

ALTER TYPE public."TransactionStatus" DROP VALUE IF EXISTS 'ARCHIVED';
