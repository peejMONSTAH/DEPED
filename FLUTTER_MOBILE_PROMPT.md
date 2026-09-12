# Eminence HRIS — Flutter Mobile App Developer Prompt

> **For**: Personnel-Only Mobile App (Teaching & Non-Teaching Personnel)  
> **Tech Stack**: Flutter (Dart)  
> **Backend**: Existing Express.js + PostgreSQL REST API (already deployed)  
> **Spec Doc**: `201-System-Workflow.md` — Mobile System Steps 1–10

---

## 🎯 Project Overview

Build a **Flutter mobile application** for the **Eminence HRIS (Human Resource Information System)** used by the **City Schools Division of Koronadal City, Department of Education Region XII**.

This app is the **Personnel Portal** — exclusively for **Teaching Personnel** and **Non-Teaching Personnel** roles. All administrative roles (System Admin, AO II, HRMO, Records Personnel) use the existing web dashboard and should **NOT** be accessible from this mobile app.

The backend API is already built and running. You will consume these REST endpoints.

---

## 🏗️ Architecture

```
┌─────────────────────┐         ┌──────────────────────────┐
│   Flutter Mobile    │  HTTPS  │  Express.js Backend API  │
│   (This Project)    │ ◄─────► │  (Already Built)         │
│                     │  JSON   │                          │
│  - Personnel Only   │         │  - PostgreSQL (Supabase)  │
│  - Teaching         │         │  - JWT Auth (Access +    │
│  - Non-Teaching     │         │    Refresh Tokens)       │
│                     │         │  - Supabase File Storage │
└─────────────────────┘         └──────────────────────────┘
```

**Base API URL**: `http://localhost:5000/api` (dev) — will be provided for production.

---

## 🔐 Authentication System

### JWT Token Flow
The backend uses **dual-token JWT authentication**:

- **Access Token**: Short-lived (`15m`), sent as `Authorization: Bearer <token>` header.
- **Refresh Token**: Long-lived (`7d`), used to obtain new access tokens silently.

### API Endpoints

#### `POST /api/auth/login`
```json
// Request
{ "email": "personnel@deped.koronadal.gov.ph", "password": "Personnel@Pass123" }

// Success Response (200)
{
  "status": "success",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "id": 5,
      "email": "personnel@deped.koronadal.gov.ph",
      "role": "TEACHING_PERSONNEL",
      "firstName": "Maria",
      "lastName": "Santos",
      "personnelId": 1
    }
  }
}

// Error Response (401)
{ "status": "error", "message": "Invalid email or password." }
```

#### `POST /api/auth/refresh-token`
```json
// Request
{ "refreshToken": "eyJhbGciOi..." }

// Response (200)
{ "status": "success", "data": { "accessToken": "eyJhbGciOi..." } }
```

#### `POST /api/auth/logout` (requires auth)
```json
// Request
{ "refreshToken": "eyJhbGciOi..." }

// Response (200)
{ "status": "success", "message": "Logged out successfully." }
```

### First-Login Password Change (Step 2)
When a user's password starts with `Temp@`, the app must **force** a password change modal before granting access. The temporary password indicates this is the user's first login after account creation. The new password must be **minimum 12 characters**.

### Token Storage
Use `flutter_secure_storage` to persist tokens securely. Implement an HTTP interceptor (e.g., with `dio`) that:
1. Attaches the access token to every request
2. Catches 401 responses
3. Attempts silent refresh via `/auth/refresh-token`
4. Retries the original request
5. If refresh fails, logs out and redirects to login

---

## 📱 Screens & Workflow (201-System-Workflow.md Steps 1–10)

### Screen 1: Login Screen (Steps 1 & 2)
**Route**: `/login`

- Email & password fields
- "Sign In" button
- Show/hide password toggle
- Error alert display
- **First-Time Password Change Modal**: If password starts with `Temp@`, show a modal requiring new password (min 12 chars) + confirmation
- Brand: Display "EMINENCE" logo (text-only wordmark, bold letter-spaced typography)
- Footer: "Protected by DepEd Data Privacy Policy"
- Logos: NDMU (System Developer) and DepEd Region XII (Official Partner)

