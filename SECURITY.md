# SECURITY.md: Eminence HRIS

## Threat Model

Eminence HRIS processes sensitive Personally Identifiable Information (PII), educational records, and career advancement data for government personnel. The following threat actors and attack vectors have been identified:

### Threat Actors
- **External Attackers:** Motivated by data theft, ransom, or disruption of government services.
- **Insider Threats:** Disgruntled employees or contractors with system access seeking unauthorized data access or modification.
- **Opportunistic Attackers:** Exploiting known vulnerabilities in web/mobile frameworks or misconfigured cloud infrastructure.

### Attack Vectors
- **Authentication Bypass:** Weak JWT implementation, token leakage, or session hijacking.
- **Unauthorized Data Access:** Insufficient RBAC enforcement, allowing users to view/modify records outside their scope.
- **Data Exfiltration:** Unencrypted data in transit or at rest; insecure file uploads/downloads.
- **Injection Attacks:** SQL injection, NoSQL injection, or command injection via OCR processing or form inputs.
- **Privilege Escalation:** Exploiting role-based access control flaws to gain admin privileges.
- **Document Tampering:** Malicious file uploads (e.g., executable files disguised as PDFs) or OCR data manipulation.
- **Denial of Service (DoS):** Overwhelming the API with requests or uploading massive files to exhaust storage.
- **Man-in-the-Middle (MitM):** Intercepting unencrypted communications between mobile/web clients and the backend.

## Authentication & Authorization Design

### JWT Authentication Flow

**Token Structure:**
- **Access Token:** Short-lived (15 minutes), contains user ID, role, and permissions. Used for API requests.
- **Refresh Token:** Long-lived (7 days), stored securely on the client. Used to obtain a new access token without re-authentication.

**Implementation Details:**
- Tokens are signed using RS256 (RSA Signature with SHA-256) with a private key held exclusively by the backend.
- The public key is distributed to clients for token verification (if needed for offline validation).
- Tokens include a `jti` (JWT ID) claim to enable token revocation via a blacklist.
- All tokens include an `iat` (issued at) and `exp` (expiration) claim for time-based validation.

**Login Workflow:**
1. User submits credentials (email/username and password) via HTTPS POST to `/auth/login`.
2. Backend validates credentials against the hashed password in the database.
3. Upon successful validation, the backend generates an access token and refresh token.
4. Access token is returned in the response body; refresh token is set as an HTTP-only, secure cookie (for web) or stored securely in device keychain (for mobile).
5. Client stores the access token in memory (not localStorage) to prevent XSS attacks.

**Token Refresh Workflow:**
1. When the access token expires, the client sends the refresh token to `/auth/refresh`.
2. Backend validates the refresh token and issues a new access token.
3. If the refresh token is invalid or expired, the user is redirected to login.

**Logout Workflow:**
1. Client sends a logout request to `/auth/logout` with the current access token.
2. Backend adds the token's `jti` to a token blacklist (Redis cache with TTL matching token expiration).
3. Backend clears the refresh token cookie (for web) or signals the mobile app to clear the keychain entry.

### Role-Based Access Control (RBAC)

**Roles:**
- **Personnel:** Teaching and Non-Teaching staff. Can manage own profile, initiate transactions, upload documents, and view own career record.
- **AO II (Administrative Officer II):** Can distribute credentials, validate submitted documents, and view all transactions.
- **HRMO (Human Resource Management Officer):** Can approve/reject transactions, manage promotion cycles, configure promotion rules, and generate reports.
- **Records Personnel:** Can access and manage the digital 201 repository and apply archival policies.
- **System Administrator:** Full system access, including user account management, system configuration, and audit log access.

**Permission Enforcement:**
- Every API endpoint enforces role-based permissions via middleware that checks the user's role and permissions against a permission matrix.
- The permission matrix is defined in the database and cached in memory for performance.
- Permissions are evaluated at the endpoint level; sensitive operations (e.g., approving a transaction) require explicit permission checks.
- Field-level access control is enforced for sensitive attributes (e.g., salary information is only visible to HRMO and SysAdmin).

**Permission Matrix:** See PRD.md for the complete permissions matrix.

### Session Management

