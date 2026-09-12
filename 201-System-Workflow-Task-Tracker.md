# 201 System Workflow — Strict Implementation Task Tracker

This document provides a strict verification and progress tracking matrix for the **201-System-Workflow.md** specification in Eminence HRIS.

---

## 📱 Mobile System Workflow (Teaching & Non-Teaching Personnel)

- [x] **Step 1: Receive Account Credentials**
  - **Spec**: Personnel receives username, temporary password, and unique Employee ID (`EMP-XXXX`) issued by AO II / Sys Admin.
  - **Component**: [`web/src/pages/admin/CredentialDistribution.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/CredentialDistribution.tsx)
  - **API / Controller**: [`backend/src/controllers/users.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/users.controller.ts)
  - **Status**: **COMPLETED (100%)**

- [x] **Step 2: First Login and Password Change**
  - **Spec**: First-time login prompts compulsory password change; account status changes to `ACTIVE` and login activity is logged.
  - **Component**: [`web/src/pages/Login.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/Login.tsx)
  - **API / Controller**: [`backend/src/controllers/auth.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/auth.controller.ts)
  - **Status**: **COMPLETED (100%)**

- [x] **Step 3: Profile Completion**
  - **Spec**: Collects Personal Information, Personal Data Sheet (PDS), Work Experience Sheet (WES), Employment Information, and Contact Details.
  - **Component**: [`web/src/pages/personnel/ProfileCompletion.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/personnel/ProfileCompletion.tsx)
  - **API / Controller**: [`backend/src/controllers/personnel.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/personnel.controller.ts)
  - **Status**: **COMPLETED (100%)**

- [x] **Step 4: Transaction Selection**
  - **Spec**: Provides options for Promotion Appointment, Newly Hired Appointment, and Salary Adjustment.
  - **Component**: [`web/src/pages/personnel/NewTransaction.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/personnel/NewTransaction.tsx)
  - **Status**: **COMPLETED (100%)**

- [x] **Step 5: Requirement Checklist Generation**
  - **Spec**: Dynamically generates mandatory document checklist based on transaction type and personnel category (Teaching, Non-Teaching, Principal).
  - **Component**: [`web/src/pages/personnel/Checklist.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/personnel/Checklist.tsx)
  - **Status**: **COMPLETED (100%)**

- [x] **Step 6: Document Upload**
  - **Spec**: Stores uploaded documents with date, transaction type, personnel ID, and submission history.
  - **Component**: [`web/src/pages/personnel/UploadDocument.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/personnel/UploadDocument.tsx)
  - **API / Controller**: [`backend/src/controllers/documents.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/documents.controller.ts)
  - **Status**: **COMPLETED (100%)**

- [x] **Step 7: Automated Compliance Evaluation**
  - **Spec**: Automatically checks uploaded files against required checklist, calculates compliance percentage score, and lists missing items.
  - **Component**: [`web/src/pages/personnel/Checklist.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/personnel/Checklist.tsx) | [`web/src/pages/personnel/OCRReview.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/personnel/OCRReview.tsx)
  - **Status**: **COMPLETED (100%)**

- [x] **Step 8: Transaction Submission**
  - **Spec**: Blocks submission if requirements are incomplete; updates status to `Ready for Validation` and routes to AO II when complete.
  - **Component**: [`web/src/pages/personnel/Checklist.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/personnel/Checklist.tsx)
  - **API / Controller**: [`backend/src/controllers/transactions.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/transactions.controller.ts)
  - **Status**: **COMPLETED (100%)**

- [x] **Step 9: Notification Monitoring**
  - **Spec**: Real-time status tracking across 6 distinct notification states (`Submitted`, `Under Review`, `Returned`, `Validated`, `Approved`, `Archived`).
  - **Component**: [`web/src/pages/personnel/Notifications.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/personnel/Notifications.tsx)
  - **API / Controller**: [`backend/src/controllers/notifications.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/notifications.controller.ts)
  - **Status**: **COMPLETED (100%)**

- [x] **Step 10: Service Record Viewing**
  - **Spec**: Displays Current Position, First Appointment Date, Years in Service, Promotion History, Salary Grade, and interactive Career Timeline.
  - **Component**: [`web/src/pages/personnel/CareerRecord.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/personnel/CareerRecord.tsx)
  - **API / Controller**: [`backend/src/controllers/personnel.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/personnel.controller.ts)
  - **Status**: **COMPLETED (100%)**

---

## 💻 Web System Workflow (Administrative Roles)

