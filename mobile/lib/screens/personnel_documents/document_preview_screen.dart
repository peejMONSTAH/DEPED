import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdfx/pdfx.dart';

import '../../models/personnel_document_model.dart';
import '../../services/personnel_document_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../utils/display.dart';
import '../../utils/errors.dart';
import '../../widgets/ui_kit.dart';

/// Full-screen preview of an uploaded document.
///
/// The old dialog described a document — status, size, format — without ever
/// showing it, so there was no way to check that the right file had been
/// uploaded against a requirement. This renders the file itself, with the
/// details kept available underneath.
class DocumentPreviewScreen extends StatefulWidget {
  const DocumentPreviewScreen({
    super.key,
    required this.document,
    required this.documentService,
    this.onReplaceRequested,
    this.onDeleteRequested,
  });

  final PersonnelDocument document;
  final PersonnelDocumentService documentService;
  final VoidCallback? onReplaceRequested;
  final VoidCallback? onDeleteRequested;

  @override
  State<DocumentPreviewScreen> createState() => _DocumentPreviewScreenState();
}

class _DocumentPreviewScreenState extends State<DocumentPreviewScreen> {
  Uint8List? _bytes;
  String? _error;
  bool _loading = true;
  PdfControllerPinch? _pdfController;
  bool _openingExternally = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pdfController?.dispose();
    super.dispose();
  }

  /// Removes previously extracted previews, optionally sparing [keep].
  ///
  /// Best-effort: a file the receiving app still holds open cannot be deleted
  /// on some devices, and that must not block opening a document.
  Future<void> _purgePreviews(Directory dir, {String? keep}) async {
    try {
      await for (final entity in dir.list()) {
        if (entity is! File || entity.path == keep) continue;
        try {
          await entity.delete();
        } catch (_) {
          // Still in use elsewhere; it will be cleared with the cache.
        }
      }
    } catch (_) {
      // Listing failed; nothing to clean up.
    }
  }

  /// Writes the document to the app's private cache and hands it to whatever
  /// app on the phone handles the type. Used for formats this app cannot
  /// render, and offered alongside the inline view for everything else.
  Future<void> _openExternally() async {
    final bytes = _bytes;
    if (bytes == null || _openingExternally) return;
    setState(() => _openingExternally = true);
    try {
      // Written to the app's private cache, never to Downloads or any shared
      // folder. These are 201 records — a payslip, a birth certificate, an NBI
      // clearance — and they should not end up in the phone's gallery or file
      // manager where anyone picking up the device can read them. The cache is
      // private to this app, is covered by open_file's FileProvider so the
      // receiving app gets a temporary grant rather than broad access, and is
      // reclaimed by Android under storage pressure.
      final dir = await getTemporaryDirectory();
      final previewDir = Directory('${dir.path}/document_preview');
      if (!await previewDir.exists()) {
        await previewDir.create(recursive: true);
      }

      // Keep the original name so the receiving app shows something meaningful,
      // with the id in front so two documents cannot collide.
      final safeName = widget.document.originalFileName
          .replaceAll(RegExp(r'[^A-Za-z0-9_.-]'), '_');
      final file = File('${previewDir.path}/${widget.document.id}_$safeName');

      // Drop any previously opened document first, so at most one personnel
      // record sits on the device at a time instead of accumulating silently.
      await _purgePreviews(previewDir, keep: file.path);

      await file.writeAsBytes(bytes, flush: true);
      final result = await OpenFile.open(file.path,
          type: widget.document.mimeType.isNotEmpty
              ? widget.document.mimeType
              : null);
      if (!mounted) return;
      if (result.type != ResultType.done) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result.type == ResultType.noAppToOpen
                ? 'No app on this phone can open ${widget.document.mimeType}.'
                : 'This document could not be opened.'),
          ),
        );
      }
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(friendlyError(error,
              fallback: 'This document could not be opened.')),
        ),
      );
    } finally {
      if (mounted) setState(() => _openingExternally = false);
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final bytes =
          await widget.documentService.getDocumentBytes(widget.document.id);
      if (!mounted) return;
      // PDFs are decoded up front so a failure surfaces as an error state
      // rather than a broken viewer.
      PdfControllerPinch? controller;
      if (widget.document.isPdf) {
        controller = PdfControllerPinch(document: PdfDocument.openData(bytes));
      }
      setState(() {
        _bytes = bytes;
        _pdfController = controller;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyError(
          error,
          fallback: 'This document could not be opened. Please try again.',
        );
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final doc = widget.document;

    return Scaffold(
      backgroundColor: AppTheme.lightBg,
      appBar: AppBar(
        title: Text(doc.documentTypeName, style: AppText.title),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, thickness: 1, color: AppTheme.lightBorder),
        ),
      ),
      body: ContentWidth(
        child: Column(
          children: [
            Expanded(child: _buildPreview(doc)),
            _buildDetails(doc),
          ],
        ),
      ),
    );
  }

  Widget _buildPreview(PersonnelDocument doc) {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: AppTheme.primaryLight),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.lg),
          child: EmptyState(
            icon: LucideIcons.fileX,
            title: 'Cannot open this document',
            message: _error!,
            action: ElevatedButton(
              onPressed: _load,
              child: const Text('Try again'),
            ),
          ),
        ),
      );
    }

    if (doc.isImage && _bytes != null) {
      // InteractiveViewer gives pinch-to-zoom and panning, which matters for a
      // scanned credential where the detail is small.
      return InteractiveViewer(
        minScale: 1,
        maxScale: 5,
        child: Center(
          child: Image.memory(
            _bytes!,
            fit: BoxFit.contain,
            errorBuilder: (context, error, stack) => Padding(
              padding: const EdgeInsets.all(AppSpace.lg),
              child: EmptyState(
                icon: LucideIcons.imageOff,
                title: 'This image could not be displayed',
                message:
                    'The file was downloaded but could not be read as an image. It may be corrupted — try replacing it.',
              ),
            ),
          ),
        ),
      );
    }

    if (doc.isPdf && _pdfController != null) {
      return PdfViewPinch(
        controller: _pdfController!,
        onDocumentError: (error) {
          if (!mounted) return;
          setState(() => _error =
              'This PDF could not be read. It may be corrupted - try replacing it.');
        },
      );
    }

    // Anything else: say so plainly rather than showing a blank frame, and
    // offer to hand it to an app that can read it.
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.lg),
        child: EmptyState(
          icon: LucideIcons.fileText,
          title: 'Preview not available for this format',
          message:
              'This app previews images and PDFs. The file is stored safely and can be opened in another app.',
          action: ElevatedButton(
            onPressed: _bytes == null ? null : _openExternally,
            child: const Text('Open in another app'),
          ),
        ),
      ),
    );
  }

  Widget _buildDetails(PersonnelDocument doc) {
    final expired =
        doc.expirationDate != null && isDateInPast(doc.expirationDate!);

    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: AppTheme.lightBgCard,
        border: Border(
          top: BorderSide(color: AppTheme.lightBorder, width: 1),
        ),
      ),
      padding: const EdgeInsets.all(AppSpace.lg),
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    doc.originalFileName,
                    style: AppText.caption,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: AppSpace.sm),
                StatusPill(
                  label: humanizeEnum(doc.status.name),
                  tone: switch (doc.status) {
                    PersonnelDocumentStatus.APPROVED => AppStatusTone.success,
                    PersonnelDocumentStatus.REJECTED => AppStatusTone.danger,
                    _ => AppStatusTone.info,
                  },
                ),
              ],
            ),
            const SizedBox(height: AppSpace.md),
            Wrap(
              spacing: AppSpace.md,
              runSpacing: AppSpace.sm,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                MetaItem(
                  icon: LucideIcons.calendar,
                  label: 'Uploaded ${formatDate(doc.uploadedAt)}',
                ),
                if (doc.expirationDate != null)
                  MetaItem(
                    icon: expired
                        ? LucideIcons.calendarX
                        : LucideIcons.calendarClock,
                    label: expired
                        ? 'Expired ${formatDate(doc.expirationDate)}'
                        : 'Expires ${formatDate(doc.expirationDate)}',
                    tone:
                        expired ? AppStatusTone.danger : AppStatusTone.pending,
                    emphasis: true,
                  ),
                MetaItem(
                  icon: LucideIcons.hardDrive,
                  label: doc.formattedFileSize,
                ),
              ],
            ),
            if (doc.rejectionReason != null &&
                doc.rejectionReason!.trim().isNotEmpty) ...[
              const SizedBox(height: AppSpace.md),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpace.md),
                decoration: BoxDecoration(
                  color: AppStatusTone.danger.background,
                  borderRadius: AppRadius.mdAll,
                ),
                child: Text(
                  doc.rejectionReason!,
                  style:
                      AppText.caption.copyWith(color: AppTheme.statusReturned),
                ),
              ),
            ],
            const SizedBox(height: AppSpace.lg),
            Row(
              children: [
                if (widget.onDeleteRequested != null &&
                    doc.status != PersonnelDocumentStatus.APPROVED)
                  TextButton.icon(
                    onPressed: () {
                      Navigator.of(context).pop();
                      widget.onDeleteRequested!();
                    },
                    icon: const Icon(LucideIcons.trash2,
                        size: 14, color: AppTheme.statusReturned),
                    label: Text(
                      'Delete',
                      style: AppText.caption.copyWith(
                        color: AppTheme.statusReturned,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                if (_bytes != null)
                  TextButton.icon(
                    onPressed: _openingExternally ? null : _openExternally,
                    icon: const Icon(LucideIcons.externalLink,
                        size: 14, color: AppTheme.primaryLight),
                    label: Text(
                      'Open',
                      style: AppText.caption.copyWith(
                        color: AppTheme.primaryLight,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                const Spacer(),
                if (widget.onReplaceRequested != null)
                  OutlinedButton(
                    onPressed: () {
                      Navigator.of(context).pop();
                      widget.onReplaceRequested!();
                    },
                    child: const Text('Replace'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
