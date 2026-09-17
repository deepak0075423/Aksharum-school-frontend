import React from 'react';
import { Badge } from '../../../components/ui/index';

/* Shared vocabulary + presentation helpers for the timetable generator pages. */

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };

export const PERIOD_TYPES  = ['Teaching', 'Break', 'Lunch', 'Activity', 'Assembly', 'Free'];
export const SUBJECT_TYPES = ['Theory', 'Practical', 'Laboratory', 'Activity', 'Sports', 'Library', 'Other'];
export const ROOM_TYPES = [
  'Classroom', 'Science Lab', 'Computer Lab', 'Physics Lab', 'Chemistry Lab',
  'Biology Lab', 'Library', 'Auditorium', 'Activity Room', 'Sports', 'Other',
];

export const STATUS_META = {
  draft:      { label: 'Draft',      variant: 'warning' },
  generating: { label: 'Generating', variant: 'info' },
  generated:  { label: 'Generated',  variant: 'info' },
  conflict:   { label: 'Conflict',   variant: 'danger' },
  validated:  { label: 'Validated',  variant: 'success' },
  published:  { label: 'Published',  variant: 'success' },
  archived:   { label: 'Archived',   variant: 'muted' },
  failed:     { label: 'Failed',     variant: 'danger' },
};

export const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || { label: status || '—', variant: 'muted' };
  return <Badge variant={m.variant}>{m.label}</Badge>;
};

/* Plain names for a single conflict row (the blocked-move dialog). Whole
   problems are explained by the server's report — see genParts.jsx. */
export const CONFLICT_LABELS = {
  TEACHER_CLASH: 'Teacher double-booked',
  CLASS_CLASH: 'Two lessons at once',
  ROOM_CLASH: 'Room double-booked',
  TEACHER_UNAVAILABLE: 'Teacher unavailable',
  ROOM_UNAVAILABLE: 'Room unavailable',
  SUBJECT_PERIOD_SHORTAGE: 'Weekly periods not met',
  ROOM_CAPACITY: 'Room too small',
  SUBJECT_TEACHER_MISMATCH: 'Teacher not assigned to the subject',
  PRACTICAL_ROOM_MISSING: 'No suitable room',
  DAILY_LIMIT_EXCEEDED: 'Over the daily limit',
  WEEKLY_LIMIT_EXCEEDED: 'Over the weekly limit',
  CONSECUTIVE_PERIOD_ERROR: 'Not back-to-back',
  NON_TEACHING_SLOT: 'Outside teaching periods',
  NO_TEACHER_ASSIGNED: 'No teacher',
  MERGE_GROUP_MISMATCH: 'Shared periods don\u2019t line up',
  TEACHER_NOT_QUALIFIED: 'No single teacher for combined sections',
  OTHER: 'Other',
};

/** Legacy rows carry only isRecess — mirror the backend's periodTypeOf(). */
export function periodTypeOf(p) {
  if (!p) return 'Teaching';
  if (p.periodType && PERIOD_TYPES.includes(p.periodType)) return p.periodType;
  if (p.isRecess) {
    const n = String(p.recessName || '').toLowerCase();
    if (n.includes('lunch')) return 'Lunch';
    if (n.includes('assembly')) return 'Assembly';
    if (n.includes('activity')) return 'Activity';
    return 'Break';
  }
  return 'Teaching';
}
export const isTeaching = (p) => periodTypeOf(p) === 'Teaching';

/** A colour per subject so the grid is scannable at a glance. */
const PALETTE = [
  { bg: '#eef2ff', fg: '#3730a3', br: '#c7d2fe' },
  { bg: '#ecfdf5', fg: '#065f46', br: '#a7f3d0' },
  { bg: '#fef3c7', fg: '#92400e', br: '#fde68a' },
  { bg: '#fce7f3', fg: '#9d174d', br: '#fbcfe8' },
  { bg: '#e0f2fe', fg: '#075985', br: '#bae6fd' },
  { bg: '#f3e8ff', fg: '#6b21a8', br: '#e9d5ff' },
  { bg: '#ffedd5', fg: '#9a3412', br: '#fed7aa' },
  { bg: '#d1fae5', fg: '#047857', br: '#6ee7b7' },
  { bg: '#e2e8f0', fg: '#334155', br: '#cbd5e1' },
  { bg: '#fee2e2', fg: '#991b1b', br: '#fecaca' },
];
export function subjectColor(subjectId) {
  if (!subjectId) return { bg: 'var(--bg)', fg: 'var(--text-muted)', br: 'var(--border)' };
  let hash = 0;
  const s = String(subjectId);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Small labelled statistic used on the generate/preview screens. */
export function Stat({ label, value, tone }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '10px 14px', minWidth: 108, flex: '1 1 108px',
    }}>
      <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: tone || 'var(--text)', marginTop: 2 }}>{value}</div>
    </div>
  );
}
