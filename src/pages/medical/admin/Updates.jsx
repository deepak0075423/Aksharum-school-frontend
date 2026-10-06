/**
 * Parent Updates (Oct 2026) — what parents have sent for their children's
 * records: allergies, conditions, contacts, doctors, documents. Nothing
 * reaches the record until it is accepted here; the parent is told either way.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Drawer, DrawerHead, DrawerBody, DrawerFoot } from '../../../components/ui/Drawer';
import { Page, PageHead, Btn, Badge, Status, StudentCell, Select, Empty, KV, Section, Note, Field, Switch, Spin, useLoad } from '../mdUI';
import { DocButton } from '../mdShared';
import { CHANGE_KIND, CHANGE_STATUS, ALLERGY_CATEGORY, ALLERGY_SEVERITY, CONDITION_TYPE, CONDITION_SEVERITY, ago, fmtDay, fmtStamp, labelOf, errorText } from '../mdMeta';
import { useBoard, useFocusOpen, BoardPanel } from './mdList';

const ACTION = { add: 'New', update: 'Change', remove: 'No longer applies' };

/** The proposed values, in words. */
function Payload({ kind, payload = {}, current }) {
  const p = payload;
  const rows = {
    allergy: [['Allergy', p.allergen], ['Type', labelOf(ALLERGY_CATEGORY, p.category)], ['Severity', labelOf(ALLERGY_SEVERITY, p.severity)], ['Reaction', p.reaction], ['If exposed', p.emergencyInstructions], ['Medication', p.medication], ['Doctor', p.doctor], ['Note', p.parentNote]],
    condition: [['Condition', p.condition], ['Type', labelOf(CONDITION_TYPE, p.type)], ['Severity', labelOf(CONDITION_SEVERITY, p.severity)], ['Diagnosed', fmtDay(p.diagnosedOn)], ['Treatment', p.treatment], ['Medication', p.medication], ['Doctor', p.doctor], ['In an emergency', p.emergencyInstructions], ['Note', p.parentNote]],
    contact: [['Contact', p.slot === 'alternate' ? 'Alternate contact' : 'Emergency contact'], ['Name', p.name], ['Phone', p.phone], ['Relation', p.relation]],
    doctor: [['Doctor', p.name], ['Phone', p.phone], ['Clinic', p.clinic]],
    hospital: [['Hospital', p.name], ['Phone', p.phone], ['Address', p.address]],
    profile: [['Blood group', p.bloodGroup], ['Dietary restrictions', p.dietaryRestrictions], ['Emergency medication', p.emergencyMedication?.required ? `${p.emergencyMedication.name}${p.emergencyMedication.location ? ` — kept ${p.emergencyMedication.location}` : ''}` : p.emergencyMedication ? 'Not needed' : '']],
    vaccination: [['Vaccine', p.vaccine], ['Dose', p.dose], ['Given on', fmtDay(p.givenOn)], ['Where', p.provider], ['Doctor', p.doctor]],
    document: [['Type', p.type], ['Name', p.title], ['Remarks', p.remarks]],
    remove: [['Reason', p.reason]],
  }[p.reason !== undefined && Object.keys(p).length === 1 ? 'remove' : kind] || [];
  return (
    <>
      <KV cols={1} items={rows} />
      {current ? <Note tone="slate" icon="info">On record now: <b>{current.allergen || current.condition}</b>{current.severity ? ` (${current.severity.replace('_', '-')})` : ''}.</Note> : null}
    </>
  );
}

