/**
 * Medical Room — a teacher's page (Oct 2026).
 *
 *   Send to the Medical Room   a two-minute form; the room is told at once
 *   My requests                where each student is: accepted, arrived, under
 *                              treatment, back to class, sent home — and the
 *                              room's one-line note. Refreshes while any is open.
 *   Medical alerts             the students of the teacher's own sections with
 *                              the alerts the room shares with teachers, and
 *                              their emergency profile when the school allows
 *   Report an incident         and the incidents this teacher has reported
 *
 * Nothing else of a student's medical record is reachable from here.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui';
import * as api from '../../../api/medical.api';
import {
  Page, PageHead, Panel, Btn, Badge, Status, Tiles, Tile, Field, Chips, Segmented, Note, Empty, Spin, LoadError, Person, AlertChips,
  LineTabs, Switch, Steps, ConfirmDialog, Ico, Dialog, useLoad,
} from '../mdUI';
import { StudentPicker } from '../mdForm';
import { EmergencyCard } from '../mdShared';
import { useMedLive, medicalNotice } from '../useMedLive';
import { StaffRecordView, StaffRecordDialog } from '../staffHealthParts';
import Safeguarding from '../Safeguarding';
import {
  REQUEST_STATUS, URGENCY, INCIDENT_TYPE, INCIDENT_SEVERITY, ago, fmtStamp, fmtDay, stampInput, labelOf, studentLine, errorText, telOf,
} from '../mdMeta';

/** The teacher's own health record and their visits to the Medical Room. */
function MyHealth() {
  const mine = useLoad(() => api.getMyHealth(), 'mine');
  const [edit, setEdit] = useState(false);
  const d = mine.data;
  if (mine.error && !d) return <LoadError error={mine.error} onRetry={mine.reload} />;
  if (!d) return <Spin />;
  return (
    <>
      <Panel title="My health record" sub="Seen only by the Medical Room's staff and you" icon="heartPulse" tone="rose" pad
        right={<Btn size="sm" kind="primary" icon="pencil" onClick={() => setEdit(true)}>Update</Btn>}>
        <StaffRecordView health={d.health} emptyHint="Tell the Medical Room about any allergy or condition, and who to call — it helps them help you." />
      </Panel>
      <Panel title="My visits to the Medical Room" icon="stethoscope" tone="blue" pad>
        {(d.visits || []).length ? (
          <ul className="mdd-list">
            {d.visits.map((x) => (
              <li key={x._id}><div><b>{x.reason}</b><em>{fmtStamp(x.arrivedAt)} · {x.outcomeLabel}{(x.medicines || []).length ? ` · ${x.medicines.map((m) => `${m.name} ${m.dosage}`).join(', ')}` : ''}</em>{x.treatment ? <em>{x.treatment}</em> : null}</div></li>
            ))}
          </ul>
        ) : <p className="md-muted" style={{ margin: 0 }}>None.</p>}
      </Panel>
      <StaffRecordDialog open={edit} health={d.health} title="My health record" intro="Only the Medical Room's staff and you can see this."
        onClose={() => setEdit(false)} save={api.saveMyHealth} onSaved={() => { toast.success('Saved'); mine.reload(); }} />
    </>
  );
}

const ORDER = ['requested', 'accepted', 'arrived', 'treatment'];
const OUTCOME = { returned: 'is-done', sent_home: 'is-end-home', referred: 'is-end-ref', closed: 'is-done' };

/** Requested → Accepted → Arrived → Under treatment → the outcome, as a progress line. */
function Progress({ status }) {
  const at = ORDER.indexOf(status);
  const ended = !ORDER.includes(status) && status !== 'cancelled';
  return (
    <div className="mdt-progress" aria-label={`Status: ${labelOf(REQUEST_STATUS, status)}`}>
      {['Requested', 'Accepted', 'Arrived', 'Treatment'].map((l, i) => (
        <span key={l} className={ended || i < at ? 'is-done' : i === at ? 'is-now' : ''}>{l}</span>
      ))}
      <span className={ended ? OUTCOME[status] || 'is-done' : ''}>{ended ? labelOf(REQUEST_STATUS, status) : 'Outcome'}</span>
      <em className="mdt-progress__now">Now: {labelOf(REQUEST_STATUS, status)}</em>
    </div>
  );
}

