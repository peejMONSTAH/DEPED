# USERFLOW.md: Eminence HRIS

This document details the primary user interaction flows within the Eminence HRIS, outlining the step-by-step processes for key functionalities.

## 1. Personnel Initiates and Submits an HR Transaction (Mobile App)

This flow describes how a teaching or non-teaching personnel user initiates a new HR transaction, uploads required documents, and submits it for validation.

| No | Actor | Action/Step | System Response | Alternative/Alternative Path/Error Path |
|:---|:---|:---|:---|:---|
| 1 | Personnel | Logs into the mobile app. | System authenticates user (FR-01) and displays the employee dashboard/home screen. | Invalid credentials: Display error message, prompt retry. |
| 2 | Personnel | Navigates to "Transactions" module and taps "Initiate New Transaction". | System displays a list of available HR transaction types (e.g., Promotion, Reclassification). | No available transactions: Display message "No transactions available." |
| 3 | Personnel | Selects a transaction type (e.g., "Promotion - Teacher I to Teacher II"). | System generates a dynamic checklist of required documents (FR-04) based on transaction type and user's profile. | System error generating checklist: Display error, log issue. |
| 4 | Personnel | For each required document, taps "Upload Document". | System prompts user to choose between camera capture or file upload from device storage. | User cancels upload: Return to checklist. |
| 5 | Personnel | Captures document via camera or selects file. | System uploads document, initiates OCR (FR-06), and displays extracted data for user review. | Upload failed: Display error, prompt retry. OCR failed/low confidence: Highlight fields for manual input. |
| 6 | Personnel | Reviews OCR-extracted data, corrects any inaccuracies, and confirms. | System saves the document and its validated data to a temporary staging area, marks checklist item as "Uploaded & Reviewed". | User flags for re-upload: Document removed, checklist item reverts to "Required". |
| 7 | Personnel | Repeats steps 4-6 for all required documents. | Checklist items are progressively marked as "Uploaded & Reviewed". | User exits app: Progress is saved as a draft transaction. |
| 8 | Personnel | Taps "Submit Transaction" after all documents are uploaded and reviewed. | System performs final compliance check (FR-07), bundles documents, and changes transaction status to "Pending Validation". Sends confirmation notification (FR-08). | Missing required documents: Display error, prevent submission. Compliance check failed: Display specific deficiencies, allow user to correct or submit with warnings. |
| 9 | Personnel | Views transaction status in "My Transactions" module. | System displays the transaction with status "Pending Validation". | |

**Trigger:** Personnel wishes to initiate an HR-related process requiring document submission.
**Pre-conditions:**
*   Personnel has an active account and valid credentials.
*   Personnel has access to the mobile application.
*   The selected transaction type is configured and available.
**Post-conditions:**
*   A new HR transaction record is created in the system.
*   Uploaded documents are stored in a temporary staging area.
*   The transaction status is set to "Pending Validation".
*   Personnel receives a submission confirmation notification.

## 2. AO II Validates a Submitted HR Transaction (Web App)

This flow describes how an Administrative Officer II (AO II) reviews and validates documents submitted by personnel for an HR transaction.

| No | Actor | Action/Step | System Response | Alternative/Alternative Path/Error Path |
|:---|:---|:---|:---|:---|
| 1 | AO II | Logs into the web application. | System authenticates user and displays the AO II Dashboard (FR-10) with a summary of pending tasks and transactions. | Invalid credentials: Display error message, prompt retry. |
| 2 | AO II | Navigates to the "Document Validation" module. | System displays a list of transactions with status "Pending Validation", prioritized by submission date or urgency. | No pending transactions: Display "No transactions awaiting validation." |
| 3 | AO II | Selects a transaction from the list to review. | System displays the transaction details, including personnel information, transaction type, and a list of uploaded documents (FR-12). | |
| 4 | AO II | Clicks on an uploaded document to view it. | System displays the document image/PDF side-by-side with the OCR-extracted data and any user corrections. | Document not found/corrupted: Display error, flag document. |
| 5 | AO II | Reviews the document content against the extracted data and checklist requirements. | | |
| 6 | AO II | If document and data are accurate, marks the document as "Validated". | System updates the document status within the transaction, records AO II's action in the audit trail (FR-18). | |
| 7 | AO II | If discrepancies are found or document is deficient, marks the document as "Deficient" and adds a comment. | System updates the document status, records AO II's action, and triggers a notification to the personnel (FR-08) detailing the deficiency. | |
| 8 | AO II | Repeats steps 4-7 for all documents within the transaction. | Progress is saved as documents are marked. | |
| 9 | AO II | After reviewing all documents, clicks "Submit Validation Decision". | If all documents are "Validated": System changes transaction status to "For Approval" and moves it to the HRMO queue. If any documents are "Deficient": System changes transaction status to "Returned for Correction" and notifies personnel (FR-08). | AO II cancels: Transaction remains "Pending Validation". |

