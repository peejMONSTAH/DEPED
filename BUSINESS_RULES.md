# BUSINESS_RULES.md: Eminence HRIS

## Core Business Rules

### Personnel & Account Management

**BR-01:** A personnel account must be created by the System Administrator before the individual can access the system. AO II cannot create accounts; they can only distribute credentials.

**BR-02:** Each personnel record must be linked to exactly one role (Teaching Personnel or Non-Teaching Personnel) and cannot change roles without System Administrator intervention.

**BR-03:** Personnel credentials (username and temporary password) must be distributed by AO II and must be changed by the user on first login.

**BR-04:** A personnel profile is considered complete only when all mandatory fields (name, contact details, educational background, employment history) are populated.

**BR-05:** Personnel cannot initiate a transaction if their profile is incomplete.

### Transaction Lifecycle & Submission

**BR-06:** A transaction can only be initiated by the personnel who owns the profile. No proxy submissions are permitted.

**BR-07:** Once a transaction is submitted, the personnel cannot modify or re-upload documents without explicit permission from AO II (via deficiency notification).

**BR-08:** A transaction must pass automated compliance checking before it can be marked as "Ready for Validation" and routed to AO II.

**BR-09:** If automated compliance checking detects missing or invalid documents, the system must notify the personnel with a deficiency list and allow re-submission within 14 calendar days.

**BR-10:** A transaction that remains in "Deficiency" status for more than 14 days without re-submission shall be automatically marked as "Abandoned" and archived.

**BR-11:** AO II validation is mandatory before HRMO approval. HRMO cannot approve a transaction that has not been validated by AO II.

**BR-12:** HRMO approval is the final step in the transaction workflow. Once approved, the transaction triggers an automatic update to the personnel's career record and digital 201 file.

### Document Upload & OCR Validation

**BR-13:** All uploaded documents must be in one of the following formats: PDF, JPEG, PNG, or TIFF. File size must not exceed 10 MB per document.

**BR-14:** Upon document upload, the system must automatically invoke OCR (Google Cloud Vision AI) to extract key data fields (e.g., document date, issuer, certification details).

**BR-15:** The personnel must review OCR-extracted data and confirm accuracy or flag discrepancies before submission. This is the "personnel_self_correction" workflow.

**BR-16:** If OCR extraction fails or confidence score is below 70%, the system must flag the document as "Requires Manual Review" and notify AO II.

**BR-17:** Duplicate document detection must be performed automatically. If a document with identical content (hash-based comparison) is detected in the system, the system must alert the personnel and prevent re-submission of the duplicate.

**BR-18:** All uploaded documents must be encrypted at rest using AES-256 and stored in Supabase Storage with access logs maintained.

### Dynamic Checklist & Requirements

**BR-19:** The dynamic checklist must be generated based on the transaction type selected and the personnel's current profile data (e.g., years of service, educational qualifications, prior transactions).

**BR-20:** The checklist generation logic must use AI-driven suggestions to recommend documents based on DepEd regulations and the personnel's eligibility criteria.

**BR-21:** If a personnel's profile data changes after a transaction is initiated, the checklist must be automatically regenerated and the personnel must be notified of any new requirements.

**BR-22:** A checklist item can be marked as "Not Applicable" only if explicitly approved by AO II. Self-marking as "Not Applicable" is not permitted.

### Compliance Monitoring & Deficiency Management

**BR-23:** Compliance checking must be performed in two stages: (1) automated system checks, and (2) manual validation by AO II.

**BR-24:** Automated compliance checks must verify: document presence, file format validity, OCR confidence scores, and duplicate detection.

**BR-25:** If a deficiency is detected, the system must generate a deficiency notice with specific details (missing document, invalid format, OCR confidence issue) and send it to the personnel via in-app notification and email.

**BR-26:** AO II must document the reason for any rejection or deficiency flagging in the system. This reason must be visible to the personnel and included in audit logs.

**BR-27:** A transaction cannot be re-submitted more than 3 times. After 3 rejections, the transaction must be escalated to HRMO for manual review or closure.

### Promotion & Ranking Management

