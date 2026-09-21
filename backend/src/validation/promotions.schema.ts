import { z } from 'zod';
import { PromotionCycleType, PromotionCycleStatus } from '@prisma/client';

/**
 * Schemas for the promotion endpoints that decide who gets promoted.
 *
 * Scores are capped at their DepEd maximums (DO 007 s.2023) rather than merely
 * checked for being numbers: an out-of-range score silently reorders a ranking.
 * Objects are intentionally non-strict — handlers read additional optional fields —
 * but every value that reaches a score calculation is bounded here.
 */

const score = (max: number) =>
  z.coerce.number().min(0, 'cannot be negative').max(max, `cannot exceed ${max}`).optional();

export const ratingSchema = z.object({
  track: z.enum(['TEACHING', 'NON_TEACHING']).optional(),

  // Teaching track — 100 points total
  educationScore: score(30),
  trainingScore: score(30),
  experienceScore: score(30),
  performanceScore: score(40),
  ppstCoiScore: score(40),
  ppstNcoiScore: score(30),

  // Non-teaching track
  outstandingAccomplishmentsScore: score(30),
  applicationOfEducationScore: score(30),
  applicationOfLdScore: score(30),
  potentialScore: score(50),
  potentialWrittenScore: score(30),
  potentialBeiScore: score(30),
  potentialSkillsScore: score(30),

  remarks: z.string().max(2000).optional(),
  forBackgroundInvestigation: z.string().max(200).optional(),
  forAppointment: z.string().max(500).optional(),
  forProbation: z.string().max(200).optional(),
  itemVerifications: z.array(z.object({
    code: z.string().max(10),
    status: z.string().max(40),
    remarks: z.string().max(1000).optional().nullable(),
  }).passthrough()).max(60).optional(),
});

export const createCycleSchema = z.object({
  name: z.string().trim().min(3, 'must be at least 3 characters').max(200),
  type: z.nativeEnum(PromotionCycleType),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.nativeEnum(PromotionCycleStatus).optional(),
  rulesConfigurationJson: z.record(z.any()).nullable().optional(),
}).refine(v => v.endDate >= v.startDate, {
  message: 'endDate must not be before startDate',
  path: ['endDate'],
});

export const verifyRequirementsSchema = z.object({
  status: z.enum(['COMPLETE', 'INCOMPLETE']),
  remarks: z.string().max(2000).optional(),
  itemVerifications: z.array(z.object({
    code: z.string().max(10),
    status: z.string().max(40),
    remarks: z.string().max(1000).optional().nullable(),
  }).passthrough()).max(60).optional(),
});
