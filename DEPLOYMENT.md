# DEPLOYMENT.md: Eminence HRIS

## 1. Introduction

This document outlines the deployment strategy and procedures for the Eminence HRIS, an Enterprise HR Management System for the City Schools Division of Koronadal City (DepEd). It covers the continuous integration and continuous deployment (CI/CD) pipeline, environment management, infrastructure configuration, monitoring, and rollback procedures.

## 2. Technology Stack Overview

The Eminence HRIS is composed of several interconnected components:

*   **Mobile Frontend:** Flutter (Android & iOS)
*   **Web Frontend:** React.js
*   **Backend API:** Node.js with Express.js
*   **Database:** PostgreSQL
*   **File Storage:** Supabase Storage (S3-compatible)
*   **OCR/AI:** Google Cloud Vision AI
*   **Notifications:** Supabase Notifications
*   **Cloud Hosting:** AWS (Amazon Web Services)

## 3. Environment Strategy

Eminence HRIS will utilize a multi-environment strategy to ensure stability, facilitate development, and enable thorough testing before production releases.

### 3.1. Development Environment (Dev)
*   **Purpose:** Local development, feature branch testing, and initial integration.
*   **Access:** Developers only.
*   **Data:** Seeded data, anonymized production data, or developer-specific datasets.
*   **Infrastructure:** Typically local developer machines, potentially shared dev AWS resources for backend services.

### 3.2. Staging Environment (Staging)
*   **Purpose:** Pre-production testing, user acceptance testing (UAT) by DepEd stakeholders, performance testing, and final integration testing.
*   **Access:** Development team, QA, and authorized DepEd UAT users.
*   **Data:** Near-production data (anonymized or synthetic) for realistic testing scenarios. Refreshed periodically from production backups.
*   **Infrastructure:** A replica of the production environment, albeit with potentially scaled-down resources to manage costs.

### 3.3. Production Environment (Prod)
*   **Purpose:** Live system serving end-users (personnel, AO II, HRMO, Records, SysAdmin).
*   **Access:** Restricted to authorized operations personnel and automated deployment pipelines.
*   **Data:** Live operational data.
*   **Infrastructure:** Fully scaled and highly available AWS resources, configured for optimal performance and security.

## 4. CI/CD Pipeline

Automated CI/CD pipelines will be implemented using GitHub Actions to ensure consistent, reliable, and efficient deployments across all environments.

### 4.1. Mobile Frontend (Flutter)
*   **Trigger:** Push to `main` branch (for staging/production builds), pull requests to `main`.
*   **Stages:**
    1.  **Build:** Compile Flutter app for Android (APK/AAB) and iOS (IPA).
    2.  **Test:** Run unit and integration tests.
    3.  **Lint/Analyze:** Static code analysis.
    4.  **Sign:** Sign application packages with appropriate certificates.
    5.  **Deploy (Staging):** Publish to internal testing tracks (e.g., Firebase App Distribution, TestFlight) for QA.
    6.  **Deploy (Production):** Manual trigger to publish to Google Play Store and Apple App Store.
*   **Tools:** Flutter CLI, Fastlane (for App Store automation).

### 4.2. Web Frontend (React.js)
*   **Trigger:** Push to `main` branch (for staging/production builds), pull requests to `main`.
*   **Stages:**
    1.  **Build:** Compile React.js application into static assets.
    2.  **Test:** Run unit and end-to-end tests.
    3.  **Lint:** Static code analysis.
    4.  **Deploy (Staging):** Upload static assets to a dedicated AWS S3 bucket for the staging environment. Invalidate CloudFront cache.
    5.  **Deploy (Production):** Manual trigger to upload static assets to the production AWS S3 bucket. Invalidate CloudFront cache.
*   **Tools:** npm/yarn, AWS CLI, CloudFront API.

