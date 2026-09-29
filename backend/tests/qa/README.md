# Readiness run (SUS/TAM pre-evaluation QA)

`readiness-run.cjs` runs the real Digital 201 backend and the built website against a
**disposable local Postgres** with **synthetic people only**, and drives the full
workflow (onboarding → application → AO II → HRMO → return → correction →
resubmission → approval), authorization probes, recovery cases and per-role page
checks. Every check is recorded as PASS / FAIL / BLOCKED / NOT TESTED with evidence;
the run never stops on a failure.

## Safeguards

- Refuses to run unless `QA_DATABASE_URL` is on `localhost`/`127.0.0.1` **and** the
  database name ends in `_test`. It drops and recreates that database.
- Refuses to run with `NODE_ENV=production`.
- Blanks every email provider setting and runs from a temporary directory, so no
  `.env` file is loaded and no email can be sent. The outbox is real, so queued
  emails can be inspected; delivery itself only runs in production and is **not**
  exercised here.
- Files are kept in memory (no Supabase); OCR is disabled on purpose.
- All accounts are `*@qa.test`; passwords in the script are test-only values.

## Run

```bash
# 1. A throwaway Postgres (once)
docker run -d --name d201-e2e-pg -e POSTGRES_PASSWORD=test -p 55440:5432 postgres:16-alpine

# 2. Build the website the run will serve
npm --prefix web run build

# 3. Run (from the repo root). Browser checks need puppeteer-core and Chrome;
#    without them those checks are recorded as NOT TESTED.
QA_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55440/d201_qa_readiness_test \
CHROME_PATH="/path/to/chrome" QA_PUPPETEER=puppeteer-core \
node backend/tests/qa/readiness-run.cjs
```

Optional: `QA_PORT` (default 5095), `QA_OUT_DIR` (default `backend/tests/qa/out`,
git-ignored). Results: `out/results.json`, plus screenshots.

On Git Bash for Windows set `MSYS_NO_PATHCONV=1` so paths are not rewritten.

## Check IDs

`E2E-*` main workflow · `INV-*` setup-email invitations · `ESC-*` escalation after
repeated corrections · `APP-*` Applications page and Home status · `UP-*`/`REC-*`
uploads and recovery · `AUTH-*` access rules · `SES-*` sessions and account
switching · `AUD-*`/`OPS-*` audit and operations · `SMOKE-*` every menu page per role
at 1440 px and 390 px.
