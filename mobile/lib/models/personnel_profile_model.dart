class PersonnelProfileModel {
  final int id;
  final String employeeId;
  final String firstName;
  final String? middleName;
  final String lastName;
  final String? extensionName;
  final String positionTitle;
  final String plantillaItemNo;
  final int? salaryGrade;
  final int? stepIncrement;
  final String stationName;
  final String personnelType;
  final String? mobileNo;
  final String? email;
  final String? birthDate;
  final String? gender;
  final String? civilStatus;
  final String? address;
  final String? dateHired;

  PersonnelProfileModel({
    required this.id,
    required this.employeeId,
    required this.firstName,
    this.middleName,
    required this.lastName,
    this.extensionName,
    required this.positionTitle,
    required this.plantillaItemNo,
    this.salaryGrade,
    this.stepIncrement,
    required this.stationName,
    required this.personnelType,
    this.mobileNo,
    this.email,
    this.birthDate,
    this.gender,
    this.civilStatus,
    this.address,
    this.dateHired,
  });

  factory PersonnelProfileModel.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    final idVal = rawId is int ? rawId : (int.tryParse(rawId?.toString() ?? '') ?? 0);

    final plantilla = json['plantillaItem'] is Map<String, dynamic>
        ? (json['plantillaItem'] as Map<String, dynamic>)
        : <String, dynamic>{};

    final userObj = json['user'] is Map<String, dynamic>
        ? (json['user'] as Map<String, dynamic>)
        : <String, dynamic>{};

    final roleObj = userObj['role'] is Map<String, dynamic>
        ? (userObj['role'] as Map<String, dynamic>)
        : <String, dynamic>{};

    final roleName = (roleObj['name'] ?? userObj['role'] ?? json['personnelType'] ?? 'TEACHING_PERSONNEL').toString();
    final cleanRole = roleName.replaceAll('_', ' ');

    final rawBirth = json['birthDate'] ?? json['birth_date'];
    String? formattedBirth;
    if (rawBirth != null) {
      formattedBirth = rawBirth.toString().split('T')[0];
    }

    final rawHired = json['dateHired'] ?? json['date_hired'];
    String? formattedHired;
    if (rawHired != null) {
      formattedHired = rawHired.toString().split('T')[0];
    }

    final empId = (json['employeeId'] ?? json['employee_id'] ?? 'EMP-2026-0000').toString();
    final fName = (json['firstName'] ?? json['first_name'] ?? '').toString();
    final mName = (json['middleName'] ?? json['middle_name'])?.toString();
    final lName = (json['lastName'] ?? json['last_name'] ?? '').toString();
    final extName = (json['suffix'] ?? json['extensionName'] ?? json['extension_name'])?.toString();
    String desig = (json['designation'] ?? '').toString().trim();
    final plantillaTitle = (plantilla['positionTitle'] ?? '').toString().trim();
    final jsonPositionTitle = (json['positionTitle'] ?? '').toString().trim();

    if (desig.isEmpty || desig.toLowerCase() == 'deped personnel') {
      if (plantillaTitle.isNotEmpty) {
        desig = plantillaTitle;
      } else if (jsonPositionTitle.isNotEmpty) {
        desig = jsonPositionTitle;
      }
    }

    // Check career history entries for recent approved appointment/promotion
    if (json['careerHistoryEntries'] is List && (json['careerHistoryEntries'] as List).isNotEmpty) {
      final entries = json['careerHistoryEntries'] as List;
      for (final e in entries) {
        if (e is Map && e['detailsJson'] is Map && e['detailsJson']['newDesignation'] != null) {
          final newDesig = e['detailsJson']['newDesignation'].toString().trim();
          if (newDesig.isNotEmpty) {
            desig = newDesig;
            break;
          }
        }
      }
    }

    // Check promotion applications for approved appointment or selected promotion
    if (json['promotionApplications'] is List && (json['promotionApplications'] as List).isNotEmpty) {
      final apps = json['promotionApplications'] as List;
      for (final a in apps) {
        if (a is Map) {
          final scoreDetails = a['scoreDetailsJson'] is Map ? a['scoreDetailsJson'] as Map : {};
          final isAppApproved = a['status'] == 'APPROVED' || scoreDetails['appointmentApproved'] == true || scoreDetails['manuallyPromoted'] == true;
          if (isAppApproved) {
            final cycle = a['promotionCycle'] is Map ? a['promotionCycle'] as Map : {};
            final rules = cycle['rulesConfigurationJson'] is Map ? cycle['rulesConfigurationJson'] as Map : {};
            final targetPos = (rules['targetPosition'] ?? scoreDetails['targetPosition'])?.toString().trim();
            if (targetPos != null && targetPos.isNotEmpty) {
              desig = targetPos;
              break;
            }
          }
        }
      }
    }

    if (desig.isEmpty) {
      // Do not guess a rank. Defaulting an absent designation to "Teacher I" or
      // "Administrative Officer" states someone's position as fact when the
      // server did not supply one, which on a 201 record is a claim the app has
      // no basis for.
      desig = 'Position not recorded';
    }

    final rawItemNo = (plantilla['itemNumber'] ?? json['plantillaItemNo'] ?? '').toString().trim();
    final itemNo = rawItemNo.isNotEmpty ? rawItemNo : 'Pending Item Assignment';
    // Grade and step are shown only when on record, never assumed.
    final sg = int.tryParse(plantilla['salaryGrade']?.toString() ?? json['salaryGrade']?.toString() ?? '');
    final step = int.tryParse(json['stepIncrement']?.toString() ?? json['step_increment']?.toString() ?? '');
    final station = (plantilla['department'] ?? json['school'] ?? json['stationName'] ?? 'Station not recorded').toString();
    final mob = (json['contactNumber'] ?? json['mobileNo'] ?? json['mobile_no'])?.toString();
    final mail = (userObj['email'] ?? json['email'])?.toString();

    return PersonnelProfileModel(
      id: idVal,
      employeeId: empId,
      firstName: fName,
      middleName: mName,
      lastName: lName,
      extensionName: extName,
      positionTitle: desig,
      plantillaItemNo: itemNo,
      salaryGrade: sg,
      stepIncrement: step,
      stationName: station,
      personnelType: cleanRole,
      mobileNo: mob,
      email: mail,
      birthDate: formattedBirth,
      gender: json['gender']?.toString(),
      civilStatus: json['civilStatus']?.toString(),
      address: json['address']?.toString(),
      dateHired: formattedHired,
    );
  }

  String get fullName {
    final mid = (middleName != null && middleName!.isNotEmpty) ? ' ${middleName![0]}.' : '';
    final ext = (extensionName != null && extensionName!.isNotEmpty) ? ' $extensionName' : '';
    return '$firstName$mid $lastName$ext';
  }
}
