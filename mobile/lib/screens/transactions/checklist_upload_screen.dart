import 'package:flutter/material.dart';
import '../../utils/errors.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:file_picker/file_picker.dart';
import '../../models/personnel_document_model.dart';
import '../../models/transaction_model.dart';
import '../../services/api_service.dart';
import '../../services/personnel_document_service.dart';
import '../../services/transaction_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui_kit.dart';
import '../../utils/display.dart';
import '../../widgets/status_badge.dart';
import '../../widgets/transaction_tracker_card.dart';
import '../../widgets/resume_splash.dart';

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
  // Reviewing OCR-read fields is optional: 100% compliance is enough to submit.

  @override
  void initState() {
    super.initState();
    _currentTx = widget.transaction;
    _transactionService = TransactionService(ApiService());
    _refreshTransaction();
    _autoAttach();
  }

  /// Upload once, reuse everywhere: empty requirements are filled from the
  /// 201 file as soon as the checklist opens.
  Future<void> _autoAttach() async {
    final s = _currentTx.status;
    if (s != TransactionStatus.DRAFT && s != TransactionStatus.RETURNED_BY_AO2) return;
    final added = await _transactionService.autoAttachFrom201(_currentTx.id);
    if (!mounted || added.isEmpty) return;
    await _refreshTransaction();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            'Added ${added.length} document${added.length == 1 ? '' : 's'} from your 201 file. Check them before submitting.')));
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

  /// Offers a file already in the 201 first, or a new upload.
  Future<void> _chooseSource(RequirementItemModel item) async {
    if (_isUploading || _isSubmitting) return;
    List<PersonnelDocument> docs = [];
    try {
      final all = await PersonnelDocumentService(ApiService()).getDocuments();
      const usable = {
        PersonnelDocumentStatus.SUBMITTED,
        PersonnelDocumentStatus.UNDER_REVIEW,
        PersonnelDocumentStatus.APPROVED,
      };
      docs = all.where((d) => d.hasFile && usable.contains(d.status)).toList();
    } catch (_) {}
    if (!mounted) return;
    final picked = await showModalBottomSheet<Object>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: AppTheme.lightBgCard,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints:
              BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.7),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                child: Text(item.documentName,
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary)),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.pop(ctx, 'upload'),
                  icon: const Icon(LucideIcons.upload, size: 16),
                  label: const Text('Upload a new file',
                      style:
                          TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.textPrimary,
                    side: const BorderSide(color: AppTheme.lightBorder),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 18, 20, 8),
                child: Text('FROM YOUR 201 FILES',
                    style: TextStyle(
                        fontSize: 11,
                        letterSpacing: 0.6,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textMuted)),
              ),
              if (docs.isEmpty)
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: Text('No 201 files available to attach.',
                      style:
                          TextStyle(fontSize: 13, color: AppTheme.textMuted)),
                )
              else
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                    itemCount: docs.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 6),
                    itemBuilder: (_, i) {
                      final d = docs[i];
                      return Material(
                        color: AppTheme.lightSurface,
                        borderRadius: BorderRadius.circular(10),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: () => Navigator.pop(ctx, d),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10),
                            child: Row(
                              children: [
                                const Icon(LucideIcons.fileText,
                                    size: 18, color: AppTheme.textSecondary),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(d.documentTypeName,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                              fontSize: 13,
                                              fontWeight: FontWeight.w600,
                                              color: AppTheme.textPrimary)),
                                      const SizedBox(height: 2),
                                      Text(d.originalFileName,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                              fontSize: 11,
                                              color: AppTheme.textMuted)),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Icon(LucideIcons.plus,
                                    size: 18, color: AppTheme.primaryLight),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    if (!mounted || picked == null) return;
    if (picked == 'upload') {
      _pickAndUploadDocument(item);
    } else if (picked is PersonnelDocument) {
      setState(() => _isUploading = true);
      try {
        await _transactionService.attachExistingDocument(
            _currentTx.id, item.id, picked.id);
        await _refreshTransaction();
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(friendlyError(error,
                  fallback: 'That file could not be attached.'))));
        }
      } finally {
        if (mounted) setState(() => _isUploading = false);
      }
    }
  }

  void _pickAndUploadDocument(RequirementItemModel item) async {
    if (_isUploading || _isSubmitting) return;
    final result = await ExternalActivity.run(() => FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    ));
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

  Future<void> _reopenForCorrection() async {
    setState(() => _isSubmitting = true);
    try {
      await _transactionService.reopenTransaction(_currentTx.id);
      await _refreshTransaction();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                'Reopened. Replace the deficient documents, then submit again.')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(friendlyError(error,
                fallback: 'Could not reopen this transaction.'))));
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _handleSubmitTransaction() async {
    // Submission eligibility belongs to this assigned transaction and is enforced by the API.
    if (_isUploading || _currentTx.complianceScore < 100) return;

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
        barrierDismissible: false,
        builder: (ctx) => Dialog(
          backgroundColor: AppTheme.lightBgCard,
          surfaceTintColor: Colors.transparent,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          insetPadding: const EdgeInsets.symmetric(horizontal: 32),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(22, 26, 22, 18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: AppTheme.emeraldGreen.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(LucideIcons.check,
                      color: AppTheme.emeraldGreen, size: 26),
                ),
                const SizedBox(height: 14),
                const Text('Submitted',
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary)),
                const SizedBox(height: 6),
                Text(
                  '${_currentTx.referenceNo} is now with your AO II for review.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 13, height: 1.4, color: AppTheme.textSecondary),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      Navigator.of(context).pop();
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.brandDark,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text('Done',
                        style: TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final tx = _currentTx;
    final canEdit = tx.status == TransactionStatus.DRAFT ||
        tx.status == TransactionStatus.RETURNED_BY_AO2 ||
        tx.status == TransactionStatus.RETURNED_BY_HRMO;
    final returned = tx.status == TransactionStatus.RETURNED_BY_AO2 ||
        tx.status == TransactionStatus.RETURNED_BY_HRMO;
    final disqualified = tx.status == TransactionStatus.REJECTED;
    final ready = tx.complianceScore >= 100;
    final done = tx.requirements.where((r) => r.isUploaded).length;

    return Scaffold(
      appBar: AppBar(title: Text(tx.referenceNo)),
      body: Stack(
        children: [
          ContentWidth(
            child: RefreshIndicator(
              onRefresh: _refreshTransaction,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                    AppSpace.lg, AppSpace.lg, AppSpace.lg, AppSpace.xxxl),
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(humanizeEnum(tx.type.name),
                                  style: AppText.title),
                            ),
                            StatusBadge(status: tx.status),
                          ],
                        ),
                        const SizedBox(height: AppSpace.xs),
                        Text(
                          '$done of ${tx.requirements.length} documents added',
                          style: AppText.caption,
                        ),
                        if (!disqualified) ...[
                          const SizedBox(height: AppSpace.lg),
                          TransactionTrackerCard(transaction: tx),
                        ],
                      ],
                    ),
                  ),
                  if ((returned || disqualified) &&
                      (tx.remarks ?? '').trim().isNotEmpty) ...[
                    const SizedBox(height: AppSpace.md),
                    _Notice(
                      tone: AppStatusTone.danger,
                      title: disqualified
                          ? 'Disqualified'
                          : 'Returned for correction',
                      message: tx.remarks!,
                    ),
                  ],
                  const SizedBox(height: AppSpace.xl),
                  const SectionHeading(title: 'Requirements'),
                  const SizedBox(height: AppSpace.sm),
                  for (final item in tx.requirements) ...[
                    _RequirementCard(
                      item: item,
                      txReturned: returned,
                      canEdit: canEdit,
                      onAdd: () => _chooseSource(item),
                    ),
                    const SizedBox(height: AppSpace.sm),
                  ],
                ],
              ),
            ),
          ),
          if (_isUploading || _isSubmitting)
            const ColoredBox(
              color: Color(0x33000000),
              child: Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
      bottomNavigationBar: disqualified
          ? _BottomAction(
              label: 'Correct & resubmit',
              icon: LucideIcons.rotateCcw,
              onPressed: _isSubmitting ? null : _reopenForCorrection,
            )
          : canEdit
              ? _BottomAction(
                  label: ready
                      ? 'Submit to AO II'
                      : 'Add all required documents (${tx.complianceScore.toInt()}%)',
                  icon: LucideIcons.send,
                  onPressed: ready && !_isUploading && !_isSubmitting
                      ? _handleSubmitTransaction
                      : null,
                )
              : null,
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(
      {required this.tone, required this.title, required this.message});

  final AppStatusTone tone;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: AppRadius.mdAll,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(LucideIcons.alertCircle, size: 18, color: tone.foreground),
          const SizedBox(width: AppSpace.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: AppText.heading
                        .copyWith(fontSize: 14, color: tone.foreground)),
                const SizedBox(height: 2),
                Text(message, style: AppText.body),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RequirementCard extends StatelessWidget {
  const _RequirementCard({
    required this.item,
    required this.txReturned,
    required this.canEdit,
    required this.onAdd,
  });

  final RequirementItemModel item;
  final bool txReturned;
  final bool canEdit;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final deficient =
        item.fileStatus == 'REJECTED' || item.fileStatus == 'DEFICIENT';
    final validated =
        const {'VERIFIED', 'APPROVED', 'VALIDATED'}.contains(item.fileStatus);
    final locked = validated && txReturned;

    final (String label, AppStatusTone tone) = deficient
        ? ('Needs correction', AppStatusTone.danger)
        : validated
            ? ('Validated by AO II', AppStatusTone.success)
            : item.isUploaded
                ? ('Added', AppStatusTone.info)
                : item.isMandatory
                    ? ('Required', AppStatusTone.pending)
                    : ('Optional', AppStatusTone.neutral);

    return AppCard(
      borderColor:
          deficient ? AppTheme.statusReturned.withValues(alpha: 0.5) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(item.documentName, style: AppText.heading)),
              const SizedBox(width: AppSpace.sm),
              StatusPill(label: label, tone: tone),
            ],
          ),
          if (item.description != null &&
              item.description!.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpace.xs),
            Text(item.description!, style: AppText.caption),
          ],
          if (deficient && item.rejectionReason != null) ...[
            const SizedBox(height: AppSpace.sm),
            Text(item.rejectionReason!,
                style: AppText.body.copyWith(color: AppTheme.statusReturned)),
          ],
          if (item.isUploaded && !deficient) ...[
            const SizedBox(height: AppSpace.sm),
            MetaItem(
              icon: LucideIcons.paperclip,
              label: item.uploadedFilePath!.split('/').last,
            ),
          ],
          if (canEdit && !locked) ...[
            const SizedBox(height: AppSpace.md),
            SizedBox(
              width: double.infinity,
              child: deficient || !item.isUploaded
                  ? ElevatedButton.icon(
                      onPressed: onAdd,
                      icon: Icon(
                          deficient ? LucideIcons.refreshCw : LucideIcons.plus,
                          size: 16),
                      label:
                          Text(deficient ? 'Replace document' : 'Add document'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: deficient
                            ? AppTheme.statusReturned
                            : AppTheme.brandDark,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        textStyle: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w700),
                      ),
                    )
                  : OutlinedButton.icon(
                      onPressed: onAdd,
                      icon: const Icon(LucideIcons.refreshCw, size: 16),
                      label: const Text('Replace'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 11),
                        textStyle: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w700),
                      ),
                    ),
            ),
          ],
        ],
      ),
    );
  }
}

class _BottomAction extends StatelessWidget {
  const _BottomAction(
      {required this.label, required this.icon, this.onPressed});

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.lightBgCard,
        border: Border(top: BorderSide(color: AppTheme.lightBorder)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpace.lg, AppSpace.md, AppSpace.lg, AppSpace.md),
          child: SizedBox(
            height: 50,
            child: ElevatedButton.icon(
              onPressed: onPressed,
              icon: Icon(icon, size: 18),
              label: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
              style: ElevatedButton.styleFrom(
                disabledBackgroundColor: AppTheme.lightSurface,
                disabledForegroundColor: AppTheme.textMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
