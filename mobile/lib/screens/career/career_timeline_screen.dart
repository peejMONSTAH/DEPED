import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/service_record_model.dart';
import '../../services/api_service.dart';
import '../../services/career_service.dart';
import '../../services/profile_service.dart';
import '../../theme/app_theme.dart';

class CareerTimelineScreen extends StatefulWidget {
  const CareerTimelineScreen({Key? key}) : super(key: key);

  @override
  State<CareerTimelineScreen> createState() => _CareerTimelineScreenState();
}

class _CareerTimelineScreenState extends State<CareerTimelineScreen> {
  late final CareerService _careerService;
  List<ServiceRecordModel> _records = [];
  double _yearsOfService = 0.0;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _careerService = CareerService(ApiService());
    _loadCareerData();
  }

  Future<void> _loadCareerData() async {
    setState(() => _isLoading = true);
    try {
      final list = await _careerService.getServiceRecords();
      final profile = await ProfileService(ApiService()).getProfile();
      final yrs = _careerService.calculateYearsOfService(list, dateHired: profile.dateHired);
      if (mounted) {
        setState(() {
          _records = list;
          _yearsOfService = yrs;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.darkBg,
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.accentLime))
          : RefreshIndicator(
              color: AppTheme.accentLime,
              backgroundColor: AppTheme.darkBgCard,
              onRefresh: _loadCareerData,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 110.0),
                child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Years of Service Banner Card (Web-matched Dark Surface with Lime Accent)
                  Container(
                    padding: const EdgeInsets.all(20.0),
                    decoration: BoxDecoration(
                      color: AppTheme.darkBgCard,
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: AppTheme.darkBorder),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.35),
                          blurRadius: 18,
                          offset: const Offset(0, 6),
                        ),
                        BoxShadow(
                          color: AppTheme.accentLime.withOpacity(0.06),
                          blurRadius: 12,
                          spreadRadius: -1,
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: AppTheme.darkSurface,
                            shape: BoxShape.circle,
                            border: Border.all(color: AppTheme.darkBorder),
                          ),
                          child: const Icon(LucideIcons.history, color: AppTheme.accentLime, size: 28),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Accumulated Government Service',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w500,
                                  color: AppTheme.textSecondary,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                '${_yearsOfService.toStringAsFixed(1)} Years',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 26,
                                  fontWeight: FontWeight.w900,
                                  color: AppTheme.textPrimary,
                                  letterSpacing: -0.02,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                'Computed from official SDO Koronadal Service Records',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11,
                                  color: AppTheme.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  Text(
                    'Official Service Record Timeline',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.textPrimary,
                      letterSpacing: -0.01,
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Service Record Timeline List
                  if (_records.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: AppTheme.darkBgCard,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppTheme.darkBorder),
                      ),
                      child: Center(
                        child: Text(
                          'No service records available.',
                          style: GoogleFonts.plusJakartaSans(color: AppTheme.textSecondary),
                        ),
                      ),
                    )
                  else
                    ListView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: _records.length,
                      itemBuilder: (ctx, index) {
                        final item = _records[index];
                        return Container(
                          margin: const EdgeInsets.only(left: 4),
                          child: IntrinsicHeight(
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Timeline node indicator
                                Column(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(6),
                                      decoration: BoxDecoration(
                                        color: item.isPresent ? AppTheme.accentLime : AppTheme.darkSurface,
                                        shape: BoxShape.circle,
                                        border: Border.all(
                                          color: item.isPresent ? AppTheme.accentLime : AppTheme.darkBorder,
                                          width: 1.5,
                                        ),
                                      ),
                                      child: Icon(
                                        item.isPresent ? LucideIcons.check : LucideIcons.briefcase,
                                        size: 13,
                                        color: item.isPresent ? AppTheme.brandDark : AppTheme.textSecondary,
                                      ),
                                    ),
                                    Expanded(
                                      child: Container(
                                        width: 2,
                                        color: AppTheme.darkBorder,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(width: 14),

                                // Record Details Card (Dark Card with Soft Brutalist styling)
                                Expanded(
                                  child: Container(
                                    margin: const EdgeInsets.only(bottom: 16),
                                    padding: const EdgeInsets.all(16),
                                    decoration: BoxDecoration(
                                      color: AppTheme.darkBgCard,
                                      borderRadius: BorderRadius.circular(16),
                                      border: Border.all(color: AppTheme.darkBorder),
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.black.withOpacity(0.2),
                                          blurRadius: 10,
                                          offset: const Offset(0, 3),
                                        ),
                                      ],
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Expanded(
                                              child: Text(
                                                item.designation,
                                                style: GoogleFonts.plusJakartaSans(
                                                  fontWeight: FontWeight.w800,
                                                  fontSize: 15,
                                                  color: AppTheme.textPrimary,
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 8),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2.5),
                                              decoration: BoxDecoration(
                                                color: AppTheme.accentLime.withOpacity(0.12),
                                                borderRadius: BorderRadius.circular(6),
                                                border: Border.all(color: AppTheme.accentLime.withOpacity(0.25)),
                                              ),
                                              child: Text(
                                                'SG ${item.salaryGrade} Step ${item.stepIncrement}',
                                                style: GoogleFonts.plusJakartaSans(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w800,
                                                  color: AppTheme.accentLime,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          '${item.dateFrom}  ──  ${item.isPresent ? "PRESENT" : item.dateTo}',
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 12,
                                            color: AppTheme.textSecondary,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                        const SizedBox(height: 10),
                                        const Divider(height: 1, color: AppTheme.darkBorder),
                                        const SizedBox(height: 10),
                                        Row(
                                          children: [
                                            const Icon(LucideIcons.building2, size: 14, color: AppTheme.textMuted),
                                            const SizedBox(width: 6),
                                            Expanded(
                                              child: Text(
                                                item.stationPlace,
                                                style: GoogleFonts.plusJakartaSans(
                                                  fontSize: 12,
                                                  color: AppTheme.textSecondary,
                                                ),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            Text(
                                              '₱${item.monthlySalary.toStringAsFixed(2)}/mo',
                                              style: GoogleFonts.jetBrainsMono(
                                                fontWeight: FontWeight.bold,
                                                fontSize: 13,
                                                color: AppTheme.emeraldGreen,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
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
    );
  }
}
