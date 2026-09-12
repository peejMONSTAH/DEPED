# DATABASE.md: Eminence HRIS

## ERD

```mermaid
erDiagram
    Role {
        Int id PK
        String name "Role name (e.g., 'System Admin')"
    }

    User {
        Int id PK
        String email
        String passwordHash
        Int roleId FK
        Int personnelId FK UK "One-to-one with Personnel"
        DateTime createdAt
        DateTime updatedAt
        DateTime lastLogin
    }

    Personnel {
        Int id PK
        Int userId FK UK "One-to-one with User"
        String employeeId "DepEd Employee ID"
        String firstName
        String lastName
        String middleName
        String suffix
        DateTime birthDate
        String gender
        String civilStatus
        String contactNumber
        String address
        String designation
        DateTime dateHired
        String status "Personnel status (e.g., Active, Inactive)"
        Int plantillaItemId FK UK "One-to-one with PlantillaItem"
        DateTime createdAt
        DateTime updatedAt
    }

    PlantillaItem {
        Int id PK
        String itemNumber "Unique Plantilla Item Number"
        String positionTitle
        Int salaryGrade
        String department
        String division
        Boolean isOccupied "True if occupied by a personnel"
        DateTime createdAt
        DateTime updatedAt
    }

    TransactionType {
        Int id PK
        String name "e.g., 'Promotion', 'Reclassification'"
        String description
    }

    Transaction {
        Int id PK
        Int personnelId FK
        Int transactionTypeId FK
        String status "e.g., 'Pending Validation', 'Approved'"
        DateTime submissionDate
        DateTime validationDate
        DateTime approvalDate
        String remarks
        Int currentAssigneeId FK "User ID of current validator/approver"
        DateTime createdAt
        DateTime updatedAt
    }

    RequirementTemplate {
        Int id PK
        Int transactionTypeId FK
        String name "e.g., 'Transcript of Records'"
        String description
        Boolean isMandatory
        String expectedDataType "e.g., 'PDF', 'Image'"
        Json ocrFieldsJson "JSON schema for expected OCR fields"
        DateTime createdAt
        DateTime updatedAt
    }

    UploadedDocument {
        Int id PK
        Int transactionId FK
        Int requirementTemplateId FK
        String storagePath "URL or path to stored file"
        String fileName
        Int uploadedByUserId FK
        DateTime uploadDate
        String status "e.g., 'Pending OCR', 'Validated'"
        Json ocrExtractedDataJson "JSON of OCR extracted data"
        String validationNotes
        Int validatedByUserId FK
        DateTime validationDate
        DateTime createdAt
        DateTime updatedAt
    }

    ComplianceCheck {
        Int id PK
        Int uploadedDocumentId FK UK "One-to-one with UploadedDocument"
        Boolean isCompliant
        String deficiencyDetails
        Int checkedByUserId FK
        DateTime checkDate
        DateTime createdAt
        DateTime updatedAt
    }

    ValidationLog {
        Int id PK
        String entityType "e.g., 'Document', 'Transaction'"
        Int entityId "ID of the entity being logged"
        String action "e.g., 'OCR_EXTRACTED', 'VALIDATED'"
        Json detailsJson "JSON details of the action"
        Int userId FK
        DateTime timestamp
    }

    Notification {
        Int id PK
        Int userId FK
        String message
        String type "e.g., 'Info', 'Warning'"
        Boolean isRead
        DateTime createdAt
        Int relatedEntityId "ID of related entity (e.g., Transaction)"
        String relatedEntityType "Type of related entity"
    }

    PromotionCycle {
        Int id PK
        String name "e.g., '2024 Reclassification Cycle'"
        String type "e.g., 'Reclassification', 'Natural Vacancy'"
        DateTime startDate
        DateTime endDate
        String status "e.g., 'Open', 'Closed'"
        Json rulesConfigurationJson "JSON for promotion criteria"
        DateTime createdAt
        DateTime updatedAt
    }

    PromotionApplication {
        Int id PK
        Int personnelId FK
        Int promotionCycleId FK
        String status "e.g., 'Submitted', 'Approved'"
        DateTime applicationDate
        Int finalRank
        Json scoreDetailsJson "JSON of calculated scores"
        DateTime createdAt
        DateTime updatedAt
    }

    CareerHistoryEntry {
        Int id PK
        Int personnelId FK
        String eventType "e.g., 'Promotion', 'Training'"
        DateTime eventDate
        Json detailsJson "JSON details of the event"
        Int documentId FK "Optional reference to supporting document"
        DateTime createdAt
        DateTime updatedAt
    }

    ArchivedRecord {
        Int id PK
        String originalEntityType "e.g., 'Transaction', 'PersonnelRecord'"
        Int originalEntityId "ID of the original record"
        DateTime archiveDate
        Int archivedByUserId FK
        String storagePath "Path to archived data/file"
        DateTime retentionEndDate
        DateTime createdAt
    }

    Role ||--o{ User : has
    User ||--|| Personnel : manages
    Personnel ||--o{ Transaction : initiates
    Personnel ||--o{ PromotionApplication : applies_for
    Personnel ||--o{ CareerHistoryEntry : has
    Personnel ||--o| PlantillaItem : occupies
    TransactionType ||--o{ Transaction : defines
    TransactionType ||--o{ RequirementTemplate : requires
    Transaction ||--o{ UploadedDocument : contains
    UploadedDocument ||--o{ ComplianceCheck : checked_for
    RequirementTemplate ||--o{ UploadedDocument : fulfills
    User ||--o{ UploadedDocument : uploads
    User ||--o{ ComplianceCheck : checks
    User ||--o{ ValidationLog : performs
    User ||--o{ Notification : receives
    User ||--o{ ArchivedRecord : archives
    PromotionCycle ||--o{ PromotionApplication : part_of
    UploadedDocument ||--o| CareerHistoryEntry : references
```

