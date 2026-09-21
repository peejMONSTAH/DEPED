enum TransactionType {
  PROMOTION,
  NEWLY_HIRED,
  SALARY_ADJUSTMENT,
}

enum TransactionStatus {
  DRAFT,
  SUBMITTED_TO_AO2,
  RETURNED_BY_AO2,
  FORWARDED_TO_HRMO,
  RETURNED_BY_HRMO,
  APPROVED_BY_HRMO,
}

class TransactionModel {
  final int id;
  final String referenceNo;
  final TransactionType type;
  final TransactionStatus status;
  final double complianceScore;
  final String? remarks;
  final String createdAt;
  final String updatedAt;
  final List<RequirementItemModel> requirements;

  TransactionModel({
    required this.id,
    required this.referenceNo,
    required this.type,
    required this.status,
    required this.complianceScore,
    this.remarks,
    required this.createdAt,
    required this.updatedAt,
    this.requirements = const [],
  });

  factory TransactionModel.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    final idVal = rawId is int ? rawId : (int.tryParse(rawId?.toString() ?? '') ?? 0);
    final rawScore = json['complianceScore'] ?? json['compliance_score'] ?? 0;
    final scoreVal = rawScore is num ? rawScore.toDouble() : (double.tryParse(rawScore.toString()) ?? 0.0);

    String typeStr = 'PROMOTION';
    final rawType = json['type'] ?? json['transactionType'] ?? json['transaction_type'];
    if (rawType is String) {
      typeStr = rawType;
    } else if (rawType is Map && rawType['name'] != null) {
      typeStr = rawType['name'].toString();
    }

    final rawRef = json['referenceNo'] ?? json['reference_no'];
    final refStr = (rawRef != null && rawRef.toString().isNotEmpty) ? rawRef.toString() : 'TRX-$idVal';

    final parsedRequirements = (json['requirements'] as List<dynamic>?)
            ?.map((item) => RequirementItemModel.fromJson(item as Map<String, dynamic>))
            .toList() ??
        [];

    final parsedType = _parseType(typeStr);
    final templates = rawType is Map ? rawType['requirementTemplates'] : null;
    final docs = (json['uploadedDocuments'] as List?) ?? [];
    final reqs = templates is List
        ? templates.map((t) {
            final matches = docs.where((d) => d['requirementTemplateId'] == t['id']);
            final doc = matches.isEmpty ? null : matches.first;
            return RequirementItemModel(
              id: t['id'], documentName: t['name'], isMandatory: t['isMandatory'] == true,
              description: t['description'],
              uploadedFilePath: doc?['fileName'], fileStatus: doc?['status'],
              rejectionReason: doc?['validationNotes'],
            );
          }).toList()
        : parsedRequirements;
    final parsedStatus = _parseStatus((json['status'] ?? 'DRAFT').toString());
    final computedScore = scoreVal;

    return TransactionModel(
      id: idVal,
      referenceNo: refStr,
      type: parsedType,
      status: parsedStatus,
      complianceScore: computedScore,
      remarks: json['remarks']?.toString(),
      createdAt: (json['createdAt'] ?? json['created_at'] ?? '').toString(),
      updatedAt: (json['updatedAt'] ?? json['updated_at'] ?? '').toString(),
      requirements: reqs,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'referenceNo': referenceNo,
      'type': type.name,
      'status': status.name,
      'complianceScore': complianceScore,
      'remarks': remarks,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'requirements': requirements.map((r) => r.toJson()).toList(),
    };
  }

  static TransactionType _parseType(String typeStr) {
    switch (typeStr.toUpperCase()) {
      case 'NEWLY_HIRED':
        return TransactionType.NEWLY_HIRED;
      case 'SALARY_ADJUSTMENT':
        return TransactionType.SALARY_ADJUSTMENT;
      case 'PROMOTION':
      default:
        return TransactionType.PROMOTION;
    }
  }

  static TransactionStatus _parseStatus(String statusStr) {
    switch (statusStr.toUpperCase()) {
      case 'PENDING_VALIDATION':
      case 'SUBMITTED_TO_AO2':
      case 'SUBMITTED':
        return TransactionStatus.SUBMITTED_TO_AO2;
      case 'RETURNED_BY_AO2':
      case 'RETURNED':
      case 'DEFICIENCY':
        return TransactionStatus.RETURNED_BY_AO2;
      case 'FOR_APPROVAL':
      case 'FORWARDED_TO_HRMO':
      case 'VALIDATED':
        return TransactionStatus.FORWARDED_TO_HRMO;
      case 'RETURNED_BY_HRMO':
        return TransactionStatus.RETURNED_BY_HRMO;
      case 'APPROVED_BY_HRMO':
      case 'APPROVED':
      case 'COMPLETED':
      case 'ARCHIVED':
        return TransactionStatus.APPROVED_BY_HRMO;
      case 'DRAFT':
      default:
        return TransactionStatus.DRAFT;
    }
  }
}

class RequirementItemModel {
  final int id;
  final String documentName;
  final bool isMandatory;
  final String? description;
  final String? uploadedFilePath;
  final String? fileStatus; // PENDING, VERIFIED, REJECTED
  final String? rejectionReason;

  RequirementItemModel({
    required this.id,
    required this.documentName,
    required this.isMandatory,
    this.description,
    this.uploadedFilePath,
    this.fileStatus,
    this.rejectionReason,
  });

  factory RequirementItemModel.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    final idVal = rawId is int ? rawId : (int.tryParse(rawId?.toString() ?? '') ?? 0);
    final rawMandatory = json['isMandatory'] ?? json['is_mandatory'];
    final isMandatoryVal = rawMandatory is bool ? rawMandatory : (rawMandatory != false);

