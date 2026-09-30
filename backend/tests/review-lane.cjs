require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { decideValidation, decideApproval, laneFor } = require('../src/utils/review-lane.util');

const withSwitch = (value, fn) => {
  const before = process.env.HR_DIRECT_REVIEW;
  if (value === undefined) delete process.env.HR_DIRECT_REVIEW; else process.env.HR_DIRECT_REVIEW = value;
  try { fn(); } finally { if (before === undefined) delete process.env.HR_DIRECT_REVIEW; else process.env.HR_DIRECT_REVIEW = before; }
};
const base = { actorPersonnelId: 1, subjectPersonnelId: 2, stationHasAo: true };

test('switch off: the existing workflow is unchanged (AO II validates everyone, HRMO does not)', () => {
  withSwitch(undefined, () => {
    assert.equal(laneFor('NON_TEACHING_PERSONNEL'), 'AO');
    assert.equal(decideValidation({ ...base, actorRole: 'AO_II', subjectRole: 'NON_TEACHING_PERSONNEL' }).ok, true);
    assert.equal(decideValidation({ ...base, actorRole: 'AO_II', subjectRole: 'TEACHING_PERSONNEL' }).ok, true);
    assert.equal(decideValidation({ ...base, actorRole: 'HRMO', subjectRole: 'NON_TEACHING_PERSONNEL' }).ok, false);
  });
});

test('switch on: non-teaching go to HRMO directly and AO II is refused', () => {
  withSwitch('on', () => {
    for (const subjectRole of ['NON_TEACHING_PERSONNEL', 'AO_II', 'HRMO']) {
      assert.equal(laneFor(subjectRole), 'HR');
      assert.equal(decideValidation({ ...base, actorRole: 'HRMO', subjectRole }).ok, true);
      const ao = decideValidation({ ...base, actorRole: 'AO_II', subjectRole });
      assert.equal(ao.ok, false);
      assert.match(ao.reason, /HRMO directly/);
    }
  });
});

test('switch on: teaching stays with the station AO II; HRMO covers only a station with no AO II', () => {
  withSwitch('on', () => {
    assert.equal(decideValidation({ ...base, actorRole: 'AO_II', subjectRole: 'TEACHING_PERSONNEL' }).ok, true);
    assert.equal(decideValidation({ ...base, actorRole: 'HRMO', subjectRole: 'TEACHING_PERSONNEL', stationHasAo: true }).ok, false);
    assert.equal(decideValidation({ ...base, actorRole: 'HRMO', subjectRole: 'TEACHING_PERSONNEL', stationHasAo: false }).ok, true);
  });
});

test('nobody reviews their own submission, whatever the switch says', () => {
  for (const value of [undefined, 'on']) {
    withSwitch(value, () => {
      for (const actorRole of ['AO_II', 'HRMO']) {
        const r = decideValidation({ actorRole, actorPersonnelId: 7, subjectPersonnelId: 7, subjectRole: 'NON_TEACHING_PERSONNEL', stationHasAo: false });
        assert.equal(r.ok, false);
        assert.match(r.reason, /own/);
      }
    });
  }
});

test('approval: switch off keeps HRMO-only approval', () => {
  withSwitch(undefined, () => {
    assert.equal(decideApproval({ actorRole: 'HRMO', actorUserId: 5, validatorIds: [5], otherApproverExists: true }).ok, true);
    assert.equal(decideApproval({ actorRole: 'SYSTEM_ADMIN', actorUserId: 9, validatorIds: [], otherApproverExists: false }).ok, false);
  });
});

test('approval: a different HRMO approves what an HRMO validated', () => {
  withSwitch('on', () => {
    const same = decideApproval({ actorRole: 'HRMO', actorUserId: 5, validatorIds: [5], otherApproverExists: true });
    assert.equal(same.ok, false);
    assert.match(same.reason, /different HRMO/);
    assert.equal(decideApproval({ actorRole: 'HRMO', actorUserId: 6, validatorIds: [5], otherApproverExists: true }).ok, true);
    // An AO II validated it: any HRMO may approve.
    assert.equal(decideApproval({ actorRole: 'HRMO', actorUserId: 5, validatorIds: [3], otherApproverExists: true }).ok, true);
  });
});

test('approval: the System Administrator steps in only when no other HRMO could', () => {
  withSwitch('on', () => {
    assert.equal(decideApproval({ actorRole: 'SYSTEM_ADMIN', actorUserId: 9, validatorIds: [5], otherApproverExists: true }).ok, false);
    assert.equal(decideApproval({ actorRole: 'SYSTEM_ADMIN', actorUserId: 9, validatorIds: [5], otherApproverExists: false }).ok, true);
    const lone = decideApproval({ actorRole: 'HRMO', actorUserId: 5, validatorIds: [5], otherApproverExists: false });
    assert.equal(lone.ok, false);
    assert.match(lone.reason, /System Administrator/);
  });
});