---

### Screen 2: Home Dashboard (Post-Login Landing)
**Route**: `/home`

- Welcome greeting: "Good [morning/afternoon/evening], [FirstName]"
- **Quick Stats Summary Cards**:
  - Active Transactions count
  - Pending Documents count
  - Unread Notifications count
  - Profile Completion percentage
- **Quick Action Grid** (4 cards):
  - Complete Profile → navigates to Profile Completion
  - New Transaction → navigates to Transaction Selection
  - Notifications → navigates to Notifications
  - Career Record → navigates to Service Record

**API**: `GET /api/personnel/me` for profile data, `GET /api/transactions?status=DRAFT` for active count, `GET /api/notifications` for unread count.

---

### Screen 3: Profile Completion (Step 3)
**Route**: `/profile`

Tabbed interface with 4 sections:

| Tab | Fields | API |
|-----|--------|-----|
| **Personal Info** | First Name, Last Name, Middle Name, Suffix, Birth Date, Gender, Civil Status | `PUT /api/personnel/me` |
| **PDS** | Personal Data Sheet file upload (PDF) | File upload via documents endpoint |
| **Work Experience** | Work Experience Sheet (WES) entries or file upload | `PUT /api/personnel/me` |
| **Employment & Contact** | Designation, Date Hired, Contact Number, Address, Employee ID (read-only) | `PUT /api/personnel/me` |

**Required Data (per 201-System-Workflow.md Step 3)**:
- Personal Information
- Personal Data Sheet (PDS)
- Work Experience Sheet (WES)
- Employment Information
- Contact Information

**System Result**: Personnel profile is saved. Work experience records are stored. Initial years of service data is recorded.

**API**:
```
GET  /api/personnel/me         → Fetch current profile
PUT  /api/personnel/me         → Update profile fields
```

---

### Screen 4: Transaction Selection (Step 4)
**Route**: `/transactions/new`

Display **3 transaction type cards** that the personnel can select:

1. **Promotion Appointment** — For position promotion processing
2. **Newly Hired Appointment** — For new hire documentation
3. **Salary Adjustment** — For salary grade adjustment processing

Each card should show the transaction name, a brief description, and an icon.

**System Result**: The system loads the corresponding transaction requirements and compliance checklist.

**API**:
```
POST /api/transactions
Body: { "type": "Promotion Appointment", "notes": "optional" }

// Response
{ "status": "success", "data": { "id": 1, "type": "Promotion Appointment", "status": "DRAFT" } }
```

After creation, navigate to the **Requirement Checklist** screen with the new transaction ID.

---

### Screen 5: Requirement Checklist (Steps 5, 7, 8)
**Route**: `/transactions/:id/checklist`

This screen combines Steps 5, 7, and 8:

**Step 5 — Dynamic Checklist Generation**:
The API returns the exact required documents based on the transaction type and personnel category.

**Example: Promotion Appointment (Teaching Personnel) — 14 documents**:
1. Personal Data Sheet (PDS)
2. Latest Appointment
3. Omnibus Certification
4. Letter of Intent
5. Photocopy of PRC License
6. Photocopy of Special Orders
7. Transcript of Records (TOR)
8. Graduate / Post-Graduate Units or Degree *(optional)*
9. Photocopy of Service Record
10. Certificates (Seminars and Trainings)
11. Performance Ratings (at least Very Satisfactory)
12. Checklist of Requirements & Omnibus Sworn Statement
13. Portfolio for Assessment
14. Latest Payslip

**Example: Promotion Appointment (Principal)**:
1. MOVs showing Outstanding Accomplishments
2. Application of Education
3. Application of Learning and Development
4. Certificate of Rating in the School Head Assessment

**Step 7 — Compliance Evaluation**:
Display a real-time compliance score:
```
Compliance Score: 85%
✓ Completed: PDS, Latest Appointment, PRC License, Service Record
✗ Missing: Portfolio for Assessment, Latest Performance Rating
Status: Incomplete Submission
Recommendation: Please upload the missing requirements before submission.
```

