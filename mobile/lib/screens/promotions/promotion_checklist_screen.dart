import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../utils/errors.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_document_model.dart';
import '../../models/personnel_profile_model.dart';
import '../../models/promotion_checklist_model.dart';
import '../../models/user_model.dart';
import '../../services/acquisition/document_acquisition_service.dart';
import '../../services/api_service.dart';
import '../../services/personnel_document_service.dart';
import '../../utils/display.dart';
import '../personnel_documents/document_preview_screen.dart';
import '../../theme/app_theme.dart';

class PromotionChecklistScreen extends StatefulWidget {
  final Map<String, dynamic> cycle;
  final UserModel user;
  final PersonnelProfileModel? profile;

  const PromotionChecklistScreen({
    Key? key,
    required this.cycle,
    required this.user,
    this.profile,
  }) : super(key: key);

  @override
  State<PromotionChecklistScreen> createState() =>
      _PromotionChecklistScreenState();
}

class _PromotionChecklistScreenState extends State<PromotionChecklistScreen> {
  final _formKey = GlobalKey<FormState>();

  late final ApiService _apiService;
  late final DocumentAcquisitionService _acquisitionService;
  late final PersonnelDocumentService _personnelDocumentService;

  late final TextEditingController _applicantNameController;
  late final TextEditingController _positionAppliedController;
  late final TextEditingController _officeController;
  late final TextEditingController _contactNumberController;
  late final TextEditingController _regionController;
  late final TextEditingController _ethnicityController;
  late final String _applicationCode;

  bool _isPwd = false;
  bool _isSoloParent = false;

  List<PromotionChecklistItem> _checklistItems =
      PromotionChecklistItem.sortedByTitle(
    PromotionChecklistItem.defaultAnnexCRequirements(),
  );
  List<PersonnelDocument> _existing201Documents = [];

  bool _omnibusSwornAgreed = false;
  bool _dataPrivacyConsentAgreed = false;

  bool _isSubmitting = false;
  double _uploadProgress = 0.0;
  String _statusMessage = '';

  @override
  void initState() {
    super.initState();
    _apiService = ApiService();
    _acquisitionService = DocumentAcquisitionService();
    _personnelDocumentService = PersonnelDocumentService(_apiService);

    // The server assigns the applicant number on submission (from the new
    // application's id). A locally invented code collided with real ones.
    _applicationCode = 'Assigned when you submit';

    final targetPos = widget.cycle['name']?.toString() ?? 'Target Position';
    final fullName = widget.profile?.fullName ??
        '${widget.user.firstName ?? ""} ${widget.user.lastName ?? ""}'.trim();

    _applicantNameController = TextEditingController(
        text: fullName.isNotEmpty ? fullName : 'DepEd Personnel');
    _positionAppliedController = TextEditingController(text: targetPos);
    _officeController = TextEditingController(
        text: widget.profile?.stationName ?? 'SDO Koronadal City');
    _contactNumberController = TextEditingController(
        text: widget.profile?.mobileNo ?? '0917-123-4567');
    _regionController =
        TextEditingController(text: 'Region XII - SOCCSKSARGEN');
    _ethnicityController = TextEditingController(text: 'Filipino');

    // Starts from the bundled copy so the form renders immediately, then adopts
    // the backend list -- that is the one AO II verifies against.
    _loadAnnexCRequirements();
    _loadExisting201Documents();
  }

  @override
  void dispose() {
    _applicantNameController.dispose();
    _positionAppliedController.dispose();
    _officeController.dispose();
    _contactNumberController.dispose();
    _regionController.dispose();
    _ethnicityController.dispose();
    super.dispose();
  }

