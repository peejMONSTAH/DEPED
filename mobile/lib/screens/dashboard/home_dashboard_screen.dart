import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_profile_model.dart';
import '../../models/transaction_model.dart';
import '../../models/user_model.dart';
import '../../services/api_service.dart';
import '../../services/local_notification_service.dart';
import '../../services/auth_service.dart';
import '../../services/profile_service.dart';
import '../../services/realtime_service.dart';
import '../../services/transaction_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../utils/display.dart';
import '../../widgets/ui_kit.dart';
import '../../widgets/eminence_logo.dart';
import '../../widgets/status_badge.dart';
import '../applications/my_applications_screen.dart';
import '../auth/login_screen.dart';
import '../career/career_timeline_screen.dart';
import '../notifications/notifications_screen.dart';
import '../profile/profile_screen.dart';
import '../personnel_documents/personnel_documents_screen.dart';
import '../promotions/promotion_checklist_screen.dart';
import '../transactions/checklist_upload_screen.dart';

class HomeDashboardScreen extends StatefulWidget {
  final UserModel user;

  const HomeDashboardScreen({Key? key, required this.user}) : super(key: key);

  @override
  State<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends State<HomeDashboardScreen> {
  int _currentIndex = 0;

  /// The Notifications page, opened from the app-bar bell (it has no bottom
  /// tab). Named so the bell and the page list cannot drift apart.
  static const int _alertsTabIndex = 4;

  /// My Applications: promotion applications and appointment transactions,
  /// where returned documents are replaced and resubmitted.
  static const int _applicationsTabIndex = 5;
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

  /// True when the last attempt could not load the personnel profile. Drives
  /// the error state, and the "showing saved copy" notice when stale data is
  /// still on screen.
  bool _profileUnavailable = false;
  late final ApiService _apiService;

  @override
  void initState() {
    super.initState();
    _apiService = ApiService();
    _profileService = ProfileService(_apiService);
    _transactionService = TransactionService(_apiService);
    _realtimeService = RealtimeService(_apiService);

    LocalNotificationService.instance.init();
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

    // The live event carries no content; reloading fetches the unread list,
    // and _announce() rings and shows only what is new since the last load.
    _notifSub = _realtimeService.onNotificationReceived.listen((_) {
      if (mounted) _loadData();
    });
  }

  @override
  void dispose() {
    _txSub?.cancel();
    _notifSub?.cancel();
    _realtimeService.dispose();
    super.dispose();
  }

  /// Newest notification id already known; null until the first load.
  int? _lastSeenNotifId;

  /// Rings (phone notification shade) and shows a header banner for
  /// notifications newer than the last load. The first load only records
  /// where to start, so opening the app never replays old notifications.
  void _announce(List<Map<String, dynamic>> unread) {
    final ids = unread.map((n) => n['id']).whereType<int>();
    final newest = ids.isEmpty ? null : ids.reduce((a, b) => a > b ? a : b);
    if (_lastSeenNotifId == null) {
      _lastSeenNotifId = newest ?? 0;
      LocalNotificationService.instance.markSeen(_lastSeenNotifId);
      return;
    }
    final fresh = unread
        .where((n) => n['id'] is int && (n['id'] as int) > _lastSeenNotifId!)
        .toList()
      ..sort((a, b) => (b['id'] as int).compareTo(a['id'] as int));
    if (fresh.isEmpty) return;
    _lastSeenNotifId = fresh.first['id'] as int;
    LocalNotificationService.instance.showNew(fresh);
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context)..clearMaterialBanners();
    messenger.showMaterialBanner(MaterialBanner(
      backgroundColor: AppTheme.brandDark,
      leading: const Icon(LucideIcons.bellRing, color: Colors.white, size: 20),
      content: Text(
        fresh.length > 1
            ? '${fresh.first['message']}  (+${fresh.length - 1} more)'
            : (fresh.first['message'] ?? 'New notification').toString(),
        maxLines: 3,
        overflow: TextOverflow.ellipsis,
        style: GoogleFonts.inter(
            fontSize: 13, color: Colors.white, fontWeight: FontWeight.w600),
      ),
      actions: [
        TextButton(
          onPressed: () {
            messenger.hideCurrentMaterialBanner();
            setState(() => _currentIndex = _alertsTabIndex);
          },
          child: const Text('View',
              style:
                  TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        ),
        TextButton(
          onPressed: messenger.hideCurrentMaterialBanner,
          child: const Text('Dismiss', style: TextStyle(color: Colors.white70)),
        ),
      ],
    ));
    Future.delayed(const Duration(seconds: 5), () {
      if (mounted) messenger.hideCurrentMaterialBanner();
    });
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    PersonnelProfileModel? loadedProfile;
    List<TransactionModel> loadedTx = [];
    List<dynamic> loadedCycles = [];
    Map<String, dynamic>? loadedPromo;
    int unread = 0;
    bool profileFailed = false;

    try {
      loadedProfile = await _profileService.getProfile();
    } catch (e, stack) {
      debugPrint(
          '[HRIS Profile] Failed to load personnel profile from server: $e\n$stack');
    }

    // Keep a previously loaded profile if the refresh failed, and say so.
    // Never invent one: showing a fabricated position or station on a 201
    // record is worse than showing nothing.
    if (loadedProfile == null) {
      loadedProfile = _profile;
      profileFailed = true;
    }

    try {
      loadedTx = await _transactionService.getMyTransactions();
    } catch (_) {
      loadedTx = [];
    }
    if (mounted && _transactionService.syncError != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(_transactionService.syncError!),
        duration: const Duration(seconds: 8),
      ));
    }

