/**
 * What the Results screens call things, in one place.
 *
 * The lifecycle itself — which status may follow which, and who may take each
 * step — lives on the server (school-backend/services/resultExams.js) and
 * arrives with every row as `stage`, `attention` and `can`. Nothing here
 * decides anything; it only names and colours what the server reports.
 */

/** The card's tabs: one per stage, in the order an exam moves through them. */
export const TABS = [
  { key: 'all', label: 'All Exams' },
  { key: 'draft', label: 'Drafts' },
  { key: 'marks', label: 'Mark Entry' },
  { key: 'validation', label: 'Pending Validation' },
  { key: 'published', label: 'Published' },
  { key: 'archived', label: 'Archived' },
];

/**
 * A status as a pill. Draft is neutral, the two "someone is working" states
 * are amber, the two "waiting for a decision" states blue and violet; red is
 * kept for the one that went wrong.
 */
export const STATUS = {
  DRAFT:          { label: 'Draft',              tone: 'slate',  stage: 'draft' },
  MARKS_PENDING:  { label: 'Mark Entry',         tone: 'amber',  stage: 'marks' },
  REOPENED:       { label: 'Reopened',           tone: 'amber',  stage: 'marks' },
  REJECTED:       { label: 'Rejected',           tone: 'red',    stage: 'marks' },
  SUBMITTED:      { label: 'Pending Validation', tone: 'blue',   stage: 'validation' },
  CLASS_APPROVED: { label: 'Ready to Publish',   tone: 'violet', stage: 'validation' },
  FINAL_APPROVED: { label: 'Published',          tone: 'green',  stage: 'published' },
};
export const statusOf = (s) => STATUS[s] || { label: s || '—', tone: 'slate', stage: 'draft' };

/** The Status filter offers only what can sit under the tab being looked at. */
export const statusOptions = (tab) => Object.entries(STATUS)
  .filter(([, v]) => tab === 'all' || tab === 'archived' || v.stage === tab)
  .map(([value, v]) => ({ value, label: v.label }));

/**
 * The three kinds every exam type behaves as. A school names its own types
 * (Results → Settings: "Half Yearly", "Pre-Board"), each counting as one of
 * these — the server sends them with the form's options and on every row as
 * `examTypeLabel`. This list is only what to show before they arrive.
 */
export const EXAM_TYPES = [
  { value: 'MID_TERM', label: 'Mid Term', kind: 'MID_TERM' },
  { value: 'FINAL', label: 'Final', kind: 'FINAL' },
  { value: 'UNIT_TEST', label: 'Unit Test', kind: 'UNIT_TEST' },
];
export const typeLabel = (t) => EXAM_TYPES.find((x) => x.value === t)?.label || String(t || '').replace(/_/g, ' ');
/** An exam's type as its school calls it. */
export const examTypeText = (r) => r?.examTypeLabel || typeLabel(r?.examType);

/**
 * Why an exam is waiting on the office — the note under a row's status, and
 * the button that takes the step. Keys are the server's `attention` values.
 */
export const ATTENTION = {
  publish:  { note: '',                        why: 'The marks are validated and ready to publish.',                     act: 'Publish results',        step: 'publish',  icon: 'checkCircle', kind: 'primary' },
  reopen:   { note: 'Reopen to correct',       why: 'The marks were rejected. Reopen the exam so they can be corrected.', act: 'Reopen for correction',  step: 'reopen',   icon: 'refresh',     kind: 'warn', red: true },
  validate: { note: 'No class teacher',        why: 'This section has no class teacher, so the marks are waiting for you to validate.', act: 'Validate marks', step: 'validate', icon: 'shieldCheck', kind: 'soft' },
  open:     { note: 'Exam is over',            why: 'The exam is over and mark entry has not been opened.',               act: 'Open mark entry',        step: 'open',     icon: 'unlock',      kind: 'soft' },
  marks:    { note: 'No subject teacher',      why: 'A subject on this exam has no teacher in this section — its marks are waiting for the office.', act: 'Enter marks', step: 'marks', icon: 'clipboard', kind: 'soft' },
};

/** A tile's view, as the chip above the table says it. */
export const VIEWS = {
  attention: { label: 'Pending actions', tone: 'red' },
  progress:  { label: 'In progress', tone: 'amber' },
};

/**
 * A grade's colour. Each school grades on its own scale (A+ to F, CBSE's A1 to
 * E2, its own), so this cannot be a fixed table: absent is grey, a grade the
 * scale calls failing is red, and a passing one is coloured by its letter —
 * A green, B blue, C and D amber. `scale` is any list of { grade, pass } the
 * page has (the server's scale rows, or a summary's grades); without one the
 * letter alone decides.
 */
const LETTER_TONE = { A: 'green', O: 'green', B: 'blue', C: 'amber', D: 'amber', E: 'red', F: 'red' };
export function gradeTone(grade, scale) {
  const g = String(grade || '').trim();
  if (!g || g.toUpperCase() === 'AB') return 'slate';
  const band = Array.isArray(scale) ? scale.find((b) => b?.grade === g) : null;
  if (band && band.pass === false) return 'red';
  const tone = LETTER_TONE[g.charAt(0).toUpperCase()];
  // A grade the scale calls passing is never red, whatever its letter.
  if (band) return tone && tone !== 'red' ? tone : 'blue';
  return tone || 'indigo';
}

/** The percentages a grade covers — "91–100%", "Below 33%" — from the server's scale rows. */
export function gradeRange(b) {
  if (b?.from === null || b?.from === undefined) return '';
  if (Number(b.from) === 0 && Number(b.to) < 100) {
    const next = Number.isInteger(Number(b.to)) ? Number(b.to) + 1 : Math.round((Number(b.to) + 0.01) * 100) / 100;
    return `Below ${next}%`;
  }
  return Number(b.from) === Number(b.to) ? `${b.from}%` : `${b.from}–${b.to}%`;
}

export const classLine = (r) => [r?.className, r?.sectionName].filter(Boolean).join(' – ') || '—';
