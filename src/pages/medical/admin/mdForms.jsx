/**
 * Every form the medical staff fill in (Oct 2026), defined once.
 *
 *   const { open, element } = useMedForms({ meta, onDone });
 *   open('visit', { student })       … render {element} once on the page
 *
 * The dashboard's quick actions, the room board, a student's profile and the
 * list screens all open the same dialogs, so a visit recorded from anywhere
 * is the same visit. When a student is chosen, their medical alerts appear in
 * the form itself — the allergy to a medicine is on screen while the medicine
 * is being chosen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { FormDialog, VitalsFields, MedicineLines, SupplyLines, clean } from '../mdForm';
import PhoneInput from '../../../components/ui/PhoneInput';
import { phoneError } from '../../../utils/validators';
import {
  Dialog, Btn, IconBtn, Field, Note, Segmented, Switch, AlertArea, Ico, Spin, Select, Chips, useLoad,
} from '../mdUI';
import {
  VISIT_STATUS, VISIT_NEXT, DEPARTED, INCIDENT_TYPE, INCIDENT_SEVERITY, ALLERGY_CATEGORY, ALLERGY_SEVERITY,
  CONDITION_TYPE, CONDITION_SEVERITY, CONDITION_STATUS, PLAN_FREQUENCY, CHECKUP_TYPE, CHECKUP_OUTCOME, DOC_TYPE,
  DOC_VISIBILITY, BED_KIND, BED_STATUS, EQUIP_TYPE, EQUIP_STATUS, EQUIP_CONDITION, BLOOD_GROUPS,
  RESCUE_KIND, RESCUE_PLACE, CARE_PLAN_KIND, RESTRICTION_KIND, PLACE_KIND, DISPOSAL_METHOD,
  stampInput, todayStr, dayInput, addDays, errorText, labelOf, fileSize, fmtStamp,
} from '../mdMeta';
import { DoseCheck, withSafety } from './mdSafety';

// The phone typed under "Someone else" stays in the form when a known contact
// is picked instead; it is not theirs, so it is not sent.
const collectionToSend = (c) => (c?.contact === 'other' ? c : { ...c, phone: undefined });

/* ── Return-to-school rules, read once ────────────────────────────────────── */

