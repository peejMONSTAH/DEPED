# API.md: Eminence HRIS

## Authentication & Authorization

The Eminence HRIS API uses JSON Web Tokens (JWT) for authentication and authorization. Upon successful login, the API returns an access token and a refresh token. The access token must be included in the `Authorization` header of all subsequent requests.

*   **Authentication Method:** JWT (JSON Web Tokens)
*   **Access Token Lifetime:** Short-lived (e.g., 15 minutes)
*   **Refresh Token Lifetime:** Longer-lived (e.g., 7 days)
*   **Header Format:** `Authorization: Bearer <access_token>`

Authorization is role-based (RBAC). Each endpoint specifies the minimum required role(s) for access.

## Standard Response & Pagination Formats

### Success Response
Successful API calls will return a JSON object with a `status` of "success", an optional `message`, and a `data` field containing the requested resource(s).

```json
// Single resource
{
  "status": "success",
  "message": "Resource created successfully.",
  "data": {
    "id": "uuid-123",
    "name": "Example"
  }
}

// List of resources with pagination
{
  "status": "success",
  "data": [
    { "id": "uuid-1", "name": "Item 1" },
    { "id": "uuid-2", "name": "Item 2" }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalItems": 100,
    "totalPages": 10
  }
}
```

### Error Response
Errors will return a JSON object with a `status` of "error", a descriptive `message`, and an optional `code` for programmatic error handling. The HTTP status code will also indicate the error type (e.g., 400 for bad request, 401 for unauthorized, 403 for forbidden, 404 for not found, 500 for server error).

```json
{
  "status": "error",
  "message": "Invalid input data provided.",
  "code": "VALIDATION_ERROR"
}
```

### Pagination Format
For endpoints returning lists of resources, pagination parameters can be passed as query parameters:
*   `page`: (Optional) The page number to retrieve (default: 1).
*   `limit`: (Optional) The number of items per page (default: 10, max: 100).

The response will include a `pagination` object:
```json
{
  "page": 1,
  "limit": 10,
  "totalItems": 100,
  "totalPages": 10
}
```

## API Endpoints

### 1. Authentication

#### `POST /auth/login`
*   **Description:** Authenticates a user and returns access and refresh tokens.
*   **Auth Level:** Public
*   **Request Body:**
    ```json
    {
      "email": "user@example.com",
      "password": "password123"
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": {
        "accessToken": "eyJ...",
        "refreshToken": "eyJ...",
        "user": {
          "id": "uuid-user-1",
          "email": "user@example.com",
          "role": "Personnel"
        }
      }
    }
    ```
*   **Status Codes:** `200 OK`, `400 Bad Request`, `401 Unauthorized`

#### `POST /auth/refresh-token`
*   **Description:** Refreshes an expired access token using a valid refresh token.
*   **Auth Level:** Any Authenticated
*   **Request Body:**
    ```json
    {
      "refreshToken": "eyJ..."
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": {
        "accessToken": "eyJ..."
      }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`

#### `POST /auth/logout`
*   **Description:** Invalidates the current refresh token, logging the user out.
*   **Auth Level:** Any Authenticated
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Logged out successfully."
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`

### 2. User & Personnel Management

#### `GET /users`
*   **Description:** Retrieves a list of all users with optional filtering and pagination.
*   **Auth Level:** SysAdmin, AO II
*   **Query Parameters:** `role`, `search`, `page`, `limit`
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": "uuid-user-1",
          "email": "personnel1@deped.gov.ph",
          "role": "Personnel",
          "personnelId": "uuid-personnel-1",
          "isActive": true
        }
      ],
      "pagination": { ... }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`

