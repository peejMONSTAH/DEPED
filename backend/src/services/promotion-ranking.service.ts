import { PromotionApplicationStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { logger } from '../utils/logger';
import { isRequirementsVerified } from '../utils/promotion-stage.util';

/**
 * Promotion ranking.
 *
 * First extraction of the service layer: the scoring rules are pure functions that
 * can be unit tested without a database, and only `computeCycleRanking` touches IO.
 * The controller is left with parse → call → respond.
 */

export interface ScoreBreakdown {
  yearsOfServiceScore: number;
  trainingScore: number;
  performanceScore: number;
  seniorityScore: number;
}

export interface RankedApplication<TApp = { id: number; scoreDetailsJson: unknown; status: PromotionApplicationStatus }> {
  app: TApp;
  score: number;
  breakdown?: ScoreBreakdown;
}

const round2 = (n: number): number => parseFloat(n.toFixed(2));

/**
 * The score a ranking should use, given an application's stored rating details.
 *
 * Precedence, highest first:
 *  1. a combined total already computed by a previous ranking
 *  2. an HRMO final score, added to any AO initial score
 *  3. an AO initial score on its own
 *  4. a legacy `totalScore`, but only alongside a real rating
 * An unrated application scores 0 and therefore ranks last.
 */
export const resolveApplicationScore = (scoreDetailsJson: unknown): number => {
  const details = (scoreDetailsJson as Record<string, any>) || {};
  const initialRating = details.initialRating || null;
  const finalRating = details.finalRating || null;

  if (finalRating && typeof finalRating.overallTotalScore === 'number' && finalRating.overallTotalScore > 0) {
    return round2(finalRating.overallTotalScore);
  }
  if (finalRating && typeof finalRating.finalTotalScore === 'number' && finalRating.finalTotalScore > 0) {
    const initial = initialRating ? Number(initialRating.initialTotalScore) : Number(details.initialTotalScore || 0);
    return round2((Number.isFinite(initial) ? initial : 0) + Number(finalRating.finalTotalScore));
  }
  if (initialRating && typeof initialRating.initialTotalScore === 'number' && initialRating.initialTotalScore > 0) {
    return round2(initialRating.initialTotalScore);
  }
  if (typeof details.totalScore === 'number' && details.totalScore > 0 && (initialRating || finalRating)) {
    return round2(details.totalScore);
  }
  return 0;
};

/** An even split is a placeholder view only; it never feeds the ranking itself. */
export const scoreBreakdownFor = (score: number): ScoreBreakdown | undefined =>
  score > 0
    ? {
        yearsOfServiceScore: round2(score * 0.25),
        trainingScore: round2(score * 0.25),
        performanceScore: round2(score * 0.25),
        seniorityScore: round2(score * 0.25),
      }
    : undefined;

/** Highest score first. Ties keep their existing relative order. */
export const rankApplications = <TApp extends { scoreDetailsJson: unknown }>(apps: TApp[]): RankedApplication<TApp>[] =>
  apps
    .map(app => {
      const score = resolveApplicationScore(app.scoreDetailsJson);
      return { app, score, breakdown: scoreBreakdownFor(score) };
    })
    .sort((a, b) => b.score - a.score);

/**
 * Ranks a cycle and persists the result.
 *
 * Returns null when ranking failed, so a caller can tell that apart from a cycle
 * with nothing to rank. Every rank and the cycle's RESULTS_READY flag commit together.
 */
export const computeCycleRanking = async (cycleId: number) => {
  try {
    const cycle = await prisma.promotionCycle.findUnique({
      where: { id: cycleId },
      include: {
        promotionApplications: {
          include: { personnel: { include: { careerHistoryEntries: true, plantillaItem: true } } },
        },
      },
    });
    if (!cycle) return [];

    // Only applications AO II has verified belong in the comparative ranking.
    // Unverified ones used to rank with a zero score, which put them on the
    // leaderboard and made them selectable straight from it.
    const eligible = cycle.promotionApplications.filter(a => isRequirementsVerified(a.scoreDetailsJson));
    const pending = cycle.promotionApplications.filter(a => !isRequirementsVerified(a.scoreDetailsJson));
    if (pending.length > 0) {
      logger.info(
        { cycleId, excluded: pending.length, ranked: eligible.length },
        'Applications held out of ranking pending AO II verification',
      );
    }

    const ranked = rankApplications(eligible);

    // Writes are sequential: an interactive transaction must not be driven concurrently.
    await prisma.$transaction(async tx => {
      for (const [index, entry] of ranked.entries()) {
        const details = (entry.app.scoreDetailsJson as Record<string, any>) || {};
        const hasRating = Boolean(details.initialRating || details.finalRating);
        const currentInitial = details.initialRating?.initialTotalScore ?? (hasRating ? (details.initialTotalScore ?? 0) : 0);
        const updatedFinalRating = details.finalRating
          ? { ...details.finalRating, overallTotalScore: entry.score }
          : undefined;

        await tx.promotionApplication.update({
          where: { id: entry.app.id },
          data: {
            finalRank: index + 1,
            scoreDetailsJson: {
              ...details,
              totalScore: hasRating ? entry.score : 0,
              initialTotalScore: hasRating ? currentInitial : 0,
              ...(updatedFinalRating ? { finalRating: updatedFinalRating } : {}),
              breakdown: hasRating ? (details.breakdown || entry.breakdown) : undefined,
            },
            // stageStatus in scoreDetailsJson is a display label ('FINAL_RANKED', ...),
            // never a PromotionApplicationStatus. Only the stored enum belongs here.
            status: entry.app.status,
          },
        });
      }

      // An application can lose its verification (AO II re-marks it INCOMPLETE).
      // Drop the stale rank so it cannot keep showing a leaderboard position.
      const staleRanked = pending.filter(a => a.finalRank !== null).map(a => a.id);
      if (staleRanked.length > 0) {
        await tx.promotionApplication.updateMany({ where: { id: { in: staleRanked } }, data: { finalRank: null } });
      }

      await tx.promotionCycle.update({ where: { id: cycleId }, data: { status: 'RESULTS_READY' } });
    }, { timeout: 20000 });

    return ranked;
  } catch (err) {
    logger.error({ err, cycleId }, 'Failed to compute promotion cycle ranking');
    return null;
  }
};