## Table Definitions

### Role
*   **Purpose:** Defines the different user roles within the system, controlling access and permissions.
*   **Key Columns:** `id` (PK), `name` (Unique, e.g., 'System Admin', 'AO II', 'Personnel').

### User
*   **Purpose:** Stores user authentication credentials and links to a specific personnel record.
*   **Key Columns:** `id` (PK), `email` (Unique, for login), `passwordHash`, `roleId` (FK to Role), `personnelId` (Unique FK to Personnel, for 1:1 relationship).

### Personnel
*   **Purpose:** Contains core personal and employment details for each employee. This is the central entity for all HR-related data.
*   **Key Columns:** `id` (PK), `userId` (Unique FK to User), `employeeId` (Unique DepEd ID), `firstName`, `lastName`, `designation`, `dateHired`, `status`, `plantillaItemId` (Unique FK to PlantillaItem).

### PlantillaItem
*   **Purpose:** Represents an official position or item in the organizational structure (Plantilla).
*   **Key Columns:** `id` (PK), `itemNumber` (Unique identifier for the plantilla item), `positionTitle`, `salaryGrade`, `department`, `isOccupied`.

### TransactionType
*   **Purpose:** A lookup table defining the various types of HR transactions that can be initiated (e.g., Promotion, Reclassification).
*   **Key Columns:** `id` (PK), `name` (Unique, descriptive name of the transaction type).

### Transaction
*   **Purpose:** Records each instance of an HR transaction initiated by a personnel.
*   **Key Columns:** `id` (PK), `personnelId` (FK to Personnel), `transactionTypeId` (FK to TransactionType), `status` (current state of the transaction), `submissionDate`, `currentAssigneeId` (FK to User, indicating who is currently responsible for action).

### RequirementTemplate
*   **Purpose:** Defines the documents and information required for each `TransactionType`.
*   **Key Columns:** `id` (PK), `transactionTypeId` (FK to TransactionType), `name` (e.g., 'Transcript of Records'), `isMandatory`, `ocrFieldsJson` (JSON schema for expected OCR data).

### UploadedDocument
*   **Purpose:** Stores metadata about documents uploaded by personnel for a specific transaction.
*   **Key Columns:** `id` (PK), `transactionId` (FK to Transaction), `requirementTemplateId` (FK to RequirementTemplate), `storagePath` (location of the file), `fileName`, `status` (e.g., 'OCR Processed', 'Validated'), `ocrExtractedDataJson` (JSON of data extracted by OCR).

