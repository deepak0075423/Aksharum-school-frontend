/**
 * What the admission screens share: status names and tones (mirroring
 * school-backend/services/admission/workflow.js — the server also sends its
 * catalogue in /admin/bootstrap, which is used where it has loaded), and how
 * dates, money and sizes are written.
 */

export const STATUS = {
  draft:               { label: 'Draft', tone: 'gray' },
  submitted:           { label: 'Submitted', tone: 'blue' },
  incomplete:          { label: 'Incomplete', tone: 'amber' },
  under_review:        { label: 'Under Review', tone: 'blue' },
  documents_pending:   { label: 'Documents Pending', tone: 'amber' },
  documents_rejected:  { label: 'Documents Rejected', tone: 'red' },
  verified:            { label: 'Verified', tone: 'green' },
  eligible:            { label: 'Eligible', tone: 'green' },
  ineligible:          { label: 'Ineligible', tone: 'red' },
  exam_scheduled:      { label: 'Exam Scheduled', tone: 'indigo' },
  exam_completed:      { label: 'Exam Completed', tone: 'indigo' },
  interview_scheduled: { label: 'Interview Scheduled', tone: 'indigo' },
  interview_completed: { label: 'Interview Completed', tone: 'indigo' },
  evaluated:           { label: 'Evaluated', tone: 'violet' },
  selected:            { label: 'Selected', tone: 'green' },
  waitlisted:          { label: 'Waitlisted', tone: 'amber' },
  rejected:            { label: 'Rejected', tone: 'red' },
  offer_issued:        { label: 'Offer Issued', tone: 'teal' },
  accepted:            { label: 'Accepted', tone: 'green' },
  declined:            { label: 'Declined', tone: 'gray' },
  offer_expired:       { label: 'Offer Expired', tone: 'gray' },
  payment_pending:     { label: 'Payment Pending', tone: 'amber' },
  confirmed:           { label: 'Confirmed', tone: 'green' },
  enrolled:            { label: 'Enrolled', tone: 'green' },
  withdrawn:           { label: 'Withdrawn', tone: 'gray' },
  cancelled:           { label: 'Cancelled', tone: 'gray' },
};

export const statusLabel = (s) => STATUS[s]?.label || String(s || '').replace(/_/g, ' ');
export const statusTone = (s) => STATUS[s]?.tone || 'gray';

export const DOC_STATUS = {
  uploaded:              { label: 'Uploaded', tone: 'blue' },
  under_review:          { label: 'Under review', tone: 'blue' },
  verified:              { label: 'Verified', tone: 'green' },
  rejected:              { label: 'Rejected', tone: 'red' },
  resubmission_required: { label: 'Upload again', tone: 'amber' },
  replaced:              { label: 'Replaced', tone: 'gray' },
  none:                  { label: 'No documents', tone: 'gray' },
  missing:               { label: 'Missing', tone: 'amber' },
};

export const FEE_STATUS = {
  not_required: { label: 'Not required', tone: 'gray' },
  due:          { label: 'Due', tone: 'amber' },
  paid:         { label: 'Paid', tone: 'green' },
  waived:       { label: 'Waived', tone: 'teal' },
  refunded:     { label: 'Refunded', tone: 'gray' },
};

export const REFUND_MODES = [
  { value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'upi', label: 'UPI' },
];
export const REFUND_STATUS = { pending: ['With the gateway', 'amber'], processed: ['Refunded', 'green'], failed: ['Refused by the gateway', 'red'] };
export const INSTALMENT_STATUS = { paid: ['Paid', 'green'], part: ['Part paid', 'amber'], due: ['Due', 'gray'], overdue: ['Overdue', 'red'] };

export const OFFER_STATUS = {
  issued:    { label: 'Offered', tone: 'teal' },
  accepted:  { label: 'Accepted', tone: 'green' },
  declined:  { label: 'Declined', tone: 'gray' },
  expired:   { label: 'Expired', tone: 'gray' },
  withdrawn: { label: 'Withdrawn', tone: 'gray' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const EXAM_MODE = { online: 'Online', offline: 'Offline', interview: 'Interview' };
export const RESULTS_STATUS = {
  none: { label: 'No marks yet', tone: 'gray' }, in_progress: { label: 'Marking', tone: 'blue' },
  submitted: { label: 'Awaiting approval', tone: 'amber' }, approved: { label: 'Approved', tone: 'violet' }, published: { label: 'Published', tone: 'green' },
};
export const LIST_STATUS = {
  draft: { label: 'Draft', tone: 'gray' }, pending_approval: { label: 'Awaiting approval', tone: 'amber' }, approved: { label: 'Approved', tone: 'violet' },
  published: { label: 'Published', tone: 'green' }, closed: { label: 'Closed', tone: 'gray' }, cancelled: { label: 'Cancelled', tone: 'gray' },
};
export const LIST_METHOD = {
  merit: { label: 'Merit list', short: 'Merit', sub: 'Ranked by exam results and tie-breakers' },
  lottery: { label: 'Lottery', short: 'Lottery', sub: 'A random draw, made once, that anyone can check' },
  points_lottery: { label: 'Points, then lottery', short: 'Points + lottery', sub: 'Priority points from the form first; equal points by lot' },
};
export const DECISION = {
  selected: { label: 'Selected', tone: 'green' }, waitlisted: { label: 'Waitlisted', tone: 'amber' },
  not_selected: { label: 'Not on this list', tone: 'gray' }, excluded: { label: 'Excluded', tone: 'red' },
};

export const PAY_MODES = [
  { value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' }, { value: 'dd', label: 'Demand draft' },
  { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card (at the counter)' },
];

const DAY = { day: 'numeric', month: 'short', year: 'numeric' };
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', DAY) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { ...DAY, hour: 'numeric', minute: '2-digit' }) : '—');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');
export const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const plural = (n, one, many = `${one}s`) => `${(Number(n) || 0).toLocaleString('en-IN')} ${Number(n) === 1 ? one : many}`;
export const size = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const ago = (d) => {
  if (!d) return '';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 30 * 86400) return `${Math.round(s / 86400)} d ago`;
  return fmtDate(d);
};

/** 'YYYY-MM-DDTHH:mm' for a datetime-local input, in the browser's zone. */
export const toLocalInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
};
export const toDateInput = (d) => (toLocalInput(d) || '').slice(0, 10);

export const errMsg = (e, fallback = 'Something went wrong') => e?.data?.message || e?.message || fallback;