**Step 8 — Submission**:
- If requirements are **incomplete** → Status: `Incomplete`, submission button is **disabled/blocked**
- If requirements are **complete** → Status: `Ready for Validation`, submission button is **enabled**, transaction is forwarded to AO II

**API**:
```
GET  /api/transactions/:id/requirements    → Dynamic checklist with compliance score
PUT  /api/transactions/:id/submit          → Submit transaction for validation
```

**Requirements Response Shape**:
```json
{
  "status": "success",
  "data": {
    "complianceScore": 85,
    "isComplete": false,
    "status": "Incomplete Submission",
    "recommendation": "Please upload all missing required documents before submitting.",
    "checklist": [
      {
        "requirementId": 1,
        "name": "Personal Data Sheet (PDS)",
        "description": "CS Form No. 212",
        "isMandatory": true,
        "isUploaded": true,
        "uploadedDocumentId": 42,
        "status": "VALIDATED"
      },
      {
        "requirementId": 13,
        "name": "Portfolio for Assessment",
        "description": "Portfolio for teaching performance assessment",
        "isMandatory": true,
        "isUploaded": false,
        "uploadedDocumentId": null,
        "status": "PENDING_UPLOAD"
      }
    ]
  }
}
```

---

### Screen 6: Document Upload (Step 6)
**Route**: `/transactions/:id/upload/:requirementId`

- File picker (PDF, JPEG, PNG, TIFF — max 10MB)
- Preview before upload
- Upload progress indicator
- Shows: file name, upload date, transaction type, personnel info

**API**:
```
POST /api/documents/transactions/:transactionId/documents
Content-Type: multipart/form-data
Fields: file (binary), requirementTemplateId (int)

// Response
{
  "status": "success",
  "data": {
    "id": 42,
    "fileName": "PDS_Maria_Santos.pdf",
    "status": "PENDING_OCR",
    "uploadDate": "2026-07-22T12:00:00Z"
  }
}
```

**Allowed MIME types**: `application/pdf`, `image/jpeg`, `image/png`, `image/tiff`

---

### Screen 7: Notifications (Step 9)
**Route**: `/notifications`

Display all transaction notifications with **6 status states**:

| Status | Color | Description |
|--------|-------|-------------|
| `Submitted` | Blue | Transaction submitted for validation |
| `Under Review` | Amber | AO II is reviewing the submission |
| `Returned` | Red | Returned for correction with remarks |
| `Validated` | Cyan | Validated by AO II, forwarded to HRMO |
| `Approved` | Green | Approved by HRMO |
| `Archived` | Gray | Archived by Records Personnel |

Each notification shows: message, timestamp, type badge, and read/unread state.

**API**:
```
GET  /api/notifications                → List all notifications (paginated)
PUT  /api/notifications/:id/read       → Mark single notification as read
PUT  /api/notifications/read-all       → Mark all as read
```

**Response Shape**:
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "message": "Transaction #5 has been validated and is pending HRMO approval.",
      "type": "INFO",
      "isRead": false,
      "createdAt": "2026-07-22T10:00:00Z",
      "relatedEntityId": 5,
      "relatedEntityType": "Transaction"
    }
  ]
}
```

---

### Screen 8: Career / Service Record (Step 10)
**Route**: `/career`

Display the personnel's full career record:

- **Current Position** (e.g., Teacher III)
- **First Appointment Date** (e.g., June 01, 1995)
- **Years in Service** (computed from first appointment)
- **Promotion History** (timeline of all promotions)
- **Latest Salary Grade** (e.g., SG 13)
- **Latest Appointment Date**
- **Career Timeline** — visual vertical timeline of all career events

**API**:
```
GET /api/promotions/personnel/:personnelId/career-history

