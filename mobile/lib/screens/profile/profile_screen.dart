import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_profile_model.dart';
import '../../theme/app_theme.dart';

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
            const Icon(LucideIcons.checkCheck, color: AppTheme.brandDark, size: 18),
            const SizedBox(width: 8),
            Text(
              '$label copied to clipboard',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                color: AppTheme.brandDark,
                fontSize: 13,
              ),
            ),
          ],
        ),
        backgroundColor: AppTheme.accentLime,
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
              color: AppTheme.darkBgCard,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: AppTheme.darkBorder),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.4),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ],
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
                    color: AppTheme.darkSurface,
                    border: Border.all(color: AppTheme.darkBorder),
                  ),
                  child: const Center(
                    child: Icon(LucideIcons.userX, size: 28, color: AppTheme.textMuted),
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
                    backgroundColor: AppTheme.accentLime,
                    foregroundColor: AppTheme.brandDark,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                    elevation: 0,
                  ),
                  icon: const Icon(LucideIcons.refreshCw, size: 16, color: AppTheme.brandDark),
                  label: Text(
                    'Sync Records Now',
                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 14),
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
      color: AppTheme.accentLime,
      backgroundColor: AppTheme.darkBgCard,
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
                color: AppTheme.darkBgCard,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: AppTheme.darkBorder),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.4),
                    blurRadius: 20,
                    offset: const Offset(0, 8),
                  ),
                  BoxShadow(
                    color: AppTheme.accentLime.withOpacity(0.06),
                    blurRadius: 16,
                    spreadRadius: -2,
                  ),
                ],
              ),
              child: Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Avatar Circle with Neon Lime Accent Ring
                      Stack(
                        children: [
                          Container(
                            width: 68,
                            height: 68,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppTheme.darkSurface,
                              border: Border.all(color: AppTheme.accentLime, width: 2.5),
                              boxShadow: [
                                BoxShadow(
                                  color: AppTheme.accentLime.withOpacity(0.3),
                                  blurRadius: 14,
                                  spreadRadius: 1,
                                ),
                              ],
                            ),
                            child: Center(
                              child: Text(
                                initials,
                                style: GoogleFonts.plusJakartaSans(
                                  color: AppTheme.accentLime,
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
                                child: Icon(LucideIcons.check, size: 13, color: Colors.white),
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
                              p.fullName.isNotEmpty ? p.fullName : 'Personnel Staff',
                              style: GoogleFonts.plusJakartaSans(
                                color: AppTheme.textPrimary,
                                fontSize: 19,
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
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: AppTheme.accentLime.withOpacity(0.16),
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: AppTheme.accentLime.withOpacity(0.4)),
                                  ),
                                  child: Text(
                                    'SG ${p.salaryGrade} · Step ${p.stepIncrement}',
                                    style: GoogleFonts.jetBrainsMono(
                                      color: AppTheme.accentLime,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: AppTheme.darkSurface,
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: AppTheme.darkBorder),
                                  ),
                                  child: Text(
                                    p.personnelType,
                                    style: GoogleFonts.plusJakartaSans(
                                      color: AppTheme.textSecondary,
                                      fontSize: 10.5,
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
                  const Divider(color: AppTheme.darkBorder, height: 1),
                  const SizedBox(height: 14),

                  // Quick Metadata Bar with Copyable Employee ID
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      InkWell(
                        onTap: () => _copyToClipboard(context, p.employeeId, 'Employee ID'),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppTheme.darkSurface,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: AppTheme.darkBorder),
                          ),
                          child: Row(
                            children: [
                              const Icon(LucideIcons.idCard, size: 14, color: AppTheme.accentLime),
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
                              const Icon(LucideIcons.copy, size: 12, color: AppTheme.textMuted),
                            ],
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppTheme.emeraldGreen.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppTheme.emeraldGreen.withOpacity(0.3)),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                color: AppTheme.emeraldGreen,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'ACTIVE 201 RECORD',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w800,
                                color: AppTheme.emeraldGreen,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // PDS CS Form 212 Digital Banner
            Container(
              padding: const EdgeInsets.all(16.0),
              decoration: BoxDecoration(
                color: AppTheme.darkBgCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.darkBorder),
              ),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppTheme.darkSurface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.darkBorder),
                    ),
                    child: const Center(
                      child: Icon(LucideIcons.fileSpreadsheet, color: AppTheme.accentLime, size: 22),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              'Personal Data Sheet',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                              decoration: BoxDecoration(
                                color: AppTheme.accentLime.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                'PDS',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w800,
                                  color: AppTheme.accentLime,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'CSC Form 212 (Revised 2017) Digital Personnel Record',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11.5,
                            color: AppTheme.textSecondary,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
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
                _buildInfoRow('Full Name', p.fullName.isNotEmpty ? p.fullName : 'Not Provided'),
                _buildInfoRow('Employee ID', p.employeeId, isMono: true, onCopy: () => _copyToClipboard(context, p.employeeId, 'Employee ID')),
                _buildInfoRow('Personnel Category', p.personnelType),
                _buildInfoRow('Date of Birth', p.birthDate ?? 'Not Provided'),
                _buildInfoRow('Gender', p.gender ?? 'Not Specified'),
                _buildInfoRow('Civil Status', p.civilStatus ?? 'Single'),
                _buildInfoRow('DepEd Email', p.email ?? 'Not Provided', onCopy: p.email != null ? () => _copyToClipboard(context, p.email!, 'Email') : null),
                _buildInfoRow('Contact Number', p.mobileNo ?? 'Not Provided', onCopy: p.mobileNo != null ? () => _copyToClipboard(context, p.mobileNo!, 'Contact Number') : null),
                _buildInfoRow('Residential Address', p.address ?? 'Division Office, Koronadal City'),
              ],
            ),
            const SizedBox(height: 16),

            // Section 2: Employment & Assignment
            _buildSectionCard(
              title: 'II. Plantilla & Assignment',
              icon: LucideIcons.briefcase,
              items: [
                _buildInfoRow('Position Designation', p.positionTitle),
                _buildInfoRow('Plantilla Item No.', p.plantillaItemNo, isMono: true, onCopy: () => _copyToClipboard(context, p.plantillaItemNo, 'Plantilla Item No.')),
                _buildInfoRow('Salary Grade & Step', 'Salary Grade ${p.salaryGrade} · Step ${p.stepIncrement}'),
                _buildInfoRow('Station / School', p.stationName),
                _buildInfoRow('Date Appointed / Hired', p.dateHired ?? 'Not Provided'),
              ],
            ),
            const SizedBox(height: 16),

            // Section 3: Eligibility & Division Verification
            _buildSectionCard(
              title: 'III. Eligibility & Division Records',
              icon: LucideIcons.award,
              items: [
                _buildInfoRow('Division Governance', 'SDO Koronadal City · Region XII'),
                _buildInfoRow('Digital 201 Verification', 'Synchronized with HRMIS'),
                _buildInfoRow('PDS Form Standard', 'Civil Service Commission Form 212'),
                _buildInfoRow('Personnel Status', 'Active in Service'),
              ],
            ),
            const SizedBox(height: 24),

            // Bottom Action Row
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: onRefresh,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.accentLime,
                      foregroundColor: AppTheme.brandDark,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      elevation: 0,
                    ),
                    icon: const Icon(LucideIcons.refreshCw, size: 16, color: AppTheme.brandDark),
                    label: Text(
                      'Synchronize 201 Records',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 13.5,
                        color: AppTheme.brandDark,
                      ),
                    ),
                  ),
                ),
              ],
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
    return Container(
      padding: const EdgeInsets.all(18.0),
      decoration: BoxDecoration(
        color: AppTheme.darkBgCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.darkBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.25),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppTheme.accentLime.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 16, color: AppTheme.accentLime),
              ),
              const SizedBox(width: 10),
              Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.textPrimary,
                  letterSpacing: -0.01,
                ),
              ),
            ],
          ),
          const Divider(height: 22, color: AppTheme.darkBorder),
          ...items,
        ],
      ),
    );
  }

  Widget _buildInfoRow(
    String label,
    String value, {
    bool isMono = false,
    VoidCallback? onCopy,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(
              label,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                color: AppTheme.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: InkWell(
              onTap: onCopy,
              borderRadius: BorderRadius.circular(4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      value,
                      style: isMono
                          ? GoogleFonts.jetBrainsMono(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.accentLime,
                            )
                          : GoogleFonts.plusJakartaSans(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.textPrimary,
                            ),
                    ),
                  ),
                  if (onCopy != null) ...[
                    const SizedBox(width: 4),
                    const Icon(LucideIcons.copy, size: 12, color: AppTheme.textMuted),
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
