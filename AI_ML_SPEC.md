# AI_ML_SPEC.md: Eminence HRIS

## 1. Introduction

This document details the Artificial Intelligence (AI) and Machine Learning (ML) components integrated into the Eminence HRIS. It outlines the specific applications of AI/ML to enhance efficiency, accuracy, and user experience within the system, focusing on document processing, compliance, and career advancement functionalities. The primary goal is to leverage intelligent automation to reduce manual effort, minimize errors, and provide proactive insights.

## 2. Core AI/ML Components

### 2.1. OCR-Assisted Document Data Extraction

**Purpose:** To automatically extract key textual information from uploaded personnel documents, digitizing content and facilitating structured data entry. This reduces manual data input and speeds up the validation process.

**Technology:** Google Cloud Vision AI.

**Workflow (`personnel_self_correction`):**
1.  **Document Upload (FR-05):** Personnel upload documents (e.g., certificates, service records, diplomas) via the mobile application.
2.  **OCR Processing:** The uploaded document image/PDF is sent to Google Cloud Vision AI for text detection and optical character recognition.
3.  **Key Data Extraction:** The system employs pre-trained models and custom parsers (if necessary) to identify and extract specific data fields relevant to HR records, such as:
    *   Full Name
    *   Dates (e.g., date of birth, date of issuance, date of completion, period of service)
    *   Document Type (e.g., Diploma, Certificate of Employment, Training Certificate)
    *   Issuing Authority/Institution
    *   Numerical Values (e.g., grades, scores, salary figures)
    *   Document ID/Reference Numbers
4.  **User Review & Correction (FR-06):** The extracted data is presented to the uploading personnel for immediate review.
    *   Users can compare the OCR output with the original document image.
    *   They can correct any identified inaccuracies in the extracted text.
    *   Users are prompted to confirm the accuracy of the extracted data before submission.
    *   If significant discrepancies are found or the document is unreadable, the user can be prompted to re-upload a clearer version.
5.  **Data Storage:** The validated, structured data is stored in the database alongside the original document.

**Mismatch Detection:**
*   The system will compare OCR-extracted data against expected formats, known values (e.g., date ranges, valid institutions), and potentially existing personnel profile data.
*   Discrepancies are highlighted to the user during the `personnel_self_correction` step and flagged for AO II review during validation.

### 2.2. Dynamic Requirement Checklist Generation

**Purpose:** To provide personnel with a personalized and accurate list of required documents for a specific HR transaction, adapting to their profile and the transaction type.

**Logic (`ai_driven_suggestion`):**
1.  **Input:** User's current profile data (e.g., current position, educational attainment, years of service, previous transactions, existing validated documents) and the selected HR transaction type (e.g., Promotion, Reclassification, Leave Application).
2.  **AI-Driven Analysis:** The system analyzes the inputs against a knowledge base of transaction requirements and rules. This knowledge base is derived from:
    *   Configured `Requirement Templates` for each transaction type.
    *   Historical data of successful and deficient submissions.
    *   Personnel's existing `Career History` and `Uploaded Documents` (to identify already submitted and validated documents).
3.  **Output:** A dynamic checklist (FR-04) presented to the user, indicating:
    *   Required documents for the chosen transaction.
    *   Documents already on file and validated (marked as "on file").
    *   Documents that might be missing or expired.
    *   Conditional requirements based on specific criteria (e.g., "If applying for X, provide Y").

### 2.3. Automated Compliance and Deficiency Detection

**Purpose:** To automatically check submitted documents and data against predefined HR policies and transaction-specific rules, identifying potential deficiencies.

**Logic:**
1.  **Input:** OCR-extracted data from uploaded documents, user profile data, and the specific transaction context.
2.  **Rules Engine Integration:** The system leverages a rules engine (potentially enhanced with ML for pattern recognition) to evaluate compliance based on:
    *   **Data Validation:** Checking if extracted data meets expected formats, ranges, or values (e.g., dates are within valid periods, numerical values are reasonable).
    *   **Document Completeness:** Verifying that all required documents from the dynamic checklist have been submitted.
    *   **Content Compliance:** Comparing extracted document content against specific policy requirements (e.g., "training must be at least X hours," "certificate must be from an accredited institution").
    *   **Cross-referencing:** Checking consistency between different documents or between documents and the personnel's profile.
3.  **Deficiency Detection:** The system flags any non-compliance or missing information.
4.  **Output:**
    *   Automated notifications (FR-08) to personnel regarding deficiencies.
    *   Detailed deficiency reports for AO II during the validation workflow (FR-12).

### 2.4. Duplicate Document Detection

**Purpose:** To prevent the submission and storage of redundant documents, ensuring the integrity and efficiency of the `Digital 201 Repository`.