### ComplianceCheck
*   **Purpose:** Records the outcome of a compliance check for a specific `UploadedDocument`.
*   **Key Columns:** `id` (PK), `uploadedDocumentId` (Unique FK to UploadedDocument), `isCompliant` (boolean), `deficiencyDetails`, `checkedByUserId` (FK to User).

### ValidationLog
*   **Purpose:** Provides an audit trail of significant actions performed on various entities within the system.
*   **Key Columns:** `id` (PK), `entityType`, `entityId`, `action` (e.g., 'DOCUMENT_VALIDATED'), `detailsJson`, `userId` (FK to User), `timestamp`.

### Notification
*   **Purpose:** Stores system-generated notifications for users.
*   **Key Columns:** `id` (PK), `userId` (FK to User), `message`, `type`, `isRead`, `createdAt`, `relatedEntityId`, `relatedEntityType`.

### PromotionCycle
*   **Purpose:** Manages the configuration and lifecycle of specific promotion periods or types.
*   **Key Columns:** `id` (PK), `name`, `type` (e.g., 'Reclassification'), `startDate`, `endDate`, `status`, `rulesConfigurationJson` (JSON defining the criteria for ranking).

### PromotionApplication
*   **Purpose:** Records an individual personnel's application for a promotion within a specific `PromotionCycle`.
*   **Key Columns:** `id` (PK), `personnelId` (FK to Personnel), `promotionCycleId` (FK to PromotionCycle), `status`, `applicationDate`, `finalRank`, `scoreDetailsJson` (JSON of calculated scores based on rules).

### CareerHistoryEntry
*   **Purpose:** Provides a chronological record of significant career events for each personnel.
*   **Key Columns:** `id` (PK), `personnelId` (FK to Personnel), `eventType` (e.g., 'Promotion', 'Training'), `eventDate`, `detailsJson`, `documentId` (Optional FK to UploadedDocument).

### ArchivedRecord
*   **Purpose:** Manages the long-term storage and retention of records that are no longer actively used but must be kept for compliance.
*   **Key Columns:** `id` (PK), `originalEntityType`, `originalEntityId`, `archiveDate`, `archivedByUserId` (FK to User), `storagePath`, `retentionEndDate`.

## Prisma Schema

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Enums
enum UserRole {
  SYSTEM_ADMIN
  AO_II
  HRMO
  RECORDS_PERSONNEL
  PERSONNEL
}

enum TransactionStatus {
  DRAFT
  PENDING_VALIDATION
  FOR_APPROVAL
  APPROVED
  REJECTED
  ARCHIVED
}

enum DocumentStatus {
  PENDING_UPLOAD
  PENDING_OCR
  OCR_PROCESSED
  VALIDATED
  REJECTED
}

enum PromotionApplicationStatus {
  SUBMITTED
  UNDER_REVIEW
  RANKED
  APPROVED
  REJECTED
}

enum PromotionCycleType {
  RECLASSIFICATION
  NATURAL_VACANCY
  ECP
}

enum PromotionCycleStatus {
  OPEN
  CLOSED
  ARCHIVED
}

enum CareerEventType {
  PROMOTION
  TRAINING
  AWARD
  DESIGNATION_CHANGE
  OTHER
}

enum NotificationType {
  INFO
  WARNING
  SUCCESS
  ERROR
}

enum Gender {
  MALE
  FEMALE
  OTHER
}

enum CivilStatus {
  SINGLE
  MARRIED
  WIDOWED
  SEPARATED
}

enum PersonnelStatus {
  ACTIVE
  INACTIVE
  ON_LEAVE
  RETIRED
}

// Models
model Role {
  id          Int      @id @default(autoincrement())
  name        UserRole @unique
  description String?

  users User[]

  @@map("roles")
}

model User {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  passwordHash String
  roleId       Int
  personnelId  Int?     @unique // One-to-one relationship with Personnel
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  lastLogin    DateTime?

  role        Role         @relation(fields: [roleId], references: [id])
  personnel   Personnel?   @relation(fields: [personnelId], references: [id])
  uploadedDocuments UploadedDocument[] @relation("Uploader")
  validatedDocuments UploadedDocument[] @relation("Validator")
  complianceChecks ComplianceCheck[]
  validationLogs ValidationLog[]
  notifications Notification[]
  archivedRecords ArchivedRecord[]
  transactions Transaction[] @relation("CurrentAssignee")

  @@map("users")
}

