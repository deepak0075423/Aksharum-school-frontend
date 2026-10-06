/**
 * Medical Incidents (Oct 2026) — injuries and accidents, wherever they
 * happened and whoever reported them, with their care, the parents and the
 * follow-up.
 */
import React from 'react';
import { Page, PageHead, Btn, Badge, Status, StudentCell, Select, Empty } from '../mdUI';
import { INCIDENT_TYPE, INCIDENT_SEVERITY, INCIDENT_STATUS, FOLLOW_STATE, fmtStamp, fmtDate, fmtTime, labelOf } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, useFocusOpen, BoardPanel, ClassFilter, DateFilter } from './mdList';

export default function MedicalIncidents() {
  const board = useBoard('incidents', { tab: 'open' });
  const { meta, forms, drawer, elements } = useMedWorkspace(board.reload);
  useFocusOpen(board.focus, React.useCallback((id) => drawer.show('incident', id), [drawer]));
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'occurredAt', label: 'When', render: (r) => <span className="md-two"><b>{fmtDate(r.occurredAt)}</b><em>{fmtTime(r.occurredAt)} · {r.number}</em></span>, csv: (r) => fmtStamp(r.occurredAt) },
    { key: 'type', label: 'Incident', render: (r) => <span className="md-two"><b>{labelOf(INCIDENT_TYPE, r.type)}</b><em>{[r.location, r.injury].filter(Boolean).join(' · ')}</em></span>, csv: (r) => labelOf(INCIDENT_TYPE, r.type) },
    { key: 'severity', label: 'Severity', render: (r) => <Status of="incidentSeverity" value={r.severity} />, csv: (r) => labelOf(INCIDENT_SEVERITY, r.severity) },
    { key: 'reportedByName', label: 'Reported by', render: (r) => <span className="md-two"><b>{r.reportedByName}</b><em>{r.parentNotified ? 'Parents told' : 'Parents not told yet'}</em></span> },
    { key: 'status', label: 'Status', render: (r) => (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
        <Status of="incidentStatus" value={r.status} />
        {r.followUpState ? <Badge tone={FOLLOW_STATE[r.followUpState].tone} size="sm">Follow-up {FOLLOW_STATE[r.followUpState].label.toLowerCase()}</Badge> : null}
      </span>
    ), csv: (r) => labelOf(INCIDENT_STATUS, r.status) },
  ];
  return (
    <Page>
      <PageHead icon="alertTri" tone="orange" title="Medical Incidents" subtitle="Injuries and accidents — on the playground, in sports, in class or on the bus — with the first aid given, the parents told and any hospital referral.">
        <Btn kind="primary" icon="plus" onClick={() => forms.open('incident')}>Report Incident</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="incident" searchPlaceholder="Search student, place or incident number" exportName="medical-incidents"
        onRow={(r) => drawer.show('incident', r._id)} rowClass={(r) => (r.severity === 'critical' ? 'is-critical' : '')}
        filters={<>
          <ClassFilter meta={meta} q={board.q} setQ={board.setQ} />
          <Select value={board.q.type} onChange={(v) => board.setQ({ type: v })} all="Any type" label="Type" options={Object.entries(INCIDENT_TYPE).map(([value, label]) => ({ value, label }))} />
          <Select value={board.q.severity} onChange={(v) => board.setQ({ severity: v })} all="Any severity" label="Severity" options={Object.entries(INCIDENT_SEVERITY).map(([value, s]) => ({ value, label: s.label }))} />
          <DateFilter q={board.q} setQ={board.setQ} />
        </>}
        empty={<Empty compact title="No incidents here">Incidents reported by teachers or the Medical Room appear here.</Empty>} />
      {elements}
    </Page>
  );
}
