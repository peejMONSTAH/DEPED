# Digital 201 mobile redesign — 5 October 2026

## Design

Refined personnel workspace using the existing bundled Plus Jakarta Sans, Inter,
Digital 201 lockup, green brand and restrained gold accent. No new dependencies.

- Reserved-space bottom navigation replaces the floating overlay and scroll-driven resizing.
- Natural-height identity panels show name, personnel category, position and school.
- Sign-in uses a simpler editorial hierarchy and existing authentication handlers.
- Verification dialog scrolls with the keyboard and large text; actions wrap.
- Document actions move into the page, preventing the floating add button from covering cards.
- Document titles and status labels are separated; actions wrap on small phones.
- Empty document placeholders no longer display an upload date.
- Profile facts stack label above value to avoid narrow text ribbons.
- Application and service pages use consistent headings and reduced bottom clearance.
- Shared surfaces and status typography are updated without changing service calls or permissions.

## Verification

- Final full existing + new suite: 97 tests passed.
- Expanded redesign suite: 9 tests passed, including 320/390/768 logical-pixel widths,
  100% and 180% text scales, keyboard layouts, navigation callbacks and golden previews.
- Final source and test analysis: no issues.
- Debug APK compilation: successful.

Golden previews use synthetic records and widget rendering, not emulator screenshots.
The workspace preview is a shared-component composition, not a transaction demonstration.
The initial debug APK uses the existing development API configuration.
The subsequent release is version 1.1.1 (build 3), targeting
`https://deped-production.up.railway.app/api/v1` with the existing release keystore.
Android version metadata now follows pubspec instead of hardcoded 1.0.0/build 1.
Live emulator/device rehearsal remains pending. No installation, manual deployment,
or backend record mutation was performed.
