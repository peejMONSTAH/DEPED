/// One service-record row. Only what is on file is filled; salary, step,
/// status and station stay null when not recorded, and are shown as blank for
/// the issuing officer to complete rather than estimated.
class ServiceRecordModel {
  final int id;
  final String dateFrom;
  final String? dateTo;
  final String designation;
  final String? status;
  final double? monthlySalary;
  final int? salaryGrade;
  final int? stepIncrement;
  final String? stationPlace;
  final String branch;
  final String? separationCause;

  ServiceRecordModel({
    required this.id,
    required this.dateFrom,
    this.dateTo,
    required this.designation,
    this.status,
    this.monthlySalary,
    this.salaryGrade,
    this.stepIncrement,
    this.stationPlace,
    required this.branch,
    this.separationCause,
  });

  static double? _number(dynamic raw) {
    if (raw == null) return null;
    if (raw is num) return raw > 0 ? raw.toDouble() : null;
    final parsed = double.tryParse(raw.toString().replaceAll(RegExp(r'[^0-9\.]'), ''));
    return parsed != null && parsed > 0 ? parsed : null;
  }

  static String? _text(dynamic raw) {
    final value = raw?.toString().trim();
    return value == null || value.isEmpty ? null : value;
  }

  factory ServiceRecordModel.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    final idVal = rawId is int ? rawId : (int.tryParse(rawId?.toString().replaceAll(RegExp(r'[^0-9]'), '') ?? '') ?? 0);

    String desig = (json['designation'] ?? json['positionTitle'] ?? json['position_title'] ?? '').toString().trim();
    if (desig.isEmpty && json['event'] != null) {
      final evt = json['event'].toString().trim();
      final match = RegExp(r'(?:Promoted to|Appointed as|Reclassified to|Original appointment:)\s*([^\(]+)', caseSensitive: false).firstMatch(evt);
      desig = match?.group(1)?.trim() ?? evt;
    }
    if (desig.isEmpty) desig = 'Position not recorded';

    final rawDateFrom = json['dateFrom'] ?? json['date_from'] ?? json['date'] ?? '';
    final rawDateTo = json['dateTo'] ?? json['date_to'];

    return ServiceRecordModel(
      id: idVal,
      dateFrom: rawDateFrom.toString().split('T')[0],
      dateTo: rawDateTo != null ? rawDateTo.toString().split('T')[0] : null,
      designation: desig,
      status: _text(json['status']),
      monthlySalary: _number(json['monthlySalary'] ?? json['monthly_salary']),
      salaryGrade: _number(json['salaryGrade'] ?? json['salary_grade'])?.toInt(),
      stepIncrement: _number(json['stepIncrement'] ?? json['step_increment'])?.toInt(),
      stationPlace: _text(json['stationPlace'] ?? json['station_place'] ?? json['stationDepartment']),
      branch: (json['branch'] ?? 'NATIONAL').toString(),
      separationCause: _text(json['separationCause'] ?? json['separation_cause']),
    );
  }

  bool get isPresent => dateTo == null || dateTo!.isEmpty || dateTo!.toUpperCase() == 'PRESENT';

  /// "SG 12 · Step 3", "SG 12", or null when neither is on record.
  String? get gradeLabel {
    if (salaryGrade == null) return null;
    return stepIncrement == null ? 'SG $salaryGrade' : 'SG $salaryGrade · Step $stepIncrement';
  }
}