#### `POST /users`
*   **Description:** Creates a new user account.
*   **Auth Level:** SysAdmin
*   **Request Body:**
    ```json
    {
      "email": "newuser@deped.gov.ph",
      "password": "initialPassword123",
      "role": "Personnel",
      "personnelId": "uuid-personnel-linked" // Optional, if linking to existing personnel record
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "User created successfully.",
      "data": {
        "id": "uuid-new-user",
        "email": "newuser@deped.gov.ph",
        "role": "Personnel"
      }
    }
    ```
*   **Status Codes:** `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`

#### `GET /users/{id}`
*   **Description:** Retrieves details of a specific user.
*   **Auth Level:** SysAdmin, AO II
*   **Request Body:** None
*   **Response Body:** (Similar to `GET /users` data item)
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `PUT /users/{id}`
*   **Description:** Updates an existing user account.
*   **Auth Level:** SysAdmin
*   **Request Body:**
    ```json
    {
      "email": "updated@deped.gov.ph",
      "role": "AO II",
      "isActive": false
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "User updated successfully.",
      "data": {
        "id": "uuid-user-1",
        "email": "updated@deped.gov.ph",
        "role": "AO II"
      }
    }
    ```
*   **Status Codes:** `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `DELETE /users/{id}`
*   **Description:** Deletes a user account.
*   **Auth Level:** SysAdmin
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "User deleted successfully."
    }
    ```
*   **Status Codes:** `204 No Content`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `POST /users/{id}/distribute-credentials`
*   **Description:** Triggers the distribution of initial or reset credentials to a user.
*   **Auth Level:** AO II
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Credentials distribution initiated for user uuid-user-1."
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

### 3. Personnel Profile Management

#### `GET /personnel/me`
*   **Description:** Retrieves the authenticated user's own personnel profile.
*   **Auth Level:** Personnel
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": {
        "id": "uuid-personnel-1",
        "userId": "uuid-user-1",
        "firstName": "Juan",
        "lastName": "Dela Cruz",
        "employeeId": "EMP-001",
        "position": "Teacher I",
        "contactNumber": "09171234567",
        "email": "juan.delacruz@deped.gov.ph",
        "dateOfBirth": "1980-01-01",
        "address": "123 Main St, Koronadal City",
        "educationalBackground": [
          { "degree": "BS Education", "institution": "University A", "yearGraduated": 2002 }
        ],
        "serviceHistory": [
          { "position": "Teacher I", "startDate": "2005-06-01", "endDate": null }
        ]
      }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `404 Not Found`

#### `PUT /personnel/me`
*   **Description:** Updates the authenticated user's own personnel profile.
*   **Auth Level:** Personnel
*   **Request Body:**
    ```json
    {
      "contactNumber": "09187654321",
      "address": "456 New St, Koronadal City",
      "educationalBackground": [
        { "degree": "BS Education", "institution": "University A", "yearGraduated": 2002 },
        { "degree": "MA Education", "institution": "University B", "yearGraduated": 2010 }
      ]
    }
    ```
*   **Response Body:** (Similar to `GET /personnel/me` data item)
*   **Status Codes:** `200 OK`, `400 Bad Request`, `401 Unauthorized`

#### `GET /personnel/{id}`
*   **Description:** Retrieves a specific personnel profile by ID.
*   **Auth Level:** AO II, HRMO, Records, SysAdmin
*   **Request Body:** None
*   **Response Body:** (Similar to `GET /personnel/me` data item)
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

### 4. Transaction Management

