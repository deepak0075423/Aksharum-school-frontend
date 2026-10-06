/**
 * Medical information — the student's own page and the parent's "My Child's
 * Medical Information" (Oct 2026). One page, two readers.
 *
 * A parent sees each child's record (the child switch is the app's shared
 * one), can authorise a medicine the medical room has set up, and can send
 * updates — an allergy, a condition, a contact, the family doctor, a
 * vaccination, a document — that wait for the medical room's approval.
 * A student sees as much of their own record as the school allows.
 * Neither ever sees the medical staff's private notes or staff-only files.
 */
import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui';
import { ChildSwitch, useChild } from '../../../components/parent/ChildSwitch';
import * as api from '../../../api/medical.api';
import {
  Page, PageHead, Panel, Btn, Badge, Status, Avatar, AlertArea, KV, LineTabs, Empty, Spin, LoadError, Note, Table, Ico, ConfirmDialog, Segmented, useLoad,
} from '../mdUI';
import { FormDialog } from '../mdForm';
import { Timeline, EmergencyCard, DocButton } from '../mdShared';
import { ConsentDialog, ConsentSummary, ConsentBadge } from '../consentParts';
import { GrowthPanel } from '../growthParts';
import { useMedLive, medicalNotice } from '../useMedLive';
import { ScheduleList, ReferralList, FamilyReferralDialog, FamilyCampaigns, IllnessDialog, IllnessList, NoticesList, WHOM } from '../programmeParts';
import {
  ALLERGY_CATEGORY, ALLERGY_SEVERITY, CONDITION_TYPE, CONDITION_SEVERITY, PLAN_FREQUENCY, CHECKUP_TYPE, DOC_TYPE, CHANGE_KIND, INCIDENT_TYPE,
  BLOOD_GROUPS, fmtDay, fmtDate, fmtStamp, fmtTime, ago, labelOf, todayStr, dayInput, fileSize, errorText, telOf,
  CARE_PLAN_KIND, RESCUE_PLACE, rescueState,
} from '../mdMeta';

const opts = (map) => Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }));

function FilePick({ value, onChange }) {
  const ref = React.useRef(null);
  return (
    <div className="md-picker__box" style={{ minHeight: 52 }}>
      <Ico name="upload" size={18} />
      <span style={{ flex: 1, minWidth: 0 }}>{value ? <span className="md-two"><b>{value.name}</b><em>{fileSize(value.size)}</em></span> : <span className="md-muted">PDF or a photo, up to 10 MB</span>}</span>
      <input ref={ref} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(e) => onChange(e.target.files?.[0] || null)} />
      <Btn size="sm" onClick={() => ref.current?.click()}>{value ? 'Change' : 'Choose file'}</Btn>
    </div>
  );
}

// The fields of an allergy or a condition a parent can change.
const RECORD_FIELDS = {
  allergy: ['allergen', 'category', 'severity', 'reaction', 'emergencyInstructions', 'medication', 'doctor'],
  condition: ['type', 'condition', 'severity', 'diagnosedOn', 'medication', 'treatment', 'emergencyInstructions', 'doctor'],
};
const HEALTH = ['allergy', 'condition'];
// The history's filters, each behind the part of the record it belongs to: a
// school may keep visits or documents from students (the server leaves them out too).
const HISTORY_SHOWN_BY = {
  visit: 'visits', incident: 'incidents', first_aid: 'visits', medicine: 'medicines', referral: 'visits',
  checkup: 'checkups', vaccination: 'vaccinations', document: 'documents', follow_up: 'visits',
};

/**
 * What the form starts with. Something new starts from sensible defaults; a
 * change to something on record — an allergy, a condition, a contact, the
 * doctor, the profile — starts from the record as it stands, so a field the
 * parent leaves alone is not sent as a change. (A "Moderate" default used to
 * downgrade a life-threatening allergy when only its reaction was edited.)
 */
function startPayload(record, kind, action, target, slot) {
  const p = record.profile || {};
  if (HEALTH.includes(kind)) {
    if (action === 'remove') return { reason: '' };
    if (action === 'update') {
      const row = ((kind === 'allergy' ? record.allergies : record.conditions) || []).find((x) => x._id === target);
      return row ? Object.fromEntries(RECORD_FIELDS[kind].map((k) => [k, k === 'diagnosedOn' ? dayInput(row[k]) : row[k] ?? ''])) : {};
    }
    return kind === 'allergy' ? { category: 'food', severity: 'moderate' } : { type: 'asthma', severity: 'moderate' };
  }
  switch (kind) {
  case 'contact': {
    const c = (slot === 'alternate' ? p.alternateContact : record.emergencyContact) || {};
    return { slot: slot === 'alternate' ? 'alternate' : 'emergency', name: c.name || '', phone: c.phone || '', relation: c.relation || '' };
  }
  case 'doctor': return { name: p.doctor?.name || '', phone: p.doctor?.phone || '', clinic: p.doctor?.clinic || '' };
  case 'hospital': return { name: p.hospital?.name || '', phone: p.hospital?.phone || '', address: p.hospital?.address || '' };
  case 'profile': {
    const em = p.emergencyMedication || {};
    return { bloodGroup: record.bloodGroup || '', dietaryRestrictions: p.dietaryRestrictions || '',
      emergencyMedication: { required: !!em.required, name: em.name || '', location: em.location || '', instructions: em.instructions || '' } };
  }
  case 'vaccination': return { givenOn: todayStr() };
  case 'document': return { type: 'other' };
  default: return {};
  }
}

