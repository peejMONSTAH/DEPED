# TESTING.md: Eminence HRIS

## 1. Test Strategy

The testing strategy for Eminence HRIS will adopt a multi-layered approach, encompassing various testing types throughout the Software Development Life Cycle (SDLC). This ensures comprehensive quality assurance, covering functional correctness, performance, security, and user experience.

### 1.1. Testing Principles

*   **Shift-Left Testing:** Integrate testing activities early in the development process, starting from requirements analysis and design.
*   **Automation First:** Prioritize automated tests (unit, integration, E2E) to ensure rapid feedback and maintainable test suites.
*   **Risk-Based Testing:** Focus testing efforts on high-risk areas, critical business logic, and complex integrations (e.g., OCR, promotion engine).
*   **User-Centric Testing:** Involve end-users (Personnel, AO II, HRMO, Records Personnel) in User Acceptance Testing (UAT) to validate usability and functional alignment with operational needs.

### 1.2. Test Types

*   **Unit Testing:** Verify individual components or functions in isolation.
*   **Integration Testing:** Test the interaction between different modules, services, and external APIs (e.g., database, OCR service, notification service).
*   **End-to-End (E2E) Testing:** Simulate real user scenarios across the entire application stack (mobile app, web app, backend, database).
*   **API Testing:** Validate the functionality, reliability, performance, and security of the backend REST APIs.
*   **Performance Testing:** Assess system responsiveness, stability, and scalability under various load conditions.
*   **Security Testing:** Identify vulnerabilities and ensure compliance with security requirements (e.g., RBAC, data encryption).
*   **Usability Testing:** Evaluate the user-friendliness and intuitiveness of the application interfaces.
*   **User Acceptance Testing (UAT):** Formal testing by target users to confirm the system meets business requirements and is fit for purpose.
*   **Regression Testing:** Re-run existing tests to ensure new changes have not introduced defects into previously working functionality.

## 2. Test Scope & Coverage Targets

The testing scope covers all functional and non-functional requirements outlined in PRD.md.

### 2.1. Coverage Targets

*   **Unit Test Coverage:** > 80% for critical business logic and utility functions.
*   **Integration Test Coverage:** > 60% for API endpoints and service integrations.
*   **E2E Test Coverage:** Key user journeys and critical workflows (e.g., transaction submission, document validation, promotion application).
*   **Code Quality:** Maintain high code quality standards through static analysis and peer reviews.

## 3. Testing Tools & Frameworks

| Category | Tool/Framework | Purpose |
|:---|:---|:---|
| **Unit/Integration (Frontend - Mobile)** | `flutter_test`, `integration_test` | Testing Flutter widgets, services, and integration with platform features. |
| **Unit/Integration (Frontend - Web)** | Jest, React Testing Library | Unit testing React components and hooks, simulating user interactions. |
| **Unit/Integration (Backend)** | Jest, Supertest | Unit testing Node.js services, controllers, and integration with Express.js routes. |
| **E2E Testing** | Cypress | Cross-browser E2E testing for the web application. |
| **API Testing** | Postman, Newman (CLI for Postman) | Manual and automated testing of REST API endpoints. |
| **Performance Testing** | k6, Apache JMeter | Load, stress, and scalability testing for backend APIs and web application. |
| **Security Testing** | OWASP ZAP, Snyk | Automated vulnerability scanning, penetration testing support. |
| **Static Analysis** | ESLint, SonarQube | Code quality, style consistency, and early bug detection. |
| **Test Management** | Jira (or similar) | Test case management, defect tracking, and reporting. |
| **OCR Validation** | Custom scripts, manual review | Specific validation of Google Cloud Vision AI output against expected data. |

## 4. Test Environments

*   **Development Environment:** Local developer machines for unit and component testing.
*   **Staging Environment:** A replica of the production environment for integration, E2E, performance, and security testing. This environment will use realistic (anonymized) data.
*   **UAT Environment:** A dedicated environment for User Acceptance Testing, accessible to DepEd stakeholders.
*   **Production Environment:** The live system, subject to continuous monitoring and post-deployment validation.

## 5. Test Cases by Feature

This section outlines critical test cases for key features, focusing on the unique aspects of Eminence HRIS.

### 5.1. Personnel-Facing (Mobile App)