### System Administrator Workflow
- [x] **Step 1: Receive Personnel Information** — [`CredentialDistribution.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/CredentialDistribution.tsx)
- [x] **Step 2: Create Personnel Account** — [`users.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/users.controller.ts)
- [x] **Step 3: Return Created Account to AO II** — [`CredentialDistribution.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/CredentialDistribution.tsx)
- [x] **Step 4: Manage Roles and Permissions** — [`Sidebar.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/components/admin/Sidebar.tsx) | [`Settings.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/Settings.tsx)
- [x] **Step 5: Audit Trail Monitoring** — [`AuditLog.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/AuditLog.tsx) | [`audit.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/audit.controller.ts)

### Administrative Officer II (AO II) Workflow
- [x] **Step 1: Submit Personnel Info for Account Creation** — [`CredentialDistribution.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/CredentialDistribution.tsx)
- [x] **Step 2: Receive Created Accounts** — [`CredentialDistribution.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/CredentialDistribution.tsx)
- [x] **Step 3: Distribute Credentials** — [`CredentialDistribution.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/CredentialDistribution.tsx)
- [x] **Step 4: Review Submitted Transactions** — [`DocumentValidation.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/DocumentValidation.tsx)
- [x] **Step 5: Validation & Initial Qualification Evaluation (Return / Declare Qualified / Declare Disqualified)**
  - **Spec**: School-level evaluation of documentary requirements by AO II for Teaching Personnel under prescribed criteria:
    - *Natural Vacancy* (Teacher I): DepEd Quality Standards (**DepEd Order No. 7, s. 2023**).
    - *Expanded Career Progression (ECP)*: **DepEd Order No. 19, s. 2025** & **DepEd Order No. 24, s. 2025**.
    - AO II has full authority to declare teaching applicants **Qualified** (forwarding to HRMO) or **Disqualified (DQ)**.
    - Non-teaching personnel documentary evaluation & qualification/disqualification is exclusively handled by **HRMO** at the division level.
  - **Component**: [`web/src/pages/admin/DocumentValidation.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/DocumentValidation.tsx) | [`transactions.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/transactions.controller.ts)
  - **Status**: **COMPLETED (100%)**

### HRMO Staff Workflow
- [x] **Step 1: Review Validated Transactions** — [`TransactionApproval.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/TransactionApproval.tsx)
- [x] **Step 2: Final Approval (Approve / Return)** — [`TransactionApproval.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/TransactionApproval.tsx)
- [x] **Step 3: Career Lifecycle Update** — [`TransactionApproval.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/TransactionApproval.tsx) | [`personnel.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/personnel.controller.ts)
- [x] **Step 4: Compliance Monitoring** — [`ComplianceMonitoring.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/ComplianceMonitoring.tsx)
- [x] **Step 5: Years of Service Monitoring** — [`ComplianceMonitoring.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/ComplianceMonitoring.tsx)

### Records Personnel Workflow
- [x] **Step 1: Receive Approved Transactions** — [`DigitalRepository.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/DigitalRepository.tsx)
- [x] **Step 2: Digital Archiving** — [`DigitalRepository.tsx`](file:///c:/Users/USER/Documents/Eminence%20HRIS/web/src/pages/admin/DigitalRepository.tsx) | [`documents.controller.ts`](file:///c:/Users/USER/Documents/Eminence%20HRIS/backend/src/controllers/documents.controller.ts)

---

## 🔄 End-to-End Workflow Pipeline

```
AO II: Submit Personnel Information
   ↓
System Administrator: Create User Account & Generate Employee ID
   ↓
AO II: Distribute Credentials to Personnel
   ↓
Personnel: First Login → Change Temp Password → Complete Profile (PDS, WES)
   ↓
Personnel: Select Transaction → Upload Checklist Documents → Automated Compliance Score
   ↓
Personnel: Submit Transaction (Ready for Validation)
   ↓
AO II: Review Submissions → Validate Submission (Validated by AO II)
   ↓
HRMO: Review Validated Transaction → Final Approval (Approved)
   ↓
System: Auto Update Career Records, Salary Grade & Years of Service
   ↓
Records Personnel: Digital 201 File Archiving
```

---

## 📊 Summary of Completion
- **Mobile Workflow Steps**: 10 of 10 Steps Complete (`100%`)
- **System Admin Steps**: 5 of 5 Steps Complete (`100%`)
- **AO II Steps**: 5 of 5 Steps Complete (`100%`)
- **HRMO Staff Steps**: 5 of 5 Steps Complete (`100%`)
- **Records Personnel Steps**: 2 of 2 Steps Complete (`100%`)
- **Overall Specification Status**: **100% IMPLEMENTED & VERIFIED**
