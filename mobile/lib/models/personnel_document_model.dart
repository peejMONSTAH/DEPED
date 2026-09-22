import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

enum PersonnelDocumentStatus {
  NOT_SUBMITTED,
  PENDING,
  SUBMITTED,
  UNDER_REVIEW,
  APPROVED,
  REJECTED,
  EXPIRED,
  REPLACEMENT_REQUIRED,
}

extension PersonnelDocumentStatusExt on PersonnelDocumentStatus {
  String get label {
    switch (this) {
      case PersonnelDocumentStatus.NOT_SUBMITTED:
        return 'Not Submitted';
      case PersonnelDocumentStatus.PENDING:
        return 'Pending';
      case PersonnelDocumentStatus.SUBMITTED:
        return 'Submitted';
      case PersonnelDocumentStatus.UNDER_REVIEW:
        return 'Under Review';
      case PersonnelDocumentStatus.APPROVED:
        return 'Approved';
      case PersonnelDocumentStatus.REJECTED:
        return 'Rejected';
      case PersonnelDocumentStatus.EXPIRED:
        return 'Expired';
      case PersonnelDocumentStatus.REPLACEMENT_REQUIRED:
        return 'Replacement Required';
    }
  }

  Color get color {
    switch (this) {
      case PersonnelDocumentStatus.NOT_SUBMITTED:
        return const Color(0xFF64748B); // Slate
      case PersonnelDocumentStatus.PENDING:
        return const Color(0xFFD97706); // Amber
      case PersonnelDocumentStatus.SUBMITTED:
        return const Color(0xFF2563EB); // Royal Blue
      case PersonnelDocumentStatus.UNDER_REVIEW:
        return const Color(0xFF7C3AED); // Purple
      case PersonnelDocumentStatus.APPROVED:
        return const Color(0xFF10B981); // Emerald Green
      case PersonnelDocumentStatus.REJECTED:
      case PersonnelDocumentStatus.REPLACEMENT_REQUIRED:
        return const Color(0xFFDC2626); // Red
      case PersonnelDocumentStatus.EXPIRED:
        return const Color(0xFF64748B); // Slate
    }
  }
}

class DocumentTypeConfig {
  final String id;
  final String name;
  final bool supportsExpiration;
  final String description;
  final String category;

  const DocumentTypeConfig({
    required this.id,
    required this.name,
    required this.supportsExpiration,
    required this.description,
    required this.category,
  });