model Personnel {
  id                 Int           @id @default(autoincrement())
  userId             Int           @unique // One-to-one relationship with User
  employeeId         String        @unique @map("employee_id") // DepEd Employee ID
  firstName          String        @map("first_name")
  lastName           String        @map("last_name")
  middleName         String?       @map("middle_name")
  suffix             String?
  birthDate          DateTime      @map("birth_date")
  gender             Gender
  civilStatus        CivilStatus   @map("civil_status")
  contactNumber      String?       @map("contact_number")
  address            String?
  designation        String
  dateHired          DateTime      @map("date_hired")
  status             PersonnelStatus
  plantillaItemId    Int?          @unique @map("plantilla_item_id") // One-to-one with PlantillaItem
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  user                User                 @relation(fields: [userId], references: [id])
  plantillaItem       PlantillaItem?       @relation(fields: [plantillaItemId], references: [id])
  transactions        Transaction[]
  promotionApplications PromotionApplication[]
  careerHistoryEntries CareerHistoryEntry[]

  @@map("personnel")
}

model PlantillaItem {
  id                 Int      @id @default(autoincrement())
  itemNumber         String   @unique @map("item_number")
  positionTitle      String   @map("position_title")
  salaryGrade        Int      @map("salary_grade")
  department         String
  division           String
  isOccupied         Boolean  @default(false) @map("is_occupied")
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  occupiedByPersonnel Personnel?

  @@map("plantilla_items")
}

model TransactionType {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String?

  transactions        Transaction[]
  requirementTemplates RequirementTemplate[]

  @@map("transaction_types")
}

model Transaction {
  id                 Int             @id @default(autoincrement())
  personnelId        Int
  transactionTypeId  Int
  status             TransactionStatus
  submissionDate     DateTime        @map("submission_date")
  validationDate     DateTime?       @map("validation_date")
  approvalDate       DateTime?       @map("approval_date")
  remarks            String?
  currentAssigneeId  Int?            @map("current_assignee_id") // User ID of current validator/approver
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  personnel       Personnel         @relation(fields: [personnelId], references: [id])
  transactionType TransactionType   @relation(fields: [transactionTypeId], references: [id])
  currentAssignee User?             @relation("CurrentAssignee", fields: [currentAssigneeId], references: [id])
  uploadedDocuments UploadedDocument[]

  @@map("transactions")
}

model RequirementTemplate {
  id                Int      @id @default(autoincrement())
  transactionTypeId Int      @map("transaction_type_id")
  name              String
  description       String?
  isMandatory       Boolean  @default(true) @map("is_mandatory")
  expectedDataType  String   @map("expected_data_type") // e.g., 'PDF', 'Image'
  ocrFieldsJson     Json?    @map("ocr_fields_json") // JSON schema for expected OCR fields
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  transactionType TransactionType    @relation(fields: [transactionTypeId], references: [id])
  uploadedDocuments UploadedDocument[]

  @@map("requirement_templates")
}

model UploadedDocument {
  id                   Int            @id @default(autoincrement())
  transactionId        Int            @map("transaction_id")
  requirementTemplateId Int           @map("requirement_template_id")
  storagePath          String         @map("storage_path") // URL or path to stored file
  fileName             String         @map("file_name")
  uploadedByUserId     Int            @map("uploaded_by_user_id")
  uploadDate           DateTime       @map("upload_date")
  status               DocumentStatus
  ocrExtractedDataJson Json?          @map("ocr_extracted_data_json") // JSON of OCR extracted data
  validationNotes      String?        @map("validation_notes")
  validatedByUserId    Int?           @map("validated_by_user_id")
  validationDate       DateTime?      @map("validation_date")
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

  transaction         Transaction         @relation(fields: [transactionId], references: [id])
  requirementTemplate RequirementTemplate @relation(fields: [requirementTemplateId], references: [id])
  uploadedBy          User?               @relation("Uploader", fields: [uploadedByUserId], references: [id])
  validatedBy         User?               @relation("Validator", fields: [validatedByUserId], references: [id])
  complianceCheck     ComplianceCheck?
  careerHistoryEntry  CareerHistoryEntry?

  @@map("uploaded_documents")
}