**Methodology:**
1.  **Hashing:** Upon upload, a unique hash (e.g., SHA-256) of the document's content is generated. This allows for quick detection of exact duplicates.
2.  **Content-Based Similarity (AI/ML):** For documents that might be visually similar but not exact byte-for-byte copies (e.g., scanned at different resolutions, minor annotations), the system can employ:
    *   **Perceptual Hashing:** Generating a "fingerprint" of the document image to detect visual similarity.
    *   **OCR Text Similarity:** Comparing the OCR-extracted text content of newly uploaded documents against existing ones using natural language processing (NLP) techniques (e.g., cosine similarity of text embeddings) to identify semantically similar documents.
3.  **Metadata Comparison:** Comparing document metadata (e.g., document type, date, personnel ID) to identify potential duplicates.
4.  **Action:** If a high probability of duplication is detected, the system will:
    *   Alert the personnel during upload.
    *   Flag the document for AO II review.
    *   Suggest linking to an existing document if it's a valid re-submission (e.g., updated certificate).

### 2.5. Promotion Readiness Suggestion Engine

**Purpose:** To proactively inform personnel about their eligibility for various promotion opportunities and highlight areas for improvement based on configured promotion criteria.

**Logic:**
1.  **Input:**
    *   Personnel's `Career History` (service records, training, performance reviews).
    *   Validated `Uploaded Documents` (e.g., diplomas, certificates).
    *   Configured `Promotion Rules` (FR-14) managed by HRMO (e.g., required years of service, specific training, educational attainment, performance scores).
    *   Current `Plantilla` (staffing pattern) and `Natural Vacancy` information.
2.  **Rule-Based & Predictive Analysis:** The engine evaluates the personnel's profile against the criteria for various promotion types (Reclassification, Natural Vacancy, ECP).
    *   **Eligibility Check:** Determines if the personnel meets the minimum requirements for specific promotion categories.
    *   **Gap Analysis:** Identifies missing qualifications, training, or years of service required for higher positions.
    *   **Scoring (if applicable):** Calculates a preliminary score based on the configured rules, providing an indication of competitiveness.
3.  **Output:**
    *   Personalized suggestions for personnel on potential promotion paths.
    *   Recommendations for training or certifications to meet future promotion criteria.
    *   Notifications about upcoming promotion cycles for which they are eligible.
    *   Readiness dashboards for HRMO to identify potential candidates.

## 3. AI/ML Model Management & Lifecycle

*   **Pre-trained Models:** Google Cloud Vision AI utilizes pre-trained models for OCR, minimizing the need for custom model training for basic text extraction.
*   **Custom Parsers/Rules:** For specific document types or data fields, custom parsing rules will be developed and maintained to enhance extraction accuracy.
*   **Rule Engine Configuration:** The `configurable_rules_engine` for dynamic checklists, compliance, and promotions will be managed via administrative interfaces, allowing HRMO to update criteria without code changes.
*   **Performance Monitoring:** OCR accuracy and processing times will be continuously monitored (NFR: < 10 seconds per page). Feedback from AO II validation and personnel self-correction will be used to identify areas for improvement in data extraction.
*   **Data Feedback Loop:** Data corrected by personnel (FR-06) and validated by AO II (FR-12) will serve as a feedback loop to improve the accuracy of future OCR extractions and compliance checks.

## 4. Integration Points

*   **Backend API (Node.js/Express.js):** Acts as the intermediary for sending documents to Google Cloud Vision AI and processing the returned data.
*   **Database (PostgreSQL):** Stores OCR-extracted data, compliance rules, promotion criteria, and personnel profiles, which are inputs and outputs for AI/ML components.
*   **Supabase Storage:** Stores the raw uploaded documents before and after OCR processing.
*   **Mobile & Web Frontends (Flutter Mobile, React.js Web):** Display OCR results for user review, dynamic checklists, compliance notifications, and promotion suggestions.

## 5. Non-Functional Requirements (AI/ML Specific)

*   **OCR Processing Time:** The system must process a single document page via OCR within **< 10 seconds** (NFR).
*   **Accuracy:** OCR extraction accuracy for key fields should aim for **> 90%** after personnel self-correction.
*   **Scalability:** The AI/ML components, particularly OCR, must scale to handle concurrent document uploads from a large user base (NFR: 1,000+ concurrent mobile users). Google Cloud Vision AI's inherent scalability addresses this.
*   **Data Privacy:** All data sent to and received from AI/ML services must adhere to DepEd's data privacy policies and be encrypted in transit and at rest (NFR: Encrypted Storage, HTTPS).
*   **Auditability:** All AI/ML-driven decisions (e.g., compliance flags, promotion readiness calculations) must be auditable, with clear logs of inputs and outputs (FR-18).

## 6. Future Enhancements

*   **Semantic Search:** Implement advanced search capabilities within the `Digital 201 Repository` using NLP on OCR-extracted text, allowing for more flexible and intelligent document retrieval.
*   **Predictive Analytics for HR Trends:** Analyze aggregated, anonymized data to identify trends in personnel development, training needs, or potential attrition risks.
*   **Automated Document Classification:** Use ML to automatically classify uploaded documents into predefined categories (e.g., "Training Certificate," "Marriage Contract") to further streamline processing.