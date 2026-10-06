/**
 * Medical Visits (Oct 2026) — every visit to the room: today's, the students
 * in the room now, the follow-ups waiting, referrals and the closed record.
 */
import React from 'react';
import { Page, PageHead, Btn, Badge, Status, StudentCell, Select, Empty } from '../mdUI';
import { VISIT_STATUS, FOLLOW_STATE, fmtStamp, fmtTime, fmtDate, labelOf, tempText, isFever, isToday } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, useFocusOpen, BoardPanel, ClassFilter, DateFilter } from './mdList';

export default function MedicalVisits() {
  const board = useBoard('visits', { tab: 'today' });
  const { meta, forms, drawer, elements } = useMedWorkspace(board.reload);
  useFocusOpen(board.focus, React.useCallback((id) => drawer.show('visit', id), [drawer]));
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'arrivedAt', label: 'Arrived', render: (r) => <span className="md-two"><b>{isToday(r.arrivedAt) ? fmtTime(r.arrivedAt) : fmtDate(r.arrivedAt)}</b><em>{r.number}</em></span>, csv: (r) => fmtStamp(r.arrivedAt) },
    { key: 'reason', label: 'Reason', render: (r) => <span className="md-two"><b>{r.reason}</b><em>{r.treatment || r.symptoms || ''}</em></span> },
    { key: 'vitals', label: 'Temp.', render: (r) => (r.vitals?.temperature != null ? <b style={{ color: isFever(r.vitals) ? '#b45309' : undefined }}>{tempText(r.vitals)}</b> : <span className="md-none">—</span>), csv: (r) => tempText(r.vitals) },
    { key: 'handledByName', label: 'Seen by' },
    { key: 'status', label: 'Status', render: (r) => (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
        <Status of="visit" value={r.status} />
        {r.emergency ? <Badge tone="red" size="sm">Emergency</Badge> : null}
        {r.followUpState ? <Badge tone={FOLLOW_STATE[r.followUpState].tone} size="sm">Follow-up {FOLLOW_STATE[r.followUpState].label.toLowerCase()}</Badge> : null}
      </span>
    ), csv: (r) => labelOf(VISIT_STATUS, r.status) },
  ];
  return (
    <Page>
      <PageHead icon="stethoscope" tone="blue" title="Medical Visits" subtitle="Every visit to the Medical Room, from arrival to outcome. Open a visit to record treatment, medicine and first aid, contact the parents or send the student back to class.">
        <Btn kind="primary" icon="plus" onClick={() => forms.open('visit')}>Add Medical Visit</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="visit" searchPlaceholder="Search student, reason or visit number" exportName="medical-visits"
        onRow={(r) => drawer.show('visit', r._id)} rowClass={(r) => (r.status === 'emergency' ? 'is-critical' : '')}
        filters={<>
          <ClassFilter meta={meta} q={board.q} setQ={board.setQ} />
          <Select value={board.q.status} onChange={(v) => board.setQ({ status: v })} all="Any status" label="Status" options={Object.entries(VISIT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          <DateFilter q={board.q} setQ={board.setQ} />
          <Select value={board.q.archived} onChange={(v) => board.setQ({ archived: v })} all="Current records" label="Archived" options={[{ value: '1', label: 'Archived only' }]} />
        </>}
        empty={<Empty compact title="No visits here" action={<Btn kind="primary" icon="plus" onClick={() => forms.open('visit')}>Add Medical Visit</Btn>}>Visits recorded in the Medical Room appear here.</Empty>} />
      {elements}
    </Page>
  );
}
