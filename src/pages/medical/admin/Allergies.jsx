/**
 * Allergies (Oct 2026) — every allergy on record across the school, severe
 * ones first, by type. Add one for any student from here.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHead, Btn, Badge, Status, StudentCell, Select, Empty, Dialog, Field } from '../mdUI';
import { StudentPicker } from '../mdForm';
import * as api from '../../../api/medical.api';
import { ALLERGY_CATEGORY, ALLERGY_SEVERITY, labelOf } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter } from './mdList';

/** Choose a student, then open a form for them. */
export function PickStudent({ open, onClose, onPick, title }) {
  const [s, setS] = useState(null);
  return (
    <Dialog open={open} onClose={() => { setS(null); onClose(); }} title={title} icon="student" width={520}
      footer={<><Btn onClick={() => { setS(null); onClose(); }}>Cancel</Btn><Btn kind="primary" disabled={!s} onClick={() => { onPick(s); setS(null); }}>Continue</Btn></>}>
      <Field label="Student"><StudentPicker value={s} onChange={setS} fetcher={api.findMedStudents} autoFocus /></Field>
    </Dialog>
  );
}

export default function MedicalAllergies() {
  const nav = useNavigate();
  const board = useBoard('allergies', { tab: 'all' });
  const { meta, forms, elements } = useMedWorkspace(board.reload);
  const [pick, setPick] = useState(false);
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'allergen', label: 'Allergy', render: (r) => <span className="md-two"><b>{r.allergen}</b><em>{labelOf(ALLERGY_CATEGORY, r.category)}</em></span> },
    { key: 'severity', label: 'Severity', render: (r) => <Status of="allergySeverity" value={r.severity} />, csv: (r) => labelOf(ALLERGY_SEVERITY, r.severity) },
    { key: 'reaction', label: 'Reaction', render: (r) => <span className="md-clamp">{r.reaction || '—'}</span> },
    { key: 'emergencyInstructions', label: 'If exposed', render: (r) => <span className="md-clamp">{r.emergencyInstructions || '—'}</span> },
    { key: 'flags', label: '', render: (r) => (
      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {r.status === 'resolved' ? <Badge tone="slate" size="sm">Resolved</Badge> : null}
        {r.source === 'parent' ? <Badge tone="indigo" size="sm">From parent</Badge> : null}
        {!r.verified ? <Badge tone="amber" size="sm">Not verified</Badge> : null}
        {r.shareWithTeachers === false ? <Badge tone="gray" size="sm">Not shown to teachers</Badge> : null}
      </span>
    ), csv: () => '' },
  ];
  return (
    <Page>
      <PageHead icon="alertTri" tone="red" title="Allergies" subtitle="Every allergy on record. Severe and life-threatening allergies are medical alerts — shown on the student's profile, the emergency card and to their teachers.">
        <Btn kind="primary" icon="plus" onClick={() => setPick(true)}>Add Allergy</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="allergy" many="allergies" searchPlaceholder="Search student or allergen" exportName="allergies"
        onRow={(r) => nav(`/admin/medical/students/${r.studentId || r.student}?tab=allergies`)} rowClass={(r) => (['severe', 'life_threatening'].includes(r.severity) && r.status !== 'resolved' ? 'is-critical' : r.status === 'resolved' ? 'is-off' : '')}
        filters={<>
          <ClassFilter meta={meta} q={board.q} setQ={board.setQ} />
          <Select value={board.q.severity} onChange={(v) => board.setQ({ severity: v })} all="Any severity" label="Severity" options={Object.entries(ALLERGY_SEVERITY).map(([value, x]) => ({ value, label: x.label }))} />
          <Select value={board.q.status} onChange={(v) => board.setQ({ status: v })} all="Active and resolved" label="Status" options={[{ value: 'active', label: 'Active' }, { value: 'resolved', label: 'Resolved' }]} />
          <Select value={board.q.unverified} onChange={(v) => board.setQ({ unverified: v })} all="Verified or not" label="Verified" options={[{ value: '1', label: 'Not verified' }]} />
        </>}
        empty={<Empty compact title="No allergies on record">Add one from here or from a student's profile; parents can also send them.</Empty>} />
      <PickStudent open={pick} onClose={() => setPick(false)} title="Add an allergy — choose the student" onPick={(s) => { setPick(false); forms.open('allergy', { studentId: s._id }); }} />
      {elements}
    </Page>
  );
}