    try {
      final res = await _apiService.dio
          .get<dynamic>('/promotions/cycles?status=ACTIVE,PLANNING');
      if (res.data != null && res.data['data'] is List) {
        final list = res.data['data'] as List<dynamic>;
        loadedCycles =
            list.where((c) => c is Map && c['status'] != 'CANCELLED').toList();
      }
    } catch (_) {}

    try {
      loadedPromo = await _transactionService.checkPromotionStatus();
    } catch (_) {}

    try {
      final res =
          await _apiService.dio.get<dynamic>('/notifications?status=unread');
      if (res.data != null && res.data['data'] is List) {
        final list = (res.data['data'] as List)
            .whereType<Map>()
            .map((m) => Map<String, dynamic>.from(m))
            .toList();
        unread = list.length;
        _announce(list);
      }
    } catch (_) {}

    if (mounted) {
      setState(() {
        _profile = loadedProfile;
        _transactions = loadedTx;
        _activeCycles = loadedCycles;
        _promoStatus = loadedPromo;
        _unreadCount = unread;
        _profileUnavailable = profileFailed;
        _isLoading = false;
      });
    }
  }

  Future<void> _handleApplyForCycle(Map<String, dynamic> cycle) async {
    final applied = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PromotionChecklistScreen(
          cycle: cycle,
          user: widget.user,
          profile: _profile,
        ),
      ),
    );

    if (applied == true) {
      _loadData();
    }
  }

  void _handleLogout() async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.lightBgCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppTheme.lightBorder),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFF85149).withOpacity(0.12),
                shape: BoxShape.circle,
              ),
              child: const Icon(LucideIcons.logOut,
                  color: Color(0xFFF85149), size: 20),
            ),
            const SizedBox(width: 10),
            Text(
              'Sign Out',
              style: GoogleFonts.plusJakartaSans(
                color: AppTheme.textPrimary,
                fontWeight: FontWeight.bold,
                fontSize: 15,
              ),
            ),
          ],
        ),
        content: Text(
          'Are you sure you want to sign out of Digital 201?',
          style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(
              'Cancel',
              style: GoogleFonts.inter(
                  color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF85149),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(
              'Sign Out',
              style: GoogleFonts.inter(
                  color: Colors.white, fontWeight: FontWeight.bold),
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
          transitionsBuilder: (_, a1, a2, child) =>
              FadeTransition(opacity: a1, child: child),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final List<Widget> pages = [
      _buildHomeTab(),
      ProfileScreen(profile: _profile, onRefresh: _loadData),
      const PersonnelDocumentsScreen(embedded: true),
      const CareerTimelineScreen(),
      // Index 3 is the Service Record tab; notifications open it in place.
      NotificationsScreen(
          onOpenServiceRecord: () => setState(() => _currentIndex = 3),
          onOpenApplications: () =>
              setState(() => _currentIndex = _applicationsTabIndex),
          onOpenDocuments: () => setState(() => _currentIndex = 2)),
      MyApplicationsScreen(user: widget.user, profile: _profile),
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
          showSubtitle: false,
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, thickness: 1, color: AppTheme.lightBorder),
        ),
        actions: [
          // Notifications live here only (not in the bottom bar), so the
          // unread count is shown on this bell.
          IconButton(
            icon: Badge(
              isLabelVisible: _unreadCount > 0,
              backgroundColor: const Color(0xFFF85149),
              label: Text(_unreadCount > 99 ? '99+' : '$_unreadCount'),
              child: const Icon(LucideIcons.bell,
                  size: 20, color: AppTheme.textSecondary),
            ),
            onPressed: () => setState(() => _currentIndex = _alertsTabIndex),
            tooltip: _unreadCount > 0
                ? 'Notifications ($_unreadCount unread)'
                : 'Notifications',
          ),
          IconButton(
            icon: const Icon(LucideIcons.logOut,
                size: 20, color: AppTheme.textSecondary),
            onPressed: _handleLogout,
            tooltip: 'Sign out',
          ),
          const SizedBox(width: AppSpace.xs),
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
            ? const Center(
                child: CircularProgressIndicator(color: AppTheme.primaryLight))
            : ContentWidth(child: pages[_currentIndex]),
      ),
      bottomNavigationBar: _buildLiquidGlassNavBar(),
    );
  }

  /// Floating liquid-glass navigation bar.
  Widget _buildLiquidGlassNavBar() {
    return SafeArea(
      child: ContentWidth(
        shrinkWrapHeight: true,
        child: AnimatedPadding(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOutCubic,
          padding: EdgeInsets.fromLTRB(_isStretched ? 6 : 14, 0,
              _isStretched ? 6 : 14, _isStretched ? 6 : 12),
          child: Row(
            children: [
              // Personnel transactions are assigned by the AO/HRMO workflow.
              // The navigation therefore contains no manual transaction action.
              Expanded(
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOutCubic,
                  // Tall enough for a two-line label ("Service Record").
                  height: _isStretched ? 76 : 72,
                  decoration: BoxDecoration(
                    color: AppTheme.lightBgCard,
                    borderRadius: BorderRadius.circular(_isStretched ? 36 : 32),
                    border: Border.all(color: AppTheme.lightBorder, width: 1),
                  ),
                  child: Row(
                    children: [
                      // Labels mirror the website sidebar so the same
                      // destination is called the same thing on every surface.
                      _buildNavTabItem(
                          index: 0, icon: LucideIcons.home, label: 'Home'),
                      _buildNavTabItem(
                          index: 2,
                          icon: LucideIcons.folderOpen,
                          label: '201 Files'),
                      // Opens CareerTimelineScreen, which the sidebar calls
                      // Service Record - not My Transactions.
                      _buildNavTabItem(
                          index: _applicationsTabIndex,
                          icon: LucideIcons.clipboardList,
                          label: 'Applications'),
                      _buildNavTabItem(
                          index: 3,
                          icon: LucideIcons.award,
                          label: 'Service'),
                      // Profile sits at the far right. The index is the page
                      // it opens, not its position in this row.
                      _buildNavTabItem(
                          index: 1,
                          icon: LucideIcons.userCheck,
                          label: 'Profile'),
                    ],
                  ),
                ),
              ),
            ],
          ),
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
    final color = isSelected ? AppTheme.primaryLight : AppTheme.textMuted;

    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _currentIndex = index),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
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
                      color: isSelected
                          ? AppTheme.primaryLight.withOpacity(0.12)
                          : Colors.transparent,
                    ),
                    child: Icon(
                      icon,
                      size: 20,
                      color: color,
                    ),
                  ),
                  if (index == _alertsTabIndex && _unreadCount > 0)
                    Positioned(
                      top: -4,
                      right: -6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 5, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF85149),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white, width: 1.5),
                        ),
                        constraints:
                            const BoxConstraints(minWidth: 16, minHeight: 16),
                        child: Center(
                          child: Text(
                            _unreadCount > 99 ? '99+' : '$_unreadCount',
                            style: GoogleFonts.plusJakartaSans(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 2),
              // Sidebar labels are two words. Wrapping to a second line keeps
              // them readable; scaleDown on a single line would shrink
              // "My Documents" to roughly 8px inside a 320px five-tab bar.
              // scaleDown is kept as the floor for the longest single word.
              // A one-word label ("Applications") must never break mid-word:
              // keep it on one line and shrink it slightly if the tab is narrow.
              if (!label.contains(' '))
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    label,
                    maxLines: 1,
                    softWrap: false,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      height: 1.15,
                      fontWeight:
                          isSelected ? FontWeight.bold : FontWeight.w500,
                      color: color,
                    ),
                  ),
                )
              else
                Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    height: 1.15,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                    color: color,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHomeTab() {
    // Nothing loaded and nothing cached: say so instead of rendering a
    // dashboard built from placeholder values.
    if (_profileUnavailable && _profile == null) {
      return RefreshIndicator(
        onRefresh: _loadData,
        color: AppTheme.primaryLight,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
              AppSpace.lg, AppSpace.lg, AppSpace.lg, 100),
          children: [
            EmptyState(
              icon: LucideIcons.cloudOff,
              title: 'Cannot reach the 201 server',
              message:
                  'Your records could not be loaded, so nothing is shown rather than out-of-date or placeholder details. Check your connection and try again.',
              action: Column(
                children: [
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _loadData,
                      child: const Text('Try again'),
                    ),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  TextButton(
                    onPressed: _handleLogout,
                    child: Text(
                      'Sign out',
                      style: AppText.caption
                          .copyWith(color: AppTheme.textSecondary),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    final fn = widget.user.firstName;
    final ln = widget.user.lastName;
    final initials =
        (fn != null && fn.isNotEmpty && ln != null && ln.isNotEmpty)
            ? '${fn[0]}${ln[0]}'.toUpperCase()
            : 'P';

    return RefreshIndicator(
      onRefresh: _loadData,
      color: AppTheme.primaryLight,
      backgroundColor: AppTheme.darkBgCard,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 100.0),
        children: [
          // Shown only when a refresh failed and the card below is therefore a
          // saved copy, so nobody mistakes it for live data.
          if (_profileUnavailable) ...[
            AppCard(
              padding: const EdgeInsets.all(AppSpace.md),
              borderColor: AppTheme.statusPending.withValues(alpha: 0.4),
              child: Row(
                children: [
                  const Icon(LucideIcons.cloudOff,
                      size: 16, color: AppTheme.statusPending),
                  const SizedBox(width: AppSpace.sm),
                  Expanded(
                    child: Text(
                      'Showing a saved copy. Could not reach the server.',
                      style: AppText.caption,
                    ),
                  ),
                  TextButton(
                    onPressed: _loadData,
                    child: Text(
                      'Retry',
                      style: AppText.caption.copyWith(
                        color: AppTheme.primaryLight,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.md),
          ],

          // Personnel identity
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppTheme.lightSurface,
                      ),
                      child:
                          Center(child: Text(initials, style: AppText.heading)),
                    ),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Welcome back', style: AppText.micro),
                          const SizedBox(height: 2),
                          Text(
                            _profile?.fullName ??
                                '${widget.user.firstName} ${widget.user.lastName}',
                            style: AppText.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.md),
                Wrap(
                  spacing: AppSpace.md,
                  runSpacing: AppSpace.sm,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    StatusPill(
                      label: humanizeEnum(
                        _profile?.personnelType ?? widget.user.role.name,
                        fallback: 'Personnel',
                      ),
                      tone: AppStatusTone.info,
                    ),
                    MetaItem(
                      icon: LucideIcons.briefcase,
                      label: _profile?.positionTitle ?? 'Position not recorded',
                    ),
                    MetaItem(
                      icon: LucideIcons.building2,
                      label: _profile?.stationName ?? 'Station not recorded',
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.md),

          // The one place that says what to do next.
          _buildActionNeeded(),

          // Promotion Status & Pending Document Approval Card
          _buildPromotionStatusCard(),

          // Quick Stats Row.
          // IntrinsicHeight gives the row a bounded height equal to its tallest
          // child, which is what lets the two cards match. Using
          // CrossAxisAlignment.stretch on its own does not work here: this row
          // sits in a scrolling ListView, so the cross axis is unbounded and
          // stretch asks the cards to be infinitely tall, which throws.
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _buildStatTile(
                    title: 'Employee ID',
                    value: _profile?.employeeId ??
                        (widget.user.personnelId != null
                            ? 'EMP-${widget.user.personnelId}'
                            : 'EMP-2026-${widget.user.id.toString().padLeft(4, '0')}'),
                    icon: LucideIcons.contact,
                    color: AppTheme.primaryLight,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildStatTile(
                    title: 'Active Filing',
                    value: pluralize(_transactions.length, 'request',
                        zeroLabel: 'None'),
                    icon: LucideIcons.fileText,
                    color: AppTheme.accentGold,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Personnel 201 documents quick action
          AppCard(
            // Documents has its own tab, so switch to it rather than pushing a
            // second copy on top of the navigation bar.
            onTap: () => setState(() => _currentIndex = 2),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryLight.withValues(alpha: 0.10),
                    borderRadius: AppRadius.mdAll,
                  ),
                  child: const Icon(LucideIcons.folderOpen,
                      size: 20, color: AppTheme.primaryLight),
                ),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('My 201 files', style: AppText.heading),
                      const SizedBox(height: 2),
                      Text('Scan or upload your records',
                          style: AppText.caption),
                    ],
                  ),
                ),
                const Icon(LucideIcons.chevronRight,
                    size: 18, color: AppTheme.textMuted),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.xl),

          // Open promotion & reclassification positions
          if (_activeCycles.isNotEmpty) ...[
            SectionHeading(
              title: 'Open vacancies',
              trailing: StatusPill(
                label: pluralize(_activeCycles.length, 'cycle'),
              ),
            ),
            const SizedBox(height: AppSpace.md),
            ListView.builder(
              shrinkWrap: true,
              // A nested ListView with no explicit padding inherits the
              // MediaQuery vertical inset, which injects the bottom nav bar
              // height as blank space in the middle of the page.
              padding: EdgeInsets.zero,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _activeCycles.length,
              itemBuilder: (ctx, idx) {
                final cycle = _activeCycles[idx] as Map<String, dynamic>;
                final bool hasApplied = cycle['hasApplied'] == true;
                final bool isActive = cycle['status'] == 'ACTIVE';
                final name = splitVacancyName(cycle['name']);
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
                                child:
                                    Text(name.title, style: AppText.heading)),
                            const SizedBox(width: AppSpace.sm),
                            StatusPill(
                              label: isActive ? 'Open' : 'Upcoming',
                              tone: isActive
                                  ? AppStatusTone.success
                                  : AppStatusTone.pending,
                            ),
                          ],
                        ),
                        if (name.code != null) ...[
                          const SizedBox(height: AppSpace.xs),
                          Text(name.code!, style: AppText.mono),
                        ],
                        const SizedBox(height: AppSpace.md),
                        Wrap(
                          spacing: AppSpace.md,
                          runSpacing: AppSpace.sm,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            MetaItem(
                              icon: LucideIcons.tag,
                              label: humanizeEnum(cycle['type'],
                                  fallback: 'Vacancy'),
                            ),
                            MetaItem(
                              icon: LucideIcons.calendarClock,
                              label: isActive
                                  ? 'Closes ${formatDate(cycle['endDate'], fallback: 'when filled')}'
                                  : 'Opens ${formatDate(cycle['startDate'], fallback: 'soon')}',
                            ),
                            MetaItem(
                              icon: LucideIcons.users,
                              label: pluralize(
                                (cycle['applicantCount'] as num?)?.toInt() ?? 0,
                                'applicant',
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpace.lg),
                        if (hasApplied)
                          const StatusPill(
                            label: 'Application submitted',
                            tone: AppStatusTone.success,
                            icon: LucideIcons.check,
                          )
                        else if (isActive &&
                            cycle['applicationsState'] == 'CLOSED')
                          StatusPill(
                              label:
                                  'Applications closed on ${cycle['applicationsCloseOn'] ?? 'the deadline'}')
                        else if (isActive &&
                            cycle['applicationsState'] == 'NOT_YET_OPEN')
                          StatusPill(
                              label:
                                  'Applications open on ${cycle['applicationsOpenOn'] ?? 'a later date'}')
                        else if (isActive)
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: () => _handleApplyForCycle(cycle),
                              child: const Text('Apply for position'),
                            ),
                          )
                        else
                          const StatusPill(label: 'Opening soon'),
                      ],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: AppSpace.xl),
          ],

          // Active transactions
          SectionHeading(title: 'My 201 transactions'),
          const SizedBox(height: AppSpace.md),

          // Transactions List
          if (_transactions.isEmpty)
            const EmptyState(
              icon: LucideIcons.folderOpen,
              title: 'No assigned transactions',
              message:
                  'A hiring or promotion transaction will appear here once the AO or HRMO assigns one to you.',
            )
          else
            Column(
              children: [
                for (final item in _transactions)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpace.sm),
                    child: AppCard(
                      onTap: () {
                        Navigator.of(context)
                            .push(MaterialPageRoute<void>(
                                builder: (_) =>
                                    ChecklistUploadScreen(transaction: item)))
                            .then((_) => _loadData());
                      },
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(humanizeEnum(item.type.name),
                                    style: AppText.heading),
                                const SizedBox(height: 2),
                                Text(
                                    '${item.referenceNo} · ${item.complianceScore.toInt()}% complete',
                                    style: AppText.caption),
                                const SizedBox(height: AppSpace.sm),
                                StatusBadge(status: item.status),
                              ],
                            ),
                          ),
                          const Icon(LucideIcons.chevronRight,
                              size: 18, color: AppTheme.textMuted),
                        ],
                      ),
                    ),
                  ),
              ],
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
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.md),
      child: StatBlock(label: title, value: value, icon: icon),
    );
  }

  /// Returned, disqualified or unfinished transactions, each one tap from its fix.
  Widget _buildActionNeeded() {
    final items =
        <({String title, String detail, TransactionModel tx, bool urgent})>[];
    for (final tx in _transactions) {
      final name = '${humanizeEnum(tx.type.name)} · ${tx.referenceNo}';
      if (tx.status == TransactionStatus.RETURNED_BY_AO2 ||
          tx.status == TransactionStatus.RETURNED_BY_HRMO) {
        final n = tx.requirements
            .where((r) =>
                r.fileStatus == 'REJECTED' || r.fileStatus == 'DEFICIENT')
            .length;
        items.add((
          title: n > 0
              ? 'Replace $n document${n == 1 ? '' : 's'}'
              : 'Fix and resubmit',
          detail: name,
          tx: tx,
          urgent: true,
        ));
      } else if (tx.status == TransactionStatus.REJECTED) {
        items.add((
          title: 'Correct and resubmit',
          detail: name,
          tx: tx,
          urgent: true
        ));
      } else if (tx.status == TransactionStatus.DRAFT) {
        items.add((
          title: tx.complianceScore >= 100
              ? 'Ready to submit'
              : 'Add your documents',
          detail: '$name · ${tx.complianceScore.toInt()}% complete',
          tx: tx,
          urgent: false,
        ));
      }
    }
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: AppCard(
        borderColor: AppTheme.statusPending.withValues(alpha: 0.5),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Action needed', style: AppText.heading),
            const SizedBox(height: AppSpace.sm),
            for (final it in items)
              InkWell(
                borderRadius: AppRadius.mdAll,
                onTap: () => Navigator.of(context)
                    .push(MaterialPageRoute<void>(
                        builder: (_) =>
                            ChecklistUploadScreen(transaction: it.tx)))
                    .then((_) => _loadData()),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpace.sm),
                  child: Row(
                    children: [
                      Icon(
                          it.urgent
                              ? LucideIcons.alertCircle
                              : LucideIcons.fileUp,
                          size: 18,
                          color: it.urgent
                              ? AppTheme.statusReturned
                              : AppTheme.statusPending),
                      const SizedBox(width: AppSpace.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(it.title,
                                style: AppText.body
                                    .copyWith(fontWeight: FontWeight.w700)),
                            Text(it.detail, style: AppText.caption),
                          ],
                        ),
                      ),
                      const Icon(LucideIcons.chevronRight,
                          size: 18, color: AppTheme.textMuted),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildPromotionStatusCard() {
    if (_promoStatus == null) return const SizedBox.shrink();

    final bool isPending = _promoStatus!['isPendingApproval'] == true ||
        _promoStatus!['promotionStage'] == 'SELECTED_PENDING_DOCUMENT_APPROVAL';
    final bool isPromoted = _promoStatus!['isPromoted'] == true ||
        _promoStatus!['promotionStage'] == 'OFFICIALLY_PROMOTED';
    if (!isPending && !isPromoted) return const SizedBox.shrink();

    final details = _promoStatus!['promotionDetails'] as Map<String, dynamic>?;
    final targetPos = details?['targetPosition']?.toString() ?? 'the position';
    final txId = _promoStatus!['transactionId'];

    void openTransaction() {
      TransactionModel? matchingTx;
      for (final transaction in _transactions) {
        if ((txId != null && transaction.id == txId) ||
            transaction.type == TransactionType.PROMOTION) {
          matchingTx = transaction;
          break;
        }
      }
      if (matchingTx == null) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('No assigned promotion transaction is available yet.')));
        return;
      }
      Navigator.of(context)
          .push(MaterialPageRoute(
              builder: (_) => ChecklistUploadScreen(transaction: matchingTx!)))
          .then((_) => _loadData());
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: AppCard(
        borderColor:
            (isPromoted ? AppTheme.statusApproved : AppTheme.statusPending)
                .withValues(alpha: 0.45),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(isPromoted ? LucideIcons.award : LucideIcons.sparkles,
                    size: 18,
                    color: isPromoted
                        ? AppTheme.statusApproved
                        : AppTheme.statusPending),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: Text(
                    isPromoted ? 'Promoted' : 'Selected for promotion',
                    style: AppText.heading,
                  ),
                ),
                StatusPill(
                  label: isPromoted ? 'Approved' : 'Documents needed',
                  tone: isPromoted
                      ? AppStatusTone.success
                      : AppStatusTone.pending,
                ),
              ],
            ),
            const SizedBox(height: AppSpace.xs),
            Text(
              isPromoted
                  ? 'You are now $targetPos.'
                  : 'Submit your appointment documents for $targetPos. The promotion is final once HR approves them.',
              style: AppText.caption,
            ),
            if (isPending) ...[
              const SizedBox(height: AppSpace.md),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: openTransaction,
                  child: const Text('Add appointment documents'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
