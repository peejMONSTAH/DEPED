# ROADMAP.md: Eminence HRIS

## Phased Delivery Plan

| Phase | Duration | Goals | Key Deliverables |
|:---|:---|:---|:---|
| **Phase 1: Foundation & Core Auth** | 6 weeks | Establish backend infrastructure, database schema, and secure authentication layer. | Backend API (Node.js/Express), PostgreSQL schema, JWT auth, user management endpoints, deployment pipeline |
| **Phase 2: Personnel Mobile App (MVP)** | 8 weeks | Build mobile app for personnel to authenticate, manage profiles, and initiate transactions. | Flutter mobile app (Android/iOS), profile management, transaction initiation, document upload UI, notification center |
| **Phase 3: Admin Web Dashboard (MVP)** | 8 weeks | Build web interface for AO II and HRMO to validate documents and manage transactions. | React.js web app, admin dashboard, document validation workflow, transaction approval queue, basic reporting |
| **Phase 4: OCR & Compliance Engine** | 6 weeks | Integrate Google Cloud Vision OCR, implement personnel self-correction workflow, and automated compliance checking. | OCR integration, data extraction & validation, mismatch detection, compliance monitoring dashboard |
| **Phase 5: Promotion & Ranking System** | 7 weeks | Develop configurable promotion rules engine, promotion cycle management, and ranking algorithms. | Configurable rules engine UI, promotion cycle workflows, rank-ordered list generation, promotion reports |
| **Phase 6: Digital 201 Repository & Archiving** | 5 weeks | Build version-controlled digital 201 file repository and archival management for Records Personnel. | Digital 201 repository, document versioning, archival workflows, retention policy management |
| **Phase 7: Testing, Security Hardening & UAT** | 6 weeks | Conduct comprehensive security audits, penetration testing, performance optimization, and user acceptance testing. | Security audit report, penetration test results, performance benchmarks, UAT sign-off |
| **Phase 8: Deployment & Go-Live Support** | 3 weeks | Deploy to production, conduct staff training, and provide go-live support. | Production deployment, training materials, support runbooks, monitoring dashboards |

**Timeline Disclaimer:** This roadmap assumes a team of **6–8 developers** (including 1–2 backend engineers, 2–3 mobile/frontend engineers, 1 QA engineer, and 1 DevOps engineer). Adjust phase durations proportionally for different team sizes. A smaller team (3–4 developers) may extend each phase by 40–60%; a larger team (10+ developers) may compress phases by 20–30%.

---

## MVP Feature List

### P0: Must Have for Launch (Phases 1–4)

These features are critical for the system to function as a minimum viable product and must be completed before go-live.

| Feature | Phase | Reference | Status |
|:---|:---|:---|:---|
| User Authentication (JWT-based login/logout) | 1 | FR-01 | Core |
| Personnel Profile Management (view/edit personal info) | 2 | FR-02 | Core |
| Transaction Initiation (select transaction type) | 2 | FR-03 | Core |
| Dynamic Checklist Generation (AI-driven requirements) | 2 | FR-04 | Core |
| Document Upload (camera/file picker) | 2 | FR-05 | Core |
| OCR Self-Correction Workflow (extract & review data) | 4 | FR-06 | Core |
| Transaction Status Tracking (real-time updates) | 2 | FR-07 | Core |
| In-App & Email Notifications | 2 | FR-08 | Core |
| Career Record View (read-only digital 201 summary) | 2 | FR-09 | Core |
| Admin Dashboard (summary of pending tasks & alerts) | 3 | FR-10 | Core |
| Personnel Account Management (SysAdmin CRUD) | 1 | FR-11 | Core |
| Document Validation Workflow (AO II queue & review) | 3 | FR-12 | Core |
| Transaction Approval (HRMO final authority) | 3 | FR-13 | Core |
| Audit Trail Logging (all significant actions) | 1 | FR-18 | Core |
| Role-Based Access Control (RBAC enforcement) | 1 | Security | Core |
| Data Encryption at Rest & in Transit (AES-256, TLS 1.2+) | 1 | Security | Core |

### P1: Should Have Within 1 Month Post-Launch