// Response
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "eventType": "PROMOTION",
      "eventDate": "2024-05-15",
      "detailsJson": { "position": "Teacher III", "salaryGrade": 13 }
    }
  ]
}
```

---

### Screen 9: Transaction History / List
**Route**: `/transactions`

List all user's transactions with:
- Transaction type name
- Status badge (color-coded)
- Submission date
- Compliance score percentage
- Tap to navigate to checklist detail

**API**:
```
GET /api/transactions          → List user's transactions (paginated)
GET /api/transactions/:id      → Single transaction detail
```

**Pagination**: Query params `?page=1&limit=20`

---

## 📐 Design System

### Color Palette (Dark Mode Primary)
```dart
// Primary Brand Colors
static const Color primary       = Color(0xFF388BFD);  // Royal Blue
static const Color primaryLight  = Color(0xFF58A6FF);
static const Color primaryDark   = Color(0xFF1F6FEB);

// Backgrounds
static const Color bgPrimary     = Color(0xFF0D1117);  // Deep dark
static const Color bgSecondary   = Color(0xFF161B22);  // Card bg
static const Color bgCard        = Color(0xFF1C2333);
static const Color surface       = Color(0xFF21262D);

// Text
static const Color textPrimary   = Color(0xFFE6EDF3);
static const Color textSecondary = Color(0xFF8B949E);
static const Color textMuted     = Color(0xFF6E7681);

// Status Colors
static const Color success       = Color(0xFF2EA043);
static const Color warning       = Color(0xFFE3B341);
static const Color error         = Color(0xFFF85149);
static const Color info          = Color(0xFF388BFD);

// Accents
static const Color accentPurple  = Color(0xFF8B5CF6);
static const Color accentEmerald = Color(0xFF10B981);

// Borders
static const Color border        = Color(0xFF30363D);
static const Color borderSubtle  = Color(0xFF21262D);
```

### Typography
- **Font Family**: `Plus Jakarta Sans` (Google Fonts)
- Headings: Bold/ExtraBold, tracking tight
- Body: Regular, 14-16px
- Captions: Medium, 12px

### Design Principles
1. **Dark mode by default** — matches the web dashboard aesthetic
2. **Glassmorphism cards** — semi-transparent surfaces with subtle blur
3. **Smooth animations** — page transitions, loading states, micro-interactions
4. **Bottom navigation bar** — Home, Transactions, Notifications, Profile
5. **Material 3** compliant but with custom dark theme overrides

---

## 📦 Recommended Flutter Packages

```yaml
dependencies:
  dio: ^5.0.0                      # HTTP client with interceptors
  flutter_secure_storage: ^9.0.0   # Secure token storage
  go_router: ^14.0.0               # Declarative routing
  riverpod: ^2.0.0                 # State management
  file_picker: ^8.0.0              # Document upload file picker
  cached_network_image: ^3.0.0     # Image caching
  google_fonts: ^6.0.0             # Plus Jakarta Sans
  intl: ^0.19.0                    # Date formatting
  shimmer: ^3.0.0                  # Loading skeleton shimmer
  percent_indicator: ^4.0.0        # Compliance score circles
  timeline_tile: ^2.0.0            # Career timeline visualization
  flutter_svg: ^2.0.0              # SVG logo support
  pull_to_refresh: ^2.0.0          # Pull-to-refresh lists
```

---

## 🗂️ Recommended Project Structure

```
lib/
├── main.dart
├── app.dart                         # MaterialApp + theme + router
├── core/
│   ├── constants/
│   │   ├── api_constants.dart       # Base URL, endpoints
│   │   └── app_colors.dart          # Color palette from design system
│   ├── network/
│   │   ├── dio_client.dart          # Dio instance + interceptors
│   │   └── api_interceptor.dart     # Auth token + refresh logic
│   ├── storage/
│   │   └── secure_storage.dart      # Token persistence
│   └── theme/
│       └── app_theme.dart           # ThemeData configuration
├── features/
│   ├── auth/
│   │   ├── data/                    # AuthRepository, AuthApi
│   │   ├── domain/                  # User model, AuthState
│   │   └── presentation/           # LoginScreen, PasswordChangeModal
│   ├── home/
│   │   └── presentation/           # HomeScreen, StatCards, QuickActions
│   ├── profile/
│   │   ├── data/                    # ProfileRepository
│   │   └── presentation/           # ProfileScreen (tabbed)
│   ├── transactions/
│   │   ├── data/                    # TransactionRepository
│   │   └── presentation/           # SelectionScreen, ChecklistScreen, UploadScreen
│   ├── notifications/
│   │   ├── data/                    # NotificationRepository
│   │   └── presentation/           # NotificationsScreen
│   └── career/
│       ├── data/                    # CareerRepository
│       └── presentation/           # CareerRecordScreen, Timeline
├── shared/
│   ├── widgets/                     # Reusable widgets (cards, badges, buttons)
│   └── models/                      # Shared data models
└── router/
    └── app_router.dart              # GoRouter configuration