#### `GET /transactions`
*   **Description:** Retrieves a list of all transactions, with filtering and pagination. Personnel users can only see their own transactions.
*   **Auth Level:** Any Authenticated (Personnel sees own, Admins see all)
*   **Query Parameters:** `status`, `type`, `personnelId`, `search`, `page`, `limit`
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": "uuid-txn-1",
          "personnelId": "uuid-personnel-1",
          "type": "Promotion",
          "status": "Pending Validation",
          "submissionDate": "2023-10-26T10:00:00Z",
          "currentValidatorId": "uuid-aoii-1",
          "documents": [
            { "id": "uuid-doc-1", "name": "Diploma.pdf", "status": "Pending OCR Review" }
          ]
        }
      ],
      "pagination": { ... }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`

#### `POST /transactions`
*   **Description:** Initiates a new HR transaction.
*   **Auth Level:** Personnel
*   **Request Body:**
    ```json
    {
      "type": "Promotion",
      "notes": "Applying for Teacher III position."
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Transaction initiated successfully.",
      "data": {
        "id": "uuid-new-txn",
        "personnelId": "uuid-personnel-1",
        "type": "Promotion",
        "status": "Draft",
        "submissionDate": null
      }
    }
    ```
*   **Status Codes:** `201 Created`, `400 Bad Request`, `401 Unauthorized`

#### `GET /transactions/{id}`
*   **Description:** Retrieves details of a specific transaction.
*   **Auth Level:** Any Authenticated (Personnel sees own, Admins see all)
*   **Request Body:** None
*   **Response Body:** (Similar to `GET /transactions` data item)
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `PUT /transactions/{id}/submit`
*   **Description:** Submits a transaction for validation after all documents are uploaded and reviewed.
*   **Auth Level:** Personnel (for own transaction)
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Transaction submitted for validation.",
      "data": {
        "id": "uuid-txn-1",
        "status": "Pending Validation",
        "submissionDate": "2023-10-26T11:00:00Z"
      }
    }
    ```
*   **Status Codes:** `200 OK`, `400 Bad Request` (e.g., missing documents), `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

### 5. Document Management & Validation

#### `GET /transactions/{transactionId}/requirements`
*   **Description:** Generates and retrieves the dynamic checklist of required documents for a given transaction.
*   **Auth Level:** Personnel (for own transaction)
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": [
        {
          "requirementId": "uuid-req-1",
          "name": "Diploma (BS Education)",
          "description": "Proof of Bachelor's Degree",
          "isMandatory": true,
          "isUploaded": true,
          "uploadedDocumentId": "uuid-doc-1",
          "status": "Pending OCR Review"
        },
        {
          "requirementId": "uuid-req-2",
          "name": "Certificate of Eligibility",
          "description": "CSC Professional Eligibility",
          "isMandatory": true,
          "isUploaded": false
        }
      ]
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `POST /transactions/{transactionId}/documents`
*   **Description:** Uploads a document for a specific transaction requirement.
*   **Auth Level:** Personnel (for own transaction)
*   **Request Body:** `multipart/form-data` with `file` and `requirementId`.
    ```
    file: <binary_file_data>
    requirementId: "uuid-req-1"
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Document uploaded and OCR initiated.",
      "data": {
        "id": "uuid-doc-1",
        "transactionId": "uuid-txn-1",
        "requirementId": "uuid-req-1",
        "fileName": "Diploma.pdf",
        "fileUrl": "https://storage.supabase.com/...",
        "status": "Pending OCR Review",
        "ocrData": { /* Initial OCR extraction */ }
      }
    }
    ```
*   **Status Codes:** `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `GET /documents/{documentId}`
*   **Description:** Retrieves details of an uploaded document, including OCR data.
*   **Auth Level:** Any Authenticated (Personnel for own, Admins for all)
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": {
        "id": "uuid-doc-1",
        "transactionId": "uuid-txn-1",
        "requirementId": "uuid-req-1",
        "fileName": "Diploma.pdf",
        "fileUrl": "https://storage.supabase.com/...",
        "status": "Pending OCR Review",
        "ocrData": {
          "documentType": "Diploma",
          "name": "Juan Dela Cruz",
          "institution": "University A",
          "dateIssued": "2002-03-15"
        },
        "mismatchDetected": false,
        "duplicateDetected": false
      }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `PUT /documents/{documentId}/ocr-review`
