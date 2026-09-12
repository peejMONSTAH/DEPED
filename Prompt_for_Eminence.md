# AntiGravity Prompt

## Project Overview

Build a **production-ready Web and Mobile-Based 201 File Validation and Career Advancement Information System** named **Eminence**.

The system digitizes the entire personnel 201 file process of a Schools Division Office. It replaces paper-based submissions with a secure digital workflow for Teaching and Non-Teaching Personnel while allowing AO II, HRMO, Records Personnel, and System Administrators to manage, validate, approve, and archive employee records.

## Tech Stack

- Flutter (Mobile)
- Flutter Web (Admin Dashboard)
- Supabase
- PostgreSQL
- Supabase Authentication
- Supabase Storage
- Supabase Realtime

## Roles

- Teaching Personnel
- Non-Teaching Personnel
- Administrative Officer II (AO II)
- HRMO Staff
- Records Personnel
- System Administrator

## Core Functional Requirements

### Authentication
- Login
- Logout
- Forgot Password
- Force password change on first login
- Role-based access control

### Mobile Workflow
1. Receive account credentials.
2. Change temporary password.
3. Complete personnel profile (PDS, WES, employment, contact).
4. Select transaction:
   - Promotion Appointment
   - Newly Hired Appointment
   - Salary Adjustment
5. Automatically generate a dynamic checklist based on personnel type and transaction.
6. Upload required documents (PDF/JPG/PNG).
7. Perform automated compliance evaluation with completed, missing requirements, score, status, and recommendations.
8. Submit transaction (block incomplete submissions).
9. Receive real-time notifications.
10. View service record, years of service, salary grade, promotion history, and career timeline.

### Web Workflow

#### System Administrator
- Create personnel accounts
- Generate Employee IDs
- Assign roles
- Manage permissions
- View audit trail

#### AO II
- Submit personnel information
- Receive accounts
- Distribute credentials
- Validate or return submissions
- Forward validated submissions to HRMO

#### HRMO
- Approve or return validated submissions
- Automatically update career records
- Monitor compliance dashboards
- Compute years of service

#### Records Personnel
- Archive approved transactions
- Maintain Digital 201 repository

## Dashboard

Include:
- Total Personnel
- Pending Transactions
- Approved Transactions
- Returned Transactions
- Compliance Analytics
- Promotion Analytics
- Years of Service Analytics

## Database

Generate normalized PostgreSQL tables for:
- Users
- Roles
- Permissions
- Personnel Profiles
- PDS
- Work Experience
- Transactions
- Requirement Templates
- Uploaded Documents
- Compliance Results
- Validation History
- Approval History
- Service Records
- Promotion History
- Salary Adjustments
- Notifications
- Audit Logs
- Archives

## UI/UX

Use Material Design 3 with:
- Responsive layouts
- Modern government-style interface
- Sidebar navigation (web)
- Bottom navigation (mobile)
- Dark mode
- Search, filters, pagination
- Drag-and-drop uploads
- Reusable components

## Expected Output

Generate a complete production-ready Flutter + Supabase solution with clean architecture, MVVM, secure authentication, automated compliance checking, digital 201 file management, real-time notifications, analytics dashboards, and scalable PostgreSQL database design.