```

---

## 🔑 API Response Format (All Endpoints)

Every API response follows this standard envelope:

```json
// Success
{
  "status": "success",
  "data": { ... },
  "message": "Optional success message",
  "meta": {                          // Only on paginated endpoints
    "page": 1,
    "limit": 20,
    "totalCount": 45,
    "totalPages": 3
  }
}

// Error
{
  "status": "error",
  "message": "Human-readable error message",
  "code": "ERROR_CODE"               // e.g., MISSING_DOCUMENTS, INCOMPLETE_PROFILE
}
```

---

## ⚠️ Important Business Rules

1. **Profile must be complete before creating transactions** — The API returns `INCOMPLETE_PROFILE` error if `profileComplete` is false.
2. **Mandatory documents block submission** — Cannot submit if any `isMandatory: true` requirement is missing.
3. **Maximum 3 re-submissions** — After 3 resubmissions, the transaction is escalated to HRMO.
4. **File size limit**: 10MB per document.
5. **Allowed file types**: PDF, JPEG, PNG, TIFF only.
6. **Personnel can only see their own transactions** — The API automatically filters by the authenticated user's `personnelId`.
7. **Personnel roles only**: The app must reject login attempts from `SYSTEM_ADMIN`, `AO_II`, `HRMO`, or `RECORDS_PERSONNEL` roles — show an error: "This app is for personnel only. Please use the web portal."

---

## 🏷️ Branding Assets

The following assets exist in the web project's `public/` folder and should be ported to Flutter `assets/`:
- **EMINENCE wordmark logo** — Text-only SVG with letter-spacing and gradient accent
- **NDMU logo** — `ndmu-logo.png` (Notre Dame of Marbel University coat of arms)
- **DepEd Region XII logo** — `deped-region12-logo.png` (Official DepEd seal)

---

## 🧪 Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Teaching Personnel | `personnel@deped.koronadal.gov.ph` | `Personnel@Pass123` |
| Non-Teaching Personnel | `nonteaching@deped.koronadal.gov.ph` | `Personnel@Pass123` |

> **Note**: Admin accounts (`admin@...`, `ao2_clara@...`, `hrmo@...`, `records@...`) should be **rejected** by the mobile app with an appropriate error message.

---

## ✅ Acceptance Criteria Checklist

- [ ] Login with email/password, JWT token storage, silent refresh
- [ ] First-time password change modal (when password starts with `Temp@`)
- [ ] Reject non-personnel roles at login
- [ ] Home dashboard with stats and quick actions
- [ ] Profile completion with all 4 tabs (Personal, PDS, WES, Employment)
- [ ] Transaction selection (3 types: Promotion, Newly Hired, Salary Adjustment)
- [ ] Dynamic requirement checklist with real-time compliance score
- [ ] Document upload with file picker (PDF/JPEG/PNG/TIFF, max 10MB)
- [ ] Submission blocking when requirements are incomplete
- [ ] Notifications list with 6 status states and read/unread management
- [ ] Career/Service Record with timeline visualization
- [ ] Transaction history list with status badges
- [ ] Bottom navigation (Home, Transactions, Notifications, Profile)
- [ ] Dark mode design matching the web dashboard aesthetic
- [ ] Pull-to-refresh on list screens
- [ ] Loading skeleton shimmer states
- [ ] Proper error handling and user-friendly error messages
- [ ] Responsive layout for various phone screen sizes