### 4.3. Backend API (Node.js/Express)
*   **Trigger:** Push to `main` branch (for staging/production builds), pull requests to `main`.
*   **Stages:**
    1.  **Build:** Install dependencies, compile TypeScript (if used).
    2.  **Test:** Run unit and integration tests.
    3.  **Lint:** Static code analysis.
    4.  **Dockerize:** Build Docker image for the Node.js application.
    5.  **Push Image:** Push Docker image to AWS Elastic Container Registry (ECR).
    6.  **Deploy (Staging):** Update AWS Elastic Container Service (ECS) service in the staging cluster to use the new Docker image. Perform rolling update.
    7.  **Deploy (Production):** Manual trigger to update AWS ECS service in the production cluster. Perform rolling update.
*   **Tools:** Docker, AWS CLI, ECS CLI.

## 5. Application Configuration

### 5.1. Backend API (Node.js/Express)
*   **Containerization:** The Node.js backend will be containerized using Docker. A `Dockerfile` will define the build process and runtime environment.
*   **Deployment Platform:** AWS Elastic Container Service (ECS) with Fargate launch type will be used for deploying the backend API. Fargate eliminates the need to manage EC2 instances, simplifying operations.
*   **Configuration Management:** Environment variables will be used for runtime configuration (e.g., database connection strings, API keys, Supabase credentials, Google Cloud Vision API keys). These will be managed securely using AWS Secrets Manager and injected into ECS task definitions.
*   **Scaling:** ECS services will be configured with Auto Scaling policies based on CPU utilization or request count to handle varying loads.

### 5.2. Database (PostgreSQL)
*   **Managed Service:** AWS Relational Database Service (RDS) for PostgreSQL will be used. This provides automated backups, patching, and scaling.
*   **Configuration:** Separate RDS instances will be provisioned for Staging and Production environments.
*   **Connection:** Backend services will connect to RDS instances using secure credentials managed by AWS Secrets Manager.
*   **Migrations:** Database schema changes will be managed using migration tools (e.g., Knex.js, TypeORM migrations) and applied as part of the backend deployment process, typically as a pre-deployment step or a separate pipeline.

### 5.3. File Storage (Supabase Storage)
*   **Integration:** The backend API will interact with Supabase Storage via its SDK or API.
*   **Configuration:** Supabase project keys and bucket names will be stored as environment variables in AWS Secrets Manager.
*   **Buckets:** Separate buckets will be used for Staging and Production to isolate data.

### 5.4. OCR/AI (Google Cloud Vision AI)
*   **Integration:** The backend API will make API calls to Google Cloud Vision AI.
*   **Authentication:** Service account keys for Google Cloud will be securely stored in AWS Secrets Manager and used by the backend service.

### 5.5. Notifications (Supabase Notifications)
*   **Integration:** The backend API will interact with Supabase Notifications via its API.
*   **Configuration:** Supabase project keys will be stored as environment variables in AWS Secrets Manager.

## 6. Infrastructure as Code (IaC)

AWS resources (ECS clusters, services, S3 buckets, CloudFront distributions, RDS instances, VPCs, security groups, IAM roles) will be defined and managed using Terraform. This ensures consistency, repeatability, and version control for the infrastructure.

## 7. Monitoring and Logging

Comprehensive monitoring and logging are crucial for maintaining system health and troubleshooting.

### 7.1. Logging
*   **Backend:** Node.js application logs will be sent to AWS CloudWatch Logs. Structured logging (e.g., JSON format) will be used for easier analysis.
*   **Web Frontend:** Client-side errors and performance metrics will be captured and sent to a centralized logging service (e.g., CloudWatch Logs or a dedicated error tracking service).
*   **Mobile Frontend:** Mobile application logs and crash reports will be collected via Firebase Crashlytics and integrated with CloudWatch Logs.
*   **Access Logs:** AWS services (ALB, CloudFront, S3) will have access logging enabled, sending logs to S3 buckets for archival and analysis.

