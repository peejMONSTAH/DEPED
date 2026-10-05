# Local SUS/TAM rehearsal — 1 October 2026

## Scope and verdict

Browser rehearsal of the locally built web application at http://127.0.0.1:5099, using synthetic QA accounts in the isolated local test bench. This is not a production validation, a full regression run, or participant SUS/TAM evidence.

Verdict: conditional pilot readiness; formal evaluation readiness remains unproven. Two reviewer-wording inconsistencies should be corrected before participants assess understandability.

## Observed results

| Workflow | Result | Evidence |
| --- | --- | --- |
| AO and two HRMO sign-in | Pass | Password and synthetic new-device code lead to correct role dashboards. Real email delivery not tested. |
| AO document inspection | Pass | Completed teaching record opens; supporting PDF renders; zoom changes 100% to 125%; close works. |
| AO personnel workspace | Pass | Switch opens Alma Aquino's personnel Home and her own promotion application. Home says waiting for HRMO. |
| AO vacancy status wording | Fail — clarity | The same application on Vacancies says waiting for AO II and AO II checks attachments, contradicting Home and HRMO routing. |
| Promotion notification | Pass | Open Applicant in Promotion Cycle reaches Administrative Officer IV, application APP-2026-00001, and opens Alma's dossier. |
| Promotion dossier wording | Fail — clarity | Dossier documentary check says AO II / Awaiting AO II while ranking says Pending HRMO check. |
| HRMO promotion checklist | Pass | Check Reqs opens HRMO requirements review, Non-Teaching track, ANNEX C section. |
| Promotion PDF preview | Pass for tested attachment | Two-page attachment renders in inspector; no persistent loading observed in this attempt. |
| Deficient-item interaction | Pass, unsaved | Marking letter of intent deficient changes counts, reveals deficiency remarks, selects incomplete finding, and changes submit label to Record Deficiencies. Cancelled without submission. |
| Non-teaching records validation | Pass | HRMO reviewed Sofia Lim's synthetic TRX-3 supporting PDF and submitted validation; success message identifies a different HRMO as next reviewer. |
| Separation of reviewers | Pass — visible controls | First HRMO sees Inspect (not yours to approve); second HRMO sees Approve & Sign and final confirmation. |
| Final approval submission | Blocked by automation safety review | Confirmation labelled irreversible career-record change. Submission refused before execution; dialog cancelled. Explicit authorization needed for synthetic TRX-3. |

OCR is explicitly disabled in this test bench; the automatic-reading warning does not establish a production OCR failure. Test data already contained submitted/processed cases, so this run did not prove fresh application creation from scratch.

## Remaining proof before formal evaluation

- Fix the two AO/HRMO label inconsistencies and recheck all affected surfaces.
- Complete the second-HRMO approval test with explicit authorization.
- Rehearse fresh teaching and non-teaching application submissions and correction/resubmission.
- Check PDS upload/extraction, account creation and station restriction, CAR generation/download, and final promotion completion.
- Verify actual email delivery, production file storage/OCR, and the deployed build participants will use.
- Prepare separate participant accounts and resettable sample cases; do not reuse already-completed cases as fresh tasks.

## Changes during rehearsal

Synthetic TRX-3 was validated by HRMO1 and remains awaiting final approval. HRMO1's promotion notification was marked read by navigation. No product code was edited, no production records were changed, and no final career approval was submitted.

Screenshot: backend/tests/qa/out/rehearsal-20261001-approvals.png. Browser left on the local approval queue as HRMO2.
