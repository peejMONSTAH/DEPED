import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_document_model.dart';
import '../../services/acquisition/document_acquisition_service.dart';
import '../../services/api_service.dart';
import '../../services/personnel_document_service.dart';
import '../../theme/app_theme.dart';
import 'add_document_sheet.dart';
import 'document_viewer_dialog.dart';

class PersonnelDocumentsScreen extends StatefulWidget {
  const PersonnelDocumentsScreen({Key? key}) : super(key: key);

  @override
  State<PersonnelDocumentsScreen> createState() => _PersonnelDocumentsScreenState();
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
      final docs = await _documentService.getDocuments(forceRefresh: forceRefresh);
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
    showDialog(
      context: context,
      builder: (ctx) => DocumentViewerDialog(
        document: doc,
        onReplaceRequested: () => _openAddDocumentSheet(documentToReplace: doc),
        onDeleteRequested: () => _confirmDeleteDocument(doc),
      ),
    );
  }

  void _confirmDeleteDocument(PersonnelDocument doc) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.lightBgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            const Icon(LucideIcons.alertTriangle, color: Color(0xFFDC2626), size: 20),
            const SizedBox(width: 8),
            Text(
              'Delete Document',
              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.bold, fontSize: 16),
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
            child: Text('Cancel', style: GoogleFonts.inter(color: AppTheme.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            child: Text('Delete', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await _documentService.deleteDocument(doc.id);
      _loadDocuments();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Document "${doc.documentTypeName}" deleted.'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
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
        final matchesRemarks = doc.remarks?.toLowerCase().contains(query) ?? false;
        return matchesName || matchesFile || matchesRemarks;
      }
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final docs = _filteredDocuments;

    return Scaffold(
      backgroundColor: AppTheme.lightBg,
      appBar: AppBar(
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
        actions: [
          TextButton.icon(
            onPressed: () => _openAddDocumentSheet(),
            icon: const Icon(LucideIcons.plusCircle, size: 16, color: AppTheme.primaryLight),
            label: Text(
              'Add Document',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: AppTheme.primaryLight,
              ),
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadDocuments(forceRefresh: true),
        color: AppTheme.primaryLight,
        backgroundColor: AppTheme.lightBgCard,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
          children: [
            // Top Summary Hero Card
            _buildSummaryHeroCard(),
            const SizedBox(height: 16),

            // Search Bar
            Container(
              decoration: BoxDecoration(
                color: AppTheme.lightBgCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppTheme.lightBorder),
              ),
              child: TextField(
                onChanged: (val) => setState(() => _searchQuery = val.trim()),
                decoration: InputDecoration(
                  hintText: 'Search by document name or filename...',
                  hintStyle: GoogleFonts.inter(fontSize: 13, color: AppTheme.textMuted),
                  prefixIcon: const Icon(LucideIcons.search, size: 18, color: AppTheme.textMuted),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                  child: CircularProgressIndicator(color: AppTheme.primaryLight),
                ),
              ),
            ] else if (docs.isEmpty) ...[
              _buildEmptyState(),
            ] else ...[
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: docs.length,
                itemBuilder: (ctx, idx) => _buildDocumentCard(docs[idx]),
              ),
            ],
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openAddDocumentSheet(),
        backgroundColor: AppTheme.brandDark,
        foregroundColor: Colors.white,
        icon: const Icon(LucideIcons.plus, size: 18),
        label: Text(
          'Add Document',
          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.bold, fontSize: 13),
        ),
      ),
    );
  }

  Widget _buildSummaryHeroCard() {
    final total = _documents.length;
    final approved = _documents.where((d) => d.status == PersonnelDocumentStatus.APPROVED).length;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.lightBgCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.lightBorder),
        boxShadow: const [
          BoxShadow(color: Color(0x06000000), blurRadius: 12, offset: Offset(0, 3)),
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
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryLight.withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(LucideIcons.fileBadge, size: 20, color: AppTheme.primaryLight),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '201 File Compliance Status',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14.5,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.emeraldGreen.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppTheme.emeraldGreen.withOpacity(0.3)),
                ),
                child: Text(
                  '$approved / $total Verified',
                  style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.emeraldGreen),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Keep your official DepEd teaching and non-teaching records up to date. Scan physical credentials using your camera or upload digital PDFs.',
            style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textSecondary, height: 1.4),
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
              side: BorderSide(color: isSelected ? AppTheme.brandDark : AppTheme.lightBorder),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
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
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppTheme.lightBgCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.lightBorder),
        boxShadow: const [
          BoxShadow(color: Color(0x06000000), blurRadius: 10, offset: Offset(0, 2)),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Row: Type & Status Badge
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: doc.isPdf
                              ? const Color(0xFFEF4444).withOpacity(0.12)
                              : AppTheme.primaryLight.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          doc.isPdf ? LucideIcons.fileText : LucideIcons.image,
                          color: doc.isPdf ? const Color(0xFFDC2626) : AppTheme.primaryLight,
                          size: 18,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              doc.documentTypeName,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 14.5,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.textPrimary,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              doc.originalFileName,
                              style: GoogleFonts.inter(fontSize: 11.5, color: AppTheme.textSecondary),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                _buildStatusChip(doc.status),
              ],
            ),
            const SizedBox(height: 12),

            // Metadata Row: Uploaded date, Expiration, Size
            Row(
              children: [
                const Icon(LucideIcons.calendar, size: 12, color: AppTheme.textMuted),
                const SizedBox(width: 4),
                Text(
                  'Uploaded: ${doc.uploadedAt.split('T')[0]}',
                  style: GoogleFonts.inter(fontSize: 11.5, color: AppTheme.textSecondary),
                ),
                if (doc.expirationDate != null) ...[
                  const SizedBox(width: 12),
                  const Icon(LucideIcons.calendarClock, size: 12, color: AppTheme.accentGold),
                  const SizedBox(width: 4),
                  Text(
                    'Expires: ${doc.expirationDate!.split('T')[0]}',
                    style: GoogleFonts.inter(fontSize: 11.5, color: const Color(0xFFB45309), fontWeight: FontWeight.w600),
                  ),
                ],
                const Spacer(),
                Text(
                  doc.formattedFileSize,
                  style: GoogleFonts.jetBrainsMono(fontSize: 11, color: AppTheme.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 14),

            const Divider(height: 1, color: AppTheme.lightBorder),
            const SizedBox(height: 10),

            // Action Buttons: View, Replace, Delete
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (doc.status != PersonnelDocumentStatus.APPROVED) ...[
                  TextButton.icon(
                    onPressed: () => _confirmDeleteDocument(doc),
                    icon: const Icon(LucideIcons.trash2, size: 13, color: Color(0xFFDC2626)),
                    label: Text(
                      'Delete',
                      style: GoogleFonts.inter(fontSize: 12, color: const Color(0xFFDC2626), fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(width: 4),
                ],
                OutlinedButton.icon(
                  onPressed: () => _openAddDocumentSheet(documentToReplace: doc),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    side: const BorderSide(color: AppTheme.lightBorder),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  icon: const Icon(LucideIcons.refreshCw, size: 12, color: AppTheme.textSecondary),
                  label: Text(
                    'Replace',
                    style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton.icon(
                  onPressed: () => _viewDocument(doc),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.brandDark,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    elevation: 0,
                  ),
                  icon: const Icon(LucideIcons.eye, size: 12, color: Colors.white),
                  label: Text(
                    'View',
                    style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
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
                : (status == PersonnelDocumentStatus.REJECTED ? LucideIcons.xCircle : LucideIcons.clock),
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
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: AppTheme.lightBgCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.lightBorder),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.lightSurface,
              shape: BoxShape.circle,
            ),
            child: const Icon(LucideIcons.fileUp, size: 36, color: AppTheme.textMuted),
          ),
          const SizedBox(height: 14),
          Text(
            'No Documents Found',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'You haven\'t uploaded any personnel documents matching this criteria yet. Tap below to scan or upload your first document.',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(fontSize: 12.5, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 18),
          ElevatedButton.icon(
            onPressed: () => _openAddDocumentSheet(),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.brandDark,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(LucideIcons.plus, size: 16, color: Colors.white),
            label: Text(
              'Add First Document',
              style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}
