/**
 * Rescue Medicines (Oct 2026) — every auto-injector, reliever inhaler,
 * glucagon and seizure medicine the school holds for a child: where each is
 * kept, when it expires, when someone last looked at it. The family is told
 * 30 days before one expires; this is the list to work through.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHead, Btn, Badge, Status, StudentCell, Select, Empty } from '../mdUI';
import { RESCUE_KIND, RESCUE_PLACE, rescueState, fmtDay, fmtDate, labelOf } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter } from './mdList';
import { PickStudent } from './Allergies';

const places = (m) => (m.locations || []).map((l) => `${labelOf(RESCUE_PLACE, l.place)}${l.note ? ` (${l.note})` : ''}`).join(', ');

export default function MedicalRescueMeds() {
  const nav = useNavigate();
  const board = useBoard('rescuemeds', { tab: 'active' });
  const { meta, forms, elements } = useMedWorkspace(board.reload);
  const [pick, setPick] = useState(false);
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'name', label: 'Medicine', render: (r) => <span className="md-two"><b>{r.name}</b><em>{labelOf(RESCUE_KIND, r.kind)}{r.quantity != null ? ` · ${r.quantity} kept` : ''}</em></span>, csv: (r) => r.name },
    { key: 'places', label: 'Kept', render: (r) => <span className="md-clamp">{places(r) || '—'}{r.selfCarry ? ' · carried by the student' : ''}</span>, csv: (r) => places(r) },
    { key: 'expiresOn', label: 'Expires', render: (r) => (r.expiresOn ? <span className="md-two"><b>{fmtDay(r.expiresOn)}</b><em>{rescueState(r) ? <Status of="rescue" value={rescueState(r)} size="sm" /> : null}</em></span> : <Badge tone="amber" size="sm">No date</Badge>),
      csv: (r) => (r.expiresOn ? fmtDay(r.expiresOn) : '') },
    { key: 'checked', label: 'Last checked', render: (r) => (r.lastCheckedAt ? <span className="md-two"><b>{fmtDate(r.lastCheckedAt)}</b><em>{r.lastCheckedName}</em></span> : <span className="md-none">Never</span>),
      csv: (r) => (r.lastCheckedAt ? fmtDate(r.lastCheckedAt) : '') },
    { key: 'acts', label: '', align: 'right', stop: true, render: (r) => (!r.archivedAt ? <Btn size="sm" kind="tint" icon="checkCircle" onClick={() => forms.open('rescueCheck', { rescueMed: r })}>Checked</Btn> : null), csv: () => '' },
  ];
  return (
    <Page>
      <PageHead icon="syringe" tone="red" title="Rescue Medicines" subtitle="The emergency medicines held for students — where each one is kept, when it expires and when it was last checked. The family is reminded 30 days before an expiry date.">
        <Btn kind="primary" icon="plus" onClick={() => setPick(true)}>Add Rescue Medicine</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="rescue medicine" many="rescue medicines" searchPlaceholder="Search student or medicine" exportName="rescue-medicines"
        onRow={(r) => nav(`/admin/medical/students/${r.studentId || r.student}?tab=care`)}
        rowClass={(r) => (r.archivedAt ? 'is-off' : rescueState(r) === 'expired' ? 'is-critical' : '')}
        filters={<>
          <ClassFilter meta={meta} q={board.q} setQ={board.setQ} />
          <Select value={board.q.kind} onChange={(v) => board.setQ({ kind: v })} all="Any kind" label="Kind" options={Object.entries(RESCUE_KIND).map(([value, label]) => ({ value, label }))} />
          <Select value={board.q.archived} onChange={(v) => board.setQ({ archived: v })} all="In use" label="Archived" options={[{ value: '1', label: 'Archived' }]} />
        </>}
        empty={<Empty compact title="No rescue medicines">Add one from here or from a student&rsquo;s Emergency Care tab.</Empty>} />
      <PickStudent open={pick} onClose={() => setPick(false)} title="Add a rescue medicine — choose the student" onPick={(s) => { setPick(false); forms.open('rescueMed', { studentId: s._id }); }} />
      {elements}
    </Page>
  );
}