model ComplianceCheck {
  id                 Int      @id @default(autoincrement())
  uploadedDocumentId Int      @unique @map("uploaded_document_id") // One-to-one with UploadedDocument
  isCompliant        Boolean  @map("is_compliant")
  deficiencyDetails  String?  @map("deficiency_details")
  checkedByUserId    Int      @map("checked_by_user_id")
  checkDate          DateTime @map("check_date")
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  uploadedDocument UploadedDocument @relation(fields: [uploadedDocumentId], references: [id])
  checkedBy        User             @relation(fields: [checkedByUserId], references: [id])

  @@map("compliance_checks")
}

model ValidationLog {
  id          Int      @id @default(autoincrement())
  entityType  String   @map("entity_type") // e.g., 'Document', 'Transaction'
  entityId    Int      @map("entity_id") // ID of the entity being logged
  action      String
  detailsJson Json?    @map("details_json") // JSON details of the action
  userId      Int
  timestamp   DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@map("validation_logs")
}

model Notification {
  id              Int              @id @default(autoincrement())
  userId          Int
  message         String
  type            NotificationType
  isRead          Boolean          @default(false) @map("is_read")
  createdAt       DateTime         @default(now())
  relatedEntityId Int?             @map("related_entity_id") // ID of related entity (e.g., Transaction)
  relatedEntityType String?        @map("related_entity_type") // Type of related entity

  user User @relation(fields: [userId], references: [id])

  @@map("notifications")
}

model PromotionCycle {
  id                     Int                    @id @default(autoincrement())
  name                   String
  type                   PromotionCycleType
  startDate              DateTime               @map("start_date")
  endDate                DateTime               @map("end_date")
  status                 PromotionCycleStatus
  rulesConfigurationJson Json?                  @map("rules_configuration_json") // JSON for promotion criteria
  createdAt              DateTime               @default(now())
  updatedAt              DateTime               @updatedAt

  promotionApplications PromotionApplication[]

  @@map("promotion_cycles")
}

model PromotionApplication {
  id                Int                        @id @default(autoincrement())
  personnelId       Int
  promotionCycleId  Int                        @map("promotion_cycle_id")
  status            PromotionApplicationStatus
  applicationDate   DateTime                   @map("application_date")
  finalRank         Int?                       @map("final_rank")
  scoreDetailsJson  Json?                      @map("score_details_json") // JSON of calculated scores
  createdAt         DateTime                   @default(now())
  updatedAt         DateTime                   @updatedAt

  personnel      Personnel      @relation(fields: [personnelId], references: [id])
  promotionCycle PromotionCycle @relation(fields: [promotionCycleId], references: [id])

  @@map("promotion_applications")
}

model CareerHistoryEntry {
  id          Int       @id @default(autoincrement())
  personnelId Int
  eventType   CareerEventType @map("event_type")
  eventDate   DateTime  @map("event_date")
  detailsJson Json?     @map("details_json") // JSON details of the event
  documentId  Int?      @unique @map("document_id") // Optional reference to supporting document (1:1 with UploadedDocument)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  personnel        Personnel       @relation(fields: [personnelId], references: [id])
  supportingDocument UploadedDocument? @relation(fields: [documentId], references: [id])

  @@map("career_history_entries")
}

model ArchivedRecord {
  id                 Int      @id @default(autoincrement())
  originalEntityType String   @map("original_entity_type") // e.g., 'Transaction', 'PersonnelRecord'
  originalEntityId   Int      @map("original_entity_id") // ID of the original record
  archiveDate        DateTime @default(now()) @map("archive_date")
  archivedByUserId   Int      @map("archived_by_user_id")
  storagePath        String   @map("storage_path") // Path to archived data/file
  retentionEndDate   DateTime @map("retention_end_date")
  createdAt          DateTime @default(now())

  archivedBy User @relation(fields: [archivedByUserId], references: [id])

  @@map("archived_records")
}
```