These features enhance the system's value and should be prioritized for the first post-launch release.

| Feature | Phase | Reference | Status |
|:---|:---|:---|:---|
| Configurable Promotion Rules Engine (HRMO interface) | 5 | FR-14 | Enhancement |
| Promotion Cycle Management (open/close cycles) | 5 | FR-15 | Enhancement |
| Rank-Ordered List Generation (based on rules) | 5 | FR-15 | Enhancement |
| Digital 201 Repository (search & view complete files) | 6 | FR-16 | Enhancement |
| System Reports & Export (compliance, promotion, demographics) | 3 | FR-17 | Enhancement |
| Credential Distribution Workflow (AO II to personnel) | 1 | FR-11 | Enhancement |
| Advanced Notification Preferences (user-configurable) | 2 | FR-08 | Enhancement |
| Duplicate Document Detection (OCR-assisted) | 4 | OCR Feature | Enhancement |

### P2: Nice to Have for Future Releases

These features provide additional value but are not required for launch or the first post-launch cycle.

| Feature | Phase | Reference | Status |
|:---|:---|:---|:---|
| Promotion Readiness Suggestions (AI-driven insights) | 5 | Optional AI | Future |
| Offline Mode for Mobile App | TBD | Out of Scope | Future |
| Direct Integration with National DepEd Systems | TBD | Out of Scope | Future |
| Leave Management Module | TBD | Out of Scope | Future |
| Performance Appraisal Module (comprehensive) | TBD | Out of Scope | Future |
| Mobile Web Version (responsive design) | 3 | Enhancement | Future |
| Advanced Analytics Dashboard (predictive insights) | TBD | Enhancement | Future |
| Bulk Import/Export of Personnel Records | 6 | Enhancement | Future |

---

## Milestones

| Milestone | Phase | Target Date | Deliverables |
|:---|:---|:---|:---|
| **Backend Infrastructure Ready** | 1 | Week 6 | PostgreSQL schema, Node.js/Express API scaffolding, JWT auth endpoints, deployment pipeline (CI/CD), initial security hardening |
| **Mobile App MVP (Alpha)** | 2 | Week 14 | Flutter app with authentication, profile management, transaction initiation, document upload, notification center (internal testing) |
| **Admin Web Dashboard (Alpha)** | 3 | Week 22 | React.js web app with admin dashboard, document validation queue, transaction approval workflow (internal testing) |
| **OCR Integration Complete** | 4 | Week 28 | Google Cloud Vision integrated, OCR extraction workflow, personnel self-correction UI, compliance checking automated |
| **Promotion Engine MVP** | 5 | Week 35 | Configurable rules engine, promotion cycle management, rank-ordered list generation, promotion reports |
| **Digital 201 Repository Live** | 6 | Week 40 | Version-controlled digital 201 files, archival workflows, retention policy management, Records Personnel interface |
| **Security & Performance Audit Complete** | 7 | Week 46 | Penetration test report, security audit sign-off, performance benchmarks (API p95 < 250ms, LCP < 2s), UAT sign-off from stakeholders |
| **Production Deployment & Go-Live** | 8 | Week 49 | System live in production, staff training completed, support team operational, monitoring dashboards active |

---

## Dependencies

### External Dependencies

These are third-party services, accounts, and integrations required for the system to function.

| Dependency | Purpose | Owner | Status | Notes |
|:---|:---|:---|:---|:---|
| **Google Cloud Vision API** | OCR text extraction from documents | DevOps/Backend | Required | Requires GCP account, API key, and billing setup. Estimated cost: $1–3/month for initial volume. |
| **AWS Account & Services** | Cloud hosting (EC2, RDS, S3, CloudFront) | DevOps | Required | Requires AWS account setup, IAM roles, VPC configuration, and cost estimation. |
| **Supabase Account** | File storage (S3-compatible) and real-time notifications | DevOps/Backend | Required | Requires Supabase project setup, API keys, and storage bucket configuration. |
| **Firebase Cloud Messaging (FCM)** | Push notifications for mobile app | Backend | Required | Requires Firebase project, FCM credentials, and integration with Supabase Notifications. |
| **SSL/TLS Certificates** | HTTPS encryption for web and API | DevOps | Required | Can use AWS Certificate Manager (free) or Let's Encrypt. |
| **Email Service Provider** | Transactional email (notifications, password resets) | Backend | Required | Options: AWS SES, SendGrid, or Mailgun. Estimated cost: $10–50/month. |
| **DepEd Plantilla Data** | Official staffing pattern for system setup | DepEd Stakeholder | Required | Must be provided in digital format (CSV or database export) by DepEd. |

