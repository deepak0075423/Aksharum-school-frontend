/**
 * Restrictions (Oct 2026) — what teachers have been asked to do for a while:
 * no PE after a sprain, water in class, rest breaks. Teachers see only the
 * instruction; the reason is here and with the family.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Page, PageHead, Btn, Badge, StudentCell, Select, Empty } from '../mdUI';
import * as api from '../../../api/medical.api';
import { RESTRICTION_KIND, RESTRICTION_STATE, fmtDay, labelOf, todayStr } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter } from './mdList';
import { PickStudent } from './Allergies';

const stateOf = (r, today = todayStr()) => {
  if (r.endedAt || r.archivedAt) return 'ended';
  if (String(r.startsOn).slice(0, 10) > today) return 'upcoming';
  if (r.endsOn && String(r.endsOn).slice(0, 10) < today) return 'ended';
  return 'active';
};

export default function MedicalRestrictions() {
  const nav = useNavigate();
  const board = useBoard('restrictions', { tab: 'active' });
  const { meta, forms, drawer, elements } = useMedWorkspace(board.reload);
  const [pick, setPick] = useState(false);
  const end = (r) => drawer.confirm({
    title: 'End this restriction now?', message: `“${r.teacherText}” — the class teachers are told it no longer applies.`,
    reason: true, reasonLabel: 'Note', reasonPlaceholder: 'e.g. Healed early', confirmLabel: 'End it',
    run: async (note) => { await api.endRestriction(r._id, note); toast.success('Ended — teachers told'); board.reload(); },
  });
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'teacherText', label: 'Teachers are asked', render: (r) => <span className="md-two"><b>{r.teacherText}</b><em>{labelOf(RESTRICTION_KIND, r.kind)}</em></span>, csv: (r) => r.teacherText },
    { key: 'reason', label: 'Why (not shown to teachers)', render: (r) => r.reason || '—', csv: (r) => r.reason || '' },
    { key: 'when', label: 'When', render: (r) => <span className="md-two"><b>{fmtDay(r.startsOn)} → {r.endsOn ? fmtDay(r.endsOn) : 'further notice'}</b><em>{r.createdByName}</em></span>,
      csv: (r) => `${fmtDay(r.startsOn)} - ${r.endsOn ? fmtDay(r.endsOn) : 'further notice'}` },
    { key: 'state', label: 'State', render: (r) => { const st = stateOf(r); return <Badge tone={RESTRICTION_STATE[st].tone} size="sm">{r.endedAt ? 'Ended early' : RESTRICTION_STATE[st].label}</Badge>; },
      csv: (r) => labelOf(RESTRICTION_STATE, stateOf(r)) },
    { key: 'acts', label: '', align: 'right', stop: true, render: (r) => (stateOf(r) !== 'ended' ? (
      <span className="md-acts">
        <Btn size="sm" onClick={() => forms.open('restriction', { restriction: r })}>Change</Btn>
        <Btn size="sm" onClick={() => end(r)}>End</Btn>
      </span>
    ) : null) },
  ];
  return (
    <Page>
      <PageHead icon="ban" tone="orange" title="Restrictions" subtitle="What teachers have been asked to do for a while — no PE, water in class, rest breaks. Teachers see only the instruction, never the reason; the family sees both.">
        <Btn kind="primary" icon="plus" onClick={() => setPick(true)}>New Restriction</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="restriction" many="restrictions" searchPlaceholder="Search student, instruction or reason" exportName="medical-restrictions"
        onRow={(r) => nav(`/admin/medical/students/${r.studentId || r.student}`)}
        rowClass={(r) => (stateOf(r) === 'ended' ? 'is-off' : '')}
        filters={<>
          <ClassFilter meta={meta} q={board.q} setQ={board.setQ} />
          <Select value={board.q.archived} onChange={(v) => board.setQ({ archived: v })} all="Current" label="Archived" options={[{ value: '1', label: 'Archived' }]} />
        </>}
        empty={<Empty compact title="No restrictions">Add one from a student&rsquo;s record, a visit, or with New Restriction.</Empty>} />
      <PickStudent open={pick} onClose={() => setPick(false)} title="New restriction — choose the student"
        onPick={(s) => { setPick(false); forms.open('restriction', { studentId: s._id, studentName: s.name }); }} />
      {elements}
    </Page>
  );
}

