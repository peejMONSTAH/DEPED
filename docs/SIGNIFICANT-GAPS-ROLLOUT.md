# Significant-gap enforcement — 22 September 2026

## Implemented in this working tree

| Area | Enforced behavior |
| --- | --- |
| Transaction access | List, detail, requirements, metadata, OCR review, and downloads share owner/station/role scoping. Database failures are no longer disguised as 404s. |
| Documents and drafts | New production transaction uploads use private Supabase storage. Replacements retain revisions. One database slot per requirement. Drafts persist in PostgreSQL with optimistic versions and serialized edits. Legacy local drafts import on access. |
| Workflow races | Document edits, review, submission, validation, and approval lock the parent transaction. Mandatory rejected/missing documents cannot advance. OCR confirmation binds to the reviewed upload version. |
| Candidate selection | Per-cycle/person/item locking, vacancy limits, occupied/reserved-item checks, explicit application-to-transaction links, and safe withdrawal rules. Selecting cannot reactivate an INACTIVE/LOCKED account. |
| Personnel checklist | Actual server requirement IDs replace hard-coded lists, demo transaction IDs, fuzzy filename matching, and fabricated pre-qualification claims. Upload is distinguished from validation. Scanned fields can be reviewed in web/mobile. |
| Mobile reliability | Single shared token refresh, bounded retries, multipart cloning, correct upload MIME types, read-only terminal/unknown statuses, full paginated transaction loading, and accurate completeness labels. |
| Dashboard and synchronization | Server-side aggregate counts replace truncated list calculations. Temporary-password and locked accounts are not counted as usable. Failed loads show an error, not assumed zeroes. Configured API origin is used for SSE; polling reconciles across instances. |
| Recovery and release checks | CI definitions cover API/web/mobile and disposable PostgreSQL integration tests. Backups reconcile current and historical document references. Authenticated encryption protects offsite archives. Restore drills validate checksums, include citext, and disable email workers. |

Claude's concurrent database relationship, occupancy, email, and personnel-file migrations were preserved. They are not presented here as independently authored changes.

## Verification performed

- Backend type-check passed against an isolated Prisma client generated from the combined schema. The ordinary local Prisma engine was in use by another running process; it was not stopped or overwritten.
- 92 backend regression tests passed.
- 8 PostgreSQL-backed integration tests passed: access matrix; uniqueness and rejected submission; durable draft/version conflicts; transition locking; provisioning aggregates; concurrent selection; concurrent upload/revision retention; owner/version-bound OCR review.
- All 14 repository migrations applied successfully to a fresh, isolated PostgreSQL 17 database. This does **not** prove compatibility with every existing production row.
- Web production build passed; six checklist/session tests and all seven form-template alignment/export suites passed.
- All 51 mobile tests passed; Flutter analysis reported no issues.
- A synthetic backup restored successfully and the scratch API passed `/ready`. The first rehearsal exposed the missing `citext` extension, which is now explicitly included in backup commands.

## Required before rollout

1. Finish coordinating the database changes with Claude. Back up the actual target database and document storage. Rehearse all pending migrations against a **restored staging copy**; never resolve conflicts by deleting personnel data. The unique document-slot migration deliberately refuses existing duplicates.
2. Preserve existing local upload files/drafts before replacing a Railway container. New writes are durable, but this change cannot recover files already lost from an old ephemeral container. Reconcile legacy local paths and move their files to private storage before a production redeploy.
3. Generate the normal Prisma client after the running development API releases its engine, rebuild/restart the API, and deploy the matching web/mobile versions together. OCR confirmation now includes the document version; older clients must reopen/update their review flow.
4. Run staging smoke tests with separate personnel, same-station AO, other-station AO, HRMO, and administrator accounts. Cover upload/replace → OCR review → submit → return → resubmit → validate → approve, and check the final 201 record. Verify large/long forms, keyboard-only use, mobile screens, and browser zoom. Automated tests do not replace this acceptance pass.
5. Push the CI workflow, require its checks in branch protection, and enable Railway's CI-before-deploy setting where available. These hosted settings were **not** changed by this task.

## Enable the encrypted offsite backup

The workflow is defined but **not activated**. In the repository's `backups` environment, configure:

- `BACKUP_DATABASE_URL`: direct PostgreSQL connection suitable for pg_dump (no Prisma-only query parameters). Use appropriate least-privilege backup credentials.
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`: the matching private document store. These are backend/CI secrets, never frontend variables.
- `BACKUP_ENCRYPTION_PASSPHRASE`: independently generated, at least 32 characters. Keep a recovery copy outside GitHub.
- Optional variable `SUPABASE_STORAGE_BUCKET`; default is `hris-documents`.

Set repository variable `ENABLE_DAILY_BACKUPS=true`. Run **Encrypted daily backup** manually once, download the encrypted artifact, decrypt it and rehearse recovery. Only then rely on its 02:00 Asia/Manila schedule. GitHub schedules can be delayed: this is not point-in-time recovery. Artifacts are retained for 30 days; configure job-failure notifications and retain a tested recovery key separately. Confirm that the organization's data-hosting policy permits encrypted personnel backups in the repository's artifact storage.

To decrypt a downloaded archive, provide `BACKUP_ENCRYPTION_PASSPHRASE` through your environment and run:

```text
node backend/scripts/backup-archive.mjs decrypt digital201-backup.enc restored-backup.tar.gz
```

Extract into a new directory. On Windows, run `scripts/restore-drill.ps1 -BackupPath <directory>`; add `-ApplyMigrations` to rehearse a release. This checks checksums, database restoration, and API readiness, not object re-upload. A complete disaster-recovery rehearsal must also restore `storage/` to a **separate private staging bucket**, match database paths, and verify authenticated downloads and dossier history. No live emails, production migrations, deployment, or offsite backup transfer were performed during this task.
