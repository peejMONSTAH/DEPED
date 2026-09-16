-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SYSTEM_ADMIN', 'AO_II', 'HRMO', 'TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'RECORDS_PERSONNEL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'PENDING_VALIDATION', 'FOR_APPROVAL', 'APPROVED', 'REJECTED', 'DEFICIENCY', 'ESCALATED', 'ABANDONED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING_UPLOAD', 'PENDING_OCR', 'OCR_PROCESSED', 'OCR_REVIEWED', 'VALIDATED', 'REJECTED', 'REQUIRES_MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "PromotionApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'RANKED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PromotionCycleType" AS ENUM ('RECLASSIFICATION', 'NATURAL_VACANCY', 'ECP');

-- CreateEnum
CREATE TYPE "PromotionCycleStatus" AS ENUM ('PLANNING', 'CONFIGURED', 'ACTIVE', 'CLOSED', 'RESULTS_READY', 'PUBLISHED', 'FINALIZED', 'EVALUATION', 'COMPARATIVE_ASSESSMENT', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CareerEventType" AS ENUM ('PROMOTION', 'TRAINING', 'AWARD', 'DESIGNATION_CHANGE', 'RECLASSIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'WARNING', 'SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "CivilStatus" AS ENUM ('SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED');

-- CreateEnum
CREATE TYPE "PersonnelStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RETIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'LOCKED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AccountRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" "UserRole" NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" INTEGER NOT NULL,
    "personnel_id" INTEGER,
    "account_status" "AccountStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "used_magic_tokens" (
    "id" SERIAL NOT NULL,
    "jti" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "used_magic_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "employee_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "suffix" TEXT,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "civil_status" "CivilStatus" NOT NULL,
    "contact_number" TEXT,
    "address" TEXT,
    "designation" TEXT NOT NULL,
    "date_hired" TIMESTAMP(3),
    "status" "PersonnelStatus" NOT NULL,
    "plantilla_item_id" INTEGER,
    "profile_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_items" (
    "id" SERIAL NOT NULL,
    "item_number" TEXT NOT NULL,
    "position_title" TEXT NOT NULL,
    "salary_grade" INTEGER NOT NULL,
    "department" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "is_occupied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantilla_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "transaction_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "personnel_id" INTEGER NOT NULL,
    "transaction_type_id" INTEGER NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "submission_date" TIMESTAMP(3),
    "validation_date" TIMESTAMP(3),
    "approval_date" TIMESTAMP(3),
    "remarks" TEXT,
    "current_assignee_id" INTEGER,
    "resubmission_count" INTEGER NOT NULL DEFAULT 0,
    "deficiency_deadline" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_templates" (
    "id" SERIAL NOT NULL,
    "transaction_type_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "expected_data_type" TEXT NOT NULL,
    "ocr_fields_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_documents" (
    "id" SERIAL NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "requirement_template_id" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "file_hash" TEXT,
    "uploaded_by_user_id" INTEGER NOT NULL,
    "upload_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL,
    "ocr_extracted_data_json" JSONB,
    "ocr_confidence_score" DOUBLE PRECISION,
    "corrected_ocr_data_json" JSONB,
    "validation_notes" TEXT,
    "validated_by_user_id" INTEGER,
    "validation_date" TIMESTAMP(3),
    "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploaded_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_checks" (
    "id" SERIAL NOT NULL,
    "uploaded_document_id" INTEGER NOT NULL,
    "is_compliant" BOOLEAN NOT NULL,
    "deficiency_details" TEXT,
    "checked_by_user_id" INTEGER NOT NULL,
    "check_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_logs" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "details_json" JSONB,
    "user_id" INTEGER NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "related_entity_id" INTEGER,
    "related_entity_type" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_cycles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromotionCycleType" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "PromotionCycleStatus" NOT NULL,
    "rules_configuration_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_applications" (
    "id" SERIAL NOT NULL,
    "personnel_id" INTEGER NOT NULL,
    "promotion_cycle_id" INTEGER NOT NULL,
    "status" "PromotionApplicationStatus" NOT NULL,
    "application_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "final_rank" INTEGER,
    "score_details_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_history_entries" (
    "id" SERIAL NOT NULL,
    "personnel_id" INTEGER NOT NULL,
    "event_type" "CareerEventType" NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL,
    "details_json" JSONB,
    "document_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_history_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_creation_requests" (
    "id" SERIAL NOT NULL,
    "requested_by_user_id" INTEGER NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "suffix" TEXT,
    "email" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3),
    "gender" "Gender",
    "civil_status" "CivilStatus",
    "contact_number" TEXT,
    "address" TEXT,
    "role" "UserRole" NOT NULL,
    "designation" TEXT NOT NULL,
    "school" TEXT,
    "initial_password" TEXT NOT NULL,
    "status" "AccountRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "created_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_creation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_personnel_id_key" ON "users"("personnel_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "used_magic_tokens_jti_key" ON "used_magic_tokens"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_user_id_key" ON "personnel"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_employee_id_key" ON "personnel"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_plantilla_item_id_key" ON "personnel"("plantilla_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "plantilla_items_item_number_key" ON "plantilla_items"("item_number");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_types_name_key" ON "transaction_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_checks_uploaded_document_id_key" ON "compliance_checks"("uploaded_document_id");

-- CreateIndex
CREATE INDEX "validation_logs_entity_type_entity_id_idx" ON "validation_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "validation_logs_user_id_idx" ON "validation_logs"("user_id");

-- CreateIndex
CREATE INDEX "validation_logs_timestamp_idx" ON "validation_logs"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_applications_personnel_id_promotion_cycle_id_key" ON "promotion_applications"("personnel_id", "promotion_cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "career_history_entries_document_id_key" ON "career_history_entries"("document_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_plantilla_item_id_fkey" FOREIGN KEY ("plantilla_item_id") REFERENCES "plantilla_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_current_assignee_id_fkey" FOREIGN KEY ("current_assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transaction_type_id_fkey" FOREIGN KEY ("transaction_type_id") REFERENCES "transaction_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_templates" ADD CONSTRAINT "requirement_templates_transaction_type_id_fkey" FOREIGN KEY ("transaction_type_id") REFERENCES "transaction_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_requirement_template_id_fkey" FOREIGN KEY ("requirement_template_id") REFERENCES "requirement_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_checked_by_user_id_fkey" FOREIGN KEY ("checked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_uploaded_document_id_fkey" FOREIGN KEY ("uploaded_document_id") REFERENCES "uploaded_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_logs" ADD CONSTRAINT "validation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_applications" ADD CONSTRAINT "promotion_applications_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_applications" ADD CONSTRAINT "promotion_applications_promotion_cycle_id_fkey" FOREIGN KEY ("promotion_cycle_id") REFERENCES "promotion_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_history_entries" ADD CONSTRAINT "career_history_entries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "uploaded_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_history_entries" ADD CONSTRAINT "career_history_entries_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_creation_requests" ADD CONSTRAINT "account_creation_requests_created_user_id_fkey" FOREIGN KEY ("created_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_creation_requests" ADD CONSTRAINT "account_creation_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
