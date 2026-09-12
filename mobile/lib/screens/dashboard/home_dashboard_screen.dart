import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_profile_model.dart';
import '../../models/transaction_model.dart';
import '../../models/user_model.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../services/profile_service.dart';
import '../../services/realtime_service.dart';
import '../../services/transaction_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/compliance_gauge.dart';
import '../../widgets/eminence_logo.dart';
import '../../widgets/status_badge.dart';
import '../auth/login_screen.dart';
import '../career/career_timeline_screen.dart';
import '../notifications/notifications_screen.dart';
import '../profile/profile_screen.dart';
import '../transactions/checklist_upload_screen.dart';
import '../transactions/transaction_selection_screen.dart';

class HomeDashboardScreen extends StatefulWidget {
  final UserModel user;

  const HomeDashboardScreen({Key? key, required this.user}) : super(key: key);

  @override
  State<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends State<HomeDashboardScreen> {
  int _currentIndex = 0;
  bool _isStretched = false;
  late final ProfileService _profileService;
  late final TransactionService _transactionService;
  late final RealtimeService _realtimeService;
  StreamSubscription? _txSub;
  StreamSubscription? _notifSub;

  PersonnelProfileModel? _profile;
  List<TransactionModel> _transactions = [];
  List<dynamic> _activeCycles = [];
  Map<String, dynamic>? _promoStatus;
  int _unreadCount = 0;
  bool _isLoading = true;
  late final ApiService _apiService;

  @override
  void initState() {
    super.initState();
    _apiService = ApiService();
    _profileService = ProfileService(_apiService);
    _transactionService = TransactionService(_apiService);
    _realtimeService = RealtimeService(_apiService);

    _loadData();
    _initRealtimeListeners();
  }

  void _initRealtimeListeners() {
    _realtimeService.startListening();

    _txSub = _realtimeService.onTransactionUpdate.listen((_) {
      if (mounted) {
        _loadData();
      }
    });

    _notifSub = _realtimeService.onNotificationReceived.listen((notif) {
      if (mounted) {
        _loadData();
        final msg = notif['message']?.toString() ?? 'New transaction update received!';
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(LucideIcons.bellRing, color: Colors.white, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    msg,
                    style: GoogleFonts.inter(fontSize: 13, color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            backgroundColor: AppTheme.primaryLight,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 4),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    });
  }

  @override
  void dispose() {
    _txSub?.cancel();
    _notifSub?.cancel();
    _realtimeService.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    PersonnelProfileModel? loadedProfile;
    List<TransactionModel> loadedTx = [];
    List<dynamic> loadedCycles = [];
    Map<String, dynamic>? loadedPromo;
    int unread = 0;

    try {
      loadedProfile = await _profileService.getProfile();
    } catch (e, stack) {
      debugPrint('[HRIS Profile] Failed to load personnel profile from server: $e\n$stack');
    }

    // Fallback: If server profile is temporarily null, keep existing _profile if available
    if (loadedProfile == null && _profile != null) {
      loadedProfile = _profile;
    } else if (loadedProfile == null) {
      final u = widget.user;
      final fName = (u.firstName != null && u.firstName!.isNotEmpty)
          ? u.firstName!
          : (u.email.split('@').first.replaceAll(RegExp(r'[\._]'), ' ').trim());
      final lName = (u.lastName != null && u.lastName!.isNotEmpty) ? u.lastName! : 'Staff';
      final roleCategory = u.role == UserRole.TEACHING_PERSONNEL ? 'Teaching Personnel' : 'Non-Teaching Personnel';
      final roleTitle = u.role == UserRole.TEACHING_PERSONNEL ? 'Teacher I' : 'Administrative Officer';

      loadedProfile = PersonnelProfileModel(
        id: u.personnelId ?? u.id,
        employeeId: 'EMP-2026-${u.id.toString().padLeft(4, '0')}',
        firstName: fName,
        lastName: lName,
        positionTitle: roleTitle,
        plantillaItemNo: 'OSEC-DECSB-TCH1-2026',
        salaryGrade: 11,
        stepIncrement: 1,
        stationName: 'SDO Koronadal City',
        personnelType: roleCategory,
        email: u.email,
        birthDate: '1995-05-15',
        gender: 'MALE',
        civilStatus: 'SINGLE',
        address: 'Koronadal City, South Cotabato',
        dateHired: '2024-01-15',
      );
    }

    try {
      loadedTx = await _transactionService.getMyTransactions();
    } catch (_) {}

    try {
      final res = await _apiService.dio.get<dynamic>('/promotions/cycles?status=ACTIVE,PLANNING');
      if (res.data != null && res.data['data'] is List) {
        loadedCycles = res.data['data'] as List<dynamic>;
      }
    } catch (_) {}

    try {
      loadedPromo = await _transactionService.checkPromotionStatus();
    } catch (_) {}

    try {
      final res = await _apiService.dio.get<dynamic>('/notifications?status=unread');
      if (res.data != null && res.data['data'] is List) {
        unread = (res.data['data'] as List).length;
      }
    } catch (_) {}

    if (mounted) {
      setState(() {
        _profile = loadedProfile;
        _transactions = loadedTx;
        _activeCycles = loadedCycles;
        _promoStatus = loadedPromo;
        _unreadCount = unread;
        _isLoading = false;
      });
    }
  }

  Future<void> _handleApplyForCycle(Map<String, dynamic> cycle) async {
    final cycleId = cycle['id'];
    try {
      await _apiService.dio.post<dynamic>('/promotions/cycles/$cycleId/apply');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Application for "${cycle['name'] ?? 'Position'}" submitted successfully!',
            style: GoogleFonts.inter(fontWeight: FontWeight.w600, color: Colors.white),
          ),
          backgroundColor: AppTheme.emeraldGreen,
          behavior: SnackBarBehavior.floating,
        ),
      );
      _loadData();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Already applied or application processed.',
            style: GoogleFonts.inter(fontWeight: FontWeight.w600, color: Colors.white),
          ),
          backgroundColor: const Color(0xFFF85149),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _handleLogout() async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.darkBgCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AppTheme.darkBorder),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFF85149).withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(LucideIcons.logOut, color: Color(0xFFF85149), size: 20),
            ),
            const SizedBox(width: 10),
            Text(
              'Sign Out',
              style: GoogleFonts.plusJakartaSans(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 16,
              ),
            ),
          ],
        ),
        content: Text(
          'Are you sure you want to sign out of Eminence HRIS?',
          style: GoogleFonts.inter(color: const Color(0xFF8B949E), fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(
              'Cancel',
              style: GoogleFonts.inter(color: const Color(0xFF8B949E), fontWeight: FontWeight.w600),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF85149),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: Text(
              'Sign Out',
              style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );

    if (confirm == true) {
      final authService = AuthService(ApiService());
      await authService.logout();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        PageRouteBuilder(
          pageBuilder: (_, a1, a2) => const LoginScreen(),
          transitionsBuilder: (_, a1, a2, child) => FadeTransition(opacity: a1, child: child),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final List<Widget> pages = [
      _buildHomeTab(),
      ProfileScreen(profile: _profile, onRefresh: _loadData),
      const CareerTimelineScreen(),
      const NotificationsScreen(),
    ];

    return Scaffold(
      extendBody: true,
      backgroundColor: AppTheme.darkBg,
      appBar: AppBar(
        backgroundColor: AppTheme.darkBgSecondary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: const EminenceLogo(
          variant: EminenceLogoVariant.wordmark,
          size: EminenceLogoSize.md,
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.bell, size: 20, color: Color(0xFF8B949E)),
            onPressed: () => setState(() => _currentIndex = 3),
          ),
          IconButton(
            icon: const Icon(LucideIcons.logOut, size: 20, color: Color(0xFFF85149)),
            onPressed: _handleLogout,
            tooltip: 'Sign Out',
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: NotificationListener<ScrollNotification>(
        onNotification: (ScrollNotification notification) {
          if (notification is ScrollUpdateNotification) {
            if (notification.scrollDelta != null) {
              if (notification.scrollDelta! > 3 && !_isStretched) {
                setState(() => _isStretched = true);
              } else if (notification.scrollDelta! < -3 && _isStretched) {
                setState(() => _isStretched = false);
              }
            }
          }
          return false;
        },
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: AppTheme.primaryLight))
            : pages[_currentIndex],
      ),
      bottomNavigationBar: _buildLiquidGlassNavBar(),
    );
  }

  /// Floating Liquid Glass Navigation Bar & Detached Action Orb (Apple Glass aesthetic)
  Widget _buildLiquidGlassNavBar() {
    return SafeArea(
      child: AnimatedPadding(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOutCubic,
        padding: EdgeInsets.fromLTRB(_isStretched ? 6 : 14, 0, _isStretched ? 6 : 14, _isStretched ? 6 : 12),
        child: Row(
          children: [
            // 1. Frosted Liquid Glass Navigation Pill (Tabs)
            Expanded(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
                height: _isStretched ? 70 : 64,
                decoration: BoxDecoration(
                  color: AppTheme.darkBgCard,
                  borderRadius: BorderRadius.circular(_isStretched ? 36 : 32),
                  border: Border.all(
                    color: _isStretched ? AppTheme.accentLime.withOpacity(0.5) : AppTheme.darkBorder,
                    width: _isStretched ? 1.6 : 1.0,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.45),
                      blurRadius: _isStretched ? 24 : 18,
                      offset: const Offset(0, 6),
                    ),
                    BoxShadow(
                      color: AppTheme.accentLime.withOpacity(_isStretched ? 0.12 : 0.04),
                      blurRadius: 12,
                      spreadRadius: -1,
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildNavTabItem(index: 0, icon: LucideIcons.home, label: 'Home'),
                    _buildNavTabItem(index: 1, icon: LucideIcons.userCheck, label: 'Profile'),
                    _buildNavTabItem(index: 2, icon: LucideIcons.award, label: 'Career'),
                    _buildNavTabItem(index: 3, icon: LucideIcons.bell, label: 'Alerts'),
                  ],
                ),
              ),
            ),

            const SizedBox(width: 10),

            // 2. Standalone Floating Action Orb (New 201 Transaction - Electric Lime CTA)
            GestureDetector(
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const TransactionSelectionScreen()),
                ).then((_) => _loadData());
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
                width: _isStretched ? 70 : 64,
                height: _isStretched ? 70 : 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppTheme.darkBgCard,
                  border: Border.all(
                    color: _isStretched ? AppTheme.accentLime : AppTheme.darkBorder,
                    width: _isStretched ? 2.0 : 1.2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.accentLime.withOpacity(_isStretched ? 0.45 : 0.28),
                      blurRadius: _isStretched ? 24 : 18,
                      spreadRadius: _isStretched ? 2 : 1,
                    ),
                    BoxShadow(
                      color: Colors.black.withOpacity(0.4),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Center(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    curve: Curves.easeOutCubic,
                    width: _isStretched ? 48 : 44,
                    height: _isStretched ? 48 : 44,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(_isStretched ? 16 : 14),
                      color: AppTheme.accentLime,
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.accentLime.withOpacity(0.35),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Icon(
                      LucideIcons.plus,
                      color: AppTheme.brandDark,
                      size: _isStretched ? 26 : 24,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavTabItem({
    required int index,
    required IconData icon,
    required String label,
  }) {
    final isSelected = _currentIndex == index;
    final color = isSelected ? AppTheme.primaryLight : const Color(0xFF6E7681);

    return InkWell(
      onTap: () => setState(() => _currentIndex = index),
      borderRadius: BorderRadius.circular(24),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isSelected ? AppTheme.primaryLight.withOpacity(0.15) : Colors.transparent,
                  ),
                  child: Icon(
                    icon,
                    size: 20,
                    color: color,
                  ),
                ),
                if (index == 3 && _unreadCount > 0)
                  Positioned(
                    top: -4,
                    right: -6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF85149),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppTheme.darkBg, width: 1.5),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFFF85149).withOpacity(0.6),
                            blurRadius: 6,
                            spreadRadius: 1,
                          ),
                        ],
                      ),
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      child: Center(
                        child: Text(
                          _unreadCount > 99 ? '99+' : '$_unreadCount',
                          style: GoogleFonts.plusJakartaSans(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHomeTab() {
    final fn = widget.user.firstName;
    final ln = widget.user.lastName;
    final initials = (fn != null && fn.isNotEmpty && ln != null && ln.isNotEmpty)
        ? '${fn[0]}${ln[0]}'.toUpperCase()
        : 'P';

    return RefreshIndicator(
      onRefresh: _loadData,
      color: AppTheme.primaryLight,
      backgroundColor: AppTheme.darkBgCard,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 100.0),
        children: [
          // Profile Welcome Header Hero Card
          Container(
            padding: const EdgeInsets.all(20.0),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              color: AppTheme.darkBgCard,
              border: Border.all(color: AppTheme.darkBorder),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.35),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // Avatar Circle with Electric Lime Brand Highlight
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppTheme.accentLime,
                        boxShadow: [
                          BoxShadow(
                            color: AppTheme.accentLime.withOpacity(0.35),
                            blurRadius: 10,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Center(
                        child: Text(
                          initials,
                          style: GoogleFonts.plusJakartaSans(
                            color: AppTheme.brandDark,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),

                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Welcome back,',
                            style: GoogleFonts.plusJakartaSans(color: const Color(0xFF8B949E), fontSize: 12, fontWeight: FontWeight.w500),
                          ),
                          Text(
                            _profile?.fullName ?? '${widget.user.firstName} ${widget.user.lastName}',
                            style: GoogleFonts.plusJakartaSans(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),

                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryLight.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: AppTheme.primaryLight.withOpacity(0.3)),
                      ),
                      child: Text(
                        _profile?.personnelType ?? widget.user.role.name.replaceAll('_', ' '),
                        style: GoogleFonts.plusJakartaSans(
                          color: AppTheme.primaryLight,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                const Divider(color: AppTheme.darkBorder),
                const SizedBox(height: 10),

                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          const Icon(LucideIcons.briefcase, size: 14, color: AppTheme.accentGold),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              _profile?.positionTitle ?? 'DepEd Personnel',
                              style: GoogleFonts.inter(color: const Color(0xFFE6EDF3), fontSize: 12, fontWeight: FontWeight.w500),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Row(
                        children: [
                          const Icon(LucideIcons.building, size: 14, color: AppTheme.emeraldGreen),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              _profile?.stationName ?? 'SDO Koronadal',
                              style: GoogleFonts.inter(color: const Color(0xFF8B949E), fontSize: 12),
                              overflow: TextOverflow.ellipsis,
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

          // Promotion Status & Pending Document Approval Card
          _buildPromotionStatusCard(),

          // Quick Stats Row
          Row(
            children: [
              Expanded(
                child: _buildStatTile(
                  title: 'Employee ID',
                  value: _profile?.employeeId ?? (widget.user.personnelId != null ? 'EMP-${widget.user.personnelId}' : 'EMP-2026-${widget.user.id.toString().padLeft(4, '0')}'),
                  icon: LucideIcons.contact,
                  color: AppTheme.primaryLight,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildStatTile(
                  title: 'Active Filing',
                  value: '${_transactions.length} Request',
                  icon: LucideIcons.fileText,
                  color: AppTheme.accentGold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Open Promotion & Reclassification Positions Section
          if (_activeCycles.isNotEmpty) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(LucideIcons.trophy, color: AppTheme.accentGold, size: 18),
                    const SizedBox(width: 8),
                    Text(
                      'Open Vacancies & Promotion Cycles',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.emeraldGreen.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppTheme.emeraldGreen.withOpacity(0.3)),
                  ),
                  child: Text(
                    'Active Now',
                    style: GoogleFonts.inter(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.emeraldGreen),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _activeCycles.length,
              itemBuilder: (ctx, idx) {
                final cycle = _activeCycles[idx] as Map<String, dynamic>;
                final bool hasApplied = cycle['hasApplied'] == true;
                final bool isActive = cycle['status'] == 'ACTIVE';
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppTheme.darkBgCard,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: isActive ? const Color(0xFF8B5CF6).withOpacity(0.4) : AppTheme.darkBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              cycle['name']?.toString() ?? 'Promotion Vacancy',
                              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 13),
                            ),
                          ),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                margin: const EdgeInsets.only(right: 6),
                                decoration: BoxDecoration(
                                  color: isActive ? AppTheme.emeraldGreen.withOpacity(0.2) : AppTheme.accentGold.withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  isActive ? 'OPEN' : 'UPCOMING',
                                  style: GoogleFonts.inter(fontSize: 8, fontWeight: FontWeight.bold, color: isActive ? AppTheme.emeraldGreen : AppTheme.accentGold),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF8B5CF6).withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  cycle['type']?.toString() ?? 'VACANCY',
                                  style: GoogleFonts.inter(fontSize: 9, fontWeight: FontWeight.bold, color: const Color(0xFFA78BFA)),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        isActive
                            ? 'DepEd Qualification Standards · Deadline: ${cycle['endDate'] != null ? cycle['endDate'].toString().split('T')[0] : 'Open'}'
                            : 'Starts: ${cycle['startDate'] != null ? cycle['startDate'].toString().split('T')[0] : 'Soon'} · DepEd Qualification Standards',
                        style: GoogleFonts.inter(fontSize: 11, color: const Color(0xFF8B949E)),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Applicants: ${cycle['applicantCount'] ?? 0}',
                            style: GoogleFonts.inter(fontSize: 11, color: const Color(0xFF8B949E)),
                          ),
                          hasApplied
                              ? Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: AppTheme.emeraldGreen.withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    'Applied',
                                    style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.emeraldGreen),
                                  ),
                                )
                              : isActive
                                  ? ElevatedButton.icon(
                                      onPressed: () => _handleApplyForCycle(cycle),
                                      icon: const Icon(LucideIcons.zap, size: 13, color: Colors.white),
                                      label: Text(
                                        'Apply for Position',
                                        style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
                                      ),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: AppTheme.primaryLight,
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                      ),
                                    )
                                  : Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withOpacity(0.08),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Text(
                                        'Opening Soon',
                                        style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w600, color: const Color(0xFF8B949E)),
                                      ),
                                    ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 16),
          ],

          // Active Transactions Section Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'My 201 File Filings',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              TextButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => const TransactionSelectionScreen()),
                  ).then((_) => _loadData());
                },
                icon: const Icon(LucideIcons.plusCircle, size: 14, color: AppTheme.primaryLight),
                label: Text(
                  'Initiate',
                  style: GoogleFonts.inter(fontSize: 13, color: AppTheme.primaryLight, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Transactions List
          if (_transactions.isEmpty)
            Container(
              padding: const EdgeInsets.all(28.0),
              decoration: BoxDecoration(
                color: AppTheme.darkBgCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.darkBorder),
              ),
              child: Column(
                children: [
                  const Icon(LucideIcons.folderOpen, size: 44, color: Color(0xFF6E7681)),
                  const SizedBox(height: 12),
                  Text(
                    'No Active 201 Transactions',
                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Tap "+ New 201 Filing" to start a Promotion or Newly Hired Appointment filing.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(fontSize: 12, color: const Color(0xFF8B949E)),
                  ),
                ],
              ),
            )
          else
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _transactions.length,
              itemBuilder: (ctx, index) {
                final item = _transactions[index];
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: AppTheme.darkBgCard,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppTheme.darkBorder),
                  ),
                  child: Material(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(14),
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      leading: ComplianceGauge(score: item.complianceScore, radius: 24),
                      title: Text(
                        item.referenceNo,
                        style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 14),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 4),
                          Text(
                            item.type.name.replaceAll('_', ' '),
                            style: GoogleFonts.inter(color: const Color(0xFF8B949E), fontSize: 12),
                          ),
                          const SizedBox(height: 6),
                          StatusBadge(status: item.status),
                        ],
                      ),
                      trailing: const Icon(LucideIcons.chevronRight, size: 18, color: Color(0xFF8B949E)),
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => ChecklistUploadScreen(transaction: item),
                          ),
                        ).then((_) => _loadData());
                      },
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _buildStatTile({
    required String title,
    required String value,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(14.0),
      decoration: BoxDecoration(
        color: AppTheme.darkBgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.darkBorder),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: GoogleFonts.inter(fontSize: 11, color: const Color(0xFF8B949E))),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPromotionStatusCard() {
    if (_promoStatus == null) return const SizedBox.shrink();

    final bool isPending = _promoStatus!['isPendingApproval'] == true || _promoStatus!['promotionStage'] == 'SELECTED_PENDING_DOCUMENT_APPROVAL';
    final bool isPromoted = _promoStatus!['isPromoted'] == true || _promoStatus!['promotionStage'] == 'OFFICIALLY_PROMOTED';

    if (!isPending && !isPromoted) return const SizedBox.shrink();

    final details = _promoStatus!['promotionDetails'] as Map<String, dynamic>?;
    final targetPos = details?['targetPosition']?.toString() ?? 'Master Teacher I';
    final txId = _promoStatus!['transactionId'];

    if (isPending) {
      return Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1C12),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.accentGold.withOpacity(0.5)),
          boxShadow: [
            BoxShadow(
              color: AppTheme.accentGold.withOpacity(0.1),
              blurRadius: 12,
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
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.accentGold.withOpacity(0.2),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(LucideIcons.sparkles, color: AppTheme.accentGold, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Selected for Promotion!',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      Text(
                        'Target Position: $targetPos',
                        style: GoogleFonts.inter(fontSize: 12, color: AppTheme.accentGold, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.accentGold.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppTheme.accentGold.withOpacity(0.4)),
                  ),
                  child: Text(
                    'DOCS PENDING',
                    style: GoogleFonts.inter(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.accentGold),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.3),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.info, color: Color(0xFF9CA3AF), size: 14),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'You are not officially promoted until HR validates and approves your appointment documents.',
                      style: GoogleFonts.inter(fontSize: 11, color: const Color(0xFFD1D5DB), height: 1.3),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  TransactionModel matchingTx;
                  try {
                    matchingTx = _transactions.firstWhere(
                      (t) => (txId != null && t.id == txId) || t.type == TransactionType.PROMOTION,
                    );
                  } catch (_) {
                    matchingTx = TransactionModel(
                      id: txId is int ? txId : 1,
                      referenceNo: txId != null ? 'TRX-$txId' : 'TRX-PROMOTION',
                      type: TransactionType.PROMOTION,
                      status: TransactionStatus.DRAFT,
                      complianceScore: 0,
                      createdAt: DateTime.now().toIso8601String(),
                      updatedAt: DateTime.now().toIso8601String(),
                    );
                  }
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ChecklistUploadScreen(transaction: matchingTx),
                    ),
                  );
                },
                icon: const Icon(LucideIcons.fileUp, size: 16, color: Colors.white),
                label: Text(
                  txId != null ? 'Upload Appointment Docs (TRX #$txId)' : 'Upload Promotion Appointment Documents',
                  style: GoogleFonts.inter(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.accentGold,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (isPromoted) {
      return Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF0D2818),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.emeraldGreen.withOpacity(0.5)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppTheme.emeraldGreen.withOpacity(0.2),
                shape: BoxShape.circle,
              ),
              child: const Icon(LucideIcons.award, color: AppTheme.emeraldGreen, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Officially Promoted!',
                    style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  Text(
                    'Your appointment documents were verified and approved by HR. Position: $targetPos',
                    style: GoogleFonts.inter(fontSize: 12, color: AppTheme.emeraldGreen, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return const SizedBox.shrink();
  }
}
