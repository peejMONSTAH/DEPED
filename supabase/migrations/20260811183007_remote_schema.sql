-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP EXTENSION pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE TYPE public."AccountRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE public."AccountStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'LOCKED',
  'INACTIVE'
);

CREATE TYPE public."CareerEventType" AS ENUM (
  'PROMOTION',
  'TRAINING',
  'AWARD',
  'DESIGNATION_CHANGE',
  'RECLASSIFICATION',
  'OTHER'
);

CREATE TYPE public."CivilStatus" AS ENUM (
  'SINGLE',
  'MARRIED',
  'WIDOWED',
  'SEPARATED'
);

CREATE TYPE public."DocumentStatus" AS ENUM (
  'PENDING_UPLOAD',
  'PENDING_OCR',
  'OCR_PROCESSED',
  'OCR_REVIEWED',
  'VALIDATED',
  'REJECTED',
  'REQUIRES_MANUAL_REVIEW'
);

CREATE TYPE public."Gender" AS ENUM (
  'MALE',
  'FEMALE',
  'OTHER'
);

CREATE TYPE public."NotificationType" AS ENUM (
  'INFO',
  'WARNING',
  'SUCCESS',
  'ERROR'
);

CREATE TYPE public."PersonnelStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'ON_LEAVE',
  'RETIRED',
  'ARCHIVED'
);