// Compared as the server compares them: text trimmed, a switch as true/false.
const norm = (v) => (v && typeof v === 'object' ? JSON.stringify(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : typeof v === 'boolean' ? v : String(v ?? '').trim());
const changedFrom = (now, was) => Object.fromEntries(Object.entries(now || {}).filter(([k, v]) => norm(v) !== norm((was || {})[k])));

/** The parent's update form: what kind of update decides the fields. */
function UpdateForm({ preset, record, onClose, onDone }) {
  const allergies = (record.allergies || []).filter((a) => a.status !== 'resolved');
  const conditions = (record.conditions || []).filter((c) => c.status !== 'resolved');
  // `was` keeps the record as the form loaded it, to send only what differs.
  const load = (v, kind, action, target, slot) => {
    const payload = startPayload(record, kind, action, target, slot);
    return { ...v, kind, action, target, payload, was: payload };
  };
  const first = load({}, preset?.kind || 'allergy', preset?.action || 'add', preset?.target || '');
  return (
    <FormDialog open onClose={onClose} onDone={onDone} title="Send an update to the Medical Room" width={660} submitLabel="Send update"
      success={(res) => ((res?.data ?? res)?.status === 'approved' ? 'Added to the record' : 'Sent — the Medical Room will review it')}
      intro={record.needsApproval ? <Note tone="indigo" icon="info">The Medical Room checks every update before it is added to {record.student.name}&rsquo;s record. You will be told when it is.</Note> : null}
      initial={first}
      sections={(v) => [
        { fields: [
          { name: 'kind', label: 'What is it about?', type: 'select', placeholder: false, wide: true, options: opts(CHANGE_KIND), onSet: (k, x) => load(x, k, 'add', '') },
          { name: 'action', label: 'Update', type: 'seg', wide: true, show: (x) => HEALTH.includes(x.kind), onSet: (a, x) => load(x, x.kind, a, ''),
            options: [{ value: 'add', label: 'Something new' }, { value: 'update', label: 'Change one on record' }, { value: 'remove', label: 'No longer applies' }] },
          { name: 'target', label: 'Which one', type: 'select', required: true, wide: true, show: (x) => HEALTH.includes(x.kind) && x.action !== 'add', onSet: (t, x) => load(x, x.kind, x.action, t),
            options: (x) => (x.kind === 'allergy' ? allergies.map((a) => ({ value: a._id, label: a.allergen })) : conditions.map((c) => ({ value: c._id, label: c.condition }))) },
        ] },
        v.kind === 'allergy' && v.action !== 'remove' ? { title: 'The allergy', icon: 'alertTri', fields: [
          { name: 'payload.allergen', label: 'Allergic to', required: v.action === 'add', placeholder: 'e.g. Peanuts' },
          { name: 'payload.category', label: 'Type', type: 'select', placeholder: false, options: opts(ALLERGY_CATEGORY) },
          { name: 'payload.severity', label: 'How serious', type: 'seg', wide: true, options: opts(ALLERGY_SEVERITY) },
          { name: 'payload.reaction', label: 'What happens', wide: true },
          { name: 'payload.emergencyInstructions', label: 'What to do if exposed', type: 'textarea', rows: 2, wide: true },
          { name: 'payload.medication', label: 'Medicine', placeholder: 'e.g. Auto-injector in the school bag' },
          { name: 'payload.doctor', label: 'Doctor' },
        ] } : null,
        v.kind === 'condition' && v.action !== 'remove' ? { title: 'The condition', icon: 'heartPulse', fields: [
          { name: 'payload.type', label: 'Type', type: 'select', placeholder: false, options: opts(CONDITION_TYPE) },
          { name: 'payload.condition', label: 'Condition', placeholder: 'e.g. Asthma' },
          { name: 'payload.severity', label: 'How serious', type: 'seg', wide: true, options: opts(CONDITION_SEVERITY) },
          { name: 'payload.diagnosedOn', label: 'Diagnosed on', type: 'date', max: todayStr() },
          { name: 'payload.medication', label: 'Medicine' },
          { name: 'payload.treatment', label: 'Treatment', wide: true },
          { name: 'payload.emergencyInstructions', label: 'What to do in an emergency', type: 'textarea', rows: 2, wide: true },
          { name: 'payload.doctor', label: 'Doctor' },
        ] } : null,
        HEALTH.includes(v.kind) && v.action === 'remove' ? { fields: [{ name: 'payload.reason', label: 'What changed', wide: true, placeholder: 'e.g. Outgrown — confirmed by our doctor' }] } : null,
        v.kind === 'contact' ? { title: 'Contact', icon: 'phone', fields: [
          { name: 'payload.slot', label: 'Which contact', type: 'seg', wide: true, onSet: (sl, x) => load(x, 'contact', 'add', '', sl),
            options: [{ value: 'emergency', label: 'Emergency contact' }, { value: 'alternate', label: 'Alternate contact' }] },
          { name: 'payload.name', label: 'Name', required: true, text: 'name' },
          { name: 'payload.phone', label: 'Phone', required: true, type: 'phone' },
          { name: 'payload.relation', label: 'Relation to the child', placeholder: 'e.g. Uncle' },
        ] } : null,
        v.kind === 'doctor' ? { title: 'Family doctor', icon: 'stethoscope', fields: [
          { name: 'payload.name', label: 'Doctor', required: true, text: 'name' }, { name: 'payload.phone', label: 'Phone', type: 'phone' }, { name: 'payload.clinic', label: 'Clinic', wide: true },
        ] } : null,
        v.kind === 'hospital' ? { title: 'Preferred hospital', icon: 'hospital', fields: [
          { name: 'payload.name', label: 'Hospital', required: true }, { name: 'payload.phone', label: 'Phone', type: 'phone' }, { name: 'payload.address', label: 'Address', wide: true },
        ] } : null,
        v.kind === 'profile' ? { title: 'Medical profile', icon: 'clipboard', fields: [
          { name: 'payload.bloodGroup', label: 'Blood group', type: 'select', options: BLOOD_GROUPS },
          { name: 'payload.dietaryRestrictions', label: 'Dietary restrictions', wide: true },
          { name: 'payload.emergencyMedication.required', type: 'switch', label: 'Needs an emergency medication at school', hint: 'e.g. an adrenaline auto-injector or an inhaler' },
          { name: 'payload.emergencyMedication.name', label: 'Medicine', show: (x) => x.payload?.emergencyMedication?.required },
          { name: 'payload.emergencyMedication.location', label: 'Kept where', show: (x) => x.payload?.emergencyMedication?.required },
          { name: 'payload.emergencyMedication.instructions', label: 'How to give it', type: 'textarea', rows: 2, wide: true, show: (x) => x.payload?.emergencyMedication?.required },
        ] } : null,
        v.kind === 'vaccination' ? { title: 'Vaccination', icon: 'syringe', fields: [
          { name: 'payload.vaccine', label: 'Vaccine', required: true }, { name: 'payload.dose', label: 'Dose', placeholder: 'e.g. Dose 2' },
          { name: 'payload.givenOn', label: 'Given on', type: 'date', required: true, max: todayStr() }, { name: 'payload.provider', label: 'Hospital / clinic' },
          { name: 'file', label: 'Certificate', type: 'custom', wide: true, render: ({ value, set }) => <FilePick value={value} onChange={set} /> },
        ] } : null,
        v.kind === 'document' ? { title: 'Document', icon: 'fileDoc', fields: [
          { name: 'file', label: 'File', type: 'custom', required: true, wide: true, render: ({ value, set }) => <FilePick value={value} onChange={set} /> },
          { name: 'payload.type', label: 'Type', type: 'select', placeholder: false, options: opts(DOC_TYPE).filter((o) => o.value !== 'incident_photo') },
          { name: 'payload.title', label: 'Name', placeholder: 'e.g. Fitness certificate 2026' },
          { name: 'payload.documentDate', label: 'Date', type: 'date', max: todayStr() },
          { name: 'payload.expiresOn', label: 'Valid until', type: 'date' },
        ] } : null,
        { fields: [{ name: 'note', label: 'Anything else the Medical Room should know', type: 'textarea', rows: 2, wide: true }] },
      ].filter(Boolean)}
      onSubmit={(v) => {
        const action = HEALTH.includes(v.kind) ? v.action : 'add';
        let payload = v.payload || {};
        // A change, or the profile: only what differs from the record. A
        // contact, the doctor or the hospital is replaced whole, so all of it goes.
        if (action === 'update' || v.kind === 'profile') payload = changedFrom(payload, v.was);
        else if (['contact', 'doctor', 'hospital'].includes(v.kind) && !Object.keys(changedFrom(payload, v.was)).length) payload = {};
        if (action !== 'remove' && !['vaccination', 'document'].includes(v.kind) && !Object.keys(payload).length) {
          throw new Error('Nothing has changed — change what is different on the record, then send it');
        }
        return api.sendMedUpdate({ student: record.student._id, kind: v.kind, action, target: v.target || undefined, payload, note: v.note }, v.file || null);
      }} />
  );
}

// What a parent is asked to do about each kind of urgent news.
const URGENT_ASK = {
  emergency: 'Your child is receiving urgent care in the Medical Room. Please call the school.',
  sent_home: 'Your child is unwell and is being sent home. Please collect them from the school, or tell the school who will.',
  referred: 'Your child has been referred to hospital. Please call the school at once.',
  incident: 'Your child had a serious incident at school. Please call the school.',
};
const ETA = [10, 20, 30, 45, 60, 90];

/** Urgent news the school is waiting for a parent to answer. */
function UrgentBanner({ u, room, onAnswer }) {
  const answered = u.status === 'acknowledged';
  return (
    <section className={`mdf-urgent${answered ? ' is-answered' : ''}`} role={answered ? 'status' : 'alert'}>
      <div className="mdf-urgent__head">
        <Ico name={answered ? 'checkCircle' : 'siren'} size={22} />
        <div>
          <div className="mdf-urgent__title">{u.title}</div>
          <div className="mdf-urgent__body">
            {answered
              ? <>You answered at {fmtTime(u.ackAt)}{u.ackEtaMinutes != null ? ` — arriving in about ${u.ackEtaMinutes} min` : ''}{u.ackNote ? ` — “${u.ackNote}”` : ''}. The school has been told.</>
              : <>{URGENT_ASK[u.kind] || 'Please call the school.'} Sent {fmtTime(u.createdAt)}.</>}
          </div>
        </div>
      </div>
      {!answered ? (
        <div className="mdf-urgent__acts">
          <Btn kind="danger-solid" icon="checkCircle" onClick={() => onAnswer(u)}>I have seen this</Btn>
          {room?.phone ? <Btn as="a" href={`tel:${telOf(room.phone)}`} icon="phone">Call the school</Btn> : null}
        </div>
      ) : null}
    </section>
  );
}

function AnswerDialog({ u, onClose, onDone }) {
  const [eta, setEta] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!u) return null;
  const send = async () => {
    setBusy(true);
    try {
      await api.answerUrgentNotice(u._id, { etaMinutes: eta === '' ? undefined : Number(eta), note });
      toast.success('The school has been told');
      onDone();
    } catch (e) { toast.error(errorText(e)); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose} title="Tell the school you have seen this" maxWidth={480}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={send}>Send</Btn></>}>
      <div className="md-form">
        <div className="md-field">
          <span className="md-field__label">If you are coming, when will you be there?</span>
          <div className="md-chips">
            {ETA.map((m) => <button key={m} type="button" className={String(eta) === String(m) ? 'is-on' : ''} aria-pressed={String(eta) === String(m)} onClick={() => setEta(String(eta) === String(m) ? '' : m)}>{m < 60 ? `${m} min` : `${m / 60 === 1 ? '1 hour' : `${m / 60} hours`}`}</button>)}
          </div>
        </div>
        <div className="md-field">
          <label className="md-field__label" htmlFor="mdf-urgent-note">Anything the school should know <em>(optional)</em></label>
          <textarea id="mdf-urgent-note" className="md-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. My brother Raj will collect her" />
        </div>
      </div>
    </Modal>
  );
}