### 7.2. Monitoring
*   **AWS CloudWatch:** Used for collecting metrics (CPU utilization, memory, network I/O) from ECS tasks, RDS instances, and other AWS services.
*   **Custom Metrics:** Application-specific metrics (e.g., API response times, error rates, transaction processing times) will be emitted to CloudWatch.
*   **Alarms:** CloudWatch Alarms will be configured to trigger notifications (e.g., via SNS to PagerDuty or email) for critical thresholds (e.g., high error rates, low disk space, high CPU).
*   **Dashboards:** CloudWatch Dashboards will provide a consolidated view of system health and performance.

## 8. Backup and Recovery

As per the Non-Functional Requirements (NFRs) in `PRD.md`, a robust backup strategy is in place.

### 8.1. Database (PostgreSQL - AWS RDS)
*   **Automated Backups:** AWS RDS provides automated daily backups with a configurable retention period. For Eminence HRIS, this will be set to 30 days.
*   **Point-in-Time Recovery (PITR):** Enabled to allow restoration to any specific second within the retention window.
*   **Snapshots:** Manual snapshots can be taken for specific recovery points or before major changes.

### 8.2. File Storage (Supabase Storage)
*   Supabase Storage, being S3-compatible, inherently provides high durability and availability. Supabase's own backup mechanisms will ensure data integrity.
*   **Data Export:** Regular exports of metadata and file listings can be performed and stored in a separate S3 bucket for additional redundancy.

### 8.3. Configuration and Code
*   All application code, infrastructure as code (Terraform), and configuration files are stored in version-controlled Git repositories (GitHub), providing a complete history and easy recovery.

## 9. Rollback Procedures

In the event of a critical issue post-deployment, clear rollback procedures are defined to revert to a previous stable state.

### 9.1. Backend API
*   **ECS Rollback:** AWS ECS allows rolling back to a previous task definition revision. If a new deployment introduces issues, the ECS service can be updated to use the last known good task definition.
*   **Database Rollback:** If a database migration caused issues, the database can be restored from a point-in-time backup (RDS PITR) to before the migration was applied. Corresponding application code must also be rolled back.

### 9.2. Web Frontend
*   **S3 Versioning:** AWS S3 buckets will have versioning enabled. In case of a problematic deployment, a previous version of the static assets can be promoted.
*   **CloudFront Invalidation:** After rolling back S3 assets, the CloudFront cache must be invalidated to ensure users receive the older, stable version.

### 9.3. Mobile Frontend
*   **App Store Rollback:** Rolling back mobile app versions typically involves submitting a previous version to the app stores. This process can take time due to review cycles. For critical issues, a hotfix release is often preferred.

## 10. Security Considerations

Deployment security is paramount for an HRIS handling sensitive PII.

*   **Network Segmentation:** AWS VPCs, subnets, and security groups will be used to isolate application components and restrict network access.
*   **Least Privilege:** IAM roles and policies will adhere to the principle of least privilege for all services and deployment pipelines.
*   **Secrets Management:** AWS Secrets Manager will be used to store and retrieve all sensitive credentials (database passwords, API keys, service account keys) securely.
*   **HTTPS/TLS:** All communication between clients (mobile/web) and the backend API, and between backend services, will be encrypted using HTTPS/TLS 1.2+.
*   **Vulnerability Scanning:** Regular vulnerability scans of Docker images and deployed applications will be conducted.

## 11. Deployment Checklist

A high-level checklist for production deployments:

*   [ ] All code merged to `main` and passed CI tests.
*   [ ] Staging environment successfully deployed and passed UAT.
*   [ ] Performance tests on Staging meet NFRs.
*   [ ] Database migrations reviewed and ready.
*   [ ] All environment variables and secrets configured for Production.
*   [ ] Monitoring and alerting configured and tested for Production.
*   [ ] Rollback plan documented and understood by the deployment team.
*   [ ] Communication plan for stakeholders in case of issues.
*   [ ] Production deployment pipeline triggered.
*   [ ] Post-deployment smoke tests performed.
*   [ ] Monitoring dashboards reviewed for anomalies.

---

# Release Runbook