CREATE TYPE public."PromotionApplicationStatus" AS ENUM (
  'SUBMITTED',
  'UNDER_REVIEW',
  'RANKED',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE public."PromotionCycleStatus" AS ENUM (
  'PLANNING',
  'CONFIGURED',
  'ACTIVE',
  'CLOSED',
  'RESULTS_READY',
  'PUBLISHED',
  'FINALIZED',
  'EVALUATION',
  'COMPARATIVE_ASSESSMENT',
  'RESOLVED',
  'CANCELLED'
);

CREATE TYPE public."PromotionCycleType" AS ENUM (
  'RECLASSIFICATION',
  'NATURAL_VACANCY',
  'ECP'
);

CREATE TYPE public."TransactionStatus" AS ENUM (
  'DRAFT',
  'PENDING_VALIDATION',
  'FOR_APPROVAL',
  'APPROVED',
  'REJECTED',
  'DEFICIENCY',
  'ESCALATED',
  'ABANDONED',
  'ARCHIVED',
  'COMPLETED'
);

CREATE TYPE public."UserRole" AS ENUM (
  'SYSTEM_ADMIN',
  'AO_II',
  'HRMO',
  'RECORDS_PERSONNEL',
  'TEACHING_PERSONNEL',
  'NON_TEACHING_PERSONNEL'
);

CREATE SEQUENCE public.account_creation_requests_id_seq AS integer;

CREATE SEQUENCE public.archived_records_id_seq AS integer;

CREATE SEQUENCE public.career_history_entries_id_seq AS integer;

CREATE SEQUENCE public.compliance_checks_id_seq AS integer;

CREATE SEQUENCE public.notifications_id_seq AS integer;

CREATE SEQUENCE public.personnel_id_seq AS integer;

CREATE SEQUENCE public.plantilla_items_id_seq AS integer;

CREATE SEQUENCE public.promotion_applications_id_seq AS integer;

CREATE SEQUENCE public.promotion_cycles_id_seq AS integer;

CREATE SEQUENCE public.refresh_tokens_id_seq AS integer;

CREATE SEQUENCE public.requirement_templates_id_seq AS integer;

CREATE SEQUENCE public.roles_id_seq AS integer;

CREATE SEQUENCE public.transaction_types_id_seq AS integer;

CREATE SEQUENCE public.transactions_id_seq AS integer;

CREATE SEQUENCE public.uploaded_documents_id_seq AS integer;

CREATE SEQUENCE public.users_id_seq AS integer;

CREATE SEQUENCE public.validation_logs_id_seq AS integer;

CREATE TABLE public.account_creation_requests (
  id                   integer                        DEFAULT nextval('public.account_creation_requests_id_seq'::regclass) NOT NULL,
  requested_by_user_id integer                        NOT NULL,
  first_name           text                           NOT NULL,
  last_name            text                           NOT NULL,
  middle_name          text,
  suffix               text,
  email                text                           NOT NULL,
  birth_date           timestamp(3) without time zone,
  gender               public."Gender",
  civil_status         public."CivilStatus",
  contact_number       text,
  address              text,
  role                 public."UserRole"              NOT NULL,
  designation          text                           NOT NULL,
  school               text,
  initial_password     text                           NOT NULL,
  status               public."AccountRequestStatus"  DEFAULT 'PENDING'::public."AccountRequestStatus" NOT NULL,
  rejection_reason     text,
  created_user_id      integer,
  created_at           timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at           timestamp(3) without time zone NOT NULL
);

ALTER SEQUENCE public.account_creation_requests_id_seq OWNED BY public.account_creation_requests.id;

GRANT ALL ON SEQUENCE public.account_creation_requests_id_seq TO anon;

GRANT ALL ON SEQUENCE public.account_creation_requests_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.account_creation_requests_id_seq TO service_role;

ALTER TABLE public.account_creation_requests
  ADD CONSTRAINT account_creation_requests_pkey PRIMARY KEY (id);

GRANT ALL ON public.account_creation_requests TO anon;

GRANT ALL ON public.account_creation_requests TO authenticated;

GRANT ALL ON public.account_creation_requests TO service_role;

CREATE TABLE public.archived_records (
  id                   integer                        DEFAULT nextval('public.archived_records_id_seq'::regclass) NOT NULL,
  original_entity_type text                           NOT NULL,
  original_entity_id   integer                        NOT NULL,
  archive_date         timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  archived_by_user_id  integer                        NOT NULL,
  storage_path         text                           NOT NULL,
  retention_end_date   timestamp(3) without time zone NOT NULL,
  created_at           timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER SEQUENCE public.archived_records_id_seq OWNED BY public.archived_records.id;

GRANT ALL ON SEQUENCE public.archived_records_id_seq TO anon;

GRANT ALL ON SEQUENCE public.archived_records_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.archived_records_id_seq TO service_role;

ALTER TABLE public.archived_records
  ADD CONSTRAINT archived_records_pkey PRIMARY KEY (id);

GRANT ALL ON public.archived_records TO anon;

GRANT ALL ON public.archived_records TO authenticated;

GRANT ALL ON public.archived_records TO service_role;

CREATE TABLE public.career_history_entries (
  id           integer                        DEFAULT nextval('public.career_history_entries_id_seq'::regclass) NOT NULL,
  personnel_id integer                        NOT NULL,
  event_type   public."CareerEventType"       NOT NULL,
  event_date   timestamp(3) without time zone NOT NULL,
  details_json jsonb,
  document_id  integer,
  created_at   timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at   timestamp(3) without time zone NOT NULL
);

ALTER SEQUENCE public.career_history_entries_id_seq OWNED BY public.career_history_entries.id;

GRANT ALL ON SEQUENCE public.career_history_entries_id_seq TO anon;

GRANT ALL ON SEQUENCE public.career_history_entries_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.career_history_entries_id_seq TO service_role;

ALTER TABLE public.career_history_entries
  ADD CONSTRAINT career_history_entries_pkey PRIMARY KEY (id);

GRANT ALL ON public.career_history_entries TO anon;

GRANT ALL ON public.career_history_entries TO authenticated;

GRANT ALL ON public.career_history_entries TO service_role;

CREATE UNIQUE INDEX career_history_entries_document_id_key ON public.career_history_entries (document_id);

CREATE TABLE public.compliance_checks (
  id                   integer                        DEFAULT nextval('public.compliance_checks_id_seq'::regclass) NOT NULL,
  uploaded_document_id integer                        NOT NULL,
  is_compliant         boolean                        NOT NULL,
  deficiency_details   text,
  checked_by_user_id   integer                        NOT NULL,
  check_date           timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at           timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at           timestamp(3) without time zone NOT NULL
);

ALTER SEQUENCE public.compliance_checks_id_seq OWNED BY public.compliance_checks.id;

GRANT ALL ON SEQUENCE public.compliance_checks_id_seq TO anon;

GRANT ALL ON SEQUENCE public.compliance_checks_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.compliance_checks_id_seq TO service_role;

ALTER TABLE public.compliance_checks
  ADD CONSTRAINT compliance_checks_pkey PRIMARY KEY (id);

GRANT ALL ON public.compliance_checks TO anon;

GRANT ALL ON public.compliance_checks TO authenticated;

GRANT ALL ON public.compliance_checks TO service_role;

CREATE UNIQUE INDEX compliance_checks_uploaded_document_id_key ON public.compliance_checks (uploaded_document_id);

CREATE TABLE public.notifications (
  id                  integer                        DEFAULT nextval('public.notifications_id_seq'::regclass) NOT NULL,
  user_id             integer                        NOT NULL,
  message             text                           NOT NULL,
  type                public."NotificationType"      NOT NULL,
  is_read             boolean                        DEFAULT false NOT NULL,
  created_at          timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  related_entity_id   integer,
  related_entity_type text
);

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;

GRANT ALL ON SEQUENCE public.notifications_id_seq TO anon;

GRANT ALL ON SEQUENCE public.notifications_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.notifications_id_seq TO service_role;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

GRANT ALL ON public.notifications TO anon;

GRANT ALL ON public.notifications TO authenticated;

GRANT ALL ON public.notifications TO service_role;

CREATE TABLE public.personnel (
  id                integer                        DEFAULT nextval('public.personnel_id_seq'::regclass) NOT NULL,
  user_id           integer                        NOT NULL,
  employee_id       text                           NOT NULL,
  first_name        text                           NOT NULL,
  last_name         text                           NOT NULL,
  middle_name       text,
  suffix            text,
  birth_date        timestamp(3) without time zone NOT NULL,
  gender            public."Gender"                NOT NULL,
  civil_status      public."CivilStatus"           NOT NULL,
  contact_number    text,
  address           text,
  designation       text                           NOT NULL,
  date_hired        timestamp(3) without time zone NOT NULL,
  status            public."PersonnelStatus"       NOT NULL,
  plantilla_item_id integer,
  profile_complete  boolean                        DEFAULT false NOT NULL,
  created_at        timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at        timestamp(3) without time zone NOT NULL
);

ALTER SEQUENCE public.personnel_id_seq OWNED BY public.personnel.id;

GRANT ALL ON SEQUENCE public.personnel_id_seq TO anon;

GRANT ALL ON SEQUENCE public.personnel_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.personnel_id_seq TO service_role;

ALTER TABLE public.personnel
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.personnel
  ADD CONSTRAINT personnel_pkey PRIMARY KEY (id);

ALTER TABLE public.career_history_entries
  ADD CONSTRAINT career_history_entries_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON UPDATE CASCADE ON DELETE RESTRICT;

GRANT ALL ON public.personnel TO anon;

GRANT ALL ON public.personnel TO authenticated;

GRANT ALL ON public.personnel TO service_role;

CREATE UNIQUE INDEX personnel_user_id_key ON public.personnel (user_id);

CREATE UNIQUE INDEX personnel_plantilla_item_id_key ON public.personnel (plantilla_item_id);

CREATE UNIQUE INDEX personnel_employee_id_key ON public.personnel (employee_id);

CREATE TABLE public.plantilla_items (
  id             integer                        DEFAULT nextval('public.plantilla_items_id_seq'::regclass) NOT NULL,
  item_number    text                           NOT NULL,
  position_title text                           NOT NULL,
  salary_grade   integer                        NOT NULL,
  department     text                           NOT NULL,
  division       text                           NOT NULL,
  is_occupied    boolean                        DEFAULT false NOT NULL,
  created_at     timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at     timestamp(3) without time zone NOT NULL
);

ALTER SEQUENCE public.plantilla_items_id_seq OWNED BY public.plantilla_items.id;

GRANT ALL ON SEQUENCE public.plantilla_items_id_seq TO anon;

GRANT ALL ON SEQUENCE public.plantilla_items_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.plantilla_items_id_seq TO service_role;

ALTER TABLE public.plantilla_items
  ADD CONSTRAINT plantilla_items_pkey PRIMARY KEY (id);

ALTER TABLE public.personnel
  ADD CONSTRAINT personnel_plantilla_item_id_fkey FOREIGN KEY (plantilla_item_id) REFERENCES public.plantilla_items(id) ON UPDATE CASCADE ON DELETE SET NULL;

GRANT ALL ON public.plantilla_items TO anon;

GRANT ALL ON public.plantilla_items TO authenticated;

GRANT ALL ON public.plantilla_items TO service_role;

CREATE UNIQUE INDEX plantilla_items_item_number_key ON public.plantilla_items (item_number);

CREATE TABLE public.promotion_applications (
  id                 integer                             DEFAULT nextval('public.promotion_applications_id_seq'::regclass) NOT NULL,
  personnel_id       integer                             NOT NULL,
  promotion_cycle_id integer                             NOT NULL,
  status             public."PromotionApplicationStatus" NOT NULL,
  application_date   timestamp(3) without time zone      DEFAULT CURRENT_TIMESTAMP NOT NULL,
  final_rank         integer,
  score_details_json jsonb,
  created_at         timestamp(3) without time zone      DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at         timestamp(3) without time zone      NOT NULL
);

ALTER SEQUENCE public.promotion_applications_id_seq OWNED BY public.promotion_applications.id;

GRANT ALL ON SEQUENCE public.promotion_applications_id_seq TO anon;

GRANT ALL ON SEQUENCE public.promotion_applications_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.promotion_applications_id_seq TO service_role;

ALTER TABLE public.promotion_applications
  ADD CONSTRAINT promotion_applications_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.promotion_applications
  ADD CONSTRAINT promotion_applications_pkey PRIMARY KEY (id);

GRANT ALL ON public.promotion_applications TO anon;

GRANT ALL ON public.promotion_applications TO authenticated;

GRANT ALL ON public.promotion_applications TO service_role;

CREATE UNIQUE INDEX promotion_applications_personnel_id_promotion_cycle_id_key ON public.promotion_applications (personnel_id, promotion_cycle_id);

CREATE TABLE public.promotion_cycles (
  id                       integer                        DEFAULT nextval('public.promotion_cycles_id_seq'::regclass) NOT NULL,
  name                     text                           NOT NULL,
  type                     public."PromotionCycleType"    NOT NULL,
  start_date               timestamp(3) without time zone NOT NULL,
  end_date                 timestamp(3) without time zone NOT NULL,
  status                   public."PromotionCycleStatus"  NOT NULL,
  rules_configuration_json jsonb,
  created_at               timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at               timestamp(3) without time zone NOT NULL
);

ALTER SEQUENCE public.promotion_cycles_id_seq OWNED BY public.promotion_cycles.id;

GRANT ALL ON SEQUENCE public.promotion_cycles_id_seq TO anon;

GRANT ALL ON SEQUENCE public.promotion_cycles_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.promotion_cycles_id_seq TO service_role;

ALTER TABLE public.promotion_cycles
  ADD CONSTRAINT promotion_cycles_pkey PRIMARY KEY (id);

ALTER TABLE public.promotion_applications
  ADD CONSTRAINT promotion_applications_promotion_cycle_id_fkey FOREIGN KEY (promotion_cycle_id) REFERENCES public.promotion_cycles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

GRANT ALL ON public.promotion_cycles TO anon;

GRANT ALL ON public.promotion_cycles TO authenticated;

GRANT ALL ON public.promotion_cycles TO service_role;

CREATE TABLE public.refresh_tokens (
  id         integer                        DEFAULT nextval('public.refresh_tokens_id_seq'::regclass) NOT NULL,
  token      text                           NOT NULL,
  user_id    integer                        NOT NULL,
  expires_at timestamp(3) without time zone NOT NULL,
  created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  revoked    boolean                        DEFAULT false NOT NULL
);

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;

GRANT ALL ON SEQUENCE public.refresh_tokens_id_seq TO anon;

GRANT ALL ON SEQUENCE public.refresh_tokens_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.refresh_tokens_id_seq TO service_role;

ALTER TABLE public.refresh_tokens
  ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);

GRANT ALL ON public.refresh_tokens TO anon;

GRANT ALL ON public.refresh_tokens TO authenticated;

GRANT ALL ON public.refresh_tokens TO service_role;

CREATE UNIQUE INDEX refresh_tokens_token_key ON public.refresh_tokens (token);

CREATE TABLE public.requirement_templates (
  id                  integer                        DEFAULT nextval('public.requirement_templates_id_seq'::regclass) NOT NULL,
  transaction_type_id integer                        NOT NULL,
  name                text                           NOT NULL,
  description         text,
  is_mandatory        boolean                        DEFAULT true NOT NULL,
  expected_data_type  text                           NOT NULL,
  ocr_fields_json     jsonb,
  created_at          timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at          timestamp(3) without time zone NOT NULL
);

ALTER SEQUENCE public.requirement_templates_id_seq OWNED BY public.requirement_templates.id;

GRANT ALL ON SEQUENCE public.requirement_templates_id_seq TO anon;

GRANT ALL ON SEQUENCE public.requirement_templates_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.requirement_templates_id_seq TO service_role;

ALTER TABLE public.requirement_templates
  ADD CONSTRAINT requirement_templates_pkey PRIMARY KEY (id);

GRANT ALL ON public.requirement_templates TO anon;

GRANT ALL ON public.requirement_templates TO authenticated;

GRANT ALL ON public.requirement_templates TO service_role;

CREATE TABLE public.roles (
  id          integer           DEFAULT nextval('public.roles_id_seq'::regclass) NOT NULL,
  name        public."UserRole" NOT NULL,
  description text
);

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;

GRANT ALL ON SEQUENCE public.roles_id_seq TO anon;

GRANT ALL ON SEQUENCE public.roles_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.roles_id_seq TO service_role;

ALTER TABLE public.roles
  ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

GRANT ALL ON public.roles TO anon;

GRANT ALL ON public.roles TO authenticated;

GRANT ALL ON public.roles TO service_role;

CREATE UNIQUE INDEX roles_name_key ON public.roles (name);

CREATE TABLE public.transaction_types (
  id          integer DEFAULT nextval('public.transaction_types_id_seq'::regclass) NOT NULL,
  name        text    NOT NULL,
  description text
);

ALTER SEQUENCE public.transaction_types_id_seq OWNED BY public.transaction_types.id;

GRANT ALL ON SEQUENCE public.transaction_types_id_seq TO anon;

GRANT ALL ON SEQUENCE public.transaction_types_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.transaction_types_id_seq TO service_role;

ALTER TABLE public.transaction_types
  ADD CONSTRAINT transaction_types_pkey PRIMARY KEY (id);

ALTER TABLE public.requirement_templates
  ADD CONSTRAINT requirement_templates_transaction_type_id_fkey FOREIGN KEY (transaction_type_id) REFERENCES public.transaction_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;

GRANT ALL ON public.transaction_types TO anon;

GRANT ALL ON public.transaction_types TO authenticated;

GRANT ALL ON public.transaction_types TO service_role;

CREATE UNIQUE INDEX transaction_types_name_key ON public.transaction_types (name);

CREATE TABLE public.transactions (
  id                  integer                        DEFAULT nextval('public.transactions_id_seq'::regclass) NOT NULL,
  personnel_id        integer                        NOT NULL,
  transaction_type_id integer                        NOT NULL,
  status              public."TransactionStatus"     NOT NULL,
  submission_date     timestamp(3) without time zone,
  validation_date     timestamp(3) without time zone,
  approval_date       timestamp(3) without time zone,
  remarks             text,
  current_assignee_id integer,
  resubmission_count  integer                        DEFAULT 0 NOT NULL,
  deficiency_deadline timestamp(3) without time zone,
  created_at          timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at          timestamp(3) without time zone NOT NULL
);

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;

GRANT ALL ON SEQUENCE public.transactions_id_seq TO anon;

GRANT ALL ON SEQUENCE public.transactions_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.transactions_id_seq TO service_role;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_transaction_type_id_fkey FOREIGN KEY (transaction_type_id) REFERENCES public.transaction_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;

GRANT ALL ON public.transactions TO anon;

GRANT ALL ON public.transactions TO authenticated;

GRANT ALL ON public.transactions TO service_role;

CREATE TABLE public.uploaded_documents (
  id                      integer                        DEFAULT nextval('public.uploaded_documents_id_seq'::regclass) NOT NULL,
  transaction_id          integer                        NOT NULL,
  requirement_template_id integer                        NOT NULL,
  storage_path            text                           NOT NULL,
  file_name               text                           NOT NULL,
  file_size               integer,
  mime_type               text,
  file_hash               text,
  uploaded_by_user_id     integer                        NOT NULL,
  upload_date             timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  status                  public."DocumentStatus"        NOT NULL,
  ocr_extracted_data_json jsonb,
  ocr_confidence_score    double precision,
  corrected_ocr_data_json jsonb,
  validation_notes        text,
  validated_by_user_id    integer,
  validation_date         timestamp(3) without time zone,
  is_duplicate            boolean                        DEFAULT false NOT NULL,
  created_at              timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at              timestamp(3) without time zone NOT NULL
);

ALTER SEQUENCE public.uploaded_documents_id_seq OWNED BY public.uploaded_documents.id;

GRANT ALL ON SEQUENCE public.uploaded_documents_id_seq TO anon;

GRANT ALL ON SEQUENCE public.uploaded_documents_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.uploaded_documents_id_seq TO service_role;

ALTER TABLE public.uploaded_documents
  ADD CONSTRAINT uploaded_documents_pkey PRIMARY KEY (id);

ALTER TABLE public.career_history_entries
  ADD CONSTRAINT career_history_entries_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.uploaded_documents(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.compliance_checks
  ADD CONSTRAINT compliance_checks_uploaded_document_id_fkey FOREIGN KEY (uploaded_document_id) REFERENCES public.uploaded_documents(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.uploaded_documents
  ADD CONSTRAINT uploaded_documents_requirement_template_id_fkey FOREIGN KEY (requirement_template_id) REFERENCES public.requirement_templates(id) ON UPDATE CASCADE
    ON DELETE RESTRICT;

ALTER TABLE public.uploaded_documents
  ADD CONSTRAINT uploaded_documents_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

GRANT ALL ON public.uploaded_documents TO anon;

GRANT ALL ON public.uploaded_documents TO authenticated;

GRANT ALL ON public.uploaded_documents TO service_role;

CREATE TABLE public.users (
  id                    integer                        DEFAULT nextval('public.users_id_seq'::regclass) NOT NULL,
  email                 text                           NOT NULL,
  password_hash         text                           NOT NULL,
  role_id               integer                        NOT NULL,
  personnel_id          integer,
  account_status        public."AccountStatus"         DEFAULT 'PENDING'::public."AccountStatus" NOT NULL,
  created_at            timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at            timestamp(3) without time zone NOT NULL,
  last_login            timestamp(3) without time zone,
  failed_login_attempts integer                        DEFAULT 0 NOT NULL,
  locked_until          timestamp(3) without time zone
);

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

GRANT ALL ON SEQUENCE public.users_id_seq TO anon;

GRANT ALL ON SEQUENCE public.users_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.users_id_seq TO service_role;

ALTER TABLE public.users
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users
  ADD CONSTRAINT users_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.users
  ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE public.account_creation_requests
  ADD CONSTRAINT account_creation_requests_created_user_id_fkey FOREIGN KEY (created_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.account_creation_requests
  ADD CONSTRAINT account_creation_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.archived_records
  ADD CONSTRAINT archived_records_archived_by_user_id_fkey FOREIGN KEY (archived_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.compliance_checks
  ADD CONSTRAINT compliance_checks_checked_by_user_id_fkey FOREIGN KEY (checked_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.personnel
  ADD CONSTRAINT personnel_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.refresh_tokens
  ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_current_assignee_id_fkey FOREIGN KEY (current_assignee_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.uploaded_documents
  ADD CONSTRAINT uploaded_documents_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.uploaded_documents
  ADD CONSTRAINT uploaded_documents_validated_by_user_id_fkey FOREIGN KEY (validated_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

GRANT ALL ON public.users TO anon;

GRANT ALL ON public.users TO authenticated;

GRANT ALL ON public.users TO service_role;

CREATE UNIQUE INDEX users_personnel_id_key ON public.users (personnel_id);

CREATE UNIQUE INDEX users_email_key ON public.users (email);

CREATE TABLE public.validation_logs (
  id           integer                        DEFAULT nextval('public.validation_logs_id_seq'::regclass) NOT NULL,
  entity_type  text                           NOT NULL,
  entity_id    integer                        NOT NULL,
  action       text                           NOT NULL,
  details_json jsonb,
  user_id      integer                        NOT NULL,
  ip_address   text,
  user_agent   text,
  status       text                           DEFAULT 'SUCCESS'::text NOT NULL,
  "timestamp"  timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER SEQUENCE public.validation_logs_id_seq OWNED BY public.validation_logs.id;

GRANT ALL ON SEQUENCE public.validation_logs_id_seq TO anon;

GRANT ALL ON SEQUENCE public.validation_logs_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.validation_logs_id_seq TO service_role;

ALTER TABLE public.validation_logs
  ADD CONSTRAINT validation_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.validation_logs
  ADD CONSTRAINT validation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

GRANT ALL ON public.validation_logs TO anon;

GRANT ALL ON public.validation_logs TO authenticated;

GRANT ALL ON public.validation_logs TO service_role;

CREATE INDEX validation_logs_user_id_idx ON public.validation_logs (user_id);

CREATE INDEX validation_logs_entity_type_entity_id_idx ON public.validation_logs (entity_type, entity_id);

CREATE INDEX validation_logs_timestamp_idx ON public.validation_logs ("timestamp");
