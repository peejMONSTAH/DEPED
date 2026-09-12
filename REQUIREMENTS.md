# REQUIREMENTS.md: Eminence HRIS

## Functional Requirements

### User-Facing (Mobile App)

#### FR-01: Authentication
Users MUST log in using secure credentials provided by the AO II. The session SHALL be managed via JWT.
*   AC1: The system SHALL present a login screen requiring a username and password.
*   AC2: Upon successful authentication, the system SHALL issue a JSON Web Token (JWT) for session management.
*   AC3: The system SHALL automatically log out inactive users after a predefined period.

#### FR-02: Profile Management
Users SHALL be able to view and edit their personal information, educational background, and contact details.
*   AC1: Users SHALL be able to view their current personal, educational, and contact information.
*   AC2: Users SHALL be able to update specific editable fields (e.g., contact number, email address) and save changes.
*   AC3: The system SHALL validate user input for data type and format correctness before saving profile updates.

#### FR-03: Transaction Initiation
Users SHALL be able to select and initiate new HR transactions (e.g., Promotion, Reclassification).
*   AC1: Users SHALL be presented with a list of available HR transaction types relevant to their role.
*   AC2: Users SHALL be able to select a transaction type and begin the submission process.
*   AC3: The system SHALL record the initiation of a new transaction with a unique identifier and timestamp.

#### FR-04: Dynamic Checklist
The system SHALL generate an AI-driven, dynamic checklist of required documents based on the selected transaction type and the user's current profile data.
*   AC1: Upon selecting a transaction, the system SHALL display a checklist of documents required for that specific transaction.
*   AC2: The checklist SHALL dynamically adapt based on the user's existing profile data (e.g., current position, qualifications).
*   AC3: Each item in the checklist SHALL clearly indicate its status (e.g., required, optional, uploaded, deficient).

#### FR-05: Document Upload
Users SHALL be able to upload documents using the device camera or by selecting files from device storage.
*   AC1: Users SHALL be able to capture an image of a physical document using their device's camera.
*   AC2: Users SHALL be able to select and upload digital document files (e.g., PDF, JPEG) from their device's local storage.
*   AC3: The system SHALL support uploading multiple documents for a single checklist item or transaction.

#### FR-06: OCR Self-Correction
Upon upload, the system SHALL use OCR to extract key data. The user MUST be prompted to review the extracted data and confirm its accuracy or flag it for re-upload before submission.
*   AC1: After a document upload, the system SHALL display the OCR-extracted text and data fields.
*   AC2: Users SHALL be able to review the extracted data and make corrections to any inaccuracies.
*   AC3: Users SHALL be able to confirm the accuracy of the extracted data or mark the document for re-upload if OCR quality is insufficient.

#### FR-07: Submission & Tracking
Users SHALL be able to submit their completed transaction package and track its status in real-time (e.g., Pending Validation, For Approval, Approved).
*   AC1: Users SHALL be able to submit a transaction package once all required documents are uploaded and OCR data is confirmed.
*   AC2: Users SHALL be able to view a list of all their submitted transactions with their current status.
*   AC3: The transaction status SHALL update automatically as it progresses through the administrative workflow.

#### FR-08: Notifications
Users SHALL receive in-app and email notifications for transaction status changes, document deficiencies, and approvals.
*   AC1: Users SHALL receive an in-app notification for any change in their transaction status.
*   AC2: Users SHALL receive an email notification for critical updates such as transaction approval, rejection, or identified deficiencies.
*   AC3: Notifications SHALL include the transaction ID and a clear description of the update.

#### FR-09: Career Record
Users SHALL be able to view a consolidated, read-only digital career record, including service history, training completed, and a repository of all validated documents.
*   AC1: Users SHALL be able to access a dedicated section displaying their comprehensive career record.
*   AC2: The career record SHALL include details such as service history, educational qualifications, and completed training programs.
*   AC3: Users SHALL be able to view and download validated documents associated with their career record.

### Admin-Facing (Web App)

#### FR-10: Admin Dashboard
AO II and HRMO users SHALL see a dashboard summarizing pending tasks, transaction volumes, compliance rates, and system alerts.
*   AC1: AO II users SHALL see a dashboard displaying pending validation tasks and transaction statistics relevant to their role.
*   AC2: HRMO users SHALL see a dashboard displaying pending approval tasks, overall compliance rates, and system-wide alerts.
*   AC3: The dashboard SHALL provide actionable insights and quick navigation to modules requiring attention.

#### FR-11: Personnel Management
Admins (SysAdmin, AO II) SHALL be able to create and manage personnel accounts. SysAdmin MUST have full CRUD control over all user accounts.
*   AC1: System Administrators SHALL be able to create, read, update, and delete any user account.
*   AC2: AO II personnel SHALL be able to create new personnel accounts and assign initial login credentials.
*   AC3: The system SHALL enforce unique usernames and validate email formats during account creation and updates.

#### FR-12: Document Validation Workflow
AO II users SHALL be able to access a queue of submitted transactions. They MUST be able to view uploaded documents alongside OCR-extracted data, flag discrepancies, or mark documents as validated.
*   AC1: AO II users SHALL have access to a dedicated queue of transactions awaiting document validation.
*   AC2: For each transaction, AO II users SHALL be able to view the original uploaded document and its corresponding OCR-extracted data side-by-side.
*   AC3: AO II users SHALL be able to mark a document as validated, flag it for deficiency with comments, or request a re-upload.