**BR-28:** Promotion eligibility is determined by a configurable rules engine managed by HRMO. Rules must include criteria such as: years of service, educational qualifications, training completion, performance ratings, and plantilla availability.

**BR-29:** A personnel can apply for promotion only if they meet all mandatory eligibility criteria defined in the active promotion cycle rules.

**BR-30:** Promotion cycles (Reclassification, Natural Vacancy, ECP) must be explicitly opened by HRMO. Personnel cannot apply outside of an active promotion cycle.

**BR-31:** Once a promotion cycle is closed by HRMO, no new applications can be submitted. Existing applications remain under review until final ranking is published.

**BR-32:** Promotion ranking must be calculated automatically based on the configured rules engine. Manual rank adjustments by HRMO are permitted only with documented justification in the audit trail.

**BR-33:** Promotion results (rank-ordered list) must be published simultaneously to all applicants. Individual results must be visible to the applicant and their AO II.

**BR-34:** A personnel who is promoted must have their career record automatically updated with the new position, salary grade, and effective date.

**BR-35:** Promotion records must be retained indefinitely in the digital archive, even if a personnel is later demoted or separated.

### Career Record & Digital 201 File

**BR-36:** The digital 201 file is a read-only, version-controlled repository of all validated documents and career milestones for a personnel member.

**BR-37:** Every update to a personnel's career record (promotion, reclassification, training completion, transaction approval) must create a new version entry with timestamp and user attribution.

**BR-38:** Personnel can view their own career record in full. AO II, HRMO, and Records Personnel can view any personnel's career record based on their role permissions.

**BR-39:** The career record must include: service history, educational background, training records, promotion history, transaction history, and a repository of all validated documents.

**BR-40:** Career records must be retained for a minimum of 5 years after personnel separation or retirement, per DepEd policy.

### Notifications & Communication

**BR-41:** The primary notification strategy is in-app notifications supplemented by email. SMS notifications are not supported in v1.0.

**BR-42:** All transaction status changes (submitted, validated, approved, rejected, deficiency) must trigger an automatic notification to the personnel.

**BR-43:** Deficiency notifications must include specific details about missing or invalid documents and a clear deadline for re-submission (14 days).

**BR-44:** Promotion cycle announcements, results, and deadline reminders must be sent to all eligible personnel via in-app and email notifications.

**BR-45:** System alerts (e.g., maintenance windows, security incidents) must be sent to all administrative users (AO II, HRMO, Records, SysAdmin) via in-app notification.

### Role-Based Access & Permissions

**BR-46:** System Administrator has full CRUD access to all user accounts, roles, and system configurations. SysAdmin actions are logged with full audit trail.

**BR-47:** AO II can create and manage personnel accounts, distribute credentials, validate submitted transactions, and view all personnel records. AO II cannot approve transactions or modify promotion rules.

**BR-48:** HRMO can approve transactions, manage promotion cycles, configure promotion rules, generate reports, and view all personnel records. HRMO cannot create user accounts or distribute credentials.

**BR-49:** Records Personnel can access the digital 201 repository, manage archival policies, and generate archival reports. Records Personnel cannot validate or approve transactions.

**BR-50:** Personnel can only view and edit their own profile and career record. They cannot access other personnel's records.

**BR-51:** All role-based access decisions must be enforced at both the API level (backend authorization) and the UI level (frontend permission checks).

### Data Integrity & Audit

**BR-52:** All significant system actions (user login, document upload, validation, approval, account creation, rule changes) must be logged with: user ID, timestamp, action type, affected entity, and outcome.

**BR-53:** Audit logs must be immutable and retained for a minimum of 7 years.

**BR-54:** Personnel data must be backed up daily with automated backup retention of 30 days. Backup integrity must be verified weekly.

**BR-55:** Any data modification (e.g., correction of OCR errors, profile updates) must be tracked with before/after values and user attribution.

**BR-56:** System administrators must have the ability to generate audit reports filtered by user, date range, action type, and affected entity.

### Security & Authentication

**BR-57:** All users must authenticate using JWT-based credentials. Session tokens must expire after 30 minutes of inactivity.

**BR-58:** Passwords must be hashed using Argon2 or bcrypt and must meet minimum complexity requirements: at least 8 characters, including uppercase, lowercase, numbers, and special characters.

