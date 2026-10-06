/**
 * Care Plans (Oct 2026) — every emergency care plan in the school: what to
 * do, step by step, in an anaphylaxis, asthma, seizure or low-blood-sugar
 * emergency. Which plans wait for a parent to confirm them, which are past
 * their review date. A plan is written on the student's Emergency Care tab.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Page, PageHead, Btn, Badge, StudentCell, Select, Empty } from '../mdUI';
import * as api from '../../../api/medical.api';
import { CARE_PLAN_KIND, fmtDay, fmtDate, labelOf, todayStr, errorText } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter } from './mdList';
import { PickStudent } from './Allergies';

export default function MedicalCarePlans() {
  const nav = useNavigate();
  const board = useBoard('careplans', { tab: 'active' });
  const { meta, forms, elements } = useMedWorkspace(board.reload);
  const [pick, setPick] = useState(false);
  // The form offers the child's rescue medicines, so it opens with their record.
  const start = async (s) => {
    setPick(false);
    try {
      const r = await api.getMedStudent(s._id);
      const rec = r?.data ?? r;
      forms.open('carePlan', { studentId: s._id, rescueMeds: (rec.rescueMeds || []).filter((m) => !m.archivedAt && m.status === 'active') });
    } catch (e) { toast.error(errorText(e)); }
  };
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'title', label: 'Plan', render: (r) => <span className="md-two"><b>{r.title}</b><em>{labelOf(CARE_PLAN_KIND, r.kind)}</em></span>, csv: (r) => r.title },
    { key: 'steps', label: 'First steps', render: (r) => <span className="md-clamp">{(r.steps || []).filter((x) => x.critical).map((x) => x.text).slice(0, 2).join(' → ') || '—'}</span>,
      csv: (r) => (r.steps || []).map((x, i) => `${i + 1}. ${x.text}`).join(' ') },
    { key: 'parent', label: 'Parent', render: (r) => (r.parentConfirmedAt ? <Badge tone="green" size="sm">Confirmed {fmtDate(r.parentConfirmedAt)}</Badge> : <Badge tone="amber" size="sm">Waiting</Badge>),
      csv: (r) => (r.parentConfirmedAt ? `Confirmed ${fmtDate(r.parentConfirmedAt)}` : 'Waiting') },
    { key: 'doctor', label: 'Signed off', render: (r) => (r.doctorName ? <span className="md-two"><b>{r.doctorName}</b><em>{r.doctorSignedOn ? fmtDay(r.doctorSignedOn) : ''}</em></span> : <Badge tone="amber" size="sm">Not yet</Badge>),
      csv: (r) => r.doctorName || '' },
    { key: 'reviewDue', label: 'Review by', render: (r) => (r.reviewDue ? <span className={String(r.reviewDue).slice(0, 10) < todayStr() ? 'md-text-red' : ''}>{fmtDay(r.reviewDue)}</span> : '—'),
      csv: (r) => (r.reviewDue ? fmtDay(r.reviewDue) : '') },
  ];
  return (
    <Page>
      <PageHead icon="heartPulse" tone="red" title="Care Plans" subtitle="Step-by-step emergency plans for students with anaphylaxis, asthma, epilepsy, diabetes or a heart condition — on the emergency card and with the staff who look after them. Each is confirmed by a parent and reviewed every year.">
        <Btn kind="primary" icon="plus" onClick={() => setPick(true)}>New Care Plan</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="care plan" many="care plans" searchPlaceholder="Search student or plan" exportName="care-plans"
        onRow={(r) => nav(`/admin/medical/students/${r.studentId || r.student}?tab=care`)}
        rowClass={(r) => (r.archivedAt || r.status === 'draft' ? 'is-off' : '')}
        filters={<>
          <ClassFilter meta={meta} q={board.q} setQ={board.setQ} />
          <Select value={board.q.kind} onChange={(v) => board.setQ({ kind: v })} all="Any kind" label="Kind" options={Object.entries(CARE_PLAN_KIND).map(([value, label]) => ({ value, label }))} />
          <Select value={board.q.archived} onChange={(v) => board.setQ({ archived: v })} all="In use" label="Archived" options={[{ value: '1', label: 'Archived' }]} />
        </>}
        empty={<Empty compact title="No care plans">Write one from a student&rsquo;s Emergency Care tab, or with New Care Plan.</Empty>} />
      <PickStudent open={pick} onClose={() => setPick(false)} title="New care plan — choose the student" onPick={start} />
      {elements}
    </Page>
  );
}
