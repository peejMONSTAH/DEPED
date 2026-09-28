import React from 'react';
import { AppIcon } from '../../../components/common/AppIcon';
import { ModalPortal } from '../../../components/common/ModalPortal';
import { ModalOverlay } from '../../../components/common/ModalOverlay';
import { PromotionCycleItem } from './CareerOpportunities';
import './vacancy-eligibility.css';

interface VacancyEligibilityDialogProps {
  cycle: PromotionCycleItem | null;
  onClose: () => void;
}

export const VacancyEligibilityDialog: React.FC<VacancyEligibilityDialogProps> = ({
  cycle,
  onClose,
}) => {
  if (!cycle) return null;

  const targetPosition =
    cycle.targetPosition ||
    (cycle.rulesConfigurationJson as any)?.targetPosition ||
    cycle.name;

  const reason =
    cycle.ineligibilityReason ||
    'Your current plantilla item does not meet the prescribed Civil Service qualification standards or exceeds the allowed salary grade jump limit for this cycle.';

  // "Ranking for Vacancy: Master Teacher II (OSEC-…)" -> the item number alone.
  const item = /(([^()]+))s*$/.exec(String(cycle.name || ''))?.[1] || null;

  return (
    <ModalPortal>
      <ModalOverlay onDismiss={onClose}>
        <div className="elig" role="alertdialog" aria-modal="true" aria-labelledby="elig-title" aria-describedby="elig-reason" onClick={e => e.stopPropagation()}>
          <span className="elig__icon" aria-hidden="true"><AppIcon name="warning" size={20} color="#B42318" /></span>
          <h3 id="elig-title" className="elig__title">You can't apply for this vacancy</h3>
          <p className="elig__position">{targetPosition}</p>
          {item && <p className="elig__item">{item}</p>}
          <p id="elig-reason" className="elig__reason">{reason}</p>
          <p className="elig__basis">Based on DepEd Order No. 007, s. 2023</p>
          <button type="button" className="btn btn-primary elig__ok" onClick={onClose} autoFocus>Got it</button>
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
};
