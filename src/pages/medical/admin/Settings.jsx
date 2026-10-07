/**
 * Medical Room settings (Oct 2026): the room itself, the lists the forms
 * offer, who sees what, when alerts fire and who is told. Every save is in
 * the audit trail.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Field, Switch, Segmented, Note, Spin, LoadError, Ico, LineTabs, useLoad } from '../mdUI';
import { INCIDENT_TYPE, errorText } from '../mdMeta';
import PhoneInput from '../../../components/ui/PhoneInput';
import { phoneError } from '../../../utils/validators';
import { refreshMeta, forgetExclusionRules } from './mdForms';
import { askStepUp } from '../stepUp';
import { ImportPanel, RolloverPanel } from './ImportRollover';
import { StudentPicker } from '../mdForm';
import { useAuth } from '../../../contexts/AuthContext';

const LIST_EDIT = [
  ['visitReasons', 'Reasons for a visit', 'Offered as quick picks on the visit and first-aid forms.'],
  ['locations', 'Locations', 'Where incidents happen and where students are sent from.'],
  ['medicineCategories', 'Medicine categories', ''],
  ['supplyCategories', 'First-aid supply categories', ''],
  ['vaccines', 'Vaccines', 'Quick picks on the vaccination form.'],
];

const NOTIFY = [
  ['Parents', [
    ['parentVisit', 'Child visited the Medical Room', 'A summary when the visit ends — or at once for an emergency.'],
    ['parentIncident', 'Medical incident', 'When the medical room tells them about an incident.'],
    ['parentFirstAid', 'First aid given', ''],
    ['parentMedicine', 'Medicines: given or refused, a plan to authorise, a plan changed or stopped', ''],
    ['parentSentHome', 'Child sent home', 'Also emailed when urgent email is on.'],
    ['parentReferral', 'Hospital referral', 'Also emailed when urgent email is on.'],
    ['parentCheckup', 'Health checkup completed', ''],
    ['parentVaccinationDue', 'Vaccination due or overdue', 'Once when due soon, once if it becomes overdue.'],
    ['parentFollowUp', 'Follow-up required', ''],
    ['parentCampaign', 'Health campaign result', 'Given, refused or absent — with the mop-up day when there is one.'],
  ]],
  ['Students', [
    ['studentReminders', 'Their own reminders', 'When to come to the Medical Room for a medicine (never which medicine), and a limit on what they may do, in the words the teachers see. Only when students may open their Medical Room page.'],
  ]],
  ['Teachers', [
    ['teacherStatus', 'Their request: accepted, back to class, sent home', 'To the teacher who sent the student, and the class teacher.'],
    ['teacherClassAlert', 'A student of theirs is in the Medical Room', 'To the class and vice class teacher.'],
    ['teacherNeedToKnow', 'Emergency cards', 'A student’s emergency card changed (to the class teachers), and each morning, the children with one in a class they cover, an exam room, a bus, the hostel or the mess. Never the details — they open the card.'],
  ]],
  ['Medical staff', [
    ['staffRequests', 'A teacher sent a student, or a student checked in at the kiosk', ''],
    ['staffMedicineRound', 'Medicine round', 'Doses due now, and doses not recorded in time.'],
    ['staffRecheck', 'A recheck is due', 'A child in the room is due their next set of readings.'],
    ['staffEmergency', 'Emergency case or serious incident', ''],
    ['staffLowStock', 'Low or out of stock', ''],
    ['staffExpiry', 'Medicine expiring, expired; document expiring', ''],
    ['staffFollowUp', 'Follow-ups due (daily summary)', ''],
    ['staffVaccinationDue', 'Vaccinations due (daily summary)', ''],
    ['staffParentUpdates', 'A parent sent an update, authorised a medicine or confirmed a care plan', ''],
    ['staffMaintenance', 'Equipment due for service', ''],
  ]],
  ['Email', [
    ['emailUrgent', 'Email parents urgent news', 'Emergencies, being sent home and hospital referrals also go by email (the school’s mail settings). Every message is also a live notification in the app, on the web and the phone.'],
  ]],
];

function ListEditor({ value = [], onChange }) {
  const [text, setText] = useState('');
  const add = () => { const t = text.trim(); if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]); setText(''); };
  return (
    <>
      <div className="mdset-list">
        {value.map((v) => <span key={v} className="mdset-tag">{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}><Ico name="close" size={12} /></button></span>)}
      </div>
      <div className="mdset-add">
        <input className="md-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Add one" maxLength={80} />
        <Btn icon="plus" onClick={add} disabled={!text.trim()}>Add</Btn>
      </div>
    </>
  );
}

/** The return-to-school rules: the school's changes over the defaults. */
function ReturnRules({ value, onChange }) {
  const [defaults, setDefaults] = useState(null);
  useEffect(() => { api.getExclusionRules().then((r) => setDefaults((r?.data ?? r)?.defaults || {})).catch(() => setDefaults({})); }, []);
  if (!defaults) return <Spin />;
  const put = (k, patchIn) => {
    const cur = { ...(value[k] || {}), ...patchIn };
    for (const x of Object.keys(cur)) if (cur[x] === '' || cur[x] === undefined) delete cur[x];
    const next = { ...value, [k]: cur };
    if (!Object.keys(cur).length) delete next[k];
    onChange(next);
  };
  return (
    <Panel title="Return to school" icon="calendarCheck" tone="teal"
      sub="How long a student stays off school after each illness, and whether a doctor's certificate is needed. Leave a box empty for the usual period shown in grey.">
      <div className="mdset-rules" role="table" aria-label="Return-to-school rules">
        <div className="mdset-rules__row is-head" role="row"><span role="columnheader">Illness</span><span role="columnheader">Off for</span><span role="columnheader">Certificate</span><span role="columnheader">In use</span></div>
        {Object.entries(defaults).map(([k, d]) => {
          const o = value[k] || {};
          const unit = d.days ? 'days' : 'hours';
          return (
            <div key={k} className={`mdset-rules__row${o.off ? ' is-off' : ''}`} role="row">
              <span role="cell"><b>{d.label}</b><em>{d.text}</em></span>
              <span role="cell">
                {k === 'other' ? <em>Date set each time</em> : (
                  <label className="mdset-rules__num"><input className="md-input" type="number" min={0} max={unit === 'days' ? 30 : 336} placeholder={String(d[unit] ?? 0)} value={o[unit] ?? ''}
                    onChange={(e) => put(k, { [unit]: e.target.value === '' ? '' : Number(e.target.value) })} aria-label={`${d.label}: ${unit}`} />{unit}</label>
                )}
              </span>
              <span role="cell">{k === 'other' ? <em>Chosen each time</em> : <input type="checkbox" checked={o.needsCertificate ?? d.needsCertificate} onChange={(e) => put(k, { needsCertificate: e.target.checked === d.needsCertificate ? '' : e.target.checked })} aria-label={`${d.label}: certificate needed`} />}</span>
              <span role="cell">{k === 'other' ? <em>Always</em> : <input type="checkbox" checked={!o.off} onChange={(e) => put(k, { off: e.target.checked ? '' : true })} aria-label={`${d.label}: in use`} />}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// Ages are kept in months; the screen shows years.
const yearsOf = (m) => (m === '' || m === null || m === undefined ? '' : Math.round((Number(m) / 12) * 10) / 10);
const monthsOf = (y) => (y === '' ? '' : Math.round(Number(y) * 12));

/** Health programmes: the vaccination schedule and the outbreak watch. */
function Programmes({ s, set }) {
  const sch = s.vaccineSchedule || {};
  const templates = s.scheduleTemplates || [];
  const programme = sch.programme || '';
  const own = (sch.entries || []).length > 0;
  const shown = own ? sch.entries : (templates.find((t) => t.key === programme)?.entries || []);
  const put = (patch) => set('vaccineSchedule')({ programme, remind: !!sch.remind, entries: sch.entries || [], ...patch });
  const choose = (v) => (v === 'custom'
    ? put({ programme: 'custom', entries: shown.map(({ label, window, ...e }) => e) })
    : put({ programme: v, entries: [], remind: v ? !!sch.remind : false }));
  const setEntry = (i, patch) => put({ entries: sch.entries.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const add = () => put({ programme: 'custom', entries: [...(own ? sch.entries : shown.map(({ label, window, ...e }) => e)), { key: `dose_${Date.now().toString(36)}`, vaccine: (s.vaccines || [])[0] || '', dose: '', from: 60, to: 84 }] });
  const rules = s.outbreakRules || {};
  const defaults = s.outbreakDefaults || {};
  const putRule = (k, patchIn) => {
    const cur = { ...(rules[k] || {}), ...patchIn };
    for (const x of Object.keys(cur)) if (cur[x] === '' || cur[x] === undefined) delete cur[x];
    const next = { ...rules, [k]: cur };
    if (!Object.keys(cur).length) delete next[k];
    set('outbreakRules')(next);
  };
  return (
    <>
      <Panel title="Vaccination schedule" icon="syringe" tone="green" sub="The doses each child should have had by their age — worked out from the date of birth and the vaccination records, never typed in.">
        <Field label="Schedule">
          <Segmented value={own ? 'custom' : programme} onChange={choose} label="Schedule"
            options={[{ value: '', label: 'None' }, { value: 'uip', label: 'Government (UIP)' }, { value: 'iap', label: 'IAP' }, { value: 'custom', label: 'The school’s own' }]} />
        </Field>
        {programme || own ? (
          <>
            <Note tone="amber" icon="info">The templates hold the school-age doses of the published schedules — have the school doctor check them before reminders go out.</Note>
            <div className="mdc-readings">
              <table>
                <thead><tr><th>Vaccine</th><th>Dose</th><th>Due from (years)</th><th>Overdue after (years)</th><th>For</th>{own ? <th aria-label="Remove" /> : null}</tr></thead>
                <tbody>
                  {shown.map((e, i) => (
                    <tr key={e.key}>
                      {own ? (
                        <>
                          <td><select className="md-input" value={e.vaccine} onChange={(x) => setEntry(i, { vaccine: x.target.value })} aria-label="Vaccine">{[...new Set([...(s.vaccines || []), e.vaccine].filter(Boolean))].map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
                          <td><input data-text="title" className="md-input" value={e.dose || ''} onChange={(x) => setEntry(i, { dose: x.target.value })} aria-label="Dose" maxLength={40} /></td>
                          {e.after || e.everyMonths ? <td colSpan={2}><em>{e.after ? `${e.afterMonths} months after ${e.after.replace(/_/g, ' ')}` : `every ${e.everyMonths} months, ${yearsOf(e.from)}–${yearsOf(e.to)} years`}</em></td> : (
                            <>
                              <td><input className="md-input" type="number" min={0} max={19} step={0.5} value={yearsOf(e.from)} onChange={(x) => setEntry(i, { from: monthsOf(x.target.value) })} aria-label="Due from (years)" style={{ maxWidth: 90 }} /></td>
                              <td><input className="md-input" type="number" min={0} max={20} step={0.5} value={yearsOf(e.to)} onChange={(x) => setEntry(i, { to: monthsOf(x.target.value) })} aria-label="Overdue after (years)" style={{ maxWidth: 90 }} /></td>
                            </>
                          )}
                          <td><select className="md-input" value={e.sex || ''} onChange={(x) => setEntry(i, { sex: x.target.value })} aria-label="For"><option value="">Everyone</option><option value="female">Girls</option><option value="male">Boys</option></select></td>
                          <td><Btn size="sm" kind="ghost" icon="trash" aria-label="Remove this dose" onClick={() => put({ entries: sch.entries.filter((_, k) => k !== i) })} /></td>
                        </>
                      ) : (
                        <><td><b>{e.vaccine}</b></td><td>{e.dose}</td><td colSpan={2}>{e.window}</td><td>{e.sex === 'female' ? 'Girls' : e.sex === 'male' ? 'Boys' : 'Everyone'}</td></>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mdp-tabhead" style={{ marginTop: 8 }}>
              <Btn size="sm" kind="tint" icon="plus" onClick={add}>Add a dose</Btn>
              {!own ? <Btn size="sm" kind="ghost" icon="pencil" onClick={() => choose('custom')}>Change these doses</Btn> : null}
            </div>
            <Switch checked={!!sch.remind} onChange={(v) => put({ remind: v })} label="Remind families when a dose falls due"
              hint="Once per dose, from the Medical Room. Families always see the schedule on their page; overdue doses are chased from Schedule & Coverage." />
          </>
        ) : <p className="md-muted">No schedule: the Vaccinations page lists the records and the doses entered by hand only.</p>}
      </Panel>
      <Panel title="Outbreak watch" icon="alertTri" tone="red" sub="Several children with the same illness in one section, class or the school within a few days opens an outbreak for the medical staff. Leave a box empty for the usual number shown in grey.">
        <Switch checked={s.outbreakWatch !== false} onChange={set('outbreakWatch')} label="Look for clusters of illness"
          hint="Every quarter hour, from Medical Room visits, children kept off school and families' reports of illness. Only the medical staff are told." />
        <div className="mdset-rules" role="table" aria-label="Outbreak rules">
          <div className="mdset-rules__row is-head" role="row"><span role="columnheader">Illness</span><span role="columnheader">Children</span><span role="columnheader">Within (days)</span><span role="columnheader">Watched</span></div>
          {Object.entries(defaults).map(([k, d]) => {
            const o = rules[k] || {};
            return (
              <div key={k} className={`mdset-rules__row${o.off ? ' is-off' : ''}`} role="row">
                <span role="cell"><b>{d.label}</b><em>In one {d.scope === 'school' ? 'school' : d.scope}</em></span>
                <span role="cell"><input className="md-input" type="number" min={2} max={50} placeholder={String(d.cases)} value={o.cases ?? ''} onChange={(e) => putRule(k, { cases: e.target.value === '' ? '' : Number(e.target.value) })} aria-label={`${d.label}: children`} style={{ maxWidth: 80 }} /></span>
                <span role="cell"><input className="md-input" type="number" min={1} max={30} placeholder={String(d.days)} value={o.days ?? ''} onChange={(e) => putRule(k, { days: e.target.value === '' ? '' : Number(e.target.value) })} aria-label={`${d.label}: days`} style={{ maxWidth: 80 }} /></span>
                <span role="cell"><input type="checkbox" checked={!o.off} onChange={(e) => putRule(k, { off: e.target.checked ? '' : true })} aria-label={`${d.label}: watched`} /></span>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

const findStaff = (q) => api.searchStaffPatients(q).then((r) => (r?.data ?? r ?? []).map((x) => ({ ...x, classLabel: x.designation || (x.role === 'school_admin' ? 'School admin' : 'Teacher') })));

/** Who checks the medical staff — the school admin's settings. */
function PrivacyChecks({ s, set, isAdmin }) {
  const [names, setNames] = useState(s.leadNames || {});
  const [adding, setAdding] = useState(null);
  const leads = s.safeguardingLeads || [];
  const turnOn = async (on) => {
    if (!on) { set('requireStepUp')(false); return; }
    // Prove the school's email reaches the admin before everyone needs it.
    if (await askStepUp(true)) set('requireStepUp')(true);
    else toast.error('Not turned on — the code was not confirmed');
  };
  return (
    <>
      {!isAdmin ? <Note tone="amber" icon="lock">Only a school admin changes these settings.</Note> : null}
      <Panel title="Safeguarding leads" icon="shieldCheck" tone="red" sub="The people who read safeguarding concerns. None named: the school admins.">
        <div className="mdset-list">
          {leads.map((id) => <span key={id} className="mdset-tag">{names[id] || 'Named lead'}{isAdmin ? <button type="button" aria-label="Remove" onClick={() => set('safeguardingLeads')(leads.filter((x) => x !== id))}><Ico name="close" size={12} /></button> : null}</span>)}
          {!leads.length ? <span className="md-muted">None named — the school admins read the log.</span> : null}
        </div>
        {isAdmin ? (
          <div className="mdset-add" style={{ maxWidth: 520 }}>
            <StudentPicker value={adding} onChange={(p) => { if (p?._id && !leads.includes(p._id)) { set('safeguardingLeads')([...leads, p._id]); setNames((n) => ({ ...n, [p._id]: p.name })); } setAdding(null); }} fetcher={findStaff} placeholder="Add a member of staff" />
          </div>
        ) : null}
      </Panel>
      <Panel title="Checks on the medical staff" icon="lock" tone="indigo">
        <Switch checked={!!s.requireStepUp} disabled={!isAdmin} onChange={turnOn} label="Confirm with an emailed code" hint="The medical staff enter a code emailed to them once every 12 hours before the Medical Room's records open. A code is emailed to you first, to make sure the school's email works." />
        <div className="md-form__grid">
          <Field label="Unusual access: students' records in an hour" hint="Someone who opens more than this in an hour is reported to the school admins at once.">
            <input className="md-input" type="number" min={10} max={200} disabled={!isAdmin} value={s.accessAlertThreshold} onChange={(e) => set('accessAlertThreshold')(e.target.value === '' ? '' : Number(e.target.value))} style={{ maxWidth: 160 }} />
          </Field>
          <Field label="Keep a former student's record for (years)" hint="After this a school admin may purge it — never automatically, never under a legal hold.">
            <input className="md-input" type="number" min={1} max={30} disabled={!isAdmin} value={s.retentionYears} onChange={(e) => set('retentionYears')(e.target.value === '' ? '' : Number(e.target.value))} style={{ maxWidth: 160 }} />
          </Field>
        </div>
      </Panel>
    </>
  );
}

export default function MedicalSettings() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(() => api.getMedSettings(), 'settings');
  const [s, setS] = useState(null);
  const [tab, setTab] = useState('room');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setS(data); }, [data]);
  if (loading && !s) return <Page><Spin /></Page>;
  if (error && !s) return <Page><LoadError error={error} onRetry={reload} /></Page>;
  if (!s) return null;
  const set = (k) => (v) => setS((x) => ({ ...x, [k]: v }));
  const setN = (k) => (v) => setS((x) => ({ ...x, notify: { ...x.notify, [k]: v } }));
  const dirty = JSON.stringify(s) !== JSON.stringify(data);
  const save = async () => {
    const badPhone = phoneError(s.roomPhone, "The room's phone");
    if (badPhone) { toast.error(badPhone); return; }
    setBusy(true);
    try {
      const res = await api.saveMedSettings(s);
      setS(res?.data ?? res); toast.success('Settings saved'); reload(); refreshMeta(); forgetExclusionRules();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const num = (k, label, hint, min, max) => (
    <Field label={label} hint={hint}><input className="md-input" type="number" min={min} max={max} value={s[k]} onChange={(e) => set(k)(e.target.value === '' ? '' : Number(e.target.value))} style={{ maxWidth: 160 }} /></Field>
  );
  return (
    <Page>
      <PageHead icon="settings" tone="slate" title="Medical Room Settings" subtitle="The room, the lists its forms offer, what teachers, students and parents may see, when alerts fire and who is told.">
        {dirty ? <Btn onClick={() => setS(data)}>Discard changes</Btn> : null}
        <Btn kind="primary" icon="save" busy={busy} disabled={!dirty} onClick={save}>Save settings</Btn>
      </PageHead>
      <LineTabs items={[{ key: 'room', label: 'The room' }, { key: 'lists', label: 'Categories & lists' }, { key: 'access', label: 'Who sees what' }, { key: 'alerts', label: 'Alerts' }, { key: 'return', label: 'Return to school' }, { key: 'privacy', label: 'Privacy & checks' }, { key: 'programmes', label: 'Programmes' }, { key: 'notify', label: 'Notifications' }, { key: 'import', label: 'Import' }, { key: 'year', label: 'New year' }]} value={tab} onChange={setTab} />
      {tab === 'import' ? <ImportPanel /> : null}
      {tab === 'year' ? <RolloverPanel /> : null}
      {tab === 'programmes' ? <Programmes s={s} set={set} /> : null}
      {tab === 'privacy' ? <PrivacyChecks s={s} set={set} isAdmin={user?.role === 'school_admin'} /> : null}
      {tab === 'return' ? (
        <>
          <Panel title="Attendance" icon="calendarCheck" tone="indigo" sub="A child sent home from the Medical Room — or taken to hospital — after being marked present on today's register.">
            <Segmented value={s.attendanceOnSentHome || 'off'} onChange={set('attendanceOnSentHome')} label="When a child is sent home"
              options={[{ value: 'off', label: 'Leave the register as marked' }, { value: 'half_day', label: 'Mark Half-Day' }]} />
            <p className="md-muted" style={{ margin: '8px 0 0' }}>Half-Day is written with the reason as the remark, and put back if the visit is corrected the same day. Only day registers are changed — a school that takes attendance per subject keeps its registers as the teachers mark them.</p>
          </Panel>
          <ReturnRules value={s.exclusionRules || {}} onChange={set('exclusionRules')} />
        </>
      ) : null}
      {tab === 'room' ? (
        <Panel title="The room" icon="hospital" tone="rose">
          <div className="md-form__grid">
            <Field label="Name" required><input data-text="title" className="md-input" value={s.roomName} onChange={(e) => set('roomName')(e.target.value)} maxLength={160} /></Field>
            <Field label="Where it is"><input className="md-input" value={s.roomLocation} onChange={(e) => set('roomLocation')(e.target.value)} placeholder="e.g. Ground floor, near the main office" /></Field>
            <Field label="Phone" hint="Shown on emergency cards and to families."><PhoneInput className="md-input" value={s.roomPhone} onChange={(e) => set('roomPhone')(e.target.value)} /></Field>
            <Field label="Opening hours"><input className="md-input" value={s.roomHours} onChange={(e) => set('roomHours')(e.target.value)} placeholder="e.g. 7:45 AM – 3:30 PM" /></Field>
            <Field label="Temperature in"><Segmented value={s.temperatureUnit} onChange={set('temperatureUnit')} options={[{ value: 'F', label: '°F (Fahrenheit)' }, { value: 'C', label: '°C (Celsius)' }]} label="Temperature unit" /></Field>
          </div>
          <Switch checked={s.hasBeds} onChange={set('hasBeds')} label="The room has beds or rest areas" hint="Shows the beds on Medical Room Management and lets a student be put on one." />
        </Panel>
      ) : null}
      {tab === 'lists' ? (
        <>
          {LIST_EDIT.map(([k, label, hint]) => (
            <Panel key={k} title={label} sub={hint} icon="listDots" tone="indigo"><ListEditor value={s[k]} onChange={set(k)} /></Panel>
          ))}
          <Panel title="Incident types in use" sub="Untick a type your school does not use; “Other” is always available." icon="alertTri" tone="orange">
            <div className="md-chips">
              {Object.entries(INCIDENT_TYPE).filter(([k]) => k !== 'other').map(([k, label]) => {
                const on = !s.incidentTypes?.length || s.incidentTypes.includes(k);
                return (
                  <button key={k} type="button" className={on ? 'is-on' : ''} aria-pressed={on} onClick={() => {
                    const cur = s.incidentTypes?.length ? s.incidentTypes : Object.keys(INCIDENT_TYPE).filter((x) => x !== 'other');
                    set('incidentTypes')(on ? cur.filter((x) => x !== k) : [...cur, k]);
                  }}>{label}</button>
                );
              })}
            </div>
          </Panel>
        </>
      ) : null}
      {tab === 'access' ? (
        <Panel title="Who sees what" icon="shieldCheck" tone="indigo">
          <Note tone="indigo" icon="lock">The school admin and staff whose designation gives them Medical Room administration (a nurse) see everything. Teachers never see medical history, private notes, prescriptions or documents.</Note>
          <Switch checked={s.teacherAlerts} onChange={set('teacherAlerts')} label="Teachers see the medical alerts of their students" hint="Allergies and conditions the room shares with teachers, with what to do — for the sections they teach only." />
          <Switch checked={s.teacherEmergencyInfo} onChange={set('teacherEmergencyInfo')} label="Teachers can open the emergency profile of their students" hint="Blood group, critical allergies and conditions, emergency medication and contacts. Every opening is recorded." />
          <Switch checked={s.breakGlass !== false} onChange={set('breakGlass')} label="Emergency access for every member of staff" hint="In an emergency anyone on the staff can open any child's emergency card by saying what is happening. Every use is recorded and the medical staff are told at once." />
          <Switch checked={!!s.consentRequired} onChange={set('consentRequired')} label="Everyday medicines need this year's parental consent" hint="On: a medicine from the school's stock that the parents have not agreed to this year is stopped unless a reason is given. Off: it is a warning on the give screen." />
          <Switch checked={s.studentAccess} onChange={set('studentAccess')} label="Students can see their own medical information" />
          {s.studentAccess ? (
            <>
              <Switch checked={s.studentVisits} onChange={set('studentVisits')} label="…their Medical Room visits and incidents" />
              <Switch checked={s.studentCheckups} onChange={set('studentCheckups')} label="…their health checkups" />
              <Switch checked={s.studentVaccinations} onChange={set('studentVaccinations')} label="…their vaccinations" />
              <Switch checked={s.studentDocuments} onChange={set('studentDocuments')} label="…their documents shared with the family" />
            </>
          ) : null}
          <Switch checked={s.parentUpdates} onChange={set('parentUpdates')} label="Parents can send medical updates" hint="Allergies, conditions, contacts, doctor, hospital, vaccinations and documents." />
          {s.parentUpdates ? <Switch checked={s.parentUpdatesNeedApproval} onChange={set('parentUpdatesNeedApproval')} label="A parent's update waits for the medical room's approval" hint="Recommended. When off, updates go straight onto the record (still marked as from a parent)." /> : null}
        </Panel>
      ) : null}
      {tab === 'alerts' ? (
        <Panel title="When alerts fire" icon="bell" tone="amber">
          <div className="md-form__grid">
            {num('expiryAlertDays', 'Expiry warning (days)', 'Batches expiring within this many days are flagged.', 1, 365)}
            {num('vaccinationDueDays', 'Vaccination “due soon” (days)', 'Families are reminded this many days ahead.', 1, 180)}
            {num('maintenanceDueDays', 'Equipment service warning (days)', '', 1, 180)}
            {num('documentExpiryDays', 'Document expiry warning (days)', 'For certificates with a “valid until” date.', 1, 180)}
            {num('missedDoseAfterMinutes', 'A dose counts as missed after (minutes)', 'A scheduled dose not recorded this long after its time is marked missed.', 15, 720)}
            {num('urgentEscalateMinutes', 'Nobody answered urgent news after (minutes)', 'An emergency, a child sent home or a referral nobody has answered in this long moves to the next contact, and the staff are told whom to call.', 3, 60)}
          </div>
        </Panel>
      ) : null}
      {tab === 'notify' ? (
        <Panel title="Language of messages to families" icon="chat" tone="indigo" sub="The Medical Room's messages to parents — visits, medicines, vaccinations, referrals, campaigns and urgent news. A parent can choose their own on their Medical Room page.">
          <Segmented value={s.noticeLanguage || 'en'} onChange={set('noticeLanguage')} label="Language of messages to families"
            options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी (Hindi)' }, { value: 'both', label: 'Both' }]} />
          <p className="md-muted" style={{ margin: '8px 0 0' }}>What staff type themselves (a reason, a treatment, a notice) is sent as typed — an outbreak notice can also be written in Hindi.</p>
        </Panel>
      ) : null}
      {tab === 'notify' ? NOTIFY.map(([group, items]) => (
        <Panel key={group} title={group} icon="bell" tone="blue">
          {items.map(([k, label, hint]) => <Switch key={k} checked={s.notify?.[k] !== false} onChange={setN(k)} label={label}
            hint={hint} />)}
        </Panel>
      )) : null}
    </Page>
  );
}