function RequestCard({ r, onCancel }) {
  const open = ['requested', 'accepted', 'arrived', 'treatment'].includes(r.status);
  return (
    <article className="mdt-req">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <Person name={r.studentName} photo={r.studentPhoto} size={38} sub={studentLine(r)} />
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Status of="request" value={r.status} />
          <Badge tone={URGENCY[r.urgency]?.tone} size="sm">{labelOf(URGENCY, r.urgency)}</Badge>
        </span>
      </div>
      <div className="md-muted" style={{ fontSize: '.84rem' }}><b style={{ color: 'var(--md-ink)' }}>{r.reason}</b>{r.symptoms ? ` — ${r.symptoms}` : ''} · {r.number} · sent {ago(r.createdAt)}</div>
      {r.status !== 'cancelled' ? <Progress status={r.status} /> : <Note tone="slate" icon="close">Cancelled — {r.cancelReason}</Note>}
      {r.outcomeNote ? <Note tone={r.status === 'returned' ? 'green' : r.status === 'sent_home' ? 'orange' : r.status === 'referred' ? 'rose' : 'indigo'} icon="info"><b>From the Medical Room:</b> {r.outcomeNote}</Note> : null}
      {r.history?.length > 1 ? <details><summary className="md-muted" style={{ cursor: 'pointer', fontSize: '.82rem' }}>Timeline</summary><div style={{ marginTop: 8 }}><Steps steps={r.history} map={REQUEST_STATUS} /></div></details> : null}
      {open && ['requested', 'accepted'].includes(r.status) ? <div><Btn size="sm" kind="danger" onClick={() => onCancel(r)}>Withdraw request</Btn></div> : null}
    </article>
  );
}

