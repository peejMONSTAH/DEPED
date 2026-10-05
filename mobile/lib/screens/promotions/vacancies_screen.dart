import 'package:flutter/material.dart';
import '../../models/user_model.dart';
import '../../models/personnel_profile_model.dart';
import '../../services/api_service.dart';
import '../../theme/tokens.dart';
import '../../utils/display.dart';
import '../../utils/errors.dart';
import '../../widgets/ui_kit.dart';
import 'promotion_checklist_screen.dart';

String? vacancyBlockReason(Map<String, dynamic> cycle) {
  if (cycle['hasApplied'] == true) {
    return 'You have already applied for this position.';
  }
  if (cycle['status'] != 'ACTIVE') {
    return 'This vacancy is not accepting applications.';
  }
  if (cycle['isEligible'] == false) {
    return cycle['ineligibilityReason']?.toString() ??
        'You are not eligible for this vacancy.';
  }
  if (cycle['isCurrentPosition'] == true) {
    return 'This is your current position.';
  }
  if (cycle['applicationsState'] == 'NOT_YET_OPEN') {
    return 'Applications open on ${cycle['applicationsOpenOn'] ?? 'a later date'}.';
  }
  if (cycle['applicationsState'] == 'CLOSED') {
    return 'Applications closed on ${cycle['applicationsCloseOn'] ?? 'the deadline'}.';
  }
  if (cycle['applicationsOpen'] == false) return 'Applications are not open.';
  return null;
}

/// Read-only browsing and details. Only the explicit Apply action opens a form.
class VacanciesScreen extends StatefulWidget {
  const VacanciesScreen(
      {super.key, required this.user, this.profile, this.cycleId, this.api});
  final UserModel user;
  final PersonnelProfileModel? profile;
  final int? cycleId;
  final ApiService? api;
  @override
  State<VacanciesScreen> createState() => _VacanciesScreenState();
}

class _VacanciesScreenState extends State<VacanciesScreen> {
  late final ApiService _api = widget.api ?? ApiService();
  List<Map<String, dynamic>> _cycles = [];
  String? _error;
  bool _loading = true;
  String _query = '';
  String _type = 'ALL';
  bool _openedTarget = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final cycles = <Map<String, dynamic>>[];
      var page = 1;
      var pages = 1;
      do {
        final response =
            await _api.dio.get('/promotions/cycles', queryParameters: {
          'status': widget.cycleId == null ? 'ACTIVE,PLANNING' : 'ALL',
          'forPersonnel': 'true',
          'page': page,
          'limit': 100,
        });
        cycles.addAll((response.data['data'] as List)
            .map((c) => Map<String, dynamic>.from(c)));
        pages =
            (response.data['pagination']?['totalPages'] as num?)?.toInt() ?? 1;
        page++;
      } while (page <= pages);
      if (!mounted) return;
      setState(() {
        _cycles = cycles;
        _loading = false;
      });
      if (widget.cycleId != null && !_openedTarget) {
        _openedTarget = true;
        final matches = cycles.where((c) => c['id'] == widget.cycleId);
        if (matches.isEmpty) {
          setState(() =>
              _error = 'This vacancy is no longer available to your account.');
        } else {
          await _details(matches.first);
        }
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error =
              friendlyError(error, fallback: 'Vacancies could not be loaded.');
        });
      }
    }
  }

  Future<void> _details(Map<String, dynamic> cycle) async {
    final submitted = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => VacancyDetailsScreen(
              cycle: cycle,
              user: widget.user,
              profile: widget.profile,
            )));
    if (submitted == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    // These are classifications, not categories inferred from today's results.
    const types = ['ALL', 'NATURAL_VACANCY', 'ECP'];
    final visible = _cycles
        .where((c) =>
            (_type == 'ALL' || c['type'] == _type) &&
            '${c['name']} ${c['targetPosition'] ?? ''}'
                .toLowerCase()
                .contains(_query.toLowerCase()))
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Vacancies')),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(
                  semanticsLabel: 'Loading vacancies'))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                  padding: const EdgeInsets.all(AppSpace.lg),
                  children: [
                    Text('Read the vacancy details before choosing to apply.',
                        style: AppText.body),
                    const SizedBox(height: AppSpace.md),
                    TextField(
                        decoration: const InputDecoration(
                            labelText: 'Search vacancies',
                            prefixIcon: Icon(Icons.search)),
                        onChanged: (v) => setState(() => _query = v)),
                    const SizedBox(height: AppSpace.md),
                    Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: types
                            .map((t) => ChoiceChip(
                                label: Text(t == 'ALL'
                                    ? 'All classifications'
                                    : humanizeEnum(t)),
                                selected: t == _type,
                                onSelected: (_) => setState(() => _type = t)))
                            .toList()),
                    if (_error != null) ...[
                      Text(_error!, style: AppText.body),
                      TextButton(onPressed: _load, child: const Text('Retry'))
                    ],
                    if (visible.isEmpty && _error == null)
                      Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(_query.trim().isNotEmpty || _type == 'ALL'
                              ? 'No matching open items.'
                              : 'No ${humanizeEnum(_type)} items available to your account.')),
                    for (final cycle in visible)
                      Padding(
                          padding: const EdgeInsets.only(top: AppSpace.md),
                          child: AppCard(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Text(
                                    (cycle['targetPosition'] ??
                                            cycle['name'] ??
                                            'Vacancy')
                                        .toString(),
                                    style: AppText.title),
                                Text(cycle['name']?.toString() ?? '',
                                    style: AppText.caption),
                                Text(
                                    '${humanizeEnum(cycle['type'])} · ${humanizeEnum(cycle['status'])}',
                                    style: AppText.caption),
                                const SizedBox(height: 8),
                                OutlinedButton(
                                    onPressed: () => _details(cycle),
                                    child: const Text('View vacancy')),
                              ]))),
                  ]),
            ),
    );
  }
}