**Trigger:** A personnel user has submitted an HR transaction, and it requires administrative review.
**Pre-conditions:**
*   AO II has an active account and valid credentials.
*   AO II has pending transactions in their validation queue.
*   Personnel has submitted a transaction.
**Post-conditions:**
*   Transaction status is updated to either "For Approval" (if validated) or "Returned for Correction" (if deficient).
*   Personnel is notified of the validation outcome.
*   All AO II actions are logged in the audit trail.

## 3. HRMO Approves Transaction and Manages Promotion (Web App)

This flow covers the HRMO's role in final transaction approval and the broader management of promotion cycles.

| No | Actor | Action/Step | System Response | Alternative/Alternative Path/Error Path |
|:---|:---|:---|:---|:---|
| 1 | HRMO | Logs into the web application. | System authenticates user and displays the HRMO Dashboard (FR-10) with pending approvals, compliance stats, and promotion cycle overview. | Invalid credentials: Display error message, prompt retry. |
| 2 | HRMO | Navigates to the "Transaction Approval" module. | System displays a list of transactions with status "For Approval" (i.e., validated by AO II). | No transactions for approval: Display "No transactions awaiting approval." |
| 3 | HRMO | Selects a transaction for final review. | System displays the transaction details, including personnel info, transaction type, and all validated documents with AO II's comments (FR-13). | |
| 4 | HRMO | Reviews the validated transaction details and documents. | | |
| 5 | HRMO | Clicks "Approve Transaction". | System changes transaction status to "Approved", updates the personnel's career record (FR-09), triggers relevant system updates (e.g., promotion, reclassification), and notifies personnel (FR-08). Records action in audit trail (FR-18). | HRMO clicks "Reject Transaction": System changes status to "Rejected", requires HRMO to provide reason, notifies personnel (FR-08). Records action in audit trail. |
| 6 | HRMO | Navigates to "Promotion Management" module. | System displays current and past promotion cycles, options to configure rules (FR-14) or start a new cycle (FR-15). | |
| 7 | HRMO | To configure promotion rules, selects "Configure Promotion Rules". | System displays a configurable interface to define criteria (e.g., points for education, experience, training, performance) and their weights. | |
| 8 | HRMO | Modifies rules and saves changes. | System updates the promotion rules engine. Provides an option to "Test Run" rules against sample data. | Invalid rule configuration: Display error, prevent save. |
| 9 | HRMO | To manage a promotion cycle, selects "Start New Promotion Cycle" (e.g., for Natural Vacancy). | System prompts for cycle details (e.g., start/end dates, positions available, applicable personnel groups). | |
| 10 | HRMO | Confirms new promotion cycle. | System opens the promotion cycle, making it available for eligible personnel to apply (via Mobile App). | |
| 11 | HRMO | During or after the cycle, selects "Generate Ranking Report". | System applies configured promotion rules to all eligible applicants' data and generates a rank-ordered list (FR-15). | Insufficient data for ranking: Display warning. |
| 12 | HRMO | Reviews and finalizes the ranking report. | System saves the final ranking, which can be used for official promotion recommendations. | |

**Trigger:**
*   A transaction has been validated by AO II and requires final approval.
*   HRMO needs to manage promotion criteria or initiate a new promotion cycle.
**Pre-conditions:**
*   HRMO has an active account and valid credentials.
*   Transactions are in "For Approval" status.
*   Promotion rules are defined or need to be defined.
**Post-conditions:**
*   **For Transaction Approval:** Transaction status is "Approved" or "Rejected". Personnel's career record is updated. Personnel is notified. Audit trail is updated.
*   **For Promotion Management:** Promotion rules are updated. A new promotion cycle is initiated. A ranking report is generated.