#### FR-13: Transaction Approval
HRMO users SHALL be able to review transactions validated by the AO II. They MUST have the final authority to approve or reject a transaction, triggering a career record update.
*   AC1: HRMO users SHALL have access to a queue of transactions that have completed the validation stage and are awaiting approval.
*   AC2: HRMO users SHALL be able to review all validated documents and AO II comments for each transaction.
*   AC3: HRMO users SHALL be able to approve or reject a transaction, providing a mandatory reason for rejection.
*   AC4: Upon approval, the system SHALL automatically update the relevant personnel's career record.

#### FR-14: Configurable Promotion Engine
HRMO users MUST have an interface to define and manage the criteria for promotions (e.g., points for training, required years of service) via a configurable rules engine without requiring code changes.
*   AC1: HRMO users SHALL be able to access a dedicated interface for configuring promotion criteria and rules.
*   AC2: HRMO users SHALL be able to define rules based on various personnel attributes (e.g., education, experience, training, performance ratings).
*   AC3: The system SHALL allow HRMO users to assign weights or points to different promotion criteria.

#### FR-15: Promotion Management
HRMO users SHALL be able to open, manage, and close promotion cycles (Reclassification, Natural Vacancy, ECP) and generate rank-ordered lists based on the configured rules.
*   AC1: HRMO users SHALL be able to initiate and define the parameters for a new promotion cycle.
*   AC2: HRMO users SHALL be able to view all applicants for a promotion cycle and their calculated scores based on the configured rules.
*   AC3: HRMO users SHALL be able to generate and export a rank-ordered list of candidates for a specific promotion cycle.

#### FR-16: Digital 201 Repository
Authorized admin users (HRMO, Records) SHALL be able to search for and view any employee's complete, version-controlled digital 201 file.
*   AC1: HRMO and Records Personnel SHALL be able to search for personnel records using criteria such as name or employee ID.
*   AC2: Authorized users SHALL be able to view all validated documents within a personnel's digital 201 file.
*   AC3: The system SHALL maintain version control for documents, allowing access to previous versions where applicable.

#### FR-17: Reporting
HRMO users SHALL be able to generate and export reports on compliance statistics, promotion outcomes, personnel demographics, and service records.
*   AC1: HRMO users SHALL be able to select from a predefined list of reports (e.g., compliance rates, promotion cycle summaries, personnel demographics).
*   AC2: HRMO users SHALL be able to apply filters (e.g., date range, department, transaction type) to customize report data.
*   AC3: Reports SHALL be exportable in common formats such as PDF and CSV.

#### FR-18: Audit Trail
The system MUST log all significant actions (e.g., document upload, validation, approval, user creation) with user, timestamp, and action details. These logs MUST be viewable by authorized administrators.
*   AC1: The system SHALL automatically record all user actions that modify data or system state.
*   AC2: Each audit log entry SHALL include the user who performed the action, the timestamp, the action performed, and the affected entity.
*   AC3: Authorized administrators (SysAdmin, HRMO) SHALL be able to view, filter, and search audit logs.

#### FR-19: Digital Archiving
Records Personnel SHALL be able to manage the long-term archival of personnel records, apply retention policies, and manage the lifecycle of digital documents.
*   AC1: Records Personnel SHALL be able to designate personnel records for long-term archival.
*   AC2: The system SHALL apply predefined retention policies to archived documents based on DepEd guidelines.
*   AC3: Records Personnel SHALL be able to retrieve archived records when necessary, subject to appropriate access controls.

## Non-Functional Requirements

| Category | Requirement | Measurable Target |
|:---|:---|:---|
| **Performance** | API Response Time (p95) | < 250ms |
| | Web Page Load (LCP) | < 2.0 seconds |
| | OCR Processing Time | < 10 seconds per page |
| **Scalability** | Concurrent Web Users | 100+ |
| | Concurrent Mobile Users | 1,000+ |
| **Availability** | System Uptime | 99.5% |
| | Backup Strategy | Daily automated backups with 30-day retention |
| **Security** | Authentication | JWT with short-lived access tokens & refresh tokens |
| | Data at Rest | Encrypted (AES-256) |
| | Data in Transit | TLS 1.2+ (HTTPS) |
| | Passwords | Hashed using Argon2 or bcrypt |
| | Vulnerabilities | Mitigate against OWASP Top 10 |
| **Usability** | Design Language | Modern, clean, and user-friendly |
| | User Satisfaction | System Usability Scale (SUS) score > 80 |

## Technical Constraints

*   The system MUST operate within the security and data privacy policies set by DepEd.
*   The initial deployment is exclusively for the City Schools Division of Koronadal City.
*   The visual design MUST be modern and user-friendly, avoiding legacy enterprise aesthetics.
*   The mobile application frontend MUST be developed using Flutter.
*   The web application frontend MUST be developed using React.js.
*   The backend API MUST be developed using Node.js with Express.js.
*   The primary database MUST be PostgreSQL.
*   File storage for documents MUST utilize Supabase Storage.
*   OCR and AI capabilities MUST leverage Google Cloud Vision AI.
*   Notifications MUST be managed via Supabase Notifications.
*   Authentication MUST be implemented using JWT (JSON Web Tokens).
*   Cloud hosting infrastructure MUST be provisioned on AWS (Amazon Web Services).

## Assumptions

*   All personnel have access to a smartphone (Android or iOS) with a functional camera.
*   Administrative staff have reliable internet access and modern web browsers.
*   The DepEd division will provide a digitized version of the official Plantilla (staffing pattern) for initial system setup.
*   Key stakeholders (AO II, HRMO) will be available for requirements validation and User Acceptance Testing (UAT).