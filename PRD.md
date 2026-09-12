# PRD: Eminence HRIS

## Executive Summary & Product Vision

This document outlines the product requirements for Eminence HRIS, an enterprise-grade Human Resource Information System for the City Schools Division of Koronadal City (DepEd). The system will digitize personnel 201 files, automate compliance checking for HR transactions, and streamline the promotion and ranking process.

**Product Vision:** To create a transparent, efficient, and secure paperless HR management ecosystem that empowers personnel to manage their career progression and enables administrators to make data-driven decisions.

## Problem Statement & Target Users

The current HR process is manual, paper-based, and fragmented. This leads to slow transaction times, lost documents, inconsistent compliance checking, and a lack of transparency for personnel regarding their status and career records. HR staff are burdened with repetitive, low-value administrative tasks.

**Target Users:**
*   **Mobile App Users:**
    *   Teaching Personnel
    *   Non-Teaching Personnel
*   **Web App Users:**
    *   System Administrator
    *   AO II (Administrative Officer II)
    *   HRMO Personnel (Human Resource Management Officer)
    *   Records Personnel

## System Scope & User Roles

The system encompasses a mobile application for personnel and a web application for administrative staff. The scope covers the entire lifecycle of an HR transaction, from initiation and document submission to validation, approval, and digital archiving.

**Permissions Matrix:**

| Feature/Module | Personnel | AO II | HRMO | Records | SysAdmin |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Account Management** | | | | | |
| Manage Own Profile | ✓ | R | R | R | R |
| Manage All Users | — | — | — | — | ✓ |
| Distribute Credentials | — | ✓ | — | — | — |
| **Transaction Management** | | | | | |
| Initiate Transaction | ✓ | — | — | — | — |
| Upload/Manage Own Docs | ✓ | R | R | R | R |
| Validate Submissions | — | ✓ | R | — | — |
| Approve/Reject Transactions | — | — | ✓ | — | — |
| View All Transactions | R | ✓ | ✓ | R | ✓ |
| **Promotion & Ranking** | | | | | |
| Apply for Promotion | ✓ | — | — | — | — |
| Manage Promotion Cycles | — | — | ✓ | — | — |
| Configure Promotion Rules | — | — | ✓ | — | — |
| View Ranking Results | R | R | ✓ | R | R |
| **Data & Reporting** | | | | | |
| View Own Career Record | ✓ | R | R | R | R |
| Access Admin Dashboard | — | ✓ | ✓ | R | ✓ |
| Generate System Reports | — | — | ✓ | — | ✓ |
| Access Digital Archives | — | R | R | ✓ | R |
| View Audit Logs | R | ✓ | ✓ | ✓ | ✓ |

*Key: `✓` = Full Access, `R` = Read-Only Access, `—` = No Access*

## Functional Requirements

### Personnel-Facing (Mobile App)
*   **FR-01 (Authentication):** Users must log in using secure credentials provided by the AO II. The session must be managed via JWT.
*   **FR-02 (Profile Management):** Users can view and edit their personal information, educational background, and contact details.
*   **FR-03 (Transaction Initiation):** Users can select and initiate new HR transactions (e.g., Promotion, Reclassification).
*   **FR-04 (Dynamic Checklist):** The system shall generate an AI-driven, dynamic checklist of required documents based on the selected transaction type and the user's current profile data.
*   **FR-05 (Document Upload):** Users can upload documents using the device camera or by selecting files from device storage.
*   **FR-06 (OCR Self-Correction):** Upon upload, the system uses OCR to extract key data. The user is prompted to review the extracted data and confirm its accuracy or flag it for re-upload before submission.
*   **FR-07 (Submission & Tracking):** Users can submit their completed transaction package and track its status in real-time (e.g., Pending Validation, For Approval, Approved).
*   **FR-08 (Notifications):** Users receive in-app and email notifications for transaction status changes, document deficiencies, and approvals.
*   **FR-09 (Career Record):** Users can view a consolidated, read-only digital career record, including service history, training completed, and a repository of all validated documents.

