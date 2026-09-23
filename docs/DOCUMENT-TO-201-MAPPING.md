# Document-derived Digital 201 fields

The stored file is the source of truth. The server reads it using the configured Google Document AI processor. It never accepts client-supplied extracted values as profile evidence. Personnel review the current and proposed values before applying selected fields. The server records old and new values in `ValidationLog` and rejects extraction confidence below 0.8.

| Document type | Supported profile fields | Notes |
| --- | --- | --- |
| PDS | First, middle and last name; suffix; birth date; sex; civil status; contact number; residential address | OCR form labels map to the matching `Personnel` columns. |
| APPOINTMENT | Current designation; date hired; appointment status; school; district | Only values recognized from the stored appointment file are proposed. |
| WES | Historical employment date range, position, office/agency | Repeated WES blocks become separately reviewable entries. Approved entries appear in the 201 Work Experience Sheet; current appointment fields are untouched. |
| COE / contract | Historical employment date range, position, employer, status | Only complete, unambiguous rows are proposed. Approved entries appear in the 201 Work Experience Sheet; current appointment fields are untouched. |

Upload works even if OCR is unavailable. Existing personnel values remain unchanged until the owner reviews and applies a proposal. Locked fields remain locked for ordinary profile editing.

Employment rows are retained as reviewed, source-linked evidence in `PersonnelFile.ocrExtractedDataJson` and surfaced by `/personnel/me` in `profileDocumentData.wes` and `careerHistoryEntries`. Replacing or deleting the source file removes its derived rows from the 201 view; it does not erase unrelated career history. The apply action is audited and idempotent. Dates in ISO or unambiguous month-name form are accepted; ambiguous numeric dates are rejected. Low-confidence OCR (<0.8) cannot be applied.

The repository's blank official WES fixture was inspected to confirm its repeated `Duration`, `Position`, and `Name of Office/Unit` labels. Local fixture tests cover two WES jobs and one employment certificate, including timezone-safe date parsing. A live Document AI request against a filled document still requires configured service credentials; local tests do not claim to prove remote OCR quality.

Migration `202609240001_personnel_document_extraction` adds nullable OCR columns, so the old application can continue reading existing files during rollout. Apply the migration before deploying the new backend. Its `rollback.sql` removes OCR evidence and must be used only after the extraction feature is retired and that evidence is no longer needed.