### Internal Dependencies

These are deliverables and artifacts that must be completed within the project team before downstream work can proceed.

| Dependency | Required By | Owner | Status | Notes |
|:---|:---|:---|:---|:---|
| **Database Schema & ERD** | Phase 1 completion | Backend Lead | In Progress | Must include all entities: Users, Roles, Personnel, Transactions, Documents, Compliance Records, Promotion Applications, etc. |
| **REST API Specification** | Phase 1 completion | Backend Lead | In Progress | OpenAPI/Swagger spec for all endpoints. Must define request/response schemas, error codes, and authentication headers. |
| **UI/UX Wireframes & Design System** | Phase 2 start (mobile), Phase 3 start (web) | Design Lead | Pending | Figma mockups for all key screens. Must include design tokens (colors, typography, spacing) for consistency. |
| **Authentication & Authorization Design** | Phase 1 completion | Security Lead | In Progress | JWT token strategy, refresh token flow, RBAC matrix, session timeout policies. |
| **OCR Workflow Specification** | Phase 4 start | Backend Lead | Pending | Detailed spec for personnel self-correction workflow, data extraction rules, mismatch detection logic. |
| **Promotion Rules Engine Specification** | Phase 5 start | HRMO Stakeholder + Backend Lead | Pending | Business rules for reclassification, natural vacancy, and ECP. Must include scoring algorithms and tie-breaking logic. |
| **Security & Compliance Checklist** | Phase 7 start | Security Lead | Pending | OWASP Top 10 mitigation checklist, data privacy compliance (DepEd policies), encryption standards, audit logging requirements. |
| **User Acceptance Test (UAT) Plan** | Phase 7 start | QA Lead + Stakeholders | Pending | Test scenarios for all P0 features, sign-off criteria, stakeholder availability for testing. |
| **Training Materials & Documentation** | Phase 8 start | Technical Writer | Pending | User guides for personnel and admins, system administrator runbook, troubleshooting guide, API documentation. |

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|:---|:---|:---|:---|
| **Low OCR Accuracy on Handwritten/Poor-Quality Documents** | High | Medium | Implement the personnel self-correction workflow (FR-06) to allow users to review and correct OCR-extracted data before submission. Provide in-app guidelines for document scanning (good lighting, clear focus). Implement fallback to manual data entry for unreadable fields. Conduct OCR accuracy testing during Phase 4 with sample documents from DepEd. |
| **Data Privacy Breach or Unauthorized Access to PII** | High | Low | Enforce strict Role-Based Access Control (RBAC) with principle of least privilege. Encrypt all sensitive data at rest (AES-256) and in transit (TLS 1.2+). Conduct regular security audits and penetration testing (Phase 7). Implement comprehensive audit logging (FR-18). Establish incident response procedures and notify DepEd security team immediately upon any breach. |
| **User Resistance to Adoption (Personnel & Admin Staff)** | Medium | Medium | Conduct comprehensive onboarding and training sessions (Phase 8) for all user groups. Design an intuitive, modern UI/UX (per design decisions). Establish a dedicated support channel (email, helpdesk) for user queries. Gather feedback during UAT and iterate on pain points. Provide incentives or recognition for early adopters. |
| **Inaccurate or Incomplete Promotion Rules Configuration** | High | Medium | Involve HRMO stakeholders heavily during Phase 5 requirements gathering. Implement a "test run" or "dry run" feature for rule changes before applying them live. Create detailed documentation of all promotion criteria and scoring algorithms. Conduct UAT with HRMO staff using historical promotion data to validate rule accuracy. |
| **Performance Degradation Under Load (1,000+ Concurrent Mobile Users)** | High | Medium | Implement caching strategies (Redis) for frequently accessed data. Use database query optimization and indexing. Implement API rate limiting and load balancing. Conduct load testing during Phase 7 with simulated concurrent users. Monitor performance metrics in production (API p95 response time, database query times). Scale infrastructure horizontally if needed. |
| **Scope Creep or Missed Deadlines** | Medium | Medium | Maintain strict adherence to the MVP feature list (P0 only for launch). Use agile sprint planning with clear acceptance criteria. Conduct weekly status reviews with stakeholders. Document all change requests and evaluate impact before approval. Prioritize P1 and P2 features for post-launch releases. |
| **Integration Issues with Google Cloud Vision OCR** | Medium | Low | Conduct early integration testing (Phase 4, Week 1) with sample documents. Have a fallback manual data entry workflow. Monitor OCR API quotas and costs. Maintain documentation of OCR API limitations and workarounds. |
| **Insufficient Stakeholder Availability for Requirements & UAT** | Medium | Medium | Schedule requirements gathering sessions early (Phase 1). Identify key stakeholders (AO II, HRMO, Records Personnel) and secure their commitment upfront. Conduct UAT in phases (mobile first, then web, then promotion engine) to distribute workload. Provide flexible testing windows (morning/afternoon sessions). |
| **Database Migration or Data Integrity Issues During Go-Live** | High | Low | Develop a comprehensive data migration plan (Phase 1). Conduct dry-run migrations during Phase 7. Implement robust backup and rollback procedures. Test data integrity checks thoroughly. Have a rollback plan ready if critical issues arise post-deployment. |

