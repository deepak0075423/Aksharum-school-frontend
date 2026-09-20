/**
 * Data hooks the admin Fees screens share. Kept apart from feeUI.jsx, which
 * never talks to the network.
 */
import { useSearchParams } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getFeesMeta } from '../../../api/fees.api';

/**
 * Years, the chosen year's classes with their sections, categories, heads and
 * the settings the forms obey. `yearId` empty = the server's default year.
 */
export function useFeesMeta(yearId) {
  const { data, refetch } = useFetch(() => getFeesMeta({ academicYearId: yearId || undefined }), [yearId]);
  return { meta: data || null, refetchMeta: refetch };
}

/** Sections of one class, as select options. */
export const sectionOptions = (meta, classId) =>
  ((meta?.classes || []).find(c => c._id === classId)?.sections || []).map(s => ({ value: s._id, label: `Section ${s.sectionName}` }));
export const classOptions = (meta) => (meta?.classes || []).map(c => ({ value: c._id, label: c.className }));

/**
 * Query-string filters: the screens are linked to (the dashboard's "View
 * pending dues" opens Student Fees on the pending tab), so what is filtered
 * lives in the URL. `defaults` names every key the screen reads.
 */
export function useUrlState(defaults) {
  const [params, setParams] = useSearchParams();
  const state = Object.fromEntries(Object.entries(defaults).map(([k, d]) => [k, params.get(k) ?? d]));
  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === null || v === undefined || v === defaults[k]) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: true });
  };
  return [state, set];
}
