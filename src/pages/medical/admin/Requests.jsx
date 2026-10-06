/**
 * Medical Requests (Oct 2026) — the students teachers have sent to the room.
 * Waiting requests first, most urgent first; accept lets the teacher know the
 * room is expecting the student, "Arrived" opens the visit.
 */
import React from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Btn, Badge, Status, StudentCell, Select, Empty } from '../mdUI';
import { URGENCY, REQUEST_STATUS, ago, fmtStamp, labelOf, errorText } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, useFocusOpen, BoardPanel, ClassFilter, DateFilter } from './mdList';
import { useMedLive, beep } from '../useMedLive';

const EXPORT = [
  { key: 'studentName', label: 'Student' }, { key: 'classLabel', label: 'Class' }, { key: 'admissionNumber', label: 'Admission No.' },
  { key: 'reason', label: 'Reason' }, { key: 'symptoms', label: 'Symptoms' }, { key: 'location', label: 'Location' },
  { key: 'urgency', label: 'Urgency', csv: (r) => labelOf(URGENCY, r.urgency) }, { key: 'requestedByName', label: 'Sent by' },
  { key: 'createdAt', label: 'Sent at', csv: (r) => fmtStamp(r.createdAt) }, { key: 'number', label: 'Number' },
  { key: 'status', label: 'Status', csv: (r) => labelOf(REQUEST_STATUS, r.status) },
];

export default function MedicalRequests() {
  const board = useBoard('requests', { tab: 'open' });
  const { meta, forms, drawer, elements } = useMedWorkspace(board.reload);
  useMedLive(board.reload, { kinds: ['request', 'visit'], onUrgent: beep });
  useFocusOpen(board.focus, React.useCallback((id) => {
    const row = board.data?.rows?.find((r) => r._id === id);
    if (row) drawer.show('request', id, row);
  }, [board.data, drawer]), !!board.data);
  const accept = async (r) => { try { await api.acceptMedRequest(r._id); toast.success(`Accepted — ${r.requestedByName} has been told`); board.reload(); } catch (e) { toast.error(errorText(e)); } };
  const arrived = (r) => forms.open('visit', { request: r._id, student: { _id: r.studentId, name: r.studentName, photo: r.studentPhoto, classLabel: r.classLabel, admissionNumber: r.admissionNumber }, reason: r.reason, symptoms: r.symptoms });
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'reason', label: 'Reason', render: (r) => <span className="md-two"><b>{r.reason}</b><em>{r.symptoms || r.location || ''}</em></span> },
    { key: 'requestedByName', label: 'Sent by', render: (r) => <span className="md-two"><b>{r.requestedByName}</b><em>{ago(r.createdAt)} · {r.number}</em></span> },
    // Urgency rides under the status: seven columns did not fit beside the sidebar,
    // and the buttons a nurse needs most were the ones pushed off the edge.
    { key: 'status', label: 'Status', render: (r) => (
      <span className="md-stack"><Status of="request" value={r.status} /><Badge tone={URGENCY[r.urgency]?.tone} size="sm">{labelOf(URGENCY, r.urgency)}</Badge></span>
    ) },
    { key: 'acts', label: '', align: 'right', stop: true, render: (r) => (
      <span className="md-acts">
        {r.status === 'requested' ? <Btn size="sm" onClick={() => accept(r)}>Accept</Btn> : null}
        {['requested', 'accepted'].includes(r.status) ? <Btn size="sm" kind="primary" onClick={() => arrived(r)}>Arrived</Btn> : null}
        {r.visit ? <Btn size="sm" kind="tint" onClick={() => drawer.show('visit', r.visit)}>Visit</Btn> : null}
      </span>
    ) },
  ];
  return (
    <Page>
      <PageHead icon="inbox" tone="amber" title="Medical Requests" subtitle="Students teachers have sent to the Medical Room. Accept a request so the teacher knows you are expecting the student; when the student walks in, “Arrived” opens their visit." />
      <BoardPanel board={board} columns={columns} exportColumns={EXPORT} noun="request" searchPlaceholder="Search student, reason, teacher or number" exportName="medical-requests"
        onRow={(r) => drawer.show('request', r._id, r)} rowClass={(r) => (r.urgency === 'emergency' && ['requested', 'accepted'].includes(r.status) ? 'is-critical' : '')}
        filters={<><ClassFilter meta={meta} q={board.q} setQ={board.setQ} /><Select value={board.q.urgency} onChange={(v) => board.setQ({ urgency: v })} all="Any urgency" label="Urgency" options={Object.entries(URGENCY).map(([value, u]) => ({ value, label: u.label }))} /><DateFilter q={board.q} setQ={board.setQ} /></>}
        empty={<Empty compact title={board.q.tab === 'open' ? 'No open requests' : 'No requests'}>When a teacher sends a student to the Medical Room, the request appears here and on the dashboard.</Empty>} />
      {elements}
    </Page>
  );
}
