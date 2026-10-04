import { useEffect, useState } from 'react';
import apiClient from './client';

export interface WorkflowFeatures { hrDirectReview: boolean; newHiring: boolean }
let cached: WorkflowFeatures | null = null;
let inflight: Promise<WorkflowFeatures> | null = null;

const load = (): Promise<WorkflowFeatures> => {
  inflight ??= apiClient.get('/users/workflow-features')
    .then(r => (cached = { hrDirectReview: Boolean(r.data?.data?.hrDirectReview), newHiring: Boolean(r.data?.data?.newHiring) }))
    .catch(() => (cached = { hrDirectReview: false, newHiring: false })) // Unknown means off: show only what always works.
    .finally(() => { inflight = null; });
  return inflight;
};

/** Optional workflow features the server has switched on. Everything is off until the answer arrives. */
export const useWorkflowFeatures = (): WorkflowFeatures => {
  const [features, setFeatures] = useState<WorkflowFeatures>(cached ?? { hrDirectReview: false, newHiring: false });
  useEffect(() => {
    let live = true;
    if (!cached) void load().then(f => { if (live) setFeatures(f); });
    return () => { live = false; };
  }, []);
  return features;
};