**BR-59:** Failed login attempts must be rate-limited: after 5 consecutive failed attempts, the account must be locked for 15 minutes.

**BR-60:** All data in transit must be encrypted using TLS 1.2 or higher (HTTPS). All data at rest must be encrypted using AES-256.

**BR-61:** Sensitive personally identifiable information (PII) must be masked in logs and reports. Full PII is visible only to authorized personnel (HRMO, Records, SysAdmin).

**BR-62:** The system must implement session timeout with automatic logout after 30 minutes of inactivity. Users must be warned 5 minutes before timeout.

---

## Domain Constraints & Validation Rules

### Personnel Profile Constraints

| Field | Constraint | Validation Rule |
|:---|:---|:---|
| Employee ID | Unique, immutable | Must match DepEd employee registry format (e.g., `XXXXXX-YYYY`) |
| Full Name | Required | Must contain at least 2 words; no special characters except hyphens and apostrophes |
| Email | Required, unique | Must be valid email format; must be unique across all users |
| Contact Number | Required | Must be valid Philippine phone number format (11 digits) |
| Date of Birth | Required | Must be at least 18 years old; cannot be in the future |
| Years of Service | Calculated | Auto-calculated from hire date; read-only field |
| Educational Attainment | Required | Must select from predefined list (HS, Bachelor's, Master's, Doctorate) |
| Position | Required | Must match active plantilla positions |

### Transaction Constraints

| Constraint | Rule |
|:---|:---|
| Transaction Type | Must be one of: Promotion, Reclassification, Natural Vacancy, ECP, Profile Update |
| Status Lifecycle | Initiated → Submitted → Validated → Approved → Completed (or Rejected/Abandoned at any stage) |
| Document Count | Minimum 1, maximum 50 documents per transaction |
| Re-submission Limit | Maximum 3 re-submissions per transaction |
| Time to Deficiency Resolution | 14 calendar days |
| Time to Abandonment | 14 calendar days without re-submission |

### Promotion Eligibility Constraints

| Criteria | Constraint |
|:---|:---|
| Minimum Years of Service | Configurable by HRMO; typically 2–5 years depending on promotion type |
| Educational Qualification | Must meet minimum education level for target position |
| Training Requirements | Must have completed mandatory training courses (configurable) |
| Performance Rating | Must have minimum performance rating (if applicable) |
| Plantilla Availability | Target position must have available slots in active plantilla |
| Concurrent Applications | Personnel cannot apply for multiple positions in the same promotion cycle |

### Document Upload Constraints

| Constraint | Rule |
|:---|:---|
| File Format | PDF, JPEG, PNG, TIFF only |
| File Size | Maximum 10 MB per document |
| Total Transaction Size | Maximum 500 MB per transaction |
| OCR Confidence Threshold | Minimum 70% for auto-acceptance; below 70% requires manual review |
| Duplicate Detection | Hash-based comparison; identical documents flagged and prevented |
| Expiration | Documents older than 5 years may be flagged for renewal (configurable by HRMO) |

---

## Status Transition Table

### Transaction Status Lifecycle

| Current State | Event/Action | New State | Notes/Side Effects |
|:---|:---|:---|:---|
| Initiated | Personnel completes checklist & uploads docs | Submitted | System performs automated compliance check |
| Submitted | Automated compliance check passes | Ready for Validation | AO II notified; transaction queued for validation |
| Submitted | Automated compliance check fails | Deficiency | Personnel notified with deficiency list; 14-day re-submission window opens |
| Deficiency | Personnel re-submits documents | Submitted | Automated compliance check re-runs |
| Deficiency | 14 days elapse without re-submission | Abandoned | Transaction archived; personnel notified |
| Deficiency | 3rd rejection occurs | Escalated | HRMO notified for manual review |
| Ready for Validation | AO II validates documents | Validated | HRMO notified; transaction queued for approval |
| Ready for Validation | AO II flags discrepancies | Deficiency | Personnel notified; re-submission window opens |
| Validated | HRMO approves transaction | Approved | Career record updated; digital 201 file updated; personnel notified |
| Validated | HRMO rejects transaction | Rejected | Personnel notified with rejection reason; transaction archived |
| Approved | Career record update completes | Completed | Transaction archived; audit log entry created |
| Escalated | HRMO manual review completes | Approved or Rejected | Outcome notified to personnel and AO II |

