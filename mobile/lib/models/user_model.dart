enum UserRole {
  TEACHING_PERSONNEL,
  NON_TEACHING_PERSONNEL,
  AO_II,
  HRMO,
  SYSTEM_ADMIN,
}

class UserModel {
  final int id;
  final String email;
  final UserRole role;
  final String? firstName;
  final String? lastName;
  final int? personnelId;
  final bool isFirstLogin;

  UserModel({
    required this.id,
    required this.email,
    required this.role,
    this.firstName,
    this.lastName,
    this.personnelId,
    this.isFirstLogin = false,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    final idVal = rawId is int ? rawId : (int.tryParse(rawId?.toString() ?? '') ?? 0);
    final rawPId = json['personnelId'];
    final pIdVal = rawPId == null ? null : (rawPId is int ? rawPId : int.tryParse(rawPId.toString()));
    // Accepts the server field, falling back to the legacy key for older payloads.
    final rawFirstLogin = json['mustChangePassword'] ?? json['isFirstLogin'];
    final isFirstLoginVal = rawFirstLogin is bool ? rawFirstLogin : (rawFirstLogin == true);

    return UserModel(
      id: idVal,
      email: (json['email'] ?? '') as String,
      role: _parseRole((json['role'] ?? 'TEACHING_PERSONNEL') as String),
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      personnelId: pIdVal,
      isFirstLogin: isFirstLoginVal,
    );
  }

  String get fullName {
    if (firstName != null && lastName != null) {
      return '$firstName $lastName';
    }
    return email;
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'role': role.name,
      'firstName': firstName,
      'lastName': lastName,
      'personnelId': personnelId,
      'isFirstLogin': isFirstLogin,
    };
  }

  static UserRole _parseRole(String roleStr) {
    switch (roleStr.toUpperCase()) {
      case 'NON_TEACHING_PERSONNEL':
        return UserRole.NON_TEACHING_PERSONNEL;
      case 'AO_II':
        return UserRole.AO_II;
      case 'HRMO':
        return UserRole.HRMO;
      case 'SYSTEM_ADMIN':
        return UserRole.SYSTEM_ADMIN;
      case 'TEACHING_PERSONNEL':
      default:
        return UserRole.TEACHING_PERSONNEL;
    }
  }
}