/** A family's requests about the data the school holds: a copy, a correction, erasure. */
function DataRequestsCard({ child, name }) {
  const list = useLoad(() => api.getFamilyDataRequests(child), `dr:${child}`);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('access');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.sendDataRequest({ child, kind, details }); toast.success('Sent — the school answers within 30 days'); setOpen(false); setDetails(''); list.reload(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <section>
      <h3 className="mdp-h"><Ico name="lock" size={16} /> Your child&rsquo;s data</h3>
      <p className="md-muted" style={{ margin: '0 0 6px', fontSize: '.84rem' }}>Ask for a copy of what the school holds, a correction, or that something be erased. The school answers within 30 days.</p>
      {(list.data || []).map((d) => (
        <div key={d._id} className="mdp-rec">
          <div className="mdp-rec__main">
            <div className="mdp-rec__top"><b>{d.kindLabel}</b><Badge size="sm" tone={d.status === 'open' ? 'amber' : d.status === 'done' ? 'green' : 'slate'}>{d.status === 'open' ? `Answer by ${fmtDate(d.dueOn)}` : d.status === 'done' ? 'Done' : 'Not possible'}</Badge></div>
            <div className="mdp-rec__lines">{d.details ? <span>{d.details}</span> : null}{d.response ? <span><strong>The school:</strong> {d.response}</span> : null}</div>
          </div>
        </div>
      ))}
      <Btn size="sm" kind="tint" icon="send" onClick={() => setOpen(true)}>Ask about {name}&rsquo;s data</Btn>
      {open ? (
        <Modal open onClose={busy ? () => {} : () => setOpen(false)} title="A request about your child's data" maxWidth={520}
          footer={<><Btn onClick={() => setOpen(false)} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={send}>Send</Btn></>}>
          <div className="md-form">
            <div className="md-field">
              <span className="md-field__label">What would you like?</span>
              <div className="md-chips">
                {[['access', 'A copy of the record'], ['correction', 'A correction'], ['erasure', 'Something erased']].map(([k, l]) => <button key={k} type="button" className={kind === k ? 'is-on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
              </div>
            </div>
            <div className="md-field">
              <label className="md-field__label" htmlFor="mdf-dr">{kind === 'access' ? 'Anything to add' : kind === 'correction' ? 'What is wrong, and what it should say' : 'What should be erased, and why'}</label>
              <textarea id="mdf-dr" className="md-textarea" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

/** Off school until it is safe to come back — and the certificate a parent can upload. */
function OffSchool({ x, isParent, name, onChanged }) {
  const ref = React.useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { await api.uploadChildCertificate(x._id, file); toast.success('Certificate sent to the Medical Room'); onChanged(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const open = x.status === 'excluded';
  return (
    <div className={`mdp-rec${open ? ' is-critical' : ' is-off'}`}>
      <div className="mdp-rec__main">
        <div className="mdp-rec__top"><b>{open ? `Off school — ${x.label}` : `Cleared to return — ${x.label}`}</b>
          {x.needsCertificate ? <Badge size="sm" tone={x.certificateDoc ? 'green' : 'amber'}>{x.certificateDoc ? 'Certificate sent' : 'Certificate needed'}</Badge> : null}
        </div>
        <div className="mdp-rec__lines">
          {open ? <span><strong>{x.earliestReturn ? `Back no earlier than ${fmtStamp(x.earliestReturn)}` : 'Back when a doctor certifies fit for school'}</strong></span> : <span>Cleared {fmtStamp(x.clearedAt)}</span>}
          {open ? <span>{x.text}</span> : null}
          {open && x.needsCertificate && !x.certificateDoc ? <span>{isParent ? `Please upload a doctor's fitness certificate before ${name} comes back.` : 'Your parent needs to send a doctor’s fitness certificate.'}</span> : null}
        </div>
      </div>
      {open && isParent && x.needsCertificate && !x.certificateDoc ? (
        <>
          <input ref={ref} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          <Btn size="sm" kind="primary" icon="upload" busy={busy} onClick={() => ref.current?.click()}>Upload certificate</Btn>
        </>
      ) : null}
    </div>
  );
}

export default function FamilyMedical({ role = 'student' }) {
  const isParent = role === 'parent';
  const [params, setParams] = useSearchParams();
  // Incident notices sent before Oct 5 2026 name an 'incidents' tab; they live under Visits & Incidents.
  const askedTab = (params.get('tab') === 'incidents' ? 'visits' : params.get('tab')) || 'overview';
  const kids = useLoad(() => (isParent ? api.getMedChildren() : Promise.resolve([])), role);
  const children = kids.data || [];
  const { child, pick } = useChild(children);
  const childId = child?._id;
  const rec = useLoad(() => (isParent ? (childId ? api.getChildMedical(childId) : Promise.resolve(null)) : api.getMyMedical()), { role, childId });
  // A notice from the Medical Room arrived: the page reads again — urgent news shows its answer at once.
  useMedLive(rec.reload, { event: 'notification:new', when: medicalNotice });
  const [update, setUpdate] = useState(null);
  const [emergency, setEmergency] = useState(null);
  const [ask, setAsk] = useState(null);
  const [confirmPlan, setConfirmPlan] = useState(null);
  const [answering, setAnswering] = useState(null);
  const [consenting, setConsenting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [refAnswer, setRefAnswer] = useState(null);   // { referral, mode }
  const [ill, setIll] = useState(false);
  const setTab = (t) => { const next = new URLSearchParams(params); if (t === 'overview') next.delete('tab'); else next.set('tab', t); setParams(next, { replace: true }); };
  const historyFetcher = useCallback((q) => (isParent ? api.getChildMedHistory(childId, q) : api.getMyMedHistory(q)), [isParent, childId]);
  const getLink = api.fileLink;

  if ((isParent && kids.loading && !kids.data) || (rec.loading && !rec.data)) return <Page><Spin /></Page>;
  if (isParent && !children.length) return <Page><PageHead icon="heartPulse" tone="rose" title="My Child's Medical Information" /><Empty title="No child is linked to your account">Ask the school office to link your child to your account.</Empty></Page>;
  if (rec.error && !rec.data) {
    return <Page><LoadError error={rec.error} onRetry={rec.reload} title={rec.error?.data?.code === 'MEDICAL_STUDENT_OFF' ? 'Medical information is shared with parents' : 'Medical information could not be loaded'} /></Page>;
  }
  const r = rec.data;
  if (!r) return <Page><Spin /></Page>;
  const s = r.student;
  const p = r.profile || {};
  const show = r.show || {};
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'history', label: 'Medical History' },
    ...(show.visits ? [{ key: 'visits', label: 'Visits & Incidents', count: (r.visits || []).filter((v) => ['in_room', 'observation', 'emergency'].includes(v.status)).length }] : []),
    ...(show.medicines ? [{ key: 'medicines', label: 'Medicines', count: r.plans.filter((x) => !x.authorized && x.status === 'paused').length }] : []),
    ...(show.vaccinations ? [{ key: 'vaccinations', label: 'Vaccinations', count: r.vaccinations.filter((v) => ['overdue', 'due_soon'].includes(v.state)).length }] : []),
    ...(show.checkups ? [{ key: 'checkups', label: 'Health Checkups', count: (r.referrals || []).filter((x) => ['waiting', 'booked'].includes(x.status)).length }] : []),
    ...(show.checkups ? [{ key: 'growth', label: 'Growth' }] : []),
    ...(show.documents ? [{ key: 'documents', label: 'Documents' }] : []),
    ...(r.canUpdate ? [{ key: 'updates', label: 'Updates', count: r.changes.filter((c) => c.status === 'pending').length }] : []),
  ];
  // A tab this reader is not shown (an old link, a student's ?tab=updates) opens the overview.
  const tab = tabs.some((t) => t.key === askedTab) ? askedTab : 'overview';
  const openEmergency = async () => {
    if (!isParent) return;
    setEmergency({ loading: true });
    try { const res = await api.getChildEmergency(childId); setEmergency({ data: res?.data ?? res }); } catch (e) { setEmergency(null); toast.error(errorText(e)); }
  };
  const sendUpdate = (preset) => setUpdate(preset || {});

  return (
    <Page className="mdp">
      <PageHead icon="heartPulse" tone="rose" title={isParent ? "My Child's Medical Information" : 'My Health'}
        subtitle={isParent ? 'Your child’s medical record at school — allergies, conditions, visits to the Medical Room, medicines given, checkups and vaccinations. Send the Medical Room an update when something changes.' : 'Your medical information at school.'}>
        {r.canUpdate ? <Btn kind="primary" icon="send" onClick={() => sendUpdate()}>Send an update</Btn> : null}
        {isParent ? <Btn kind="danger" icon="siren" onClick={openEmergency}>Emergency card</Btn> : null}
        {isParent ? <Btn icon="printer" onClick={() => api.downloadPdf(api.familySummaryUrl(s._id), `health-summary-${s.name}.pdf`).catch((e) => toast.error(errorText(e)))}>Health summary</Btn> : null}
        {isParent || show.checkups ? <Btn icon="printer" onClick={() => api.downloadPdf(api.familyAnnualUrl(s._id), `health-card-${s.name}.pdf`).catch((e) => toast.error(errorText(e)))}>Health card</Btn> : null}
        {isParent ? <Btn icon="thermometer" onClick={() => setIll(true)}>{s.name.split(' ')[0]} is unwell</Btn> : null}
      </PageHead>
      {isParent ? <ChildSwitch children={children} child={child} onPick={pick} label="Whose medical information" /> : null}
      {isParent ? (r.urgent || []).map((u) => <UrgentBanner key={u._id} u={u} room={r.room} onAnswer={setAnswering} />) : null}
      {isParent && r.consent?.status !== 'given' ? (
        <Note tone="amber" icon="shieldCheck" action={<Btn size="sm" kind="primary" onClick={() => setConsenting(true)}>Answer now</Btn>}>
          <b>Medical consent{r.consentYear ? ` for ${r.consentYear.yearName}` : ''}:</b> tell the Medical Room what it may do for {s.name} — emergency treatment, everyday medicines, who may see their alerts.
        </Note>
      ) : null}
      <ConsentDialog open={consenting} consent={r.consent} year={r.consentYear} categories={r.otcCategories || []} studentName={s.name} asParent
        save={(v) => api.giveFamilyConsent({ ...v, child: s._id })} onClose={() => setConsenting(false)} onSaved={() => { toast.success('Thank you — the Medical Room has your answer'); rec.reload(); }} />
      {answering ? <AnswerDialog u={answering} onClose={() => setAnswering(null)} onDone={() => { setAnswering(null); rec.reload(); }} /> : null}
      <ConfirmDialog open={withdrawing} onClose={() => setWithdrawing(false)} title="Withdraw your consent?" danger reason reasonLabel="Why" reasonPlaceholder="Optional — e.g. we are moving schools"
        message="The Medical Room will give no everyday medicine and arrange no treatment without asking you first. The medical staff are told at once." confirmLabel="Withdraw"
        onConfirm={async (why) => { await api.withdrawFamilyConsent(r.consent._id, why).catch((e) => { throw new Error(errorText(e)); }); toast.success('Withdrawn'); setWithdrawing(false); rec.reload(); }} />

      <section className="mdp-hero">
        <div className="mdp-hero__photo"><Avatar name={s.name} photo={s.photo} size={76} tone="rose" /></div>
        <div style={{ minWidth: 0 }}>
          <h2 className="mdp-hero__name">{s.name}</h2>
          <div className="mdp-hero__line">
            <span><b>{s.classLabel || 'No class yet'}</b></span>
            <span>Admission No. <b>{s.admissionNumber || '—'}</b></span>
            {s.dob ? <span>Born <b>{fmtDay(s.dob)}{s.age != null ? ` (${s.age})` : ''}</b></span> : null}
          </div>
          <div className="mdp-hero__line"><span>{r.room?.name || 'Medical Room'}{r.room?.phone ? <> · <a href={`tel:${telOf(r.room.phone)}`}>{r.room.phone}</a></> : null}{r.room?.hours ? ` · ${r.room.hours}` : ''}</span></div>
        </div>
        <div className="mdp-hero__facts">
          <div className="mdp-fact is-blood"><span>Blood group</span><strong>{r.bloodGroup || '—'}</strong></div>
          <div className="mdp-fact"><span>Height</span><strong>{p.heightCm ? `${p.heightCm} cm` : '—'}</strong></div>
          <div className="mdp-fact"><span>Weight</span><strong>{p.weightKg ? `${p.weightKg} kg` : '—'}</strong></div>
          <div className="mdp-fact"><span>BMI</span><strong>{p.bmi ?? '—'}</strong></div>
        </div>
      </section>

      <AlertArea alerts={r.alerts} instructions={p.instructions} />

      {isParent ? (r.referrals || []).filter((x) => x.status === 'waiting').map((x) => (
        <Note key={x._id} tone={x.overdue ? 'red' : 'amber'} icon="send" action={<Btn size="sm" kind="primary" onClick={() => setTab('checkups')}>Open</Btn>}>
          The school suggests <b>{s.name}</b> sees <b>{WHOM[x.specialty] || 'a specialist'}</b>{x.dueBy ? ` by ${fmtDay(x.dueBy)}` : ''} — please tell the school what the doctor says.
        </Note>
      )) : null}
      {isParent && (r.campaigns || []).some((c) => c.canAnswer && c.answer === 'pending' && c.consent === 'opt_in') ? (
        <Note tone="indigo" icon="megaphone" action={<Btn size="sm" kind="primary" onClick={() => setTab('overview')}>Answer</Btn>}>
          The school is asking whether <b>{s.name}</b> may take part in a health campaign.
        </Note>
      ) : null}
      {r.plans.some((x) => !x.authorized && x.status === 'paused') && isParent ? (
        <Note tone="amber" icon="shieldCheck" action={<Btn size="sm" kind="primary" onClick={() => setTab('medicines')}>Review</Btn>}>
          The Medical Room is waiting for your permission to give <b>{s.name}</b> a medicine at school.
        </Note>
      ) : null}

      <Panel pad={false}>
        <div className="md-listhead"><LineTabs items={tabs} value={tab} onChange={setTab} /></div>
        <div className="md-panel__body">
          {tab === 'overview' ? (
            <div className="md-grid md-grid--even">
              <div className="md-col">
                <section>
                  <h3 className="mdp-h"><Ico name="alertTri" size={16} /> Allergies</h3>
                  {r.allergies.length ? r.allergies.map((a) => (
                    <div key={a._id} className={`mdp-rec${['severe', 'life_threatening'].includes(a.severity) && a.status !== 'resolved' ? ' is-critical' : ''}${a.status === 'resolved' ? ' is-off' : ''}`}>
                      <div className="mdp-rec__main">
                        <div className="mdp-rec__top"><b>{a.allergen}</b><Status of="allergySeverity" value={a.severity} size="sm" /><Badge size="sm" tone="slate">{labelOf(ALLERGY_CATEGORY, a.category)}</Badge>{a.status === 'resolved' ? <Badge size="sm" tone="slate">No longer applies</Badge> : null}</div>
                        <div className="mdp-rec__lines">{a.reaction ? <span>{a.reaction}</span> : null}{a.emergencyInstructions ? <span><strong>If exposed:</strong> {a.emergencyInstructions}</span> : null}</div>
                      </div>
                      {r.canUpdate && a.status !== 'resolved' ? <Btn size="xs" onClick={() => sendUpdate({ kind: 'allergy', action: 'remove', target: a._id })}>No longer applies</Btn> : null}
                    </div>
                  )) : <p className="md-muted">No allergies on record.</p>}
                  {r.canUpdate ? <Btn size="sm" kind="tint" icon="plus" onClick={() => sendUpdate({ kind: 'allergy' })}>Tell us about an allergy</Btn> : null}
                </section>
                <section>
                  <h3 className="mdp-h"><Ico name="heartPulse" size={16} /> Medical conditions</h3>
                  {r.conditions.length ? r.conditions.map((c) => (
                    <div key={c._id} className={`mdp-rec${['severe', 'critical'].includes(c.severity) && c.status !== 'resolved' ? ' is-critical' : ''}${c.status === 'resolved' ? ' is-off' : ''}`}>
                      <div className="mdp-rec__main">
                        <div className="mdp-rec__top"><b>{c.condition}</b><Status of="conditionSeverity" value={c.severity} size="sm" /><Status of="conditionStatus" value={c.status} size="sm" /></div>
                        <div className="mdp-rec__lines">{c.treatment ? <span>{c.treatment}</span> : null}{c.medication ? <span><strong>Medicine:</strong> {c.medication}</span> : null}</div>
                      </div>
                    </div>
                  )) : <p className="md-muted">No conditions on record.</p>}
                  {r.canUpdate ? <Btn size="sm" kind="tint" icon="plus" onClick={() => sendUpdate({ kind: 'condition' })}>Tell us about a condition</Btn> : null}
                </section>
                <section>
                  <h3 className="mdp-h"><Ico name="shieldCheck" size={16} /> Consent{r.consentYear ? ` for ${r.consentYear.yearName}` : ''} <ConsentBadge consent={r.consent} /></h3>
                  <ConsentSummary consent={r.consent} year={r.consentYear} />
                  {isParent ? (
                    <div className="mdp-tabhead" style={{ marginTop: 8 }}>
                      <Btn size="sm" kind="tint" icon="pencil" onClick={() => setConsenting(true)}>{r.consent?.status === 'given' ? 'Change' : 'Give consent'}</Btn>
                      {r.consent?.status === 'given' ? <Btn size="sm" onClick={() => setWithdrawing(true)}>Withdraw</Btn> : null}
                    </div>
                  ) : null}
                </section>
                {(r.campaigns || []).length ? (
                  <section>
                    <h3 className="mdp-h"><Ico name="megaphone" size={16} /> Health campaigns</h3>
                    <FamilyCampaigns rows={r.campaigns} child={s._id} canAnswer={isParent} onAnswered={rec.reload} />
                  </section>
                ) : null}
                {(r.notices || []).length ? (
                  <section>
                    <h3 className="mdp-h"><Ico name="info" size={16} /> Health notices</h3>
                    <NoticesList rows={r.notices} />
                  </section>
                ) : null}
                {isParent && (r.illnessReports || []).length ? (
                  <section>
                    <h3 className="mdp-h"><Ico name="thermometer" size={16} /> Off sick</h3>
                    <IllnessList rows={r.illnessReports} onWithdraw={async (x) => { try { await api.withdrawIllness(x._id); toast.success('Withdrawn'); rec.reload(); } catch (e) { toast.error(errorText(e)); } }} />
                  </section>
                ) : null}
                {isParent && r.noticeLanguage ? (
                  <section>
                    <h3 className="mdp-h"><Ico name="chat" size={16} /> Medical Room messages</h3>
                    <Segmented value={r.noticeLanguage.mine || ''} label="Language of the Medical Room's messages"
                      onChange={async (v) => { try { await api.setFamilyLanguage(v); toast.success(v === 'hi' ? 'मेडिकल रूम के संदेश अब हिन्दी में आएँगे' : 'Saved'); rec.reload(); } catch (e) { toast.error(errorText(e)); } }}
                      options={[{ value: '', label: `School's choice (${({ en: 'English', hi: 'हिन्दी', both: 'both' })[r.noticeLanguage.school] || 'English'})` }, { value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]} />
                  </section>
                ) : null}
                {isParent ? <DataRequestsCard child={s._id} name={s.name} /> : null}
                {(r.restrictions || []).length || (r.exclusions || []).length ? (
                  <section>
                    <h3 className="mdp-h"><Ico name="calendarCheck" size={16} /> At school</h3>
                    {(r.exclusions || []).map((x) => <OffSchool key={x._id} x={x} isParent={isParent} name={s.name} onChanged={rec.reload} />)}
                    {(r.restrictions || []).map((x) => (
                      <div key={x._id} className="mdp-rec">
                        <div className="mdp-rec__main">
                          <div className="mdp-rec__top"><b>{x.teacherText}</b><Badge size="sm" tone={x.state === 'active' ? 'green' : 'blue'}>{x.state === 'active' ? 'In force' : 'Starts soon'}</Badge></div>
                          <div className="mdp-rec__lines">
                            <span>{fmtDay(x.startsOn)} → {x.endsOn ? fmtDay(x.endsOn) : 'until further notice'}</span>
                            {x.reason ? <span>{x.reason}</span> : null}
                            <span className="md-muted">{isParent ? 'Teachers see what to do, not the reason.' : 'Your teachers know what to do.'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </section>
                ) : null}
                {(r.carePlans || []).length || (r.rescueMeds || []).length ? (
                  <section>
                    <h3 className="mdp-h"><Ico name="heartPulse" size={16} /> Emergency care at school</h3>
                    {(r.carePlans || []).map((c) => (
                      <div key={c._id} className="mdp-rec is-critical mdp-plan">
                        <div className="mdp-rec__main">
                          <div className="mdp-rec__top">
                            <b>{c.title}</b>
                            <Badge size="sm" tone="slate">{labelOf(CARE_PLAN_KIND, c.kind)}</Badge>
                            {c.parentConfirmedAt ? <Badge size="sm" tone="green">Confirmed {fmtDate(c.parentConfirmedAt)}</Badge> : <Badge size="sm" tone="amber">{isParent ? 'Please read and confirm' : 'Waiting for your parent'}</Badge>}
                          </div>
                          {(c.signs || []).length ? <p className="mdp-plan__signs"><strong>Signs:</strong> {c.signs.join('; ')}</p> : null}
                          <ol className="mdp-plan__steps">{(c.steps || []).map((x, i) => <li key={i} className={x.critical ? 'is-critical' : ''}>{x.text}</li>)}</ol>
                          {c.ambulanceWhen ? <p className="mdp-plan__signs"><strong>Ambulance:</strong> {c.ambulanceWhen}</p> : null}
                          {c.doctorName ? <p className="md-muted" style={{ margin: 0, fontSize: '.8rem' }}>Signed off by {c.doctorName}{c.doctorSignedOn ? ` on ${fmtDay(c.doctorSignedOn)}` : ''}{c.reviewDue ? ` · review by ${fmtDay(c.reviewDue)}` : ''}</p> : null}
                        </div>
                        {isParent && !c.parentConfirmedAt ? <Btn size="sm" kind="primary" icon="checkCircle" onClick={() => setConfirmPlan(c)}>Confirm</Btn> : null}
                      </div>
                    ))}
                    {(r.rescueMeds || []).map((m) => {
                      const st = rescueState(m);
                      return (
                        <div key={m._id} className={`mdp-rec${st === 'expired' ? ' is-critical' : ''}`}>
                          <div className="mdp-rec__main">
                            <div className="mdp-rec__top"><b>{m.name}</b>{st ? <Status of="rescue" value={st} size="sm" /> : null}{m.selfCarry ? <Badge size="sm" tone="indigo">Carried by {isParent ? 'your child' : 'you'}</Badge> : null}</div>
                            <div className="mdp-rec__lines">
                              {(m.locations || []).length ? <span><strong>Kept:</strong> {m.locations.map((l) => `${labelOf(RESCUE_PLACE, l.place)}${l.note ? ` (${l.note})` : ''}`).join(', ')}</span> : null}
                              {m.expiresOn ? <span>{st === 'expired' ? <strong>Expired on {fmtDay(m.expiresOn)} — please send a replacement</strong> : `Expires ${fmtDay(m.expiresOn)}`}</span> : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                ) : null}
                {p.dietaryRestrictions || p.emergencyMedication?.required ? (
                  <section>
                    <h3 className="mdp-h"><Ico name="clipboard" size={16} /> Diet and emergency medicine</h3>
                    <KV cols={1} items={[['Dietary restrictions', p.dietaryRestrictions], ['Emergency medication', p.emergencyMedication?.required ? `${p.emergencyMedication.name}${p.emergencyMedication.location ? ` — kept ${p.emergencyMedication.location}` : ''}` : '']]} />
                  </section>
                ) : null}
              </div>
              <div className="md-col">
                <section>
                  <h3 className="mdp-h"><Ico name="phone" size={16} /> Who the school calls</h3>
                  <div className="mdp-contacts">
                    {r.contacts.length ? r.contacts.map((c, i) => (
                      <div key={`${c.phone}-${i}`} className="mdp-contact">
                        <span><Ico name={c.kind === 'parent' ? 'users' : 'phone'} size={16} /></span>
                        <div style={{ minWidth: 0 }}><b>{c.name || '—'}</b><em>{c.relation}</em>{c.phone ? <a href={`tel:${telOf(c.phone)}`}>{c.phone}</a> : null}</div>
                      </div>
                    )) : <p className="md-muted">No contacts on record.</p>}
                  </div>
                  {r.canUpdate ? <Btn size="sm" kind="tint" icon="pencil" onClick={() => sendUpdate({ kind: 'contact' })}>Update a contact</Btn> : null}
                </section>
                <section>
                  <h3 className="mdp-h"><Ico name="stethoscope" size={16} /> Doctor and hospital</h3>
                  <KV cols={1} keep items={[
                    ['Family doctor', p.doctor?.name ? [p.doctor.name, p.doctor.clinic, p.doctor.phone].filter(Boolean).join(' · ') : ''],
                    ['Preferred hospital', p.hospital?.name ? [p.hospital.name, p.hospital.phone].filter(Boolean).join(' · ') : ''],
                  ]} />
                  {r.canUpdate ? <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}><Btn size="sm" kind="tint" onClick={() => sendUpdate({ kind: 'doctor' })}>Update doctor</Btn><Btn size="sm" kind="tint" onClick={() => sendUpdate({ kind: 'hospital' })}>Update hospital</Btn></div> : null}
                </section>
                {show.visits && r.visits.length ? (
                  <section>
                    <h3 className="mdp-h"><Ico name="stethoscope" size={16} /> Latest Medical Room visit</h3>
                    <div className="mdf-card"><b>{r.visits[0].reason}</b><span className="md-muted" style={{ fontSize: '.82rem' }}>{fmtStamp(r.visits[0].arrivedAt)} · <Status of="visit" value={r.visits[0].status} size="sm" /></span>{r.visits[0].treatment ? <span>{r.visits[0].treatment}</span> : null}</div>
                  </section>
                ) : null}
              </div>
            </div>
          ) : null}

          {tab === 'history' ? <Timeline key={childId || 'me'} fetcher={historyFetcher} onOpen={null} compact kinds={Object.keys(HISTORY_SHOWN_BY).filter((k) => show[HISTORY_SHOWN_BY[k]])} /> : null}

          {tab === 'visits' ? (
            <>
              <h3 className="mdp-h"><Ico name="stethoscope" size={16} /> Medical Room visits</h3>
              {r.visits.length ? r.visits.map((v) => (
                <div key={v._id} className="mdf-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{v.reason}</b><Status of="visit" value={v.status} size="sm" /></div>
                  <span className="md-muted" style={{ fontSize: '.8rem' }}>{fmtDate(v.arrivedAt)} at {fmtTime(v.arrivedAt)}{v.departedAt ? ` — left ${fmtTime(v.departedAt)}` : ''}</span>
                  <KV cols={1} items={[['Symptoms', v.symptoms], ['Treatment', v.treatment], ['First aid', v.firstAid], ['Medicine given', (v.medicines || []).map((m) => `${m.name} (${m.dosage})`).join(', ')],
                    ['Rest', v.restAdvised ? `${v.restMinutes || ''} min`.trim() : ''], ['Hospital', v.referral?.referred ? [v.referral.hospital, v.referral.reason].filter(Boolean).join(' — ') : ''],
                    ['Follow-up', v.followUp?.required ? [v.followUp.on ? fmtDay(v.followUp.on) : '', v.followUp.note].filter(Boolean).join(' — ') : '']]} />
                </div>
              )) : <p className="md-muted">No visits to the Medical Room.</p>}
              <h3 className="mdp-h" style={{ marginTop: 20 }}><Ico name="alertTri" size={16} /> Incidents</h3>
              {r.incidents.length ? r.incidents.map((i) => (
                <div key={i._id} className="mdf-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{labelOf(INCIDENT_TYPE, i.type)}{i.location ? ` — ${i.location}` : ''}</b><Status of="incidentSeverity" value={i.severity} size="sm" /></div>
                  <span className="md-muted" style={{ fontSize: '.8rem' }}>{fmtStamp(i.occurredAt)}</span>
                  <KV cols={1} items={[['What happened', i.description], ['Injury', i.injury], ['First aid', i.firstAid]]} />
                </div>
              )) : <p className="md-muted">No incidents.</p>}
            </>
          ) : null}

          {tab === 'medicines' ? (
            <>
              <h3 className="mdp-h"><Ico name="pill" size={16} /> Medicines at school</h3>
              {r.plans.length ? r.plans.map((x) => (
                <div key={x._id} className={`mdp-rec${!x.authorized ? ' is-critical' : ''}`}>
                  <div className="mdp-rec__main">
                    <div className="mdp-rec__top"><b>{x.medicineName} — {x.dosage}</b><Status of="plan" value={x.status} size="sm" />{x.authorized ? <Badge size="sm" tone="green">You authorised it</Badge> : <Badge size="sm" tone="amber">Waiting for your permission</Badge>}</div>
                    <div className="mdp-rec__lines"><span>{labelOf(PLAN_FREQUENCY, x.frequency)}{(x.times || []).length ? ` at ${x.times.join(', ')}` : ''} · from {fmtDay(x.startDate)}{x.endDate ? ` to ${fmtDay(x.endDate)}` : ''}</span>{x.instructions ? <span>{x.instructions}</span> : null}<span>{x.source === 'parent' ? 'You send the medicine' : 'From the school’s stock'}</span></div>
                  </div>
                  {!x.authorized && isParent ? <Btn size="sm" kind="primary" icon="shieldCheck" onClick={() => setAsk(x)}>Authorise</Btn> : null}
                </div>
              )) : <p className="md-muted">No medicine is given at school on a schedule.</p>}
              <h3 className="mdp-h" style={{ marginTop: 20 }}><Ico name="history" size={16} /> Medicines given</h3>
              <Table rows={r.doses} minWidth={560} columns={[
                { key: 'medicineName', label: 'Medicine', primary: true, render: (d) => <span className="md-two"><b>{d.medicineName}</b><em>{d.dosage}</em></span> },
                { key: 'when', label: 'When', render: (d) => fmtStamp(d.givenAt || d.scheduledFor) },
                { key: 'by', label: 'By', render: (d) => d.givenByName || <span className="md-none">—</span> },
                { key: 'status', label: '', render: (d) => <Status of="dose" value={d.status} /> },
              ]} empty={<Empty compact title="None given">Medicines given at school appear here.</Empty>} />
            </>
          ) : null}

          {tab === 'vaccinations' ? (
            <>
              {r.schedule?.on ? (
                <section style={{ marginBottom: 16 }}>
                  <h3 className="mdp-h"><Ico name="calendarCheck" size={16} /> The school&rsquo;s vaccination schedule</h3>
                  <ScheduleList schedule={r.schedule} />
                </section>
              ) : null}
              {r.canUpdate ? <div className="mdp-tabhead"><Btn kind="primary" icon="plus" onClick={() => sendUpdate({ kind: 'vaccination' })}>Add a vaccination</Btn></div> : null}
              <Table rows={r.vaccinations} minWidth={560} columns={[
                { key: 'vaccine', label: 'Vaccine', primary: true, render: (v) => <span className="md-two"><b>{v.vaccine}</b><em>{v.dose}</em></span> },
                { key: 'when', label: 'Given / due', render: (v) => (v.givenOn ? `Given ${fmtDay(v.givenOn)}` : v.dueOn ? `Due ${fmtDay(v.dueOn)}` : '—') },
                { key: 'provider', label: 'Where', render: (v) => v.provider || <span className="md-none">—</span> },
                { key: 'state', label: 'Status', render: (v) => <Status of="vaccination" value={v.state} /> },
                { key: 'cert', label: '', align: 'right', render: (v) => (v.certificate ? <DocButton getLink={getLink} id={v.certificate}>Certificate</DocButton> : null) },
              ]} empty={<Empty compact title="No vaccinations on record">{r.canUpdate ? 'Add your child’s vaccinations with their certificates.' : ''}</Empty>} />
            </>
          ) : null}

          {tab === 'checkups' ? (
            r.checkups.length ? r.checkups.map((k) => (
              <div key={k._id} className="mdf-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <b>{labelOf(CHECKUP_TYPE, k.type)} checkup{k.sessionName ? ` — ${k.sessionName}` : ''}</b>
                  {k.status === 'scheduled' ? <Badge tone="indigo" size="sm">On {fmtDay(k.scheduledOn)}</Badge> : k.outcome ? <Status of="checkupOutcome" value={k.outcome} size="sm" /> : <Badge tone="green" size="sm">Done</Badge>}
                </div>
                {k.status === 'completed' ? (
                  <KV cols={2} items={[['Date', fmtDay(k.checkedOn)], ['Height', k.results?.heightCm ? `${k.results.heightCm} cm` : ''], ['Weight', k.results?.weightKg ? `${k.results.weightKg} kg` : ''], ['BMI', k.results?.bmi],
                    ['Vision', k.results?.visionLeft || k.results?.visionRight ? `Left ${k.results.visionLeft || '—'} · Right ${k.results.visionRight || '—'}` : ''], ['Blood pressure', k.results?.bpSystolic ? `${k.results.bpSystolic}/${k.results.bpDiastolic || '—'}` : ''],
                    ['Findings', k.findings, true], ['Recommendation', k.recommendations, true]]} />
                ) : <span className="md-muted" style={{ fontSize: '.84rem' }}>Scheduled — results will appear here.</span>}
              </div>
            )) : <Empty compact title="No checkups yet">School health checkups appear here with their results.</Empty>
          ) : null}
          {tab === 'checkups' && (r.referrals || []).length ? (
            <section style={{ marginTop: 16 }}>
              <h3 className="mdp-h"><Ico name="send" size={16} /> Referrals to a specialist</h3>
              <ReferralList rows={r.referrals} family={isParent} onAnswer={(referral, mode) => setRefAnswer({ referral, mode })} />
            </section>
          ) : null}

          {tab === 'growth' ? <GrowthPanel growth={r.growth} family /> : null}

          {tab === 'documents' ? (
            <>
              {r.canUpdate ? <div className="mdp-tabhead"><Btn kind="primary" icon="upload" onClick={() => sendUpdate({ kind: 'document' })}>Send a document</Btn></div> : null}
              <Table rows={r.documents} minWidth={560} columns={[
                { key: 'title', label: 'Document', primary: true, render: (d) => <span className="md-two"><b>{d.title}</b><em>{labelOf(DOC_TYPE, d.type)}</em></span> },
                { key: 'date', label: 'Date', render: (d) => (d.documentDate ? fmtDay(d.documentDate) : fmtDate(d.createdAt)) },
                { key: 'status', label: 'Status', render: (d) => <Status of="docStatus" value={d.status} /> },
                { key: 'view', label: '', align: 'right', render: (d) => <DocButton getLink={getLink} id={d._id} /> },
              ]} empty={<Empty compact title="No documents">Certificates and reports the school shares with you appear here.</Empty>} />
            </>
          ) : null}

          {tab === 'updates' ? (
            <>
              <div className="mdp-tabhead"><Btn kind="primary" icon="send" onClick={() => sendUpdate()}>Send an update</Btn></div>
              {r.changes.length ? r.changes.map((c) => (
                <div key={c._id} className="mdf-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <b>{CHANGE_KIND[c.kind]}{c.payload?.allergen ? ` — ${c.payload.allergen}` : c.payload?.condition ? ` — ${c.payload.condition}` : c.payload?.vaccine ? ` — ${c.payload.vaccine}` : c.payload?.name ? ` — ${c.payload.name}` : ''}</b>
                    <Status of="change" value={c.status} size="sm" />
                  </div>
                  <span className="md-muted" style={{ fontSize: '.8rem' }}>Sent {ago(c.createdAt)}{c.reviewedAt ? ` · answered ${ago(c.reviewedAt)}` : ''}</span>
                  {c.reviewNote ? <span><b>Medical Room:</b> {c.reviewNote}</span> : null}
                  {c.status === 'pending' ? <div><Btn size="xs" kind="ghost" onClick={async () => { try { await api.withdrawMedUpdate(c._id); toast.success('Withdrawn'); rec.reload(); } catch (e) { toast.error(errorText(e)); } }}>Withdraw</Btn></div> : null}
                </div>
              )) : <Empty compact title="No updates sent">Tell the Medical Room about a new allergy, a condition, a contact or your doctor — it is added once they have checked it.</Empty>}
            </>
          ) : null}
        </div>
      </Panel>

      {update ? <UpdateForm preset={update} record={r} onClose={() => setUpdate(null)} onDone={() => { rec.reload(); setTab('updates'); }} /> : null}
      {refAnswer ? <FamilyReferralDialog referral={refAnswer.referral} mode={refAnswer.mode} onClose={() => setRefAnswer(null)} onDone={() => { setRefAnswer(null); rec.reload(); }} /> : null}
      {ill ? <IllnessDialog child={s._id} name={s.name} symptoms={r.symptoms || {}} onClose={() => setIll(false)} onDone={() => { setIll(false); rec.reload(); }} /> : null}
      <ConfirmDialog open={!!confirmPlan} onClose={() => setConfirmPlan(null)} title="Confirm this care plan?" icon="checkCircle" tone="indigo" confirmLabel="I have read it and agree"
        message={confirmPlan ? <>You confirm that the steps in <b>{confirmPlan.title}</b> are what the school should do for {s.name} in an emergency. If anything is wrong or out of date, send the Medical Room an update instead.</> : ''}
        onConfirm={async () => { await api.confirmMedCarePlan(confirmPlan._id); toast.success('Thank you — the care plan is confirmed'); setConfirmPlan(null); rec.reload(); }} />
      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} title="Authorise this medicine?" icon="shieldCheck" tone="indigo" confirmLabel="I authorise it"
        message={ask ? <>You give the school permission to give <b>{s.name}</b> <b>{ask.medicineName}</b> ({ask.dosage}), {labelOf(PLAN_FREQUENCY, ask.frequency).toLowerCase()}{(ask.times || []).length ? ` at ${ask.times.join(', ')}` : ''}, as set up by the Medical Room. You will be told each time a dose is given.</> : ''}
        onConfirm={async () => { await api.authorizeMedPlan(ask._id); toast.success('Thank you — the medicine is authorised'); setAsk(null); rec.reload(); }} />
      {emergency ? (
        <Modal open onClose={() => setEmergency(null)} title="Emergency card" maxWidth={820}>
          {emergency.loading ? <Spin /> : <EmergencyCard data={emergency.data} onClose={() => setEmergency(null)} />}
        </Modal>
      ) : null}
    </Page>
  );
}