#### 5.1.1. FR-04: Dynamic Checklist Generation
*   **Test Case 1:** Verify checklist for "Promotion" transaction for a "Teaching Personnel" with 5 years of service.
    *   *Expected:* Checklist includes requirements specific to teaching roles, promotion, and experience level.
*   **Test Case 2:** Verify checklist for "Reclassification" transaction for a "Non-Teaching Personnel" with specific educational background.
    *   *Expected:* Checklist adapts to non-teaching roles, reclassification, and educational qualifications.
*   **Test Case 3:** Test with incomplete profile data.
    *   *Expected:* System prompts user to complete profile or flags missing information affecting checklist generation.

#### 5.1.2. FR-06: OCR-Assisted Document Upload & Self-Correction
*   **Test Case 1:** Upload a clear, well-scanned document (e.g., Diploma).
    *   *Expected:* OCR accurately extracts key data (e.g., Degree, Institution, Date). User confirms data.
*   **Test Case 2:** Upload a slightly blurry or angled document.
    *   *Expected:* OCR attempts extraction; user is prompted to review and correct minor discrepancies or re-upload.
*   **Test Case 3:** Upload a document with critical data missing or unreadable by OCR.
    *   *Expected:* System flags unreadable fields, prompts user for manual input or re-upload, and prevents submission until resolved.
*   **Test Case 4:** User attempts to submit a document with flagged discrepancies without correction.
    *   *Expected:* System prevents submission and requires resolution.

#### 5.1.3. FR-07: Transaction Submission & Tracking
*   **Test Case 1:** Submit a complete transaction package.
    *   *Expected:* Status changes to "Pending Validation". User can view status updates in real-time.
*   **Test Case 2:** AO II flags a document deficiency.
    *   *Expected:* User receives notification, transaction status updates to "Deficiency Detected", and user can re-upload/correct.
*   **Test Case 3:** HRMO approves a transaction.
    *   *Expected:* User receives approval notification, transaction status updates to "Approved", and career record is updated.

### 5.2. Admin-Facing (Web App)

#### 5.2.1. FR-12: Document Validation Workflow (AO II)
*   **Test Case 1:** AO II reviews a submitted document with accurate OCR data.
    *   *Expected:* AO II can quickly verify OCR data against the document image and mark as validated.
*   **Test Case 2:** AO II reviews a document where OCR data has minor discrepancies.
    *   *Expected:* AO II can edit the OCR-extracted data to match the document, add comments, and mark as validated.
*   **Test Case 3:** AO II identifies a fraudulent or invalid document.
    *   *Expected:* AO II can reject the document, provide a reason, and trigger a notification to the personnel.
*   **Test Case 4:** AO II attempts to validate a document for a transaction already approved by HRMO.
    *   *Expected:* System prevents validation or indicates the transaction is closed.

#### 5.2.2. FR-14: Configurable Promotion Engine (HRMO)
*   **Test Case 1:** HRMO configures new promotion criteria (e.g., add points for a specific training, adjust years of service requirement).
    *   *Expected:* System saves configuration. A "test run" feature should allow HRMO to see the impact on sample personnel without affecting live data.
*   **Test Case 2:** HRMO attempts to save invalid promotion rules (e.g., negative points, conflicting criteria).
    *   *Expected:* System provides validation errors and prevents saving.
*   **Test Case 3:** HRMO activates a new promotion cycle with the updated rules.
    *   *Expected:* The new rules are applied to all subsequent promotion applications for that cycle.

#### 5.2.3. FR-15: Promotion Management (HRMO)
*   **Test Case 1:** HRMO opens a new "Reclassification" promotion cycle.
    *   *Expected:* Personnel can now apply for reclassification.
*   **Test Case 2:** HRMO generates a rank-ordered list for a closed promotion cycle.
    *   *Expected:* List is generated accurately based on configured rules and validated personnel data.
*   **Test Case 3:** HRMO attempts to modify a closed promotion cycle.
    *   *Expected:* System prevents modification or requires specific administrative override.

#### 5.2.4. FR-18: Audit Trail
*   **Test Case 1:** Personnel uploads a document.
    *   *Expected:* Audit log records user ID, timestamp, action (document upload), and document ID.
*   **Test Case 2:** AO II validates a document.
    *   *Expected:* Audit log records AO II ID, timestamp, action (document validation), document ID, and any changes made to OCR data.
