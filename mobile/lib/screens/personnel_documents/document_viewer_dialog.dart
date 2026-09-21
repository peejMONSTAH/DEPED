import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_document_model.dart';
import '../../theme/app_theme.dart';

class DocumentViewerDialog extends StatelessWidget {
  final PersonnelDocument document;
  final VoidCallback? onReplaceRequested;
  final VoidCallback? onDeleteRequested;

  const DocumentViewerDialog({
    Key? key,
    required this.document,
    this.onReplaceRequested,
    this.onDeleteRequested,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppTheme.lightBgCard,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: const BorderSide(color: AppTheme.lightBorder),
      ),
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 480),
        padding: const EdgeInsets.all(22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
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
                      child: Icon(
                        document.isPdf ? LucideIcons.fileText : LucideIcons.image,
                        color: AppTheme.primaryLight,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          document.documentTypeName,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                        Text(
                          document.originalFileName,
                          style: GoogleFonts.inter(fontSize: 11.5, color: AppTheme.textSecondary),
                        ),
                      ],
                    ),
                  ],
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(LucideIcons.x, size: 18),
                  style: IconButton.styleFrom(
                    backgroundColor: AppTheme.lightSurface,
                    side: const BorderSide(color: AppTheme.lightBorder),
                  ),
                ),
              ],
            ),
            const Divider(height: 24, color: AppTheme.lightBorder),

            // Status & Details
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.lightSurface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.lightBorder),
              ),
              child: Column(
                children: [
                  _buildDetailRow('Compliance Status', null, customRight: _buildStatusChip(document.status)),
                  const SizedBox(height: 8),
                  _buildDetailRow('File Size', document.formattedFileSize),
                  const SizedBox(height: 8),
                  _buildDetailRow('Format', document.mimeType),
                  const SizedBox(height: 8),
                  _buildDetailRow('Uploaded On', document.uploadedAt.split('T')[0]),
                  if (document.issueDate != null) ...[
                    const SizedBox(height: 8),
                    _buildDetailRow('Issue Date', document.issueDate!.split('T')[0]),
                  ],
                  if (document.expirationDate != null) ...[
                    const SizedBox(height: 8),
                    _buildDetailRow('Expiration Date', document.expirationDate!.split('T')[0]),
                  ],
                  if (document.reviewedBy != null) ...[
                    const SizedBox(height: 8),
                    _buildDetailRow('Reviewed By', document.reviewedBy!),
                  ],
                ],
              ),
            ),

            if (document.remarks != null && document.remarks!.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text(
                'Remarks:',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.textSecondary),
              ),
              const SizedBox(height: 4),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.lightSurface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.lightBorder),
                ),
                child: Text(
                  document.remarks!,
                  style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textPrimary),
                ),
              ),
            ],

            const SizedBox(height: 20),

            // Actions Row
            Row(
              children: [
                if (onDeleteRequested != null && document.status != PersonnelDocumentStatus.APPROVED) ...[
                  OutlinedButton.icon(
                    onPressed: () {
                      Navigator.of(context).pop();
                      onDeleteRequested!();
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFFDC2626),
                      side: const BorderSide(color: Color(0xFFFCA5A5)),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(LucideIcons.trash2, size: 14),
                    label: Text('Delete', style: GoogleFonts.inter(fontSize: 12.5, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(width: 8),
                ],
                if (onReplaceRequested != null) ...[
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {
                        Navigator.of(context).pop();
                        onReplaceRequested!();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.brandDark,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      icon: const Icon(LucideIcons.refreshCw, size: 14, color: Colors.white),
                      label: Text(
                        'Replace Document',
                        style: GoogleFonts.inter(fontSize: 12.5, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String? value, {Widget? customRight}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textSecondary),
        ),
        if (customRight != null)
          customRight
        else
          Text(
            value ?? '—',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
      ],
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
}
