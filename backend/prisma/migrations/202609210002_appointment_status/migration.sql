-- Employment status for the CS Form 212 service record STATUS column. The form
-- previously printed a hardcoded 'PERMANENT' for every row because the schema
-- had nowhere to record the real value. Nullable: existing rows are unknown, and
-- an unknown status must print blank rather than be asserted.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppointmentStatus') THEN
    CREATE TYPE "AppointmentStatus" AS ENUM (
      'PERMANENT', 'PROVISIONAL', 'TEMPORARY', 'SUBSTITUTE', 'CASUAL', 'CONTRACTUAL', 'COTERMINOUS'
    );
  END IF;
END$$;

ALTER TABLE "personnel"
  ADD COLUMN IF NOT EXISTS "appointment_status" "AppointmentStatus";