- **Session Timeout:** Web sessions expire after 30 minutes of inactivity. Mobile sessions expire after 60 minutes of inactivity.
- **Concurrent Sessions:** A user may have up to 3 concurrent sessions (e.g., web and mobile). Logging in from a new device invalidates the oldest session.
- **Session Tracking:** All active sessions are tracked in the database with device information, IP address, and last activity timestamp.
- **Forced Logout:** Admins can force-logout a user from all sessions via the admin dashboard for security incidents.

## Data Encryption

### Encryption at Rest

**Database Encryption:**
- PostgreSQL is configured with Transparent Data Encryption (TDE) at the storage layer (AWS RDS encryption).
- All sensitive fields (passwords, PII, document metadata) are encrypted using AES-256-GCM at the application level before being stored in the database.
- Encryption keys are managed via AWS Key Management Service (KMS) with automatic key rotation every 90 days.

**File Storage Encryption:**
- All files uploaded to Supabase Storage are encrypted using AES-256 at rest.
- Supabase Storage enforces server-side encryption with AWS S3 backend encryption.
- Access to files is controlled via signed URLs with expiration times (default: 1 hour).

**Backup Encryption:**
- Daily automated backups of the PostgreSQL database are encrypted using AES-256.
- Backups are stored in AWS S3 with versioning enabled and a 30-day retention policy.
- Backup encryption keys are stored separately from the backups in AWS KMS.

### Encryption in Transit

- **HTTPS/TLS:** All communication between clients (web and mobile) and the backend is encrypted using TLS 1.2 or higher.
- **Certificate Management:** SSL/TLS certificates are issued by AWS Certificate Manager and auto-renewed 30 days before expiration.
- **HSTS:** HTTP Strict-Transport-Security (HSTS) headers are enabled with a max-age of 31536000 seconds (1 year) to prevent downgrade attacks.
- **Certificate Pinning (Mobile):** The Flutter mobile app implements certificate pinning to prevent MitM attacks via compromised Certificate Authorities.

### Password Hashing

- **Algorithm:** Passwords are hashed using Argon2id with the following parameters:
  - Memory cost: 64 MB
  - Time cost: 3 iterations
  - Parallelism: 4 threads
  - Salt length: 16 bytes (automatically generated)
- **Verification:** During login, the submitted password is hashed using the same parameters and compared against the stored hash.
- **Password Policy:** Passwords must be at least 12 characters long, include uppercase, lowercase, numbers, and special characters. Passwords are checked against a list of common/compromised passwords.

## OWASP Top 10 Mitigations

### A01:2021 – Broken Access Control
- **Mitigation:** Implement strict RBAC with permission checks at every endpoint. Use middleware to enforce authorization before processing requests. Conduct regular access control audits.
- **Implementation:** All endpoints validate user role and permissions. Sensitive operations require explicit permission checks and are logged.

### A02:2021 – Cryptographic Failures
- **Mitigation:** Encrypt all sensitive data at rest (AES-256) and in transit (TLS 1.2+). Use strong key management via AWS KMS. Avoid hardcoding secrets.
- **Implementation:** Database encryption, file storage encryption, HTTPS enforcement, and secure key rotation.

### A03:2021 – Injection
- **Mitigation:** Use parameterized queries for all database operations. Validate and sanitize all user inputs. Use ORM frameworks (Sequelize or TypeORM) to prevent SQL injection.
- **Implementation:** All database queries use parameterized statements. Input validation is performed on both client and server. OCR output is sanitized before storage.

### A04:2021 – Insecure Design
- **Mitigation:** Follow secure design principles during development. Conduct threat modeling and security reviews. Implement security by default.
- **Implementation:** Threat model documented in this file. Security requirements integrated into the development lifecycle. Regular security reviews during sprints.

### A05:2021 – Security Misconfiguration
- **Mitigation:** Use infrastructure-as-code (Terraform) to ensure consistent, secure configurations. Disable unnecessary services and ports. Apply security hardening guidelines.
- **Implementation:** AWS security groups restrict inbound traffic to necessary ports only. Database is not publicly accessible. Regular security configuration audits.