  factory DocumentTypeConfig.fromJson(Map<String, dynamic> json) {
    return DocumentTypeConfig(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      supportsExpiration: json['supportsExpiration'] == true,
      description: json['description']?.toString() ?? '',
      category: json['category']?.toString() ?? 'General',
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'supportsExpiration': supportsExpiration,
    'description': description,
    'category': category,
  };

  IconData get icon {
    switch (id) {
      case 'GOV_ID':
        return LucideIcons.idCard;
      case 'BIRTH_CERT':
        return LucideIcons.fileHeart;
      case 'DIPLOMA':
        return LucideIcons.graduationCap;
      case 'TOR':
        return LucideIcons.bookOpenCheck;
      case 'COE':
        return LucideIcons.briefcase;
      case 'NBI_CLEARANCE':
      case 'POLICE_CLEARANCE':
        return LucideIcons.shieldCheck;
      case 'MED_CERT':
        return LucideIcons.stethoscope;
      case 'TRAINING_CERT':
        return LucideIcons.award;
      case 'LICENSE':
        return LucideIcons.badgeCheck;
      case 'RESUME_CV':
        return LucideIcons.fileUser;
      case 'PDS':
      case 'WES':
        return LucideIcons.clipboardList;
      case 'LETTER_OF_INTENT':
        return LucideIcons.mail;
      case 'CSC_ELIGIBILITY':
        return LucideIcons.scrollText;
      case 'CAV':
        return LucideIcons.fileCheck;
      case 'PERFORMANCE_RATING':
        return LucideIcons.chartColumn;
      case 'OMNIBUS_CERT':
        return LucideIcons.fileSignature;
      case 'OATH_OF_OFFICE':
        return LucideIcons.handshake;
      case 'POSITION_DESCRIPTION':
        return LucideIcons.listChecks;
      case 'APPOINTMENT':
        return LucideIcons.fileBadge;
      case 'SALN':
        return LucideIcons.wallet;
      case 'MARRIAGE_CERT':
        return LucideIcons.heart;
      default:
        return LucideIcons.fileText;
    }
  }

  // Offline fallback only. The authoritative list is served by
  // GET /personnel/documents/document-types and fetched on open; this copy is
  // used when that call fails. Generated from the backend definition -- if you
  // change one, regenerate the other.
  static const List<DocumentTypeConfig> defaultTypes = [
    DocumentTypeConfig(
      id: "LETTER_OF_INTENT",
      name: "Letter of Intent",
      supportsExpiration: false,
      description: "Letter of intent addressed to the Head of Office indicating position and item number",
      category: "Promotion",
    ),
    DocumentTypeConfig(
      id: "PDS",
      name: "Personal Data Sheet (CS Form 212)",
      supportsExpiration: false,
      description: "Fully accomplished and signed CS Form No. 212 (Revised 2017)",
      category: "Civil Service Form",
    ),
    DocumentTypeConfig(
      id: "WES",
      name: "Work Experience Sheet",
      supportsExpiration: false,
      description: "CS Form No. 212 attachment detailing relevant work experience",
      category: "Civil Service Form",
    ),
    DocumentTypeConfig(
      id: "LICENSE",
      name: "PRC License / ID",
      supportsExpiration: true,
      description: "Valid PRC Professional Identification Card or board licence",
      category: "Professional",
    ),
    DocumentTypeConfig(
      id: "CSC_ELIGIBILITY",
      name: "Certificate of Eligibility / Report of Rating",
      supportsExpiration: false,
      description: "CSC Certificate of Eligibility or Report of Rating (LET, CSC Professional, PBET)",
      category: "Eligibility",
    ),
    DocumentTypeConfig(
      id: "TOR",
      name: "Transcript of Records",
      supportsExpiration: false,
      description: "Official Transcript of Records (TOR)",
      category: "Education",
    ),
    DocumentTypeConfig(
      id: "DIPLOMA",
      name: "Diploma",
      supportsExpiration: false,
      description: "Official college or post-graduate diploma",
      category: "Education",
    ),
    DocumentTypeConfig(
      id: "CAV",
      name: "CAV / Special Order",
      supportsExpiration: false,
      description: "Certification, Authentication and Verification, or CHED/DepEd Special Order",
      category: "Education",
    ),
    DocumentTypeConfig(
      id: "TRAINING_CERT",
      name: "Training Certificate",
      supportsExpiration: false,
      description: "Certificate of completion or participation in training and professional development",
      category: "Training",
    ),
    DocumentTypeConfig(
      id: "COE",
      name: "Certificate of Employment / Service Record",
      supportsExpiration: false,
      description: "Service record, employment certificate or contract from a previous agency or employer",
      category: "Employment",
    ),
    DocumentTypeConfig(
      id: "APPOINTMENT",
      name: "Latest Appointment",
      supportsExpiration: false,
      description: "Latest appointment or plantilla allocation (KSS Form No. 3)",
      category: "Employment",
    ),
    DocumentTypeConfig(
      id: "PERFORMANCE_RATING",
      name: "Performance Rating (IPCR / OPCR)",
      supportsExpiration: false,
      description: "Individual or Office Performance Commitment and Review rating for the rating periods required",
      category: "Performance",
    ),
    DocumentTypeConfig(
      id: "OMNIBUS_CERT",
      name: "Omnibus Sworn Statement",
      supportsExpiration: false,
      description: "Signed omnibus certification of authenticity and veracity of submitted documents",
      category: "Promotion",
    ),
    DocumentTypeConfig(
      id: "OATH_OF_OFFICE",
      name: "Oath of Office (CS Form 32)",
      supportsExpiration: false,
      description: "Duly subscribed and sworn Oath of Office",
      category: "Civil Service Form",
    ),
    DocumentTypeConfig(
      id: "POSITION_DESCRIPTION",
      name: "Position Description Form",
      supportsExpiration: false,
      description: "Duly accomplished DBM-CSC Form No. 1 detailing duties and responsibilities",
      category: "Civil Service Form",
    ),
    DocumentTypeConfig(
      id: "SALN",
      name: "SALN",
      supportsExpiration: false,
      description: "Latest Statement of Assets, Liabilities and Net Worth",
      category: "Civil Service Form",
    ),
    DocumentTypeConfig(
      id: "GOV_ID",
      name: "Government ID",
      supportsExpiration: true,
      description: "Passport, UMID, Driver's Licence or PhilSys ID",
      category: "Identification",
    ),
    DocumentTypeConfig(
      id: "BIRTH_CERT",
      name: "Birth Certificate",
      supportsExpiration: false,
      description: "PSA authenticated Certificate of Live Birth",
      category: "Personal",
    ),
    DocumentTypeConfig(
      id: "MARRIAGE_CERT",
      name: "Marriage Certificate",
      supportsExpiration: false,
      description: "PSA authenticated marriage certificate, where applicable",
      category: "Personal",
    ),
    DocumentTypeConfig(
      id: "NBI_CLEARANCE",
      name: "NBI Clearance",
      supportsExpiration: true,
      description: "Valid National Bureau of Investigation clearance",
      category: "Clearance",
    ),
    DocumentTypeConfig(
      id: "POLICE_CLEARANCE",
      name: "Police Clearance",
      supportsExpiration: true,
      description: "Valid local or PNP clearance",
      category: "Clearance",
    ),
    DocumentTypeConfig(
      id: "MED_CERT",
      name: "Medical Certificate (CS Form 211)",
      supportsExpiration: true,
      description: "Medical certificate from a licensed physician with laboratory results",
      category: "Medical",
    ),
    DocumentTypeConfig(
      id: "RESUME_CV",
      name: "Resume / CV",
      supportsExpiration: false,
      description: "Curriculum vitae. This does not replace the Personal Data Sheet, which is a separate required form.",
      category: "Personal",
    ),
    DocumentTypeConfig(
      id: "OTHER",
      name: "Other",
      supportsExpiration: false,
      description: "Any other supporting document or MOV for comparative assessment",
      category: "General",
    ),
  ];
}

class PersonnelDocument {
  final int id;
  final int personnelId;
  final String documentTypeId;
  final String documentTypeName;
  final String originalFileName;
  final String storedFileName;
  final String mimeType;
  final int fileSize;
  final String fileUrl;
  final String? issueDate;
  final String? expirationDate;
  final String? remarks;
  final PersonnelDocumentStatus status;
  final String? rejectionReason;
  final String uploadedAt;
  final String updatedAt;
  final String? reviewedAt;
  final String? reviewedBy;
  final bool isRequired;
  final bool hasFile;

