import 'personnel_document_model.dart';

class PromotionChecklistItem {
  final String code; // 'a' through 'k'
  final String title;
  final String description;
  final bool isMandatory;
  /// 201 document types that can satisfy this requirement, from the backend.
  final List<String> suggestedDocumentTypeIds;
  bool isSubmitted;
  String? remarks;
  AcquiredDocument? attachedDocument;
  String? uploadedFileUrl;
  int? existingDocumentId;
  /// Why AO II returned this item, while the returned file is still attached.
  /// Cleared once the applicant attaches a replacement.
  String? returnedReason;

  PromotionChecklistItem({
    required this.code,
    required this.title,
    required this.description,
    required this.isMandatory,
    this.suggestedDocumentTypeIds = const [],
    this.isSubmitted = false,
    this.remarks,
    this.attachedDocument,
    this.uploadedFileUrl,
    this.existingDocumentId,
  });

  /// Builds a requirement from GET /promotions/annex-c-requirements.
  factory PromotionChecklistItem.fromJson(Map<String, dynamic> json) {
    return PromotionChecklistItem(
      code: (json["code"] ?? "").toString(),
      title: (json["title"] ?? "").toString(),
      description: (json["description"] ?? "").toString(),
      isMandatory: json["isMandatory"] == true,
      suggestedDocumentTypeIds: (json["suggestedDocumentTypeIds"] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
    'code': code,
    'title': title,
    'description': description,
    'isMandatory': isMandatory,
    'isSubmitted': isSubmitted,
    'remarks': remarks,
    'uploadedFileUrl': uploadedFileUrl,
    'existingDocumentId': existingDocumentId,
    'fileName': attachedDocument?.name,
    'fileSize': attachedDocument?.sizeBytes,
    'mimeType': attachedDocument?.mimeType,
  };

  /// Offline fallback only. The authoritative Annex C list is served by
  /// GET /promotions/annex-c-requirements so a DepEd revision reaches every
  /// client without an app release; this copy is used when that call fails.
  /// The requirements in the order a person reads them: A–Z by the name shown
  /// on screen.
  ///
  /// The stored order is the checklist code, a–k, which is the order of DepEd
  /// Order No. 007 s. 2023. That is meaningful to the issuing office and
  /// meaningless to someone scanning the list for "Transcript of Records", so
  /// the display sorts by title instead.
  ///
  /// Comparison is trimmed and case-insensitive, so a stray leading space or a
  /// lower-case entry does not sort away from its neighbours. Ties fall back to
  /// the code, which is unique, so the order is stable: re-sorting after an
  /// upload or a refresh cannot reshuffle two items with the same name.
  ///
  /// Returns a new list. The caller's list is never sorted in place, because
  /// these items carry upload state that other screens hold references to.
  static List<PromotionChecklistItem> sortedByTitle(
    List<PromotionChecklistItem> items,
  ) {
    final ordered = [...items];
    ordered.sort((a, b) {
      final byTitle =
          a.title.trim().toLowerCase().compareTo(b.title.trim().toLowerCase());
      return byTitle != 0 ? byTitle : a.code.compareTo(b.code);
    });
    return ordered;
  }

  static List<PromotionChecklistItem> defaultAnnexCRequirements() {
    return [
      PromotionChecklistItem(
        code: 'a',
        title: 'Letter of Intent',
        description: 'Letter of intent addressed to the Head of Office or highest human resource officer',
        isMandatory: true,
      ),
      PromotionChecklistItem(
        code: 'b',
        title: 'Personal Data Sheet (PDS) & WES',
        description: 'Duly accomplished Personal Data Sheet (PDS) (CS Form No. 212, Revised 2017) and Work Experience Sheet, if applicable',
        isMandatory: true,
      ),
      PromotionChecklistItem(
        code: 'c',
        title: 'PRC License / ID',
        description: 'Photocopy of valid and updated PRC License/ID, if applicable',
        isMandatory: false,
      ),
      PromotionChecklistItem(
        code: 'd',
        title: 'Certificate of Eligibility / Report of Rating',
        description: 'Photocopy of Certificate of Eligibility/Report of Rating, if applicable',
        isMandatory: false,
      ),
      PromotionChecklistItem(
        code: 'e',
        title: 'Scholastic / Academic Records (TOR & Diploma)',
        description: 'Photocopy of scholastic/academic record such as but not limited to Transcript of Records (TOR) and Diploma, including completion of graduate and post-graduate units/degrees, if available',
        isMandatory: true,
      ),
      PromotionChecklistItem(
        code: 'f',
        title: 'Certificates of Training',
        description: 'Photocopy of Certificate/s of Training, if applicable',
        isMandatory: false,
      ),
      PromotionChecklistItem(
        code: 'g',
        title: 'Employment Certificate / Contract / Service Record',
        description: 'Photocopy of Certificate of Employment, Contract of Service, or duly signed Service Record, whichever is/are applicable',
        isMandatory: true,
      ),
      PromotionChecklistItem(
        code: 'h',
        title: 'Latest Appointment',
        description: 'Photocopy of latest appointment, if applicable',
        isMandatory: false,
      ),
      PromotionChecklistItem(
        code: 'i',
        title: 'Performance Ratings (IPCR)',
        description: 'Photocopy of the Performance Ratings in the last rating period/s covering one (1) year performance prior to the deadline of submission, if applicable',
        isMandatory: true,
      ),
      PromotionChecklistItem(
        code: 'j',
        title: 'Checklist & Omnibus Sworn Statement / CAV',
        description: 'Checklist of Requirements and Omnibus Sworn Statement on the Certification on the Authenticity and Veracity (CAV) of the documents submitted and Data Privacy Consent Form',
        isMandatory: true,
      ),
      PromotionChecklistItem(
        code: 'k',
        title: 'Other Documents / MOVs for Comparative Assessment',
        description: 'Other documents as may be required for comparative assessment, such as Means of Verification (MOVs) showing Outstanding Accomplishments, Application of Education, and Application of Learning & Development, or relevant performance ratings.',
        isMandatory: false,
      ),
    ];
  }
}

class PromotionChecklistData {
  final String nameOfApplicant;
  final String positionAppliedFor;
  final String officeAppliedFor;
  final String contactNumber;
  final String region;
  final String ethnicity;
  final bool isPersonWithDisability;
  final bool isSoloParent;
  final String applicationCode;
  final List<PromotionChecklistItem> items;
  final bool omnibusSwornAgreed;
  final bool dataPrivacyConsentAgreed;

  PromotionChecklistData({
    required this.nameOfApplicant,
    required this.positionAppliedFor,
    required this.officeAppliedFor,
    required this.contactNumber,
    required this.region,
    required this.ethnicity,
    required this.isPersonWithDisability,
    required this.isSoloParent,
    required this.applicationCode,
    required this.items,
    required this.omnibusSwornAgreed,
    required this.dataPrivacyConsentAgreed,
  });

  Map<String, dynamic> toJson() => {
    'nameOfApplicant': nameOfApplicant,
    'positionAppliedFor': positionAppliedFor,
    'officeAppliedFor': officeAppliedFor,
    'contactNumber': contactNumber,
    'region': region,
    'ethnicity': ethnicity,
    'isPersonWithDisability': isPersonWithDisability,
    'isSoloParent': isSoloParent,
    'applicationCode': applicationCode,
    'items': items.map((i) => i.toJson()).toList(),
    'omnibusSwornAgreed': omnibusSwornAgreed,
    'dataPrivacyConsentAgreed': dataPrivacyConsentAgreed,
    'submittedAt': DateTime.now().toIso8601String(),
  };
}