let rulesPromise = null;
export function useExclusionRules() {
  const [rules, setRules] = useState(null);
  useEffect(() => {
    let alive = true;
    rulesPromise = rulesPromise || api.getExclusionRules().then((r) => r?.data ?? r).catch((e) => { rulesPromise = null; throw e; });
    rulesPromise.then((x) => { if (alive) setRules(x); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return rules;
}
/** After the settings change the rules: the next form reads them again. */
export const forgetExclusionRules = () => { rulesPromise = null; };

/** The rule chosen, and when that would let the student back. */
function RulePreview({ rules, rule, from }) {
  const r = rules?.rules?.[rule];
  if (!r) return null;
  const ms = ((r.days || 0) * 24 + (r.hours || 0)) * 3600000;
  const at = ms ? new Date(new Date(from || Date.now()).getTime() + ms) : null;
  return (
    <Note tone="indigo" icon="calendarCheck">
      {r.text} {at ? <>Earliest return: <b>{fmtStamp(at)}</b>.</> : rule === 'other' ? null : <>No fixed period.</>}
      {r.needsCertificate ? <> A doctor&rsquo;s fitness certificate is needed.</> : null}
    </Note>
  );
}

/* ── Meta: the lists, the stock and the beds the forms offer ──────────────── */

let metaCache = null;
let metaAt = 0;
const listeners = new Set();

/** Settings, classes, beds and in-date stock. Cached for a minute; `refresh()` after stock moves. */
export function useMeta() {
  const [meta, setMeta] = useState(metaCache);
  const refresh = useCallback(async () => {
    try {
      const res = await api.getMedMeta();
      metaCache = res?.data ?? res; metaAt = Date.now();
      listeners.forEach((fn) => fn(metaCache));
    } catch { /* the page shows its own error */ }
  }, []);
  useEffect(() => {
    listeners.add(setMeta);
    if (!metaCache || Date.now() - metaAt > 60000) refresh();
    return () => { listeners.delete(setMeta); };
  }, [refresh]);
  return { meta, refresh };
}
export const refreshMeta = async () => {
  try { const res = await api.getMedMeta(); metaCache = res?.data ?? res; metaAt = Date.now(); listeners.forEach((fn) => fn(metaCache)); } catch { /* ignore */ }
};

/* ── A chosen student's alerts and plans, shared by the parts of one form ─── */

const briefCache = new Map();
function useBrief(id) {
  const [brief, setBrief] = useState(id ? briefCache.get(id) || null : null);
  useEffect(() => {
    if (!id) { setBrief(null); return undefined; }
    let alive = true;
    if (briefCache.has(id)) setBrief(briefCache.get(id));
    api.getMedStudent(id).then((r) => {
      const d = r?.data ?? r;
      const b = { alerts: d.alerts || [], plans: (d.plans || []).filter((p) => p.status === 'active'), instructions: d.profile?.instructions || '', openVisit: d.openVisit, bloodGroup: d.bloodGroup };
      briefCache.set(id, b);
      if (alive) setBrief(b);
    }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return brief;
}

function StudentAlerts({ id }) {
  const b = useBrief(id);
  if (!id) return null;
  if (!b) return <Spin label="Checking medical alerts…" />;
  return (
    <>
      {b.openVisit ? <Note tone="amber" icon="bed">This student is already in the Medical Room ({b.openVisit.number}). Update that visit instead.</Note> : null}
      <AlertArea alerts={b.alerts} instructions={b.instructions} compact />
    </>
  );
}

function PlanLines({ value, onChange, items, studentId }) {
  const b = useBrief(studentId);
  return (
    <MedicineLines value={value} onChange={onChange} items={items} plans={b?.plans || []}
      renderCheck={studentId ? (l) => (
        <DoseCheck compact studentId={studentId} item={l.source === 'parent' || l.plan ? '' : l.item} plan={l.plan || ''}
          medicineName={l.source === 'parent' ? l.medicineName : ''} />
      ) : null} />
  );
}

/* ── Small field helpers ──────────────────────────────────────────────────── */

const opts = (map) => Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }));
const seg = (map, keys) => (keys || Object.keys(map)).map((k) => ({ value: k, label: labelOf(map, k), tone: map[k]?.tone }));
const FORMS_MED = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Inhaler', 'Cream / Ointment', 'Drops', 'Injection', 'Sachet', 'Spray', 'Other'];
const UNITS_MED = ['tablet', 'capsule', 'ml', 'bottle', 'strip', 'sachet', 'dose', 'tube', 'inhaler', 'piece'];
const UNITS_SUP = ['piece', 'roll', 'pack', 'box', 'pair', 'bottle', 'ml', 'tube'];
const ROUTES = ['Oral', 'Inhaled', 'Topical', 'Eye drops', 'Ear drops', 'Nasal', 'Injection', 'Other'];
const DAYS = [{ value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }];
const SLOTS = { once: 1, twice: 2, thrice: 3 };
const DEFAULT_TIMES = { once: ['11:00'], twice: ['10:00', '13:00'], thrice: ['09:00', '11:30', '14:00'], custom: ['11:00'], as_needed: [] };
const maxNow = () => stampInput(new Date(Date.now() + 60000));

const followUpFields = (prefix = 'followUp') => [
  { name: `${prefix}.required`, type: 'switch', label: 'Follow-up needed', hint: 'The medical room will see this student again — it appears under Follow-ups and the parents are told.' },
  { name: `${prefix}.on`, label: 'Follow-up on', type: 'date', min: todayStr(), show: (v) => v[prefix]?.required },
  { name: `${prefix}.note`, label: 'What to follow up', placeholder: 'e.g. Check the dressing, recheck temperature', show: (v) => v[prefix]?.required },
];
const referralFields = (prefix = 'referral', always) => [
  ...(always ? [] : [{ name: `${prefix}.referred`, type: 'switch', label: 'Referred to hospital', hint: 'The student was sent to a hospital or a doctor.' }]),
  { name: `${prefix}.hospital`, label: 'Hospital / clinic', required: !!always, show: (v) => always || v[prefix]?.referred },
  { name: `${prefix}.transport`, label: 'Transport', type: 'select', options: ['Ambulance', 'School vehicle', 'Parent', 'Taxi / auto', 'Other'], show: (v) => always || v[prefix]?.referred },
  { name: `${prefix}.accompaniedBy`, label: 'Accompanied by', placeholder: 'Who went with the student', show: (v) => always || v[prefix]?.referred },
  { name: `${prefix}.reason`, label: 'Reason for referral', wide: true, show: (v) => always || v[prefix]?.referred },
];

/* ── The visit form (new, from a request, from an incident) ──────────────── */

function visitSections(meta, { preset, edit } = {}) {
  const s = meta?.settings || {};
  const beds = (meta?.beds || []).filter((b) => b.status === 'available');
  return (v) => [
    !edit ? {
      title: 'Student and arrival', icon: 'student',
      fields: [
        { name: 'student', label: 'Student', type: 'student', required: true, wide: true, fetcher: api.findMedStudents, disabled: !!preset?.student, autoFocus: !preset?.student },
        { name: 'arrivedAt', label: 'Arrived at', type: 'datetime', required: true, max: maxNow() },
        ...(rooms(meta).length > 1 ? [{ name: 'location', label: 'Room', type: 'select', placeholder: false, options: rooms(meta).map((r) => ({ value: r.isMain ? '' : r._id, label: r.name })) }] : []),
        { name: 'reason', label: 'Reason for visit', type: 'chips', required: true, options: s.visitReasons || [], wide: true, placeholder: 'Type or pick one below' },
      ],
    } : null,
    !edit && v.student?._id ? { title: 'Medical alerts', icon: 'alertTri', render: () => <StudentAlerts id={v.student._id} /> } : null,
    edit ? { title: 'Reason', icon: 'clipboard', fields: [{ name: 'reason', label: 'Reason for visit', type: 'chips', required: true, options: s.visitReasons || [], wide: true }] } : null,
    { title: 'Symptoms and vitals', icon: 'thermometer', fields: [
      { name: 'symptoms', label: 'Symptoms', type: 'textarea', rows: 2, wide: true, placeholder: 'What the student describes' },
      { name: 'vitals', label: '', type: 'custom', wide: true, render: ({ value, set }) => <VitalsFields value={value || {}} onChange={set} unit={s.temperatureUnit || 'F'} /> },
    ] },
    { title: 'Assessment and treatment', icon: 'stethoscope', fields: [
      { name: 'observation', label: 'Initial observation', type: 'textarea', rows: 2, wide: true },
      { name: 'treatment', label: 'Treatment provided', type: 'textarea', rows: 2, wide: true },
      { name: 'firstAid', label: 'First aid provided', type: 'textarea', rows: 2, wide: true, placeholder: 'e.g. Wound cleaned and dressed' },
      { name: 'supplies', label: edit ? 'First-aid supplies used now' : 'First-aid supplies used', type: 'custom', wide: true, hint: 'Taken out of stock when you save.', render: ({ value, set }) => <SupplyLines value={value || []} onChange={set} items={meta?.supplies || []} /> },
      { name: 'medicines', label: edit ? 'Medicine given now' : 'Medicine given', type: 'custom', wide: true, hint: 'Each becomes a dose in the administration history; school stock is reduced when you save.',
        render: ({ value, set, values }) => <PlanLines value={value || []} onChange={set} items={meta?.medicines || []} studentId={values.student?._id || preset?.student?._id} /> },
    ] },
    { title: 'Rest and the room', icon: 'bed', fields: [
      { name: 'restAdvised', type: 'switch', label: 'Rest advised' },
      { name: 'restMinutes', label: 'Rest for', type: 'number', unit: 'min', min: 0, max: 600, show: (x) => x.restAdvised },
      ...(!edit ? [
        { name: 'status', label: 'Where is the student now?', type: 'seg', wide: true, options: seg(VISIT_STATUS, ['in_room', 'observation', 'emergency', 'returned', 'sent_home', 'referred']) },
        { name: 'bed', label: 'Bed / rest area', type: 'select', placeholder: beds.length ? 'No bed' : 'No bed free', options: beds.map((b) => ({ value: b._id, label: `${b.label} (${labelOf(BED_KIND, b.kind)})` })), show: (x) => s.hasBeds && ['in_room', 'observation', 'emergency'].includes(x.status) },
        { name: 'outcomeNote', label: 'Message for the class teacher', placeholder: 'e.g. Rested 15 minutes, fine to continue', wide: true, show: (x) => DEPARTED.includes(x.status), hint: 'The only part of the visit the teacher sees.' },
      ] : []),
    ] },
    !edit ? { title: 'Hospital referral', icon: 'ambulance', show: (x) => x.status === 'referred', fields: referralFields('referral', true) } : { title: 'Hospital referral', icon: 'ambulance', fields: referralFields('referral') },
    { title: 'Parents and follow-up', icon: 'phone', fields: [
      { name: 'parentContacted', type: 'switch', label: 'Parent contacted', hint: 'You spoke to a parent or guardian about this visit.' },
      { name: 'parentContactNote', label: 'What was said', wide: true, show: (x) => x.parentContacted },
      ...followUpFields(),
    ] },
    { title: 'Notes', icon: 'pencil', fields: [
      { name: 'remarks', label: 'Remarks', type: 'textarea', rows: 2, wide: true },
      { name: 'privateNotes', label: 'Private notes (medical staff only)', type: 'textarea', rows: 2, wide: true, hint: 'Never shown to teachers, students or parents.' },
    ] },
  ].filter(Boolean);
}

/** The Medical Rooms of the school (most schools have one), and any hostel sick bay a night nurse works in. */
const rooms = (meta) => (meta?.places || []).filter((pl) => pl.kind === 'room' || pl.kind === 'hostel');

const visitBody = (v) => ({
  student: v.student?._id, arrivedAt: v.arrivedAt ? new Date(v.arrivedAt).toISOString() : undefined, reason: v.reason, symptoms: v.symptoms,
  location: v.location || undefined,
  vitals: v.vitals, observation: v.observation, treatment: v.treatment, firstAid: v.firstAid,
  supplies: (v.supplies || []).filter((x) => x.item && Number(x.quantity) > 0),
  // A blank quantity is left for the server to fill (the plan's units per dose,
  // or one) — sending it as 0 recorded a medicine as given with nothing taken from stock.
  medicines: (v.medicines || []).filter((m) => m.plan || m.item || m.medicineName).map((m) => ({
    ...m, quantity: m.source === 'parent' ? 0 : (m.quantity === '' || m.quantity === null || m.quantity === undefined ? undefined : Number(m.quantity)),
  })),
  restAdvised: !!v.restAdvised, restMinutes: v.restAdvised ? v.restMinutes : null, status: v.status, bed: v.bed || undefined, outcomeNote: v.outcomeNote,
  referral: v.referral, followUp: v.followUp, parentContacted: !!v.parentContacted, parentContactNote: v.parentContactNote,
  remarks: v.remarks, privateNotes: v.privateNotes, request: v.request || undefined, incident: v.incident || undefined,
});

/* ── Visit status ─────────────────────────────────────────────────────────── */

export function VisitStatusDialog({ visit, open, onClose, onDone, meta }) {
  const options = VISIT_NEXT[visit?.status] || [];
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('');
  const [bed, setBed] = useState('');
  const [ref, setRef] = useState({});
  const [notify, setNotify] = useState(true);
  const [collectNow, setCollectNow] = useState(false);
  const [collection, setCollection] = useState({ idChecked: true });
  const [offRule, setOffRule] = useState('');
  const [offUntil, setOffUntil] = useState('');
  const rules = useExclusionRules();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // In the room, the usual next step is back to class. Once the student has
  // left, the step is to close the case — preselecting the first option there
  // offered "Sent Home" on a returned visit, one click from an urgent
  // "collect your child" message to the parents.
  const firstChoice = () => (DEPARTED.includes(visit?.status)
    ? (options.includes('closed') ? 'closed' : '')
    : (options.includes('returned') ? 'returned' : options[0] || ''));
  useEffect(() => { if (open) { setStatus(firstChoice()); setNote(''); setOutcome(''); setBed(''); setRef({ hospital: visit?.referral?.hospital || '' }); setNotify(true); setCollectNow(false); setCollection({ idChecked: true }); setOffRule(''); setOffUntil(''); setErr(''); } }, [open, visit?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  const beds = (meta?.beds || []).filter((b) => b.status === 'available');
  const go = async () => {
    const handover = status === 'sent_home' && collectNow;
    if (handover && !collection.contact) { setErr('Choose who collected the student'); return; }
    const badPhone = handover && collection.contact === 'other' && phoneError(collection.phone, 'Their phone');
    if (badPhone) { setErr(badPhone); return; }
    if (status === 'sent_home' && offRule === 'other' && !offUntil) { setErr('Give the date the student can come back'); return; }
    setBusy(true); setErr('');
    try {
      await api.setVisitStatus(visit._id, {
        status, note, outcomeNote: outcome, bed: bed || undefined, referral: status === 'referred' ? { ...ref, referred: true } : undefined, notifyParents: notify,
        collection: handover ? collectionToSend(collection) : undefined,
        exclusion: status === 'sent_home' && offRule ? { rule: offRule, until: offRule === 'other' ? offUntil : undefined } : undefined,
      });
      toast.success(`Visit ${visit.number}: ${labelOf(VISIT_STATUS, status)}`);
      onDone?.(); onClose();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  if (!visit) return null;
  const departing = DEPARTED.includes(status);
  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title="Update where the student is" icon="bed" tone={status === 'emergency' || status === 'referred' ? 'red' : 'indigo'} width={600}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind={status === 'emergency' ? 'emergency' : 'primary'} busy={busy} onClick={go} disabled={!status}>{status ? labelOf(VISIT_STATUS, status) : 'Choose'}</Btn></>}>
      <div className="md-subject"><strong>{visit.student?.name || visit.studentName}</strong><span>{visit.number} · {visit.reason}</span></div>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
      <Field label="Now">
        <Segmented value={status} onChange={setStatus} options={seg(VISIT_STATUS, options)} label="New status" />
      </Field>
      {status === 'observation' && !visit.bed && beds.length ? (
        <Field label="Bed / rest area" optional><Select value={bed} onChange={setBed} all="No bed" options={beds.map((b) => ({ value: b._id, label: b.label }))} /></Field>
      ) : null}
      {status === 'referred' ? (
        <div className="md-form__grid">
          <Field label="Hospital / clinic" required><input className="md-input" value={ref.hospital || ''} onChange={(e) => setRef({ ...ref, hospital: e.target.value })} /></Field>
          <Field label="Transport"><input className="md-input" value={ref.transport || ''} onChange={(e) => setRef({ ...ref, transport: e.target.value })} placeholder="Ambulance, parent, school vehicle" /></Field>
          <Field label="Accompanied by"><input className="md-input" value={ref.accompaniedBy || ''} onChange={(e) => setRef({ ...ref, accompaniedBy: e.target.value })} /></Field>
          <Field label="Reason"><input className="md-input" value={ref.reason || ''} onChange={(e) => setRef({ ...ref, reason: e.target.value })} /></Field>
        </div>
      ) : null}
      {departing ? (
        <Field label="Message for the class teacher" hint="The teacher who sent the student and the class teacher see this, and nothing else of the visit.">
          <input className="md-input" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder={status === 'returned' ? 'Rested 20 minutes; fine to continue' : status === 'sent_home' ? 'Fever — collected by mother' : 'Taken to hospital for an X-ray'} maxLength={300} />
        </Field>
      ) : null}
      {status === 'sent_home' ? (
        <>
          <Switch checked={collectNow} onChange={setCollectNow} label="Collected now — the person is here" hint="Otherwise the student waits in the room and appears under “Waiting to be collected”." />
          {collectNow ? <CollectorPick visitId={visit._id} value={collection} onChange={setCollection} /> : null}
          <Field label="Must stay off school" optional hint="The family is told when the student can come back; class teachers only that they are away.">
            <select className="md-input" value={offRule} onChange={(e) => setOffRule(e.target.value)} aria-label="Must stay off school">
              <option value="">No — back when well</option>
              {Object.entries(rules?.rules || {}).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>
          </Field>
          {offRule === 'other' ? <Field label="Can come back on" required><input className="md-input" type="date" value={offUntil} min={todayStr()} onChange={(e) => setOffUntil(e.target.value)} /></Field> : null}
          {offRule ? <RulePreview rules={rules} rule={offRule} /> : null}
        </>
      ) : null}
      <Field label="Note" optional><input className="md-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
      {status !== 'closed' && status !== 'in_room' && status !== 'observation' ? (
        <Switch checked={notify} onChange={setNotify} label="Tell the parents" hint={status === 'emergency' || status === 'sent_home' || status === 'referred' ? 'Sent at once, and emailed — this is urgent news.' : 'They receive a short summary of the visit.'} />
      ) : null}
    </Dialog>
  );
}

/* ── The hook ─────────────────────────────────────────────────────────────── */

export function useMedForms({ meta, onDone, refreshMeta: refresh } = {}) {
  const [d, setD] = useState(null);            // { kind, preset }
  const close = useCallback(() => setD(null), []);
  // Every opening is a fresh form (its own key), so nothing typed into one
  // dialog leaks into the next.
  const open = useCallback(async (kind, preset = {}) => {
    // A visit form needs the whole visit — a list row is only a summary, and
    // editing from one would save its blanks over what is on record.
    if ((kind === 'visitEdit' || kind === 'visitStatus') && preset.visitId && !preset.visit) {
      try { const r = await api.getVisit(preset.visitId); preset = { ...preset, visit: r?.data ?? r }; }
      catch (e) { toast.error(errorText(e)); return; }
    }
    // A care plan starts from its kind's template, and can name one of the child's rescue medicines.
    if (kind === 'carePlan' && !preset.templates) {
      try { const r = await api.getCarePlanTemplates(); preset = { ...preset, templates: r?.data ?? r }; }
      catch (e) { toast.error(errorText(e)); return; }
    }
    setD({ kind, preset, seq: Date.now() });
  }, []);
  const done = useCallback((res, values) => { onDone?.(d?.kind, res, values); if (refresh) refresh(); else refreshMeta(); }, [onDone, d, refresh]);
  const s = meta?.settings || {};
  const p = d?.preset || {};

  const element = useMemo(() => {
    if (!d) return null;
    const common = { open: true, onClose: close, onDone: done };
    switch (d.kind) {
    case 'visit':
      return <FormDialog {...common} title={p.request ? `Student arrived — ${p.student?.name || ''}` : p.incident ? 'Treat in the Medical Room' : 'Add a Medical Room visit'} width={760}
        sections={visitSections(meta, { preset: p })} submitLabel="Save visit" success="Visit recorded"
        initial={{ student: p.student || null, arrivedAt: stampInput(), reason: p.reason || '', symptoms: p.symptoms || '', status: 'in_room', vitals: { tempUnit: s.temperatureUnit || 'F' }, request: p.request, incident: p.incident, medicines: [], supplies: [], location: p.room || '' }}
        onSubmit={(v) => withSafety((override) => {
          const body = { ...visitBody(v), override };
          if (p.request) return api.arriveMedRequest(p.request, body);
          if (p.incident) return api.treatIncident(p.incident, body);
          return api.createVisit(body);
        })} />;
    case 'visitEdit': {
      const v = p.visit;
      return <FormDialog {...common} title={`Update ${v.number}`} width={760} sections={visitSections(meta, { edit: true, preset: { student: v.student } })} submitLabel="Save changes" success="Visit updated"
        initial={{ reason: v.reason, symptoms: v.symptoms, vitals: { tempUnit: s.temperatureUnit || 'F', ...(v.vitals || {}) }, observation: v.observation, treatment: v.treatment, firstAid: v.firstAid,
          restAdvised: v.restAdvised, restMinutes: v.restMinutes, parentContacted: v.parentContacted, parentContactNote: v.parentContactNote, referral: v.referral || {},
          followUp: { ...(v.followUp || {}), on: dayInput(v.followUp?.on) }, remarks: v.remarks, privateNotes: v.privateNotes, medicines: [], supplies: [], student: v.student }}
        onSubmit={(x) => { const b = visitBody(x); delete b.student; delete b.arrivedAt; delete b.status; delete b.bed; delete b.location; return withSafety((override) => api.updateVisit(v._id, { ...b, override })); }} />;
    }
    case 'incident':
      return <FormDialog {...common} title={p.incident ? `Edit ${p.incident.number}` : 'Report a medical incident'} width={720} submitLabel={p.incident ? 'Save changes' : 'Report incident'} success={p.incident ? 'Incident updated' : 'Incident reported'}
        initial={p.incident ? {
          ...p.incident, occurredAt: stampInput(p.incident.occurredAt), followUp: { ...(p.incident.followUp || {}), on: dayInput(p.incident.followUp?.on) }, referral: p.incident.referral || {},
        } : { student: p.student || null, occurredAt: stampInput(), type: '', severity: 'minor', notifyParents: true, referral: {}, followUp: {} }}
        sections={(v) => [
          !p.incident ? { title: 'Who and when', icon: 'student', fields: [
            { name: 'student', label: 'Student', type: 'student', required: true, wide: true, fetcher: api.findMedStudents, autoFocus: true },
          ] } : null,
          { title: 'What happened', icon: 'alertTri', fields: [
            { name: 'occurredAt', label: 'When', type: 'datetime', required: true, max: maxNow() },
            { name: 'type', label: 'Type of incident', type: 'select', required: true, options: opts(INCIDENT_TYPE).filter((o) => !(s.incidentTypes || []).length || s.incidentTypes.includes(o.value) || o.value === 'other') },
            { name: 'location', label: 'Location', type: 'chips', options: s.locations || [], wide: true },
            { name: 'severity', label: 'Severity', type: 'seg', required: true, wide: true, options: seg(INCIDENT_SEVERITY) },
            { name: 'description', label: 'Description', type: 'textarea', required: true, wide: true, placeholder: 'What happened, in a few sentences' },
            { name: 'injury', label: 'Injury', placeholder: 'e.g. Grazed knee, swelling' },
            { name: 'bodyPart', label: 'Part of the body', placeholder: 'e.g. Left knee' },
            { name: 'witnesses', label: 'Witnesses / teacher present', wide: true },
          ] },
          { title: 'Care given', icon: 'firstAid', fields: [
            { name: 'firstAid', label: 'First aid provided', type: 'textarea', rows: 2, wide: true },
            { name: 'medicineUsed', label: 'Medicine used', wide: true },
          ] },
          { title: 'Hospital referral', icon: 'ambulance', fields: referralFields('referral') },
          { title: 'Parents and follow-up', icon: 'phone', fields: [
            ...(!p.incident ? [{ name: 'notifyParents', type: 'switch', label: 'Tell the parents now', hint: 'They receive what happened and the first aid given. Serious incidents are also emailed.' }] : []),
            ...followUpFields(),
          ] },
          { title: 'Notes', icon: 'pencil', fields: [
            { name: 'remarks', label: 'Remarks', type: 'textarea', rows: 2, wide: true },
            { name: 'privateNotes', label: 'Private notes (medical staff only)', type: 'textarea', rows: 2, wide: true },
          ] },
        ].filter(Boolean)}
        onSubmit={(v) => {
          const body = { ...v, student: v.student?._id || p.incident?.student?._id, occurredAt: v.occurredAt ? new Date(v.occurredAt).toISOString() : undefined };
          return p.incident ? api.updateIncident(p.incident._id, body) : api.createIncident(body);
        }} />;
    case 'firstAid':
      return <FormDialog {...common} title="Record first aid" width={700} submitLabel="Save first aid" success="First aid recorded"
        initial={{ student: p.student || null, at: stampInput(), reason: '', supplies: [], incident: p.incident }}
        sections={(v) => [
          { title: 'Student', icon: 'student', fields: [
            { name: 'student', label: 'Student', type: 'student', required: true, wide: true, fetcher: api.findMedStudents, autoFocus: true },
            { name: 'at', label: 'When', type: 'datetime', required: true, max: maxNow() },
            { name: 'reason', label: 'Reason', type: 'chips', required: true, options: s.visitReasons || [], wide: true },
          ] },
          v.student?._id ? { title: 'Medical alerts', icon: 'alertTri', render: () => <StudentAlerts id={v.student._id} /> } : null,
          { title: 'First aid', icon: 'firstAid', fields: [
            { name: 'injury', label: 'Injury / symptoms', type: 'textarea', rows: 2, wide: true },
            { name: 'treatment', label: 'First aid provided', type: 'textarea', rows: 2, required: true, wide: true },
            { name: 'supplies', label: 'Supplies used', type: 'custom', wide: true, hint: 'Taken out of stock when you save.', render: ({ value, set }) => <SupplyLines value={value || []} onChange={set} items={meta?.supplies || []} /> },
            { name: 'givenByName', label: 'Given by', placeholder: 'Leave blank for yourself' },
            { name: 'remarks', label: 'Remarks', wide: true },
          ] },
        ].filter(Boolean)}
        onSubmit={(v) => api.recordFirstAid({ ...v, student: v.student?._id, at: new Date(v.at).toISOString(), supplies: (v.supplies || []).filter((x) => x.item && Number(x.quantity) > 0) })} />;
    case 'medicine':
    case 'supply': {
      const med = d.kind === 'medicine';
      const it = p.item;
      return <FormDialog {...common} title={it ? `Edit ${it.name}` : med ? 'Add a medicine' : 'Add a first-aid supply'} width={700} submitLabel={it ? 'Save changes' : med ? 'Add medicine' : 'Add supply'} success={it ? 'Saved' : 'Added to stock'}
        initial={it ? { ...it, barcodes: (it.barcodes || []).join(', ') } : { unit: med ? 'tablet' : 'piece', form: med ? 'Tablet' : '', minStock: med ? 10 : 5, purchaseDate: todayStr() }}
        sections={[
          { title: med ? 'Medicine' : 'Supply', icon: med ? 'pill' : 'firstAid', fields: [
            { name: 'name', label: 'Name', required: true, placeholder: med ? 'e.g. Paracetamol' : 'e.g. Crepe bandage 10 cm', autoFocus: true },
            ...(med ? [{ name: 'genericName', label: 'Generic name', placeholder: 'e.g. Acetaminophen' }] : []),
            { name: 'category', label: 'Category', type: 'select', options: (med ? s.medicineCategories : s.supplyCategories) || [] },
            ...(med ? [{ name: 'form', label: 'Form', type: 'select', options: FORMS_MED }, { name: 'strength', label: 'Strength', placeholder: 'e.g. 500 mg' }] : []),
            { name: 'unit', label: 'Counted in', type: 'select', required: true, placeholder: false, options: med ? UNITS_MED : UNITS_SUP },
            { name: 'minStock', label: 'Minimum stock', type: 'number', min: 0, hint: 'You are alerted when the usable stock falls to this.' },
            { name: 'storageLocation', label: 'Storage location', placeholder: 'e.g. Cabinet A, shelf 2' },
            { name: 'supplier', label: 'Supplier' },
            { name: 'barcodes', label: 'Barcodes', placeholder: 'Scan or type the pack barcode', hint: 'So the phone can find this item by scanning a pack. Several? Separate them with commas.' },
            ...(med ? [{ name: 'prescriptionOnly', type: 'switch', label: 'Given only against a medication plan', hint: 'Cannot be given as a one-off dose in a visit.' }] : []),
            ...(med ? [{ name: 'controlled', type: 'switch', label: 'Controlled medicine', hint: 'Every dose is witnessed by a second member of staff, and the stock is counted at least weekly.' }] : []),
            { name: 'remarks', label: 'Remarks', wide: true },
          ] },
          med ? { title: 'How often it may be given', icon: 'clock', hint: 'Checked before every dose. Blank uses the rule for the medicine (paracetamol 4 h, 4 in a day; ibuprofen 6 h, 3 in a day).', fields: [
            { name: 'minHoursBetween', label: 'At least', type: 'number', unit: 'h between doses', min: 0, step: 0.5 },
            { name: 'maxPerDay', label: 'At most', type: 'number', unit: 'in 24 hours', min: 1, step: 1 },
          ] } : null,
          !it ? { title: 'Opening stock', icon: 'package', hint: 'Optional — you can receive stock later.', fields: [
            { name: 'quantity', label: 'Quantity', type: 'number', min: 0 },
            { name: 'batchNumber', label: 'Batch number' },
            { name: 'expiryDate', label: 'Expiry date', type: 'date', min: todayStr(), validate: (val, v) => (med && Number(v.quantity) > 0 && !val ? 'A medicine batch needs its expiry date' : null) },
            { name: 'purchaseDate', label: 'Purchase date', type: 'date', max: todayStr() },
            { name: 'unitCost', label: 'Cost per unit', type: 'number', min: 0, unit: '₹' },
          ] } : null,
        ].filter(Boolean)}
        onSubmit={(v) => (it ? api.updateMedItem(it._id, v) : api.createMedItem({ ...v, kind: d.kind }))} />;
    }
    case 'stockIn': {
      const it = p.item;
      return <FormDialog {...common} title={`Receive stock — ${it.name}`} width={560} submitLabel="Receive" success="Stock received"
        initial={{ purchaseDate: todayStr(), supplier: it.supplier || '' }}
        sections={[{ fields: [
          { name: 'quantity', label: `Quantity (${it.unit})`, type: 'number', required: true, min: 0, autoFocus: true },
          { name: 'batchNumber', label: 'Batch number' },
          { name: 'expiryDate', label: 'Expiry date', type: 'date', required: it.kind === 'medicine', min: todayStr() },
          { name: 'purchaseDate', label: 'Purchase date', type: 'date', max: todayStr() },
          { name: 'supplier', label: 'Supplier' },
          { name: 'unitCost', label: 'Cost per unit', type: 'number', min: 0, unit: '₹' },
          ...((meta?.places || []).length > 1 ? [{ name: 'location', label: 'Kept at', type: 'select', placeholder: false, options: (meta.places || []).map((pl) => ({ value: pl.isMain ? '' : pl._id, label: pl.name })) }] : []),
          { name: 'note', label: 'Note', wide: true },
        ] }]}
        onSubmit={(v) => api.stockIn(it._id, { ...v, location: v.location || null })} />;
    }
    case 'stockOut': {
      const it = p.item;
      return <FormDialog {...common} title={`Take out stock — ${it.name}`} width={520} submitLabel="Take out" success="Stock updated"
        intro={<Note tone="indigo" icon="info">For a dose given to a student, record it in their visit or the administration round instead — this is for anything else (a trip kit, a return to the supplier).</Note>}
        initial={{}} sections={[{ fields: [
          { name: 'quantity', label: `Quantity (${it.unit})`, type: 'number', required: true, min: 0, autoFocus: true },
          { name: 'batch', label: 'From batch', type: 'select', placeholder: 'Earliest expiry first', options: (it.batches || []).filter((b) => b.state === 'active' || b.state === 'expiring').map((b) => ({ value: b._id, label: `${b.batchNumber || 'No batch no.'} — ${b.quantity} left` })) },
          { name: 'reason', label: 'Reason', required: true, wide: true, placeholder: 'e.g. First-aid kit for the sports day' },
        ] }]}
        onSubmit={(v) => api.stockOut(it._id, v)} />;
    }
    case 'adjust': {
      const b = p.batch;
      return <FormDialog {...common} title={`Stock count — batch ${b.batchNumber || ''}`} width={500} submitLabel="Adjust" success="Stock adjusted"
        intro={<Note tone="amber" icon="info">Recorded as {b.quantity} {p.unit}. Enter what is actually on the shelf.</Note>}
        initial={{ quantity: b.quantity }} sections={[{ fields: [
          { name: 'quantity', label: 'Counted quantity', type: 'number', required: true, min: 0, autoFocus: true },
          { name: 'reason', label: 'Reason', required: true, placeholder: 'e.g. Monthly stock count', wide: true },
        ] }]}
        onSubmit={(v) => api.adjustBatch(b._id, v)} />;
    }
    case 'writeOff': {
      const b = p.batch;
      return <FormDialog {...common} title={`Write off — batch ${b.batchNumber || ''}`} width={520} submitLabel="Write off" submitKind="danger-solid" success="Written off"
        initial={{ type: p.type || 'expired' }} sections={[{ fields: [
          { name: 'type', label: 'Why', type: 'seg', wide: true, options: [{ value: 'expired', label: 'Expired' }, { value: 'damaged', label: 'Damaged' }, { value: 'disposed', label: 'Other disposal' }] },
          { name: 'quantity', label: `Quantity (${p.unit})`, type: 'number', min: 0, hint: `Leave blank to write off all ${b.quantity}.` },
          { name: 'reason', label: 'Note', wide: true },
        ] }]}
        onSubmit={(v) => api.writeOffBatch(b._id, v)} />;
    }
    case 'plan':
      return <FormDialog {...common} title="New medication plan" width={720} submitLabel="Create plan" success={(r) => ((r?.data ?? r)?.status === 'paused' ? 'Plan created — waiting for parent authorisation' : 'Plan created')}
        initial={{ student: p.student || null, source: 'school', frequency: 'once', times: DEFAULT_TIMES.once, days: [1, 2, 3, 4, 5, 6], startDate: todayStr(), route: 'Oral', quantityPerDose: 1, supplyPerDose: 1, parentAuthorized: false }}
        sections={(v) => [
          { title: 'Student', icon: 'student', fields: [{ name: 'student', label: 'Student', type: 'student', required: true, wide: true, fetcher: api.findMedStudents, autoFocus: !p.student, disabled: !!p.student }] },
          v.student?._id ? { title: 'Medical alerts', icon: 'alertTri', render: () => <StudentAlerts id={v.student._id} /> } : null,
          { title: 'Medicine', icon: 'pill', fields: [
            { name: 'source', label: 'Supplied by', type: 'seg', wide: true, options: [{ value: 'school', label: 'School stock' }, { value: 'parent', label: "The family (child's own)" }] },
            { name: 'item', label: 'Medicine', type: 'select', required: true, show: (x) => x.source === 'school', options: (meta?.medicines || []).map((m) => ({ value: m._id, label: `${m.name}${m.strength ? ` ${m.strength}` : ''} (${m.usable} ${m.unit})` })) },
            { name: 'medicineName', label: 'Medicine name', required: true, show: (x) => x.source === 'parent', placeholder: 'As written on the pack' },
            { name: 'dosage', label: 'Dosage', required: true, placeholder: 'e.g. 1 tablet (500 mg)' },
            { name: 'quantityPerDose', label: 'Stock units per dose', type: 'number', min: 0, step: 0.5, show: (x) => x.source === 'school' },
            { name: 'supplyPerDose', label: 'Of the family’s supply per dose', type: 'number', min: 0, step: 0.5, show: (x) => x.source === 'parent', hint: 'Counts down what the family hands in; 0 for an inhaler or a bottle that is not counted.' },
            { name: 'route', label: 'Route', type: 'select', placeholder: false, options: ROUTES },
            { name: 'reason', label: 'For', placeholder: 'e.g. Asthma — preventer' },
          ] },
          { title: 'When', icon: 'clock', fields: [
            { name: 'frequency', label: 'How often', type: 'select', placeholder: false, options: opts(PLAN_FREQUENCY) },
            { name: 'times', label: 'Times of day', type: 'custom', show: (x) => x.frequency !== 'as_needed', render: ({ value, set, values }) => <TimesInput value={value || []} onChange={set} frequency={values.frequency} /> },
            { name: 'days', label: 'Days', type: 'multi', wide: true, options: DAYS },
            { name: 'startDate', label: 'From', type: 'date', required: true },
            { name: 'endDate', label: 'Until', type: 'date', hint: 'Blank for ongoing' },
            { name: 'instructions', label: 'Instructions', type: 'textarea', rows: 2, wide: true, placeholder: 'e.g. After lunch, with water' },
            { name: 'minHoursBetween', label: 'At least', type: 'number', unit: 'h between doses', min: 0, step: 0.5, hint: 'Blank: the stock item\'s rule, then the medicine\'s.' },
            { name: 'maxPerDay', label: 'At most', type: 'number', unit: 'in 24 hours', min: 1, step: 1 },
          ] },
          { title: 'Parent authorisation', icon: 'shieldCheck', hint: 'A plan without the family’s consent waits, and no dose is scheduled until it is given — the parent can also authorise it from their app.', fields: [
            { name: 'parentAuthorized', type: 'switch', label: 'The parent has authorised this medicine' },
            { name: 'authorizedBy', label: 'Authorised by', placeholder: 'e.g. Rahul Sharma (father), signed form', show: (x) => x.parentAuthorized, wide: true },
          ] },
        ].filter(Boolean)}
        onSubmit={(v) => {
          if (v.frequency !== 'as_needed' && SLOTS[v.frequency] && (v.times || []).filter(Boolean).length !== SLOTS[v.frequency]) throw new Error(`${PLAN_FREQUENCY[v.frequency]} needs ${SLOTS[v.frequency]} time(s)`);
          return withSafety((override) => api.createPlan({ ...v, student: v.student?._id, times: v.frequency === 'as_needed' ? [] : v.times, days: (v.days || []).map(Number), override }));
        }} />;
    case 'planEdit': {
      const pl = p.plan;
      return <FormDialog {...common} title={`Edit plan — ${pl.medicineName}`} width={680} submitLabel="Save changes" success="Plan updated"
        intro={<Note tone="indigo" icon="info">Doses still waiting follow the change: a new time or end date replaces today&rsquo;s remaining slots; a new dosage applies to every dose not yet given.</Note>}
        initial={{ dosage: pl.dosage, quantityPerDose: pl.quantityPerDose, supplyPerDose: pl.supplyPerDose ?? 1, instructions: pl.instructions, reason: pl.reason, frequency: pl.frequency, times: pl.times || [],
          days: pl.days || [], endDate: dayInput(pl.endDate), minHoursBetween: pl.minHoursBetween ?? '', maxPerDay: pl.maxPerDay ?? '' }}
        sections={[
          { title: 'Medicine', icon: 'pill', fields: [
            { name: 'dosage', label: 'Dosage', required: true },
            ...(pl.source === 'school' ? [{ name: 'quantityPerDose', label: 'Stock units per dose', type: 'number', min: 0, step: 0.5 }]
              : [{ name: 'supplyPerDose', label: 'Of the family’s supply per dose', type: 'number', min: 0, step: 0.5, hint: '0 when it is not counted.' }]),
            { name: 'reason', label: 'For' },
            { name: 'instructions', label: 'Instructions', type: 'textarea', rows: 2, wide: true },
          ] },
          { title: 'When', icon: 'clock', fields: [
            { name: 'frequency', label: 'How often', type: 'select', placeholder: false, options: opts(PLAN_FREQUENCY) },
            { name: 'times', label: 'Times of day', type: 'custom', show: (x) => x.frequency !== 'as_needed', render: ({ value, set, values }) => <TimesInput value={value || []} onChange={set} frequency={values.frequency} /> },
            { name: 'days', label: 'Days', type: 'multi', wide: true, options: DAYS },
            { name: 'endDate', label: 'Until', type: 'date', hint: 'Blank for ongoing' },
            { name: 'minHoursBetween', label: 'At least', type: 'number', unit: 'h between doses', min: 0, step: 0.5 },
            { name: 'maxPerDay', label: 'At most', type: 'number', unit: 'in 24 hours', min: 1, step: 1 },
          ] },
        ]}
        onSubmit={(v) => {
          if (v.frequency !== 'as_needed' && SLOTS[v.frequency] && (v.times || []).filter(Boolean).length !== SLOTS[v.frequency]) throw new Error(`${PLAN_FREQUENCY[v.frequency]} needs ${SLOTS[v.frequency]} time(s)`);
          return api.updatePlan(pl._id, { ...v, times: v.frequency === 'as_needed' ? [] : v.times, days: (v.days || []).map(Number), endDate: v.endDate || null });
        }} />;
    }
    case 'giveDose':
      return <FormDialog {...common} title={p.plan ? `Give ${p.plan.medicineName}` : 'Give a medicine'} width={620} submitLabel="Record as given" success="Dose recorded"
        initial={{ student: p.student || null, source: 'school', plan: p.plan?._id, dosage: p.plan?.dosage || '', quantity: p.plan ? (p.plan.quantityPerDose ?? 1) : 1 }}
        sections={(v) => [
          { fields: [{ name: 'student', label: 'Student', type: 'student', required: true, wide: true, fetcher: api.findMedStudents, disabled: !!p.student }] },
          v.student?._id && !p.plan ? { title: 'Medical alerts', icon: 'alertTri', render: () => <StudentAlerts id={v.student._id} /> } : null,
          v.student?._id ? { title: 'Before you give it', icon: 'shieldCheck', render: ({ values }) => (
            <DoseCheck studentId={values.student?._id} plan={p.plan?._id || ''} item={!p.plan && values.source === 'school' ? values.item : ''}
              medicineName={!p.plan && values.source === 'parent' ? values.medicineName : ''} />
          ) } : null,
          { fields: [
            ...(!p.plan ? [
              { name: 'source', label: 'Supplied by', type: 'seg', wide: true, options: [{ value: 'school', label: 'School stock' }, { value: 'parent', label: "Family's own" }] },
              { name: 'item', label: 'Medicine', type: 'select', required: true, show: (x) => x.source === 'school', options: (meta?.medicines || []).filter((m) => !m.prescriptionOnly).map((m) => ({ value: m._id, label: `${m.name}${m.strength ? ` ${m.strength}` : ''} (${m.usable} ${m.unit})`, disabled: !(m.usable > 0) })) },
              { name: 'medicineName', label: 'Medicine name', required: true, show: (x) => x.source === 'parent' },
            ] : []),
            { name: 'dosage', label: 'Dosage', required: true },
            { name: 'quantity', label: 'Units from stock', type: 'number', min: 0, step: 0.5, show: (x) => p.plan ? p.plan.source === 'school' : x.source === 'school' },
            { name: 'note', label: 'Note', wide: true },
          ] },
        ].filter(Boolean)}
        onSubmit={(v) => withSafety((override) => api.giveDose({ ...v, student: v.student?._id || p.student?._id, plan: p.plan?._id, override }))} />;
    case 'allergy': {
      const a = p.allergy;
      return <FormDialog {...common} title={a ? `Edit allergy — ${a.allergen}` : 'Add an allergy'} width={640} submitLabel={a ? 'Save changes' : 'Add allergy'} success="Allergy saved"
        initial={a ? { ...a } : { category: 'food', severity: 'moderate', shareWithTeachers: true }}
        sections={[{ fields: [
          { name: 'allergen', label: 'Allergic to', required: true, autoFocus: true, placeholder: 'e.g. Peanuts, Penicillin, Bee stings' },
          { name: 'category', label: 'Type', type: 'select', placeholder: false, options: opts(ALLERGY_CATEGORY) },
          { name: 'severity', label: 'Severity', type: 'seg', wide: true, options: seg(ALLERGY_SEVERITY) },
          { name: 'reaction', label: 'Symptoms / reaction', wide: true },
          { name: 'emergencyInstructions', label: 'Emergency instructions', type: 'textarea', rows: 2, wide: true, placeholder: 'What to do if exposed' },
          { name: 'medication', label: 'Medication', placeholder: 'e.g. Adrenaline auto-injector' },
          { name: 'doctor', label: 'Doctor' },
          { name: 'parentNote', label: 'What the family told us', wide: true },
          { name: 'shareWithTeachers', type: 'switch', label: "Show to the student's teachers", hint: 'Teachers see the allergy, its severity and what to do — never the rest of the record.' },
          ...(a ? [{ name: 'status', label: 'Status', type: 'seg', options: [{ value: 'active', label: 'Active' }, { value: 'resolved', label: 'No longer applies' }] }] : []),
        ] }]}
        onSubmit={(v) => (a ? api.updateAllergy(a._id, v) : api.addAllergy(p.studentId, v))} />;
    }
    case 'condition': {
      const c = p.condition;
      return <FormDialog {...common} title={c ? `Edit condition — ${c.condition}` : 'Add a medical condition'} width={680} submitLabel={c ? 'Save changes' : 'Add condition'} success="Condition saved"
        initial={c ? { ...c, diagnosedOn: dayInput(c.diagnosedOn) } : { type: 'asthma', severity: 'moderate', status: 'active', condition: '' }}
        sections={[{ fields: [
          { name: 'type', label: 'Type', type: 'select', placeholder: false, options: opts(CONDITION_TYPE) },
          { name: 'condition', label: 'Condition', placeholder: 'Defaults to the type, e.g. Asthma' },
          { name: 'severity', label: 'Severity', type: 'seg', wide: true, options: seg(CONDITION_SEVERITY) },
          { name: 'status', label: 'Status', type: 'seg', options: seg(CONDITION_STATUS) },
          { name: 'diagnosedOn', label: 'Diagnosed on', type: 'date', max: todayStr() },
          { name: 'chronic', type: 'switch', label: 'Chronic (long-term)' },
          { name: 'treatment', label: 'Treatment', wide: true },
          { name: 'medication', label: 'Medication' },
          { name: 'doctor', label: 'Doctor' },
          { name: 'emergencyInstructions', label: 'Emergency instructions', type: 'textarea', rows: 2, wide: true },
          { name: 'parentNote', label: 'What the family told us', wide: true },
          ...(c ? [{ name: 'shareWithTeachers', type: 'switch', label: "Show to the student's teachers", hint: 'Asthma, diabetes, epilepsy, heart, vision, hearing and severe conditions are shared by default.' }] : []),
        ] }]}
        onSubmit={(v) => (c ? api.updateCondition(c._id, v) : api.addCondition(p.studentId, v))} />;
    }
    case 'vaccination': {
      const x = p.vaccination;
      return <FormDialog {...common} title={x ? `Edit — ${x.vaccine}` : 'Add a vaccination'} width={640} submitLabel="Save" success="Vaccination saved"
        initial={x ? { ...x, given: x.givenOn ? 'given' : 'due', givenOn: dayInput(x.givenOn), dueOn: dayInput(x.dueOn), nextDueOn: dayInput(x.nextDueOn) } : { given: 'given', givenOn: todayStr() }}
        sections={[{ fields: [
          { name: 'vaccine', label: 'Vaccine', type: 'chips', required: true, wide: true, options: s.vaccines || [] },
          { name: 'dose', label: 'Dose', placeholder: 'e.g. Dose 1, Booster' },
          { name: 'given', label: 'Status', type: 'seg', options: [{ value: 'given', label: 'Given' }, { value: 'due', label: 'Due' }] },
          { name: 'givenOn', label: 'Given on', type: 'date', required: true, max: todayStr(), show: (v) => v.given === 'given' },
          { name: 'dueOn', label: 'Due on', type: 'date', required: true, show: (v) => v.given === 'due' },
          { name: 'nextDueOn', label: 'Next dose due', type: 'date', show: (v) => v.given === 'given', hint: 'The next dose is added as a pending record.' },
          { name: 'provider', label: 'Hospital / clinic' },
          { name: 'doctor', label: 'Doctor' },
          { name: 'lotNumber', label: 'Vaccine lot number' },
          { name: 'remarks', label: 'Remarks', wide: true },
        ] }]}
        onSubmit={(v) => {
          const body = { vaccine: v.vaccine, dose: v.dose, provider: v.provider, doctor: v.doctor, lotNumber: v.lotNumber, remarks: v.remarks,
            givenOn: v.given === 'given' ? v.givenOn : null, dueOn: v.given === 'due' ? v.dueOn : (x?.dueOn ? dayInput(x.dueOn) : null), nextDueOn: v.given === 'given' ? v.nextDueOn || null : null };
          return x ? api.updateVaccination(x._id, body) : api.addVaccination(p.studentId, body);
        }} />;
    }
    case 'vaccinationGiven':
      return <FormDialog {...common} title={`Record as given — ${p.vaccination.vaccine}${p.vaccination.dose ? ` (${p.vaccination.dose})` : ''}`} width={560} submitLabel="Record as given" success="Vaccination recorded"
        initial={{ givenOn: todayStr(), provider: p.vaccination.provider }} sections={[{ fields: [
          { name: 'givenOn', label: 'Given on', type: 'date', required: true, max: todayStr() },
          { name: 'provider', label: 'Hospital / clinic' },
          { name: 'doctor', label: 'Doctor' },
          { name: 'lotNumber', label: 'Lot number' },
          { name: 'nextDueOn', label: 'Next dose due', type: 'date' },
          { name: 'remarks', label: 'Remarks', wide: true },
        ] }]}
        onSubmit={(v) => api.vaccinationGiven(p.vaccination._id, v)} />;
    case 'checkup': {
      const k = p.checkup;
      const scheduled = k?.status === 'scheduled';
      return <FormDialog {...common} title={k ? (scheduled ? `Record results — ${labelOf(CHECKUP_TYPE, k.type)}` : `Edit checkup`) : 'Record a health checkup'} width={720} submitLabel="Save checkup" success="Checkup saved"
        initial={k ? { ...k, checkedOn: dayInput(k.checkedOn) || todayStr(), results: k.results || {}, followUp: { ...(k.followUp || {}), on: dayInput(k.followUp?.on) } } : { student: p.student || null, type: 'general', checkedOn: todayStr(), results: {}, outcome: 'normal', followUp: {} }}
        sections={(v) => [
          !k ? { title: 'Student', icon: 'student', fields: [{ name: 'student', label: 'Student', type: 'student', required: true, wide: true, fetcher: api.findMedStudents, disabled: !!p.student }] } : null,
          { title: 'Checkup', icon: 'clipboard', fields: [
            { name: 'type', label: 'Type', type: 'select', placeholder: false, options: opts(CHECKUP_TYPE) },
            { name: 'checkedOn', label: 'Date', type: 'date', required: true, max: todayStr() },
            { name: 'professional', label: 'Checked by', placeholder: 'e.g. Dr. Rao (school doctor)', wide: true },
          ] },
          { title: 'Results', icon: 'activity', render: ({ values, setValues }) => <ResultsFields type={values.type} value={values.results || {}} onChange={(r) => setValues((cur) => ({ ...cur, results: r }))} student={values.student?._id || values.student || k?.student} on={values.checkedOn} /> },
          { title: 'Outcome', icon: 'checkCircle', fields: [
            { name: 'outcome', label: 'Outcome', type: 'seg', wide: true, options: seg(CHECKUP_OUTCOME) },
            { name: 'findings', label: 'Findings', type: 'textarea', rows: 2, wide: true },
            { name: 'observations', label: 'Observations', type: 'textarea', rows: 2, wide: true },
            { name: 'recommendations', label: 'Recommendations', type: 'textarea', rows: 2, wide: true },
            ...followUpFields(),
          ] },
        ].filter(Boolean)}
        onSubmit={(v) => (k ? api.recordCheckup(k._id, v) : api.addCheckup(v.student?._id || p.student?._id, v))} />;
    }
    case 'checkupSchedule':
      return <FormDialog {...common} title="Schedule a health checkup" width={620} submitLabel="Schedule" success={(r) => `Scheduled for ${(r?.data ?? r)?.length || 0} students`}
        initial={{ type: 'general', scheduledOn: todayStr(), scope: 'section' }}
        sections={[{ fields: [
          { name: 'sessionName', label: 'Name', placeholder: 'e.g. Annual health check, Dental camp', wide: true },
          { name: 'type', label: 'Type', type: 'select', placeholder: false, options: opts(CHECKUP_TYPE) },
          { name: 'scheduledOn', label: 'Date', type: 'date', required: true, min: todayStr() },
          { name: 'professional', label: 'Doctor / professional', wide: true },
          { name: 'scope', label: 'For', type: 'seg', wide: true, options: [{ value: 'section', label: 'A section' }, { value: 'class', label: 'A whole class' }] },
          { name: 'classId', label: 'Class', type: 'select', required: true, options: (meta?.classes || []).map((c) => ({ value: c._id, label: c.className })) },
          { name: 'sectionId', label: 'Section', type: 'select', required: true, show: (v) => v.scope === 'section', options: (v) => ((meta?.classes || []).find((c) => c._id === v.classId)?.sections || []).map((x) => ({ value: x._id, label: x.sectionName })) },
        ] }]}
        onSubmit={(v) => api.scheduleCheckups({ ...v, sectionId: v.scope === 'section' ? v.sectionId : undefined, classId: v.classId })} />;
    case 'document':
      return <FormDialog {...common} title="Upload a medical document" width={620} submitLabel="Upload" success="Document uploaded"
        initial={{ type: p.type || 'medical_certificate', visibility: '', student: p.student || null, documentDate: todayStr() }}
        sections={[{ fields: [
          ...(!p.studentId ? [{ name: 'student', label: 'Student', type: 'student', required: true, wide: true, fetcher: api.findMedStudents }] : []),
          { name: 'file', label: 'File', type: 'custom', required: true, wide: true, render: ({ value, set }) => <FilePick value={value} onChange={set} /> },
          { name: 'type', label: 'Type', type: 'select', placeholder: false, options: opts(DOC_TYPE) },
          { name: 'title', label: 'Name', placeholder: 'Defaults to the file name' },
          { name: 'documentDate', label: 'Date of the document', type: 'date', max: todayStr() },
          { name: 'expiresOn', label: 'Valid until', type: 'date', hint: 'You are alerted before it expires.' },
          { name: 'visibility', label: 'Who can see it', type: 'seg', wide: true, options: [{ value: '', label: 'Default for the type' }, ...seg(DOC_VISIBILITY)], hint: 'Prescriptions and reports default to the medical staff only. Teachers never see medical documents.' },
          { name: 'remarks', label: 'Remarks', wide: true },
        ] }]}
        onSubmit={(v) => api.uploadMedDocument(p.studentId || v.student?._id, v.file, { type: v.type, title: v.title, documentDate: v.documentDate, expiresOn: v.expiresOn, visibility: v.visibility || undefined, remarks: v.remarks, linkKind: p.linkKind, linkId: p.linkId })} />;
    case 'documentEdit': {
      const doc = p.document;
      return <FormDialog {...common} title={`Edit — ${doc.title}`} width={600} submitLabel="Save" success="Document updated"
        initial={{ ...doc, documentDate: dayInput(doc.documentDate), expiresOn: dayInput(doc.expiresOn) }}
        sections={[{ fields: [
          { name: 'title', label: 'Name', required: true, wide: true },
          { name: 'type', label: 'Type', type: 'select', placeholder: false, options: opts(DOC_TYPE) },
          { name: 'documentDate', label: 'Date', type: 'date' },
          { name: 'expiresOn', label: 'Valid until', type: 'date' },
          { name: 'visibility', label: 'Who can see it', type: 'seg', wide: true, options: seg(DOC_VISIBILITY) },
          { name: 'remarks', label: 'Remarks', wide: true },
        ] }]}
        onSubmit={(v) => api.updateMedDocument(doc._id, v)} />;
    }
    case 'profile': {
      const r = p.record;
      const pr = r.profile || {};
      return <FormDialog {...common} title={`Medical profile — ${r.student.name}`} width={760} submitLabel="Save profile" success="Profile saved"
        initial={{ bloodGroup: r.bloodGroup || '', heightCm: pr.heightCm ?? '', weightKg: pr.weightKg ?? '', dietaryRestrictions: pr.dietaryRestrictions || '', instructions: pr.instructions || '',
          emergencyMedication: pr.emergencyMedication || { required: false }, emergencyContact: r.emergencyContact || {}, alternateContact: pr.alternateContact || {},
          doctor: pr.doctor || {}, hospital: pr.hospital || {}, privateNotes: pr.privateNotes || '', reviewed: false }}
        sections={[
          { title: 'Basics', icon: 'droplet', cols: 3, fields: [
            { name: 'bloodGroup', label: 'Blood group', type: 'select', options: BLOOD_GROUPS, hint: 'Also on the admission record and the ID card.' },
            { name: 'heightCm', label: 'Height', type: 'number', unit: 'cm', min: 40, max: 230 },
            { name: 'weightKg', label: 'Weight', type: 'number', unit: 'kg', min: 5, max: 250, step: 0.1 },
            { name: 'dietaryRestrictions', label: 'Dietary restrictions', wide: true, placeholder: 'e.g. Vegetarian; no nuts' },
            { name: 'instructions', label: 'Important medical instructions', type: 'textarea', rows: 2, wide: true, hint: 'Shown on the emergency profile and to the student’s teachers.' },
          ] },
          { title: 'Emergency medication', icon: 'syringe', fields: [
            { name: 'emergencyMedication.required', type: 'switch', label: 'Needs an emergency medication at hand', hint: 'e.g. an adrenaline auto-injector or a reliever inhaler. Shown as a critical alert.' },
            { name: 'emergencyMedication.name', label: 'Medication', required: true, show: (v) => v.emergencyMedication?.required },
            { name: 'emergencyMedication.location', label: 'Kept where', placeholder: 'e.g. In the school bag; spare in the Medical Room', show: (v) => v.emergencyMedication?.required },
            { name: 'emergencyMedication.instructions', label: 'How to give it', type: 'textarea', rows: 2, wide: true, show: (v) => v.emergencyMedication?.required },
          ] },
          { title: 'Emergency contacts', icon: 'phone', hint: 'Parents are taken from the admission record. Add who else to call.', fields: [
            { name: 'emergencyContact.name', label: 'Emergency contact', text: 'name' },
            { name: 'emergencyContact.phone', label: 'Phone', type: 'phone' },
            { name: 'emergencyContact.relation', label: 'Relation' },
            { name: 'alternateContact.name', label: 'Alternate contact', text: 'name' },
            { name: 'alternateContact.phone', label: 'Phone', type: 'phone' },
            { name: 'alternateContact.relation', label: 'Relation' },
          ] },
          { title: 'Doctor and hospital', icon: 'hospital', fields: [
            { name: 'doctor.name', label: 'Family doctor', text: 'name' },
            { name: 'doctor.phone', label: 'Doctor’s phone', type: 'phone' },
            { name: 'doctor.clinic', label: 'Clinic', wide: true },
            { name: 'hospital.name', label: 'Preferred hospital' },
            { name: 'hospital.phone', label: 'Hospital phone', type: 'phone' },
            { name: 'hospital.address', label: 'Hospital address', wide: true },
          ] },
          { title: 'Private notes', icon: 'lock', fields: [
            { name: 'privateNotes', label: 'Medical staff only', type: 'textarea', rows: 3, wide: true, hint: 'Never shown to teachers, the student or the family.' },
            { name: 'reviewed', type: 'check', checkLabel: 'Mark the profile as reviewed today', wide: true },
          ] },
        ]}
        onSubmit={(v) => api.saveMedProfile(r.student._id, { ...v, emergencyMedication: { ...v.emergencyMedication, required: !!v.emergencyMedication?.required } })} />;
    }
    case 'equipment': {
      const e = p.equipment;
      return <FormDialog {...common} title={e ? `Edit — ${e.name}` : 'Add medical equipment'} width={700} submitLabel="Save" success="Equipment saved"
        initial={e ? { ...e, purchaseDate: dayInput(e.purchaseDate), warrantyUntil: dayInput(e.warrantyUntil), lastMaintenanceOn: dayInput(e.lastMaintenanceOn), nextMaintenanceOn: dayInput(e.nextMaintenanceOn) } : { type: 'thermometer', quantity: 1, condition: 'good', status: 'available' }}
        sections={[{ fields: [
          { name: 'name', label: 'Name', required: true, autoFocus: true, placeholder: 'e.g. Digital thermometer' },
          { name: 'type', label: 'Type', type: 'select', placeholder: false, options: opts(EQUIP_TYPE) },
          { name: 'serialNumber', label: 'Serial number' },
          { name: 'quantity', label: 'Quantity', type: 'number', min: 1, step: 1 },
          { name: 'location', label: 'Location', placeholder: 'e.g. Medical room, cabinet B' },
          { name: 'vendor', label: 'Vendor' },
          { name: 'purchaseDate', label: 'Purchase date', type: 'date', max: todayStr() },
          { name: 'warrantyUntil', label: 'Warranty until', type: 'date' },
          { name: 'condition', label: 'Condition', type: 'seg', wide: true, options: seg(EQUIP_CONDITION) },
          { name: 'status', label: 'Status', type: 'select', placeholder: false, options: opts(EQUIP_STATUS) },
          { name: 'lastMaintenanceOn', label: 'Last maintenance', type: 'date', max: todayStr() },
          { name: 'nextMaintenanceOn', label: 'Next maintenance', type: 'date' },
          { name: 'remarks', label: 'Remarks', wide: true },
        ] }]}
        onSubmit={(v) => (e ? api.updateEquipment(e._id, v) : api.createEquipment(v))} />;
    }
    case 'maintenance':
      return <FormDialog {...common} title={`Maintenance — ${p.equipment.name}`} width={560} submitLabel="Record maintenance" success="Maintenance recorded"
        initial={{ date: todayStr(), condition: p.equipment.condition }} sections={[{ fields: [
          { name: 'date', label: 'Done on', type: 'date', required: true, max: todayStr() },
          { name: 'cost', label: 'Cost', type: 'number', min: 0, unit: '₹' },
          { name: 'note', label: 'What was done', type: 'textarea', required: true, rows: 2, wide: true },
          { name: 'condition', label: 'Condition now', type: 'seg', wide: true, options: seg(EQUIP_CONDITION) },
          { name: 'nextMaintenanceOn', label: 'Next maintenance', type: 'date', min: todayStr() },
        ] }]}
        onSubmit={(v) => api.maintainEquipment(p.equipment._id, v)} />;
    case 'bed': {
      const b = p.bed;
      return <FormDialog {...common} title={b ? `Edit — ${b.label}` : 'Add a bed or rest area'} width={520} submitLabel="Save" success="Saved"
        initial={b ? { ...b, location: b.location || '' } : { kind: 'bed', location: p.room || '' }} sections={[{ fields: [
          { name: 'label', label: 'Name', required: true, autoFocus: true, placeholder: 'e.g. Bed 1, Rest area A' },
          { name: 'kind', label: 'Kind', type: 'select', placeholder: false, options: opts(BED_KIND) },
          ...(b && b.status !== 'occupied' ? [{ name: 'status', label: 'Status', type: 'seg', wide: true, options: seg(BED_STATUS, ['available', 'cleaning', 'out_of_service']) }] : []),
          ...(rooms(meta).length > 1 ? [{ name: 'location', label: 'Room', type: 'select', placeholder: false, options: rooms(meta).map((r) => ({ value: r.isMain ? '' : r._id, label: r.name })) }] : []),
          { name: 'note', label: 'Note', wide: true },
          { name: 'sortOrder', label: 'Order', type: 'number', min: 0, step: 1 },
        ] }]}
        onSubmit={(v) => (b ? api.updateBed(b._id, { ...v, location: v.location || null }) : api.createBed({ ...v, location: v.location || null }))} />;
    }
    case 'followUp':
      return <FormDialog {...common} title="Record the follow-up" width={540} submitLabel="Save" success="Follow-up recorded"
        initial={{ status: 'done' }} sections={[{ fields: [
          { name: 'status', label: 'Outcome', type: 'seg', wide: true, options: [{ value: 'done', label: 'Done' }, { value: 'cancelled', label: 'Not needed any more' }] },
          { name: 'outcome', label: 'What it found', type: 'textarea', rows: 2, wide: true, required: true, show: (v) => v.status === 'done' },
          { name: 'reason', label: 'Why not', wide: true, show: (v) => v.status === 'cancelled' },
        ] }]}
        onSubmit={(v) => api.completeFollowUp(p.kind, p.id, v)} />;
    case 'rescueMed': {
      const r = p.rescueMed;
      return <FormDialog {...common} title={r ? `Edit — ${r.name}` : 'Add a rescue medicine'} width={700} submitLabel="Save" success="Rescue medicine saved"
        intro={!r ? <Note tone="indigo" icon="info">The medicine a child must have within reach — an auto-injector, a reliever inhaler, glucagon. Say every place one is kept: whoever is with the child is shown where to reach.</Note> : null}
        initial={r ? { ...r, expiresOn: dayInput(r.expiresOn), locations: r.locations || [] } : { kind: 'auto_injector', quantity: 1, locations: [{ place: 'bag', note: '' }, { place: 'medical_room', note: '' }] }}
        sections={[{ fields: [
          { name: 'kind', label: 'Kind', type: 'select', placeholder: false, options: opts(RESCUE_KIND) },
          { name: 'name', label: 'Medicine', required: true, placeholder: 'e.g. EpiPen Jr 0.15 mg', autoFocus: !r },
          { name: 'dose', label: 'Dose', placeholder: 'e.g. 1 injection into the outer thigh' },
          { name: 'quantity', label: 'How many', type: 'number', min: 0, step: 1 },
          { name: 'expiresOn', label: 'Expires on', type: 'date', hint: 'The family is told 30 days before it expires.' },
          { name: 'locations', label: 'Kept in', type: 'custom', wide: true, render: ({ value, set }) => <PlacesInput value={value || []} onChange={set} /> },
          { name: 'selfCarry', type: 'switch', label: 'The student carries it', hint: 'Shown to the staff who look after the student.' },
          { name: 'instructions', label: 'How to give it', type: 'textarea', rows: 2, wide: true },
          { name: 'notes', label: 'Notes', wide: true },
        ] }]}
        onSubmit={(v) => {
          if (!(v.locations || []).length) throw new Error('Say where it is kept');
          return r ? api.updateRescueMed(r._id, v) : api.addRescueMed(p.studentId, v);
        }} />;
    }
    case 'rescueCheck': {
      const r = p.rescueMed;
      return <FormDialog {...common} title={`Check — ${r.name}`} width={520} submitLabel="Checked" success="Recorded as checked"
        intro={<Note tone="indigo" icon="info">Look at the medicine itself: it is where the record says, the expiry date matches, and (for an auto-injector) the window is clear.</Note>}
        initial={{ expiresOn: dayInput(r.expiresOn), quantity: r.quantity }}
        sections={[{ fields: [
          { name: 'expiresOn', label: 'Expiry date on the pack', type: 'date' },
          { name: 'quantity', label: 'How many', type: 'number', min: 0, step: 1 },
        ] }]}
        onSubmit={(v) => api.checkRescueMed(r._id, v)} />;
    }
    case 'carePlan': {
      const c = p.carePlan;
      const T = p.templates?.templates || {};
      // A new plan follows its kind's template until it is edited.
      const fromTemplate = (kind, cur) => {
        const t = T[kind] || {};
        return { ...cur, kind, title: t.title || '', signs: (t.signs || []).join('\n'), steps: t.steps || [], ambulanceWhen: t.ambulanceWhen || '', afterCare: t.afterCare || '' };
      };
      return <FormDialog {...common} title={c ? `Edit care plan — ${c.title}` : 'New emergency care plan'} width={780} submitLabel={c ? 'Save changes' : 'Create plan'}
        success={c ? 'Care plan saved' : 'Care plan created — the parents are asked to confirm it'}
        intro={<Note tone="indigo" icon="info">The steps start from first-aid guidance for this kind of emergency. Edit them to the child&rsquo;s own prescription, and have the school doctor sign the plan off. Changing the steps asks the parents to confirm it again.</Note>}
        initial={c ? { ...c, signs: (c.signs || []).join('\n'), doctorSignedOn: dayInput(c.doctorSignedOn), reviewDue: dayInput(c.reviewDue), rescueMed: c.rescueMed || '' }
          : fromTemplate(p.kind || 'anaphylaxis', { status: 'active', reviewDue: addDays(todayStr(), 365), rescueMed: (p.rescueMeds || [])[0]?._id || '' })}
        sections={[
          { title: 'The plan', icon: 'heartPulse', fields: [
            { name: 'kind', label: 'For', type: 'select', placeholder: false, options: opts(CARE_PLAN_KIND), onSet: c ? undefined : (k, next) => fromTemplate(k, next) },
            { name: 'title', label: 'Title', required: true, wide: true },
            { name: 'triggers', label: 'Triggers', wide: true, placeholder: 'e.g. Peanuts and tree nuts; bee stings' },
            { name: 'rescueMed', label: 'Rescue medicine', type: 'select', placeholder: 'None', options: (p.rescueMeds || []).map((r) => ({ value: r._id, label: r.name })) },
          ] },
          { title: 'What an episode looks like', icon: 'eye', fields: [{ name: 'signs', label: 'Signs, one per line', type: 'textarea', rows: 4, wide: true }] },
          { title: 'What to do', icon: 'list', fields: [{ name: 'steps', label: '', type: 'custom', wide: true, render: ({ value, set }) => <StepsInput value={value || []} onChange={set} /> }] },
          { title: 'Ambulance, and afterwards', icon: 'ambulance', fields: [
            { name: 'ambulanceWhen', label: 'Call an ambulance when', type: 'textarea', rows: 2, wide: true },
            { name: 'afterCare', label: 'Afterwards', type: 'textarea', rows: 2, wide: true },
          ] },
          { title: 'Sign-off and review', icon: 'shieldCheck', fields: [
            { name: 'doctorName', label: 'Doctor who signed it off' },
            { name: 'doctorPhone', label: 'Doctor’s phone', type: 'phone' },
            { name: 'doctorSignedOn', label: 'Signed on', type: 'date', max: todayStr() },
            { name: 'reviewDue', label: 'Review by', type: 'date' },
            { name: 'status', label: 'Status', type: 'seg', wide: true, options: [{ value: 'active', label: 'In use' }, { value: 'draft', label: 'Draft — not shown yet' }] },
          ] },
        ]}
        onSubmit={(v) => {
          const steps = (v.steps || []).map((x) => ({ text: String(x.text || '').trim(), critical: !!x.critical })).filter((x) => x.text);
          if (!steps.length) throw new Error('Add at least one step');
          const body = { ...v, steps, signs: String(v.signs || '').split('\n').map((x) => x.trim()).filter(Boolean), rescueMed: v.rescueMed || null };
          return c ? api.updateCarePlan(c._id, body) : api.addCarePlan(p.studentId, body);
        }} />;
    }
    case 'collection': {
      const v = p.visit;
      return <FormDialog {...common} title={`Collected — ${v.student?.name || v.studentName || ''}`} width={640} submitLabel="Record collection" success="Collection recorded"
        initial={{ collection: { idChecked: true } }}
        sections={[{ fields: [{ name: 'collection', label: '', type: 'custom', wide: true, render: ({ value, set }) => <CollectorPick visitId={v._id} value={value || {}} onChange={set} /> }] }]}
        onSubmit={(x) => {
          const c = x.collection || {};
          if (!c.contact) throw new Error('Choose who collected the student');
          const badPhone = c.contact === 'other' && phoneError(c.phone, 'Their phone');
          if (badPhone) throw new Error(badPhone);
          return api.recordVisitCollection(v._id, collectionToSend(c));
        }} />;
    }
    case 'restriction': {
      const r = p.restriction;
      return <FormDialog {...common} title={r ? 'Change the restriction' : `What teachers should know${p.studentName ? ` — ${p.studentName}` : ''}`} width={640} submitLabel="Save" success="Saved — the class teachers have been told"
        intro={!r ? <Note tone="indigo" icon="info">Teachers see only what to do — never the reason. The family sees both.</Note> : null}
        initial={r ? { ...r, startsOn: dayInput(r.startsOn), endsOn: dayInput(r.endsOn) } : { kind: p.kind || 'no_pe', teacherText: RESTRICTION_KIND[p.kind || 'no_pe'].text, reason: p.reason || '', startsOn: todayStr(), endsOn: p.days ? addDays(todayStr(), p.days) : '' }}
        sections={[{ fields: [
          { name: 'kind', label: 'Kind', type: 'select', placeholder: false, wide: true, options: Object.entries(RESTRICTION_KIND).map(([value, k]) => ({ value, label: k.label })),
            onSet: (v, next) => ({ ...next, teacherText: RESTRICTION_KIND[v]?.text || next.teacherText }) },
          { name: 'teacherText', label: 'What teachers should do', required: true, wide: true, placeholder: 'e.g. No PE or games — may watch' },
          { name: 'reason', label: 'Why (staff and family only)', wide: true, placeholder: 'e.g. Sprained left ankle' },
          { name: 'startsOn', label: 'From', type: 'date', required: true },
          { name: 'endsOn', label: 'Until (last day)', type: 'date', hint: 'Leave empty for until further notice.' },
        ] }]}
        onSubmit={(v) => (r ? api.updateRestriction(r._id, { teacherText: v.teacherText, reason: v.reason, startsOn: v.startsOn, endsOn: v.endsOn || null }) : api.addRestriction(p.studentId, { ...v, endsOn: v.endsOn || null, visit: p.visitId }))} />;
    }
    case 'exclusion':
      return <FormDialog {...common} title={`Off school${p.studentName ? ` — ${p.studentName}` : ''}`} width={600} submitLabel="Save" success="Saved — the family has been told when the student can come back"
        initial={{ rule: p.rule || 'fever', from: stampInput(), until: '', needsCertificate: false }}
        sections={[{ fields: [
          { name: 'rule', label: 'Why', type: 'select', placeholder: false, wide: true, options: Object.entries(p.rules?.rules || {}).map(([value, r]) => ({ value, label: r.label })) },
          { name: 'from', label: 'Since', type: 'datetime', hint: 'When the illness started, or when the student was sent home.' },
          { name: 'until', label: 'Can come back on', type: 'date', show: (v) => v.rule === 'other', required: true },
          { name: 'needsCertificate', type: 'switch', label: 'Needs a doctor’s fitness certificate', show: (v) => v.rule === 'other' },
          { name: 'note', label: 'Note for the family', wide: true },
          { name: 'preview', type: 'custom', wide: true, render: ({ values }) => <RulePreview rules={p.rules} rule={values.rule} from={values.from} /> },
        ] }]}
        onSubmit={(v) => api.addExclusion(p.studentId, { rule: v.rule, from: v.from ? new Date(v.from).toISOString() : undefined, until: v.until, needsCertificate: v.needsCertificate, note: v.note })} />;
    case 'clearExclusion': {
      const e = p.exclusion;
      const early = e.earliestReturn && new Date(e.earliestReturn) > new Date();
      const noCert = e.needsCertificate && !e.certificateDoc;
      return <FormDialog {...common} title={`Back to school — ${p.studentName || ''}`} width={560} submitLabel="Clear to return" success="Cleared — teachers and the family have been told"
        intro={early || noCert ? <Note tone="amber" icon="alertTri">{early ? `The rule says not before ${fmtStamp(e.earliestReturn)}. ` : ''}{noCert ? 'A fitness certificate is needed and none has been uploaded. ' : ''}Clearing anyway needs a reason, and is recorded.</Note> : null}
        initial={{}}
        sections={[{ fields: [
          { name: 'override', label: 'Why clear now', required: !!(early || noCert), wide: true, show: () => !!(early || noCert), placeholder: 'e.g. Doctor confirmed it was not infectious' },
          { name: 'note', label: 'Note', wide: true },
        ] }]}
        onSubmit={(v) => api.clearExclusion(e._id, v)} />;
    }
    case 'countItem': {
      const it = p.item;
      return <FormDialog {...common} title={`Count — ${it.name}`} width={560} submitLabel="Record the count" success={(r) => ((r?.data ?? r)?.difference ? 'Recorded — it does not match, the staff have been told' : 'Recorded — it matches')}
        intro={<Note tone="indigo" icon="info">Count what is on the shelf. A difference is reported, never corrected here — adjust a batch afterwards with the reason.{it.controlled ? ' A controlled medicine: a second member of staff watches the count.' : ''}</Note>}
        initial={{ counted: '', witness: null, note: '' }}
        sections={[{ fields: [
          { name: 'counted', label: `Counted (${it.unit || 'units'})`, type: 'number', min: 0, step: 0.5, required: true },
          ...(it.controlled ? [{ name: 'witness', label: 'Witness', type: 'student', required: true, fetcher: (q) => api.searchStaffPatients(q).then((r) => (r?.data ?? r ?? []).map((x) => ({ ...x, classLabel: x.designation || 'Staff' }))) }] : []),
          { name: 'note', label: 'Note', wide: true },
        ] }]}
        onSubmit={(v) => api.countMedItem(it._id, { counted: v.counted, witness: v.witness?._id, note: v.note })} />;
    }
    case 'planSupply': {
      const pl = p.plan;
      const back = p.kind === 'returned';
      return <FormDialog {...common} title={back ? `Handed back — ${pl.medicineName}` : `Handed in — ${pl.medicineName}`} width={520} submitLabel="Record" success="Recorded"
        initial={{ quantity: '', note: '' }}
        sections={[{ fields: [
          { name: 'quantity', label: back ? 'How much went back to the family' : 'How much the family sent', type: 'number', min: 0, step: 0.5, required: true, hint: pl.supply?.left != null && back ? `${pl.supply.left} left at school` : 'Tablets, sachets, doses — as the plan counts them' },
          { name: 'note', label: 'Note', wide: true, placeholder: back ? 'e.g. Term ended — handed to the father' : 'e.g. Strip of 10, expires Mar 2027' },
        ] }]}
        onSubmit={(v) => api.recordPlanSupply(pl._id, { kind: back ? 'returned' : 'received', quantity: v.quantity, note: v.note })} />;
    }
    case 'place': {
      const pl = p.place;
      return <FormDialog {...common} title={pl ? `Edit — ${pl.name}` : 'A new place for medical stock'} width={560} submitLabel="Save" success="Saved"
        intro={!pl ? <Note tone="indigo" icon="info">A first-aid kit, the bus kit, the hostel cabinet, the lab, a second Medical Room. Move stock to it from the room; its expiry dates are watched with the rest.</Note> : null}
        initial={pl ? { ...pl } : { kind: p.kind || 'kit' }}
        sections={[{ fields: [
          { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Bus 4 kit', autoFocus: true },
          { name: 'kind', label: 'Kind', type: 'select', placeholder: false, options: Object.entries(PLACE_KIND).filter(([k]) => !pl?.isMain || k === 'room').map(([value, label]) => ({ value, label })) },
          { name: 'place', label: 'Where it is', placeholder: 'e.g. Bus 4, front seat' },
          { name: 'keeper', label: 'Looked after by', placeholder: 'e.g. Bina (attendant)' },
          { name: 'note', label: 'Note', wide: true },
        ] }]}
        onSubmit={(v) => (pl ? api.updatePlace(pl._id, v) : api.addPlace(v))} />;
    }
    case 'transfer': {
      const items = [...(meta?.medicines || []), ...(meta?.supplies || [])];
      const placeOpts = (meta?.places || []).map((pl) => ({ value: pl.isMain ? '' : pl._id, label: pl.name }));
      return <FormDialog {...common} title="Move stock" width={600} submitLabel="Move" success="Moved"
        intro={<Note tone="indigo" icon="info">The oldest stock in date moves first; the school&rsquo;s total does not change.</Note>}
        initial={{ item: p.item?._id || '', from: p.from ?? '', to: p.to ?? ((meta?.places || []).find((pl) => !pl.isMain)?._id || ''), quantity: '' }}
        sections={[{ fields: [
          { name: 'item', label: 'What', type: 'select', required: true, wide: true, options: items.map((i) => ({ value: i._id, label: `${i.name}${i.strength ? ` ${i.strength}` : ''}` })) },
          { name: 'from', label: 'From', type: 'select', placeholder: false, options: placeOpts },
          { name: 'to', label: 'To', type: 'select', placeholder: false, options: placeOpts },
          { name: 'quantity', label: 'How many', type: 'number', min: 0, required: true },
          { name: 'note', label: 'Note', wide: true, placeholder: 'e.g. Restocking the bus kit after the trip' },
        ] }]}
        onSubmit={(v) => api.transferStock({ item: v.item, from: v.from || null, to: v.to || null, quantity: v.quantity, note: v.note })} />;
    }
    case 'dispose': {
      const d = p.disposal;
      return <FormDialog {...common} title={`Disposed of — ${d.itemName}`} width={560} submitLabel="Record" success="Recorded on the register"
        intro={<Note tone="indigo" icon="info">{d.quantity} {d.unit}{d.batchNumber ? ` · batch ${d.batchNumber}` : ''} · {d.reason}. A controlled medicine is destroyed in front of a witness.</Note>}
        initial={{ method: 'pharmacy_return', reference: '', witness: null, note: '' }}
        sections={[{ fields: [
          { name: 'method', label: 'How', type: 'select', placeholder: false, wide: true, options: Object.entries(DISPOSAL_METHOD).map(([value, label]) => ({ value, label })) },
          { name: 'reference', label: 'Reference', placeholder: 'e.g. the pharmacy\'s return note' },
          { name: 'witness', label: 'Witness', type: 'student', fetcher: (q) => api.searchStaffPatients(q).then((r) => (r?.data ?? r ?? []).map((x) => ({ ...x, classLabel: x.designation || 'Staff' }))) },
          { name: 'note', label: 'Note', wide: true },
        ] }]}
        onSubmit={(v) => api.recordDisposal(d._id, { method: v.method, reference: v.reference, witness: v.witness?._id, note: v.note })} />;
    }
    case 'fridge':
      return <FormDialog {...common} title="Fridge temperature" width={540} submitLabel="Log it" success={(r) => ((r?.data ?? r)?.outOfRange ? 'Logged — out of range, the medical staff have been told' : 'Logged')}
        intro={<Note tone="indigo" icon="thermometer">Vaccines and insulin keep between 2 °C and 8 °C. Read the thermometer, and the minimum and maximum since it was last reset.</Note>}
        initial={{ fridge: 'Medicine fridge', current: '', min: '', max: '', reset: true, action: '' }}
        sections={[{ fields: [
          { name: 'current', label: 'Now (°C)', type: 'number', step: 0.1, required: true, autoFocus: true },
          { name: 'min', label: 'Lowest since reset', type: 'number', step: 0.1 },
          { name: 'max', label: 'Highest since reset', type: 'number', step: 0.1 },
          { name: 'reset', type: 'switch', label: 'Reset the min/max after reading' },
          { name: 'action', label: 'What you did (when out of range)', type: 'textarea', rows: 2, wide: true,
            show: (v) => [v.current, v.min, v.max].some((x) => x !== '' && x != null && (Number(x) < 2 || Number(x) > 8)),
            required: true },
          { name: 'fridge', label: 'Which fridge' },
        ] }]}
        onSubmit={(v) => api.logFridge({ ...v, min: v.min === '' ? undefined : v.min, max: v.max === '' ? undefined : v.max })} />;
    case 'contactParent':
      return <FormDialog {...common} title="Parent contacted" width={540} submitLabel="Save" success="Recorded"
        initial={{ notify: false }} sections={[{ fields: [
          { name: 'note', label: 'What was said', type: 'textarea', rows: 2, wide: true, placeholder: 'e.g. Spoke to the mother; she will collect him at 12:30' },
          { name: 'notify', type: 'switch', label: 'Also send an app notification asking them to call', hint: 'For when the phone was not answered.' },
        ] }]}
        onSubmit={(v) => api.contactParentAbout(p.visit._id, v)} />;
    default:
      return null;
    }
  }, [d, meta, close, done, s, p]);

  const statusEl = d?.kind === 'visitStatus'
    ? <VisitStatusDialog visit={p.visit} open onClose={close} onDone={() => done()} meta={meta} /> : null;

  const keyed = element ? React.cloneElement(element, { key: `${d.kind}:${d.seq}` }) : null;
  return { open, close, element: statusEl || keyed };
}

/* ── Smaller controls used by the forms above ─────────────────────────────── */

function TimesInput({ value = [], onChange, frequency }) {
  const want = SLOTS[frequency];
  const list = want ? Array.from({ length: want }, (_, i) => value[i] || DEFAULT_TIMES[frequency][i] || '') : (value.length ? value : ['11:00']);
  useEffect(() => { if (want && value.length !== want) onChange(list); }, [frequency]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {list.map((t, i) => (
        <input key={i} className="md-input" type="time" value={t} style={{ width: 120 }} aria-label={`Time ${i + 1}`}
          onChange={(e) => { const next = [...list]; next[i] = e.target.value; onChange(next); }} />
      ))}
      {!want ? <Btn size="sm" kind="ghost" icon="plus" onClick={() => onChange([...list, '12:00'])}>Time</Btn> : null}
    </span>
  );
}

const RESULT_FIELDS = {
  general: ['heightCm', 'weightKg', 'bpSystolic', 'bpDiastolic', 'pulse', 'visionLeft', 'visionRight', 'general'],
  vision: ['visionLeft', 'visionRight', 'colourVision'],
  dental: ['dental'],
  hearing: ['hearingLeft', 'hearingRight'],
  height: ['heightCm'],
  weight: ['weightKg'],
  bmi: ['heightCm', 'weightKg'],
  bp: ['bpSystolic', 'bpDiastolic', 'pulse'],
  physical: ['heightCm', 'weightKg', 'general'],
};
const RESULT_LABEL = {
  heightCm: ['Height', 'cm'], weightKg: ['Weight', 'kg'], bpSystolic: ['BP systolic', 'mmHg'], bpDiastolic: ['BP diastolic', 'mmHg'], pulse: ['Pulse', 'bpm'],
  visionLeft: ['Vision — left eye', ''], visionRight: ['Vision — right eye', ''], colourVision: ['Colour vision', ''], hearingLeft: ['Hearing — left ear', ''],
  hearingRight: ['Hearing — right ear', ''], dental: ['Dental findings', ''], general: ['General findings', ''],
};
const NUMERIC = ['heightCm', 'weightKg', 'bpSystolic', 'bpDiastolic', 'pulse'];

/** What a height and weight mean on the WHO charts for this student (the server works it out). */
function GrowthPreview({ student, on, heightCm, weightKg }) {
  const [res, setRes] = useState(null);
  useEffect(() => {
    if (!student || !(Number(heightCm) > 30 || Number(weightKg) > 2)) { setRes(null); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      api.assessGrowth({ student: typeof student === 'object' ? student._id : student, heightCm, weightKg, on }).then((r) => alive && setRes(r?.data ?? r)).catch(() => alive && setRes(null));
    }, 450);
    return () => { alive = false; clearTimeout(t); };
  }, [student, on, heightCm, weightKg]);
  if (!res) return null;
  const list = Object.values(res.indicators || {});
  if (!list.length) return res.note ? <p className="md-muted is-wide" style={{ margin: 0 }}>{res.note}</p> : null;
  return (
    <div className="mdg-preview is-wide">
      <span className="md-muted">WHO charts, {res.ageLabel}:</span>
      {list.map((x) => <span key={x.key} className={`md-badge md-t-${x.tone}`}>{x.label}: {x.implausible ? 'check this measurement' : `${x.centileLabel} — ${x.bandLabel}`}</span>)}
      {res.concern ? <span className="md-muted">Outside the usual range — consider "Referred" below.</span> : null}
    </div>
  );
}

export function ResultsFields({ type, value = {}, onChange, student, on }) {
  const keys = RESULT_FIELDS[type] || RESULT_FIELDS.general;
  const h = Number(value.heightCm); const w = Number(value.weightKg);
  const bmi = h > 30 && w > 2 ? Math.round((w / ((h / 100) ** 2)) * 10) / 10 : null;
  return (
    <div className="md-form__grid">
      {keys.map((k) => (
        <Field key={k} label={RESULT_LABEL[k][0]} className={['dental', 'general'].includes(k) ? 'is-wide' : ''}>
          {NUMERIC.includes(k) ? (
            <span className="md-unit"><input className="md-input md-input--unit" type="number" inputMode="decimal" step="0.1" value={value[k] ?? ''} onChange={(e) => onChange({ ...value, [k]: e.target.value })} /><span>{RESULT_LABEL[k][1]}</span></span>
          ) : ['dental', 'general'].includes(k) ? (
            <textarea className="md-textarea" rows={2} value={value[k] ?? ''} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
          ) : (
            <input className="md-input" value={value[k] ?? ''} onChange={(e) => onChange({ ...value, [k]: e.target.value })} placeholder={k.startsWith('vision') ? 'e.g. 6/6' : k === 'colourVision' ? 'Normal / deficient' : 'Normal / reduced'} />
          )}
        </Field>
      ))}
      {bmi !== null ? <Field label="BMI"><div className="md-input" style={{ display: 'flex', alignItems: 'center', background: '#f7f8fc' }}><b>{bmi}</b>&nbsp;<span className="md-muted">kg/m² — read against age, not adult bands</span></div></Field> : null}
      {student && (keys.includes('heightCm') || keys.includes('weightKg')) ? <GrowthPreview student={student} on={on} heightCm={value.heightCm} weightKg={value.weightKg} /> : null}
    </div>
  );
}

/** Who collected a student sent home: someone on record, or someone else with who allowed it. */
export function CollectorPick({ visitId, value = {}, onChange }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getVisitCollectors(visitId).then((r) => alive && setList(r?.data ?? r ?? [])).catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [visitId]);
  const set = (patch) => onChange({ ...value, ...patch });
  if (!list) return <Spin label="Loading who may collect…" />;
  return (
    <div className="md-collect">
      <div className="md-collect__list" role="radiogroup" aria-label="Who collected the student">
        {list.map((c) => (
          <button key={c.key} type="button" role="radio" aria-checked={value.contact === c.key} className={`md-collect__opt${value.contact === c.key ? ' is-on' : ''}`} onClick={() => set({ contact: c.key })}>
            <Ico name={c.kind === 'parent' ? 'users' : 'phone'} size={16} />
            <span><b>{c.name || '—'}</b><em>{[c.relation, c.phone].filter(Boolean).join(' · ')}</em></span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={value.contact === 'other'} className={`md-collect__opt is-other${value.contact === 'other' ? ' is-on' : ''}`} onClick={() => set({ contact: 'other' })}>
          <Ico name="user" size={16} />
          <span><b>Someone else</b><em>Not on the student&rsquo;s record</em></span>
        </button>
      </div>
      {value.contact === 'other' ? (
        <>
          <Note tone="amber" icon="alertTri">Only with a parent&rsquo;s permission — say who gave it. The parents are told at once.</Note>
          <div className="md-form__grid">
            <Field label="Name" required><input data-text="name" className="md-input" value={value.name || ''} onChange={(e) => set({ name: e.target.value })} maxLength={120} /></Field>
            <Field label="Relation"><input className="md-input" value={value.relation || ''} onChange={(e) => set({ relation: e.target.value })} placeholder="e.g. Neighbour, driver" maxLength={60} /></Field>
            <Field label="Phone"><PhoneInput className="md-input" value={value.phone || ''} onChange={(e) => set({ phone: e.target.value })} /></Field>
            <Field label="Who allowed it" required><input className="md-input" value={value.note || ''} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Mother, by phone at 11:40" maxLength={300} /></Field>
          </div>
        </>
      ) : null}
      <Switch checked={value.idChecked !== false} onChange={(x) => set({ idChecked: x })} label="ID checked" hint="A photo ID, or the school&rsquo;s pick-up card." />
      {value.idChecked !== false ? (
        <Field label="Which ID" optional><input className="md-input" value={value.idNote || ''} onChange={(e) => set({ idNote: e.target.value })} placeholder="e.g. Aadhaar, driving licence" maxLength={120} /></Field>
      ) : null}
    </div>
  );
}

/** Where a rescue medicine is kept: any of the places, each with an optional note. */
function PlacesInput({ value = [], onChange }) {
  const toggle = (k) => onChange(value.some((l) => l.place === k) ? value.filter((l) => l.place !== k) : [...value, { place: k, note: '' }]);
  return (
    <div className="md-places">
      <Chips multi options={Object.entries(RESCUE_PLACE).map(([v, label]) => ({ value: v, label }))} value={value.map((l) => l.place)} onPick={toggle} />
      {value.map((l, i) => (
        <div key={l.place} className="md-places__row">
          <b>{RESCUE_PLACE[l.place] || l.place}</b>
          <input className="md-input" value={l.note || ''} placeholder="Where exactly (optional)" maxLength={120}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
        </div>
      ))}
      {!value.length ? <p className="md-muted" style={{ margin: 0 }}>Choose at least one place.</p> : null}
    </div>
  );
}

/** A care plan's steps, in order; a critical step is shown first on the alert. */
function StepsInput({ value = [], onChange }) {
  const set = (i, patch) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="md-steps">
      {value.map((st, i) => (
        <div key={i} className={`md-steps__row${st.critical ? ' is-critical' : ''}`}>
          <span className="md-steps__n">{i + 1}</span>
          <textarea className="md-textarea" rows={2} value={st.text || ''} onChange={(e) => set(i, { text: e.target.value })} aria-label={`Step ${i + 1}`} maxLength={400} />
          <div className="md-steps__acts">
            <label className="md-check"><input type="checkbox" checked={!!st.critical} onChange={(e) => set(i, { critical: e.target.checked })} />Critical</label>
            <IconBtn icon="arrowUp" label={`Move step ${i + 1} up`} onClick={() => move(i, -1)} />
            <IconBtn icon="arrowDown" label={`Move step ${i + 1} down`} onClick={() => move(i, 1)} />
            <IconBtn icon="trash" label={`Remove step ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        </div>
      ))}
      <Btn size="sm" kind="tint" icon="plus" onClick={() => onChange([...value, { text: '', critical: false }])}>Add a step</Btn>
    </div>
  );
}

function FilePick({ value, onChange }) {
  const ref = useRef(null);
  return (
    <div className="md-picker__box" style={{ minHeight: 52 }}>
      <Ico name="upload" size={18} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {value ? <span className="md-two"><b>{value.name}</b><em>{fileSize(value.size)}</em></span> : <span className="md-muted">PDF, photo (JPG, PNG, WebP) or Word document, up to 10 MB</span>}
      </span>
      <input ref={ref} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(e) => onChange(e.target.files?.[0] || null)} />
      <Btn size="sm" onClick={() => ref.current?.click()}>{value ? 'Change' : 'Choose file'}</Btn>
    </div>
  );
}

export { clean, useLoad };
