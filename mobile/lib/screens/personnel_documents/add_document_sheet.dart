import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_document_model.dart';
import '../../services/acquisition/document_acquisition_service.dart';
import '../../services/personnel_document_service.dart';
import '../../theme/app_theme.dart';

class AddDocumentSheet extends StatefulWidget {
  final PersonnelDocumentService documentService;
  final DocumentAcquisitionService acquisitionService;
  final PersonnelDocument? documentToReplace;
  final VoidCallback onDocumentUploaded;

  const AddDocumentSheet({
    Key? key,
    required this.documentService,
    required this.acquisitionService,
    this.documentToReplace,
    required this.onDocumentUploaded,
  }) : super(key: key);

  @override
  State<AddDocumentSheet> createState() => _AddDocumentSheetState();
}

class _AddDocumentSheetState extends State<AddDocumentSheet> {
  final _formKey = GlobalKey<FormState>();

  List<DocumentTypeConfig> _documentTypes = DocumentTypeConfig.defaultTypes;
  String? _selectedTypeId;
  final TextEditingController _customNameController = TextEditingController();
  final TextEditingController _remarksController = TextEditingController();

  DateTime? _issueDate;
  DateTime? _expirationDate;

  AcquiredDocument? _acquiredDocument;
  int _selectedPageIndex = 0;

  UploadStateInfo _uploadState = const UploadStateInfo(state: UploadProgressState.idle);

  bool get isReplacing => widget.documentToReplace != null;

  @override
  void initState() {
    super.initState();
    _loadDocumentTypes();

    if (isReplacing) {
      final doc = widget.documentToReplace!;
      _selectedTypeId = doc.documentTypeId;
      if (doc.documentTypeId == 'OTHER') {
        _customNameController.text = doc.documentTypeName;
      }
      if (doc.issueDate != null) {
        _issueDate = DateTime.tryParse(doc.issueDate!);
      }
      if (doc.expirationDate != null) {
        _expirationDate = DateTime.tryParse(doc.expirationDate!);
      }
      _remarksController.text = doc.remarks ?? '';
    } else {
      _selectedTypeId = 'GOV_ID';
    }
  }

  @override
  void dispose() {
    _customNameController.dispose();
    _remarksController.dispose();
    super.dispose();
  }

  Future<void> _loadDocumentTypes() async {
    try {
      final types = await widget.documentService.getDocumentTypes();
      if (mounted && types.isNotEmpty) {
        setState(() {
          _documentTypes = types;
          if (_selectedTypeId == null || !_documentTypes.any((t) => t.id == _selectedTypeId)) {
            _selectedTypeId = _documentTypes.first.id;
          }
        });
      }
    } catch (_) {}
  }

  DocumentTypeConfig? get _selectedTypeConfig {
    if (_selectedTypeId == null) return null;
    return _documentTypes.firstWhere(
      (t) => t.id == _selectedTypeId,
      orElse: () => _documentTypes.first,
    );
  }

  bool get _supportsExpiration => _selectedTypeConfig?.supportsExpiration ?? false;

  Future<void> _handleScanDocument() async {
    if (_uploadState.isBusy) return;

    setState(() {
      _uploadState = const UploadStateInfo(
        state: UploadProgressState.scanning,
        message: 'Launching scanner...',
      );
    });

    try {
      final acquired = await widget.acquisitionService.scanDocument(pageLimit: 10);
      if (!mounted) return;

      if (acquired == null) {
        // User cancelled scan
        setState(() {
          _uploadState = const UploadStateInfo(state: UploadProgressState.idle);
        });
        return;
      }

      // Validate
      final validation = widget.acquisitionService.validateDocument(acquired);
      if (!validation.isValid) {
        setState(() {
          _uploadState = UploadStateInfo(
            state: UploadProgressState.error,
            errorMessage: validation.errorMessage ?? 'Validation failed.',
          );
        });
        return;
      }

      setState(() {
        _acquiredDocument = acquired;
        _selectedPageIndex = 0;
        _uploadState = const UploadStateInfo(
          state: UploadProgressState.ready,
          message: 'Document scanned and verified.',
        );
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _uploadState = UploadStateInfo(
          state: UploadProgressState.error,
          errorMessage: e.toString().replaceAll('Exception:', '').trim(),
        );
      });
    }
  }

