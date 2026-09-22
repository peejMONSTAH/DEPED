import 'package:flutter_test/flutter_test.dart';
import 'package:eminence_hris_mobile/models/transaction_model.dart';

void main() {
  test('rejected, abandoned and unknown states never become editable drafts', () {
    for (final status in ['REJECTED','ABANDONED','ARCHIVED','FUTURE_STATE']) {
      final tx = TransactionModel.fromJson({'id': 1, 'status': status});
      expect(tx.status, isNot(TransactionStatus.DRAFT));
      expect(tx.status, isNot(TransactionStatus.RETURNED_BY_AO2));
    }
  });
  test('server checklist and mandatory percentage survive parsing and caching', () {
    final tx = TransactionModel.fromJson({
      'id':5,'status':'DEFICIENCY','complianceScore':50,
      'transactionType':{'name':'Newly Hired Appointment','requirementTemplates':[
        {'id':20,'name':'Diploma','isMandatory':true},
        {'id':21,'name':'Birth Certificate','isMandatory':true},
      ]},
      'uploadedDocuments':[{'requirementTemplateId':20,'fileName':'test.pdf','status':'VALIDATED'}],
    });
    expect(tx.type,TransactionType.NEWLY_HIRED);
    expect(tx.complianceScore,50);
    expect(tx.requirements.length,2);
    expect(tx.requirements.last.isUploaded,false);
    expect(TransactionModel.fromJson(tx.toJson()).complianceScore,50);
  });
  test('OCR review status and document identity survive offline caching', () {
    final tx = TransactionModel.fromJson({
      'id': 12, 'status': 'DRAFT',
      'transactionType': {'name': 'Promotion', 'requirementTemplates': [{'id': 80, 'name': 'PDS', 'isMandatory': true}]},
      'uploadedDocuments': [{'id': 18, 'requirementTemplateId': 80, 'fileName': 'pds.pdf', 'status': 'OCR_PROCESSED', 'ocrExtractedDataJson': {'fields': {}}}],
    });
    final cached = TransactionModel.fromJson(tx.toJson());
    expect(cached.requirements.single.documentId, 18);
    expect(cached.requirements.single.needsExtractionReview, true);
  });
}
