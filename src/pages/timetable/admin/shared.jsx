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

export const SEVERITY_META = {
  ERROR:   { color: 'var(--danger)',  bg: 'rgba(239,68,68,.08)',  icon: '⛔', label: 'Error' },
  WARNING: { color: '#b45309',        bg: 'rgba(245,158,11,.10)', icon: '⚠️', label: 'Warning' },
  INFO:    { color: 'var(--info)',    bg: 'rgba(99,102,241,.08)', icon: 'ℹ️', label: 'Info' },
};

export const CONFLICT_LABELS = {
  TEACHER_CLASH: 'Teacher clash',
  CLASS_CLASH: 'Class clash',
  ROOM_CLASH: 'Room clash',
  TEACHER_UNAVAILABLE: 'Teacher unavailable',
  ROOM_UNAVAILABLE: 'Room unavailable',
  SUBJECT_PERIOD_SHORTAGE: 'Period shortage',
  ROOM_CAPACITY: 'Room capacity',
  SUBJECT_TEACHER_MISMATCH: 'Teacher not assigned to subject',
  PRACTICAL_ROOM_MISSING: 'No compatible room',
  DAILY_LIMIT_EXCEEDED: 'Daily limit exceeded',
  WEEKLY_LIMIT_EXCEEDED: 'Weekly limit exceeded',
  CONSECUTIVE_PERIOD_ERROR: 'Consecutive periods',
  NON_TEACHING_SLOT: 'Non-teaching slot',
  NO_TEACHER_ASSIGNED: 'No teacher assigned',
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

/** Empty / non-teaching cell shading used by every grid view. */
export const cellBase = {
  border: '1px solid var(--border)',
  padding: 4,
  verticalAlign: 'top',
  minWidth: 110,
  height: 56,
};

export const headCell = {
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary, #f1f5f9)',
  padding: '8px 6px',
  fontSize: '.75rem',
  fontWeight: 700,
  textAlign: 'center',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

/**
 * One period card. Draggable when `onDragStart` is supplied — the whole
 * drag-and-drop layer is native HTML5, no extra library.
 */
export function PeriodCard({ subject, teacher, room, tone, draggable, onDragStart, onClick, dim, locked, manual }) {
  return (
    <div
      draggable={!!draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      title={[subject, teacher, room].filter(Boolean).join(' · ')}
      style={{
        background: tone.bg,
        border: `1px solid ${tone.br}`,
        borderLeft: `3px solid ${tone.fg}`,
        borderRadius: 6,
        padding: '4px 6px',
        cursor: draggable ? 'grab' : (onClick ? 'pointer' : 'default'),
        opacity: dim ? 0.4 : 1,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: '.74rem', fontWeight: 700, color: tone.fg, lineHeight: 1.2, display: 'flex', gap: 3, alignItems: 'center' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subject}</span>
        {locked && <span title="Locked">🔒</span>}
        {manual && !locked && <span title="Manually edited" style={{ opacity: 0.7 }}>✎</span>}
      </div>
      {teacher && <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teacher}</div>}
      {room && <div style={{ fontSize: '.63rem', color: 'var(--text-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {room}</div>}
    </div>
  );
}

/** Shaded cell for break / lunch / assembly rows. */
export function NonTeachingCell({ type, label, colSpan }) {
  const map = {
    Lunch:    { bg: '#fef9c3', fg: '#92400e' },
    Break:    { bg: '#fef9c3', fg: '#92400e' },
    Assembly: { bg: '#e0e7ff', fg: '#3730a3' },
    Activity: { bg: '#dcfce7', fg: '#166534' },
    Free:     { bg: 'var(--bg)', fg: 'var(--text-muted)' },
  };
  const tone = map[type] || map.Break;
  return (
    <td colSpan={colSpan} style={{ ...cellBase, background: tone.bg, color: tone.fg, textAlign: 'center', fontSize: '.75rem', fontStyle: 'italic' }}>
      {label || type}
    </td>
  );
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