  Future<void> _handleUploadDocument() async {
    if (_uploadState.isBusy) return;

    setState(() {
      _uploadState = const UploadStateInfo(
        state: UploadProgressState.selecting,
        message: 'Selecting document...',
      );
    });

    try {
      final acquired = await widget.acquisitionService.pickDocument();
      if (!mounted) return;

      if (acquired == null) {
        // Selection cancelled
        setState(() {
          _uploadState = const UploadStateInfo(state: UploadProgressState.idle);
        });
        return;
      }

      final validation = widget.acquisitionService.validateDocument(acquired);
      if (!validation.isValid) {
        setState(() {
          _uploadState = UploadStateInfo(
            state: UploadProgressState.error,
            errorMessage: validation.errorMessage ?? 'Unsupported document format or size.',
          );
        });
        return;
      }

      setState(() {
        _acquiredDocument = acquired;
        _selectedPageIndex = 0;
        _uploadState = const UploadStateInfo(
          state: UploadProgressState.ready,
          message: 'File ready for submission.',
        );
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _uploadState = UploadStateInfo(
          state: UploadProgressState.error,
          errorMessage: e.toString().replaceAll('Exception:', '').trim(),
        );
      });
    }
  }

  void _removePage(int pageIdx) {
    if (_acquiredDocument == null) return;
    final paths = List<String>.from(_acquiredDocument!.pagePaths);
    final bytesList = List<Uint8List>.from(_acquiredDocument!.pageBytes);

    if (pageIdx >= 0 && pageIdx < paths.length) {
      paths.removeAt(pageIdx);
    }
    if (pageIdx >= 0 && pageIdx < bytesList.length) {
      bytesList.removeAt(pageIdx);
    }

    if (paths.isEmpty && bytesList.isEmpty) {
      setState(() {
        _acquiredDocument = null;
        _uploadState = const UploadStateInfo(state: UploadProgressState.idle);
      });
      return;
    }

    setState(() {
      _acquiredDocument = AcquiredDocument(
        name: _acquiredDocument!.name,
        bytes: bytesList.isNotEmpty ? bytesList.first : null,
        path: paths.isNotEmpty ? paths.first : null,
        mimeType: _acquiredDocument!.mimeType,
        sizeBytes: bytesList.fold<int>(0, (sum, b) => sum + b.length),
        pageCount: paths.isNotEmpty ? paths.length : bytesList.length,
        isScanned: _acquiredDocument!.isScanned,
        pagePaths: paths,
        pageBytes: bytesList,
      );
      if (_selectedPageIndex >= _acquiredDocument!.pageCount) {
        _selectedPageIndex = (_acquiredDocument!.pageCount - 1).clamp(0, 999);
      }
    });
  }

  Future<void> _handleSubmit() async {
    if (_uploadState.isBusy) return;

    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_acquiredDocument == null && !isReplacing) {
      setState(() {
        _uploadState = const UploadStateInfo(
          state: UploadProgressState.error,
          errorMessage: 'Please scan or upload a document before submitting.',
        );
      });
      return;
    }

    setState(() {
      _uploadState = const UploadStateInfo(
        state: UploadProgressState.uploading,
        progress: 0.05,
        message: 'Uploading document... 5%',
      );
    });