  PersonnelDocument({
    required this.id,
    required this.personnelId,
    required this.documentTypeId,
    required this.documentTypeName,
    required this.originalFileName,
    required this.storedFileName,
    required this.mimeType,
    required this.fileSize,
    required this.fileUrl,
    this.issueDate,
    this.expirationDate,
    this.remarks,
    required this.status,
    this.rejectionReason,
    required this.uploadedAt,
    required this.updatedAt,
    this.reviewedAt,
    this.reviewedBy,
    this.isRequired = false,
    this.hasFile = true,
  });

  bool get isPdf => mimeType.toLowerCase().contains('pdf') || originalFileName.toLowerCase().endsWith('.pdf');
  bool get isImage => mimeType.toLowerCase().contains('image') || originalFileName.toLowerCase().endsWith('.png') || originalFileName.toLowerCase().endsWith('.jpg') || originalFileName.toLowerCase().endsWith('.jpeg');

  String get formattedFileSize {
    if (fileSize < 1024) return '$fileSize B';
    if (fileSize < 1024 * 1024) return '${(fileSize / 1024).toStringAsFixed(1)} KB';
    return '${(fileSize / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  factory PersonnelDocument.fromJson(Map<String, dynamic> json) {
    PersonnelDocumentStatus parseStatus(dynamic raw) {
      final s = raw?.toString().toUpperCase() ?? '';
      switch (s) {
        case 'NOT_SUBMITTED':
          return PersonnelDocumentStatus.NOT_SUBMITTED;
        case 'PENDING':
          return PersonnelDocumentStatus.PENDING;
        case 'SUBMITTED':
          return PersonnelDocumentStatus.SUBMITTED;
        case 'UNDER_REVIEW':
          return PersonnelDocumentStatus.UNDER_REVIEW;
        case 'APPROVED':
        case 'VERIFIED':
        case 'VALIDATED':
          return PersonnelDocumentStatus.APPROVED;
        case 'REJECTED':
        case 'DEFICIENT':
          return PersonnelDocumentStatus.REJECTED;
        case 'EXPIRED':
          return PersonnelDocumentStatus.EXPIRED;
        case 'REPLACEMENT_REQUIRED':
          return PersonnelDocumentStatus.REPLACEMENT_REQUIRED;
        default:
          return PersonnelDocumentStatus.SUBMITTED;
      }
    }

    final rawId = json['id'];
    final idVal = rawId is int ? rawId : (int.tryParse(rawId?.toString() ?? '') ?? 0);
    final rawPId = json['personnelId'] ?? json['personnel_id'];
    final pIdVal = rawPId is int ? rawPId : (int.tryParse(rawPId?.toString() ?? '') ?? 0);
    final rawSize = json['fileSize'] ?? json['file_size'];
    final sizeVal = rawSize is int ? rawSize : (int.tryParse(rawSize?.toString() ?? '') ?? 0);

    return PersonnelDocument(
      id: idVal,
      personnelId: pIdVal,
      documentTypeId: json['documentTypeId']?.toString() ?? json['document_type_id']?.toString() ?? 'OTHER',
      documentTypeName: json['documentTypeName']?.toString() ?? json['document_type_name']?.toString() ?? 'Document',
      originalFileName: json['originalFileName']?.toString() ?? json['original_file_name']?.toString() ?? json['fileName']?.toString() ?? 'document.pdf',
      storedFileName: json['storedFileName']?.toString() ?? json['stored_file_name']?.toString() ?? 'document.pdf',
      mimeType: json['mimeType']?.toString() ?? json['mime_type']?.toString() ?? 'application/pdf',
      fileSize: sizeVal,
      fileUrl: json['fileUrl']?.toString() ?? json['file_url']?.toString() ?? '',
      issueDate: json['issueDate']?.toString() ?? json['issue_date']?.toString(),
      expirationDate: json['expirationDate']?.toString() ?? json['expiration_date']?.toString(),
      remarks: json['remarks']?.toString(),
      status: parseStatus(json['status']),
      rejectionReason: json['rejectionReason']?.toString() ?? json['rejection_reason']?.toString(),
      uploadedAt: json['uploadedAt']?.toString() ?? json['uploaded_at']?.toString() ?? DateTime.now().toIso8601String(),
      updatedAt: json['updatedAt']?.toString() ?? json['updated_at']?.toString() ?? DateTime.now().toIso8601String(),
      reviewedAt: json['reviewedAt']?.toString() ?? json['reviewed_at']?.toString(),
      reviewedBy: json['reviewedBy']?.toString() ?? json['reviewed_by']?.toString(),
      isRequired: json['isRequired'] == true || json['is_required'] == true,
      hasFile: json['hasFile'] == true || json['has_file'] == true || (json['fileUrl'] != null && json['fileUrl'].toString().isNotEmpty),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'personnelId': personnelId,
    'documentTypeId': documentTypeId,
    'documentTypeName': documentTypeName,
    'originalFileName': originalFileName,
    'storedFileName': storedFileName,
    'mimeType': mimeType,
    'fileSize': fileSize,
    'fileUrl': fileUrl,
    'issueDate': issueDate,
    'expirationDate': expirationDate,
    'remarks': remarks,
    'status': status.name,
    'rejectionReason': rejectionReason,
    'uploadedAt': uploadedAt,
    'updatedAt': updatedAt,
    'reviewedAt': reviewedAt,
    'reviewedBy': reviewedBy,
    'isRequired': isRequired,
    'hasFile': hasFile,
  };
}

class AcquiredDocument {
  final String name;
  final Uint8List? bytes;
  final String? path;
  final String mimeType;
  final int sizeBytes;
  final int pageCount;
  final bool isScanned;
  final List<String> pagePaths;
  final List<Uint8List> pageBytes;

  AcquiredDocument({
    required this.name,
    this.bytes,
    this.path,
    required this.mimeType,
    required this.sizeBytes,
    this.pageCount = 1,
    this.isScanned = false,
    this.pagePaths = const [],
    this.pageBytes = const [],
  });

  bool get isPdf => mimeType == 'application/pdf' || name.toLowerCase().endsWith('.pdf');
  bool get isImage => mimeType.startsWith('image/') || name.toLowerCase().endsWith('.jpg') || name.toLowerCase().endsWith('.jpeg') || name.toLowerCase().endsWith('.png');

  String get formattedSize {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) return '${(sizeBytes / 1024).toStringAsFixed(1)} KB';
    return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

enum UploadProgressState {
  idle,
  selecting,
  scanning,
  processing,
  ready,
  uploading,
  success,
  error,
}

class UploadStateInfo {
  final UploadProgressState state;
  final double progress; // 0.0 to 1.0
  final String message;
  final String? errorMessage;

  const UploadStateInfo({
    required this.state,
    this.progress = 0.0,
    this.message = 'Idle',
    this.errorMessage,
  });

  bool get isBusy => state == UploadProgressState.uploading || state == UploadProgressState.scanning || state == UploadProgressState.processing;
}
