-- Station accounts represent an office, not a fictitious person.
-- Preserve existing records; do not infer which historical dates were placeholders.
ALTER TABLE "personnel" ALTER COLUMN "birth_date" DROP NOT NULL;
ALTER TABLE "personnel" ALTER COLUMN "gender" DROP NOT NULL;
ALTER TABLE "personnel" ALTER COLUMN "civil_status" DROP NOT NULL;
ALTER TABLE "account_creation_requests" ADD COLUMN "date_hired" TIMESTAMP(3);
