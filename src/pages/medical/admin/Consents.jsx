/**
 * Consents (Oct 2026) — this school year's medical consent from the parents:
 * who has answered, who has not, who allowed no everyday medicines, who
 * withdrew. Ask the parents who have not answered (once a week at most per
 * child); record a signed paper form from the student's record.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Page, PageHead, Btn, StudentCell, Empty, Note } from '../mdUI';
import * as api from '../../../api/medical.api';
import { fmtStamp, errorText } from '../mdMeta';
import { ConsentBadge } from '../consentParts';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter } from './mdList';

export default function MedicalConsents() {
  const nav = useNavigate();
  const board = useBoard('consents', { tab: 'missing' });
  const { meta, drawer, elements } = useMedWorkspace(board.reload);
  const [asked, setAsked] = useState(null);
  const ask = () => drawer.confirm({
    title: 'Ask the parents who have not answered?', confirmLabel: 'Ask them',
    message: `${board.q.classId || board.q.sectionId ? 'The parents in the class chosen' : 'Every parent'} who has not answered this year's consent gets a notification — no child's parents more than once a week.`,
    run: async () => {
      try { const r = await api.requestConsents({ classId: board.q.classId || undefined, sectionId: board.q.sectionId || undefined }); setAsked((r?.data ?? r)?.asked ?? 0); board.reload(); }
      catch (e) { toast.error(errorText(e)); }
    },
  });
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'status', label: 'Consent', render: (r) => <ConsentBadge consent={r.consentStatus ? { status: r.consentStatus } : null} />, csv: (r) => r.consentStatus || 'not answered' },
    { key: 'otc', label: 'Everyday medicines', render: (r) => (r.consentStatus === 'given' ? ((r.otc || []).join(', ') || 'None') : '—'), csv: (r) => (r.otc || []).join('; ') },
    { key: 'more', label: 'Also', render: (r) => (r.consentStatus === 'given' ? [r.emergencyTreatment ? 'emergency treatment' : 'no emergency treatment', r.shareWithTeachers === false ? 'teachers: critical only' : '', r.injuryPhotos ? 'photos' : '', r.selfCarry ? 'self-carry' : ''].filter(Boolean).join(' · ') : '—') },
    { key: 'when', label: 'Signed', render: (r) => (r.givenAt ? <span className="md-two"><b>{r.signedName}</b><em>{fmtStamp(r.givenAt)}{r.onPaper ? ' · paper' : ''}</em></span> : r.requestedAt ? <em className="md-muted">Asked {fmtStamp(r.requestedAt)}</em> : '—') },
  ];
  return (
    <Page>
      <PageHead icon="shieldCheck" tone="indigo" title="Consents" subtitle="This school year's medical consent from the parents — emergency treatment, the everyday medicines the Medical Room may give, what teachers may see. Ask the parents who have not answered; record a signed paper form from the student's record.">
        <Btn kind="primary" icon="send" onClick={ask}>Ask the parents</Btn>
      </PageHead>
      {asked !== null ? <Note tone="green" icon="checkCircle">{asked ? `${asked} famil${asked === 1 ? 'y has' : 'ies have'} been asked.` : 'Nobody to ask — everyone has answered, or was asked in the last week.'}</Note> : null}
      <BoardPanel board={board} columns={columns} noun="student" many="students" searchPlaceholder="Search student" exportName="medical-consents"
        onRow={(r) => nav(`/admin/medical/students/${r.studentId}`)}
        filters={<ClassFilter meta={meta} q={board.q} setQ={board.setQ} />}
        empty={<Empty compact title={board.q.tab === 'missing' ? 'Everyone has answered' : 'Nobody here'}>Parents answer in the app; a signed paper form is recorded from the student&rsquo;s record.</Empty>} />
      {elements}
    </Page>
  );
}
