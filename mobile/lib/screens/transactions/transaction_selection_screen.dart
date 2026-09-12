import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/transaction_model.dart';
import '../../services/api_service.dart';
import '../../services/transaction_service.dart';
import '../../theme/app_theme.dart';

class TransactionSelectionScreen extends StatefulWidget {
  const TransactionSelectionScreen({Key? key}) : super(key: key);

  @override
  State<TransactionSelectionScreen> createState() => _TransactionSelectionScreenState();
}

class _TransactionSelectionScreenState extends State<TransactionSelectionScreen> {
  late final ApiService _apiService;
  late final TransactionService _transactionService;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _apiService = ApiService();
    _transactionService = TransactionService(_apiService);
  }

  void _showIneligibleModal(String message) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppTheme.darkBgCard,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border.all(color: AppTheme.darkBorder),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: AppTheme.statusPending.withOpacity(0.15),
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.statusPending.withOpacity(0.3)),
              ),
              child: const Icon(LucideIcons.shieldAlert, color: AppTheme.statusPending, size: 28),
            ),
            const SizedBox(height: 16),
            const Text(
              'Ineligible for Promotion Appointment',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.statusReturned.withOpacity(0.15),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.statusReturned.withOpacity(0.3)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(LucideIcons.triangleAlert, size: 14, color: AppTheme.statusReturned),
                  SizedBox(width: 6),
                  Text(
                    'You are ineligible yet',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.statusReturned),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Text(
              message,
              style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary, height: 1.5),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.accentLime,
                  foregroundColor: AppTheme.brandDark,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                ),
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Understood', style: TextStyle(color: AppTheme.brandDark, fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  void _handleSelectType(TransactionType type) async {
    setState(() => _isLoading = true);

    if (type == TransactionType.PROMOTION) {
      final promoStatus = await _transactionService.checkPromotionStatus();
      if (promoStatus['isPromoted'] != true && promoStatus['isPendingApproval'] != true) {
        setState(() => _isLoading = false);
        _showIneligibleModal(
          promoStatus['message'] ??
              'Our system now fully revolves around the promotion cycles. You must be selected by HRMO in an active Promotion Cycle before you can upload documents for Promotion Appointment.',
        );
        return;
      }
    }

    try {
      final transaction = await _transactionService.initiateTransaction(type);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Transaction ${transaction.referenceNo} initiated successfully!'),
          backgroundColor: AppTheme.emeraldGreen,
        ),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        final errorMsg = e.toString();
        if (errorMsg.contains('ineligible')) {
          _showIneligibleModal('You are ineligible yet. Selection by HRMO in a Promotion Cycle is required.');
        } else {
          final demoTx = TransactionModel(
            id: DateTime.now().millisecondsSinceEpoch,
            referenceNo: 'TRX-${DateTime.now().millisecond}',
            type: type,
            status: TransactionStatus.DRAFT,
            complianceScore: 0.0,
            createdAt: DateTime.now().toIso8601String(),
            updatedAt: DateTime.now().toIso8601String(),
            requirements: RequirementItemModel.generateDefaultRequirements(type),
          );
          _transactionService.saveLocalTransaction(demoTx);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Transaction ${demoTx.referenceNo} created!'),
              backgroundColor: AppTheme.emeraldGreen,
            ),
          );
          Navigator.of(context).pop(true);
        }
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ignore: unused_element
  List<RequirementItemModel> _generateDefaultRequirements(TransactionType type) {
    if (type == TransactionType.PROMOTION) {
      return [
        RequirementItemModel(id: 1, documentName: 'Oath of Office (REVISED 2025)', isMandatory: true, description: '3 original copies — REVISED 2025 Oath of Office'),
        RequirementItemModel(id: 2, documentName: 'Omnibus Certification of Authenticity & Veracity', isMandatory: true, description: '1 original copy — Signed & omnibus certification'),
        RequirementItemModel(id: 3, documentName: 'Personal Data Sheet (CSC Form 212 Revised 2025)', isMandatory: true, description: '2 sets original, Long size paper, back-to-back print'),
        RequirementItemModel(id: 4, documentName: 'Work Experience Sheet (CS Form 212 Attachment)', isMandatory: true, description: '2 original copies — Arranged in DESCENDING ORDER (coinciding w/ PDS No. 28)'),
        RequirementItemModel(id: 5, documentName: 'PRC ID / CSC Eligibility Verification', isMandatory: true, description: '1 original copy — Official verification printout'),
        RequirementItemModel(id: 6, documentName: 'VALID PRC ID Card', isMandatory: false, description: '1 photocopy (if applicable)'),
        RequirementItemModel(id: 7, documentName: 'PRC Board Rating', isMandatory: false, description: '1 photocopy (if applicable)'),
        RequirementItemModel(id: 8, documentName: 'CSC Certificate of Eligibility', isMandatory: false, description: '1 photocopy (if applicable)'),
        RequirementItemModel(id: 9, documentName: 'Principal\'s Test Certificate of Rating', isMandatory: false, description: '1 photocopy (For Promotion of School Principal / Head of Office)'),
        RequirementItemModel(id: 10, documentName: 'CAV, Special Order, AND Official Transcript of Records (TOR)', isMandatory: true, description: '1 photocopy each — Graduate Studies, College, Prof. Educ. Units'),
        RequirementItemModel(id: 11, documentName: 'VALID NC II / NC III / TMC / NTTC Certificate', isMandatory: false, description: '1 photocopy each (if applicable)'),
        RequirementItemModel(id: 12, documentName: 'Latest SALN (Revised 2025)', isMandatory: true, description: '1 photocopy (back-to-back print) — Downloadable online'),
        RequirementItemModel(id: 13, documentName: 'SALN Justification Letter', isMandatory: false, description: '1 photocopy (in absence of Spouse\'s signature on SALN, if applicable)'),
        RequirementItemModel(id: 14, documentName: 'PSA Marriage Certificate', isMandatory: false, description: '1 photocopy (if applicable)'),
        RequirementItemModel(id: 15, documentName: 'PSA Birth Certificate', isMandatory: true, description: '1 photocopy — PSA authenticated birth certificate'),
        RequirementItemModel(id: 16, documentName: 'Latest Service Record', isMandatory: true, description: '1 original copy — Updated service record signed by Division head'),
        RequirementItemModel(id: 17, documentName: 'Latest DepEd Payslip', isMandatory: true, description: '1 photocopy — Most recent monthly payslip showing current SG/Step'),
        RequirementItemModel(id: 18, documentName: 'Latest Performance Rating (IPCRF / OPCRF)', isMandatory: true, description: '1 photocopy — IPCRF for Teaching & Non-Teaching / OPCRF for School Head'),
      ];
    } else if (type == TransactionType.NEWLY_HIRED) {
      return [
        RequirementItemModel(id: 10, documentName: 'CS Form 33 (Appointment Form)', isMandatory: true),
        RequirementItemModel(id: 11, documentName: 'CS Form 212 (PDS) & WES', isMandatory: true),
        RequirementItemModel(id: 12, documentName: 'CS Form 211 (Medical Certificate)', isMandatory: true, description: 'With Blood, Urinalysis, and X-Ray results'),
        RequirementItemModel(id: 13, documentName: 'CS Form 32 (Oath of Office)', isMandatory: true),
        RequirementItemModel(id: 14, documentName: 'NBI Clearance (Valid)', isMandatory: true),
        RequirementItemModel(id: 15, documentName: 'PRC License / CSC Eligibility', isMandatory: true),
      ];
    } else {
      return [
        RequirementItemModel(id: 20, documentName: 'NOSA / NOSI Notice Form', isMandatory: true),
        RequirementItemModel(id: 21, documentName: 'Updated Service Record', isMandatory: true),
        RequirementItemModel(id: 22, documentName: 'Latest DepEd Payslip', isMandatory: true),
      ];
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Initiate 201 Transaction')),
      body: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Select Transaction Type',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Select the transaction to automatically generate your dynamic compliance checklist.',
                  style: TextStyle(fontSize: 13, color: Colors.grey),
                ),
                const SizedBox(height: 20),

                // Option 1: Promotion
                _buildTransactionCard(
                  title: 'Promotion Appointment',
                  subtitle: 'For personnel advancing in rank, position, or salary grade (e.g., Teacher I to Teacher III).',
                  icon: LucideIcons.trendingUp,
                  color: AppTheme.emeraldGreen,
                  onTap: () => _handleSelectType(TransactionType.PROMOTION),
                ),
                const SizedBox(height: 14),

                // Option 2: Newly Hired
                _buildTransactionCard(
                  title: 'Newly Hired Appointment',
                  subtitle: 'For newly appointed personnel submitting initial 201 file documents and oath of office.',
                  icon: LucideIcons.userPlus,
                  color: AppTheme.secondaryNavy,
                  onTap: () => _handleSelectType(TransactionType.NEWLY_HIRED),
                ),
              ],
            ),
          ),
          if (_isLoading)
            Container(
              color: Colors.black26,
              child: const Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }

  Widget _buildTransactionCard({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(18.0),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(subtitle, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  ],
                ),
              ),
              const Icon(LucideIcons.arrowRight, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }
}
