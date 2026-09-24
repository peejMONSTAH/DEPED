import React from 'react';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import { AppIcon } from '../../components/common/AppIcon';
import './candidate-dossier-modal.css';

type Criterion = { label: string; score: number; max: number };

interface CandidateDossierModalProps {
  applicant: any;
  isTeachingTrack: boolean;
  canDeliberate: boolean;
  onDeliberate: () => void;
  onClose: () => void;
}

const PASSING_SCORE = 50;
const num = (...values: unknown[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '' && !Number.isNaN(Number(value))) return Number(value);
  }
  return 0;
};
const fmt = (value: number) => value.toFixed(2);

const CriteriaGroup: React.FC<{ title: string; items: Criterion[]; deliberated: boolean }> = ({ title, items, deliberated }) => {
  const subtotal = items.reduce((sum, item) => sum + item.score, 0);
  const max = items.reduce((sum, item) => sum + item.max, 0);
  return (
    <div className="dossier-criteria">
      <div className="dossier-criteria-head">
        <span>{title}</span>
        <span className="dossier-mono">{deliberated ? fmt(subtotal) : '—'} / {max}</span>
      </div>
      <ul>
        {items.map(item => (
          <li key={item.label}>
            <span className="dossier-criteria-label">{item.label}</span>
            <span className="dossier-meter" aria-hidden="true">
              <span style={{ width: `${deliberated ? Math.min(100, (item.score / item.max) * 100) : 0}%` }} />
            </span>
            <span className="dossier-mono dossier-criteria-score">
              {deliberated ? fmt(item.score) : '—'} <small>/ {item.max}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** HR's read-only view of one candidate's CAR evaluation: documents, scores and appointment status. */
export const CandidateDossierModal: React.FC<CandidateDossierModalProps> = ({
  applicant, isTeachingTrack, canDeliberate, onDeliberate, onClose,
}) => {
  const details = applicant.scoreDetailsJson || {};
  const finalRating = details.finalRating || {};
  const initialRating = details.initialRating || {};
  const reqCheck = details.requirementsCheck;

  const pick = (key: string, fallbackToInitial = true) =>
    num(finalRating[key], applicant[key], fallbackToInitial ? initialRating[key] : undefined);

  const basic: Criterion[] = [
    { label: 'Education', score: pick('educationScore'), max: 10 },
    { label: 'Training', score: pick('trainingScore'), max: 10 },
    { label: 'Experience', score: pick('experienceScore'), max: 10 },
    { label: 'Performance', score: pick('performanceScore'), max: isTeachingTrack ? 30 : 20 },
    ...(isTeachingTrack ? [] : [
      { label: 'Outstanding accomplishments', score: pick('outstandingAccomplishmentsScore'), max: 5 },
      { label: 'Application of education', score: pick('applicationOfEducationScore'), max: 15 },
      { label: 'Application of L&D', score: pick('applicationOfLdScore'), max: 10 },
    ]),
  ];
  const track: Criterion[] = isTeachingTrack
    ? [
        { label: 'PPST COIs (demo teaching)', score: pick('ppstCoiScore', false), max: 25 },
        { label: 'PPST NCOIs (portfolio & BEI)', score: pick('ppstNcoiScore', false), max: 15 },
      ]
    : [
        { label: 'Written examination', score: pick('potentialWrittenScore', false), max: 5 },
        { label: 'Behavioral event interview', score: pick('potentialBeiScore', false), max: 5 },
        { label: 'Skills / work sample test', score: pick('potentialSkillsScore', false), max: 10 },
      ];

  const deliberated = Boolean(
    applicant.hasHrmoRating ||
    finalRating.overallTotalScore !== undefined ||
    finalRating.finalTotalScore !== undefined ||
    Number(applicant.overallTotalScore) > 0,
  );
  const computedTotal = [...basic, ...track].reduce((sum, item) => sum + item.score, 0);
  const totalScore = num(finalRating.overallTotalScore, applicant.overallTotalScore, computedTotal);
  const passes = totalScore >= PASSING_SCORE;

  const reqStatus = reqCheck?.status === 'COMPLETE' || details.stageStatus === 'REQUIREMENTS_VERIFIED'
    ? 'verified'
    : reqCheck?.status === 'INCOMPLETE' || details.stageStatus === 'REQUIREMENTS_DEFICIENT'
      ? 'deficient'
      : 'pending';
  const reqLabel = { verified: 'Verified complete', deficient: 'Deficient', pending: 'Awaiting AO II' }[reqStatus];

  const checklistItems: any[] = Array.isArray(details.annexCChecklist?.items) ? details.annexCChecklist.items : [];
  const attached = checklistItems.filter(item => item?.submitted || item?.isSubmitted || item?.personnelDocumentId).length;
  const omnibusCertified = Boolean(details.annexCChecklist?.applicantInfo?.omnibusSwornStatement);

  const aoRemarks = reqCheck?.remarks || applicant.initialDetails?.aoRemarks || initialRating.aoRemarks;
  const hrRemarks = finalRating.hrmoRemarks || applicant.finalDetails?.hrmoRemarks || (deliberated ? applicant.remarks : undefined);

  const bi = applicant.forBackgroundInvestigation || details.forBackgroundInvestigation;
  const appointment = applicant.forAppointment || details.forAppointment;
  const probation = applicant.forProbation || details.forProbation;

  const initials = String(applicant.name || '').split(' ').filter(Boolean).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase() || 'AP';
  const applicantNo = applicant.applicantNumber || `APP-${String(applicant.id).padStart(4, '0')}`;

  return (
    <ModalOverlay onDismiss={onClose} className="modal-overlay dossier-overlay" onClick={onClose}>
      <div
        className="dossier animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dossier-title"
        onClick={event => event.stopPropagation()}
      >
        <header className="dossier-header">
          <div className="dossier-avatar" aria-hidden="true">{initials}</div>
          <div className="dossier-identity">
            <span className="dossier-eyebrow">CAR evaluation dossier</span>
            <h2 id="dossier-title">{applicant.name}</h2>
            <p>
              {applicant.designation || 'Candidate'}
              {applicant.station && <> · {applicant.station}</>}
            </p>
          </div>
          <span className="dossier-chip dossier-mono">{applicantNo}</span>
          {/* panel-close-button is the one class the global button rule exempts;
              under that rule's forced padding a 36px button left no room for the icon. */}
          <button
            type="button"
            className="panel-close-button"
            onClick={event => { event.stopPropagation(); onClose(); }}
            aria-label="Close details"
            title="Close details (Esc)"
          >
            <AppIcon name="close" size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="dossier-body">
          <section className={`dossier-score ${deliberated ? '' : 'is-awaiting'}`} aria-label="Total CAR score">
            <div className="dossier-score-main">
              <span className="dossier-label">Total CAR score</span>
              <div className="dossier-score-value">
                <strong className="dossier-mono">{deliberated ? fmt(totalScore) : '—'}</strong>
                <span>/ 100</span>
              </div>
              <span className={`dossier-status ${!deliberated ? 'is-neutral' : passes ? 'is-good' : 'is-bad'}`}>
                {!deliberated ? 'Not yet deliberated' : passes ? 'Meets the passing score' : 'Below the passing score'}
              </span>
            </div>
            <div className="dossier-score-side">
              <div className="dossier-bar" aria-hidden="true">
                <span style={{ width: `${deliberated ? Math.min(100, totalScore) : 0}%` }} />
                <i style={{ left: `${PASSING_SCORE}%` }} title="Passing score" />
              </div>
              <dl className="dossier-facts">
                <div><dt>Rank</dt><dd>{deliberated && applicant.rank ? `#${applicant.rank}` : '—'}</dd></div>
                <div><dt>Track</dt><dd>{isTeachingTrack ? 'Teaching' : 'Non-teaching'}</dd></div>
                <div><dt>Passing</dt><dd>{PASSING_SCORE} pts</dd></div>
              </dl>
            </div>
          </section>

          <section className="dossier-section">
            <div className="dossier-section-head">
              <span className="dossier-step">1</span>
              <h3>Documentary check</h3>
              <span className="dossier-subtle">AO II · Annex C</span>
              <span className={`dossier-status is-${reqStatus === 'verified' ? 'good' : reqStatus === 'deficient' ? 'bad' : 'neutral'}`}>{reqLabel}</span>
            </div>
            <dl className="dossier-grid">
              <div><dt>Verified by</dt><dd>{reqCheck?.verifiedByName || (reqStatus === 'pending' ? '—' : 'Administrative Officer II')}</dd></div>
              <div><dt>Annex C documents</dt><dd>{checklistItems.length ? `${attached} of ${checklistItems.length} attached` : 'No checklist submitted'}</dd></div>
              <div><dt>Omnibus sworn statement</dt><dd className={omnibusCertified ? 'is-good-text' : 'is-warn-text'}>{omnibusCertified ? 'Certified' : 'Pending'}</dd></div>
            </dl>
            {aoRemarks && <blockquote className="dossier-remarks"><span>AO II remarks</span>{aoRemarks}</blockquote>}
          </section>

          <section className="dossier-section">
            <div className="dossier-section-head">
              <span className="dossier-step">2</span>
              <h3>HRMPSB deliberation</h3>
              <span className="dossier-subtle">100 points</span>
              <span className={`dossier-status ${deliberated ? 'is-good' : 'is-neutral'}`}>{deliberated ? 'Scored' : 'Pending'}</span>
            </div>
            <div className="dossier-criteria-wrap">
              <CriteriaGroup title="Basic qualifications" items={basic} deliberated={deliberated} />
              <CriteriaGroup title={isTeachingTrack ? 'PPST observations & portfolio' : 'Potential & examinations'} items={track} deliberated={deliberated} />
            </div>
            {hrRemarks && <blockquote className="dossier-remarks"><span>HRMPSB remarks</span>{hrRemarks}</blockquote>}
          </section>

          <section className="dossier-section">
            <div className="dossier-section-head">
              <span className="dossier-step">3</span>
              <h3>Appointment recommendation</h3>
            </div>
            <dl className="dossier-grid">
              <div><dt>Background investigation</dt><dd className={bi === 'NO' ? 'is-bad-text' : bi ? 'is-good-text' : ''}>{bi === 'NO' ? 'Not cleared' : bi ? 'Cleared' : '—'}</dd></div>
              <div><dt>Recommendation</dt><dd>{deliberated && appointment ? appointment : '—'}</dd></div>
              <div><dt>Probation period</dt><dd>{deliberated && probation ? probation : '—'}</dd></div>
            </dl>
          </section>
        </div>

        {canDeliberate && (
          <footer className="dossier-footer">
            <button type="button" className="btn btn-primary dossier-action" onClick={onDeliberate}>
              <AppIcon name="approvals" size={15} color="#ffffff" />
              {deliberated ? 'Revise deliberation' : 'Deliberate & score'}
            </button>
          </footer>
        )}
      </div>
    </ModalOverlay>
  );
};
