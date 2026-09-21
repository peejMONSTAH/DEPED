import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/transaction_model.dart';
import '../../services/api_service.dart';
import '../../services/realtime_service.dart';
import '../../services/transaction_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../utils/display.dart';
import '../../widgets/ui_kit.dart';
import '../transactions/checklist_upload_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({Key? key}) : super(key: key);

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  late final ApiService _apiService;
  late final RealtimeService _realtimeService;
  StreamSubscription? _notifSub;
  List<Map<String, dynamic>> _notifications = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _apiService = ApiService();
    _realtimeService = RealtimeService(_apiService);
    _fetchNotifications();

    _realtimeService.startListening();
    _notifSub = _realtimeService.onNotificationReceived.listen((_) {
      if (mounted) {
        _fetchNotifications();
      }
    });
  }

  @override
  void dispose() {
    _notifSub?.cancel();
    _realtimeService.dispose();
    super.dispose();
  }

  Future<void> _fetchNotifications() async {
    setState(() => _isLoading = true);
    try {
      final response = await _apiService.dio.get<dynamic>('/notifications');
      final List<dynamic> list =
          (response.data != null && response.data['data'] is List)
              ? (response.data['data'] as List<dynamic>)
              : <dynamic>[];
      if (mounted) {
        setState(() {
          _notifications =
              list.map((dynamic e) => e as Map<String, dynamic>).toList();
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _notifications = [];
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _markAllRead() async {
    try {
      await _apiService.dio.put<dynamic>('/notifications/read-all');
      await _fetchNotifications();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('All notifications marked as read.'),
            backgroundColor: AppTheme.primaryLight,
          ),
        );
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.lightBg,
      appBar: AppBar(
        backgroundColor: AppTheme.lightBgCard,
        elevation: 0,
        title: Text(
          'Notifications & Alerts',
          style: GoogleFonts.plusJakartaSans(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary),
        ),
        actions: [
          IconButton(
            tooltip: 'Mark All as Read',
            icon: const Icon(LucideIcons.checkCheck,
                color: AppTheme.primaryLight, size: 20),
            onPressed: _markAllRead,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppTheme.primaryLight))
          : RefreshIndicator(
              onRefresh: _fetchNotifications,
              color: AppTheme.primaryLight,
              child: _notifications.isEmpty
                  ? ListView(
                      padding: const EdgeInsets.all(AppSpace.lg),
                      children: const [
                        EmptyState(
                          icon: LucideIcons.bellOff,
                          title: 'No notifications',
                          message:
                              'Filing approvals, document reviews and status changes will appear here.',
                        ),
                      ],
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(AppSpace.lg),
                      itemCount: _notifications.length,
                      itemBuilder: (ctx, index) {
                        final item = _notifications[index];
                        final type = item['type']?.toString() ?? 'INFO';
                        final isRead =
                            item['read'] == true || item['isRead'] == true;
                        final message =
                            stripLeadingSymbols(item['message']).isEmpty
                                ? 'Notification'
                                : stripLeadingSymbols(item['message']);
                        final entityType =
                            item['relatedEntityType']?.toString() ?? '';

                        Color iconColor = AppTheme.primaryLight;
                        IconData iconData = LucideIcons.bell;

                        if (type == 'SUCCESS') {
                          iconColor = AppTheme.emeraldGreen;
                          iconData = LucideIcons.checkCircle;
                        } else if (type == 'WARNING') {
                          iconColor = AppTheme.accentGold;
                          iconData = LucideIcons.alertTriangle;
                        } else if (type == 'ERROR') {
                          iconColor = AppTheme.statusReturned;
                          iconData = LucideIcons.xCircle;
                        }

                        // Determine action button label based on notification intent
                        String actionLabel = 'View Details';
                        IconData actionIcon = LucideIcons.arrowRight;
                        final lowerMsg = message.toLowerCase();

                        if (entityType == 'AccountCreationRequest' ||
                            lowerMsg.contains('account creation') ||
                            lowerMsg.contains('creation request')) {
                          actionLabel = 'Review Account Request';
                          actionIcon = LucideIcons.userPlus;
                        } else if (lowerMsg.contains('password') ||
                            lowerMsg.contains('credential') ||
                            lowerMsg.contains('reset')) {
                          actionLabel = 'Manage Credentials';
                          actionIcon = LucideIcons.keyRound;
                        } else if (lowerMsg.contains('deficienc') ||
                            lowerMsg.contains('reject') ||
                            lowerMsg.contains('return')) {
                          actionLabel = 'Fix Requirements';
                          actionIcon = LucideIcons.fileWarning;
                        } else if (lowerMsg.contains('approved') ||
                            lowerMsg.contains('transaction')) {
                          actionLabel = 'Open Transaction';
                          actionIcon = LucideIcons.fileText;
                        } else if (lowerMsg.contains('promotion') ||
                            lowerMsg.contains('career')) {
                          actionLabel = 'View Service Record';
                          actionIcon = LucideIcons.award;
                        }

                        return Container(
                          margin: const EdgeInsets.only(bottom: AppSpace.md),
                          decoration: BoxDecoration(
                            color: AppTheme.lightBgCard,
                            borderRadius: AppRadius.lgAll,
                            border: Border.all(
                              color: isRead
                                  ? AppTheme.lightBorder
                                  : AppTheme.primaryLight
                                      .withValues(alpha: 0.35),
                            ),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(AppSpace.lg),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Padding(
                                      padding: const EdgeInsets.only(top: 1),
                                      child: Icon(iconData,
                                          color: iconColor, size: 18),
                                    ),
                                    const SizedBox(width: AppSpace.md),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            message,
                                            style: AppText.body.copyWith(
                                              fontWeight: isRead
                                                  ? FontWeight.w400
                                                  : FontWeight.w600,
                                            ),
                                          ),
                                          const SizedBox(height: AppSpace.xs),
                                          Text(
                                            formatDate(item['createdAt'],
                                                fallback: ''),
                                            style: AppText.micro,
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: AppSpace.md),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: TextButton.icon(
                                    style: TextButton.styleFrom(
                                      foregroundColor: AppTheme.primaryLight,
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: AppSpace.md,
                                          vertical: AppSpace.sm),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: AppRadius.mdAll,
                                      ),
                                    ),
                                    onPressed: () async {
                                      final navigator = Navigator.of(context);
                                      final messenger =
                                          ScaffoldMessenger.of(context);
                                      final rawTxId = item['relatedEntityId'] ??
                                          item['related_entity_id'];
                                      final txId = rawTxId is int
                                          ? rawTxId
                                          : (int.tryParse(
                                                  rawTxId?.toString() ?? '') ??
                                              0);

                                      if (txId > 0) {
                                        try {
                                          final txs = await TransactionService(
                                                  ApiService())
                                              .getMyTransactions();
                                          TransactionModel? foundTx;
                                          for (final transaction in txs) {
                                            if (transaction.id == txId) {
                                              foundTx = transaction;
                                              break;
                                            }
                                          }

                                          if (foundTx == null) {
                                            if (!mounted) return;
                                            messenger.showSnackBar(
                                              const SnackBar(
                                                content: Text(
                                                  'This transaction is no longer available. Your transaction list has been refreshed.',
                                                ),
                                              ),
                                            );
                                            return;
                                          }

                                          if (!mounted) return;
                                          navigator.push(
                                            MaterialPageRoute(
                                              builder: (ctx) =>
                                                  ChecklistUploadScreen(
                                                      transaction: foundTx!),
                                            ),
                                          );
                                          return;
                                        } catch (_) {}
                                      }

                                      if (!mounted) return;
                                      messenger.showSnackBar(
                                        SnackBar(
                                          content: Text(
                                              'Redirecting to: $actionLabel'),
                                          duration: const Duration(seconds: 2),
                                          backgroundColor:
                                              AppTheme.primaryLight,
                                        ),
                                      );
                                    },
                                    icon: Icon(actionIcon, size: 14),
                                    label: Text(
                                      '$actionLabel →',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                      ),
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
    );
  }
}