### A06:2021 – Vulnerable and Outdated Components
- **Mitigation:** Maintain a Software Bill of Materials (SBOM). Regularly update dependencies. Use automated dependency scanning tools (e.g., Snyk, Dependabot).
- **Implementation:** Automated dependency updates via Dependabot. Weekly security scans of npm packages. Regular patching of OS and runtime environments.

### A07:2021 – Authentication Failures
- **Mitigation:** Implement strong authentication (JWT with short-lived tokens). Enforce multi-factor authentication (MFA) for admin accounts. Implement account lockout after failed login attempts.
- **Implementation:** JWT-based authentication with refresh tokens. MFA (TOTP) required for AO II, HRMO, and SysAdmin accounts. Account lockout after 5 failed attempts (15-minute cooldown).

### A08:2021 – Software and Data Integrity Failures
- **Mitigation:** Verify the integrity of downloaded files using checksums. Sign API responses to prevent tampering. Use secure, trusted dependencies.
- **Implementation:** All uploaded documents are scanned for malware. File integrity is verified using SHA-256 checksums. API responses include integrity signatures.

### A09:2021 – Logging and Monitoring Failures
- **Mitigation:** Implement comprehensive audit logging for all significant actions. Monitor logs for suspicious activity. Set up alerts for security events.
- **Implementation:** See "Audit Logging & Monitoring" section below.

### A10:2021 – Server-Side Request Forgery (SSRF)
- **Mitigation:** Validate and whitelist all URLs used in server-side requests (e.g., OCR API calls). Restrict outbound traffic to known endpoints. Use network segmentation.
- **Implementation:** All external API calls (Google Cloud Vision, Supabase) are made to whitelisted endpoints. Outbound traffic is restricted via AWS security groups.

## Audit Logging & Monitoring

### Audit Log Scope

The following actions are logged with full context:
- **User Management:** Account creation, modification, deletion, role changes, password resets.
- **Authentication:** Login attempts (successful and failed), logout, token refresh, MFA events.
- **Transaction Lifecycle:** Transaction initiation, document upload, validation, approval, rejection, archival.
- **Data Access:** Viewing personnel records, accessing career history, exporting reports.
- **System Administration:** Configuration changes, promotion rule updates, user account lockouts, system alerts.

### Audit Log Structure

Each audit log entry contains:
- **Timestamp:** ISO 8601 format with millisecond precision.
- **User ID:** Identifier of the user performing the action.
- **User Role:** Role of the user at the time of the action.
- **Action:** Specific action performed (e.g., "DOCUMENT_UPLOADED", "TRANSACTION_APPROVED").
- **Resource:** Identifier of the resource affected (e.g., transaction ID, user ID).
- **Details:** Contextual information (e.g., document type, approval reason).
- **IP Address:** Source IP address of the request.
- **User Agent:** Browser or mobile app identifier.
- **Status:** Success or failure of the action.
- **Error Message:** If the action failed, the error message.

### Audit Log Storage & Retention

- Audit logs are stored in a dedicated PostgreSQL table with immutable records (no UPDATE or DELETE operations allowed).
- Logs are indexed by timestamp, user ID, and action for efficient querying.
- Logs are retained for a minimum of 7 years in compliance with government record retention policies.
- Logs older than 1 year are archived to AWS S3 Glacier for cost-effective long-term storage.
- A daily automated backup of audit logs is performed and encrypted.

### Monitoring & Alerting

- **Real-Time Monitoring:** A monitoring dashboard displays real-time system metrics (API response times, error rates, active users).
- **Security Alerts:** Automated alerts are triggered for suspicious activities:
  - Multiple failed login attempts from the same IP address.
  - Unusual data access patterns (e.g., bulk downloads of personnel records).
  - Unauthorized permission changes.
  - System errors or exceptions.
- **Alert Channels:** Alerts are sent via email to the SysAdmin and HRMO personnel. Critical alerts trigger SMS notifications.
- **Log Analysis:** Weekly automated reports summarize audit logs, highlighting anomalies and compliance violations.

## Compliance Requirements

### Data Privacy & Protection

