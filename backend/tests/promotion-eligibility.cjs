require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkPromotionEligibility, resolveCanonicalPosition } = require('../src/utils/deped.util');

test('resolveCanonicalPosition resolves standard and aliased DepEd positions', () => {
  const t1 = resolveCanonicalPosition('Teacher I');
  assert.equal(t1?.canonicalTitle, 'Teacher I');
  assert.equal(t1?.ladderName, 'TEACHING');
  assert.equal(t1?.ladderIndex, 0);

  const t3 = resolveCanonicalPosition('Teacher III');
  assert.equal(t3?.canonicalTitle, 'Teacher III');
  assert.equal(t3?.ladderIndex, 2);

  const t4 = resolveCanonicalPosition('Teacher IV');
  assert.equal(t4?.canonicalTitle, 'Teacher IV');
  assert.equal(t4?.ladderIndex, 3);

  const mt3 = resolveCanonicalPosition('Ranking for Vacancy: Master Teacher III (OSEC-DECSB-TCH3-666850-2026)');
  assert.equal(mt3?.canonicalTitle, 'Master Teacher III');
  assert.equal(mt3?.ladderName, 'TEACHING');
  assert.equal(mt3?.ladderIndex, 9);

  const ao2 = resolveCanonicalPosition('Administrative Officer II - Matulas Elementary School (District 1)');
  assert.equal(ao2?.canonicalTitle, 'Administrative Officer II');
  assert.equal(ao2?.ladderName, 'ADMIN_OFFICER');
  assert.equal(ao2?.ladderIndex, 1);
});

test('Natural Vacancy allows jumping 1 or 2 positions, disallows 3+ jumps', () => {
  // 1 jump: Teacher I -> Teacher II
  const res1 = checkPromotionEligibility('Teacher I', 'Teacher II', 'NATURAL_VACANCY');
  assert.equal(res1.isEligible, true);
  assert.equal(res1.jump, 1);
  assert.equal(res1.maxAllowedJump, 2);

  // 2 jumps: Teacher I -> Teacher III
  const res2 = checkPromotionEligibility('Teacher I', 'Teacher III', 'NATURAL_VACANCY');
  assert.equal(res2.isEligible, true);
  assert.equal(res2.jump, 2);
  assert.equal(res2.maxAllowedJump, 2);

  // 3 jumps: Teacher I -> Teacher IV (MUST BE DISALLOWED for Natural Vacancy)
  const res3 = checkPromotionEligibility('Teacher I', 'Teacher IV', 'NATURAL_VACANCY');
  assert.equal(res3.isEligible, false);
  assert.equal(res3.jump, 3);
  assert.match(res3.reason || '', /Under Natural Vacancy rules/);
  assert.match(res3.reason || '', /maximum of 1 to 2 positions/);

  // 2 jumps: Teacher II -> Teacher IV (ALLOWED)
  const res4 = checkPromotionEligibility('Teacher II', 'Teacher IV', 'NATURAL_VACANCY');
  assert.equal(res4.isEligible, true);
  assert.equal(res4.jump, 2);
});

test('ECP (Expanded Career Progression) allows jumping up to 3 positions, disallows 4+ jumps', () => {
  // 1 jump: Teacher I -> Teacher II
  const res1 = checkPromotionEligibility('Teacher I', 'Teacher II', 'ECP');
  assert.equal(res1.isEligible, true);
  assert.equal(res1.jump, 1);
  assert.equal(res1.maxAllowedJump, 3);

  // 2 jumps: Teacher I -> Teacher III
  const res2 = checkPromotionEligibility('Teacher I', 'Teacher III', 'ECP');
  assert.equal(res2.isEligible, true);
  assert.equal(res2.jump, 2);

  // 3 jumps: Teacher I -> Teacher IV (ALLOWED for ECP)
  const res3 = checkPromotionEligibility('Teacher I', 'Teacher IV', 'ECP');
  assert.equal(res3.isEligible, true);
  assert.equal(res3.jump, 3);
  assert.equal(res3.maxAllowedJump, 3);

  // 4 jumps: Teacher I -> Teacher V (MUST BE DISALLOWED for ECP)
  const res4 = checkPromotionEligibility('Teacher I', 'Teacher V', 'ECP');
  assert.equal(res4.isEligible, false);
  assert.equal(res4.jump, 4);
  assert.match(res4.reason || '', /Under Expanded Career Progression \(ECP\) rules/);
  assert.match(res4.reason || '', /maximum of up to 3 positions/);
});

test('Disallows applying for same position or lower position', () => {
  // Same position
  const same = checkPromotionEligibility('Teacher III', 'Teacher III', 'NATURAL_VACANCY');
  assert.equal(same.isEligible, false);
  assert.equal(same.jump, 0);
  assert.match(same.reason || '', /already hold this position/);

  // Lower position
  const lower = checkPromotionEligibility('Teacher III', 'Teacher I', 'NATURAL_VACANCY');
  assert.equal(lower.isEligible, false);
  assert.equal(lower.jump, -2);
  assert.match(lower.reason || '', /lower than your current position/);
});

test('Disallows large jumps across Master Teacher tiers (e.g. Teacher III -> Master Teacher III)', () => {
  // Teacher III (index 2) to Master Teacher III (index 9) = 7 jumps
  const largeJump = checkPromotionEligibility('Teacher III', 'Ranking for Vacancy: Master Teacher III (OSEC-DECSB-TCH3-666850-2026)', 'NATURAL_VACANCY');
  assert.equal(largeJump.isEligible, false);
  assert.equal(largeJump.jump, 7);
  assert.match(largeJump.reason || '', /7-position jump and is not permitted/);
});

test('Disallows career track mismatch (e.g. Non-Teaching to Teaching)', () => {
  const mismatch = checkPromotionEligibility('Administrative Officer II', 'Teacher III', 'NATURAL_VACANCY');
  assert.equal(mismatch.isEligible, false);
  assert.match(mismatch.reason || '', /Career track mismatch/);

  const mismatch2 = checkPromotionEligibility('Teacher III', 'Administrative Officer IV', 'NATURAL_VACANCY');
  assert.equal(mismatch2.isEligible, false);
  assert.match(mismatch2.reason || '', /Career track mismatch/);
});

test('Handles Administrative Officer ladder progression properly', () => {
  // AO II (index 1) to AO IV (index 2) = 1 jump
  const aoProgression = checkPromotionEligibility(
    'Administrative Officer II - Matulas Elementary School (District 1)',
    'Administrative Officer IV',
    'NATURAL_VACANCY'
  );
  assert.equal(aoProgression.isEligible, true);
  assert.equal(aoProgression.jump, 1);
});
