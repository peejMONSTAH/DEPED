  # 🏛️ Eminence HRIS — Complete Detailed System Showcase

> **Department of Education · City Schools Division of Koronadal City**  
> Enterprise Digital 201 HR Management Information System  
> Built with React · Node.js · PostgreSQL · Supabase · Google Vision AI

---

## 📐 System Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────┐
│  👤 PERSONNEL                    🖥️ ADMIN STAFF                      │
│  Teaching + Non-Teaching         SysAdmin · AO II · HRMO            │
│  Mobile Web Portal               Full Web Portal                    │
│  /personnel/*                    /admin/*                           │
└──────────────────┬───────────────────────────┬──────────────────────┘
                   │  REST API (JWT Auth)       │
          ┌────────▼───────────────────────────▼────────┐
          │          Node.js / Express.js Backend        │
          │   Auth · Transactions · Documents · Users    │
          │   Promotions · Personnel · Audit · Notifs    │
          └───┬───────────┬──────────────┬──────────────┘
              │           │              │
    ┌─────────▼──┐  ┌─────▼──────┐  ┌──▼──────────────┐
    │ PostgreSQL  │  │ Supabase   │  │ Google Vision AI │
    │ (via Supa-  │  │ Storage    │  │ OCR Engine       │
    │  base local)│  │ S3-compat  │  │                  │
    └─────────────┘  └────────────┘  └──────────────────┘
```

**Live Dev URLs:**
| Service | URL |
|:--------|:----|
| Web App | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| Supabase API | http://127.0.0.1:54321 |
| Mailpit (Email Preview) | http://127.0.0.1:54324 |
| Database Direct | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

---

## 🔐 MODULE 0 — Authentication & Login (`/login`)

### What it does
Single entry point for **all 5 user roles**. After authentication the system auto-detects the role and redirects appropriately — no manual portal selection needed.

### Features
| Feature | Detail |
|:--------|:-------|
| **JWT Auth** | Short-lived access tokens + refresh tokens |
| **Role-based redirect** | Teaching/Non-Teaching → `/personnel/home`; Admin → `/admin/dashboard` |
| **Password hashing** | Argon2 / bcrypt |
| **Account Setup Modal** | First-login forced password change |
| **Auth Transition Overlay** | Animated handoff between portals |
| **Quick Role Switcher** | 1-click test account switching (dev tool, bottom-right corner) |

### Route Guards
```
RequireAuth checks localStorage token + role
→ SYSTEM_ADMIN / AO_II / HRMO  → AdminLayout
→ TEACHING / NON_TEACHING       → PersonnelLayout
→ No token                      → /login
```

---

## 📱 PERSONNEL PORTAL — Teaching & Non-Teaching Staff

> **URL Base:** `/personnel/*`  
> **Layout:** Mobile-first responsive web, bottom nav bar, optimized for phones

---

### 📱 P1 — Personnel Home (`/personnel/home`)

The **command center** for all personnel. Loaded immediately after login.

#### Widgets & Data Shown
| Widget | Data Source |
|:-------|:------------|
| **Welcome card** | User name, role label (Teaching/Non-Teaching), initials avatar |
| **Active Transactions** | Live from `/transactions/my-transactions` API — count + status |
| **Alerts counter** | Count of transactions with `DEFICIENCY` or `RETURNED` status |
| **Open Promotion Cycles** | From `/promotions/cycles?status=ACTIVE,PLANNING` — shows available cycles |
| **Apply for Promotion** | One-tap application per open cycle |
| **Quick Action buttons** | New Transaction · My Submissions · My Profile · Notifications |

#### Real-time Updates
Uses `useRealtimeTransactions` hook — Supabase Realtime subscription auto-refreshes transaction list and open cycles.

---

### 📱 P2 — Profile Completion (`/personnel/profile-completion`)

**Multi-tab form** capturing the complete DepEd digital identity. Must be complete before transactions can be initiated.

#### Tabs & Fields
| Tab | Fields |
|:----|:-------|
| **Personal Information** | First/Last/Middle Name, Suffix, Birth Date, Birth Place, Civil Status, Sex, Nationality, Religion, Height, Weight, Blood Type |
| **Personal Data Sheet (PDS)** | GSIS No., Pag-IBIG No., PhilHealth No., SSS No., TIN, Agency Employee No., Residential & Permanent Address, Telephone, Mobile, Email, Spouse info, Father/Mother names, Educational Background, Civil Service Eligibility, Voluntary Work, L&D |
| **Work Experience Sheet (WES)** | Dynamic rows — Date From/To, Position Title, Department/Agency, Monthly Salary, Salary Grade, Status, Gov/Private |
| **Employment Info** | Employee ID, Position, Item Number, Salary Grade, Step Increment, Monthly Salary, Appointment Status, First Day of Service, District, School Assignment, Division, Region, Emergency Contact |

#### Behavior
- Progress tracked per tab with checkmark indicators
- Each tab saves independently via `addToast` confirmation
- Pulls DepEd school list from `DEPED_KORONADAL_DISTRICTS` constant (all schools in Koronadal districts)

---

### 📱 P3 — New Transaction (`/personnel/new-transaction`)

Personnel selects the **type of HR appointment transaction** to file.

#### Transaction Types Available
| Transaction Type | Backend Key |
|:----------------|:------------|
| Promotion Appointment (Teaching) | `PROMOTION_APPOINTMENT` |
| Promotion Appointment (Non-Teaching) | `PROMOTION_APPOINTMENT` |
| Newly Hired Appointment (Teaching) | `NEWLY_HIRED_APPOINTMENT` |
| Newly Hired Appointment (Non-Teaching) | `NEWLY_HIRED_APPOINTMENT` |
| Salary Adjustment | `SALARY_ADJUSTMENT` |
| Principal Promotion | `PROMOTION_APPOINTMENT_PRINCIPAL` |

#### Promotion Eligibility Check
- System checks if the personnel has applied or is in an active promotion cycle
- Shows `INELIGIBLE` banner (red badge) if not yet eligible with reason message
- Shows available open cycles with "Apply" button if eligible

---

### 📱 P4 — Dynamic Document Checklist (`/personnel/checklist`)

After selecting a transaction, the system generates a **personalized checklist** based on transaction type + personnel category.

#### Promotion Appointment — Teaching (18 documents)
| # | Document | Mandatory |
|:--|:---------|:----------|
| 1 | NOTARIZED Oath of Office (REVISED 2025) — 3 original copies | ✅ |
| 2 | NOTARIZED Omnibus Certification of Authenticity & Veracity | ✅ |
| 3 | NOTARIZED Personal Data Sheet (CSC Form No. 212 Revised 2025) | ✅ |
| 4 | Work Experience Sheet (CS Form 212 Attachment) — descending order | ✅ |
| 5 | PRC ID / CSC Eligibility Verification | ✅ |
| 6 | VALID PRC ID Card | Optional |
| 7 | PRC Board Rating | Optional |
| 8 | CSC Certificate of Eligibility | Optional |
| 9 | Principal's Test Certificate of Rating | Optional |
| 10 | CAV, Special Order, AND Official TOR | ✅ |
| 11 | VALID NC II / NC III / TMC / NTTC Certificate | Optional |
| 12 | NOTARIZED Latest SALN (Revised 2025) | ✅ |
| 13 | SALN Justification Letter | Optional |
| 14 | PSA Marriage Certificate | Optional |
| 15 | PSA Birth Certificate | ✅ |
| 16 | Latest Service Record (original, signed) | ✅ |
| 17 | Latest DepEd Payslip | ✅ |
| 18 | Latest Performance Rating (IPCRF / OPCRF) | ✅ |

#### Promotion Appointment — Non-Teaching (15 documents)
Similar list without PRC-specific items, NCOIs replaced by NC certificates.

#### Newly Hired Appointment — Teaching (7 documents)
PDS, TOR, PRC License, Medical Certificate, NBI Clearance, PSA Birth Certificate, Omnibus Certification.

#### Salary Adjustment (5 documents)
PDS, Latest Appointment, Service Record, Payslip, IPCR Ratings.

#### Checklist Item States
- `PENDING_UPLOAD` — not yet uploaded
- `VALIDATED` — verified by AO II / HRMO
- `DEFICIENT` — rejected, requires re-upload with notes shown

---

### 📱 P5 — Document Upload (`/personnel/upload-document`)

For each checklist item:
1. Personnel selects file (PDF, JPG, PNG) from device
2. File POSTed to backend → stored to **Supabase Storage (S3)**
3. Backend sends document to **Google Cloud Vision AI** for OCR
4. Extracted data returned to frontend

---

### 📱 P6 — OCR Review & Self-Correction (`/personnel/ocr-review`)

**Side-by-side review interface:**
- Left: Document image/PDF preview
- Right: OCR-extracted field data with editable inputs
- Color-coded confidence indicators per field
- "Flag for re-upload" option if document is unclear
- "Confirm & Save" marks checklist item as `UPLOADED & REVIEWED`

> This step dramatically reduces AO II rejection rate — personnel verify their own data before submission.

---

### 📱 P7 — My Transactions (`/personnel/transactions`)

Full list of all past and active transactions with **live status tracking**:

| Status | Display Color | Meaning |
|:-------|:-------------|:--------|
| `DRAFT` | Gray | Started but not submitted |
| `PENDING_VALIDATION` | Blue | Submitted, awaiting AO II |
| `SUBMITTED_TO_AO2` | Blue | In AO II's queue |
| `FOR_APPROVAL` | Purple | Validated by AO II, awaiting HRMO |
| `DEFICIENCY` | Red | AO II found problems |
| `RETURNED` | Orange | Returned for correction |
| `RETURNED_BY_AO2` | Orange | Specifically returned by AO II |
| `APPROVED` | Green | HRMO approved, career updated |
| `REJECTED` | Red | HRMO rejected with reason |

---

### 📱 P8 — Career Record / Service Record (`/personnel/profile`)

**Read-only digital 201 career file:**

| Section | Data Shown |
|:--------|:----------|
| **Personnel Identity Card** | Name, Employee ID, gradient blue card |
| **Service Summary** | Current Position, First Appointment Date, Years in Service, Latest Salary Grade, Latest Appointment Date, Latest Promotion Date |
| **Career Timeline** | Visual chronological timeline of all career events |
| **Promotion History** | Year, Event, Type, Date, Reference TX, Status, Salary |
| **Service Record PDF** | Print-to-PDF button → generates official DepEd service record |

**Sample Career Milestones:**
- Initial Appointment: Teacher I (SG 11) — 1995
- Salary Step Increment: SG 11 Step 3 — 2010
- Promoted to Teacher II (SG 12) — 2015
- Salary Step Increment: SG 12 Step 4 — 2020
- Promoted to Teacher III (SG 13) — 2024

---

### 📱 P9 — Personnel Notifications (`/personnel/notifications`)

Real-time notification center showing:
- Transaction status changes
- Document deficiency details with AO II comments
- Approval/Rejection notices with reasons
- Promotion cycle announcements
- System announcements

---

## 🖥️ ADMIN WEB PORTAL

> **URL Base:** `/admin/*`  
> **Layout:** Fixed left sidebar (260px) + main content area, collapsible

### Sidebar Navigation by Role

| Section | Item | SysAdmin | AO II | HRMO |
|:--------|:-----|:--------:|:-----:|:----:|
| Overview | Dashboard | ✅ | ✅ | ✅ |
| Overview | Notifications | ✅ | ✅ | ✅ |
| Transactions | Transaction Queue | — | ✅ | ✅ |
| Transactions | Doc. Validation | — | ✅ | — |
| Transactions | HRMO Approvals | — | — | ✅ |
| HR & 201 | Personnel | ✅ | ✅ | ✅ |
| HR & 201 | Credentials | ✅ | ✅ | — |
| HR & 201 | Compliance & YOS | — | — | ✅ |
| HR & 201 | Promotions | ✅ | ✅ | ✅ |
| System | Reports | ✅ | ✅ | ✅ |
| System | Audit Trail | ✅ | — | — |
| System | Settings & Roles | ✅ | — | — |

---

### 🖥️ A1 — Admin Dashboard (`/admin/dashboard`)

**The intelligence hub** — different KPIs auto-shown based on logged-in role.

#### Stat Cards (top row, 4 columns)
| Card | Data | Color |
|:-----|:-----|:------|
| **Total Personnel** | Count from `/personnel` API | Blue |
| **Transactions Logged** | All-time count from `/transactions` | Blue |
| **Pending Review** | Count of non-approved/rejected transactions | Red (urgent) |
| **Approved / Validated** | Count of approved txs or validated docs | Green |

#### Real-time Transaction Feed (main table)
Columns: Ref No. (monospace) · Personnel (avatar + name) · Transaction Type · Status Badge · Date

Uses `useRealtimeTransactions` hook for live updates via Supabase.

#### System Alerts Panel (right column)
- **Active Promotion Cycle** — amber warning card
- **Digital 201 File Security** — blue info card (cryptographic hash verification)

#### Quick Management Actions (bottom 3-column grid)
- 🔑 Create Accounts & Credentials → `/admin/credentials`
- ✅ Document Validation (AO II) → `/admin/documents`
- 👥 Personnel Master List → `/admin/personnel`

#### Power Features
- **⌘K Command Palette** — keyboard shortcut opens spotlight-style universal search/navigation
  - Fuzzy search across all pages, personnel, actions
  - Categories: Navigation · 201 Personnel · Transactions · Settings
  - Theme switcher (Dark/Light/High Contrast)
  - Keyboard arrow navigation + Enter to execute
- **1-Click Role** button — quick test account switching between all roles

---

### 🖥️ A2 — Transaction Queue (`/admin/transactions`) — AO II + HRMO

**Unified pipeline view** of all HR transactions across the system.

#### Features
| Feature | Detail |
|:--------|:-------|
| **Paginated table** | 15 transactions per page |
| **Status filter pills** | All · DRAFT · PENDING_VALIDATION · SUBMITTED_TO_AO2 · FOR_APPROVAL · DEFICIENCY · APPROVED · REJECTED |
| **Search** | By name, employee ID, or transaction type |
| **Role-aware action buttons** | AO II sees "Validate" → `/admin/documents`; HRMO sees "Approve" → `/admin/approvals` |
| **Real-time updates** | Supabase Realtime auto-refreshes on new submissions |
| **Deep link** | `?txId=123` URL param auto-opens specific transaction |

---

### 🖥️ A3 — Document Validation (`/admin/documents`) — AO II ONLY

> **Per 201-System-Workflow.md:** AO II School-Level Qualification & Validation  
> Teaching Personnel: DepEd Order No. 7 s. 2023 (Natural Vacancy) & DepEd Order No. 19/24 s. 2025 (ECP)  
> AO II has **full authority** to declare QUALIFIED or DISQUALIFIED

#### Three-Tab Workspace
| Tab | Purpose |
|:----|:--------|
| **PENDING** | Active transactions awaiting AO II review |
| **DEFICIENCY** | Transactions flagged with document problems |
| **HISTORY** | Completed validations with audit trail |

#### Per-Transaction Detail View (split panel)
**Left panel — Transaction Info:**
- Personnel name, Employee ID, category (Teaching/Non-Teaching)
- Promotion track (NATURAL_VACANCY / ECP / OTHER)
- Policy framework (DepEd Order references)
- Compliance score percentage
- Qualification status badge (PENDING_EVALUATION / QUALIFIED / DISQUALIFIED)

**Right panel — Document Viewer:**
- Document image/PDF preview with **zoom controls** (zoom in/out/reset)
- OCR confidence score per document
- OCR-extracted data + user corrections side-by-side

#### Document Actions (per document)
- ✅ **Mark VERIFIED** — document accepted
- ❌ **Mark DEFICIENT** — requires deficiency note/comment
- **Bulk Verify** — select-all checkbox + batch verify multiple docs at once
- **Bulk Reject** — flag multiple documents simultaneously

#### Final Submission Decision
- All documents VERIFIED → Transaction → `FOR_APPROVAL` → HRMO notified
- Any DEFICIENT → Transaction → `RETURNED` → Personnel notified with deficiency details

#### Official DepEd Checklist (18 documents for Teaching Promotion)
System knows all 18 required documents per transaction type, tracks each individually.

---

### 🖥️ A4 — HRMO Approvals (`/admin/approvals`) — HRMO ONLY

> **Per 201-System-Workflow.md HRMO Steps 1-3:**  
> Step 1: Review Validated Transactions  
> Step 2: Final Approval (Approve / Return)  
> Step 3: Career Lifecycle Update (auto-triggered on approval)

#### Transaction Review Panel
**Personnel Profile Section:**
- Full name, Employee ID, category, position, years in service
- Current position, department/school

**Compliance Information:**
- Compliance score (100%)
- Validation notes from AO II
- Validation date and validator name

**Document List:**
- All uploaded documents with individual validation status
- AO II notes per document
- View document button (opens document viewer modal)

**Promotion Details Card** (if promotion transaction):
- Promotion cycle name and type (NATURAL_VACANCY/ECP)
- Target position
- Is Selected for promotion badge

#### Approval Actions
| Button | Result |
|:-------|:-------|
| ✅ **Approve Transaction** | Status → `APPROVED` · Career lifecycle auto-update triggers · Personnel notified · Success chime plays |
| ↩️ **Return to AO II** | Status → `RETURNED_BY_AO2` · HRMO must provide reason |

#### Step 3: Career Lifecycle Update (auto on approval)
System automatically updates 5 career record fields:
1. **Appointment History** — new appointment entry
2. **Promotion History** — promotion milestone added to timeline
3. **Salary Adjustment History** — SG/step change logged
4. **Service Records** — service record updated
5. **Transaction History** — transaction reference recorded

> Visual indicator shows all 5 fields updated with green checkmarks

---

### 🖥️ A5 — Personnel Management (`/admin/personnel`) — All Admin Roles

**Master directory** of all DepEd division personnel.

#### Table View
Columns: Employee ID · Name · Designation · Status · Date Hired · Profile Complete · Last Login

#### Search & Filter
- Text search by name, employee ID, or designation
- Real-time filtering as you type (via `useRealtimeNotifications` polling)

#### Add Personnel Form (Complete PDS CS Form 212)
| Field Group | Fields |
|:------------|:-------|
| **Identity** | First/Last/Middle Name, Suffix |
| **Demographics** | Birth Date, Gender, Civil Status, Contact Number, Address |
| **Employment** | Date Hired, Email, Password, Role/Category |
| **Assignment** | District (dropdown), School (dropdown from selected district) |
| **Position** | Designation (auto-filled from position type dropdown) |

**Personnel Type Options:**
- Teaching Personnel
- Non-Teaching Personnel
- AO II (auto-fills designation with "Administrative Officer II — [School] ([District])")
- HRMO
- System Admin

**District/School Dropdown**: Pre-populated with all schools in all Koronadal City districts.

#### Personnel Detail Panel (right sidebar on click)
- Full profile summary card
- Plantilla item details (if assigned)
- Account email + last login

#### Permissions
- **HRMO + SysAdmin**: Full add/edit capability
- **AO II**: Read-only view of personnel list

---

### 🖥️ A6 — Credential Distribution (`/admin/credentials`) — SysAdmin + AO II

**Account creation and credential management** for all system users.

#### Account Records Table
Columns: Employee · Email · Role · Account Status (PENDING/ACTIVE/LOCKED/INACTIVE) · Created At

**Status Badges:**
- 🟢 ACTIVE — can log in
- 🟡 PENDING — awaiting first login
- 🔴 LOCKED — security lockout
- ⚫ INACTIVE — deactivated

#### Create New Account Flow
**AO II context:** Auto-detects AO's own district/school from their designation and pre-fills the school assignment.

**Form Fields (Complete PDS)**
| Category | Fields |
|:---------|:-------|
| Personal | First/Last/Middle Name, Suffix, Birth Date, Gender, Civil Status, Contact, Address |
| Account | Email (auto-generated for AO II: `ao.[schoolslug]@deped.gov.ph`), Password |
| Assignment | Personnel Type → District → School (cascading dropdowns) |
| Position | Auto-filled based on type (Teaching/Non-Teaching/AO II/HRMO) |

**Smart Auto-Fill (AO II type):**
- Position auto-fills: `Administrative Officer II — [School] ([District])`
- Email auto-fills: `ao.[schoolslug]@deped.gov.ph`
- Address auto-fills: `[School], [District]`

#### Password Reset Modal
- Select user → "Reset Password" → Set new password → Confirm
- Default reset password: `Reset@Pass2026!`

---

### 🖥️ A7 — Compliance & Years of Service (`/admin/compliance`) — HRMO ONLY

> **Per 201-System-Workflow.md HRMO Steps 4 & 5**

#### Tab 1: Compliance Monitoring (HRMO Step 4)

**Analytics Header (3 KPI counters):**
- ✅ Fully Compliant count (green)
- ⚠️ Partially Compliant count (amber)
- ❌ Non-Compliant count (red)

**Transaction Status Strip:**
- Pending Transactions count
- Returned Transactions count
- Approved Transactions count

**Personnel Compliance Table:**
Columns: Employee ID · Name · Position · Category · Compliance Status · Score % · Filter

**Compliance Status Logic:**
- `profileComplete = true` → Fully Compliant (100%)
- `profileComplete = false` → Partially Compliant (70%)
- Manual flags → Non-Compliant

**Filter Pills:** All · Fully Compliant · Partially Compliant · Non-Compliant

#### Tab 2: Years of Service (HRMO Step 5)

**YOS Computation Logic (per 201-System-Workflow.md):**
Using: Appointment Date + PDS + Work Experience Sheet + Service Records

**Per-personnel display:**
- Years in Service (auto-computed: `(today - dateHired) / 365.25`)
- Current Position
- First Appointment Date
- Latest Promotion Date
- Latest Salary Grade (from plantilla item SG)
- Full career timeline

---

### 🖥️ A8 — Promotion Management (`/admin/promotions`) — SysAdmin + AO II + HRMO

> **The flagship module** — dark-themed premium UI  
> Implements the **official DepEd Comparative Assessment Result (CAR)** scoring system  
> Two-Stage Merit Selection Process (AO II Initial → HRMO Final)

#### Left Panel — Promotion Cycles List
- Badge showing active year (e.g., "2026 Active")
- Each cycle card: Type · Status · Click to select

#### Cycle Header (after selection)
- Cycle name (e.g., "2026 Master Teacher 5")
- Position badge · District badge · Mobile applicants note
- Set Status dropdown: ACTIVE / PLANNING / COMPLETED / CANCELLED
- **Download Official CAR (.docx)** button — generates official DepEd document
- **Submit External Applicant Form** link

#### Search Bar
- Search by: applicant name, applicant number (APP-2026-XXXX), employee ID

#### 4-Tab Workspace

##### Tab 1: 🏆 Realtime Ranking Leaderboard
**Official DepEd CAR Criteria Strip:**
- Teaching: AO Subtotal (60 pts) + PPST COIs Demo (25 pts) + PPST NCOIs Portfolio (15 pts) = **100 pts CAR Total**
- Non-Teaching: AO Subtotal (80 pts) + Potential [Written (5) + BEI (5) + Skills (10)] = **100 pts CAR Total**

**Live Synchronized badge** (green pulsing dot)

**Leaderboard Table:**
Columns: Rank · Applicant Name · Applicant Number · Total CAR Score · Action

- Rank 1-3 get gold/silver/bronze visual treatment
- Score bar visualization per row
- Promoted candidates get green highlight row
- "Select" button for HR to officially choose promotion candidate
- "Download CAR" button per entry
- Real-time sorting — updates live as scores are entered

##### Tab 2: 📋 AO II Initial Rating Workspace

**District Jurisdiction Enforcement:**
- AO II can only rate candidates from their assigned district
- Out-of-district AOs see "District Restricted" lock badge

**Filter Pills:** All · Pending Evaluation · Already Rated

**KPI Header:**
- Total Applicants · Rated · Pending · Max Score target

**Applicant Scoring Cards (grid layout):**
Each card shows:
- Avatar (gradient, initials) · Name · Designation
- Current AO II subtotal score (if rated)
- Score breakdown: Education / Training / Experience / Performance mini-bars
- "Evaluate & Score" button (blue) or "Revise AO Rating" (amber if already rated)
- "201 File" button — opens applicant profile modal

**AO II Initial Rating Modal (official DepEd CAR criteria):**

*For Teaching (60 pts max):*
| Criterion | Max Pts |
|:----------|:--------|
| Education | 10 |
| Training & LD | 10 |
| Experience | 10 |
| Performance Rating (IPCRF) | 30 |
| **AO II Subtotal** | **60** |

*For Non-Teaching (80 pts max):*
| Criterion | Max Pts |
|:----------|:--------|
| Education | 10 |
| Training & LD | 10 |
| Experience | 10 |
| Performance Rating | 20 |
| Outstanding Accomplishments | 5 |
| Application of Education | 15 |
| Application of L&D | 10 |
| **AO II Subtotal** | **80** |

Quick-set buttons for common scores (e.g., 23.50, 20.00 for COIs).
AO Remarks text area.

##### Tab 3: ✅ HRMO Final Scoring Workspace

**KPI Header:**
- Total In Deliberation · Deliberated & Ranked · Pending Board Score · 100 pts Combined CAR Target

**Filter Pills:** All · Pending Board · Finalized

**Candidate Scoring Cards (grid):**
- Two-stage score gauge:
  - Stage 1 · AO II Score (blue) — e.g., 48.00 / 60
  - Stage 2 · HRMO Score (green) — e.g., 32.00 / 40
  - Combined CAR Total (amber) — e.g., 80.00 / 100.00 pts
- Governance tags: BI (Background Investigation): Passed/Failed · Probation period
- HRMO Board remarks snippet
- "Finalize Score" or "Revise Score" button

**HRMO Final Rating Modal:**

*For Teaching (40 pts — PPST):*
| Criterion | Max Pts |
|:----------|:--------|
| PPST COIs Demo Teaching | 25 |
| PPST NCOIs Portfolio | 15 |
| **HRMO Deliberation Total** | **40** |

*For Non-Teaching (20 pts — Potential):*
| Criterion | Max Pts |
|:----------|:--------|
| Written Examination | 5 |
| Behavioral Event Interview (BEI) | 5 |
| Skills/Competency Demonstration | 10 |
| **HRMO Deliberation Total** | **20** |

Governance Fields:
- For Background Investigation: YES / NO
- For Appointment: Recommended for Appointment / Conditional
- For Probation: 6 months / 3 months / None

##### Tab 4: 🎯 HR Candidate Selection Workspace

Final step — HRMO officially selects the promoted candidate:
- Lists all applicants sorted by final CAR score
- "Select for Promotion" button with confirmation modal
- Confirmation modal shows full candidate details + score before committing
- On confirmation → status → `PROMOTED` · career record updated

#### Create Promotion Cycle Modal
Fields:
- Cycle Name (e.g., "2026 Master Teacher 5")
- Cycle Type (NATURAL_VACANCY / ECP / RECLASSIFICATION)
- Target Position (from TEACHING_POSITIONS or NON_TEACHING_POSITIONS list)
- District (DEPED_KORONADAL_DISTRICTS dropdown)
- Start Date / End Date
- Personnel Track (TEACHING / NON_TEACHING)
- Plantilla Item Number
- Additional rules configuration

#### Mobile Applicant Selection Modal
For positions above Teacher I — pulls from mobile app applicants:
- Lists all personnel who applied via the mobile portal
- Select checkboxes → Add to cycle

#### Download Official CAR Document
Backend generates official `.docx` DepEd Comparative Assessment Result document:
- Department of Education letterhead
- Position details, Plantilla Item Number
- Date of Final Deliberation
- Full ranked applicant table with scores
- Downloadable via blob URL

---

### 🖥️ A9 — Audit Trail (`/admin/audit`) — SYSTEM ADMIN ONLY

> **Per 201-System-Workflow.md Step 5:** Tamper-evident action log

#### Table Columns
| Column | Description |
|:-------|:------------|
| **Timestamp** | Exact date/time of action |
| **User Account** | Email of actor |
| **System Role** | Role badge |
| **Action** | Action type badge (LOGIN_SUCCESS, USER_CREATED, etc.) |
| **Operation Details** | Full human-readable description |
| **Status** | SUCCESS / FAILED |

#### Category Filter Tabs
- All Activities
- Login Activities
- Account Creation
- Document Uploads
- Validation Actions
- Approval Actions
- Returned Submissions
- Account Modifications

#### Actions Logged
```
LOGIN_SUCCESS / LOGIN_FAILED
USER_CREATED / USER_UPDATED / USER_DEACTIVATED
DOCUMENT_UPLOADED / DOCUMENT_VALIDATED / DOCUMENT_REJECTED
TRANSACTION_SUBMITTED / TRANSACTION_APPROVED / TRANSACTION_REJECTED
SUBMISSION_RETURNED
ROLE_MODIFIED / PERMISSION_CHANGED
PROMOTION_CYCLE_CREATED / RATING_SUBMITTED / CANDIDATE_SELECTED
```

#### Search + Export
- Full-text search across user, action, details
- "Export Audit Trail" button → downloads audit log

---

### 🖥️ A10 — Reports & Analytics (`/admin/reports`) — All Admin Roles

#### Bar Chart: Plantilla Item Distribution
- Libraries: Recharts (`BarChart`, `Bar`, `CartesianGrid`, `Tooltip`)
- Data: Elementary Teaching (312 filled, 12 vacancies), Secondary Teaching (184, 8), Non-Teaching/Admin (46, 3), Support (20, 1)
- Colors: Blue (filled) · Orange (vacancies)

#### Available Report Downloads
| Report | Description |
|:-------|:------------|
| **Plantilla Item Audit Report** | Summary of filled items, vacancies, division breakdown |
| **OCR Data Accuracy Log** | OCR self-correction rates, validation performance |
| **Compliance Deficiency Rates** | Transaction failure rates, timeline delays, submission reports |

Each with Export button → triggers toast + file download (Excel/PDF).

---

### 🖥️ A11 — Settings & Roles (`/admin/settings`) — SYSTEM ADMIN ONLY

#### Interface Appearance & Theme
Three theme options with live switching:
| Theme | Background | Text | Description |
|:------|:-----------|:-----|:------------|
| **Dark Mode** (Default) | `#0d1117` | `#e6edf3` | Sleek dark, reduced eye strain |
| **Light Mode** | `#ffffff` | `#0f172a` | Clean government paper aesthetic |
| **High Contrast** | `#000000` | `#ffffff` | Maximum visibility, accessibility |

Active theme highlighted with blue border + "Active" badge.

#### Security Policies
- **MFA toggle** — requires authenticator app for all admin users
- **Session Inactivity Timeout** — configurable (default: 30 minutes)

#### Document & OCR Config
- **Allowed File Formats** — configurable (default: PDF, JPG, PNG)
- **Max File Size Limit** — configurable in MB (default: 10MB)

---

## ⚙️ BACKEND API — Complete Route Map

### Auth Routes (`/auth`)
| Method | Path | Description |
|:-------|:-----|:------------|
| POST | `/auth/login` | User login, returns JWT |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Invalidate session |
| POST | `/auth/setup-password` | First-time password setup |

### Users Routes (`/users`)
| Method | Path | Role | Description |
|:-------|:-----|:-----|:------------|
| GET | `/users` | Admin | List all users |
| POST | `/users` | SysAdmin/HRMO | Create user + personnel record |
| GET | `/users/:id` | Admin | User detail |
| PUT | `/users/:id` | SysAdmin | Update user |
| DELETE | `/users/:id` | SysAdmin | Delete user |
| POST | `/users/:id/reset-password` | SysAdmin/AO II | Reset password |

### Transactions Routes (`/transactions`)
| Method | Path | Role | Description |
|:-------|:-----|:-----|:------------|
| GET | `/transactions` | Admin | All transactions (paginated, filterable) |
| POST | `/transactions` | Personnel | Create transaction |
| GET | `/transactions/my-transactions` | Personnel | Own transactions |
| GET | `/transactions/:id` | Auth | Transaction detail |
| PATCH | `/transactions/:id/status` | AO II/HRMO | Update status |
| POST | `/transactions/:id/validate` | AO II | Submit validation |
| POST | `/transactions/:id/approve` | HRMO | Approve/reject |

### Documents Routes (`/documents`)
| Method | Path | Role | Description |
|:-------|:-----|:-----|:------------|
| POST | `/documents/upload` | Personnel | Upload + trigger OCR |
| GET | `/documents/:id` | Auth | Document metadata |
| PATCH | `/documents/:id/validate` | AO II | Mark validated/deficient |
| DELETE | `/documents/:id` | Admin | Remove document |

### Personnel Routes (`/personnel`)
| Method | Path | Role | Description |
|:-------|:-----|:-----|:------------|
| GET | `/personnel` | Admin | All personnel (paginated) |
| POST | `/personnel` | SysAdmin/HRMO | Create personnel record |
| GET | `/personnel/:id` | Admin | Personnel detail |
| PATCH | `/personnel/:id` | Admin | Update personnel |

### Promotions Routes (`/promotions`) — 15 endpoints
| Method | Path | Role | Description |
|:-------|:-----|:-----|:------------|
| GET | `/promotions/my-promotion-status` | Personnel | Own eligibility check |
| GET | `/promotions/cycles` | Auth | All cycles |
| POST | `/promotions/cycles` | HRMO/AO II/Admin | Create cycle |
| PUT | `/promotions/cycles/:id` | HRMO/AO II/Admin | Update cycle |
| GET | `/promotions/cycles/:id/applications` | Auth | Cycle applicants |
| GET | `/promotions/cycles/:id/car-document` | HRMO/AO II/Admin | Generate CAR .docx |
| POST | `/promotions/cycles/:id/manual-application` | Admin | Add applicant manually |
| POST | `/promotions/cycles/:id/generate-ranking` | Admin | Generate ranking |
| GET | `/promotions/cycles/:id/ranking-results` | Auth | Ranking results |
| GET | `/promotions/cycles/:id/leaderboard` | Admin | Live leaderboard |
| POST | `.../applications/:appId/initial-rating` | AO II/Admin | Submit AO II rating |
| POST | `.../applications/:appId/final-rating` | HRMO/Admin | Submit HRMO rating |
| POST | `.../applications/:appId/select-promotion` | HRMO/Admin | Select for promotion |
| POST | `/promotions/cycles/:id/apply` | Personnel | Apply for cycle |
| GET | `/promotions/career/service-records` | Auth | Own service records |

### Notifications Routes (`/notifications`)
| Method | Path | Description |
|:-------|:-----|:------------|
| GET | `/notifications` | Get all notifications for current user |
| PATCH | `/notifications/:id/read` | Mark as read |

### Audit Routes (`/audit-logs`)
| Method | Path | Role | Description |
|:-------|:-----|:-----|:------------|
| GET | `/audit-logs` | SysAdmin | All audit logs |

---

## 🔔 Cross-Cutting Features

### Real-time Notifications (Supabase Realtime)
| Hook | Used In | Triggers |
|:-----|:--------|:---------|
| `useRealtimeTransactions` | Dashboard, TransactionQueue, Personnel Home | New transaction submitted, status changed |
| `useRealtimeNotifications` | Sidebar (badge count), PersonnelNotifications | New notification created |

**Notification Events:**
| Event | Recipients |
|:------|:----------|
| Transaction submitted | AO II (of school district) |
| Document validated | Personnel |
| Document deficient | Personnel (with comment) |
| Transaction → FOR_APPROVAL | HRMO |
| Transaction approved | Personnel |
| Transaction rejected | Personnel (with reason) |
| Promotion cycle opened | All eligible personnel |
| AO II rating submitted | HRMO |
| Final ranking published | All in cycle |

### Sound Effects
`playSuccessChime()` — plays on HRMO transaction approval

### Offline Banner
`OfflineSyncBanner` component — shows when API is unreachable

### Theme System
Three themes managed by `ThemeContext`:
- **dark** — `data-theme="dark"` on `:root`
- **light** — default variables
- **high-contrast** — maximum visibility

---

## 📊 Full Permissions Matrix

| Feature | Personnel | AO II | HRMO | SysAdmin |
|:--------|:---------:|:-----:|:----:|:--------:|
| Login | ✅ | ✅ | ✅ | ✅ |
| View Own Profile | ✅ | 👁️ | 👁️ | 👁️ |
| Edit Own Profile | ✅ | — | — | — |
| View All Personnel | — | ✅ | ✅ | ✅ |
| Create Personnel | — | — | ✅ | ✅ |
| Credential Distribution | — | ✅ | — | ✅ |
| Initiate Transaction | ✅ | — | — | — |
| Upload Documents | ✅ | — | — | — |
| Document Validation | — | ✅ | 👁️ | — |
| Transaction Approval | — | — | ✅ | — |
| Compliance Monitoring | — | — | ✅ | — |
| Years of Service | — | — | ✅ | — |
| View Promotion Cycles | ✅ | ✅ | ✅ | ✅ |
| Create Promotion Cycles | — | ✅ | ✅ | ✅ |
| AO II Initial Rating | — | ✅ | — | ✅ |
| HRMO Final Rating | — | — | ✅ | ✅ |
| Select Promotion Candidate | — | — | ✅ | ✅ |
| Apply for Promotion | ✅ | — | — | — |
| Generate CAR Document | — | ✅ | ✅ | ✅ |
| View Leaderboard | — | ✅ | ✅ | ✅ |
| Dashboard (Admin) | — | ✅ | ✅ | ✅ |
| Reports | — | ✅ | ✅ | ✅ |
| Audit Trail | — | — | — | ✅ |
| System Settings | — | — | — | ✅ |
| Theme Switching | — | — | — | ✅ |

*✅ = Full · 👁️ = Read-Only · — = No Access*

---

## 🔄 Master Transaction Lifecycle (End-to-End)

```
PERSONNEL (Mobile Web)
  │
  1. Login → /personnel/home
  2. Complete Profile → /personnel/profile-completion
  3. Start Transaction → /personnel/new-transaction
  4. View Dynamic Checklist → /personnel/checklist
     [System generates list based on tx type + personnel category]
  5. Upload Document → /personnel/upload-document
     [File → Supabase Storage → Google Vision AI OCR]
  6. OCR Review → /personnel/ocr-review
     [Review extracted data, correct errors, confirm]
  7. Repeat 5-6 for all required docs
  8. Submit → status: PENDING_VALIDATION
     [Compliance check · Bundle docs · Notify AO II]
  │
  ▼
AO II (Web Portal — /admin/documents)
  │
  9. Receives notification
  10. Opens transaction from Doc. Validation queue
  11. Reviews each document (image + OCR data side-by-side)
  12. Marks each doc: VERIFIED ✅ or DEFICIENT ❌ (with note)
  13a. ALL VERIFIED → status: FOR_APPROVAL
       → HRMO notified
  13b. ANY DEFICIENT → status: RETURNED
       → Personnel notified with deficiency details
       → Personnel re-uploads → cycle restarts
  │
  ▼
HRMO (Web Portal — /admin/approvals)
  │
  14. Receives notification
  15. Reviews validated transaction + all documents + AO II comments
  16a. APPROVE → status: APPROVED
       → 5 career lifecycle fields auto-updated:
         • Appointment History
         • Promotion History
         • Salary Adjustment History
         • Service Records
         • Transaction History
       → Success chime plays
       → Personnel notified: "Transaction Approved"
  16b. RETURN → status: RETURNED_BY_AO2
       → HRMO provides reason
       → Personnel notified with reason
  │
  ▼ (If Promotion Transaction)
PROMOTION RANKING (Parallel Track — /admin/promotions)
  │
  AO II submits Initial Rating (60 or 80 pts)
  HRMO submits Final Rating (40 or 20 pts)
  = Combined CAR Total (100 pts)
  Leaderboard auto-sorts by descending score
  HRMO selects official promotion candidate
  → CAR .docx generated for official DepEd records
  │
  ▼
SYSTEM ADMIN (Audit — /admin/audit)
  │
  All actions above logged to Audit Trail:
  timestamp · user · role · action · details · status
```

---

## 🛠️ Technology Stack (Complete)

| Layer | Technology | Version/Notes |
|:------|:-----------|:-------------|
| Web Frontend | React.js | Vite, TypeScript, React Router v6 |
| Styling | Vanilla CSS | CSS custom properties (design tokens) |
| Charts | Recharts | BarChart for Reports module |
| Fonts | Plus Jakarta Sans, Inter, JetBrains Mono | Google Fonts |
| Icons | Custom AppIcon SVG system | 40+ named icons |
| Backend | Node.js + Express.js | TypeScript |
| Database | PostgreSQL | via Supabase local |
| Auth | JWT | Access tokens + refresh tokens |
| File Storage | Supabase Storage | S3-compatible |
| OCR | Google Cloud Vision AI | Text extraction from documents |
| Realtime | Supabase Realtime | WebSocket pub/sub |
| Email Preview | Mailpit | http://127.0.0.1:54324 |
| Dev DB Studio | Supabase Studio | http://127.0.0.1:54323 |
| Password Hash | Argon2 / bcrypt | `hash.util.ts` |
| Document Gen | docx library | CAR .docx generation |