---

## Success Criteria & Go-Live Checklist

### Technical Success Criteria

- [ ] All P0 features (16 items) fully implemented and tested.
- [ ] API response time (p95) consistently < 250ms under normal load.
- [ ] Web page load time (LCP) < 2.0 seconds.
- [ ] OCR processing time < 10 seconds per page.
- [ ] System uptime > 99.5% during UAT period.
- [ ] Zero critical security vulnerabilities identified in penetration testing.
- [ ] All OWASP Top 10 risks mitigated.
- [ ] Automated backup and recovery procedures validated.
- [ ] Audit logging functional for all significant actions.

### User Acceptance Criteria

- [ ] System Usability Scale (SUS) score > 80 from personnel and admin staff surveys.
- [ ] 90% of test scenarios in UAT plan pass without critical defects.
- [ ] Stakeholder sign-off from AO II, HRMO, and Records Personnel.
- [ ] Training materials completed and staff trained on all modules.
- [ ] Support team operational and ready for go-live.

### Business Success Criteria

- [ ] 90% of personnel actively using the system within 6 months post-launch.
- [ ] Average time to process a promotion application reduced by 50% within 12 months.
- [ ] Document deficiency/rejection rate reduced by 75% within 6 months.
- [ ] Physical paper usage for HR transactions reduced by 95%.

---

## Post-Launch Roadmap (Months 2–12)

### Month 2: P1 Features & Stabilization
- Deploy configurable promotion rules engine (FR-14).
- Deploy promotion cycle management and rank-ordered list generation (FR-15).
- Gather user feedback and address critical bugs.
- Optimize performance based on production metrics.

### Months 3–4: Digital 201 Repository & Advanced Features
- Deploy digital 201 repository with version control (FR-16).
- Deploy advanced reporting and export capabilities (FR-17).
- Implement duplicate document detection (OCR-assisted).
- Conduct second round of user training and support.

### Months 5–6: Optimization & Expansion
- Implement promotion readiness suggestions (optional AI feature).
- Expand system to additional DepEd divisions (if approved).
- Conduct comprehensive security audit and penetration testing.
- Optimize database queries and caching strategies.

### Months 7–12: Future Enhancements & Planning
- Gather requirements for Phase 2 features (leave management, performance appraisal, etc.).
- Plan integration with national DepEd systems (if approved).
- Develop mobile web version (responsive design).
- Build advanced analytics dashboard with predictive insights.

---

## Resource Allocation