*   **Description:** Personnel reviews and confirms/corrects OCR-extracted data for their uploaded document.
*   **Auth Level:** Personnel (for own document)
*   **Request Body:**
    ```json
    {
      "status": "OCR Reviewed",
      "correctedOcrData": {
        "documentType": "Diploma",
        "name": "Juan Dela Cruz",
        "institution": "University A",
        "dateIssued": "2002-03-15"
      }
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "OCR data reviewed and confirmed.",
      "data": {
        "id": "uuid-doc-1",
        "status": "OCR Reviewed",
        "ocrData": { /* confirmed data */ }
      }
    }
    ```
*   **Status Codes:** `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `POST /transactions/{transactionId}/validate`
*   **Description:** AO II validates a submitted transaction, marking documents as valid/invalid and providing feedback.
*   **Auth Level:** AO II
*   **Request Body:**
    ```json
    {
      "documentValidations": [
        {
          "documentId": "uuid-doc-1",
          "isValid": true,
          "feedback": "Document matches requirements."
        },
        {
          "documentId": "uuid-doc-2",
          "isValid": false,
          "feedback": "Signature missing. Please re-upload."
        }
      ],
      "overallValidationStatus": "Validated with Deficiencies" // or "Validated"
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Transaction validation submitted.",
      "data": {
        "id": "uuid-txn-1",
        "status": "Validated with Deficiencies",
        "validatorId": "uuid-aoii-1",
        "validationDate": "2023-10-26T12:00:00Z"
      }
    }
    ```
*   **Status Codes:** `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `POST /transactions/{transactionId}/approve`
*   **Description:** HRMO approves or rejects a validated transaction.
*   **Auth Level:** HRMO
*   **Request Body:**
    ```json
    {
      "isApproved": true,
      "notes": "Approved for promotion to Teacher III."
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Transaction approved.",
      "data": {
        "id": "uuid-txn-1",
        "status": "Approved",
        "approverId": "uuid-hrmo-1",
        "approvalDate": "2023-10-26T13:00:00Z"
      }
    }
    ```
*   **Status Codes:** `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

### 6. Promotion Management

#### `GET /promotion-cycles`
*   **Description:** Retrieves a list of all promotion cycles.
*   **Auth Level:** HRMO, Personnel (read-only for open cycles)
*   **Query Parameters:** `status` (e.g., `open`, `closed`), `year`, `page`, `limit`
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": "uuid-cycle-1",
          "name": "Teacher III Promotion Cycle 2023",
          "type": "Reclassification",
          "startDate": "2023-09-01",
          "endDate": "2023-10-31",
          "status": "Open"
        }
      ],
      "pagination": { ... }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`

#### `POST /promotion-cycles`
*   **Description:** Creates a new promotion cycle.
*   **Auth Level:** HRMO
*   **Request Body:**
    ```json
    {
      "name": "Teacher III Promotion Cycle 2024",
      "type": "Natural Vacancy",
      "startDate": "2024-01-01",
      "endDate": "2024-02-28",
      "rulesEngineConfigId": "uuid-rules-1"
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Promotion cycle created.",
      "data": {
        "id": "uuid-new-cycle",
        "name": "Teacher III Promotion Cycle 2024"
      }
    }
    ```
*   **Status Codes:** `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`

#### `PUT /promotion-cycles/{id}`
*   **Description:** Updates an existing promotion cycle.
*   **Auth Level:** HRMO
*   **Request Body:**
    ```json
    {
      "status": "Closed",
      "rankingResultsUrl": "https://storage.supabase.com/ranking-results.pdf"
    }
    ```
*   **Response Body:** (Similar to `GET /promotion-cycles` data item)
*   **Status Codes:** `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `GET /promotion-rules-configs`
*   **Description:** Retrieves a list of configurable promotion rulesets.
*   **Auth Level:** HRMO
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": "uuid-rules-1",
          "name": "Teacher III Standard Rules",
          "version": "1.0",
          "criteria": [
            { "field": "yearsOfService", "operator": ">=", "value": 5, "points": 20 },
            { "field": "educationalAttainment", "operator": "includes", "value": "MA", "points": 15 }
          ]
        }
      ]
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`

