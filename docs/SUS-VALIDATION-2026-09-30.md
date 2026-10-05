# Digital 201 — SUS readiness validation

Date: 30 September 2026 (Asia/Singapore)  
Version tested: `cedac0c51a4af17552274852c4e76c37d8dbaa08`  
Assessment: technical pre-evaluation validation, not a participant SUS study or certification.

## Decision

**HOLD formal SUS evaluation sign-off.** The exercised core workflow and station-access checks pass, but browser navigation has unresolved timeout failures and the evaluation deployment/device prerequisites remain unverified. A supervised internal rehearsal with synthetic records is reasonable; do not describe this report as a full production acceptance or SUS pass.

## Scope and controls

The validation uses the existing application and readiness harness, real local PostgreSQL 16, synthetic accounts, Node 24.18.0 and headless Chrome 154.0.8037.92 on Windows. It covers personnel, AO II, HRMO and System Administrator roles. Browser widths are 1440 px and 390 px; the latter is mobile-web emulation, not a physical-device test.

A dedicated container, `d201-sus-validation-20260930`, is bound to localhost port 55442. The readiness database is `d201_sus_20260930_test`. The school-scope suite creates and removes its own separate database on that server. Production was not modified. No real personnel records or outgoing email were used. No product code was changed.

After completion, the dedicated database container was stopped, not deleted. The synthetic database and local evidence were retained. Document bytes existed only in the harness's in-memory store and do not persist after the test process exits.

Important limits: document storage is replaced by an in-memory store; OCR is deliberately unavailable; email configuration is disabled. These checks do not establish production storage durability, OCR extraction accuracy, email delivery, deployment health, load capacity or full accessibility compliance.

Page-smoke checks cover observed API errors, console errors and document-level horizontal overflow; they do not verify every control, keyboard flow or modal. Annex grouping, all notification destinations, AO II details-close behavior, CRUD interactions, compliance filters, selection-modal scrolling, and the native splash-screen change still require explicit acceptance checks. A notification-to-returned-requirement test is not proof of every promotion-cycle notification deep link.

## Build and automated gates

The following build/unit checks were executed in the preceding readiness assessment at this same, unchanged commit and reused here:

| Gate | Observed result |
| --- | --- |
| Backend TypeScript build | PASS |
| Backend tests | 205 passed, 0 failed |
| Web production build | PASS |
| Web tests | 167 passed, 1 failed |
| Flutter analysis | PASS; no issues found |
| Flutter tests | 81 passed |
| Database-backed station-scope suite, executed for this validation | 23 passed, 0 failed, 0 skipped |

These counts are checks, not participants or unique user journeys. Some backend/web tests inspect source text or use fixtures; they must not be interpreted as hundreds of independent end-to-end scenarios. Commands used were backend `npm run check` / `npm test`, web `npm run check`, mobile `flutter analyze --no-pub` / `flutter test --no-pub`, and backend `node --test tests/integration/station-scope.cjs`. Sandbox subprocess failures were rerun with permission; they were not counted as product failures.

The web failure is `web/tests/personnel-portal-tasks.cjs`, “home side panels hide instead of guessing when they cannot load.” It expects `record && facts.length > 0`, whereas `web/src/pages/personnel/Home.tsx` now uses `record && careerFacts.length > 0`. The record guard remains. This is a stale source-text assertion, not demonstrated evidence that the panel displays invented information. The web gate remains formally non-green until the assertion is corrected and rerun.

## End-to-end evidence

Run command: `node backend/tests/qa/readiness-run.cjs`, configured with the isolated database, installed Chrome, an isolated Puppeteer dependency, port 5096, and the version above. Raw results and screenshots are in `backend/tests/qa/out/sus-20260930/` (git-ignored local evidence). The harness exit code alone is not a pass indicator: individual result statuses must be inspected.

The run completed at **12:40:35 Asia/Singapore**. Raw tally: **138 PASS, 8 FAIL, 1 NOT TESTED, 4 INFO, 0 BLOCKED**. There are 147 evaluated/not-tested checks plus four diagnostic information entries. Five failures have evidence of assertion mismatch or expected fault-injection noise; three page-smoke failures remain unresolved. None of the eight raw failures has been changed to PASS.

| Browser page-smoke group | 1440 px | 390 px |
| --- | --- | --- |
| Personnel | PASS | PASS |
| AO II | FAIL — request timeouts | FAIL — request timeouts |
| HRMO | FAIL — request timeout | PASS |
| System Administrator | PASS | PASS |

The one explicit NOT TESTED result, OPS-02b, concerns delivery failure and exhausted email retries. Its harness text refers to another integration suite, but that is not counted as evidence from this run. Additional unverified areas listed under scope remain unverified even though the harness has no result row for them.

Evidence index:

- `backend/tests/qa/out/sus-20260930/results.json` — full check IDs, statuses and details.
- `app-home.png` / `app-submitted.png` / `app-final.png` — application state and wording review.
- `b4-preview.png` — rendered replacement PDF.
- `m-*.png` — mobile-width page captures.
- `ses-expired.png` — revoked-session sign-in screen.
- `ao-navigation-probe.json` / `probe-ao-*.png` — fresh-browser diagnostic and its limitation.

