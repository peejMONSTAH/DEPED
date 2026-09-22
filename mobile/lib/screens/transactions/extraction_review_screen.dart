import 'package:flutter/material.dart';
import '../../services/transaction_service.dart';
import '../../utils/errors.dart';
import '../../widgets/ui_kit.dart';

/// Personnel explicitly review OCR suggestions; this never approves their official record.
class ExtractionReviewScreen extends StatefulWidget {
  final int documentId;
  final TransactionService service;
  const ExtractionReviewScreen({super.key, required this.documentId, required this.service});
  @override
  State<ExtractionReviewScreen> createState() => _ExtractionReviewScreenState();
}

class _ExtractionReviewScreenState extends State<ExtractionReviewScreen> {
  Map<String, String> _fields = {};
  bool _loading = true, _saving = false;
  String? _error;
  String _version = '';
  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final review = await widget.service.getExtractionReview(widget.documentId);
      if (!mounted) return;
      _version = review['version']?.toString() ?? '';
      setState(() => _fields = Map<String, dynamic>.from(review['fields'] ?? {}).map((key, value) => MapEntry(key, value.toString())));
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error, fallback: 'Could not load the extracted fields. Please retry.'));
    } finally { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _confirm() async {
    if (_saving) return;
    setState(() { _saving = true; _error = null; });
    try {
      await widget.service.confirmExtractionReview(widget.documentId, _fields, _version);
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error, fallback: 'Could not confirm the fields. Your edits are still here.'));
    } finally { if (mounted) setState(() => _saving = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Review extracted information')),
    body: _loading ? const Center(child: CircularProgressIndicator()) : ContentWidth(
      child: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('Check each value against your document. Correct any scan errors before confirming. AO validation and HRMO approval are still required.'),
        const SizedBox(height: 20),
        if (_error != null) ...[
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          if (_fields.isEmpty) TextButton(onPressed: _load, child: const Text('Retry')),
          const SizedBox(height: 12),
        ],
        if (_fields.isEmpty && _error == null) const Text('No fields were detected. Confirm to acknowledge manual review by your AO.'),
        for (final entry in _fields.entries) Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: TextFormField(
            key: ValueKey(entry.key), initialValue: entry.value, enabled: !_saving,
            minLines: 1, maxLines: 4, maxLength: 3000,
            decoration: InputDecoration(labelText: entry.key.replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]}').replaceAll(RegExp(r'[_.]'), ' '), counterText: ''),
            onChanged: (value) => _fields[entry.key] = value,
          ),
        ),
        if (_error == null || _fields.isNotEmpty) FilledButton(
          onPressed: _saving ? null : _confirm,
          child: Text(_saving ? 'Saving…' : 'Confirm reviewed information'),
        ),
      ]),
    ),
  );
}