### Promotion Cycle Status Lifecycle

| Current State | Event/Action | New State | Notes/Side Effects |
|:---|:---|:---|:---|
| Planning | HRMO configures rules & criteria | Configured | Rules engine updated; ready for opening |
| Configured | HRMO opens cycle | Active | Personnel notified; application window opens |
| Active | Application deadline reached | Closed | No new applications accepted; ranking calculation begins |
| Closed | Ranking calculation completes | Results Ready | Results generated; ready for publication |
| Results Ready | HRMO publishes results | Published | All applicants notified with individual results; rank-ordered list visible |
| Published | Personnel accept/decline promotion | Finalized | Accepted promotions trigger career record updates |

### User Account Status Lifecycle

| Current State | Event/Action | New State | Notes/Side Effects |
|:---|:---|:---|:---|
| Pending | SysAdmin creates account | Pending | Temporary password generated; AO II notified to distribute credentials |
| Pending | AO II distributes credentials | Active | Personnel can now log in; must change password on first login |
| Active | Personnel changes password | Active | Session remains valid; audit log entry created |
| Active | Account locked (5 failed logins) | Locked | Personnel cannot log in; SysAdmin must unlock |
| Active | SysAdmin deactivates account | Inactive | Personnel cannot log in; existing sessions terminated |
| Inactive | SysAdmin reactivates account | Active | Personnel can log in again |
| Active or Inactive | Personnel separates/retires | Archived | Account retained for audit purposes; career record preserved |

---

## Promotion & Ranking Logic

### Promotion Eligibility Calculation

The system uses a configurable rules engine to determine promotion eligibility. HRMO defines rules without code changes.

**Rule Components:**
- **Mandatory Criteria:** Must all be satisfied (AND logic)
  - Minimum years of service
  - Educational qualification level
  - Required training completion
  - Plantilla position availability
  
- **Scoring Criteria:** Contribute to ranking score (weighted sum)
  - Years of service (weight: configurable, e.g., 20%)
  - Training hours completed (weight: configurable, e.g., 15%)
  - Performance rating (weight: configurable, e.g., 30%)
  - Seniority in current position (weight: configurable, e.g., 20%)
  - Other custom criteria (weight: configurable, e.g., 15%)

**Eligibility Formula:**
```
IF (all mandatory criteria met) THEN
  Eligible = TRUE
  Ranking Score = Σ(criterion_value × criterion_weight)
ELSE
  Eligible = FALSE
  Ranking Score = NULL
END IF
```

**Ranking Output:**
- Personnel are ranked in descending order by Ranking Score
- Ties are broken by seniority (years of service, then hire date)
- Final rank-ordered list is published with scores visible to HRMO and personnel

### Promotion Cycle Types

| Cycle Type | Description | Eligibility Rules | Frequency |
|:---|:---|:---|:---|
| **Reclassification** | Promotion within same position level | Minimum 2 years service; education match | Annual or as needed |
| **Natural Vacancy** | Promotion to fill vacant position | Minimum 3 years service; education match | As vacancies arise |
| **ECP (Exceptional Career Progression)** | Fast-track promotion for high performers | Minimum 1 year service; high performance rating | Quarterly or as approved |

---

## Role Access Policies

### System Administrator
- **Account Management:** Full CRUD on all user accounts, roles, and permissions
- **System Configuration:** Manage system settings, backup policies, security parameters
- **Audit Access:** View all audit logs without restrictions
- **Data Management:** Export/import personnel data, manage database backups
- **Limitations:** Cannot validate transactions, approve promotions, or manage HR policies

### AO II (Administrative Officer II)
- **Personnel Management:** Create and manage personnel accounts; distribute credentials
- **Transaction Validation:** Access validation queue; review documents; flag deficiencies; mark as validated
- **Document Review:** View OCR-extracted data; compare with uploaded documents; request re-uploads
- **Personnel Records:** View all personnel profiles and career records (read-only)
- **Reporting:** Generate compliance and transaction reports
- **Limitations:** Cannot approve transactions, manage promotion cycles, or modify promotion rules

