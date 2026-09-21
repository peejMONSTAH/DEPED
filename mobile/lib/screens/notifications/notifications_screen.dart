import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/transaction_model.dart';
import '../../services/api_service.dart';
import '../../services/realtime_service.dart';
import '../../services/transaction_service.dart';
import '../../theme/app_theme.dart';
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
      final List<dynamic> list = (response.data != null && response.data['data'] is List)
          ? (response.data['data'] as List<dynamic>)
          : <dynamic>[];
      if (mounted) {
        setState(() {
          _notifications = list.map((dynamic e) => e as Map<String, dynamic>).toList();
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
          style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
        ),
        actions: [
          IconButton(
            tooltip: 'Mark All as Read',
            icon: const Icon(LucideIcons.checkCheck, color: AppTheme.primaryLight, size: 20),
            onPressed: _markAllRead,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.primaryLight))
          : RefreshIndicator(
              onRefresh: _fetchNotifications,
              color: AppTheme.primaryLight,
              child: _notifications.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32.0),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(LucideIcons.bellOff, size: 48, color: AppTheme.textMuted),
                            const SizedBox(height: 16),
                            Text(
                              'No Notifications Yet',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'System updates, filing approvals, and status alerts will appear here.',
                              textAlign: TextAlign.center,
                              style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textSecondary),
                            ),
                          ],
                        ),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _notifications.length,
                      itemBuilder: (ctx, index) {
                        final item = _notifications[index];
                        final type = item['type']?.toString() ?? 'INFO';
                        final isRead = item['read'] == true || item['isRead'] == true;
                        final message = item['message']?.toString() ?? 'Notification';
                        final entityType = item['relatedEntityType']?.toString() ?? '';

                        Color iconColor = AppTheme.primaryLight;
                        IconData iconData = LucideIcons.bell;

                        if (type == 'SUCCESS') {
                          iconColor = AppTheme.emeraldGreen;
                          iconData = LucideIcons.checkCircle;
                        } else if (type == 'WARNING') {
                          iconColor = AppTheme.accentGold;
                          iconData = LucideIcons.alertTriangle;
                        } else if (type == 'ERROR') {
                          iconColor = const Color(0xFFF85149);
                          iconData = LucideIcons.xCircle;
                        }

                        // Determine action button label based on notification intent
                        String actionLabel = 'View Details';
                        IconData actionIcon = LucideIcons.arrowRight;
                        final lowerMsg = message.toLowerCase();

                        if (entityType == 'AccountCreationRequest' || lowerMsg.contains('account creation') || lowerMsg.contains('creation request')) {
                          actionLabel = 'Review Account Request';
                          actionIcon = LucideIcons.userPlus;
                        } else if (lowerMsg.contains('password') || lowerMsg.contains('credential') || lowerMsg.contains('reset')) {
                          actionLabel = 'Manage Credentials';
                          actionIcon = LucideIcons.keyRound;
                        } else if (lowerMsg.contains('deficienc') || lowerMsg.contains('reject') || lowerMsg.contains('return')) {
                          actionLabel = 'Fix Requirements';
                          actionIcon = LucideIcons.fileWarning;
                        } else if (lowerMsg.contains('approved') || lowerMsg.contains('transaction')) {
                          actionLabel = 'Open Transaction';
                          actionIcon = LucideIcons.fileText;
                        } else if (lowerMsg.contains('promotion') || lowerMsg.contains('career')) {
                          actionLabel = 'View Service Record';
                          actionIcon = LucideIcons.award;
                        }

                        return Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: AppTheme.lightBgCard,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: isRead ? AppTheme.lightBorder : AppTheme.primaryLight.withOpacity(0.4),
                            ),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x06000000),
                                blurRadius: 8,
                                offset: Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        color: iconColor.withOpacity(0.12),
                                        shape: BoxShape.circle,
                                      ),
                                      child: Icon(iconData, color: iconColor, size: 20),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            message,
                                            style: GoogleFonts.inter(
                                              fontSize: 13,
                                              fontWeight: isRead ? FontWeight.w500 : FontWeight.bold,
                                              color: AppTheme.textPrimary,
                                              height: 1.4,
                                            ),
                                          ),
                                          const SizedBox(height: 6),
                                          Text(
                                            item['createdAt']?.toString().split('T')[0] ?? '',
                                            style: GoogleFonts.inter(fontSize: 11, color: AppTheme.textMuted),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: TextButton.icon(
                                    style: TextButton.styleFrom(
                                      backgroundColor: AppTheme.primaryLight.withOpacity(0.12),
                                      foregroundColor: AppTheme.primaryLight,
                                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                    ),
                                    onPressed: () async {
                                       final navigator = Navigator.of(context);
                                       final messenger = ScaffoldMessenger.of(context);
                                       final rawTxId = item['relatedEntityId'] ?? item['related_entity_id'];
                                       final txId = rawTxId is int ? rawTxId : (int.tryParse(rawTxId?.toString() ?? '') ?? 0);
                                       
                                       if (txId > 0) {
                                         try {
                                           final txs = await TransactionService(ApiService()).getMyTransactions();
                                           final foundTx = txs.firstWhere(
                                             (t) => t.id == txId,
                                             orElse: () => TransactionModel(
                                               id: txId,
                                               referenceNo: 'TRX-$txId',
                                               type: TransactionType.PROMOTION,
                                               status: TransactionStatus.RETURNED_BY_AO2,
                                               complianceScore: 85.0,
                                               remarks: message,
                                               createdAt: DateTime.now().toIso8601String(),
                                               updatedAt: DateTime.now().toIso8601String(),
                                             ),
                                           );
                                           
                                           if (!mounted) return;
                                           navigator.push(
                                             MaterialPageRoute(
                                               builder: (ctx) => ChecklistUploadScreen(transaction: foundTx),
                                             ),
                                           );
                                           return;
                                         } catch (_) {}
                                       }

                                       if (!mounted) return;
                                       messenger.showSnackBar(
                                         SnackBar(
                                           content: Text('Redirecting to: $actionLabel'),
                                           duration: const Duration(seconds: 2),
                                           backgroundColor: AppTheme.primaryLight,
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
