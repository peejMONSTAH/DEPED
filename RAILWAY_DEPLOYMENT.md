# Digital 201 — Railway deployment runbook

This repository is a monorepo. Deploy it as three Railway services in one
project:

| Railway service | Source | Root directory | Public domain |
|---|---|---|---|
| `Postgres` | Railway PostgreSQL | managed by Railway | no |
| `Backend` | this GitHub repository | `/backend` | yes |
| `Frontend` | this GitHub repository | `/web` | yes |

Do not deploy the repository root as a Node service. `backend` and `web` have
different dependency trees and Dockerfiles.

## 1. Create the project and services

1. Push the intended release commit to GitHub.
2. In Railway, create an **Empty Project** named `Digital 201`.
3. Add **Database > PostgreSQL** and rename it exactly `Postgres`.
4. Add the GitHub repository twice. Rename the services `Backend` and
   `Frontend`.
5. In each service's **Settings > Source**, set the root directory:
   `Backend` to `/backend`, and `Frontend` to `/web`.
6. Generate a public domain for `Backend` and `Frontend` under
   **Settings > Networking**.

Railway automatically detects the `Dockerfile` at each root. If an existing
service was previously configured for Nixpacks/Railpack, change its builder to
**Dockerfile**. For older projects using Config as Code, the matching config
paths are `/backend/railway.json` and `/web/railway.json`.

If the service cannot retain a monorepo root directory, set
`RAILWAY_DOCKERFILE_PATH=Dockerfile` on the backend service and
`RAILWAY_DOCKERFILE_PATH=/Dockerfile.frontend` on the root-level frontend
service. The latter Dockerfile deliberately builds `web/` from repository-root
context.

## 2. Backend variables

Open `Backend > Variables` and add the following. Values containing
`${{...}}` are Railway reference variables, not literal text to replace.

```dotenv
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
DIRECT_URL=${{Postgres.DATABASE_URL}}
JWT_ACCESS_SECRET=<unique random value of at least 64 characters>
JWT_REFRESH_SECRET=<different random value of at least 64 characters>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
CLIENT_URL=https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=300
LOGIN_RATE_LIMIT_MAX=10
DOCUMENT_STORAGE=supabase
SUPABASE_URL=<Supabase project URL>
SUPABASE_SERVICE_KEY=<Supabase service-role key>
SUPABASE_STORAGE_BUCKET=hris-documents
SMTP_HOST=live.smtp.mailtrap.io
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=api
SMTP_PASS=<Mailtrap API token>
EMAIL_FROM=Digital 201 <noreply@your-verified-domain.example>
```

Generate each JWT secret locally without posting it in chat:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
```

Seal `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SUPABASE_SERVICE_KEY`,
`SMTP_PASS`, and Google credentials using Railway's variable menu.

### Optional Google Document AI OCR

Add these only when OCR should be enabled:

```dotenv
OCR_PROVIDER=GOOGLE_DOCUMENT_AI
GOOGLE_CLOUD_PROJECT_ID=<Google project id>
DOCUMENT_AI_LOCATION=<processor location, for example us>
DOCUMENT_AI_PROCESSOR_ID=<processor id>
GOOGLE_SERVICE_ACCOUNT_JSON=<complete service-account JSON>
```

Paste the complete JSON into `GOOGLE_SERVICE_ACCOUNT_JSON`. Do not set
`GOOGLE_APPLICATION_CREDENTIALS` to a path from the development computer.

## 3. Backend deployment settings

Use these settings if Railway does not load `backend/railway.json`:

```text
Builder: Dockerfile
Dockerfile path: Dockerfile
Pre-deploy command: npx prisma migrate deploy
Healthcheck path: /ready
Healthcheck timeout: 120 seconds
Restart policy: Always
```

Do not run `prisma migrate dev` or `prisma db push` against production.

After deployment, these should both succeed:

```text
https://<backend-domain>/health
https://<backend-domain>/ready
```

`/health` checks the process. `/ready` also checks PostgreSQL.

## 4. Frontend variable and settings

Open `Frontend > Variables` and add:

```dotenv
VITE_API_URL=https://${{Backend.RAILWAY_PUBLIC_DOMAIN}}/api/v1
```

`VITE_API_URL` is compiled into the Vite bundle. Any change to it requires a
new frontend deployment. Never put a secret in a `VITE_` variable.

Use these settings if Railway does not load `web/railway.json`:

```text
Builder: Dockerfile
Dockerfile path: Dockerfile
Healthcheck path: /health
Healthcheck timeout: 60 seconds
Restart policy: Always
```

## 5. Create the first production administrator

Do **not** run `prisma:seed` in production. That seed contains demonstration
records and a known demonstration password.

Temporarily add these sealed variables to `Backend`:

```dotenv
BOOTSTRAP_ADMIN_EMAIL=<official administrator email>
BOOTSTRAP_ADMIN_PASSWORD=<unique initial password meeting policy>
```

Install and sign in to the Railway CLI, then execute the idempotent bootstrap
inside the deployed backend:

```powershell
npm install -g @railway/cli
railway login
railway link
railway ssh --service Backend -- npm run bootstrap:admin
```

The command will not overwrite an existing administrator's password. Once it
succeeds, delete both bootstrap variables and deploy the staged variable
change. The administrator must change the initial password on first login.

## 6. Required smoke test

Test from a private/incognito browser session:

1. Open the frontend domain; no mixed-content or CORS errors should appear.
2. Sign in as the bootstrap administrator and change the initial password.
3. Create a temporary account and confirm that its email is delivered.
4. Upload a small PDF or image, download it again, and confirm it remains after
   redeploying the backend.
5. Run an OCR test if Document AI is enabled.
6. Submit a transaction through AO validation and HRMO approval.
7. Check Railway logs for unhandled errors and verify `/ready` still returns
   HTTP 200.

## 7. Production cautions

- Railway container storage is ephemeral. Keep `DOCUMENT_STORAGE=supabase`;
  do not depend on `/app/uploads` for production records.
- Railway PostgreSQL backups do not include Supabase Storage objects. Back up
  the database and private bucket separately and perform restore drills.
- Mailtrap's demo domain has recipient restrictions. Use a verified sending
  domain before inviting real users.
- Deploy a staging environment first and use synthetic personnel data. Do not
  copy real PDS files into preview environments.
- Before a schema-changing release, take a database backup and review the
  migration SQL. Rolling back application code does not reverse a migration.
