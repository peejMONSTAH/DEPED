# Document-derived Digital 201 fields

The stored file is the source of truth. The server reads it using the configured Google Document AI processor. It never accepts client-supplied extracted values as profile evidence. Personnel review the current and proposed values before applying selected fields. The server records old and new values in `ValidationLog` and rejects extraction confidence below 0.8.

| Document type | Supported profile fields | Notes |
| --- | --- | --- |
| PDS | First, middle and last name; suffix; birth date; sex; civil status; contact number; residential address | OCR form labels map to the matching `Personnel` columns. |
| APPOINTMENT | Current designation; date hired; appointment status; school; district | Only values recognized from the stored appointment file are proposed. |
| WES | None yet | Work experience describes historical roles. It must map to reviewed career history entries, not overwrite the current position. |
| COE / contract | None yet | A certificate can describe a former employer. A reviewed history-entry workflow is needed before using it to update Digital 201. |

Upload works even if OCR is unavailable. Existing personnel values remain unchanged until the owner reviews and applies a proposal. Locked fields remain locked for ordinary profile editing.

Migration `202609240001_personnel_document_extraction` adds nullable OCR columns, so the old application can continue reading existing files during rollout. Apply the migration before deploying the new backend. Its `rollback.sql` removes OCR evidence and must be used only after the extraction feature is retired and that evidence is no longer needed.
