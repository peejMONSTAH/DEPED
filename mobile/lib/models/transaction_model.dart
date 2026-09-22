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
  REJECTED,
  ABANDONED,
  ARCHIVED,
  UNKNOWN,
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
              id: t['id'], documentName: t['name'] ?? 'Requirement', isMandatory: t['isMandatory'] == true,
              description: t['description'],
              uploadedFilePath: doc?['fileName'], fileStatus: doc?['status'],
              rejectionReason: doc?['validationNotes'],
              documentId: doc?['id'],
              needsExtractionReview: doc?['ocrExtractedDataJson'] != null &&
                  doc?['correctedOcrDataJson']?['confirmation'] == null &&
                  doc?['status'] != 'VALIDATED',
            );
          }).toList()
        : parsedRequirements;
    final parsedStatus = _parseStatus((json['status'] ?? 'UNKNOWN').toString());
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
    switch (typeStr.toUpperCase().replaceAll(' ', '_')) {
      case 'NEWLY_HIRED':
      case 'NEWLY_HIRED_APPOINTMENT':
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
      case 'ESCALATED':
      case 'FORWARDED_TO_HRMO':
      case 'VALIDATED':
        return TransactionStatus.FORWARDED_TO_HRMO;
      case 'RETURNED_BY_HRMO':
        return TransactionStatus.RETURNED_BY_HRMO;
      case 'APPROVED_BY_HRMO':
      case 'APPROVED':
      case 'COMPLETED':
        return TransactionStatus.APPROVED_BY_HRMO;
      case 'REJECTED':
        return TransactionStatus.REJECTED;
      case 'ABANDONED':
        return TransactionStatus.ABANDONED;
      case 'ARCHIVED':
        return TransactionStatus.ARCHIVED;
      case 'DRAFT':
        return TransactionStatus.DRAFT;
      default:
        return TransactionStatus.UNKNOWN;
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
  final int? documentId;
  final bool needsExtractionReview;

  RequirementItemModel({
    required this.id,
    required this.documentName,
    required this.isMandatory,
    this.description,
    this.uploadedFilePath,
    this.fileStatus,
    this.rejectionReason,
    this.documentId,
    this.needsExtractionReview = false,
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
      documentId: json['documentId'] as int?,
      needsExtractionReview: json['needsExtractionReview'] == true,
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
      'documentId': documentId,
      'needsExtractionReview': needsExtractionReview,
    };
  }

  bool get isUploaded => uploadedFilePath != null && uploadedFilePath!.isNotEmpty;
}