*   **Test Case 3:** HRMO approves a transaction.
    *   *Expected:* Audit log records HRMO ID, timestamp, action (transaction approval), and transaction ID.
*   **Test Case 4:** SysAdmin changes user permissions.
    *   *Expected:* Audit log records SysAdmin ID, timestamp, action (permission change), and affected user ID.

### 5.3. Cross-Cutting Concerns

#### 5.3.1. Role-Based Access Control (RBAC)
*   **Test Case 1:** Personnel attempts to access "Promotion Management" module.
    *   *Expected:* Access denied.
*   **Test Case 2:** AO II attempts to "Approve/Reject Transactions".
    *   *Expected:* Access denied (only HRMO can approve/reject).
*   **Test Case 3:** HRMO attempts to "Manage All Users".
    *   *Expected:* Access denied (only SysAdmin).
*   **Test Case 4:** Records Personnel attempts to "Validate Submissions".
    *   *Expected:* Access denied.

#### 5.3.2. Security (NFRs)
*   **Test Case 1:** Attempt to bypass JWT authentication.
    *   *Expected:* Access denied, appropriate error response.
*   **Test Case 2:** Verify password hashing during user creation/update.
    *   *Expected:* Passwords stored as hashes, not plain text.
*   **Test Case 3:** Test for common OWASP Top 10 vulnerabilities (e.g., SQL Injection, XSS).
    *   *Expected:* System is resilient to these attacks.

#### 5.3.3. Performance (NFRs)
*   **Test Case 1:** Measure API response time for critical endpoints (e.g., fetching personnel profile, submitting transaction).
    *   *Expected:* P95 < 250ms.
*   **Test Case 2:** Measure web page load time for admin dashboards.
    *   *Expected:* LCP < 2.0 seconds.
*   **Test Case 3:** Measure OCR processing time for a multi-page document.
    *   *Expected:* < 10 seconds per page.
*   **Test Case 4:** Simulate 100+ concurrent web users and 1,000+ concurrent mobile users.
    *   *Expected:* System remains stable and responsive within NFR targets.

## 6. CI/CD Integration

Automated tests will be integrated into the Continuous Integration/Continuous Deployment (CI/CD) pipeline.

*   **Pre-commit Hooks:** Run linting and basic unit tests locally before committing code.
*   **Pull Request (PR) Checks:** On every PR, the CI pipeline will automatically:
    *   Run all unit tests.
    *   Run integration tests.
    *   Perform static code analysis.
    *   Build the mobile and web applications.
    *   Report status back to the PR.
*   **Deployment to Staging:** Successful merges to the main branch will trigger automated deployment to the Staging environment, followed by automated E2E and API tests.
*   **Deployment to Production:** Manual approval will be required for deployment to Production, typically after successful UAT and security audits.

## 7. User Acceptance Testing (UAT)

UAT will be a critical phase involving actual end-users from DepEd Koronadal City.

*   **Participants:** Selected Teaching Personnel, Non-Teaching Personnel, AO II, HRMO Personnel, and Records Personnel.
*   **Scope:** Validate all key user journeys and business workflows, focusing on usability, accuracy, and alignment with operational procedures.
*   **Process:**
    1.  **Test Plan Development:** Create UAT test scenarios based on PRD.md and real-world use cases.
    2.  **Training:** Provide comprehensive training to UAT participants on system usage.
    3.  **Execution:** Participants execute test scenarios in the UAT environment, logging defects and feedback.
    4.  **Review & Sign-off:** Project team reviews UAT results, addresses critical issues, and obtains formal sign-off from DepEd stakeholders.

## 8. Data Validation Testing

Given the critical nature of HR data and OCR integration, extensive data validation testing will be performed.

*   **Input Validation:** Test all input fields for data type, length, format, and boundary conditions.
*   **OCR Data Integrity:**
    *   Test with various document qualities (clear, blurry, rotated, handwritten).
    *   Verify that OCR-extracted data matches the source document after personnel self-correction.
    *   Test mismatch detection and duplicate detection mechanisms.
*   **Database Integrity:** Ensure data consistency across related tables and adherence to schema constraints.
*   **Business Rule Validation:** Verify that all business rules (e.g., promotion criteria, compliance checks) are correctly applied to data.
*   **RBAC Data Access:** Ensure users can only view/modify data according to their assigned roles.