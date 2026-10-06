/**
 * Medical Conditions (Oct 2026) — asthma, diabetes, epilepsy, heart, vision,
 * hearing, orthopedic and chronic conditions across the school.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHead, Btn, Badge, Status, StudentCell, Select, Empty } from '../mdUI';
import { CONDITION_TYPE, CONDITION_SEVERITY, CONDITION_STATUS, fmtDay, labelOf } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter } from './mdList';
import { PickStudent } from './Allergies';

export default function MedicalConditions() {
  const nav = useNavigate();
  const board = useBoard('conditions', { tab: 'current' });
  const { meta, forms, elements } = useMedWorkspace(board.reload);
  const [pick, setPick] = useState(false);
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'condition', label: 'Condition', render: (r) => <span className="md-two"><b>{r.condition}</b><em>{labelOf(CONDITION_TYPE, r.type)}{r.chronic ? ' · chronic' : ''}</em></span> },
    { key: 'severity', label: 'Severity', render: (r) => <Status of="conditionSeverity" value={r.severity} />, csv: (r) => labelOf(CONDITION_SEVERITY, r.severity) },
    { key: 'treatment', label: 'Treatment / medication', render: (r) => <span className="md-two"><b>{r.treatment || '—'}</b><em>{r.medication}</em></span> },
    { key: 'diagnosedOn', label: 'Diagnosed', render: (r) => (r.diagnosedOn ? fmtDay(r.diagnosedOn) : <span className="md-none">—</span>), csv: (r) => fmtDay(r.diagnosedOn) },
    { key: 'status', label: 'Status', render: (r) => (
      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Status of="conditionStatus" value={r.status} />
        {r.source === 'parent' ? <Badge tone="indigo" size="sm">From parent</Badge> : null}
        {r.shareWithTeachers === false ? <Badge tone="gray" size="sm">Not shown to teachers</Badge> : null}
      </span>
    ), csv: (r) => labelOf(CONDITION_STATUS, r.status) },
  ];
  return (
    <Page>
      <PageHead icon="heartPulse" tone="red" title="Medical Conditions" subtitle="Conditions students live with, their care and what to do in an emergency. Severe and critical conditions are medical alerts.">
        <Btn kind="primary" icon="plus" onClick={() => setPick(true)}>Add Condition</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="condition" searchPlaceholder="Search student or condition" exportName="medical-conditions"
        onRow={(r) => nav(`/admin/medical/students/${r.studentId || r.student}?tab=conditions`)} rowClass={(r) => (['severe', 'critical'].includes(r.severity) && r.status !== 'resolved' ? 'is-critical' : r.status === 'resolved' ? 'is-off' : '')}
        filters={<>
          <ClassFilter meta={meta} q={board.q} setQ={board.setQ} />
          <Select value={board.q.type} onChange={(v) => board.setQ({ type: v })} all="Any type" label="Type" options={Object.entries(CONDITION_TYPE).map(([value, label]) => ({ value, label }))} />
          <Select value={board.q.severity} onChange={(v) => board.setQ({ severity: v })} all="Any severity" label="Severity" options={Object.entries(CONDITION_SEVERITY).map(([value, x]) => ({ value, label: x.label }))} />
        </>}
        empty={<Empty compact title="No conditions here">Add one from here or from a student's profile.</Empty>} />
      <PickStudent open={pick} onClose={() => setPick(false)} title="Add a condition — choose the student" onPick={(s) => { setPick(false); forms.open('condition', { studentId: s._id }); }} />
      {elements}
    </Page>
  );
}
