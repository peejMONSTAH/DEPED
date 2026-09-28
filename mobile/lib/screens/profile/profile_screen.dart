import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_profile_model.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../utils/display.dart';
import '../../widgets/ui_kit.dart';
import '../personnel_documents/personnel_documents_screen.dart';
import 'profile_actions.dart';

class ProfileScreen extends StatelessWidget {
  final PersonnelProfileModel? profile;
  final VoidCallback onRefresh;

  const ProfileScreen({
    Key? key,
    required this.profile,
    required this.onRefresh,
  }) : super(key: key);

  String _getInitials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts[0].isEmpty) return 'P';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }

  void _copyToClipboard(BuildContext context, String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(LucideIcons.checkCheck, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Text(
              '$label copied to clipboard',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                color: Colors.white,
                fontSize: 13,
              ),
            ),
          ],
        ),
        backgroundColor: AppTheme.brandDark,
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (profile == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0),
          child: Container(
            padding: const EdgeInsets.all(28.0),
            decoration: BoxDecoration(
              color: AppTheme.lightBgCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.lightBorder),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppTheme.lightSurface,
                    border: Border.all(color: AppTheme.lightBorder),
                  ),
                  child: const Center(
                    child: Icon(LucideIcons.userX,
                        size: 28, color: AppTheme.textMuted),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  'Synchronizing 201 File',
                  style: GoogleFonts.plusJakartaSans(
                    color: AppTheme.textPrimary,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    letterSpacing: -0.01,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Fetching your verified DepEd personnel records from the SDO database.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    color: AppTheme.textSecondary,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 22),
                ElevatedButton.icon(
                  onPressed: onRefresh,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.brandDark,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999)),
                    elevation: 0,
                  ),
                  icon: const Icon(LucideIcons.refreshCw,
                      size: 16, color: Colors.white),
                  label: Text(
                    'Sync Records Now',
                    style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final p = profile!;
    final initials = _getInitials(p.fullName);

    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      color: AppTheme.primaryLight,
      backgroundColor: AppTheme.lightBgCard,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 120.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Hero Profile Header Card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(22.0),
              decoration: BoxDecoration(
                color: AppTheme.lightBgCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.lightBorder),
              ),
              child: Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Avatar Circle with Soft Accent Ring
                      Stack(
                        children: [
                          Container(
                            width: 68,
                            height: 68,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppTheme.primaryLight.withOpacity(0.08),
                              border: Border.all(
                                  color: AppTheme.primaryLight, width: 2),
                            ),
                            child: Center(
                              child: Text(
                                initials,
                                style: GoogleFonts.plusJakartaSans(
                                  color: AppTheme.primaryLight,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1,
                                ),
                              ),
                            ),
                          ),
                          Positioned(
                            bottom: 0,
                            right: 0,
                            child: Container(
                              width: 22,
                              height: 22,
                              decoration: const BoxDecoration(
                                color: AppTheme.emeraldGreen,
                                shape: BoxShape.circle,
                              ),
                              child: const Center(
                                child: Icon(LucideIcons.check,
                                    size: 13, color: Colors.white),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 16),
                      // Name & Primary Title
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              p.fullName.isNotEmpty
                                  ? p.fullName
                                  : 'Personnel Staff',
                              style: GoogleFonts.plusJakartaSans(
                                color: AppTheme.textPrimary,
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.02,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              p.positionTitle,
                              style: GoogleFonts.plusJakartaSans(
                                color: AppTheme.textSecondary,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 8),
                            // Tag Row
                            Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color:
                                        AppTheme.primaryLight.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                        color: AppTheme.primaryLight
                                            .withOpacity(0.25)),
                                  ),
                                  child: Text(
                                    p.salaryGrade == null
                                        ? 'SG not recorded'
                                        : (p.stepIncrement == null
                                            ? 'SG ${p.salaryGrade}'
                                            : 'SG ${p.salaryGrade} · Step ${p.stepIncrement}'),
                                    style: GoogleFonts.jetBrainsMono(
                                      color: AppTheme.primaryLight,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: AppTheme.lightSurface,
                                    borderRadius: BorderRadius.circular(8),
                                    border:
                                        Border.all(color: AppTheme.lightBorder),
                                  ),
                                  child: Text(
                                    humanizeEnum(p.personnelType),
                                    style: GoogleFonts.plusJakartaSans(
                                      color: AppTheme.textSecondary,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  const Divider(color: AppTheme.lightBorder, height: 1),
                  const SizedBox(height: 14),

                  // Quick Metadata Bar with Copyable Employee ID
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      InkWell(
                        onTap: () => _copyToClipboard(
                            context, p.employeeId, 'Employee ID'),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppTheme.lightSurface,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: AppTheme.lightBorder),
                          ),
                          child: Row(
                            children: [
                              const Icon(LucideIcons.idCard,
                                  size: 14, color: AppTheme.primaryLight),
                              const SizedBox(width: 6),
                              Text(
                                p.employeeId,
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.textPrimary,
                                ),
                              ),
                              const SizedBox(width: 6),
                              const Icon(LucideIcons.copy,
                                  size: 12, color: AppTheme.textMuted),
                            ],
                          ),
                        ),
                      ),
                      const StatusPill(
                          label: 'Active record', tone: AppStatusTone.success),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Section 1: Personal Information
            _buildSectionCard(
              title: 'I. Personal Information',
              icon: LucideIcons.user,
              items: [
                _buildInfoRow('Full Name',
                    p.fullName.isNotEmpty ? p.fullName : 'Not Provided'),
                _buildInfoRow('Employee ID', p.employeeId,
                    isMono: true,
                    onCopy: () =>
                        _copyToClipboard(context, p.employeeId, 'Employee ID')),
                _buildInfoRow('Personnel Category',
                    humanizeEnum(p.personnelType, fallback: 'Not Provided')),
                _buildInfoRow('Date of Birth',
                    formatDate(p.birthDate, fallback: 'Not Provided')),
                _buildInfoRow('Gender',
                    humanizeEnum(p.gender, fallback: 'Not Specified')),
                _buildInfoRow('Civil Status',
                    humanizeEnum(p.civilStatus, fallback: 'Not Specified')),
                _buildInfoRow('DepEd Email', p.email ?? 'Not Provided',
                    onCopy: p.email != null
                        ? () => _copyToClipboard(context, p.email!, 'Email')
                        : null),
                _buildInfoRow('Contact Number', p.mobileNo ?? 'Not Provided',
                    onCopy: p.mobileNo != null
                        ? () => _copyToClipboard(
                            context, p.mobileNo!, 'Contact Number')
                        : null),
                _buildInfoRow(
                    'Residential Address', p.address ?? 'Not Provided'),
              ],
            ),
            const SizedBox(height: 16),

            // Section 2: Employment & Assignment
            _buildSectionCard(
              title: 'II. Plantilla & Assignment',
              icon: LucideIcons.briefcase,
              items: [
                _buildInfoRow('Position Designation', p.positionTitle),
                _buildInfoRow('Plantilla Item No.', p.plantillaItemNo,
                    isMono: true,
                    onCopy: () => _copyToClipboard(
                        context, p.plantillaItemNo, 'Plantilla Item No.')),
                _buildInfoRow(
                    'Salary Grade & Step',
                    p.salaryGrade == null
                        ? 'Not recorded'
                        : (p.stepIncrement == null
                            ? 'Salary Grade ${p.salaryGrade}'
                            : 'Salary Grade ${p.salaryGrade} · Step ${p.stepIncrement}')),
                _buildInfoRow('Station / School', p.stationName),
                _buildInfoRow('Date Appointed / Hired',
                    formatDate(p.dateHired, fallback: 'Not Provided')),
              ],
            ),
            const SizedBox(height: 16),

            // What the person may change: blank required details, contact
            // details and the password. The rest is maintained by AO II/HRMO.
            ProfileActions(profile: p, onSaved: onRefresh),
            const SizedBox(height: 16),

            AppCard(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                    builder: (_) => const PersonnelDocumentsScreen()),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.folderOpen,
                      size: 20, color: AppTheme.primaryLight),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('My 201 files', style: AppText.heading),
                        const SizedBox(height: 2),
                        Text('IDs, licenses, diplomas and other records',
                            style: AppText.caption),
                      ],
                    ),
                  ),
                  const Icon(LucideIcons.chevronRight,
                      size: 18, color: AppTheme.textMuted),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.md),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onRefresh,
                icon: const Icon(LucideIcons.refreshCw, size: 16),
                label: const Text('Refresh'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required IconData icon,
    required List<Widget> items,
  }) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: AppTheme.textMuted),
              const SizedBox(width: AppSpace.sm),
              Expanded(child: Text(title, style: AppText.heading)),
            ],
          ),
          const Divider(
            height: AppSpace.xl,
            thickness: 1,
            color: AppTheme.lightBorder,
          ),
          ...items,
        ],
      ),
    );
  }

  /// A label/value pair.
  ///
  /// The label column used to be a fixed 130pt, which pushed long values into a
  /// narrow ribbon on small phones. Flex lets the value take the space it needs.
  Widget _buildInfoRow(
    String label,
    String value, {
    bool isMono = false,
    VoidCallback? onCopy,
  }) {
    final valueStyle = isMono
        ? AppText.mono.copyWith(
            color: AppTheme.textPrimary,
            fontWeight: FontWeight.w600,
          )
        : AppText.body.copyWith(fontWeight: FontWeight.w600);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpace.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 4,
            child: Text(label, style: AppText.caption),
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            flex: 6,
            child: InkWell(
              onTap: onCopy,
              borderRadius: AppRadius.smAll,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Text(value, style: valueStyle)),
                  if (onCopy != null) ...[
                    const SizedBox(width: AppSpace.xs),
                    const Icon(LucideIcons.copy,
                        size: 13, color: AppTheme.textMuted),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