#### `POST /promotion-rules-configs`
*   **Description:** Creates a new promotion ruleset.
*   **Auth Level:** HRMO
*   **Request Body:**
    ```json
    {
      "name": "Teacher III Advanced Rules",
      "criteria": [
        { "field": "yearsOfService", "operator": ">=", "value": 7, "points": 25 }
      ]
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Promotion ruleset created.",
      "data": {
        "id": "uuid-new-rules",
        "name": "Teacher III Advanced Rules"
      }
    }
    ```
*   **Status Codes:** `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`

#### `POST /promotion-cycles/{id}/generate-ranking`
*   **Description:** Triggers the generation of ranking results for a specific promotion cycle based on its configured rules.
*   **Auth Level:** HRMO
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Ranking generation initiated for cycle uuid-cycle-1.",
      "data": {
        "rankingJobId": "uuid-job-1",
        "status": "Processing"
      }
    }
    ```
*   **Status Codes:** `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `GET /promotion-cycles/{id}/ranking-results`
*   **Description:** Retrieves the ranking results for a closed promotion cycle.
*   **Auth Level:** HRMO, Personnel (read-only for relevant cycles)
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": [
        {
          "personnelId": "uuid-personnel-1",
          "firstName": "Juan",
          "lastName": "Dela Cruz",
          "totalScore": 95,
          "rank": 1,
          "eligibilityStatus": "Eligible"
        },
        {
          "personnelId": "uuid-personnel-2",
          "firstName": "Maria",
          "lastName": "Santos",
          "totalScore": 92,
          "rank": 2,
          "eligibilityStatus": "Eligible"
        }
      ]
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

### 7. Digital 201 Repository & Career History

#### `GET /personnel/{id}/201-files`
*   **Description:** Retrieves a list of all validated and archived documents for a specific personnel's 201 file.
*   **Auth Level:** HRMO, Records, AO II (read-only), SysAdmin
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": "uuid-doc-archived-1",
          "fileName": "Diploma_Juan_2002.pdf",
          "documentType": "Diploma",
          "fileUrl": "https://storage.supabase.com/archived/...",
          "validationDate": "2023-01-15",
          "archivedDate": "2023-02-01",
          "version": 1
        }
      ]
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

#### `GET /personnel/{id}/career-history`
*   **Description:** Retrieves the consolidated career history for a specific personnel.
*   **Auth Level:** Any Authenticated (Personnel for own, Admins for all)
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": {
        "personnelId": "uuid-personnel-1",
        "serviceHistory": [
          { "position": "Teacher I", "startDate": "2005-06-01", "endDate": "2010-05-31" },
          { "position": "Teacher II", "startDate": "2010-06-01", "endDate": "2020-05-31" },
          { "position": "Teacher III", "startDate": "2020-06-01", "endDate": null }
        ],
        "trainingRecords": [
          { "name": "Classroom Management", "dateCompleted": "2018-03-10", "hours": 16 }
        ],
        "awardsRecognitions": [
          { "name": "Outstanding Teacher", "year": 2019 }
        ]
      }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

### 8. Notifications

