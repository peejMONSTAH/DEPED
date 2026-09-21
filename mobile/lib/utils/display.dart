import 'package:intl/intl.dart';

/// Presentation-layer formatting.
///
/// These helpers only change how existing values are displayed. They do not
/// touch stored data, request payloads or business rules — a document's status
/// is still `PENDING_VALIDATION` everywhere except on screen.

final DateFormat _dayMonthYear = DateFormat('d MMM yyyy');

/// `2026-11-17` or a full ISO timestamp becomes `17 Nov 2026`.
///
/// Returns [fallback] when the value is absent or unparseable, so a malformed
/// date from the API shows a dash instead of an exception or a raw string.
String formatDate(Object? isoDate, {String fallback = '—'}) {
  if (isoDate == null) return fallback;
  final raw = isoDate.toString().trim();
  if (raw.isEmpty) return fallback;
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return fallback;
  return _dayMonthYear.format(parsed);
}

/// Formats a peso amount with thousands separators: 31320.0 -> ₱31,320.00.
///
/// Monthly salaries were rendered with toStringAsFixed(2) alone, so a five
/// figure amount ran together as ₱31320.00 and was hard to read at a glance.
final NumberFormat _peso = NumberFormat.currency(locale: 'en_PH', symbol: '₱');

String formatPeso(num? amount) {
  if (amount == null) return '—';
  return _peso.format(amount);
}

/// Removes decorative symbols from the start of a server-supplied message.
///
/// Notification text arrives with a leading emoji, which sits next to an icon
/// that already conveys the same thing. Anything before the first letter,
/// digit or quote is dropped; a message that starts with real text is
/// returned unchanged.
/// Leading emoji, pictographs, arrows, dingbats and their variation selectors.
///
/// Deliberately an allow-list of symbol ranges rather than "anything that is
/// not a letter": a negated-letter class silently eats real text when the regex
/// engine does not honour the property escape, which is exactly what happened
/// here — "Your document was approved" came back as "pproved".
final RegExp _leadingSymbols = RegExp(
  r'^(?:[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]|\s)+',
  unicode: true,
);

String stripLeadingSymbols(Object? value) {
  final raw = value?.toString() ?? '';
  if (raw.isEmpty) return raw;
  final cleaned = raw.replaceFirst(_leadingSymbols, '').trim();
  // If stripping leaves nothing, the message was only symbols - keep it.
  return cleaned.isEmpty ? raw.trim() : cleaned;
}

/// True when [isoDate] falls strictly before today.
///
/// Compared by calendar day, not by instant, so a document expiring later today
/// is not reported as already expired. Unparseable input returns false: an
/// unreadable date should not be presented as an expiry that has passed.
bool isDateInPast(Object? isoDate) {
  if (isoDate == null) return false;
  final parsed = DateTime.tryParse(isoDate.toString().trim());
  if (parsed == null) return false;
  final now = DateTime.now();
  return DateTime(parsed.year, parsed.month, parsed.day)
      .isBefore(DateTime(now.year, now.month, now.day));
}

/// `NATURAL_VACANCY` becomes `Natural Vacancy`.
///
/// Database enums were being rendered verbatim to teachers. Acronyms that
/// should stay uppercase are preserved via [_keepUppercase].
const Set<String> _keepUppercase = {
  'AO',
  'CAV',
  'CSC',
  'HR',
  'HRMO',
  'ID',
  'IPCR',
  'NBI',
  'OPCR',
  'PDS',
  'PRC',
  'PSA',
  'SALN',
  'WES',
};

String humanizeEnum(Object? value, {String fallback = ''}) {
  if (value == null) return fallback;
  final raw = value.toString().trim();
  if (raw.isEmpty) return fallback;

  final words = raw.split(RegExp(r'[_\s]+')).where((w) => w.isNotEmpty);
  if (words.isEmpty) return fallback;

  return words.map((word) {
    final upper = word.toUpperCase();
    if (_keepUppercase.contains(upper)) return upper;
    // Role acronyms carry a level, e.g. AO2 and HRMO1. Match on the letters
    // so the digit does not stop the acronym being recognised.
    final letters = upper.replaceAll(RegExp(r'\d+$'), '');
    if (letters.isNotEmpty && _keepUppercase.contains(letters)) return upper;
    return word[0].toUpperCase() + word.substring(1).toLowerCase();
  }).join(' ');
}

/// `0 Request` was wrong; this gives `No requests`, `1 request`, `2 requests`.
///
/// [zeroLabel] lets a caller say "None" where that reads better than "No x".
String pluralize(
  int count,
  String singular, {
  String? plural,
  String? zeroLabel,
}) {
  if (count == 0 && zeroLabel != null) return zeroLabel;
  final word = count == 1 ? singular : (plural ?? '${singular}s');
  return '$count $word';
}

/// Strips a trailing parenthesised plantilla item code from a cycle name so the
/// position can be shown as the title and the code as secondary detail.
///
/// `Ranking for Vacancy: Teacher V (OSEC-DECSB-TCH5-776700-2026)` splits into
/// `Teacher V` and `OSEC-DECSB-TCH5-776700-2026`. Anything that does not match
/// this shape is returned unchanged with a null code, so an unexpected name is
/// still shown in full rather than being mangled.
({String title, String? code}) splitVacancyName(Object? value) {
  final raw = value?.toString().trim() ?? '';
  if (raw.isEmpty) return (title: 'Promotion Vacancy', code: null);

  var title = raw;
  String? code;

  final codeMatch = RegExp(r'^(.*?)\s*\(([^()]+)\)\s*$').firstMatch(title);
  if (codeMatch != null) {
    title = codeMatch.group(1)!.trim();
    code = codeMatch.group(2)!.trim();
  }

  // "Ranking for Vacancy: Teacher V" -> "Teacher V". The prefix repeats on
  // every card and carries no information once the section is titled.
  final colonIndex = title.indexOf(':');
  if (colonIndex != -1 && colonIndex < title.length - 1) {
    final after = title.substring(colonIndex + 1).trim();
    if (after.isNotEmpty) title = after;
  }

  return (title: title.isEmpty ? raw : title, code: code);
}
