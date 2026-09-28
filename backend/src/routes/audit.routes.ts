import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getAuditLogs,
  getAuditLogById,
  getAuditSummary,
  getSecurityFindings,
  exportAuditCsv,
  exportAuditJson,
  verifyAuditIntegrity,
  getRetentionPolicy,
  getComplianceReport,
  getDemographicsReport,
} from '../controllers/audit.controller';

const router = Router();
router.use(authenticate);

// ─── Query & Summary Endpoints ──────────────────────────────────────────────
router.get('/audit-logs', authorize('SYSTEM_ADMIN', 'HRMO', 'AO_II'), getAuditLogs);
router.get('/audit-logs/summary', authorize('SYSTEM_ADMIN', 'HRMO', 'AO_II'), getAuditSummary);
router.get('/audit-logs/security-findings', authorize('SYSTEM_ADMIN', 'HRMO'), getSecurityFindings);
router.get('/audit-logs/retention-policy', authorize('SYSTEM_ADMIN'), getRetentionPolicy);

// ─── Export & Integrity Endpoints ───────────────────────────────────────────
router.get('/audit-logs/export/csv', authorize('SYSTEM_ADMIN'), exportAuditCsv);
router.get('/audit-logs/export/json', authorize('SYSTEM_ADMIN'), exportAuditJson);
router.get('/audit-logs/verify-integrity', authorize('SYSTEM_ADMIN'), verifyAuditIntegrity);

// ─── Single Item Detail ─────────────────────────────────────────────────────
router.get('/audit-logs/:id', authorize('SYSTEM_ADMIN', 'HRMO', 'AO_II'), getAuditLogById);

// ─── DepEd Compliance & Demographic Reports ─────────────────────────────────
router.get('/reports/compliance-summary', authorize('SYSTEM_ADMIN'), getComplianceReport);
router.get('/reports/personnel-demographics', authorize('SYSTEM_ADMIN'), getDemographicsReport);

// ─── Strict Append-Only Immutability Guard ─────────────────────────────────
router.all('/audit-logs*', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({
      status: 'error',
      message: 'Audit trail records are immutable and append-only. Modification and deletion are strictly prohibited by system governance.',
      code: 'AUDIT_RECORD_IMMUTABLE',
    });
  }
  next();
});

export default router;
