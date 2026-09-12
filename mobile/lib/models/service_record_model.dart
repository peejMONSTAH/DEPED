class ServiceRecordModel {
  final int id;
  final String dateFrom;
  final String? dateTo;
  final String designation;
  final String status; // PERMANENT, PROVISIONAL, SUBSTITUTE
  final double monthlySalary;
  final int salaryGrade;
  final int stepIncrement;
  final String stationPlace;
  final String branch; // NATIONAL, LOCAL
  final String? separationCause;

  ServiceRecordModel({
    required this.id,
    required this.dateFrom,
    this.dateTo,
    required this.designation,
    required this.status,
    required this.monthlySalary,
    required this.salaryGrade,
    required this.stepIncrement,
    required this.stationPlace,
    required this.branch,
    this.separationCause,
  });

  factory ServiceRecordModel.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    final idVal = rawId is int ? rawId : (int.tryParse(rawId?.toString().replaceAll(RegExp(r'[^0-9]'), '') ?? '') ?? 0);

    final rawSal = json['monthlySalary'] ?? json['monthly_salary'] ?? json['salary'] ?? 0;
    final salVal = rawSal is num ? rawSal.toDouble() : (double.tryParse(rawSal.toString().replaceAll(RegExp(r'[^0-9\.]'), '')) ?? 0.0);

    final rawSg = json['salaryGrade'] ?? json['salary_grade'] ?? 11;
    final sgVal = rawSg is int ? rawSg : (int.tryParse(rawSg.toString().replaceAll(RegExp(r'[^0-9]'), '')) ?? 11);

    final rawStep = json['stepIncrement'] ?? json['step_increment'] ?? 1;
    final stepVal = rawStep is int ? rawStep : (int.tryParse(rawStep.toString().replaceAll(RegExp(r'[^0-9]'), '')) ?? 1);

    String desig = (json['designation'] ?? json['positionTitle'] ?? json['position_title'] ?? '').toString().trim();
    if (desig.isEmpty && json['event'] != null) {
      final evt = json['event'].toString().trim();
      final match = RegExp(r'(?:Promoted to|Appointed as|Initial Appointment:)\s*([^\(]+)', caseSensitive: false).firstMatch(evt);
      if (match != null && match.group(1) != null) {
        desig = match.group(1)!.trim();
      } else {
        desig = evt;
      }
    }
    if (desig.isEmpty) {
      desig = 'Teaching Personnel';
    }

    final rawDateFrom = json['dateFrom'] ?? json['date_from'] ?? json['date'] ?? '';
    final dateFromStr = rawDateFrom.toString().split('T')[0];

    final rawDateTo = json['dateTo'] ?? json['date_to'];
    final dateToStr = rawDateTo != null ? rawDateTo.toString().split('T')[0] : null;

    return ServiceRecordModel(
      id: idVal,
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      designation: desig,
      status: (json['status'] ?? 'PERMANENT').toString(),
      monthlySalary: salVal,
      salaryGrade: sgVal,
      stepIncrement: stepVal,
      stationPlace: (json['stationPlace'] ?? json['station_place'] ?? json['stationDepartment'] ?? 'SDO Koronadal City').toString(),
      branch: (json['branch'] ?? 'NATIONAL').toString(),
      separationCause: (json['separationCause'] ?? json['separation_cause'])?.toString(),
    );
  }

  bool get isPresent => dateTo == null || dateTo!.isEmpty || dateTo!.toUpperCase() == 'PRESENT';
}
