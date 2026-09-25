import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_profile_model.dart';
import '../../models/transaction_model.dart';
import '../../models/user_model.dart';
import '../../services/api_service.dart';
import '../../services/transaction_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/errors.dart';
import '../promotions/promotion_checklist_screen.dart';
import '../transactions/checklist_upload_screen.dart';

/// Everything the person has applied for or been assigned: promotion
/// applications (with AO II's verdict on each Annex C document) and
/// appointment transactions. Returned documents can be replaced and the
/// application resubmitted from here.
class MyApplicationsScreen extends StatefulWidget {
  final UserModel user;
  final PersonnelProfileModel? profile;
  const MyApplicationsScreen({Key? key, required this.user, this.profile}) : super(key: key);

  @override
  State<MyApplicationsScreen> createState() => _MyApplicationsScreenState();
}

const _red = Color(0xFFDC2626);
const _redBg = Color(0xFFFEF2F2);

class _Stage {
  final String label;
  final Color color;
  const _Stage(this.label, this.color);
}

_Stage _promotionStage(Map<String, dynamic> app) {
  final stage = app['stageStatus']?.toString();
  final status = app['status']?.toString();
  if (app['canResubmit'] == true) return const _Stage('Returned — action needed', _red);
  if (stage == 'RESUBMITTED') return const _Stage('Resubmitted — awaiting AO II', Color(0xFFB45309));
  if (stage == 'SELECTED_PENDING_DOCS' || status == 'APPROVED') return const _Stage('Selected for promotion', AppTheme.emeraldGreen);
  if (status == 'REJECTED') return const _Stage('Not selected', AppTheme.textMuted);
  if (stage == 'REQUIREMENTS_VERIFIED') return const _Stage('Verified — for HRMPSB deliberation', AppTheme.emeraldGreen);
  if (status == 'RANKED') return const _Stage('Ranked', AppTheme.primaryLight);
  return const _Stage('Submitted — awaiting AO II', Color(0xFFB45309));
}

_Stage _transactionStage(TransactionStatus s) {
  switch (s) {
    case TransactionStatus.RETURNED_BY_AO2:
    case TransactionStatus.RETURNED_BY_HRMO:
      return const _Stage('Returned — action needed', _red);
    case TransactionStatus.DRAFT:
      return const _Stage('Preparing requirements', Color(0xFFB45309));
    case TransactionStatus.SUBMITTED_TO_AO2:
      return const _Stage('Under AO II validation', Color(0xFFB45309));
    case TransactionStatus.FORWARDED_TO_HRMO:
      return const _Stage('Awaiting HRMO approval', AppTheme.primaryLight);
    case TransactionStatus.APPROVED_BY_HRMO:
      return const _Stage('Approved — officially appointed', AppTheme.emeraldGreen);
    default:
      return const _Stage('Closed', AppTheme.textMuted);
  }
}

String _txTitle(TransactionType t) => switch (t) {
      TransactionType.PROMOTION => 'Promotion Appointment',
      TransactionType.NEWLY_HIRED => 'Newly Hired Appointment',
      TransactionType.SALARY_ADJUSTMENT => 'Salary Adjustment',
    };

