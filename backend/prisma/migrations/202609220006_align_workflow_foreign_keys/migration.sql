-- Make the migration history agree with schema.prisma about two foreign keys.
--
-- 202609200001_workflow_integrity created personnel_files and document_revisions
-- with hand-written SQL, using a bare column-level REFERENCES:
--
--     personnel_id INTEGER NOT NULL REFERENCES personnel(id)
--
-- A bare REFERENCES takes PostgreSQL's default, ON DELETE NO ACTION ON UPDATE
-- NO ACTION. Prisma emits ON DELETE RESTRICT ON UPDATE CASCADE for a required
-- relation, which is what schema.prisma has meant all along. The two have
-- disagreed ever since, so `prisma migrate diff` reports drift and
-- `prisma migrate dev` wants to write a corrective migration on any machine
-- that runs it.
--
-- NO ACTION and RESTRICT both refuse the delete; they differ only in that NO
-- ACTION is deferrable. Nothing in the application depends on that, so this is
-- a no-op for behaviour and a repair for the schema being a single truth.

ALTER TABLE "personnel_files" DROP CONSTRAINT "personnel_files_personnel_id_fkey";
ALTER TABLE "personnel_files"
  ADD CONSTRAINT "personnel_files_personnel_id_fkey"
  FOREIGN KEY ("personnel_id") REFERENCES "personnel"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_revisions" DROP CONSTRAINT "document_revisions_document_id_fkey";
ALTER TABLE "document_revisions"
  ADD CONSTRAINT "document_revisions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "uploaded_documents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
