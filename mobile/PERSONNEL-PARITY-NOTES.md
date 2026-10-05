# Personnel mobile parity — 2026-10-05

Scope: Android personnel app only. No backend schema, permissions, review routing, web behavior, or production deployment changes.

## Implemented

- Multiple PDF/PNG/JPEG source files can be selected for a promotion or appointment requirement. Android combines them locally into one reviewable PDF before the existing upload request. One selected file is unchanged. Limits: 20 source files, 10 MB total, 300 combined PDF pages; invalid/encrypted input fails before upload. Existing attachment replacement and reviewer locking remain enforced by the API.
- Home links open vacancy details, not the application checklist. Browse vacancies provides search/type filtering, paginated loading, retry, application deadlines and server-provided eligibility. Apply is an explicit separate action and respects already-applied, closed, planned, and ineligible states.
- Notifications open the linked personnel application, cycle, 201 document, or appointment checklist. A returned appointment requirement is moved to the top and labeled. Missing records have a visible explanation. AO/HR reviewer notices open the server-provided exact review path on the HTTPS web portal, without transferring credentials; the browser may require login. The mobile portal does not gain admin review permissions.

## Verification

- Full Flutter suite: 104 tests passed.
- Dart analysis: no issues.
- Seven focused regressions cover file preparation/failure, exact notice IDs, vacancy read-only entry, blocked application states, application focus, and narrow-screen/large-text layout.
- Native Android source and unit-test source compile successfully. Both Android PDF-combiner tests passed: mixed PDF/image page ordering and searchable text preservation; invalid/encrypted input rejection. The first-run Android runtime download completed using Maven Central's alternate host.

## Remaining delivery checks

- Build and install a new APK: the previously built release does not contain these changes, including the native combining channel.
- Rehearse actual device file-picker selection, upload/preview, returned-document correction, and notification clicks using synthetic accounts. Automated tests do not replace this live server/device rehearsal.
- Multiple-file combining is Android-native; an unsupported Flutter target reports an error instead of uploading only part of a selection.
- No commit, push, or deploy was requested for this change.