| Role | Count | Responsibilities |
|:---|:---|:---|
| **Backend Engineer** | 2 | API development, database design, OCR integration, promotion engine logic, security implementation. |
| **Mobile Engineer (Flutter)** | 2 | Mobile app UI/UX, authentication flow, document upload, notification handling, testing. |
| **Frontend Engineer (React)** | 1 | Web dashboard, admin interfaces, reporting UI, design system implementation. |
| **QA Engineer** | 1 | Test planning, automated testing, UAT coordination, performance testing, security testing. |
| **DevOps Engineer** | 1 | Infrastructure setup (AWS, Supabase), CI/CD pipeline, monitoring, backup/recovery, deployment. |
| **Product Manager** | 1 | Requirements gathering, stakeholder communication, roadmap prioritization, UAT coordination. |
| **Security Lead** | 0.5 (shared) | Security architecture, threat modeling, penetration testing, compliance review. |
| **Design Lead** | 0.5 (shared) | UI/UX design, wireframes, design system, user research. |

---

## Budget & Cost Estimation

| Category | Item | Estimated Cost | Notes |
|:---|:---|:---|:---|
| **Cloud Infrastructure** | AWS (EC2, RDS, S3, CloudFront) | $2,000–3,500/month | Scales with usage. Includes redundancy and backups. |
| **Third-Party Services** | Google Cloud Vision OCR | $50–200/month | Based on document volume. |
| | Supabase Storage & Notifications | $100–300/month | Scales with storage and API calls. |
| | Email Service (SES/SendGrid) | $50–100/month | Transactional emails. |
| | Firebase Cloud Messaging | Free | Included with Firebase. |
| **Development Tools** | GitHub, Figma, Jira, Slack | $500–800/month | Licenses and subscriptions. |
| **Security & Compliance** | SSL/TLS Certificates, Security Audits | $1,000–2,000 (one-time) | Penetration testing and compliance review. |
| **Training & Documentation** | Training materials, user guides, API docs | $3,000–5,000 (one-time) | Contractor or internal resource. |
| **Contingency (15%)** | Buffer for overruns | $5,000–8,000 | Covers unexpected costs. |
| **TOTAL (Development Phase)** | 8 weeks, 6–8 developers | $80,000–120,000 | Excludes ongoing operational costs. |
| **TOTAL (Monthly Operations, Post-Launch)** | Infrastructure + Support | $3,000–5,000/month | Scales with user growth. |

---

## Communication & Governance

### Stakeholder Engagement Schedule

- **Weekly Status Meetings:** Development team + Product Manager (30 min).
- **Bi-Weekly Stakeholder Reviews:** Product Manager + AO II + HRMO representatives (1 hour).
- **Monthly Executive Briefings:** Project Lead + DepEd Leadership (30 min).
- **UAT Coordination:** QA Lead + Stakeholders (ongoing during Phase 7).

### Decision-Making Framework

- **Technical Decisions:** Backend Lead + Frontend Lead + DevOps Lead (consensus).
- **Feature Prioritization:** Product Manager + HRMO Stakeholder (based on business value).
- **Security & Compliance:** Security Lead + DepEd IT/Compliance Officer (approval required).
- **Go-Live Decision:** Project Lead + DepEd Leadership + QA Lead (unanimous sign-off required).

---

## Appendix: Glossary & References

- **AO II:** Administrative Officer II (DepEd personnel responsible for initial document validation).
- **HRMO:** Human Resource Management Officer (DepEd personnel with final approval authority).
- **201 File:** Official personnel record containing employment history, qualifications, and documents.
- **Plantilla:** Official staffing pattern or organizational structure.
- **ECP:** Equivalent Career Progression (promotion pathway).
- **JWT:** JSON Web Tokens (stateless authentication mechanism).
- **OCR:** Optical Character Recognition (automated text extraction from images).
- **RBAC:** Role-Based Access Control (permission model based on user roles).
- **SUS:** System Usability Scale (standardized user satisfaction metric).
- **UAT:** User Acceptance Testing (final validation by end-users before go-live).

**See PRD.md** for detailed functional and non-functional requirements, technology stack rationale, and risk analysis.