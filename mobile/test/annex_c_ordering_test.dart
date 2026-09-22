import 'package:flutter_test/flutter_test.dart';
import 'package:eminence_hris_mobile/models/promotion_checklist_model.dart';

/// Annex C requirements are stored in DepEd Order No. 007 s. 2023 order — the
/// codes a to k. That order means something to the issuing office and nothing
/// to a teacher scanning the list for "Transcript of Records", so the screen
/// sorts by the name it shows.
///
/// These pin the ordering contract rather than the current requirement list,
/// so adding or renaming a requirement cannot silently change the behaviour.
PromotionChecklistItem item(String code, String title) => PromotionChecklistItem(
      code: code,
      title: title,
      description: '',
      isMandatory: true,
    );

void main() {
  group('sortedByTitle', () {
    test('orders by the name shown on screen, not the stored code', () {
      final sorted = PromotionChecklistItem.sortedByTitle([
        item('a', 'Transcript of Records'),
        item('b', 'Application Letter'),
        item('c', 'Diploma'),
      ]);
      expect(sorted.map((i) => i.title).toList(),
          ['Application Letter', 'Diploma', 'Transcript of Records']);
    });

    test('is case-insensitive', () {
      final sorted = PromotionChecklistItem.sortedByTitle([
        item('a', 'diploma'),
        item('b', 'Application Letter'),
        item('c', 'DIPLOMA COPY'),
      ]);
      expect(sorted.first.title, 'Application Letter');
      expect(sorted[1].title, 'diploma');
      expect(sorted[2].title, 'DIPLOMA COPY');
    });

    test('ignores surrounding whitespace', () {
      final sorted = PromotionChecklistItem.sortedByTitle([
        item('a', '  Zebra'),
        item('b', 'Apple  '),
      ]);
      expect(sorted.map((i) => i.title.trim()).toList(), ['Apple', 'Zebra']);
    });

    test('is stable for identical names, keyed on the unique code', () {
      // Without a tiebreaker two same-named items could swap between rebuilds,
      // making the list appear to shuffle after an upload.
      final sorted = PromotionChecklistItem.sortedByTitle([
        item('k', 'Other'),
        item('c', 'Other'),
        item('f', 'Other'),
      ]);
      expect(sorted.map((i) => i.code).toList(), ['c', 'f', 'k']);
    });

    test('does not sort the caller list in place', () {
      // These items carry upload state that other screens hold references to.
      final original = [item('a', 'Zebra'), item('b', 'Apple')];
      final sorted = PromotionChecklistItem.sortedByTitle(original);
      expect(original.map((i) => i.title).toList(), ['Zebra', 'Apple'],
          reason: 'the input list must be untouched');
      expect(sorted.map((i) => i.title).toList(), ['Apple', 'Zebra']);
    });

    test('keeps each requirement whole, not just its name', () {
      final source = [
        item('a', 'Zebra')..isSubmitted = true,
        item('b', 'Apple')..remarks = 'needs a clearer scan',
      ];
      final sorted = PromotionChecklistItem.sortedByTitle(source);
      expect(sorted.first.title, 'Apple');
      expect(sorted.first.remarks, 'needs a clearer scan');
      expect(sorted.last.title, 'Zebra');
      expect(sorted.last.isSubmitted, isTrue);
    });

    test('names starting with a digit or symbol are ordered consistently', () {
      final sorted = PromotionChecklistItem.sortedByTitle([
        item('a', 'Beta'),
        item('b', '2nd Endorsement'),
        item('c', 'Alpha'),
      ]);
      // Whatever the platform collation, the result must be deterministic and
      // must not drop an entry.
      expect(sorted.length, 3);
      expect(sorted.map((i) => i.code).toSet(), {'a', 'b', 'c'});
      final twice = PromotionChecklistItem.sortedByTitle(sorted);
      expect(twice.map((i) => i.code).toList(),
          sorted.map((i) => i.code).toList(),
          reason: 'sorting an already sorted list must not change it');
    });

    test('an empty list is handled', () {
      expect(PromotionChecklistItem.sortedByTitle([]), isEmpty);
    });

    test('the bundled Annex C list comes out alphabetical', () {
      final sorted = PromotionChecklistItem.sortedByTitle(
        PromotionChecklistItem.defaultAnnexCRequirements(),
      );
      final titles = sorted.map((i) => i.title.trim().toLowerCase()).toList();
      final expected = [...titles]..sort();
      expect(titles, expected);
      expect(sorted.length,
          PromotionChecklistItem.defaultAnnexCRequirements().length,
          reason: 'sorting must not drop a requirement');
    });
  });
}