#### `GET /notifications`
*   **Description:** Retrieves a list of notifications for the authenticated user.
*   **Auth Level:** Any Authenticated
*   **Query Parameters:** `status` (e.g., `read`, `unread`), `page`, `limit`
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": "uuid-notif-1",
          "userId": "uuid-user-1",
          "type": "Transaction Status Update",
          "message": "Your promotion application (TXN-001) has been approved.",
          "link": "/transactions/uuid-txn-1",
          "isRead": false,
          "createdAt": "2023-10-26T13:05:00Z"
        }
      ],
      "pagination": { ... }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`

#### `PUT /notifications/{id}/read`
*   **Description:** Marks a specific notification as read.
*   **Auth Level:** Any Authenticated (for own notifications)
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Notification marked as read.",
      "data": {
        "id": "uuid-notif-1",
        "isRead": true
      }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

### 9. Reporting & Audit

#### `GET /audit-logs`
*   **Description:** Retrieves system audit logs.
*   **Auth Level:** SysAdmin, HRMO, AO II, Records
*   **Query Parameters:** `userId`, `actionType`, `resourceType`, `resourceId`, `startDate`, `endDate`, `page`, `limit`
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": "uuid-log-1",
          "timestamp": "2023-10-26T13:10:00Z",
          "userId": "uuid-aoii-1",
          "userName": "Admin Officer 1",
          "action": "VALIDATE_TRANSACTION",
          "resourceType": "Transaction",
          "resourceId": "uuid-txn-1",
          "details": { "oldStatus": "Pending Validation", "newStatus": "Validated" }
        }
      ],
      "pagination": { ... }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`

#### `GET /reports/compliance-summary`
*   **Description:** Generates a summary report on compliance rates.
*   **Auth Level:** HRMO, SysAdmin
*   **Query Parameters:** `period` (e.g., `monthly`, `quarterly`), `year`
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": {
        "period": "Q3 2023",
        "totalTransactions": 150,
        "approvedTransactions": 120,
        "rejectedTransactions": 10,
        "pendingTransactions": 20,
        "complianceRate": "80%",
        "deficiencyBreakdown": {
          "Missing Signature": 5,
          "Outdated Document": 3
        }
      }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`

#### `GET /reports/personnel-demographics`
*   **Description:** Generates a report on personnel demographics.
*   **Auth Level:** HRMO, SysAdmin
*   **Query Parameters:** `groupBy` (e.g., `position`, `ageGroup`), `department`
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": {
        "totalPersonnel": 500,
        "breakdownByPosition": {
          "Teacher I": 200,
          "Teacher II": 150,
          "Teacher III": 100,
          "Non-Teaching": 50
        }
      }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`

### 10. System Configuration

#### `GET /requirement-templates`
*   **Description:** Retrieves a list of all document requirement templates.
*   **Auth Level:** HRMO, SysAdmin
*   **Query Parameters:** `transactionType`, `page`, `limit`
*   **Request Body:** None
*   **Response Body:**
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": "uuid-template-1",
          "name": "Promotion Application Requirements",
          "transactionType": "Promotion",
          "requirements": [
            { "name": "Diploma", "isMandatory": true, "ocrFields": ["degree", "institution"] }
          ]
        }
      ],
      "pagination": { ... }
    }
    ```
*   **Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`

#### `POST /requirement-templates`
*   **Description:** Creates a new document requirement template.
*   **Auth Level:** HRMO, SysAdmin
*   **Request Body:**
    ```json
    {
      "name": "Reclassification Requirements",
      "transactionType": "Reclassification",
      "requirements": [
        { "name": "Performance Rating", "isMandatory": true, "ocrFields": ["rating", "period"] }
      ]
    }
    ```
*   **Response Body:**
    ```json
    {
      "status": "success",
      "message": "Requirement template created.",
      "data": {
        "id": "uuid-new-template",
        "name": "Reclassification Requirements"
      }
    }
    ```
*   **Status Codes:** `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`

#### `PUT /requirement-templates/{id}`
*   **Description:** Updates an existing document requirement template.
*   **Auth Level:** HRMO, SysAdmin
*   **Request Body:**
    ```json
    {
      "requirements": [
        { "name": "Performance Rating", "isMandatory": true, "ocrFields": ["rating", "period"] },
        { "name": "Service Record", "isMandatory": true, "ocrFields": ["startDate", "endDate"] }
      ]
    }
    ```
*   **Response Body:** (Similar to `GET /requirement-templates` data item)
*   **Status Codes:** `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`