    try {
      final issueStr = _issueDate != null ? DateFormat('yyyy-MM-dd').format(_issueDate!) : null;
      final expStr = (_supportsExpiration && _expirationDate != null)
          ? DateFormat('yyyy-MM-dd').format(_expirationDate!)
          : null;

      if (isReplacing) {
        await widget.documentService.replaceDocument(
          documentId: widget.documentToReplace!.id,
          document: _acquiredDocument,
          documentTypeId: _selectedTypeId,
          customDocumentName: _customNameController.text.trim(),
          issueDate: issueStr,
          expirationDate: expStr,
          remarks: _remarksController.text.trim(),
          onProgress: (p) {
            if (mounted) {
              final pct = (p * 100).clamp(0, 100).toInt();
              setState(() {
                _uploadState = UploadStateInfo(
                  state: UploadProgressState.uploading,
                  progress: p,
                  message: 'Uploading document... $pct%',
                );
              });
            }
          },
        );
      } else {
        await widget.documentService.uploadDocument(
          document: _acquiredDocument!,
          documentTypeId: _selectedTypeId!,
          customDocumentName: _customNameController.text.trim(),
          issueDate: issueStr,
          expirationDate: expStr,
          remarks: _remarksController.text.trim(),
          onProgress: (p) {
            if (mounted) {
              final pct = (p * 100).clamp(0, 100).toInt();
              setState(() {
                _uploadState = UploadStateInfo(
                  state: UploadProgressState.uploading,
                  progress: p,
                  message: 'Uploading document... $pct%',
                );
              });
            }
          },
        );
      }

      if (!mounted) return;

      setState(() {
        _uploadState = const UploadStateInfo(
          state: UploadProgressState.success,
          progress: 1.0,
          message: 'Document uploaded successfully.',
        );
      });

      widget.onDocumentUploaded();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(LucideIcons.checkCircle2, color: Colors.white, size: 20),
              const SizedBox(width: 10),
              Text(
                'Document uploaded successfully.',
                style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, color: Colors.white),
              ),
            ],
          ),
          backgroundColor: AppTheme.emeraldGreen,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );

      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _uploadState = UploadStateInfo(
          state: UploadProgressState.error,
          errorMessage: e.toString().replaceAll('Exception:', '').trim(),
        );
      });
    }
  }

  Future<void> _pickDate({required bool isIssueDate}) async {
    final now = DateTime.now();
    final initialDate = isIssueDate
        ? (_issueDate ?? now)
        : (_expirationDate ?? now.add(const Duration(days: 365)));

    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(1950),
      lastDate: DateTime(2050),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.light(
              primary: AppTheme.brandDark,
              onPrimary: Colors.white,
              onSurface: AppTheme.textPrimary,
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked != null && mounted) {
      setState(() {
        if (isIssueDate) {
          _issueDate = picked;
        } else {
          _expirationDate = picked;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.90,
      ),
      decoration: const BoxDecoration(
        color: AppTheme.lightBg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          // Drag Handle & Header
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.lightBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isReplacing ? 'Replace Document' : 'Add Document',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      'Personnel 201 File Compliance Record',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
                IconButton(
                  onPressed: _uploadState.isBusy ? null : () => Navigator.of(context).pop(),
                  icon: const Icon(LucideIcons.x, size: 20),
                  style: IconButton.styleFrom(
                    backgroundColor: AppTheme.lightBgCard,
                    side: const BorderSide(color: AppTheme.lightBorder),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppTheme.lightBorder),

          // Scrollable Content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Error Message Banner if any
                    if (_uploadState.errorMessage != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEE2E2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFFCA5A5)),
                        ),
                        child: Row(
                          children: [
                            const Icon(LucideIcons.alertCircle, color: Color(0xFFDC2626), size: 20),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _uploadState.errorMessage!,
                                style: GoogleFonts.inter(
                                  color: const Color(0xFF991B1B),
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    // 1. Document Type Dropdown
                    Text(
                      'Document Type *',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: AppTheme.lightBgCard,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppTheme.lightBorder),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedTypeId,
                          isExpanded: true,
                          icon: const Icon(LucideIcons.chevronDown, size: 18, color: AppTheme.textMuted),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textPrimary,
                          ),
                          onChanged: _uploadState.isBusy
                              ? null
                              : (newVal) {
                                  if (newVal != null) {
                                    setState(() => _selectedTypeId = newVal);
                                  }
                                },
                          items: _documentTypes.map((type) {
                            return DropdownMenuItem<String>(
                              value: type.id,
                              child: Row(
                                children: [
                                  Icon(type.icon, size: 16, color: AppTheme.primaryLight),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      type.name,
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w600,
                                        color: AppTheme.textPrimary,
                                      ),
                                    ),
                                  ),
                                  if (type.supportsExpiration)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AppTheme.accentGold.withOpacity(0.12),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        'Expires',
                                        style: GoogleFonts.inter(
                                          fontSize: 9.5,
                                          fontWeight: FontWeight.bold,
                                          color: const Color(0xFFB45309),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Custom Document Name (Shown only when 'OTHER' is selected)
                    if (_selectedTypeId == 'OTHER') ...[
                      Text(
                        'Document Name *',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _customNameController,
                        enabled: !_uploadState.isBusy,
                        decoration: InputDecoration(
                          hintText: 'e.g. Special Order No. 42, Certification of Eligibility',
                          hintStyle: GoogleFonts.inter(fontSize: 13, color: AppTheme.textMuted),
                          filled: true,
                          fillColor: AppTheme.lightBgCard,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(color: AppTheme.lightBorder),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(color: AppTheme.lightBorder),
                          ),
                        ),
                        validator: (value) {
                          if (_selectedTypeId == 'OTHER' && (value == null || value.trim().isEmpty)) {
                            return 'Please enter document name';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                    ],

                    // 2. Dates Row (Issue Date & Expiration Date)
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Issue Date',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.textPrimary,
                                ),
                              ),
                              const SizedBox(height: 6),
                              InkWell(
                                onTap: _uploadState.isBusy ? null : () => _pickDate(isIssueDate: true),
                                borderRadius: BorderRadius.circular(14),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                                  decoration: BoxDecoration(
                                    color: AppTheme.lightBgCard,
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(color: AppTheme.lightBorder),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(LucideIcons.calendar, size: 16, color: AppTheme.textMuted),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          _issueDate != null
                                              ? DateFormat('MMM dd, yyyy').format(_issueDate!)
                                              : 'Select date',
                                          style: GoogleFonts.inter(
                                            fontSize: 13,
                                            color: _issueDate != null ? AppTheme.textPrimary : AppTheme.textMuted,
                                            fontWeight: _issueDate != null ? FontWeight.w600 : FontWeight.normal,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (_supportsExpiration) ...[
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Expiration Date',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                InkWell(
                                  onTap: _uploadState.isBusy ? null : () => _pickDate(isIssueDate: false),
                                  borderRadius: BorderRadius.circular(14),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                                    decoration: BoxDecoration(
                                      color: AppTheme.lightBgCard,
                                      borderRadius: BorderRadius.circular(14),
                                      border: Border.all(color: AppTheme.lightBorder),
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(LucideIcons.calendarClock, size: 16, color: AppTheme.accentGold),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            _expirationDate != null
                                                ? DateFormat('MMM dd, yyyy').format(_expirationDate!)
                                                : 'Select date',
                                            style: GoogleFonts.inter(
                                              fontSize: 13,
                                              color: _expirationDate != null ? AppTheme.textPrimary : AppTheme.textMuted,
                                              fontWeight: _expirationDate != null ? FontWeight.w600 : FontWeight.normal,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 14),

                    // 3. Remarks
                    Text(
                      'Remarks (Optional)',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _remarksController,
                      enabled: !_uploadState.isBusy,
                      maxLines: 2,
                      decoration: InputDecoration(
                        hintText: 'Additional notes or remarks regarding this document...',
                        hintStyle: GoogleFonts.inter(fontSize: 12.5, color: AppTheme.textMuted),
                        filled: true,
                        fillColor: AppTheme.lightBgCard,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: AppTheme.lightBorder),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: AppTheme.lightBorder),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),

                    // 4. Document Acquisition Cards (if no file chosen yet)
                    if (_acquiredDocument == null) ...[
                      Text(
                        'Document Source',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 10),

                      // Scan Option
                      InkWell(
                        onTap: _uploadState.isBusy ? null : _handleScanDocument,
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppTheme.lightBgCard,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppTheme.primaryLight.withOpacity(0.4), width: 1.5),
                            boxShadow: const [
                              BoxShadow(color: Color(0x06000000), blurRadius: 10, offset: Offset(0, 3)),
                            ],
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: AppTheme.primaryLight.withOpacity(0.1),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(LucideIcons.camera, color: AppTheme.primaryLight, size: 24),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text(
                                          'Scan Document',
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 15,
                                            fontWeight: FontWeight.bold,
                                            color: AppTheme.textPrimary,
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: AppTheme.accentLime.withOpacity(0.3),
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: Text(
                                            kIsWeb ? 'Camera' : 'ML Kit Enhanced',
                                            style: GoogleFonts.inter(
                                              fontSize: 9,
                                              fontWeight: FontWeight.bold,
                                              color: AppTheme.brandDark,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      kIsWeb
                                          ? 'Capture document using device/browser camera'
                                          : 'Scan physical document with edge detection & auto-crop',
                                      style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textSecondary),
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(LucideIcons.chevronRight, size: 18, color: AppTheme.textMuted),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),

                      Center(
                        child: Text(
                          'OR',
                          style: GoogleFonts.inter(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.textMuted,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Upload File Option
                      InkWell(
                        onTap: _uploadState.isBusy ? null : _handleUploadDocument,
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppTheme.lightBgCard,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppTheme.lightBorder, width: 1.2),
                            boxShadow: const [
                              BoxShadow(color: Color(0x06000000), blurRadius: 10, offset: Offset(0, 3)),
                            ],
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: AppTheme.brandDark.withOpacity(0.08),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(LucideIcons.uploadCloud, color: AppTheme.brandDark, size: 24),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Upload Document',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 15,
                                        fontWeight: FontWeight.bold,
                                        color: AppTheme.textPrimary,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      'PDF, JPG, JPEG, or PNG · Maximum 10 MB',
                                      style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textSecondary),
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(LucideIcons.chevronRight, size: 18, color: AppTheme.textMuted),
                            ],
                          ),
                        ),
                      ),
                    ] else ...[
                      // 5. In-App Document Preview
                      _buildDocumentPreviewCard(),
                    ],

                    const SizedBox(height: 24),

                    // 6. Upload Progress Display
                    if (_uploadState.state == UploadProgressState.uploading) ...[
                      Container(
                        padding: const EdgeInsets.all(14),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: AppTheme.lightBgCard,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppTheme.lightBorder),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  _uploadState.message,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                    color: AppTheme.textPrimary,
                                  ),
                                ),
                                Text(
                                  '${(_uploadState.progress * 100).toInt()}%',
                                  style: GoogleFonts.jetBrainsMono(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                    color: AppTheme.primaryLight,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            LinearProgressIndicator(
                              value: _uploadState.progress > 0 ? _uploadState.progress : null,
                              backgroundColor: AppTheme.lightSurface,
                              color: AppTheme.primaryLight,
                              minHeight: 6,
                              borderRadius: BorderRadius.circular(6),
                            ),
                          ],
                        ),
                      ),
                    ],

                    // Action Buttons (Submit / Cancel)
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _uploadState.isBusy ? null : () => Navigator.of(context).pop(),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              side: const BorderSide(color: AppTheme.lightBorder),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            ),
                            child: Text(
                              'Cancel',
                              style: GoogleFonts.inter(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.textSecondary,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: ElevatedButton.icon(
                            onPressed: (_uploadState.isBusy || (_acquiredDocument == null && !isReplacing))
                                ? null
                                : _handleSubmit,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.brandDark,
                              foregroundColor: Colors.white,
                              disabledBackgroundColor: AppTheme.lightBorder,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              elevation: 0,
                            ),
                            icon: _uploadState.isBusy
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                  )
                                : const Icon(LucideIcons.check, size: 16, color: Colors.white),
                            label: Text(
                              isReplacing ? 'Confirm Replace' : 'Submit Document',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13.5,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// High-fidelity preview container for scanned and uploaded files
  Widget _buildDocumentPreviewCard() {
    final doc = _acquiredDocument!;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.lightBgCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.lightBorder),
        boxShadow: const [
          BoxShadow(color: Color(0x06000000), blurRadius: 10, offset: Offset(0, 3)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.eye, size: 16, color: AppTheme.primaryLight),
                  const SizedBox(width: 6),
                  Text(
                    'DOCUMENT PREVIEW',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.textPrimary,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
              if (doc.isScanned)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.emeraldGreen.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'Scanned via ML Kit',
                    style: GoogleFonts.inter(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.emeraldGreen,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),

          // Preview Area
          if (doc.isPdf) ...[
            // PDF Preview Badge
            Container(
              height: 140,
              width: double.infinity,
              decoration: BoxDecoration(
                color: AppTheme.lightSurface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppTheme.lightBorder),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444).withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(LucideIcons.fileText, color: Color(0xFFDC2626), size: 36),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    doc.name,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'PDF Document · ${doc.pageCount} ${doc.pageCount == 1 ? "page" : "pages"} · ${doc.formattedSize}',
                    style: GoogleFonts.inter(fontSize: 11.5, color: AppTheme.textSecondary),
                  ),
                ],
              ),
            ),
          ] else if (doc.isImage) ...[
            // Image Preview (with multi-page support)
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Container(
                height: 200,
                width: double.infinity,
                color: const Color(0xFF1E293B),
                child: Center(
                  child: _buildImagePageWidget(doc, _selectedPageIndex),
                ),
              ),
            ),

            // Multi-page thumbnails carousel
            if (doc.pageCount > 1) ...[
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Pages (${doc.pageCount})',
                    style: GoogleFonts.inter(fontSize: 11.5, fontWeight: FontWeight.bold, color: AppTheme.textSecondary),
                  ),
                  Text(
                    'Viewing Page ${_selectedPageIndex + 1}',
                    style: GoogleFonts.inter(fontSize: 11, color: AppTheme.primaryLight, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 70,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: doc.pageCount,
                  itemBuilder: (ctx, idx) {
                    final isSelected = idx == _selectedPageIndex;
                    return GestureDetector(
                      onTap: () => setState(() => _selectedPageIndex = idx),
                      child: Container(
                        width: 54,
                        margin: const EdgeInsets.only(right: 8),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: isSelected ? AppTheme.primaryLight : AppTheme.lightBorder,
                            width: isSelected ? 2.0 : 1.0,
                          ),
                        ),
                        child: Stack(
                          children: [
                            Positioned.fill(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(6),
                                child: _buildThumbnailWidget(doc, idx),
                              ),
                            ),
                            Positioned(
                              top: 2,
                              left: 2,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                decoration: BoxDecoration(
                                  color: Colors.black.withOpacity(0.6),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  'P${idx + 1}',
                                  style: GoogleFonts.inter(fontSize: 8, color: Colors.white, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ),
                            if (doc.pageCount > 1)
                              Positioned(
                                top: 2,
                                right: 2,
                                child: GestureDetector(
                                  onTap: () => _removePage(idx),
                                  child: Container(
                                    padding: const EdgeInsets.all(2),
                                    decoration: const BoxDecoration(
                                      color: Color(0xFFDC2626),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(LucideIcons.x, size: 8, color: Colors.white),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ],

          const SizedBox(height: 12),
          // File Details Row
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      doc.name,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      '${doc.formattedSize} · ${doc.mimeType}',
                      style: GoogleFonts.inter(fontSize: 11, color: AppTheme.textSecondary),
                    ),
                  ],
                ),
              ),
              // Action buttons: Scan Again / Replace / Remove
              Row(
                children: [
                  TextButton.icon(
                    onPressed: _uploadState.isBusy
                        ? null
                        : () {
                            if (doc.isScanned) {
                              _handleScanDocument();
                            } else {
                              _handleUploadDocument();
                            }
                          },
                    icon: const Icon(LucideIcons.refreshCw, size: 12, color: AppTheme.primaryLight),
                    label: Text(
                      doc.isScanned ? 'Rescan' : 'Replace',
                      style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.primaryLight),
                    ),
                  ),
                  IconButton(
                    onPressed: _uploadState.isBusy
                        ? null
                        : () {
                            setState(() {
                              _acquiredDocument = null;
                              _uploadState = const UploadStateInfo(state: UploadProgressState.idle);
                            });
                          },
                    icon: const Icon(LucideIcons.trash2, size: 14, color: Color(0xFFDC2626)),
                    tooltip: 'Remove',
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildImagePageWidget(AcquiredDocument doc, int pageIndex) {
    if (doc.pageBytes.isNotEmpty && pageIndex < doc.pageBytes.length) {
      return Image.memory(
        doc.pageBytes[pageIndex],
        fit: BoxFit.contain,
      );
    }
    if (!kIsWeb && doc.pagePaths.isNotEmpty && pageIndex < doc.pagePaths.length) {
      return Image.file(
        File(doc.pagePaths[pageIndex]),
        fit: BoxFit.contain,
      );
    }
    if (doc.bytes != null) {
      return Image.memory(doc.bytes!, fit: BoxFit.contain);
    }
    return const Icon(LucideIcons.image, size: 48, color: Colors.white54);
  }

  Widget _buildThumbnailWidget(AcquiredDocument doc, int pageIndex) {
    if (doc.pageBytes.isNotEmpty && pageIndex < doc.pageBytes.length) {
      return Image.memory(doc.pageBytes[pageIndex], fit: BoxFit.cover);
    }
    if (!kIsWeb && doc.pagePaths.isNotEmpty && pageIndex < doc.pagePaths.length) {
      return Image.file(File(doc.pagePaths[pageIndex]), fit: BoxFit.cover);
    }
    return Container(color: AppTheme.lightSurface, child: const Icon(LucideIcons.image, size: 16));
  }
}