  Future<void> _loadAnnexCRequirements() async {
    final items = await _personnelDocumentService.getAnnexCRequirements();
    if (!mounted) return;
    setState(() {
      // Preserve anything the applicant already attached while the fetch was in
      // flight, matched by Annex C code.
      final attached = {for (final item in _checklistItems) item.code: item};
      for (final item in items) {
        final previous = attached[item.code];
        if (previous == null) continue;
        item.isSubmitted = previous.isSubmitted;
        item.remarks = previous.remarks;
        item.attachedDocument = previous.attachedDocument;
        item.uploadedFileUrl = previous.uploadedFileUrl;
        item.existingDocumentId = previous.existingDocumentId;
      }
      // The server sends Annex C order (a–k); the screen shows A–Z.
      _checklistItems = PromotionChecklistItem.sortedByTitle(items);
    });
  }

  Future<void> _loadExisting201Documents() async {
    try {
      final docs = await _personnelDocumentService.getDocuments(forceRefresh: true);
      if (mounted) {
        setState(() => _existing201Documents = docs.where((d) => d.hasFile).toList());
      }
    } catch (_) {}
  }

  void _openAcquisitionModal(PromotionChecklistItem item) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => Container(
        width: double.infinity,
        padding: EdgeInsets.fromLTRB(
            18, 4, 18, 18 + MediaQuery.viewInsetsOf(ctx).bottom),
        decoration: const BoxDecoration(
          color: AppTheme.lightBgCard,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryLight.withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      item.code.toUpperCase(),
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.bold,
                          color: AppTheme.primaryLight),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Submit Requirement (${item.code})',
                          style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                              color: AppTheme.textPrimary),
                        ),
                        Text(
                          item.title,
                          style: GoogleFonts.inter(
                              fontSize: 12, color: AppTheme.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const Divider(height: 24, color: AppTheme.lightBorder),

              // Option 1: Scan Document (Camera / ML Kit)
              _buildAcquisitionOption(
                onTap: () {
                  Navigator.of(ctx).pop();
                  _scanForRequirement(item);
                },
                icon: LucideIcons.camera,
                iconColor: AppTheme.primaryLight,
                title: 'Scan with camera',
                subtitle: 'Automatic edge detection, crop, and page cleanup',
              ),
              const SizedBox(height: 10),

              // Option 2: Upload File (PDF/Image)
              _buildAcquisitionOption(
                onTap: () {
                  Navigator.of(ctx).pop();
                  _pickFileForRequirement(item);
                },
                icon: LucideIcons.fileUp,
                iconColor: AppTheme.brandDark,
                title: 'Upload from device',
                subtitle: 'PDF, JPG, or PNG up to 10 MB',
              ),

              // Option 3: Select from Verified 201 Documents (if available)
              if (_existing201Documents.isNotEmpty) ...[
                const SizedBox(height: 10),
                _buildAcquisitionOption(
                  onTap: () {
                    Navigator.of(ctx).pop();
                    _showSelect201RecordModal(item);
                  },
                  icon: LucideIcons.checkCheck,
                  iconColor: AppTheme.emeraldGreen,
                  title: 'Use a verified 201 document',
                  subtitle:
                      '${_existing201Documents.length} document${_existing201Documents.length == 1 ? '' : 's'} available',
                ),
              ],
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAcquisitionOption({
    required VoidCallback onTap,
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
  }) {
    return Material(
      color: AppTheme.lightSurface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(color: AppTheme.lightBorder),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                    color: iconColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: iconColor, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                            color: AppTheme.textPrimary)),
                    const SizedBox(height: 3),
                    Text(subtitle,
                        style: GoogleFonts.inter(
                            fontSize: 11,
                            height: 1.35,
                            color: AppTheme.textSecondary)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(LucideIcons.chevronRight,
                  size: 17, color: AppTheme.textMuted),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _scanForRequirement(PromotionChecklistItem item) async {
    try {
      final doc = await _acquisitionService.scanDocument(pageLimit: 10);
      if (doc != null && mounted) {
        final validation = _acquisitionService.validateDocument(doc);
        if (!validation.isValid) {
          _showErrorSnackBar(
              validation.errorMessage ?? 'Document validation failed.');
          return;
        }
        await _uploadAcquiredDocument(item, doc);
        _showSuccessSnackBar(
            'Document scanned and attached for requirement (${item.code.toUpperCase()}).');
      }
    } catch (e) {
      _showErrorSnackBar(friendlyError(e,
          fallback: 'That document could not be attached. Please try again.'));
    }
  }

  Future<void> _pickFileForRequirement(PromotionChecklistItem item) async {
    try {
      final doc = await _acquisitionService.pickDocument();
      if (doc != null && mounted) {
        final validation = _acquisitionService.validateDocument(doc);
        if (!validation.isValid) {
          _showErrorSnackBar(
              validation.errorMessage ?? 'Document validation failed.');
          return;
        }
        await _uploadAcquiredDocument(item, doc);
        _showSuccessSnackBar(
            'File attached for requirement (${item.code.toUpperCase()}).');
      }
    } catch (e) {
      _showErrorSnackBar(friendlyError(e,
          fallback: 'That document could not be attached. Please try again.'));
    }
  }

  Future<void> _uploadAcquiredDocument(
      PromotionChecklistItem item, AcquiredDocument doc) async {
    final saved = await _personnelDocumentService.uploadDocument(
      document: doc,
      documentTypeId: 'OTHER',
      customDocumentName: 'Annex C ${item.code}: ${item.title}',
      replacesDocumentId: item.existingDocumentId,
    );
    if (!mounted) return;
    setState(() {
      item.attachedDocument = doc;
      item.existingDocumentId = saved.id;
      item.uploadedFileUrl = saved.fileUrl;
      item.isSubmitted = true;
    });
  }

  void _showSelect201RecordModal(PromotionChecklistItem item) {
    String query = '';
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          final validDocs = _existing201Documents.where((d) => d.hasFile).toList();

          final searchedDocs = query.trim().isEmpty
              ? validDocs
              : validDocs.where((d) {
                  final q = query.trim().toLowerCase();
                  return d.documentTypeName.toLowerCase().contains(q) ||
                      d.originalFileName.toLowerCase().contains(q) ||
                      (d.remarks?.toLowerCase().contains(q) ?? false);
                }).toList();

          final recommended = searchedDocs
              .where((d) => item.suggestedDocumentTypeIds.contains(d.documentTypeId))
              .toList();
          final others = searchedDocs
              .where((d) => !item.suggestedDocumentTypeIds.contains(d.documentTypeId))
              .toList();
          final displayList = [...recommended, ...others];

          return Container(
            constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.8),
            padding: const EdgeInsets.all(22),
            decoration: const BoxDecoration(
              color: AppTheme.lightBgCard,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Select 201 Document for (${item.code.toUpperCase()})',
                            style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.bold, fontSize: 15),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            item.title,
                            style: GoogleFonts.inter(
                                fontSize: 12, color: AppTheme.textSecondary),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(ctx).pop(),
                      icon: const Icon(LucideIcons.x, size: 18),
                      tooltip: 'Close dialog',
                    ),
                  ],
                ),
                const Divider(height: 18, color: AppTheme.lightBorder),
                Container(
                  decoration: BoxDecoration(
                    color: AppTheme.lightSurface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.lightBorder),
                  ),
                  child: TextField(
                    onChanged: (val) => setModalState(() => query = val),
                    decoration: InputDecoration(
                      hintText: 'Search 201 documents...',
                      hintStyle: GoogleFonts.inter(
                          fontSize: 13, color: AppTheme.textMuted),
                      prefixIcon: const Icon(LucideIcons.search,
                          size: 16, color: AppTheme.textMuted),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: displayList.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Text(
                              validDocs.isEmpty
                                  ? 'No uploaded files found in your 201 profile records.'
                                  : 'No 201 documents match "$query".',
                              style: GoogleFonts.inter(
                                  fontSize: 13, color: AppTheme.textMuted),
                              textAlign: TextAlign.center,
                            ),
                          ),
                        )
                      : ListView.builder(
                          itemCount: displayList.length,
                          itemBuilder: (c, i) {
                            final d = displayList[i];
                            final isRecommended = item.suggestedDocumentTypeIds
                                .contains(d.documentTypeId);
                            final expired = d.expirationDate != null &&
                                isDateInPast(d.expirationDate!);

                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              decoration: BoxDecoration(
                                color: isRecommended
                                    ? const Color(0xFF10B981).withOpacity(0.04)
                                    : AppTheme.lightSurface,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isRecommended
                                      ? const Color(0xFF10B981).withOpacity(0.4)
                                      : AppTheme.lightBorder,
                                ),
                              ),
                              child: ListTile(
                                leading: Icon(
                                    d.isPdf
                                        ? LucideIcons.fileText
                                        : LucideIcons.image,
                                    color: AppTheme.primaryLight),
                                title: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        d.documentTypeName,
                                        style: GoogleFonts.plusJakartaSans(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 13),
                                      ),
                                    ),
                                    if (isRecommended) ...[
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF10B981)
                                              .withOpacity(0.15),
                                          borderRadius:
                                              BorderRadius.circular(4),
                                        ),
                                        child: Text(
                                          'RECOMMENDED',
                                          style: GoogleFonts.inter(
                                            fontSize: 9,
                                            fontWeight: FontWeight.w800,
                                            color: const Color(0xFF059669),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                    ],
                                    if (expired)
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFDC2626)
                                              .withOpacity(0.15),
                                          borderRadius:
                                              BorderRadius.circular(4),
                                        ),
                                        child: Text(
                                          'EXPIRED',
                                          style: GoogleFonts.inter(
                                            fontSize: 9,
                                            fontWeight: FontWeight.w800,
                                            color: const Color(0xFFDC2626),
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                                subtitle: Text(
                                    '${d.originalFileName} · ${d.formattedFileSize}'),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      icon: const Icon(LucideIcons.eye,
                                          size: 18,
                                          color: AppTheme.primaryLight),
                                      tooltip: 'Preview document',
                                      onPressed: () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute<void>(
                                            fullscreenDialog: true,
                                            builder: (previewCtx) =>
                                                DocumentPreviewScreen(
                                              document: d,
                                              documentService:
                                                  _personnelDocumentService,
                                            ),
                                          ),
                                        );
                                      },
                                    ),
                                    ElevatedButton(
                                      onPressed: () {
                                        Navigator.of(ctx).pop();
                                        setState(() {
                                          item.existingDocumentId = d.id;
                                          item.isSubmitted = true;
                                          item.uploadedFileUrl = d.fileUrl;
                                          item.attachedDocument =
                                              AcquiredDocument(
                                            name: d.originalFileName,
                                            mimeType: d.mimeType,
                                            sizeBytes: d.fileSize,
                                            path: d.fileUrl,
                                          );
                                        });
                                        _showSuccessSnackBar(
                                            'Attached "${d.documentTypeName}" to requirement (${item.code.toUpperCase()}).');
                                      },
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: AppTheme.brandDark,
                                        foregroundColor: Colors.white,
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 12, vertical: 4),
                                      ),
                                      child: const Text('Attach',
                                          style: TextStyle(fontSize: 12)),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  void _removeAttachment(PromotionChecklistItem item) {
    setState(() {
      item.attachedDocument = null;
      item.isSubmitted = false;
      item.uploadedFileUrl = null;
      item.existingDocumentId = null;
    });
  }

  Future<void> _submitApplication() async {
    if (_isSubmitting) return;

    if (widget.cycle['status'] == 'CANCELLED') {
      _showErrorSnackBar('This promotion cycle has been cancelled or discontinued and is no longer accepting applications.');
      return;
    }

    if (!_formKey.currentState!.validate()) {
      _showErrorSnackBar('Please complete all required applicant details.');
      return;
    }

    // Check mandatory items
    final missingMandatory = _checklistItems
        .where((i) =>
            i.isMandatory && (!i.isSubmitted || i.attachedDocument == null))
        .toList();
    if (missingMandatory.isNotEmpty) {
      final codes = missingMandatory
          .map((m) => 'Item ${m.code.toUpperCase()} (${m.title})')
          .join(', ');
      _showErrorSnackBar('Please attach required documents for: $codes');
      return;
    }

    if (!_omnibusSwornAgreed) {
      _showErrorSnackBar(
          'You must agree to the Omnibus Sworn Statement on Certification of Authenticity & Veracity.');
      return;
    }

    if (!_dataPrivacyConsentAgreed) {
      _showErrorSnackBar(
          'You must agree to the Data Privacy Consent before submitting.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _uploadProgress = 0.1;
      _statusMessage = 'Preparing Annex C submission...';
    });

    final cycleId = widget.cycle['id'];

    final checklistData = PromotionChecklistData(
      nameOfApplicant: _applicantNameController.text.trim(),
      positionAppliedFor: _positionAppliedController.text.trim(),
      officeAppliedFor: _officeController.text.trim(),
      contactNumber: _contactNumberController.text.trim(),
      region: _regionController.text.trim(),
      ethnicity: _ethnicityController.text.trim(),
      isPersonWithDisability: _isPwd,
      isSoloParent: _isSoloParent,
      applicationCode: _applicationCode,
      items: _checklistItems,
      omnibusSwornAgreed: _omnibusSwornAgreed,
      dataPrivacyConsentAgreed: _dataPrivacyConsentAgreed,
    );

    try {
      setState(() {
        _uploadProgress = 0.5;
        _statusMessage = 'Submitting Annex C & documents to HRMO...';
      });

      await _apiService.dio.post<dynamic>(
        '/promotions/cycles/$cycleId/apply',
        data: {
          'applicationCode': _applicationCode,
          'checklist': checklistData.toJson(),
        },
      );

      if (!mounted) return;

      setState(() {
        _uploadProgress = 1.0;
        _statusMessage = 'Application submitted successfully!';
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(LucideIcons.checkCircle2,
                  color: Colors.white, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Annex C Checklist & Application for "${widget.cycle['name']}" submitted successfully!',
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ),
            ],
          ),
          backgroundColor: AppTheme.emeraldGreen,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 4),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );

      Navigator.of(context).pop(true);
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      // The API explains exactly why an application was rejected - the cycle is
      // no longer active, you have already applied, you are not eligible. That
      // message is what the applicant needs; the exception text is not.
      _showErrorSnackBar(friendlyError(e,
          fallback:
              'Your application could not be submitted. Check your connection and try again.'));
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      debugPrint('[Annex C] Unexpected submit failure: $e');
      _showErrorSnackBar(
          'Your application could not be submitted. Please try again.');
    }
  }

  void _showErrorSnackBar(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg,
            style: GoogleFonts.inter(
                fontWeight: FontWeight.w600, color: Colors.white)),
        backgroundColor: const Color(0xFFDC2626),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  void _showSuccessSnackBar(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg,
            style: GoogleFonts.inter(
                fontWeight: FontWeight.w600, color: Colors.white)),
        backgroundColor: AppTheme.emeraldGreen,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final submittedCount = _checklistItems.where((i) => i.isSubmitted).length;
    final totalCount = _checklistItems.length;

    return Scaffold(
      backgroundColor: AppTheme.lightBg,
      appBar: AppBar(
        backgroundColor: AppTheme.lightBgSecondary,
        elevation: 0,
        toolbarHeight: 68,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'CHECKLIST OF REQUIREMENTS',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.textPrimary),
            ),
            Text(
              'Annex C · Promotion & Reclassification Selection',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.inter(
                  fontSize: 11, color: AppTheme.textSecondary),
            ),
          ],
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 14),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.brandDark,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              _applicationCode,
              style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: Colors.white),
            ),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
          children: [
            // Target Position Banner
            _buildTargetPositionCard(),
            const SizedBox(height: 16),

            // Applicant Information Card (from PDF Annex C)
            _buildApplicantInfoCard(),
            const SizedBox(height: 20),

            // Requirements Section Header
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              runAlignment: WrapAlignment.center,
              spacing: 12,
              runSpacing: 8,
              children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 270),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Basic documentary requirements',
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.textPrimary),
                      ),
                      Text(
                        'Items (a)–(k) · Scan or upload each credential',
                        style: GoogleFonts.inter(
                            fontSize: 12,
                            height: 1.35,
                            color: AppTheme.textSecondary),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: submittedCount >= 5
                        ? AppTheme.emeraldGreen.withOpacity(0.15)
                        : AppTheme.accentGold.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                        color: submittedCount >= 5
                            ? AppTheme.emeraldGreen.withOpacity(0.3)
                            : AppTheme.accentGold.withOpacity(0.3)),
                  ),
                  child: Text(
                    '$submittedCount / $totalCount Attached',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: submittedCount >= 5
                          ? AppTheme.emeraldGreen
                          : const Color(0xFFB45309),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Requirements Checklist (Items a to k)
            ..._checklistItems.map((item) => _buildRequirementCard(item)),
            const SizedBox(height: 20),

            // Bottom Certifications (Omnibus & Data Privacy)
            _buildCertificationsCard(),
            const SizedBox(height: 20),

            // Progress Bar if submitting
            if (_isSubmitting) ...[
              Container(
                padding: const EdgeInsets.all(14),
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: AppTheme.lightBgCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppTheme.lightBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_statusMessage,
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 12, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    LinearProgressIndicator(
                      value: _uploadProgress,
                      backgroundColor: AppTheme.lightSurface,
                      color: AppTheme.primaryLight,
                      minHeight: 6,
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ],
                ),
              ),
            ],

            // Submit Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _isSubmitting ? null : _submitApplication,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.brandDark,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: AppTheme.lightBorder,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16)),
                  elevation: 0,
                ),
                icon: _isSubmitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Icon(LucideIcons.send,
                        size: 18, color: Colors.white),
                label: Text(
                  _isSubmitting
                      ? 'Submitting Application...'
                      : 'Submit Promotion Application (Annex C)',
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: Colors.white),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTargetPositionCard() {
    final title = widget.cycle['name']?.toString() ?? 'Promotion Vacancy';
    final type = widget.cycle['type']?.toString() ?? 'RECLASSIFICATION';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.lightBgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.lightBorder),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.brandDark,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(LucideIcons.award,
                color: AppTheme.accentLime, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFA07A1F).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        type,
                        style: GoogleFonts.inter(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: const Color(0xFFA07A1F)),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'DepEd SDO Vacancy',
                      style: GoogleFonts.inter(
                          fontSize: 11, color: AppTheme.textSecondary),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  title,
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildApplicantInfoCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.lightBgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.lightBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.userCheck,
                  size: 16, color: AppTheme.primaryLight),
              const SizedBox(width: 8),
              Text(
                'Applicant Information (Annex C)',
                style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.textPrimary),
              ),
            ],
          ),
          const Divider(height: 20, color: AppTheme.lightBorder),

          // Name of Applicant
          _buildTextField(
              label: 'Name of Applicant *',
              controller: _applicantNameController),
          const SizedBox(height: 12),

          // Position & Office Row
          _buildResponsiveFieldPair(
            _buildTextField(
                label: 'Position Applied For *',
                controller: _positionAppliedController),
            _buildTextField(
                label: 'Office Applied For *', controller: _officeController),
          ),
          const SizedBox(height: 12),

          // Contact Number & Region Row
          _buildResponsiveFieldPair(
            _buildTextField(
                label: 'Contact Number *',
                controller: _contactNumberController),
            _buildTextField(label: 'Region *', controller: _regionController),
          ),
          const SizedBox(height: 12),

          // Ethnicity
          _buildTextField(
              label: 'Ethnicity *', controller: _ethnicityController),
          const SizedBox(height: 14),

          // PWD & Solo Parent Toggles
          _buildResponsiveFieldPair(
            _buildToggleTile(
              label: 'Person with Disability (PWD)',
              value: _isPwd,
              onChanged: (v) => setState(() => _isPwd = v),
            ),
            _buildToggleTile(
              label: 'Solo parent',
              value: _isSoloParent,
              onChanged: (v) => setState(() => _isSoloParent = v),
            ),
            stackBelow: 440,
          ),
        ],
      ),
    );
  }

  Widget _buildResponsiveFieldPair(Widget first, Widget second,
      {double stackBelow = 360}) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < stackBelow) {
          return Column(children: [first, const SizedBox(height: 12), second]);
        }
        return Row(children: [
          Expanded(child: first),
          const SizedBox(width: 12),
          Expanded(child: second)
        ]);
      },
    );
  }

  Widget _buildToggleTile(
      {required String label,
      required bool value,
      required ValueChanged<bool> onChanged}) {
    return Container(
      constraints: const BoxConstraints(minHeight: 58),
      padding: const EdgeInsets.only(left: 12, right: 6, top: 5, bottom: 5),
      decoration: BoxDecoration(
        color: AppTheme.lightSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.lightBorder),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.inter(
                  fontSize: 11, height: 1.25, fontWeight: FontWeight.w600),
            ),
          ),
          Switch(
              value: value,
              activeColor: AppTheme.brandDark,
              onChanged: onChanged),
        ],
      ),
    );
  }

  Widget _buildTextField(
      {required String label, required TextEditingController controller}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary)),
        const SizedBox(height: 4),
        TextFormField(
          controller: controller,
          style: GoogleFonts.inter(fontSize: 13, color: AppTheme.textPrimary),
          decoration: InputDecoration(
            filled: true,
            fillColor: AppTheme.lightSurface,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppTheme.lightBorder)),
            enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppTheme.lightBorder)),
          ),
          validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
        ),
      ],
    );
  }

  Widget _buildRequirementCard(PromotionChecklistItem item) {
    final hasDoc = item.attachedDocument != null;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.lightBgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: hasDoc
              ? AppTheme.emeraldGreen.withOpacity(0.4)
              : (item.isMandatory
                  ? const Color(0xFFFDE68A)
                  : AppTheme.lightBorder),
          width: hasDoc ? 1.4 : 1.0,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top Row: Code Badge, Title, Mandatory Chip, Status
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: hasDoc
                      ? AppTheme.emeraldGreen
                      : (item.isMandatory
                          ? AppTheme.brandDark
                          : AppTheme.lightSurface),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    item.code.toUpperCase(),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: (hasDoc || item.isMandatory)
                          ? Colors.white
                          : AppTheme.textSecondary,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            item.title,
                            style: GoogleFonts.plusJakartaSans(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.textPrimary),
                          ),
                        ),
                        if (item.isMandatory)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            margin: const EdgeInsets.only(left: 6),
                            decoration: BoxDecoration(
                                color: const Color(0xFFFEF3C7),
                                borderRadius: BorderRadius.circular(8)),
                            child: Text('Required',
                                style: GoogleFonts.inter(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: const Color(0xFF92400E))),
                          )
                        else
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            margin: const EdgeInsets.only(left: 6),
                            decoration: BoxDecoration(
                                color: AppTheme.lightSurface,
                                borderRadius: BorderRadius.circular(8)),
                            child: Text('If applicable',
                                style: GoogleFonts.inter(
                                    fontSize: 11, color: AppTheme.textMuted)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item.description,
                      style: GoogleFonts.inter(
                          fontSize: 11,
                          color: AppTheme.textSecondary,
                          height: 1.35),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Attached Document Preview OR Submission Button
          if (hasDoc) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.lightSurface,
                borderRadius: BorderRadius.circular(12),
                border:
                    Border.all(color: AppTheme.emeraldGreen.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  Icon(
                      item.attachedDocument!.isPdf
                          ? LucideIcons.fileText
                          : LucideIcons.image,
                      color: AppTheme.emeraldGreen,
                      size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.attachedDocument!.name,
                          style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                              color: AppTheme.textPrimary),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${item.attachedDocument!.formattedSize} · ${item.attachedDocument!.isScanned ? "Scanned with ML Kit" : "Verified File"}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                              fontSize: 11,
                              height: 1.3,
                              color: AppTheme.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Replace document',
                    onPressed: () => _openAcquisitionModal(item),
                    icon: const Icon(LucideIcons.refreshCw,
                        size: 16, color: AppTheme.primaryLight),
                  ),
                  IconButton(
                    tooltip: 'Remove document',
                    onPressed: () => _removeAttachment(item),
                    icon: const Icon(LucideIcons.trash2,
                        size: 16, color: Color(0xFFDC2626)),
                  ),
                ],
              ),
            ),
          ] else ...[
            // The requested submission button on each requirement
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _openAcquisitionModal(item),
                style: OutlinedButton.styleFrom(
                  backgroundColor: AppTheme.lightSurface,
                  side: BorderSide(
                      color: item.isMandatory
                          ? AppTheme.brandDark
                          : AppTheme.lightBorder,
                      width: 1.2),
                  minimumSize: const Size.fromHeight(48),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(LucideIcons.camera,
                    size: 15, color: AppTheme.brandDark),
                label: Text(
                  'Scan or upload document',
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.brandDark),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCertificationsCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.lightBgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.lightBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.shieldCheck,
                  size: 18, color: AppTheme.primaryLight),
              const SizedBox(width: 8),
              Text(
                'Omnibus Sworn Statement & Consent',
                style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.textPrimary),
              ),
            ],
          ),
          const Divider(height: 20, color: AppTheme.lightBorder),

          // 1. Certification of Authenticity & Veracity
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: AppTheme.lightSurface,
                borderRadius: BorderRadius.circular(12)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'CERTIFICATION OF AUTHENTICITY AND VERACITY',
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary),
                ),
                const SizedBox(height: 4),
                Text(
                  'I hereby certify that all information above are true and correct, and of my personal knowledge and belief, and the documents submitted herewith are original and/or certified true copies thereof.',
                  style: GoogleFonts.inter(
                      fontSize: 11, color: AppTheme.textSecondary, height: 1.4),
                ),
                const SizedBox(height: 8),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  value: _omnibusSwornAgreed,
                  activeColor: AppTheme.brandDark,
                  title: Text(
                    'I certify and subscribe to this statement under oath',
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary),
                  ),
                  onChanged: (v) =>
                      setState(() => _omnibusSwornAgreed = v ?? false),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // 2. Data Privacy Consent
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: AppTheme.lightSurface,
                borderRadius: BorderRadius.circular(12)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'DATA PRIVACY CONSENT',
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary),
                ),
                const SizedBox(height: 4),
                Text(
                  'I hereby grant the Department of Education the right to collect and process my personal information as stated above, for purposes relevant to the recruitment, selection, and placement of personnel of the Department and for purposes of compliance with the laws, rules, and regulations being implemented by the Civil Service Commission.',
                  style: GoogleFonts.inter(
                      fontSize: 11, color: AppTheme.textSecondary, height: 1.4),
                ),
                const SizedBox(height: 8),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  value: _dataPrivacyConsentAgreed,
                  activeColor: AppTheme.brandDark,
                  title: Text(
                    'I grant Data Privacy Consent',
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary),
                  ),
                  onChanged: (v) =>
                      setState(() => _dataPrivacyConsentAgreed = v ?? false),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // Legal citation
          Text(
            'In consonance with Republic Act No. 8792 or the "Electronic Commerce Act of 2000", electronic documents submitted herein shall have the legal effect, validity or enforceability as any other legal writing.',
            style: GoogleFonts.inter(
                fontSize: 11,
                color: AppTheme.textMuted,
                fontStyle: FontStyle.italic,
                height: 1.3),
          ),
        ],
      ),
    );
  }
}