Screenshots and diagnostic files above are in the same local evidence directory as `results.json`. Preserve that directory with this report when sharing or archiving the validation; it is not automatically included in Git.

## Confirmed behavior

- Account invitation, one-time setup, duplicate invitation handling and account-request approval work with synthetic users.
- Application submission, AO II verification, HRMO ranking/selection, appointment submission, return, replacement, resubmission and final approval complete successfully.
- Duplicate clicks do not create duplicate applications, transactions, returns or approvals in the exercised cases.
- Final approval updates the official position, plantilla occupancy and service record; selection alone does not change the position.
- A return notification opens the correct transaction checklist and focuses the returned requirement. Its reviewer reason is visible. Other validated files remain validated.
- Oversized, unsupported, empty and invalid files are refused in the exercised cases. Offline upload failure preserves the requirement; retry after reconnection succeeds.
- The replacement PDF visibly renders with zoom controls and a close button. Evidence: `b4-preview.png`. This is a synthetic personnel-checklist PDF, not proof that every AO/HR document format or production file previews correctly.
- The separate station-scope suite exercises Matulas and Morales isolation, direct-record and file-access denial, filter/search isolation, privileged-role boundaries, notification isolation, self-validation prevention and immediate scope change after moving an officer.
- Audit checks cover workflow events, actor/target/outcome fields, export secret exclusion and honest integrity status.
- Browser account switching removes the previous person's data from the checked pages/storage; revoked sessions return to sign-in and re-login restores the page. Deactivated accounts and explicitly revoked tokens lose API access.

## Raw failure review

Raw failures must remain in the evidence; these explanations do not rewrite them as automated passes.

| Check | Evidence-based interpretation |
| --- | --- |
| APP-01 | Requires the old phrase “with AO II”; current application text says “Waiting for AO II to check requirements.” Application and stage are present. |
| APP-02 / APP-03 | Expect old Home headings and phrases. `app-home.png` visibly shows “With a reviewer,” the promotion application, and AO II as the current reviewer. |
| APP-06 | Rejects any occurrence of “You need to act.” `app-final.png` shows this as a summary counter of **0**, with one completed application and no pending review. |
| UX-04 | Collects console errors across a deliberately offline upload test. Recorded errors are network/disconnected errors; the offline recovery and retry checks pass. The assertion needs to distinguish expected fault-injection errors from unexpected ones. |

### Unresolved reliability finding — high priority for evaluation readiness

The AO II desktop smoke check recorded 30-second timeouts loading transactions and plantilla data. HRMO desktop navigation also recorded a plantilla timeout. AO II at 390 px reproduced transaction/account-list timeouts; HRMO at 390 px passed. No non-success HTTP status or horizontal overflow was reported for these failed groups. The harness associates console messages with the route active when they are collected, which may differ from the page that originally started the request; therefore the displayed route is not proof of the failing request's origin.

A fresh-browser diagnostic loaded AO personnel and promotions without navigation errors or console errors during the observation window. Its next navigation ended with an “Execution context was destroyed” browser-automation error; that diagnostic is incomplete, not a clean pass. Evidence: `ao-navigation-probe.json` and `probe-ao-*.png`.

Cause is **not established**. Hypotheses include navigation/stream connection behavior in the local HTTP test environment, and application request lifecycle behavior. Source review shows explicit stream cleanup on hook disposal, so a missing cleanup cannot simply be assumed. Reproduce with request timing evidence on the intended deployment before dismissing this as test noise. Investigation-first review did not authorize or make a fix.

## Required before formal participant evaluation

1. Resolve or conclusively explain the AO/HR navigation timeouts; reconcile stale assertions and the expected-offline-error check, then rerun to obtain an unambiguous test gate. Do not suppress unrelated failures.
2. Rehearse the selected participant tasks on the exact evaluation deployment with synthetic data: real storage upload/download/preview, setup-email receipt, notification deep links, and any OCR/PDS extraction included in the study.
3. Verify AO/HR document inspection and CAR download end to end with representative files. CAR generator unit tests are not a complete browser-download or document-layout acceptance test.
4. Verify the Matulas account-creation form exposes only authorized assignment choices and rejects a tampered out-of-school assignment in that deployment. General record-scope tests do not replace this exact form acceptance case.
5. Run the actual mobile build on the intended physical devices, including cold/repeated launches, sign-in, file selection and preview. Static analysis, widget tests and 390 px web emulation do not establish native-device readiness.
6. Prepare consistent role-based task instructions, synthetic data, participant consent, facilitator instructions, completion/error/timing records and the standard post-use SUS questionnaire. Keep the evaluated version fixed and record any assistance given.

Suggested participant tasks: personnel upload/apply/handle a returned file; AO II review own-school requirements and return a deficient item; HRMO rate/select/approve and retrieve CAR; System Administrator issue an invitation and inspect delivery status. Select only tasks belonging to each participant's role.

Human usability testing observes representative users attempting tasks; automation cannot supply their perceptions or a SUS score. See [Digital.gov usability-testing guidance](https://digital.gov/guides/research-collaboration/testing/usability). No participant responses, SUS score, target attainment, or human acceptance sign-off are claimed in this report.

## Approval record

Technical reviewer: automated validation by Codex; evidence and limitations documented above.  
System owner / study facilitator acceptance: **pending**.  
Participant SUS evaluation: **not conducted**.
