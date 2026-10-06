/**
 * Vaccinations (Oct 2026) — doses due soon and overdue across the school,
 * and every dose given. Families are reminded once when a dose falls due and
 * once if it becomes overdue (the sweep does it).
 */
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Btn, Status, StudentCell, Empty, Kebab } from '../mdUI';
import { VACCINATION_STATUS, fmtDay, labelOf } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter } from './mdList';
import { PickStudent } from './Allergies';

export default function MedicalVaccinations() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const board = useBoard('vaccinations', { tab: 'due_soon' });
  const { meta, forms, drawer, elements } = useMedWorkspace(board.reload);
  const [pick, setPick] = useState(params.get('new') === '1');
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'vaccine', label: 'Vaccine', render: (r) => <span className="md-two"><b>{r.vaccine}</b><em>{r.dose}</em></span>, csv: (r) => `${r.vaccine} ${r.dose || ''}` },
    { key: 'date', label: 'Given / due', render: (r) => (r.givenOn ? <span className="md-two"><b>Given {fmtDay(r.givenOn)}</b><em>{r.nextDueOn ? `Next due ${fmtDay(r.nextDueOn)}` : ''}</em></span> : <b>Due {fmtDay(r.dueOn)}</b>), csv: (r) => fmtDay(r.givenOn || r.dueOn) },
    { key: 'provider', label: 'Hospital / clinic', render: (r) => r.provider || <span className="md-none">—</span> },
    { key: 'state', label: 'Status', render: (r) => <Status of="vaccination" value={r.state} />, csv: (r) => labelOf(VACCINATION_STATUS, r.state) },
    { key: 'acts', label: '', align: 'right', stop: true, render: (r) => (
      <span className="md-acts">
        {!r.givenOn ? <Btn size="sm" kind="primary" onClick={() => forms.open('vaccinationGiven', { vaccination: r })}>Mark given</Btn> : null}
        <Kebab items={[
          { label: 'Edit', icon: 'pencil', onClick: () => forms.open('vaccination', { studentId: r.studentId, vaccination: r }) },
          { label: 'Open medical profile', icon: 'user', onClick: () => nav(`/admin/medical/students/${r.studentId}?tab=vaccinations`) },
          { label: 'Archive', icon: 'archive', danger: true, onClick: () => drawer.confirm({ title: 'Archive this vaccination record?', reason: true, reasonLabel: 'Why', danger: true, confirmLabel: 'Archive', run: async (why) => { await api.archiveMedRecord('vaccinations', r._id, why); board.reload(); } }) },
        ]} />
      </span>
    ) },
  ];
  return (
    <Page>
      <PageHead icon="syringe" tone="green" title="Vaccinations" subtitle={`Vaccination records of every student — doses given, and doses due within ${meta?.settings?.vaccinationDueDays || 30} days or overdue. Parents can see their child's records and are reminded when a dose falls due.`}>
        <Btn kind="primary" icon="plus" onClick={() => setPick(true)}>Add Vaccination Record</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="vaccination record" searchPlaceholder="Search student or vaccine" exportName="vaccinations"
        rowClass={(r) => (r.state === 'overdue' ? 'is-critical' : '')}
        filters={<ClassFilter meta={meta} q={board.q} setQ={board.setQ} />}
        empty={<Empty compact title="Nothing here">Doses due within the reminder window, and those overdue, appear in the first tabs.</Empty>} />
      <PickStudent open={pick} onClose={() => { setPick(false); setParams({}, { replace: true }); }} title="Add a vaccination — choose the student"
        onPick={(s) => { setPick(false); setParams({}, { replace: true }); forms.open('vaccination', { studentId: s._id }); }} />
      {elements}
    </Page>
  );
}
