enum PersonnelNoticeKind {
  transaction,
  application,
  vacancy,
  document,
  profile,
  service,
  password,
  review,
  none
}

class PersonnelNoticeRoute {
  const PersonnelNoticeRoute(this.kind, this.label,
      {this.id, this.cycleId, this.requirementId, this.webPath});
  final PersonnelNoticeKind kind;
  final String label;
  final int? id;
  final int? cycleId;
  final int? requirementId;
  final String? webPath;
}

int? noticeId(Object? value) => int.tryParse('$value');

/// Linked entities and server targets win over message keywords.
PersonnelNoticeRoute personnelNoticeRoute(Map<String, dynamic> notice) {
  final target = notice['actionTarget'] as Map?;
  final path = target?['path']?.toString();
  final uri = path == null ? null : Uri.tryParse(path);
  if (target?['kind'] != 'own' &&
      path != null &&
      path.startsWith('/admin/') &&
      !path.contains('..') &&
      !path.contains(r'\')) {
    return PersonnelNoticeRoute(PersonnelNoticeKind.review,
        target?['label']?.toString() ?? 'Open review on web',
        webPath: path);
  }
  final entity =
      (notice['relatedEntityType'] ?? notice['related_entity_type'] ?? '')
          .toString()
          .toLowerCase();
  final id = noticeId(notice['relatedEntityId'] ?? notice['related_entity_id']);
  final message = (notice['message'] ?? '').toString().toLowerCase();
  if (entity == 'transaction' || uri?.path == '/personnel/checklist') {
    return PersonnelNoticeRoute(
        PersonnelNoticeKind.transaction, 'Open requirements',
        id: noticeId(uri?.queryParameters['txId']) ?? id,
        requirementId: noticeId(uri?.queryParameters['requirement'] ??
            uri?.queryParameters['focusRequirement'] ??
            uri?.queryParameters['reqId']));
  }
  if (entity == 'promotionapplication') {
    return PersonnelNoticeRoute(
        PersonnelNoticeKind.application, 'View application',
        id: id);
  }
  if (entity == 'promotioncycle' && id != null) {
    if (RegExp(r'cancel|withdrawn|rating|score|selected|selection')
        .hasMatch(message)) {
      return PersonnelNoticeRoute(
          PersonnelNoticeKind.application, 'View application',
          cycleId: id);
    }
    return PersonnelNoticeRoute(PersonnelNoticeKind.vacancy, 'View vacancy',
        id: id);
  }
  if (entity == 'personneldocument') {
    return PersonnelNoticeRoute(PersonnelNoticeKind.document, 'View document',
        id: id);
  }
  if (uri?.path == '/personnel/vacancies') {
    final cycle = noticeId(uri?.queryParameters['cycle']);
    return uri?.queryParameters['view'] == 'details'
        ? PersonnelNoticeRoute(PersonnelNoticeKind.vacancy, 'View vacancy',
            id: cycle)
        : PersonnelNoticeRoute(
            PersonnelNoticeKind.application, 'View application',
            cycleId: cycle);
  }
  if (entity == 'accountcreationrequest') {
    return const PersonnelNoticeRoute(PersonnelNoticeKind.none, '');
  }
  if (message.contains('password')) {
    return const PersonnelNoticeRoute(
        PersonnelNoticeKind.password, 'Change password');
  }
  if (entity == 'user' || uri?.path == '/personnel/profile') {
    return const PersonnelNoticeRoute(
        PersonnelNoticeKind.profile, 'Review account');
  }
  if (message.contains('service record')) {
    return const PersonnelNoticeRoute(
        PersonnelNoticeKind.service, 'View service record');
  }
  if (uri?.path == '/personnel/transactions') {
    return const PersonnelNoticeRoute(
        PersonnelNoticeKind.application, 'View applications');
  }
  if (uri?.path == '/personnel/documents') {
    return const PersonnelNoticeRoute(
        PersonnelNoticeKind.document, 'Open 201 Files');
  }
  return const PersonnelNoticeRoute(PersonnelNoticeKind.none, '');
}