**Government Data Protection Standards:**
- The system complies with the **Data Privacy Act of 2012 (Republic Act 10173)** of the Philippines, which governs the collection, processing, and storage of personal data.
- All PII (names, birthdates, contact information, educational records) is classified as sensitive personal information and is subject to strict access controls.
- Personnel have the right to access, correct, and request deletion of their personal data (subject to legal retention requirements).

**Data Minimization:**
- Only data necessary for HR transactions and career management is collected.
- Data is retained only as long as required by law or business necessity.
- Unnecessary data is securely deleted after the retention period expires.

**Consent & Transparency:**
- Personnel are informed of data collection, processing, and usage via a privacy notice displayed during account creation.
- Personnel explicitly consent to data processing before initiating transactions.
- A privacy policy is available in-app and on the web portal.

### Government Security Standards

**DepEd Information Security Policy:**
- The system adheres to DepEd's Information Security Policy, which mandates encryption, access controls, and audit logging.
- Regular security assessments and penetration testing are conducted to ensure compliance.

**Civil Service Commission (CSC) Records Management:**
- Personnel records are managed in accordance with CSC guidelines for the maintenance and archival of 201 files.
- Digital records are considered equivalent to physical records for legal and administrative purposes.

### Compliance Audits

- **Annual Security Audit:** An independent third-party conducts an annual security audit to verify compliance with data protection and security standards.
- **Penetration Testing:** Annual penetration testing is performed to identify and remediate vulnerabilities.
- **Compliance Certification:** The system maintains compliance certifications (e.g., ISO 27001 Information Security Management) as required by DepEd.

## Penetration Testing Scope

### In-Scope

- **Web Application:** All endpoints, authentication mechanisms, and authorization logic.
- **Mobile Application:** Authentication, data storage, API communication, and certificate pinning.
- **API Layer:** Input validation, rate limiting, error handling, and response validation.
- **Database:** SQL injection, privilege escalation, and unauthorized data access.
- **File Upload Mechanism:** Malicious file uploads, path traversal, and file type validation.
- **OCR Processing:** Injection attacks via OCR output, data extraction accuracy, and error handling.
- **Cloud Infrastructure:** AWS security groups, IAM policies, S3 bucket configurations, and KMS key management.

### Out-of-Scope

- **Third-Party Services:** Google Cloud Vision API, Supabase, AWS managed services (unless misconfigured by Eminence).
- **Physical Security:** Data center security, physical access controls.
- **Social Engineering:** Phishing, pretexting, or other social engineering attacks.
- **Denial of Service (DoS):** Large-scale network-level DoS attacks (application-level rate limiting is in scope).

### Testing Methodology

- **OWASP Testing Guide:** Penetration testing follows the OWASP Web Security Testing Guide (WSTG) v4.2.
- **Tools:** Industry-standard tools (Burp Suite, OWASP ZAP, Postman, etc.) are used for vulnerability scanning and exploitation.
- **Reporting:** Vulnerabilities are classified by severity (Critical, High, Medium, Low) and remediation timelines are established.
- **Remediation Verification:** After fixes are applied, re-testing is performed to verify remediation.

## Secure Development Practices

### Code Review & Security Review

- All code changes undergo peer review before merging to the main branch.
- Security-sensitive changes (authentication, authorization, encryption) require explicit security review by a designated security reviewer.
- Code review checklists include security considerations (input validation, error handling, logging).

### Dependency Management

- Dependencies are pinned to specific versions in `package-lock.json` (Node.js) to prevent unexpected updates.
- Automated dependency scanning (Dependabot, Snyk) is enabled to detect vulnerable packages.
- Critical vulnerabilities trigger immediate patching and deployment.
- A Software Bill of Materials (SBOM) is maintained and updated with each release.

### Secrets Management

- Secrets (API keys, database passwords, encryption keys) are never committed to version control.
- Secrets are stored in AWS Secrets Manager and injected into the application at runtime via environment variables.
- Secrets are rotated every 90 days or immediately upon compromise.
- Access to secrets is logged and monitored.

### Secure Configuration

- Configuration files are environment-specific (development, staging, production) and are not committed to version control.
- Sensitive configuration (database URLs, API endpoints) is injected via environment variables.
- Default configurations are secure (e.g., HTTPS enforced, debug mode disabled in production).