class VacancyDetailsScreen extends StatelessWidget {
  const VacancyDetailsScreen(
      {super.key, required this.cycle, required this.user, this.profile});
  final Map<String, dynamic> cycle;
  final UserModel user;
  final PersonnelProfileModel? profile;

  @override
  Widget build(BuildContext context) {
    final reason = vacancyBlockReason(cycle);
    final config = cycle['rulesConfigurationJson'] as Map? ?? const {};
    return Scaffold(
      appBar: AppBar(title: const Text('Vacancy details')),
      body: ListView(padding: const EdgeInsets.all(AppSpace.lg), children: [
        Text((cycle['targetPosition'] ?? cycle['name'] ?? 'Vacancy').toString(),
            style: AppText.heading),
        const SizedBox(height: AppSpace.md),
        AppCard(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _detail('Open item', cycle['name']),
          _detail('Classification', humanizeEnum(cycle['type'])),
          _detail('Status', humanizeEnum(cycle['status'])),
          _detail('District', config['district'] ?? cycle['district']),
          _detail('School / office', config['school'] ?? cycle['school']),
          _detail('Applications open',
              cycle['applicationsOpenOn'] ?? formatDate(cycle['startDate'])),
          _detail('Application deadline',
              cycle['applicationsCloseOn'] ?? formatDate(cycle['endDate'])),
          _detail(
              'Eligibility',
              cycle['isEligible'] == false
                  ? cycle['ineligibilityReason']
                  : 'Subject to the system eligibility check and documentary review.'),
        ])),
        const SizedBox(height: AppSpace.lg),
        Text(
            'Viewing this vacancy does not submit an application. Choose Apply to review the checklist and attach requirements. Final submission is a separate action.',
            style: AppText.body),
        if (reason != null)
          Padding(
              padding: const EdgeInsets.only(top: AppSpace.md),
              child: Text(reason, style: AppText.body)),
        const SizedBox(height: AppSpace.lg),
        FilledButton(
            onPressed: reason != null
                ? null
                : () async {
                    final submitted = await Navigator.of(context).push<bool>(
                        MaterialPageRoute(
                            builder: (_) => PromotionChecklistScreen(
                                cycle: cycle, user: user, profile: profile)));
                    if (submitted == true && context.mounted) {
                      Navigator.of(context).pop(true);
                    }
                  },
            child: const Text('Apply for position')),
      ]),
    );
  }

  Widget _detail(String label, Object? value) => Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: AppText.caption),
        Text(
            value?.toString().trim().isNotEmpty == true
                ? value.toString()
                : 'Not specified',
            style: AppText.body),
      ]));
}
