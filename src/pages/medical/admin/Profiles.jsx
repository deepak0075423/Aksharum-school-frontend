/**
 * Medical Profiles (Oct 2026) — every student with their medical summary:
 * blood group, allergies, conditions, medication and their critical alerts.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHead, Badge, StudentCell, Select, Empty } from '../mdUI';
import { BLOOD_GROUPS, fmtDate, ago } from '../mdMeta';
import { useMedWorkspace, MedSearch } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter } from './mdList';

export default function MedicalProfiles() {
  const nav = useNavigate();
  const board = useBoard('profiles', { tab: 'all' });
  const { meta, elements } = useMedWorkspace(board.reload);
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} critical={r.critical} />, csv: (r) => r.studentName },
    { key: 'bloodGroup', label: 'Blood', render: (r) => (r.bloodGroup ? <Badge tone="rose" dot={false}>{r.bloodGroup}</Badge> : <span className="md-none">—</span>) },
    { key: 'allergies', label: 'Allergies', render: (r) => (r.allergyCount ? <span className="md-two"><b style={{ color: r.severeAllergies ? '#b91c1c' : undefined }}>{r.allergyNames}</b><em>{r.severeAllergies ? `${r.severeAllergies} severe` : `${r.allergyCount} on record`}</em></span> : <span className="md-none">None</span>), csv: (r) => r.allergyNames || '' },
    { key: 'conditions', label: 'Conditions', render: (r) => (r.conditionCount ? <span className="md-two"><b style={{ color: r.severeConditions ? '#b91c1c' : undefined }}>{r.conditionNames}</b><em>{r.chronicConditions ? `${r.chronicConditions} chronic` : `${r.conditionCount} on record`}</em></span> : <span className="md-none">None</span>), csv: (r) => r.conditionNames || '' },
    { key: 'meds', label: 'Medication', render: (r) => (r.planCount || r.emergencyMedication ? (
      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.planCount ? <Badge tone="violet" size="sm">{r.planCount} plan{r.planCount === 1 ? '' : 's'}</Badge> : null}{r.emergencyMedication ? <Badge tone="red" size="sm">Emergency</Badge> : null}</span>
    ) : <span className="md-none">—</span>), csv: (r) => `${r.planCount || 0}` },
    { key: 'lastVisit', label: 'Last visit', render: (r) => (r.lastVisit ? <span className="md-two"><b>{ago(r.lastVisit)}</b><em>{r.visitCount} visit{r.visitCount === 1 ? '' : 's'}</em></span> : <span className="md-none">Never</span>), csv: (r) => (r.lastVisit ? fmtDate(r.lastVisit) : '') },
    { key: 'complete', label: 'Record', render: (r) => (!r.bloodGroup || !r.hasProfile ? <Badge tone="amber" size="sm">Incomplete</Badge> : <Badge tone="green" size="sm">Complete</Badge>), csv: (r) => (!r.bloodGroup || !r.hasProfile ? 'Incomplete' : 'Complete') },
  ];
  return (
    <Page>
      <PageHead icon="heartPulse" tone="rose" title="Medical Profiles" subtitle="Every student's medical record in one list — blood group, allergies, conditions and medication. Open a student to see and keep their full profile.">
        <MedSearch />
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="student" searchPlaceholder="Search name or admission number" exportName="medical-profiles"
        onRow={(r) => nav(`/admin/medical/students/${r._id}`)} rowClass={(r) => (r.critical ? 'is-critical' : '')}
        filters={<><ClassFilter meta={meta} q={board.q} setQ={board.setQ} /><Select value={board.q.bloodGroup} onChange={(v) => board.setQ({ bloodGroup: v })} all="Any blood group" label="Blood group" options={BLOOD_GROUPS} /></>}
        empty={<Empty compact title="No students match">Try another class, or clear the search.</Empty>} />
      {elements}
    </Page>
  );
}