Every command below was executed and verified on 2026-09-21 against a restored
copy of production, except the two marked **NOT YET RUN** which need production
write access.

Order matters. Step 4 fails if step 3 has not run.

## 0. Preconditions

Two settings in `backend/.env` will stop the API from booting under
`NODE_ENV=production`, by design:

```
CORS_ORIGIN=https://<your-division-domain>
CLIENT_URL=https://<your-division-domain>
NODE_ENV=production
```

Both are currently `http://localhost:5173`. The boot check refuses any
non-HTTPS origin outside localhost, so the API will exit at startup until the
real domain is in place. Everything else in `.env` is production-ready:
JWT secrets, Supabase URL and service key, and SMTP host are all present and valid.

Confirm readiness before anything else:

```bash
cd backend && npm run check          # 83 tests, typecheck
cd ../web && npx tsc --noEmit && npx vite build
cd ../mobile && flutter analyze
```

## 1. Take a backup

```powershell
./scripts/backup-daily.ps1
```

Writes to `./backups/digital201-<timestamp>/`. The run fails if any document
referenced by a database row is missing from object storage, rather than
producing a backup that only looks complete.

## 2. Prove that backup restores

```powershell
./scripts/restore-drill.ps1 -ApplyMigrations
```

Restores the newest backup into a throwaway container, applies pending
migrations, and boots the API against it. **Do not skip this.** It is what
caught two real defects in the backup pipeline: a `pg_dump 17` archive that
`pg_restore 15` could not read at all, and Supabase's managed schemas
(including `vault.secrets`) being written into the backup folder.

A pass means the archive restores, the migrations apply to real data, and the
application runs on the result.

## 3. Apply migrations — **NOT YET RUN**

```bash
cd backend && npx prisma migrate deploy
```

Two pending: `202609210001_force_password_change` and
`202609210002_appointment_status`. Both additive, both `IF NOT EXISTS`, neither
rewrites existing rows.

Rehearsed on a restored production copy: applied cleanly, all data intact
(7 users, 6 personnel, 3 cycles, 2 applications), and **0 accounts were gated** —
`must_change_password` defaults to false so nobody is locked out by the deploy.

## 4. Check for accounts on a shared password — **NOT YET RUN**

```bash
cd backend && npx ts-node scripts/flag-leaked-passwords.ts           # report
cd backend && npx ts-node scripts/flag-leaked-passwords.ts --apply   # then flag
```

Earlier releases issued every account the same literal (`Personnel@Pass123`,
and `Reset@Pass2026!` on reset). The migration in step 3 deliberately does not
flag existing rows, so this finds the ones that still hold a known password and
requires them to choose their own.

**Dry-run against restored production data returned 0 of 7 accounts.** Nobody
will be forced to change a password by this release. Re-run the report on live
before applying, and if the count is ever non-zero, warn those staff first:
each is required to set a new password at their next sign-in.

## 5. Deploy the applications

```bash
cd backend && npm run build && npm start
cd web && npx vite build          # serve ./web/dist
```

Mobile release builds must be given the API host or they throw at startup:

```bash
flutter build apk --dart-define=API_BASE_URL=https://<your-api-host>/api/v1
```

## 6. Verify

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://<api>/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"x","password":"y"}'   # expect 401
```

Then sign in as HRMO and confirm: the promotions list loads, a personnel record
opens, and a newly created account is required to change its password before it
can do anything else.

## Rollback

The migrations are additive, so the previous release runs unchanged against the
new schema — rolling back code needs no database change. Only restore from
backup if data is wrong, and use `restore-drill.ps1` against that backup first
to confirm it is good.

## What this release changes operationally

- Administrator-issued passwords are single-purpose: the API accepts nothing but
  change-password until the holder sets their own. Expect first-sign-in support
  questions from anyone given a new account.
- Backups now include object storage and fail when a referenced document is
  missing.
- Backups cover the `public` schema only. Supabase-managed schemas are no longer
  captured, which also keeps `vault.secrets` out of the backup folder.