function SendForm({ meta, onSent }) {
  const [mine, setMine] = useState(false);
  const [v, setV] = useState({ student: null, reason: '', symptoms: '', location: '', urgency: 'normal', remarks: '', escortedBy: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (x) => setV((cur) => ({ ...cur, [k]: x }));
  const fetcher = React.useCallback((q) => api.findTeacherStudents(q, mine), [mine]);
  const send = async () => {
    if (!v.student?._id) { setErr('Choose the student'); return; }
    if (!v.reason.trim()) { setErr('Say why the student needs the Medical Room'); return; }
    setBusy(true); setErr('');
    try {
      await api.sendToMedicalRoom({ ...v, student: v.student._id });
      toast.success(`${v.student.name} — the Medical Room has been told`);
      setV({ student: null, reason: '', symptoms: '', location: v.location, urgency: 'normal', remarks: '', escortedBy: '' });
      onSent();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="md-form">
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
      <Field label="Student" required>
        <StudentPicker value={v.student} onChange={set('student')} fetcher={fetcher} autoFocus />
      </Field>
      <Switch checked={mine} onChange={setMine} label="Only students of my sections" hint="Turn off to send any student of the school — for example on playground duty." />
      <Field label="Reason" required>
        <input className="md-input" value={v.reason} onChange={(e) => set('reason')(e.target.value)} maxLength={200} placeholder="e.g. Headache, fell in the corridor" />
        <Chips options={meta?.visitReasons || []} value={v.reason} onPick={(x) => set('reason')(v.reason === x ? '' : x)} />
      </Field>
      <Field label="Symptoms" optional><textarea className="md-textarea" rows={2} value={v.symptoms} onChange={(e) => set('symptoms')(e.target.value)} maxLength={600} placeholder="What you noticed" /></Field>
      <Field label="Where the student is now" optional>
        <input className="md-input" value={v.location} onChange={(e) => set('location')(e.target.value)} maxLength={120} />
        <Chips options={meta?.locations || []} value={v.location} onPick={(x) => set('location')(v.location === x ? '' : x)} />
      </Field>
      <Field label="How urgent">
        <Segmented value={v.urgency} onChange={set('urgency')} label="Urgency" options={Object.entries(URGENCY).map(([value, u]) => ({ value, label: u.label, tone: u.tone }))} />
      </Field>
      {v.urgency === 'emergency' ? <Note tone="red" icon="siren">For a life-threatening emergency, call the Medical Room{meta?.roomPhone ? ` (${meta.roomPhone})` : ''} and the emergency services first — then send this so it is recorded.</Note> : null}
      <div className="md-form__grid">
        <Field label="Coming with" optional><input className="md-input" value={v.escortedBy} onChange={(e) => set('escortedBy')(e.target.value)} placeholder="e.g. Class monitor" maxLength={120} /></Field>
        <Field label="Remarks" optional><input className="md-input" value={v.remarks} onChange={(e) => set('remarks')(e.target.value)} maxLength={600} /></Field>
      </div>
      <div><Btn kind={v.urgency === 'emergency' ? 'emergency' : 'primary'} size="lg" icon="send" busy={busy} onClick={send}>Send to Medical Room</Btn></div>
    </div>
  );
}

function IncidentForm({ meta, onDone }) {
  const blank = { student: null, occurredAt: stampInput(), type: '', severity: 'minor', location: '', description: '', injury: '', bodyPart: '', firstAid: '', witnesses: '', remarks: '' };
  const [v, setV] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (x) => setV((cur) => ({ ...cur, [k]: x }));
  const submit = async () => {
    if (!v.student?._id) { setErr('Choose the student'); return; }
    if (!v.type) { setErr('Choose the type of incident'); return; }
    if (!v.description.trim()) { setErr('Describe what happened'); return; }
    setBusy(true); setErr('');
    try {
      await api.reportIncident({ ...v, student: v.student._id, occurredAt: new Date(v.occurredAt).toISOString() });
      toast.success('Incident reported — the Medical Room has been told');
      setV({ ...blank, occurredAt: stampInput() }); onDone();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="md-form">
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
      <Field label="Student" required><StudentPicker value={v.student} onChange={set('student')} fetcher={(q) => api.findTeacherStudents(q)} /></Field>
      <div className="md-form__grid">
        <Field label="When" required><input className="md-input" type="datetime-local" value={v.occurredAt} max={stampInput(new Date(Date.now() + 60000))} onChange={(e) => set('occurredAt')(e.target.value)} /></Field>
        <Field label="Type of incident" required>
          <span className={`md-select${v.type ? ' is-set' : ''}`} style={{ width: '100%' }}>
            <select value={v.type} onChange={(e) => set('type')(e.target.value)}><option value="">Choose…</option>{(meta?.incidentTypes || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            <Ico name="chevronDown" size={15} />
          </span>
        </Field>
      </div>
      <Field label="Severity"><Segmented value={v.severity} onChange={set('severity')} label="Severity" options={Object.entries(INCIDENT_SEVERITY).map(([value, x]) => ({ value, label: x.label, tone: x.tone }))} /></Field>
      <Field label="Where" optional>
        <input className="md-input" value={v.location} onChange={(e) => set('location')(e.target.value)} maxLength={120} />
        <Chips options={meta?.locations || []} value={v.location} onPick={(x) => set('location')(v.location === x ? '' : x)} />
      </Field>
      <Field label="What happened" required><textarea className="md-textarea" rows={3} value={v.description} onChange={(e) => set('description')(e.target.value)} maxLength={2000} /></Field>
      <div className="md-form__grid">
        <Field label="Injury" optional><input className="md-input" value={v.injury} onChange={(e) => set('injury')(e.target.value)} placeholder="e.g. Grazed knee" /></Field>
        <Field label="Part of the body" optional><input className="md-input" value={v.bodyPart} onChange={(e) => set('bodyPart')(e.target.value)} /></Field>
        <Field label="First aid you gave" optional><input className="md-input" value={v.firstAid} onChange={(e) => set('firstAid')(e.target.value)} /></Field>
        <Field label="Witnesses" optional><input className="md-input" value={v.witnesses} onChange={(e) => set('witnesses')(e.target.value)} /></Field>
      </div>
      <Field label="Remarks" optional><input className="md-input" value={v.remarks} onChange={(e) => set('remarks')(e.target.value)} /></Field>
      <div><Btn kind="primary" icon="alertTri" busy={busy} onClick={submit}>Report incident</Btn></div>
    </div>
  );
}

// Who else a teacher looks after, beyond their classes (server services/medicalNeedToKnow).
const GROUP_ICON = { covering: 'users', invigilating: 'clipboard', bus: 'bus', hostel: 'home', mess: 'alertTri' };

/** In an emergency: any student's card, by saying what is happening. Logged; the room is told. */
function EmergencyAccess({ open, onClose, onOpened }) {
  const [student, setStudent] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setStudent(null); setReason(''); setErr(''); setBusy(false); } }, [open]);
  const go = async () => {
    setBusy(true); setErr('');
    try { const r = await api.teacherEmergencyAccess({ student: student?._id, reason: reason.trim() }); onOpened(r?.data ?? r); }
    catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title="Emergency — open any student's card" icon="siren" tone="red" width={560}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="danger-solid" busy={busy} disabled={!student || reason.trim().length < 5} onClick={go}>Open the emergency card</Btn></>}>
      <Note tone="amber" icon="alertTri">For a real emergency only. The Medical Room is told at once who opened the card and why, and it is kept in the record.</Note>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
      <Field label="Student" required><StudentPicker value={student} onChange={setStudent} fetcher={(q) => api.findTeacherStudents(q, false)} autoFocus /></Field>
      <Field label="What is happening" required><textarea className="md-textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Collapsed on the playground; breathing difficulty in the bus" /></Field>
    </Dialog>
  );
}

export default function TeacherMedical() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'send';
  const setTab = (t) => setParams(t === 'send' ? {} : { tab: t }, { replace: true });
  const meta = useLoad(() => api.getTeacherMedMeta(), 'tmeta');
  const ov = useLoad(() => api.getTeacherMedOverview(), 'tov');
  const reqs = useLoad(() => (tab === 'requests' || tab === 'send' ? api.getTeacherRequests({ limit: 30 }) : Promise.resolve(null)), tab);
  const alerts = useLoad(() => (tab === 'alerts' ? api.getTeacherAlerts() : Promise.resolve(null)), tab);
  const incidents = useLoad(() => (tab === 'incident' ? api.getTeacherIncidents() : Promise.resolve(null)), tab);
  const [cancel, setCancel] = useState(null);
  const [emergency, setEmergency] = useState(null);   // { loading, data, error }
  const [breakGlass, setBreakGlass] = useState(false);
  const m = meta.data;
  const o = ov.data;
  const hasOpen = (o?.open || []).length > 0;

  // While a request is open, its status changes as the room works — follow it.
  useEffect(() => {
    if (!hasOpen) return undefined;
    const t = setInterval(() => { ov.reload(); reqs.reload(); }, 20000);
    return () => clearInterval(t);
  }, [hasOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { ov.reload(); reqs.reload(); };
  // The room accepting, receiving or sending home the student this teacher sent.
  useMedLive(refresh, { event: 'medical:request' });
  // …and any notice from the Medical Room (an emergency card changed, a child off sick).
  useMedLive(refresh, { event: 'notification:new', when: medicalNotice });
  const openEmergency = async (sid) => {
    setEmergency({ loading: true });
    try { const r = await api.getTeacherEmergency(sid); setEmergency({ data: r?.data ?? r }); }
    catch (e) { setEmergency(null); toast.error(errorText(e)); }
  };
  const bySection = useMemo(() => {
    const map = new Map();
    for (const row of alerts.data?.rows || []) {
      const k = row.sectionId || 'other';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(row);
    }
    return map;
  }, [alerts.data]);

  const tabs = [
    { key: 'send', label: 'Send to Medical Room' },
    { key: 'requests', label: 'My Requests', count: o?.open?.length || 0 },
    ...(m?.teacherAlerts !== false ? [{ key: 'alerts', label: 'Medical Alerts', count: o?.criticalCount || 0 }] : []),
    { key: 'incident', label: 'Report an Incident' },
    { key: 'health', label: 'My Health' },
    { key: 'safeguarding', label: 'Safeguarding' },
  ];

  if (meta.error && !m) return <Page><LoadError error={meta.error} onRetry={meta.reload} /></Page>;
  return (
    <Page>
      <PageHead icon="heartPulse" tone="rose" title={m?.roomName || 'Medical Room'}
        subtitle={`Send a student to the ${m?.roomName || 'Medical Room'} and follow how they are, see the medical alerts of the students you teach, and report an injury or accident.`}>
        {m?.roomPhone ? <Btn as="a" href={`tel:${telOf(m.roomPhone)}`} icon="phone">Call {m.roomPhone}</Btn> : null}
        {m?.breakGlass ? <Btn kind="danger" icon="siren" onClick={() => setBreakGlass(true)}>Emergency — any student</Btn> : null}
      </PageHead>
      {o ? (
        <Tiles>
          <Tile tone="amber" icon="inbox" value={o.open.length} label="My open requests" caption={o.open.length ? 'Students on their way or being seen' : 'Nothing open'} onClick={() => setTab('requests')} />
          <Tile tone="blue" icon="bed" value={o.inRoom.length} label="My students in the room" caption={o.inRoom.map((x) => x.studentName).slice(0, 2).join(', ') || 'None right now'} />
          <Tile tone="red" icon="shieldCheck" value={o.criticalCount} label="With critical alerts" caption={`In your ${o.sections.length} section${o.sections.length === 1 ? '' : 's'}`} onClick={m?.teacherAlerts !== false ? () => setTab('alerts') : undefined} />
          <Tile tone="slate" icon="users" value={o.studentCount} label="Students you teach" caption={o.sections.map((s) => `${s.className} ${s.sectionName}`).slice(0, 3).join(', ')} />
        </Tiles>
      ) : null}
      <LineTabs items={tabs} value={tab} onChange={setTab} />

      {tab === 'send' ? (
        <div className="mdt-send">
          <Panel title="Send a student to the Medical Room" sub="The medical room is told at once. You will see here when they are expecting the student and what happened." icon="send" tone="rose">
            {m ? <SendForm meta={m} onSent={refresh} /> : <Spin />}
          </Panel>
          <Panel title="Open right now" icon="inbox" tone="amber" pad>
            {(o?.open || []).length ? o.open.map((r) => <RequestCard key={r._id} r={r} onCancel={setCancel} />)
              : <Empty compact title="Nothing open">Requests you send appear here until the student is back.</Empty>}
          </Panel>
        </div>
      ) : null}

      {tab === 'requests' ? (
        <Panel title="My requests" sub="Everything you have sent, newest first" icon="inbox" tone="amber" pad>
          {reqs.loading && !reqs.data ? <Spin /> : (reqs.data?.rows || []).length ? reqs.data.rows.map((r) => <RequestCard key={r._id} r={r} onCancel={setCancel} />)
            : <Empty compact title="No requests yet">Use “Send to Medical Room” when a student is unwell.</Empty>}
        </Panel>
      ) : null}

      {tab === 'alerts' ? (
        alerts.error ? <LoadError error={alerts.error} onRetry={alerts.reload} /> : !alerts.data ? <Spin /> : (
          <>
            <Note tone="indigo" icon="lock">These are the alerts the Medical Room shares with the teachers of each student — allergies and conditions you may need to act on, and what to do. The rest of a student's medical record stays with the Medical Room.</Note>
            {(alerts.data.restrictions || []).length || (alerts.data.away || []).length ? (
              <Panel title="What to know today" sub="From the Medical Room — what to do, not why" icon="ban" tone="orange" pad>
                {(alerts.data.restrictions || []).map((x) => (
                  <div key={x._id} className="mdp-rec">
                    <Person name={x.student.name} photo={x.student.photo} size={36} sub={x.student.classLabel} />
                    <div className="mdp-rec__main">
                      <div className="mdp-rec__top"><b>{x.teacherText}</b>{x.state === 'upcoming' ? <Badge size="sm" tone="blue">From {fmtDay(x.startsOn)}</Badge> : null}</div>
                      <div className="mdp-rec__lines"><span>{x.endsOn ? `Until ${fmtDay(x.endsOn)}` : 'Until further notice'}</span></div>
                    </div>
                  </div>
                ))}
                {(alerts.data.away || []).map((x) => (
                  <div key={x._id} className="mdp-rec is-off">
                    <Person name={x.student.name} photo={x.student.photo} size={36} sub={x.student.classLabel} />
                    <div className="mdp-rec__main">
                      <div className="mdp-rec__top"><b>Off school for health reasons</b></div>
                      <div className="mdp-rec__lines"><span>{x.earliestReturn ? `Back no earlier than ${fmtDay(x.earliestReturn)}` : 'Back when the Medical Room clears them'}</span></div>
                    </div>
                  </div>
                ))}
              </Panel>
            ) : null}
            {alerts.data.sections.length ? alerts.data.sections.map((s) => {
              const rows = bySection.get(s._id) || [];
              return (
                <Panel key={s._id} title={`${s.className} – ${s.sectionName}`} sub={`${s.role} · ${rows.length} of ${s.count} students with alerts`} icon="building" tone="indigo" pad>
                  {rows.length ? rows.map((r) => (
                    <div key={r.student._id} className={`mdp-rec${r.critical ? ' is-critical' : ''}`}>
                      <Person name={r.student.name} photo={r.student.photo} size={40} sub={[r.student.rollNumber ? `Roll ${r.student.rollNumber}` : '', r.student.admissionNumber].filter(Boolean).join(' · ')} />
                      <div className="mdp-rec__main">
                        <AlertChips alerts={r.alerts} max={6} size="lg" />
                        <div className="mdp-rec__lines">
                          {r.alerts.filter((a) => a.instructions).map((a) => <span key={a.label}><strong>{a.label}:</strong> {a.instructions}</span>)}
                          {r.instructions ? <span><strong>Instructions:</strong> {r.instructions}</span> : null}
                        </div>
                      </div>
                      {alerts.data.emergencyInfo ? <Btn size="sm" kind="danger" icon="siren" onClick={() => openEmergency(r.student._id)}>Emergency</Btn> : null}
                    </div>
                  )) : <p className="md-muted" style={{ margin: 0 }}>No medical alerts in this section.</p>}
                </Panel>
              );
            }) : !(alerts.data.groups || []).length ? <Empty title="You have no sections this year">Medical alerts appear for the students of the sections you are class teacher, vice class teacher or subject teacher of.</Empty> : null}
            {(alerts.data.groups || []).map((g) => (
              <Panel key={g.key} title={g.label} icon={GROUP_ICON[g.key] || 'users'} tone={g.foodOnly ? 'amber' : 'red'} pad
                sub={[g.sub, g.until ? 'today only' : '', `${g.rows.length} of ${g.students} with ${g.foodOnly ? 'a food allergy or a diet' : 'critical alerts'}`].filter(Boolean).join(' · ')}>
                {g.rows.length ? g.rows.map((r) => (
                  <div key={r.student._id} className={`mdp-rec${r.critical ? ' is-critical' : ''}`}>
                    <Person name={r.student.name} photo={r.student.photo} size={40} sub={[r.student.classLabel, r.student.admissionNumber].filter(Boolean).join(' · ')} />
                    <div className="mdp-rec__main">
                      <AlertChips alerts={r.alerts} max={6} size="lg" />
                      <div className="mdp-rec__lines">
                        {r.alerts.filter((a) => a.detail || a.instructions).map((a) => <span key={a.label}><strong>{a.label}:</strong> {[a.detail, a.instructions].filter(Boolean).join(' — ')}</span>)}
                        {r.instructions ? <span><strong>Instructions:</strong> {r.instructions}</span> : null}
                        {r.diet ? <span><strong>Diet:</strong> {r.diet}</span> : null}
                        {(r.contacts || []).length ? <span className="mdt-call"><strong>Call:</strong> {r.contacts.map((c, i) => <a key={i} href={`tel:${telOf(c.phone)}`}>{c.name}{c.relation ? ` (${c.relation})` : ''} {c.phone}</a>)}</span> : null}
                      </div>
                    </div>
                    {!g.foodOnly ? <Btn size="sm" kind="danger" icon="siren" onClick={() => openEmergency(r.student._id)}>Emergency</Btn> : null}
                  </div>
                )) : <p className="md-muted" style={{ margin: 0 }}>{g.foodOnly ? 'No food allergies or special diets among them.' : 'No critical alerts among them.'}</p>}
              </Panel>
            ))}
          </>
        )
      ) : null}

      {tab === 'health' ? <MyHealth /> : null}
      {tab === 'safeguarding' ? <Safeguarding role="teacher" /> : null}
      {tab === 'incident' ? (
        <div className="mdt-send">
          <Panel title="Report a medical incident" sub="An injury, a fall, fainting, an allergic reaction — wherever it happened. The Medical Room is told at once." icon="alertTri" tone="orange">
            {m ? <IncidentForm meta={m} onDone={incidents.reload} /> : <Spin />}
          </Panel>
          <Panel title="Incidents you reported" icon="history" tone="slate" pad>
            {incidents.loading && !incidents.data ? <Spin /> : (incidents.data || []).length ? incidents.data.map((i) => (
              <div key={i._id} className="mdf-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <b>{labelOf(INCIDENT_TYPE, i.type)} — {i.studentName}</b>
                  <span style={{ display: 'flex', gap: 4 }}><Badge tone={INCIDENT_SEVERITY[i.severity]?.tone} size="sm">{labelOf(INCIDENT_SEVERITY, i.severity)}</Badge><Status of="incidentStatus" value={i.status} size="sm" /></span>
                </div>
                <span className="md-muted" style={{ fontSize: '.8rem' }}>{i.number} · {fmtStamp(i.occurredAt)}{i.location ? ` · ${i.location}` : ''}</span>
              </div>
            )) : <Empty compact title="None reported">Incidents you report appear here with their status.</Empty>}
          </Panel>
        </div>
      ) : null}

      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} title="Withdraw this request?" message={cancel ? `The Medical Room will no longer expect ${cancel.studentName}.` : ''}
        reason reasonLabel="Why" reasonPlaceholder="e.g. Feeling better, sent by mistake" confirmLabel="Withdraw" danger
        onConfirm={async (why) => { await api.withdrawMedRequest(cancel._id, why); toast.success('Request withdrawn'); setCancel(null); refresh(); }} />
      <EmergencyAccess open={breakGlass} onClose={() => setBreakGlass(false)} onOpened={(data) => { setBreakGlass(false); setEmergency({ data }); }} />
      {emergency ? (
        <Modal open onClose={() => setEmergency(null)} title="Emergency profile" maxWidth={820}>
          {emergency.loading ? <Spin /> : <EmergencyCard data={emergency.data} onClose={() => setEmergency(null)} />}
        </Modal>
      ) : null}
    </Page>
  );
}
