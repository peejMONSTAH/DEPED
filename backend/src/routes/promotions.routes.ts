import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getPromotionCycles, createPromotionCycle, updatePromotionCycle,
  getRulesConfigs, createRulesConfig,
  generateRanking, getRankingResults,
  getCareerHistory, getMyServiceRecords, applyForPromotion,
  submitManualApplication, getPromotionApplications,
  submitInitialRating, submitFinalRating, getCycleLeaderboard, selectPromotionCandidate,
  getMyPromotionStatus, generateCarDocument,
} from '../controllers/promotions.controller';

const router = Router();
router.use(authenticate);

router.get('/my-promotion-status', getMyPromotionStatus);
router.get('/cycles', authorize('HRMO', 'AO_II', 'TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'), getPromotionCycles);
router.post('/cycles', authorize('HRMO'), createPromotionCycle);
router.put('/cycles/:id', authorize('HRMO'), updatePromotionCycle);
router.patch('/cycles/:id', authorize('HRMO'), updatePromotionCycle);
router.get('/cycles/:id/applications', authorize('HRMO', 'AO_II'), getPromotionApplications);
router.get('/cycles/:id/car-document', authorize('HRMO', 'AO_II'), generateCarDocument);
router.post('/cycles/:id/generate-document', authorize('HRMO', 'AO_II'), generateCarDocument);
router.post('/cycles/:id/manual-application', authorize('HRMO', 'AO_II'), submitManualApplication);
router.post('/cycles/:id/generate-ranking', authorize('HRMO', 'AO_II'), generateRanking);
router.get('/cycles/:id/ranking-results', authorize('HRMO', 'AO_II'), getRankingResults);
router.get('/cycles/:id/leaderboard', authorize('HRMO', 'AO_II'), getCycleLeaderboard);
router.post('/cycles/:id/applications/:appId/initial-rating', authorize('AO_II'), submitInitialRating);
router.post('/cycles/:id/applications/:appId/final-rating', authorize('HRMO'), submitFinalRating);
router.post('/cycles/:id/applications/:appId/select-promotion', authorize('HRMO'), selectPromotionCandidate);
router.post('/cycles/:id/apply', authorize('TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'), applyForPromotion);

router.get('/rules-configs', authorize('HRMO', 'AO_II'), getRulesConfigs);
router.post('/rules-configs', authorize('HRMO'), createRulesConfig);

router.get('/service-records', getMyServiceRecords);
router.get('/career/service-records', getMyServiceRecords);
router.get('/personnel/:personnelId/career-history', getCareerHistory);

export default router;