### HRMO (Human Resource Management Officer)
- **Transaction Approval:** Review validated transactions; approve or reject; update career records
- **Promotion Management:** Open/close promotion cycles; configure promotion rules; generate rankings
- **Policy Configuration:** Define eligibility criteria, scoring weights, and promotion cycle parameters
- **Personnel Records:** View all personnel profiles and career records; access digital 201 repository
- **Reporting:** Generate comprehensive HR reports, promotion outcomes, compliance statistics
- **Limitations:** Cannot create user accounts, validate transactions, or manage archival policies

### Records Personnel
- **Digital Repository:** Search and access complete digital 201 files for all personnel
- **Archival Management:** Manage document retention policies; archive completed transactions; manage lifecycle
- **Archival Reporting:** Generate archival status reports and retention compliance reports
- **Audit Access:** View audit logs related to document archival and retention
- **Limitations:** Cannot validate or approve transactions, manage personnel accounts, or configure promotion rules

### Personnel (Teaching & Non-Teaching)
- **Profile Management:** View and edit own profile; update contact information and educational background
- **Transaction Initiation:** Select transaction type; view dynamic checklist; upload documents
- **Document Upload:** Upload documents via camera or file selection; review OCR-extracted data; confirm accuracy
- **Transaction Tracking:** View transaction status in real-time; receive notifications on status changes
- **Career Record:** View own career record (read-only); access repository of validated documents
- **Promotion Application:** Apply for promotion during active cycles; view ranking results
- **Limitations:** Cannot access other personnel's records, validate documents, approve transactions, or manage system settings

---

## Compliance & Audit Requirements

### Mandatory Audit Logging

The following actions must be logged with full details (user, timestamp, action, entity, outcome):

- User login/logout
- Account creation, modification, deactivation
- Document upload, deletion, re-upload
- OCR extraction and data confirmation
- Transaction submission, validation, approval, rejection
- Deficiency flagging and resolution
- Promotion cycle creation, rule configuration, opening, closing, result publication
- Career record updates
- Permission changes
- Report generation
- Data exports
- System configuration changes

### Audit Log Retention & Access

- **Retention Period:** Minimum 7 years
- **Access Control:** SysAdmin (full access), HRMO (filtered access), AO II (limited access), Records Personnel (archival-related only)
- **Immutability:** Audit logs cannot be modified or deleted; only new entries can be appended
- **Export:** Authorized users can export audit logs in CSV or PDF format with date/user/action filters

---

## Data Privacy & Security Constraints

**BR-63:** Personally identifiable information (PII) must be classified and handled according to DepEd data privacy policies.

**BR-64:** Access to PII must be logged and restricted to authorized personnel based on role and business need.

**BR-65:** PII must be masked in system logs, reports, and error messages. Full PII is visible only in secure, authorized contexts.

**BR-66:** Data breach incidents must be reported to DepEd leadership within 24 hours and documented in the audit trail.

**BR-67:** Personnel have the right to request access to their own data and to request corrections or deletions (subject to legal retention requirements).

**BR-68:** Third-party integrations (e.g., OCR service, notification service) must comply with data privacy agreements and must not retain PII beyond the scope of the service.

---

## System Constraints & Operational Rules

**BR-69:** The system must maintain 99.5% uptime during business hours (Monday–Friday, 6 AM–6 PM). Scheduled maintenance windows must be announced at least 48 hours in advance.

**BR-70:** All API responses must complete within 250 milliseconds (p95). OCR processing must complete within 10 seconds per page.

**BR-71:** The system must support concurrent access by 100+ web users and 1,000+ mobile users without performance degradation.

**BR-72:** Daily automated backups must be performed with 30-day retention. Backup integrity must be verified weekly.

**BR-73:** The system must be deployable to AWS infrastructure with auto-scaling capabilities for handling traffic spikes.

**BR-74:** All system components must be monitored for availability, performance, and security. Alerts must be triggered for anomalies and escalated to SysAdmin.