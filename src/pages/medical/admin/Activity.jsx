/**
 * Activity Log (Oct 2026) — the medical audit trail: who created, changed,
 * archived, uploaded or administered — and who opened a student's record,
 * history, emergency profile or a file.
 */
import React from 'react';
import { Page, PageHead, Badge, Empty, Select } from '../mdUI';
import { fmtStamp, fmtDay } from '../mdMeta';
import { useBoard, BoardPanel, DateFilter } from './mdList';

const ENTITY = {
  profile: 'Profile', history: 'History', emergency_profile: 'Emergency profile', visit: 'Visit', incident: 'Incident', request: 'Request',
  first_aid: 'First aid', allergy: 'Allergy', condition: 'Condition', vaccination: 'Vaccination', checkup: 'Checkup', document: 'Document',
  dose: 'Dose', medication_plan: 'Medication plan', medicine: 'Medicine', supply: 'Supply', batch: 'Batch', equipment: 'Equipment', bed: 'Bed',
  change_request: 'Parent update', settings: 'Settings', report: 'Report', teacher_alerts: 'Teacher alerts',
};

const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/;
const words = (k) => String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();

/** One value of a change. New entries arrive readable; older ones kept a raw
 *  timestamp, or an object as JSON — shown in words here, never as code. */
function value(v) {
  if (v === null || v === undefined || v === '' || v === '{}' || v === '[]') return '—';
  const s = String(v);
  if (ISO.test(s)) return s.length === 10 || /T00:00:00(\.0+)?Z$/.test(s) ? fmtDay(s) : fmtStamp(s);
  if (/^[{[]/.test(s)) {
    try {
      const o = JSON.parse(s);
      return Object.entries(o).filter(([, x]) => x !== null && x !== '').map(([k, x]) => `${words(k)} ${typeof x === 'object' ? '…' : x}`).join(', ') || '—';
    } catch { return 'updated'; }
  }
  return s;
}
const changeText = (c) => `${words(c.field).replace(/^./, (x) => x.toUpperCase())}: ${value(c.from)} → ${value(c.to)}`;

export default function MedicalActivity() {
  const board = useBoard('audit', { tab: 'all' });
  const columns = [
    { key: 'createdAt', label: 'When', render: (r) => fmtStamp(r.createdAt), csv: (r) => fmtStamp(r.createdAt) },
    { key: 'actorName', label: 'Who', primary: true, render: (r) => <span className="md-two"><b>{r.actorName || 'System'}</b><em>{String(r.actorRole || '').replace('_', ' ')}</em></span> },
    { key: 'action', label: 'Action', render: (r) => <Badge tone={r.action === 'viewed' ? 'slate' : r.action === 'archived' ? 'red' : r.action === 'administered' ? 'violet' : 'indigo'} size="sm">{r.action.replace(/_/g, ' ')}</Badge> },
    { key: 'entity', label: 'Record', render: (r) => ENTITY[r.entity] || r.entity, csv: (r) => ENTITY[r.entity] || r.entity },
    { key: 'studentName', label: 'Student', render: (r) => r.studentName || <span className="md-none">—</span> },
    { key: 'summary', label: 'Detail', render: (r) => (
      <span className="md-two" style={{ maxWidth: 420 }}>
        <b style={{ fontWeight: 500, whiteSpace: 'normal' }}>{r.summary}</b>
        {(r.changes || []).length ? <em style={{ whiteSpace: 'normal' }}>{r.changes.slice(0, 4).map(changeText).join(' · ')}</em> : null}
      </span>
    ) },
  ];
  return (
    <Page>
      <PageHead icon="history" tone="slate" title="Activity Log" subtitle="Every change to a medical record and every time one was opened — who, what and when. Medical information is sensitive; this is its trail." />
      <BoardPanel board={board} columns={columns} noun="entry" many="entries" searchPlaceholder="Search person, student or detail" exportName="medical-activity-log" minWidth={900}
        filters={<><Select value={board.q.entity} onChange={(v) => board.setQ({ entity: v })} all="Any record" label="Record" options={Object.entries(ENTITY).map(([value, label]) => ({ value, label }))} /><DateFilter q={board.q} setQ={board.setQ} /></>}
        empty={<Empty compact title="Nothing recorded">Actions in the Medical Room are recorded here as they happen.</Empty>} />
    </Page>
  );
}