class _MyApplicationsScreenState extends State<MyApplicationsScreen> {
  final _api = ApiService();
  late final TransactionService _txService = TransactionService(_api);
  List<Map<String, dynamic>>? _apps;
  List<TransactionModel> _txs = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await _api.dio.get<dynamic>('/promotions/my-applications');
      final list = (res.data?['data'] as List? ?? const []).cast<Map<String, dynamic>>();
      List<TransactionModel> txs = [];
      try { txs = await _txService.getMyTransactions(); } catch (_) {}
      if (!mounted) return;
      setState(() { _apps = list; _txs = txs; _error = null; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _apps ??= []; _error = friendlyError(e, fallback: 'Could not load your applications.'); });
    }
  }

  Future<void> _resubmit(Map<String, dynamic> app) async {
    final cycle = Map<String, dynamic>.from(app['cycle'] as Map);
    final items = (app['items'] as List? ?? const []).cast<Map<String, dynamic>>();
    final done = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => PromotionChecklistScreen(cycle: cycle, user: widget.user, profile: widget.profile, resubmitItems: items),
    ));
    if (done == true) _load();
  }

  Future<void> _openTransaction(TransactionModel tx) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChecklistUploadScreen(transaction: tx)));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_apps == null) return const Center(child: CircularProgressIndicator(color: AppTheme.primaryLight));
    final needsAction = _apps!.where((a) => a['canResubmit'] == true).length +
        _txs.where((t) => t.status == TransactionStatus.RETURNED_BY_AO2 || t.status == TransactionStatus.RETURNED_BY_HRMO).length;
    return RefreshIndicator(
      onRefresh: _load,
      color: AppTheme.primaryLight,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Text('My Applications', style: GoogleFonts.plusJakartaSans(fontSize: 22, fontWeight: FontWeight.w800, color: AppTheme.textPrimary)),
          const SizedBox(height: 4),
          Text(needsAction > 0 ? '$needsAction need your action' : 'Track your promotion applications and appointments.',
              style: GoogleFonts.inter(fontSize: 13, color: needsAction > 0 ? _red : AppTheme.textSecondary, fontWeight: needsAction > 0 ? FontWeight.w700 : FontWeight.w400)),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: _red)),
          ],
          const SizedBox(height: 16),
          if (_apps!.isEmpty && _txs.isEmpty) _empty(),
          if (_apps!.isNotEmpty) ...[
            _sectionLabel('Promotion applications'),
            for (final app in _apps!) _applicationCard(app),
          ],
          if (_txs.isNotEmpty) ...[
            const SizedBox(height: 8),
            _sectionLabel('Appointment requirements'),
            for (final tx in _txs) _transactionCard(tx),
          ],
        ],
      ),
    );
  }

  Widget _empty() => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: AppTheme.lightBgCard, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppTheme.lightBorder)),
        child: Column(children: [
          const Icon(LucideIcons.inbox, size: 32, color: AppTheme.textMuted),
          const SizedBox(height: 8),
          Text('No applications yet', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text('Open vacancies appear on Portal Home. Your applications will show here.',
              textAlign: TextAlign.center, style: GoogleFonts.inter(fontSize: 13, color: AppTheme.textSecondary)),
        ]),
      );

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text.toUpperCase(),
            style: GoogleFonts.plusJakartaSans(fontSize: 11, letterSpacing: 0.6, fontWeight: FontWeight.w800, color: AppTheme.textSecondary)),
      );

  Widget _card({required Widget child, bool alert = false}) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.lightBgCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: alert ? _red : AppTheme.lightBorder, width: alert ? 1.4 : 1),
        ),
        child: child,
      );

  Widget _status(_Stage s) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: s.color.withOpacity(0.1), borderRadius: BorderRadius.circular(999)),
        child: Text(s.label, style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: s.color)),
      );

  Widget _applicationCard(Map<String, dynamic> app) {
    final cycle = (app['cycle'] as Map?) ?? const {};
    final stage = _promotionStage(app);
    final returnedItems = (app['items'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .where((i) => i['verificationStatus'] == 'INCOMPLETE')
        .toList();
    final check = app['requirementsCheck'] as Map?;
    final canResubmit = app['canResubmit'] == true;
    return _card(
      alert: canResubmit,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text((cycle['targetPosition'] ?? cycle['name'] ?? 'Promotion').toString(),
              style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w800, color: AppTheme.textPrimary)),
          const SizedBox(height: 2),
          Text('${app['applicantNumber'] ?? 'Application #${app['id']}'} · ${cycle['name'] ?? ''}',
              maxLines: 2, overflow: TextOverflow.ellipsis, style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: 10),
          _status(stage),
          if (canResubmit) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: _redBg, borderRadius: BorderRadius.circular(12)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Returned by AO II', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: const Color(0xFF991B1B))),
                  if ((check?['remarks'] ?? '').toString().isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(check!['remarks'].toString(), style: GoogleFonts.inter(fontSize: 12, color: const Color(0xFF991B1B))),
                  ],
                  for (final item in returnedItems) ...[
                    const SizedBox(height: 8),
                    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Padding(padding: EdgeInsets.only(top: 2), child: Icon(LucideIcons.fileX, size: 14, color: _red)),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text.rich(TextSpan(children: [
                          TextSpan(text: '${item['title'] ?? 'Item ${item['code']}'}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          if ((item['verificationRemarks'] ?? '').toString().isNotEmpty) TextSpan(text: ' — ${item['verificationRemarks']}'),
                        ]), style: GoogleFonts.inter(fontSize: 12, color: const Color(0xFF7F1D1D))),
                      ),
                    ]),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => _resubmit(app),
                icon: const Icon(LucideIcons.upload, size: 16),
                label: const Text('Fix and resubmit'),
                style: FilledButton.styleFrom(backgroundColor: _red, minimumSize: const Size.fromHeight(46)),
              ),
            ),
          ],
          if (app['transactionId'] != null && !canResubmit) ...[
            const SizedBox(height: 8),
            Text('Selected — see your appointment requirements below.',
                style: GoogleFonts.inter(fontSize: 12, color: AppTheme.emeraldGreen, fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }

  Widget _transactionCard(TransactionModel tx) {
    final stage = _transactionStage(tx.status);
    final returned = tx.requirements.where((r) => r.fileStatus == 'REJECTED').toList();
    final needsAction = stage.color == _red;
    final editable = needsAction || tx.status == TransactionStatus.DRAFT;
    return _card(
      alert: needsAction,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_txTitle(tx.type), style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w800, color: AppTheme.textPrimary)),
          const SizedBox(height: 2),
          Text(tx.referenceNo, style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: 10),
          _status(stage),
          for (final r in returned) ...[
            const SizedBox(height: 8),
            Text('• ${r.documentName}${(r.rejectionReason ?? '').isNotEmpty ? ' — ${r.rejectionReason}' : ''}',
                style: GoogleFonts.inter(fontSize: 12, color: const Color(0xFF7F1D1D))),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: needsAction
                ? FilledButton.icon(
                    onPressed: () => _openTransaction(tx),
                    icon: const Icon(LucideIcons.upload, size: 16),
                    label: const Text('Fix and resubmit'),
                    style: FilledButton.styleFrom(backgroundColor: _red, minimumSize: const Size.fromHeight(46)),
                  )
                : OutlinedButton(
                    onPressed: () => _openTransaction(tx),
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
                    child: Text(editable ? 'Open requirements' : 'View requirements'),
                  ),
          ),
        ],
      ),
    );
  }
}
