/**
 * Return to School (Oct 2026) — students off school until it is safe to come
 * back: a fever (24 hours fever-free), vomiting (48 hours), chickenpox … Who
 * can come back now, who still needs a doctor's certificate, and who has been
 * cleared. Class teachers only ever hear "away until".
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Page, PageHead, Btn, Badge, StudentCell, Empty, Kebab } from '../mdUI';
import * as api from '../../../api/medical.api';
import { EXCLUSION_STATUS, fmtStamp, labelOf, errorText } from '../mdMeta';
import { DocButton } from '../mdShared';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter } from './mdList';
import { useExclusionRules } from './mdForms';
import { PickStudent } from './Allergies';

export default function MedicalReturnToSchool() {
  const nav = useNavigate();
  const board = useBoard('exclusions', { tab: 'away' });
  const { meta, forms, drawer, elements } = useMedWorkspace(board.reload);
  const rules = useExclusionRules();
  const [pick, setPick] = useState(false);
  const fileRef = React.useRef(null);
  const [forRow, setForRow] = useState(null);
  const upload = async (file) => {
    if (!file || !forRow) return;
    try { await api.uploadExclusionCertificate(forRow._id, file); toast.success('Certificate attached'); board.reload(); } catch (e) { toast.error(errorText(e)); }
    setForRow(null);
  };
  const ready = (r) => r.status === 'excluded' && (!r.earliestReturn || new Date(r.earliestReturn) <= new Date()) && (!r.needsCertificate || r.certificateDoc);
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'label', label: 'Why', render: (r) => <span className="md-two"><b>{r.label}</b><em>Since {fmtStamp(r.from)}</em></span>, csv: (r) => r.label },
    { key: 'earliestReturn', label: 'Earliest return', render: (r) => (r.earliestReturn ? fmtStamp(r.earliestReturn) : 'When a doctor certifies'), csv: (r) => (r.earliestReturn ? fmtStamp(r.earliestReturn) : '') },
    { key: 'cert', label: 'Certificate', render: (r) => (!r.needsCertificate ? '—' : r.certificateDoc ? <DocButton getLink={api.medDocLink} id={r.certificateDoc}>Open</DocButton> : <Badge tone="amber" size="sm">Needed</Badge>),
      csv: (r) => (!r.needsCertificate ? '' : r.certificateDoc ? 'Received' : 'Needed') },
    { key: 'status', label: 'Status', render: (r) => (ready(r) ? <Badge tone="green" size="sm">Can come back</Badge> : <Badge tone={EXCLUSION_STATUS[r.status]?.tone} size="sm">{labelOf(EXCLUSION_STATUS, r.status)}{r.status === 'cleared' && r.clearedByName ? ` · ${r.clearedByName}` : ''}</Badge>),
      csv: (r) => labelOf(EXCLUSION_STATUS, r.status) },
    { key: 'acts', label: '', align: 'right', stop: true, render: (r) => (r.status === 'excluded' ? (
      <span className="md-acts">
        <Btn size="sm" kind={ready(r) ? 'primary' : undefined} onClick={() => forms.open('clearExclusion', { exclusion: r, studentName: r.studentName })}>Clear to return</Btn>
        <Kebab label="More" items={[
          r.needsCertificate && !r.certificateDoc ? { label: 'Upload the certificate', icon: 'upload', onClick: () => { setForRow(r); fileRef.current?.click(); } } : null,
          { label: 'Cancel this record', icon: 'close', danger: true, onClick: () => drawer.confirm({ title: 'Cancel this off-school record?', reason: true, reasonLabel: 'Why', confirmLabel: 'Cancel it', danger: true,
            run: async (why) => { await api.cancelExclusion(r._id, why); toast.success('Cancelled'); board.reload(); } }) },
        ]} />
      </span>
    ) : null) },
  ];
  return (
    <Page>
      <PageHead icon="calendarCheck" tone="teal" title="Return to School" subtitle="Students off school until it is safe to come back — the earliest return each illness allows, the doctor's certificates still needed, and who has been cleared. Class teachers only hear that a student is away.">
        <Btn kind="primary" icon="plus" onClick={() => setPick(true)}>Off school</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="student" many="students" searchPlaceholder="Search student or illness" exportName="return-to-school"
        onRow={(r) => nav(`/admin/medical/students/${r.studentId || r.student}`)}
        rowClass={(r) => (r.status !== 'excluded' ? 'is-off' : '')}
        filters={<ClassFilter meta={meta} q={board.q} setQ={board.setQ} />}
        empty={<Empty compact title="Nobody is off school">A student sent home with an illness that keeps them off school appears here until they are cleared.</Empty>} />
      <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      <PickStudent open={pick} onClose={() => setPick(false)} title="Off school — choose the student"
        onPick={(s) => { setPick(false); forms.open('exclusion', { studentId: s._id, studentName: s.name, rules }); }} />
      {elements}
    </Page>
  );
}
