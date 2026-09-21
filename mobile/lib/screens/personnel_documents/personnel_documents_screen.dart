import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_document_model.dart';
import '../../services/acquisition/document_acquisition_service.dart';
import '../../services/api_service.dart';
import '../../services/personnel_document_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/errors.dart';
import '../../theme/tokens.dart';
import '../../utils/display.dart';
import '../../widgets/ui_kit.dart';
import 'add_document_sheet.dart';
import 'document_preview_screen.dart';

class PersonnelDocumentsScreen extends StatefulWidget {
  const PersonnelDocumentsScreen({Key? key, this.embedded = false})
      : super(key: key);

  /// True when this screen is shown as a tab inside the dashboard rather than
  /// pushed as its own route. The dashboard already supplies an app bar and a
  /// floating navigation bar, so an embedded instance drops its own app bar and
  /// lifts the action button clear of the nav bar.
  final bool embedded;

  @override
  State<PersonnelDocumentsScreen> createState() =>
      _PersonnelDocumentsScreenState();
}

class _PersonnelDocumentsScreenState extends State<PersonnelDocumentsScreen> {
  late final PersonnelDocumentService _documentService;
  late final DocumentAcquisitionService _acquisitionService;

  List<PersonnelDocument> _documents = [];
  bool _isLoading = true;
  String _selectedFilter = 'ALL';
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    final apiService = ApiService();
    _documentService = PersonnelDocumentService(apiService);
    _acquisitionService = DocumentAcquisitionService();
    _loadDocuments();
  }

  Future<void> _loadDocuments({bool forceRefresh = false}) async {
    setState(() => _isLoading = true);
    try {
      final docs =
          await _documentService.getDocuments(forceRefresh: forceRefresh);
      if (mounted) {
        setState(() {
          _documents = docs;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _openAddDocumentSheet({PersonnelDocument? documentToReplace}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => AddDocumentSheet(
        documentService: _documentService,
        acquisitionService: _acquisitionService,
        documentToReplace: documentToReplace,
        onDocumentUploaded: () => _loadDocuments(forceRefresh: true),
      ),
    );
  }

  void _viewDocument(PersonnelDocument doc) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (ctx) => DocumentPreviewScreen(
          document: doc,
          documentService: _documentService,
          onReplaceRequested: () => _openAddDocumentSheet(documentToReplace: doc),
          onDeleteRequested: () => _confirmDeleteDocument(doc),
        ),
      ),
    );
  }

  void _confirmDeleteDocument(PersonnelDocument doc) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.lightBgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(LucideIcons.alertTriangle,
                color: Color(0xFFDC2626), size: 20),
            const SizedBox(width: 8),
            Text(
              'Delete Document',
              style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.bold, fontSize: 15),
            ),
          ],
        ),
        content: Text(
          'Are you sure you want to delete "${doc.documentTypeName}" (${doc.originalFileName})?',
          style: GoogleFonts.inter(fontSize: 13, color: AppTheme.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text('Cancel',
                style: GoogleFonts.inter(color: AppTheme.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626)),
            child: Text('Delete',
                style: GoogleFonts.inter(
                    color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    // A failed delete used to throw out of here uncaught: the document stayed
    // on screen, no message appeared, and the only trace was a stack in the
    // logs. Report the outcome either way, and only claim success once the
    // server has actually accepted it.
    try {
      await _documentService.deleteDocument(doc.id);
      await _loadDocuments(forceRefresh: true);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Deleted "${doc.documentTypeName}".'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(friendlyError(error,
              fallback:
                  'This document could not be deleted. Check your connection and try again.')),
          backgroundColor: AppTheme.statusReturned,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  List<PersonnelDocument> get _filteredDocuments {
    return _documents.where((doc) {
      if (_selectedFilter != 'ALL') {
        if (doc.status.name != _selectedFilter) return false;
      }
      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        final matchesName = doc.documentTypeName.toLowerCase().contains(query);
        final matchesFile = doc.originalFileName.toLowerCase().contains(query);
        final matchesRemarks =
            doc.remarks?.toLowerCase().contains(query) ?? false;
        return matchesName || matchesFile || matchesRemarks;
      }
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final docs = _filteredDocuments;
    // The first-run empty state already offers "Add your first document", so
    // showing the button as well would put two identical actions on screen.
    final emptyStateOffersAdd = !_isLoading &&
        docs.isEmpty &&
        _selectedFilter == 'ALL' &&
        _searchQuery.isEmpty;

    return Scaffold(
      backgroundColor: AppTheme.lightBg,
      appBar: widget.embedded
          ? null
          : AppBar(
              backgroundColor: AppTheme.lightBgSecondary,
              elevation: 0,
              scrolledUnderElevation: 0,
              title: Text(
                'Personnel Documents',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.textPrimary,
                ),
              ),
            ),
      body: ContentWidth(
        child: RefreshIndicator(
          onRefresh: () => _loadDocuments(forceRefresh: true),
          color: AppTheme.primaryLight,
          backgroundColor: AppTheme.lightBgCard,
          child: ListView(
            padding: EdgeInsets.fromLTRB(
              AppSpace.lg,
              AppSpace.lg,
              AppSpace.lg,
              // Clear the action button, and the dashboard nav bar on top of it.
              widget.embedded ? 190 : 110,
            ),
            children: [
              // Top Summary Hero Card
              _buildSummaryHeroCard(),
              const SizedBox(height: 16),

              // Search Bar
              Container(
                decoration: BoxDecoration(
                  color: AppTheme.lightBgCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppTheme.lightBorder),
                ),
                child: TextField(
                  onChanged: (val) => setState(() => _searchQuery = val.trim()),
                  decoration: InputDecoration(
                    hintText: 'Search by document name or filename...',
                    hintStyle: GoogleFonts.inter(
                        fontSize: 13, color: AppTheme.textMuted),
                    prefixIcon: const Icon(LucideIcons.search,
                        size: 18, color: AppTheme.textMuted),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Filter Chips Carousel
              _buildFilterChips(),
              const SizedBox(height: 16),

              // Document List
              if (_isLoading) ...[
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(40),
                    child:
                        CircularProgressIndicator(color: AppTheme.primaryLight),
                  ),
                ),
              ] else if (docs.isEmpty) ...[
                _buildEmptyState(),
              ] else ...[
                ListView.builder(
                  shrinkWrap: true,
                  // A nested ListView with no explicit padding inherits the
                  // MediaQuery vertical inset, which injects the bottom nav bar
                  // height as blank space in the middle of the page.
                  padding: EdgeInsets.zero,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: docs.length,
                  itemBuilder: (ctx, idx) => _buildDocumentCard(docs[idx]),
                ),
              ],
            ],
          ),
        ),
      ),
      floatingActionButton: emptyStateOffersAdd
          ? null
          : Padding(
              // Clear the dashboard's floating nav bar when shown as a tab.
              padding: EdgeInsets.only(bottom: widget.embedded ? 78 : 0),
              child: FloatingActionButton.extended(
                onPressed: () => _openAddDocumentSheet(),
                backgroundColor: AppTheme.brandDark,
                foregroundColor: Colors.white,
                elevation: 2,
                icon: const Icon(LucideIcons.plus, size: 18),
                label: Text('Add document',
                    style: AppText.caption.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    )),
              ),
            ),
    );
  }

  Widget _buildSummaryHeroCard() {
    final total = _documents.length;
    final approved = _documents
        .where((d) => d.status == PersonnelDocumentStatus.APPROVED)
        .length;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeading(
            title: '201 file compliance',
            trailing: StatusPill(
              label: total == 0
                  ? 'Nothing uploaded'
                  : '$approved of $total verified',
              tone: total == 0
                  ? AppStatusTone.neutral
                  : (approved == total
                      ? AppStatusTone.success
                      : AppStatusTone.pending),
            ),
          ),
          const SizedBox(height: AppSpace.sm),
          Text(
            'Keep your DepEd records current. Scan a physical credential with your camera, or upload a PDF.',
            style: AppText.caption,
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChips() {
    final filters = [
      {'label': 'All', 'key': 'ALL'},
      {'label': 'Approved', 'key': 'APPROVED'},
      {'label': 'Submitted', 'key': 'SUBMITTED'},
      {'label': 'Pending', 'key': 'PENDING'},
      {'label': 'Under Review', 'key': 'UNDER_REVIEW'},
      {'label': 'Rejected', 'key': 'REJECTED'},
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: filters.map((f) {
          final isSelected = _selectedFilter == f['key'];
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text(f['label']!),
              labelStyle: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                color: isSelected ? Colors.white : AppTheme.textSecondary,
              ),
              selected: isSelected,
              selectedColor: AppTheme.brandDark,
              backgroundColor: AppTheme.lightBgCard,
              side: BorderSide(
                  color:
                      isSelected ? AppTheme.brandDark : AppTheme.lightBorder),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
              onSelected: (selected) {
                if (selected) setState(() => _selectedFilter = f['key']!);
              },
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildDocumentCard(PersonnelDocument doc) {
    final expired =
        doc.expirationDate != null && isDateInPast(doc.expirationDate!);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(doc.documentTypeName, style: AppText.heading),
                      const SizedBox(height: 2),
                      Text(
                        doc.originalFileName,
                        style: AppText.caption,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpace.sm),
                _buildStatusChip(doc.status),
              ],
            ),
            const SizedBox(height: AppSpace.md),
            // Wrap, not Row: a long date pair would otherwise overflow the card
            // on a narrow phone.
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
            const SizedBox(height: AppSpace.md),
            const Divider(height: 1, thickness: 1, color: AppTheme.lightBorder),
            const SizedBox(height: AppSpace.sm),
            Row(
              children: [
                if (doc.status != PersonnelDocumentStatus.APPROVED)
                  TextButton.icon(
                    onPressed: () => _confirmDeleteDocument(doc),
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
                const Spacer(),
                OutlinedButton(
                  onPressed: () =>
                      _openAddDocumentSheet(documentToReplace: doc),
                  child: const Text('Replace'),
                ),
                const SizedBox(width: AppSpace.sm),
                ElevatedButton(
                  onPressed: () => _viewDocument(doc),
                  child: const Text('View'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusChip(PersonnelDocumentStatus status) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: status.color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: status.color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            status == PersonnelDocumentStatus.APPROVED
                ? LucideIcons.checkCheck
                : (status == PersonnelDocumentStatus.REJECTED
                    ? LucideIcons.xCircle
                    : LucideIcons.clock),
            size: 11,
            color: status.color,
          ),
          const SizedBox(width: 4),
          Text(
            status.label,
            style: GoogleFonts.inter(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: status.color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    final filtered = _selectedFilter != 'ALL' || _searchQuery.isNotEmpty;
    return EmptyState(
      icon: LucideIcons.fileUp,
      title: filtered ? 'Nothing matches that' : 'No documents yet',
      message: filtered
          ? 'No documents match this filter. Try a different status, or clear the search.'
          : 'Scan a physical credential with your camera, or upload a PDF, to start building your 201 file.',
      action: filtered
          ? null
          : ElevatedButton.icon(
              onPressed: () => _openAddDocumentSheet(),
              icon: const Icon(LucideIcons.plus, size: 16),
              label: const Text('Add your first document'),
            ),
    );
  }
}