    return RequirementItemModel(
      id: idVal,
      documentName: (json['documentName'] ?? json['document_name'] ?? '') as String,
      isMandatory: isMandatoryVal,
      description: json['description'] as String?,
      uploadedFilePath: (json['uploadedFilePath'] ?? json['uploaded_file_path'] ?? json['file_path']) as String?,
      fileStatus: (json['fileStatus'] ?? json['file_status']) as String?,
      rejectionReason: (json['rejectionReason'] ?? json['rejection_reason']) as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'documentName': documentName,
      'isMandatory': isMandatory,
      'description': description,
      'uploadedFilePath': uploadedFilePath,
      'fileStatus': fileStatus,
      'rejectionReason': rejectionReason,
    };
  }

  bool get isUploaded => uploadedFilePath != null && uploadedFilePath!.isNotEmpty;

  static List<RequirementItemModel> generateDefaultRequirements(TransactionType type) {
    if (type == TransactionType.PROMOTION) {
      return [
        RequirementItemModel(id: 1, documentName: 'Oath of Office (REVISED 2025)', isMandatory: true, description: '3 original copies — REVISED 2025 Oath of Office'),
        RequirementItemModel(id: 2, documentName: 'Omnibus Certification of Authenticity & Veracity', isMandatory: true, description: '1 original copy — Signed & omnibus certification'),
        RequirementItemModel(id: 3, documentName: 'Personal Data Sheet (CSC Form 212 Revised 2025)', isMandatory: true, description: '2 sets original, Long size paper, back-to-back print'),
        RequirementItemModel(id: 4, documentName: 'Work Experience Sheet (CS Form 212 Attachment)', isMandatory: true, description: '2 original copies — Arranged in DESCENDING ORDER (coinciding w/ PDS No. 28)'),
        RequirementItemModel(id: 5, documentName: 'PRC ID / CSC Eligibility Verification', isMandatory: true, description: '1 original copy — Official verification printout'),
        RequirementItemModel(id: 6, documentName: 'VALID PRC ID Card', isMandatory: false, description: '1 photocopy (if applicable)'),
        RequirementItemModel(id: 7, documentName: 'PRC Board Rating', isMandatory: false, description: '1 photocopy (if applicable)'),
        RequirementItemModel(id: 8, documentName: 'CSC Certificate of Eligibility', isMandatory: false, description: '1 photocopy (if applicable)'),
        RequirementItemModel(id: 9, documentName: 'Principal\'s Test Certificate of Rating', isMandatory: false, description: '1 photocopy (For Promotion of School Principal / Head of Office)'),
        RequirementItemModel(id: 10, documentName: 'CAV, Special Order, AND Official Transcript of Records (TOR)', isMandatory: true, description: '1 photocopy each — Graduate Studies, College, Prof. Educ. Units'),
        RequirementItemModel(id: 11, documentName: 'VALID NC II / NC III / TMC / NTTC Certificate', isMandatory: false, description: '1 photocopy each (if applicable)'),
        RequirementItemModel(id: 12, documentName: 'Latest SALN (Revised 2025)', isMandatory: true, description: '1 photocopy (back-to-back print) — Downloadable online'),
        RequirementItemModel(id: 13, documentName: 'SALN Justification Letter', isMandatory: false, description: '1 photocopy (in absence of Spouse\'s signature on SALN, if applicable)'),
        RequirementItemModel(id: 14, documentName: 'PSA Marriage Certificate', isMandatory: false, description: '1 photocopy (if applicable)'),
        RequirementItemModel(id: 15, documentName: 'PSA Birth Certificate', isMandatory: true, description: '1 photocopy — PSA authenticated birth certificate'),
        RequirementItemModel(id: 16, documentName: 'Latest Service Record', isMandatory: true, description: '1 original copy — Updated service record signed by Division head'),
        RequirementItemModel(id: 17, documentName: 'Latest DepEd Payslip', isMandatory: true, description: '1 photocopy — Most recent monthly payslip showing current SG/Step'),
        RequirementItemModel(id: 18, documentName: 'Latest Performance Rating (IPCRF / OPCRF)', isMandatory: true, description: '1 photocopy — IPCRF for Teaching & Non-Teaching / OPCRF for School Head'),
      ];
    } else if (type == TransactionType.NEWLY_HIRED) {
      return [
        RequirementItemModel(id: 10, documentName: 'CS Form 33 (Appointment Form)', isMandatory: true),
        RequirementItemModel(id: 11, documentName: 'CS Form 212 (PDS) & WES', isMandatory: true),
        RequirementItemModel(id: 12, documentName: 'CS Form 211 (Medical Certificate)', isMandatory: true, description: 'With Blood, Urinalysis, and X-Ray results'),
        RequirementItemModel(id: 13, documentName: 'CS Form 32 (Oath of Office)', isMandatory: true),
        RequirementItemModel(id: 14, documentName: 'NBI Clearance (Valid)', isMandatory: true),
        RequirementItemModel(id: 15, documentName: 'PRC License / CSC Eligibility', isMandatory: true),
      ];
    } else {
      return [
        RequirementItemModel(id: 20, documentName: 'NOSA / NOSI Notice Form', isMandatory: true),
        RequirementItemModel(id: 21, documentName: 'Updated Service Record', isMandatory: true),
        RequirementItemModel(id: 22, documentName: 'Latest DepEd Payslip', isMandatory: true),
      ];
    }
  }
}
