# Personnel form templates

Downloaded from official sources on 2026-09-13. These are pinned editions,
not a guarantee of the latest or division-approved edition. HRMO must confirm
acceptance before operational use. The editor displays the edition and source.

| File | Source and PDF page numbers (1-based) |
| --- | --- |
| pds-2025.pdf | CSC 2025 ORAOHRA, 156-159 (Annex H-1) |
| wes.pdf | Blank adaptation of Annex H-2, page 160. The source contains example employment; those answers are removed and the requested fields retained. |
| oath-2025.pdf | CSC 2025 ORAOHRA, 147 (Annex B) |
| medical-2025.pdf | CSC 2025 ORAOHRA, 155 (Annex G) |
| position-2017.pdf | CSC 2025 ORAOHRA, 145-146 (Annex A) |
| omnibus-2023.pdf | DepEd DO 007 s.2023, 100 (Annex C, checklist and sworn statement) |
| saln-2025.pdf | Original 2025 SALN Annexes, 1-4 (main form + additional sheets). NOT the February 2026 update. |

Sources:
- https://www.csc.gov.ph/phocadownload/userupload/hrpso/2025-ORAOHRA/2025%20ORAOHRA.pdf
- https://www.deped.gov.ph/wp-content/uploads/DO_s2023_007.pdf
- https://www.csc.gov.ph/phocadownload/userupload/irmo/policy%20resolutions/2025/saln/SALN%20Annexes%202025.pdf

CSC currently lists a Revised 2026 PDS category, but its download could not be
retrieved during implementation. Do not silently relabel the 2025 PDF as 2026.
When updating a form, use a NEW template ID, update the catalog and matcher,
and retain older assets so existing drafts do not shift onto a different layout.

Deploy `backend/assets/forms` alongside `backend/dist`. Drafts are private JSON
files under `backend/uploads/form-drafts/<transactionId>` using the same durable
storage requirements as existing document uploads. Back up this directory and
do not serve `uploads` as a public static directory. Multiple API instances
require shared storage and a distributed concurrency mechanism before rollout.
