import 'package:flutter_test/flutter_test.dart';
import 'package:eminence_hris_mobile/utils/display.dart';

void main() {
  group('formatDate', () {
    test('formats a date-only ISO string', () {
      expect(formatDate('2026-11-17'), '17 Nov 2026');
    });

    test('formats a full ISO timestamp', () {
      expect(formatDate('2026-08-19T04:30:00.000Z'), '19 Aug 2026');
    });

    test('falls back rather than throwing on unparseable input', () {
      expect(formatDate('not a date'), '—');
      expect(formatDate(null), '—');
      expect(formatDate(''), '—');
      expect(formatDate('   '), '—');
    });

    test('honours a custom fallback', () {
      expect(formatDate(null, fallback: 'No deadline'), 'No deadline');
    });
  });

  group('humanizeEnum', () {
    test('title-cases a screaming snake enum', () {
      expect(humanizeEnum('NATURAL_VACANCY'), 'Natural Vacancy');
      expect(humanizeEnum('SUBMITTED_TO_AO2'), 'Submitted To AO2');
    });

    test('preserves acronyms that should stay uppercase', () {
      expect(humanizeEnum('PDS'), 'PDS');
      expect(humanizeEnum('SALN_FORM'), 'SALN Form');
      expect(humanizeEnum('NBI_CLEARANCE'), 'NBI Clearance');
    });

    test('handles already-readable text without mangling it', () {
      expect(humanizeEnum('Natural Vacancy'), 'Natural Vacancy');
    });

    test('returns the fallback for empty input', () {
      expect(humanizeEnum(null), '');
      expect(humanizeEnum('  '), '');
      expect(humanizeEnum(null, fallback: 'Vacancy'), 'Vacancy');
    });
  });

  group('pluralize', () {
    test('agrees with the count', () {
      expect(pluralize(0, 'request'), '0 requests');
      expect(pluralize(1, 'request'), '1 request');
      expect(pluralize(2, 'request'), '2 requests');
    });

    test('uses an explicit plural when the word is irregular', () {
      expect(pluralize(2, 'entry', plural: 'entries'), '2 entries');
    });

    test('uses a zero label when one reads better', () {
      expect(pluralize(0, 'request', zeroLabel: 'None'), 'None');
      expect(pluralize(1, 'request', zeroLabel: 'None'), '1 request');
    });
  });

  group('splitVacancyName', () {
    test('separates the plantilla item code from the position', () {
      final result = splitVacancyName(
          'Ranking for Vacancy: Teacher V (OSEC-DECSB-TCH5-776700-2026)');
      expect(result.title, 'Teacher V');
      expect(result.code, 'OSEC-DECSB-TCH5-776700-2026');
    });

    test('drops the repeated prefix even with no code', () {
      final result =
          splitVacancyName('Ranking for Vacancy: Master Teacher III');
      expect(result.title, 'Master Teacher III');
      expect(result.code, isNull);
    });

    test('leaves an unexpected shape intact rather than mangling it', () {
      final result = splitVacancyName('Master Teacher I');
      expect(result.title, 'Master Teacher I');
      expect(result.code, isNull);
    });

    test('falls back for empty input', () {
      final result = splitVacancyName(null);
      expect(result.title, 'Promotion Vacancy');
      expect(result.code, isNull);
    });
  });
  group('isDateInPast', () {
    test('reports a past calendar day', () {
      final past = DateTime.now().subtract(const Duration(days: 2));
      expect(isDateInPast(past.toIso8601String()), isTrue);
    });

    test('does not report today as past', () {
      expect(isDateInPast(DateTime.now().toIso8601String()), isFalse);
    });

    test('does not report a future date as past', () {
      final future = DateTime.now().add(const Duration(days: 30));
      expect(isDateInPast(future.toIso8601String()), isFalse);
    });

    test('treats unreadable input as not expired', () {
      expect(isDateInPast('not a date'), isFalse);
      expect(isDateInPast(null), isFalse);
    });
  });
  group('formatPeso', () {
    test('separates thousands', () {
      expect(formatPeso(31320), contains('31,320'));
      expect(formatPeso(27000.5), contains('27,000.50'));
    });

    test('falls back for a missing amount', () {
      expect(formatPeso(null), '—');
    });
  });
  group('stripLeadingSymbols', () {
    test('drops a leading emoji and its space', () {
      expect(stripLeadingSymbols('📣 New Promotion Cycle Opened'),
          'New Promotion Cycle Opened');
      expect(stripLeadingSymbols('⚠ Promotion Cycle Cancelled'),
          'Promotion Cycle Cancelled');
    });

    test('leaves ordinary text untouched', () {
      expect(stripLeadingSymbols('Your document was approved'),
          'Your document was approved');
    });

    test('keeps a leading quote, which is real content', () {
      expect(stripLeadingSymbols('"Teacher V" is now open'),
          '"Teacher V" is now open');
    });

    test('keeps a symbol-only message rather than blanking it', () {
      expect(stripLeadingSymbols('📣'), '📣');
    });
  });
}