### Admin-Facing (Web App)
*   **FR-10 (Admin Dashboard):** AO II and HRMO users shall see a dashboard summarizing pending tasks, transaction volumes, compliance rates, and system alerts.
*   **FR-11 (Personnel Management):** Admins (SysAdmin, AO II) can create and manage personnel accounts. SysAdmin has full CRUD control over all user accounts.
*   **FR-12 (Document Validation Workflow):** AO II users can access a queue of submitted transactions. They can view uploaded documents alongside OCR-extracted data, flag discrepancies, or mark documents as validated.
*   **FR-13 (Transaction Approval):** HRMO users can review transactions validated by the AO II. They have the final authority to approve or reject a transaction, triggering a career record update.
*   **FR-14 (Configurable Promotion Engine):** HRMO users must have an interface to define and manage the criteria for promotions (e.g., points for training, required years of service) via a configurable rules engine without requiring code changes.
*   **FR-15 (Promotion Management):** HRMO users can open, manage, and close promotion cycles (Reclassification, Natural Vacancy, ECP) and generate rank-ordered lists based on the configured rules.
*   **FR-16 (Digital 201 Repository):** Authorized admin users (HRMO, Records) can search for and view any employee's complete, version-controlled digital 201 file.
*   **FR-17 (Reporting):** HRMO users can generate and export reports on compliance statistics, promotion outcomes, personnel demographics, and service records.
*   **FR-18 (Audit Trail):** The system must log all significant actions (e.g., document upload, validation, approval, user creation) with user, timestamp, and action details. These logs must be viewable by authorized administrators.
*   **FR-19 (Digital Archiving):** Records Personnel can manage the long-term archival of personnel records, apply retention policies, and manage the lifecycle of digital documents.

## Non-Functional Requirements

| Category | Requirement | Target |
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

## Technology Stack & Rationale

| Component | Technology | Rationale |
|:---|:---|:---|
| Mobile Frontend | Flutter | Single codebase for Android & iOS, enabling rapid development and consistent UI. |
| Web Frontend | React.js | Mature ecosystem and component-based architecture are ideal for building complex, data-heavy admin dashboards. |
| Backend API | Node.js with Express.js | High performance for I/O-bound operations (file uploads, database queries). Large NPM ecosystem accelerates development. |
| Database | PostgreSQL | Robust, reliable, and supports advanced features like JSONB for flexible data structures and full-text search. |
| Authentication | JWT (JSON Web Tokens) | Stateless, industry-standard for securing APIs between web/mobile clients and the backend. |
| Cloud Hosting | AWS (Amazon Web Services) | Scalable, secure, and provides a comprehensive suite of services (EC2, RDS, etc.) for enterprise applications. |
| File Storage | Supabase Storage | S3-compatible object storage with a simple API and fine-grained access control that integrates well with PostgreSQL. |
| OCR & AI | Google Cloud Vision AI | Provides high-accuracy text detection and data extraction from various document formats, crucial for the validation workflow. |
| Notifications | Supabase Notifications | Provides a unified service for sending cross-platform push notifications and can be triggered via database events. |

## Success Metrics & KPIs

| Metric | KPI | Target |
|:---|:---|:---|
| Efficiency | Average time to process a promotion application | Reduce by 50% within 12 months post-launch. |
| Accuracy | Document deficiency/rejection rate | Reduce by 75% within 6 months post-launch. |
| Adoption | Active personnel users (logged in last 30 days) | 90% of all personnel within 6 months. |
| User Satisfaction | System Usability Scale (SUS) Score | Achieve a score of > 80 from user surveys. |
| Paper Reduction | Physical paper used for HR transactions | Reduce by 95%. |

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation Strategy |
|:---|:---:|:---|
| Low OCR Accuracy | High | Implement the `personnel_self_correction` workflow. Provide clear in-app guidelines for document scanning. Fallback to manual data entry for unreadable fields. |
| Data Privacy Breach (PII) | High | Enforce strict Role-Based Access Control (RBAC). Encrypt all sensitive data at rest and in transit. Conduct regular security audits and penetration testing. |
| User Resistance to Adoption | Medium | Conduct comprehensive onboarding and training sessions. Design an intuitive, modern UI/UX. Establish a dedicated support channel for user queries. |
| Inaccurate Promotion Rules | High | Involve HRMO stakeholders heavily during the development of the configurable rules engine. Implement a "test run" feature for rule changes before applying them live. |

## Constraints & Assumptions

**Constraints:**
*   The system must operate within the security and data privacy policies set by DepEd.
*   The initial deployment is exclusively for the City Schools Division of Koronadal City.
*   The visual design must be modern and user-friendly, avoiding legacy enterprise aesthetics.

**Assumptions:**
*   All personnel have access to a smartphone (Android or iOS) with a functional camera.
*   Administrative staff have reliable internet access and modern web browsers.
*   The DepEd division will provide a digitized version of the official Plantilla (staffing pattern) for initial system setup.
*   Key stakeholders (AO II, HRMO) will be available for requirements validation and UAT.

## Out of Scope

The following features are explicitly out of scope for the initial version (v1.0) of this project:
*   Payroll and benefits administration.
*   Leave management and attendance tracking.
*   A comprehensive performance appraisal module (beyond tracking requirements for promotion).
*   Direct API integration with national DepEd or Civil Service Commission systems.
*   Offline mode for the mobile application.
*   Recruitment and applicant tracking system.