import 'package:flutter/material.dart';
import '../../utils/errors.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:file_picker/file_picker.dart';
import '../../models/transaction_model.dart';
import '../../services/api_service.dart';
import '../../services/transaction_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui_kit.dart';
import '../../utils/display.dart';
import '../../widgets/compliance_gauge.dart';
import '../../widgets/status_badge.dart';
import '../../widgets/transaction_tracker_card.dart';

class ChecklistUploadScreen extends StatefulWidget {
  final TransactionModel transaction;

  const ChecklistUploadScreen({Key? key, required this.transaction})
      : super(key: key);

  @override
  State<ChecklistUploadScreen> createState() => _ChecklistUploadScreenState();
}

class _ChecklistUploadScreenState extends State<ChecklistUploadScreen> {
  late TransactionModel _currentTx;
  late final TransactionService _transactionService;
  bool _isUploading = false;
  bool _isSubmitting = false;
  bool _unavailableDialogShown = false;

  @override
  void initState() {
    super.initState();
    _currentTx = widget.transaction;
    _transactionService = TransactionService(ApiService());
    _refreshTransaction();
  }

  Future<void> _refreshTransaction() async {
    try {
      final fresh = await _transactionService.getTransaction(_currentTx.id);
      if (mounted) setState(() => _currentTx = fresh);
    } on TransactionUnavailableException catch (error) {
      if (!mounted || _unavailableDialogShown) return;
      _unavailableDialogShown = true;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Transaction unavailable'),
          content: Text(
            '${error.message} The outdated saved copy has been removed.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Back to transactions'),
            ),
          ],
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'The transaction could not be refreshed. Check your connection and try again.',
            ),
          ),
        );
      }
    }
  }

  void _pickAndUploadDocument(RequirementItemModel item) async {
    if (_isUploading || _isSubmitting) return;
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    );
    if (result == null || !mounted) return;
    final filePath = result.files.single.path;
    if (filePath == null) return;
    setState(() => _isUploading = true);
    try {
      await _transactionService.uploadDocument(
          _currentTx.id, item.id, filePath);
      await _refreshTransaction();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(friendlyError(error,
                fallback:
                    'That file could not be uploaded. Please try again.')),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  void _handleSubmitTransaction() async {
    if (_currentTx.type == TransactionType.PROMOTION) {
      final promoStatus = await _transactionService.checkPromotionStatus();
      if (promoStatus['isPromoted'] != true &&
          promoStatus['isPendingApproval'] != true) {
        if (!mounted) return;
        showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            icon: const Icon(LucideIcons.triangleAlert,
                color: Colors.redAccent, size: 44),
            title: Text(
              'Promotion Eligibility Check',
              style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.bold, fontSize: 15),
            ),
            content: Text(
              promoStatus['message'] ??
                  'You are ineligible yet. Selection by HRMO in an active Promotion Cycle is required before submitting Promotion Appointment documents.',
              style: GoogleFonts.inter(fontSize: 13),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
        return;
      }
    }

    if (_isSubmitting) return;
    setState(() => _isSubmitting = true);
    try {
      await _transactionService.submitTransaction(_currentTx.id,
          type: _currentTx.type);
    } catch (err) {
      debugPrint('Submit transaction notice: $err');
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            err
                .toString()
                .replaceFirst(RegExp(r'^(Exception|Bad state):\s*'), ''),
          ),
          backgroundColor: AppTheme.statusReturned,
        ),
      );
      return;
    }

    await _refreshTransaction();
    _isSubmitting = false;
    if (mounted) setState(() {});

    if (mounted) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(LucideIcons.checkCircle2,
              color: AppTheme.emeraldGreen, size: 48),
          title: const Text('Transaction Submitted!'),
          content: Text(
            'Your 201 transaction (${_currentTx.referenceNo}) has been submitted to your AO II for initial validation.',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                Navigator.of(context).pop();
              },
              child: const Text('Return to Home'),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final canEdit = _currentTx.status == TransactionStatus.DRAFT ||
        _currentTx.status == TransactionStatus.RETURNED_BY_AO2 ||
        _currentTx.status == TransactionStatus.RETURNED_BY_HRMO;

    return Scaffold(
      appBar: AppBar(
        title: Text(_currentTx.referenceNo),
        actions: [],
      ),
      body: Stack(
        children: [
          ContentWidth(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Top Status & Compliance Card
                  Card(
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: const BorderSide(color: AppTheme.lightBorder),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(18.0),
                      child: Row(
                        children: [
                          ComplianceGauge(
                              score: _currentTx.complianceScore, radius: 36),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  humanizeEnum(_currentTx.type.name),
                                  style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.bold,
                                      color: AppTheme.textPrimary),
                                ),
                                const SizedBox(height: 6),
                                StatusBadge(status: _currentTx.status),
                                const SizedBox(height: 6),
                                Text(
                                  _currentTx.complianceScore >= 100.0
                                      ? 'Ready for AO II Submission'
                                      : 'Upload all mandatory requirements below',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: _currentTx.complianceScore >= 100.0
                                        ? AppTheme.emeraldGreen
                                        : AppTheme.textMuted,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Live 4-Stage Transaction Tracking Stepper
                  TransactionTrackerCard(transaction: _currentTx),

                  // Return Remarks Banner if returned by AO II / HRMO
                  if (_currentTx.status == TransactionStatus.RETURNED_BY_AO2 ||
                      _currentTx.status == TransactionStatus.RETURNED_BY_HRMO)
                    Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppTheme.statusReturned.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.statusReturned),
                      ),
                      child: Row(
                        children: [
                          const Icon(LucideIcons.alertTriangle,
                              color: AppTheme.statusReturned),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Remarks: ${_currentTx.remarks ?? "Please re-upload missing or unauthenticated PDF documents."}',
                              style: const TextStyle(
                                  fontSize: 13,
                                  color: AppTheme.statusReturned,
                                  fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                    ),

                  // Dynamic Checklist Section Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Expanded(
                        child: Text(
                          'Dynamic Requirement Checklist',
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.textPrimary),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),

                  ListView.builder(
                    shrinkWrap: true,
                    // A nested ListView with no explicit padding inherits the
                    // MediaQuery vertical inset, which injects the bottom nav bar
                    // height as blank space in the middle of the page.
                    padding: EdgeInsets.zero,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _currentTx.requirements.length,
                    itemBuilder: (ctx, index) {
                      final item = _currentTx.requirements[index];
                      final isDeficient = item.fileStatus == 'REJECTED' ||
                          item.fileStatus == 'DEFICIENT';
                      final isApproved = (item.fileStatus == 'VERIFIED' ||
                              item.fileStatus == 'APPROVED' ||
                              item.fileStatus == 'VALIDATED' ||
                              item.fileStatus == 'OCR_REVIEWED') &&
                          (_currentTx.status ==
                                  TransactionStatus.RETURNED_BY_AO2 ||
                              _currentTx.status ==
                                  TransactionStatus.RETURNED_BY_HRMO);

                      return Card(
                        elevation: 0,
                        margin: const EdgeInsets.only(bottom: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(
                            color: isDeficient
                                ? AppTheme.statusReturned
                                : (isApproved
                                    ? AppTheme.emeraldGreen.withOpacity(0.5)
                                    : AppTheme.lightBorder),
                            width: isDeficient || isApproved ? 1.5 : 1.0,
                          ),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(14.0),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                isDeficient
                                    ? LucideIcons.alertCircle
                                    : (item.isUploaded
                                        ? LucideIcons.checkCircle2
                                        : LucideIcons.circle),
                                color: isDeficient
                                    ? AppTheme.statusReturned
                                    : (item.isUploaded
                                        ? AppTheme.emeraldGreen
                                        : AppTheme.textMuted),
                                size: 24,
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            item.documentName,
                                            style: const TextStyle(
                                                fontWeight: FontWeight.bold,
                                                fontSize: 15,
                                                color: AppTheme.textPrimary),
                                          ),
                                        ),
                                        if (isDeficient)
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 6, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: AppTheme.statusReturned
                                                  .withOpacity(0.15),
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                            ),
                                            child: const Text(
                                              'DEFICIENT — Action Required',
                                              style: TextStyle(
                                                  fontSize: 11,
                                                  color:
                                                      AppTheme.statusReturned,
                                                  fontWeight: FontWeight.bold),
                                            ),
                                          )
                                        else if (isApproved)
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 6, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: AppTheme.emeraldGreen
                                                  .withOpacity(0.15),
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                            ),
                                            child: const Text(
                                              'APPROVED by AO II',
                                              style: TextStyle(
                                                  fontSize: 11,
                                                  color: AppTheme.emeraldGreen,
                                                  fontWeight: FontWeight.bold),
                                            ),
                                          )
                                        else if (item.isMandatory)
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 6, vertical: 2),
                                            decoration: BoxDecoration(
                                              color:
                                                  Colors.red.withOpacity(0.1),
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                            ),
                                            child: const Text(
                                              'MANDATORY',
                                              style: TextStyle(
                                                  fontSize: 11,
                                                  color: Colors.red,
                                                  fontWeight: FontWeight.bold),
                                            ),
                                          ),
                                      ],
                                    ),
                                    if (item.description != null) ...[
                                      const SizedBox(height: 2),
                                      Text(item.description!,
                                          style: const TextStyle(
                                              fontSize: 11,
                                              color: AppTheme.textSecondary)),
                                    ],
                                    if (isDeficient &&
                                        item.rejectionReason != null) ...[
                                      const SizedBox(height: 6),
                                      Container(
                                        padding: const EdgeInsets.all(8),
                                        decoration: BoxDecoration(
                                          color: AppTheme.statusReturned
                                              .withOpacity(0.1),
                                          borderRadius:
                                              BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          item.rejectionReason!,
                                          style: const TextStyle(
                                              fontSize: 11,
                                              color: AppTheme.statusReturned,
                                              fontWeight: FontWeight.bold),
                                        ),
                                      ),
                                    ],
                                    if (item.isUploaded && !isDeficient) ...[
                                      const SizedBox(height: 6),
                                      Row(
                                        children: [
                                          const Icon(LucideIcons.fileCheck,
                                              size: 14,
                                              color: AppTheme.primaryLight),
                                          const SizedBox(width: 4),
                                          Expanded(
                                            child: Text(
                                              item.uploadedFilePath!,
                                              style: const TextStyle(
                                                  fontSize: 12,
                                                  color: AppTheme.primaryLight,
                                                  fontWeight: FontWeight.w600),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              const SizedBox(width: 10),
                              if (canEdit && !isApproved)
                                ElevatedButton(
                                  onPressed: () => _pickAndUploadDocument(item),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: isDeficient
                                        ? AppTheme.statusReturned
                                        : (item.isUploaded
                                            ? AppTheme.lightSurface
                                            : AppTheme.brandDark),
                                    foregroundColor: isDeficient
                                        ? Colors.white
                                        : (item.isUploaded
                                            ? AppTheme.textPrimary
                                            : Colors.white),
                                    side: item.isUploaded && !isDeficient
                                        ? const BorderSide(
                                            color: AppTheme.lightBorder)
                                        : null,
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 8),
                                    elevation: 0,
                                  ),
                                  child: Text(isDeficient
                                      ? 'Fix & Upload'
                                      : (item.isUploaded
                                          ? 'Replace'
                                          : 'Upload')),
                                ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
          if (_isUploading || _isSubmitting)
            Container(
              color: Colors.black26,
              child: const Center(
                child: Card(
                  child: Padding(
                    padding: EdgeInsets.all(24.0),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircularProgressIndicator(),
                        SizedBox(height: 16),
                        Text('Processing request...',
                            style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: AppTheme.textPrimary)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: canEdit
          ? Container(
              padding: const EdgeInsets.only(
                  left: 16, right: 16, top: 12, bottom: 16),
              decoration: BoxDecoration(
                color: AppTheme.lightBgCard,
                border: const Border(
                    top: BorderSide(color: AppTheme.lightBorder, width: 1)),
              ),
              child: SafeArea(
                child: Container(
                  height: 48,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    gradient: LinearGradient(
                      colors: _currentTx.complianceScore >= 100.0
                          ? const [Color(0xFF059669), Color(0xFF10B981)]
                          : const [Color(0xFFD97706), Color(0xFFEAB308)],
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: (_currentTx.complianceScore >= 100.0
                                ? const Color(0xFF10B981)
                                : const Color(0xFFEAB308))
                            .withOpacity(0.25),
                        blurRadius: 8,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: _handleSubmitTransaction,
                      child: Center(
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(LucideIcons.send,
                                color: Colors.white, size: 16),
                            const SizedBox(width: 8),
                            Text(
                              _currentTx.complianceScore >= 100.0
                                  ? 'Submit to AO II for Validation'
                                  : 'Submit for Validation (${_currentTx.complianceScore.toInt()}% Compliant)',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                                letterSpacing: 0.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : null,
    );
  }
}
