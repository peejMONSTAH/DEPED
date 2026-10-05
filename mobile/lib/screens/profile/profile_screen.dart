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
                  'Loading your records…',
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
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PersonnelHero(
              name: p.fullName,
              initials: initials,
              role: humanizeEnum(p.personnelType, fallback: 'Personnel'),
              position: p.positionTitle,
              station: p.stationName,
            ),
            const SizedBox(height: AppSpace.md),
            Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () =>
                      _copyToClipboard(context, p.employeeId, 'Employee ID'),
                  icon: const Icon(LucideIcons.copy, size: 16),
                  label: Text(p.employeeId, style: AppText.mono),
                )),
            const SizedBox(height: AppSpace.lg),

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppText.caption),
          const SizedBox(height: AppSpace.xs),
          InkWell(
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
        ],
      ),
    );
  }
}