function UpdateDrawer({ id, onClose, onDone }) {
  const { data: c, loading } = useLoad(() => api.getMedChange(id), id);
  const [note, setNote] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState('');
  const decide = async (decision) => {
    setBusy(decision);
    try {
      await api.reviewMedChange(id, { decision, note, verified });
      toast.success(decision === 'approve' ? 'Added to the record — the parent has been told' : 'Not accepted — the parent has been told');
      onDone(); onClose();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(''); }
  };
  if (loading && !c) return <div className="mdd"><DrawerHead name="Loading…" onClose={onClose} /><DrawerBody><Spin /></DrawerBody></div>;
  if (!c) return null;
  return (
    <div className="mdd">
      <DrawerHead name={`${CHANGE_KIND[c.kind]} — ${ACTION[c.action]}`} sub={`${c.student?.name} · from ${c.submittedByName} · ${fmtStamp(c.createdAt)}`} onClose={onClose}
        tags={<Status of="change" value={c.status} />} />
      <DrawerBody>
        <Section title="What the parent sent" icon="users"><Payload kind={c.kind} payload={c.payload} current={c.current} /></Section>
        {c.note ? <Section title="Their note" icon="chat"><p style={{ margin: 0 }}>{c.note}</p></Section> : null}
        {c.documentInfo ? <Section title="Attached" icon="fileDoc"><DocButton getLink={api.medDocLink} id={c.documentInfo._id}>{c.documentInfo.title}</DocButton></Section> : null}
        {c.profile ? (
          <Section title="On record now" icon="clipboard">
            <KV cols={1} items={[['Emergency contact', [c.profile.emergencyContact?.name, c.profile.emergencyContact?.phone].filter(Boolean).join(' · ')], ['Alternate contact', [c.profile.alternateContact?.name, c.profile.alternateContact?.phone].filter(Boolean).join(' · ')],
              ['Doctor', [c.profile.doctor?.name, c.profile.doctor?.phone].filter(Boolean).join(' · ')], ['Hospital', c.profile.hospital?.name], ['Blood group', c.profile.bloodGroup], ['Diet', c.profile.dietaryRestrictions]]} keep />
          </Section>
        ) : null}
        {c.status === 'pending' ? (
          <Section title="Your answer" icon="checkCircle">
            <Field label="Note to the parent" hint="Required when you do not accept the update — they see it.">
              <textarea className="md-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} />
            </Field>
            {['allergy', 'condition', 'vaccination'].includes(c.kind) && c.action === 'add' ? (
              <Switch checked={verified} onChange={setVerified} label="Verified" hint="You have confirmed it — with a doctor's note, a certificate or the family's doctor." />
            ) : null}
          </Section>
        ) : (
          <Section title="Reviewed" icon="history"><KV cols={1} items={[['By', c.reviewedByName], ['On', fmtStamp(c.reviewedAt)], ['Note', c.reviewNote]]} /></Section>
        )}
      </DrawerBody>
      {c.status === 'pending' ? (
        <DrawerFoot>
          <Btn kind="success" icon="checkCircle" busy={busy === 'approve'} disabled={!!busy} onClick={() => decide('approve')}>Accept and add</Btn>
          <Btn kind="danger" busy={busy === 'reject'} disabled={!!busy || !note.trim()} onClick={() => decide('reject')}>Do not accept</Btn>
        </DrawerFoot>
      ) : null}
    </div>
  );
}

export default function MedicalUpdates() {
  const board = useBoard('changes', { tab: 'pending' });
  const [open, setOpen] = useState(null);
  useFocusOpen(board.focus, React.useCallback((id) => setOpen(id), []));
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'kind', label: 'Update', render: (r) => <span className="md-two"><b>{CHANGE_KIND[r.kind]}</b><em>{ACTION[r.action]}{r.payload?.allergen ? ` · ${r.payload.allergen}` : r.payload?.condition ? ` · ${r.payload.condition}` : r.payload?.vaccine ? ` · ${r.payload.vaccine}` : r.payload?.name ? ` · ${r.payload.name}` : ''}</em></span>, csv: (r) => CHANGE_KIND[r.kind] },
    { key: 'submittedByName', label: 'From', render: (r) => <span className="md-two"><b>{r.submittedByName}</b><em>{ago(r.createdAt)}</em></span> },
    { key: 'doc', label: 'Attached', render: (r) => (r.document ? <Badge tone="slate" icon="fileDoc" size="sm">{r.documentTitle || 'File'}</Badge> : <span className="md-none">—</span>), csv: (r) => r.documentTitle || '' },
    { key: 'status', label: 'Status', render: (r) => <Status of="change" value={r.status} />, csv: (r) => labelOf(CHANGE_STATUS, r.status) },
  ];
  return (
    <Page>
      <PageHead icon="users" tone="indigo" title="Parent Updates" subtitle="Updates parents sent for their children's medical records. Accept one to add it to the record; the parent is told either way." />
      <BoardPanel board={board} columns={columns} noun="update" searchPlaceholder="Search student or parent" exportName="parent-updates" onRow={(r) => setOpen(r._id)}
        filters={<>
          <Select value={board.q.kind} onChange={(v) => board.setQ({ kind: v })} all="Any kind" label="Kind" options={Object.entries(CHANGE_KIND).map(([value, label]) => ({ value, label }))} />
        </>}
        empty={<Empty compact title={board.q.tab === 'pending' ? 'Nothing waiting' : 'No updates here'}>When a parent sends an update from their app or the parent portal, it appears here for review.</Empty>} />
      <Drawer open={!!open} onClose={() => setOpen(null)} label="Parent update">{open ? <UpdateDrawer id={open} onClose={() => setOpen(null)} onDone={board.reload} /> : null}</Drawer>
    </Page>
  );
}
