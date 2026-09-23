import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { ratingSchema, createCycleSchema, verifyRequirementsSchema } from '../validation/promotions.schema';
import {
  getPromotionCycles, createPromotionCycle, updatePromotionCycle,
  getRulesConfigs, createRulesConfig,
  generateRanking, getRankingResults,
  getCareerHistory, getMyServiceRecords, applyForPromotion,
  submitManualApplication, getPromotionApplications,
  submitFinalRating, getCycleLeaderboard, selectPromotionCandidate,
  verifyApplicationRequirements,
  getMyPromotionStatus, generateCarDocument, getAnnexCRequirements,
} from '../controllers/promotions.controller';

const router = Router();
router.use(authenticate);

router.get('/my-promotion-status', getMyPromotionStatus);
// Reference data every role needs in order to assemble or verify a promotion pack.
router.get('/annex-c-requirements', getAnnexCRequirements);
router.get('/cycles', authorize('HRMO', 'AO_II', 'TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'), getPromotionCycles);
router.post('/cycles', authorize('HRMO'), validateBody(createCycleSchema), createPromotionCycle);
router.put('/cycles/:id', authorize('HRMO'), updatePromotionCycle);
router.patch('/cycles/:id', authorize('HRMO'), updatePromotionCycle);
router.get('/cycles/:id/applications', authorize('HRMO', 'AO_II'), getPromotionApplications);
router.get('/cycles/:id/car-document', authorize('HRMO', 'AO_II'), generateCarDocument);
router.post('/cycles/:id/generate-document', authorize('HRMO', 'AO_II'), generateCarDocument);
router.post('/cycles/:id/manual-application', authorize('HRMO', 'AO_II'), submitManualApplication);
// Re-ranks every station's applicants and reports the division-wide total, so it
// is HRMO's (BUSINESS_RULES: HRMO generates rankings). No AO II screen calls it.
router.post('/cycles/:id/generate-ranking', authorize('HRMO'), generateRanking);
router.get('/cycles/:id/ranking-results', authorize('HRMO', 'AO_II'), getRankingResults);
router.get('/cycles/:id/leaderboard', authorize('HRMO', 'AO_II'), getCycleLeaderboard);
router.post('/cycles/:id/applications/:appId/verify-requirements', authorize('AO_II', 'HRMO'), validateBody(verifyRequirementsSchema), verifyApplicationRequirements);
// The AO II stage in this system is documentary completeness verification
// (verify-requirements), not scoring — that is what the AO modal posts to. The
// initial-rating endpoint was never called by web or mobile, yet accepted score
// writes that feed ranking without passing the deliberation gate. Removed rather
// than left reachable. resolveApplicationScore still reads any historical
// initialRating already stored.
router.post('/cycles/:id/applications/:appId/final-rating', authorize('HRMO'), validateBody(ratingSchema), submitFinalRating);
router.post('/cycles/:id/applications/:appId/select-promotion', authorize('HRMO'), selectPromotionCandidate);
router.post('/cycles/:id/apply', authorize('TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'), applyForPromotion);

router.get('/rules-configs', authorize('HRMO', 'AO_II'), getRulesConfigs);
router.post('/rules-configs', authorize('HRMO'), createRulesConfig);

router.get('/service-records', getMyServiceRecords);
router.get('/career/service-records', getMyServiceRecords);
router.get('/personnel/:personnelId/career-history', getCareerHistory);

export default router;