## Incident Response Plan

### Incident Classification

- **Critical:** Data breach, unauthorized access to PII, system unavailability affecting all users.
- **High:** Unauthorized access to limited data, partial system unavailability, security vulnerability with active exploitation.
- **Medium:** Security vulnerability without active exploitation, minor data inconsistency, performance degradation.
- **Low:** Non-security issues, informational alerts, minor bugs.

### Incident Response Workflow

1. **Detection:** Security alerts, user reports, or automated monitoring trigger incident detection.
2. **Triage:** Incident is classified by severity and assigned to the incident response team.
3. **Containment:** Immediate actions are taken to prevent further damage (e.g., disabling compromised accounts, isolating affected systems).
4. **Investigation:** Root cause analysis is performed to understand the scope and impact of the incident.
5. **Remediation:** Fixes are applied to address the root cause and prevent recurrence.
6. **Communication:** Affected users and stakeholders are notified of the incident and remediation steps.
7. **Post-Incident Review:** A post-incident review is conducted to identify lessons learned and improve processes.

### Incident Response Team

- **Security Lead:** Oversees incident response and coordinates with stakeholders.
- **Backend Engineer:** Investigates backend systems, databases, and logs.
- **DevOps Engineer:** Manages infrastructure, backups, and system recovery.
- **Legal/Compliance Officer:** Ensures compliance with data breach notification requirements.

### Notification Requirements

- **Data Breach Notification:** In the event of a confirmed data breach involving PII, affected individuals are notified within 72 hours as required by the Data Privacy Act.
- **Regulatory Notification:** DepEd and relevant authorities are notified of security incidents as required by law.
- **Transparency:** A public incident report is published (with sensitive details redacted) to maintain transparency and trust.

## Backup & Disaster Recovery

### Backup Strategy

- **Database Backups:** Automated daily backups of PostgreSQL database. Backups are encrypted and stored in AWS S3 with versioning enabled.
- **File Storage Backups:** Supabase Storage is configured with cross-region replication to ensure data availability in case of regional outages.
- **Backup Retention:** Backups are retained for 30 days. Monthly backups are retained for 1 year for long-term archival.
- **Backup Testing:** Monthly restore tests are performed to verify backup integrity and recovery procedures.

### Disaster Recovery Plan

- **Recovery Time Objective (RTO):** 4 hours (time to restore service after a disaster).
- **Recovery Point Objective (RPO):** 1 hour (maximum acceptable data loss).
- **Failover Strategy:** In case of primary region failure, the system automatically fails over to a secondary AWS region with pre-configured infrastructure.
- **Data Synchronization:** Database replication is configured with a 5-minute lag to the secondary region. File storage is replicated in real-time.
- **Failover Testing:** Quarterly disaster recovery drills are conducted to verify failover procedures and team readiness.

## Security Checklist for Deployment

Before deploying Eminence HRIS to production, the following security checks must be completed:

- [ ] All OWASP Top 10 vulnerabilities have been addressed and tested.
- [ ] Penetration testing has been completed with no critical or high-severity vulnerabilities remaining.
- [ ] SSL/TLS certificates are valid and properly configured.
- [ ] Database encryption is enabled and keys are managed via AWS KMS.
- [ ] All secrets are stored in AWS Secrets Manager and not hardcoded.
- [ ] Audit logging is enabled and logs are being collected.
- [ ] Multi-factor authentication (MFA) is enabled for all admin accounts.
- [ ] Rate limiting and DDoS protection are configured.
- [ ] Backup and disaster recovery procedures have been tested.
- [ ] Security documentation (this file) has been reviewed and approved by stakeholders.
- [ ] Security training has been completed by all development and operations staff.
- [ ] Incident response plan has been reviewed and team members are trained.

## Security Contacts & Escalation

- **Security Lead:** [Contact Information]
- **Incident Response Hotline:** [Phone Number]
- **Security Email:** security@eminence-hris.local
- **Escalation Path:** Security Lead → HRMO Director → DepEd IT Security Officer

---

**Document Version:** 1.0  
**Last Updated:** [Date]  
**Next Review Date:** [Date + 6 months]