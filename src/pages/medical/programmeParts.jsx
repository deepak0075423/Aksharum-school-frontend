/**
 * Health programmes (Oct 2026) — the pieces the student's record (medical
 * staff) and the family's page share:
 *
 *   ScheduleList          the school's vaccination schedule for one child
 *   ExemptionDialog       staff: a child exempt from a dose, and why
 *   ReferralList          specialist referrals — staff open them, families answer
 *   ReferralDialog        staff: refer a child to a specialist
 *   ReferralDetail        staff: what came back, close / cancel / remind / letter
 *   FamilyReferralDialog  family: "we have an appointment", "we saw the doctor", "we will not go"
 *   FamilyCampaigns       family: a campaign coming up (yes / no) and past ones
 *   IllnessDialog         family: "my child is off sick"
 *   IllnessList · NoticesList
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../api/medical.api';
import { Btn, Badge, Dialog, Field, Note, Empty, Segmented, Chips, Kebab } from './mdUI';
import { DocButton } from './mdShared';
import { fmtDay, fmtDate, fmtStamp, errorText, todayStr, addDays } from './mdMeta';

export const SPECIALTY = {
  eye: 'Eye specialist', ent: 'Ear, nose & throat', dental: 'Dentist', paediatric: 'Paediatrician', nutrition: 'Nutrition / dietitian',
  skin: 'Skin specialist', mental_health: 'Counsellor / mental health', orthopaedic: 'Bone & joint specialist', other: 'Other specialist',
};
// Who, in a sentence: "the school suggests Gita sees an eye specialist".
export const WHOM = {
  eye: 'an eye specialist', ent: 'an ear, nose and throat (ENT) specialist', dental: 'a dentist', paediatric: 'a paediatrician',
  nutrition: 'a dietitian', skin: 'a skin specialist', mental_health: 'a counsellor', orthopaedic: 'a bone and joint specialist', other: 'a specialist',
};
export const URGENCY = { routine: { label: 'Routine', days: 30 }, soon: { label: 'Soon', days: 14 }, urgent: { label: 'Urgent', days: 3 } };
export const EXEMPT_REASON = { medical: 'Medical reason', immune: 'Already immune', religious: 'Religious or personal belief', declined: 'Family declined', other: 'Other' };
const data = (r) => r?.data ?? r;

/* ── The vaccination schedule ─────────────────────────────────────────────── */

export function ScheduleList({ schedule, staff, onExempt, onEndExempt }) {
  if (!schedule?.on) {
    return staff ? <Note tone="slate" icon="info">The school has not chosen a vaccination schedule. Choose one in Settings → Programmes to see which doses each child is due.</Note> : null;
  }
  const rows = schedule.entries || [];
  if (!rows.length) return <Empty compact title="Nothing on the schedule for this age" />;
  return (
    <div className="mdpr-sched">
      <p className="md-muted" style={{ margin: '0 0 8px' }}>{schedule.programmeLabel}</p>
      <ul className="mdd-list">
        {rows.map((e) => (
          <li key={e.key} className={e.status === 'overdue' ? 'is-critical' : ''}>
            <div>
              <b>{e.label}</b>
              <em>{e.window}{e.givenOn ? ` · given ${fmtDay(e.givenOn)}` : e.dueOn && !['exempt', 'no_record'].includes(e.status) ? ` · due ${fmtDay(e.dueOn)}` : ''}{e.unverified ? ' · not yet checked by the school' : ''}</em>
            </div>
            <Badge tone={e.tone} size="sm">{e.statusLabel}</Badge>
            {staff && !['done', 'exempt', 'later'].includes(e.status) ? <Btn size="sm" kind="ghost" onClick={() => onExempt?.(e)}>Exempt</Btn> : null}
            {staff && e.status === 'exempt' && e.exemption ? <Btn size="sm" kind="ghost" onClick={() => onEndExempt?.(e)}>End exemption</Btn> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExemptionDialog({ entry, studentId, onClose, onDone }) {
  const [v, setV] = useState({ reason: 'medical', note: '', until: '', scope: 'dose' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!entry) return null;
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.addVaccineExemption(studentId, { vaccine: entry.vaccine, entryKey: v.scope === 'dose' ? entry.key : '', reason: v.reason, note: v.note, until: v.until || null });
      toast.success('Exemption recorded'); onDone?.();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Exempt from ${entry.label}`} icon="shieldCheck" tone="slate" width={520}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Record the exemption</Btn></>}>
      <Note tone="slate" icon="info">An exempt child is counted apart in the coverage, and the family is not reminded about this dose. Teachers never see it.</Note>
      <Field label="Why" required><select className="md-input" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })}>{Object.entries(EXEMPT_REASON).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Applies to"><Segmented value={v.scope} onChange={(x) => setV({ ...v, scope: x })} label="Applies to" options={[{ value: 'dose', label: 'This dose' }, { value: 'all', label: `Every dose of ${entry.vaccine}` }]} /></Field>
      <Field label="Details" required={['medical', 'other'].includes(v.reason)} hint={v.reason === 'medical' ? 'The doctor’s reason, e.g. a severe reaction to an earlier dose' : ''}><textarea className="md-textarea" rows={3} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={1000} /></Field>
      <Field label="Until" optional hint="For a reason that passes (an illness, a treatment). Leave empty for no end."><input className="md-input" type="date" min={todayStr()} value={v.until} onChange={(e) => setV({ ...v, until: e.target.value })} /></Field>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

/* ── Referrals ────────────────────────────────────────────────────────────── */

export function ReferralList({ rows = [], staff, family, onOpen, onAnswer, empty }) {
  if (!rows.length) return empty || <Empty compact title="No referrals">{staff ? 'A screening saved as "Referred" refers the child by itself; or refer one by hand.' : 'When the school suggests seeing a specialist, it appears here.'}</Empty>;
  return (
    <ul className="mdd-list mdpr-refs">
      {rows.map((r) => {
        const open = ['waiting', 'booked'].includes(r.status);
        return (
          <li key={r._id} className={r.overdue ? 'is-critical' : ''}>
            <div>
              <b>{r.specialtyLabel}{staff ? ` · ${r.number}` : ''}</b>
              <em>{r.reason}</em>
              <em>{[r.dueBy && open ? `to be seen by ${fmtDay(r.dueBy)}` : '', r.appointmentOn && r.status === 'booked' ? `appointment ${fmtDay(r.appointmentOn)}${r.appointmentWith ? ` with ${r.appointmentWith}` : ''}` : '', r.source?.label].filter(Boolean).join(' · ')}</em>
              {r.outcome?.diagnosis || r.outcome?.advice ? <em>Specialist: {[r.outcome.diagnosis, r.outcome.advice].filter(Boolean).join(' — ')}{r.outcome.glasses ? ' · glasses' : ''}</em> : null}
              {r.status === 'declined' && r.declinedReason ? <em>Family: “{r.declinedReason}”</em> : null}
            </div>
            <Badge tone={r.tone} size="sm">{r.statusLabel}</Badge>
            {staff ? <Btn size="sm" kind="tint" onClick={() => onOpen?.(r)}>Open</Btn> : null}
            {family ? (
              <span className="md-acts">
                {open ? <Btn size="sm" kind="primary" onClick={() => onAnswer?.(r, 'seen')}>We saw the doctor</Btn> : null}
                <Kebab items={[
                  open ? { label: 'We have an appointment', icon: 'calendar', onClick: () => onAnswer?.(r, 'booked') } : null,
                  open ? { label: 'We will not go', icon: 'close', onClick: () => onAnswer?.(r, 'declined') } : null,
                  { label: 'Letter for the doctor (PDF)', icon: 'printer', onClick: () => api.downloadPdf(api.familyReferralLetterUrl(r._id), `referral-${r.number}.pdf`).catch((e) => toast.error(errorText(e))) },
                ].filter(Boolean)} />
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ReferralDialog({ student, preset, onClose, onDone }) {
  const [v, setV] = useState({ specialty: preset?.specialty || 'paediatric', reason: preset?.reason || '', findings: preset?.findings || '', urgency: 'routine', dueBy: addDays(todayStr(), 30) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!student) return null;
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.createReferral({ student: student._id, ...v, source: preset?.source });
      toast.success('Referred — the family has been told'); onDone?.();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Refer ${student.name} to a specialist`} icon="send" tone="indigo" width={560}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Refer and tell the family</Btn></>}>
      <Field label="To" required><select className="md-input" value={v.specialty} onChange={(e) => setV({ ...v, specialty: e.target.value })}>{Object.entries(SPECIALTY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Why — in words the family will understand" required><textarea className="md-textarea" rows={3} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} maxLength={600} /></Field>
      <Field label="What was found (for the specialist)" optional><textarea className="md-textarea" rows={2} value={v.findings} onChange={(e) => setV({ ...v, findings: e.target.value })} maxLength={2000} /></Field>
      <Field label="How soon"><Segmented value={v.urgency} onChange={(x) => setV({ ...v, urgency: x, dueBy: addDays(todayStr(), URGENCY[x].days) })} label="How soon" options={Object.entries(URGENCY).map(([value, u]) => ({ value, label: u.label }))} /></Field>
      <Field label="To be seen by"><input className="md-input" type="date" min={todayStr()} value={v.dueBy} onChange={(e) => setV({ ...v, dueBy: e.target.value })} /></Field>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

/** The staff's view of one referral: what came back, and what to do next. */
export function ReferralDetail({ referral, onClose, onChanged }) {
  const [mode, setMode] = useState('');
  const [v, setV] = useState({ seenOn: todayStr(), seenBy: '', diagnosis: '', advice: '', glasses: '', note: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!referral) return null;
  const r = referral;
  const open = ['waiting', 'booked'].includes(r.status);
  const run = async (body, ok) => {
    setBusy(true); setErr('');
    try { await api.referralAct(r._id, body); toast.success(ok); setMode(''); onChanged?.(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const footer = mode === 'outcome'
    ? <><Btn onClick={() => setMode('')} disabled={busy}>Back</Btn><Btn kind="primary" busy={busy} onClick={() => run({ action: 'outcome', ...v, glasses: v.glasses === '' ? undefined : v.glasses === 'yes', close: true }, 'Recorded and closed')}>Record and close</Btn></>
    : mode === 'close' || mode === 'cancel'
      ? <><Btn onClick={() => setMode('')} disabled={busy}>Back</Btn><Btn kind={mode === 'cancel' ? 'danger-solid' : 'primary'} busy={busy} onClick={() => run(mode === 'close' ? { action: 'close', note: v.note } : { action: 'cancel', reason: v.reason }, mode === 'close' ? 'Closed' : 'Cancelled')}>{mode === 'close' ? 'Close the referral' : 'Cancel the referral'}</Btn></>
      : <>
        <Btn icon="printer" onClick={() => api.downloadPdf(api.referralLetterUrl(r._id), `referral-${r.number}.pdf`).catch((e) => toast.error(errorText(e)))}>Letter</Btn>
        {open ? <Btn icon="bell" busy={busy} onClick={() => run({ action: 'remind' }, 'The family has been reminded')}>Remind the family</Btn> : null}
        {['seen', 'waiting', 'booked', 'declined'].includes(r.status) ? <Btn kind="primary" onClick={() => setMode(r.status === 'seen' ? 'close' : 'outcome')}>{r.status === 'seen' ? 'Read — close it' : 'Record what the specialist said'}</Btn> : null}
        {['closed', 'declined'].includes(r.status) ? <Btn onClick={() => run({ action: 'reopen' }, 'Reopened')}>Reopen</Btn> : null}
      </>;
  return (
    <Dialog open onClose={onClose} title={`${r.number} — ${r.specialtyLabel}`} icon="send" tone="indigo" width={600} footer={footer}>
      {mode === '' ? (
        <>
          <div className="mdpr-detail">
            <div><span>Student</span><b>{r.studentName}</b><em>{r.classLabel}</em></div>
            <div><span>Status</span><Badge tone={r.tone} size="sm">{r.statusLabel}</Badge></div>
            <div><span>To be seen by</span><b>{fmtDay(r.dueBy) || '—'}</b><em>{r.urgencyLabel}</em></div>
          </div>
          <h4 className="mdp-h">Why</h4><p style={{ margin: 0 }}>{r.reason}</p>
          {r.findings ? <><h4 className="mdp-h">What was found</h4><p style={{ margin: 0 }}>{r.findings}</p></> : null}
          {r.appointmentOn ? <p className="md-muted">Appointment {fmtDay(r.appointmentOn)}{r.appointmentWith ? ` with ${r.appointmentWith}` : ''}</p> : null}
          {r.outcome?.reportedAt ? (
            <>
              <h4 className="mdp-h">What the specialist said</h4>
              <p style={{ margin: 0 }}><b>{r.outcome.diagnosis}</b>{r.outcome.advice ? ` — ${r.outcome.advice}` : ''}</p>
              <p className="md-muted">Seen {fmtDay(r.outcome.seenOn)}{r.outcome.seenBy ? ` by ${r.outcome.seenBy}` : ''}{r.outcome.glasses === true ? ' · glasses needed' : r.outcome.glasses === false ? ' · no glasses' : ''} · told by {r.outcome.reportedByName} ({r.outcome.reportedByRole === 'parent' ? 'family' : 'school'}), {fmtStamp(r.outcome.reportedAt)}</p>
              {r.document ? <DocButton getLink={api.medDocLink} id={r.document}>The report</DocButton> : null}
            </>
          ) : null}
          {r.status === 'declined' ? <Note tone="slate" icon="info">The family will not go: “{r.declinedReason}”</Note> : null}
          {r.closeNote ? <p className="md-muted">Closed by {r.closedByName}: {r.closeNote}</p> : null}
          {(r.reminders || []).length ? <p className="md-muted">Reminded {r.reminders.map((x) => fmtDate(x.at)).join(', ')}</p> : null}
          {open ? <p style={{ marginTop: 12 }}><button type="button" className="md-link" onClick={() => setMode('cancel')}>Cancel this referral</button></p> : null}
        </>
      ) : null}
      {mode === 'outcome' ? (
        <>
          <Field label="Seen on"><input className="md-input" type="date" max={todayStr()} value={v.seenOn} onChange={(e) => setV({ ...v, seenOn: e.target.value })} /></Field>
          <Field label="Doctor / clinic" optional><input data-text="title" className="md-input" value={v.seenBy} onChange={(e) => setV({ ...v, seenBy: e.target.value })} maxLength={160} /></Field>
          <Field label="What was found" required><textarea className="md-textarea" rows={2} value={v.diagnosis} onChange={(e) => setV({ ...v, diagnosis: e.target.value })} maxLength={600} /></Field>
          <Field label="Advice / treatment" optional><textarea className="md-textarea" rows={2} value={v.advice} onChange={(e) => setV({ ...v, advice: e.target.value })} maxLength={1500} /></Field>
          {r.specialty === 'eye' ? <Field label="Glasses"><Segmented value={v.glasses} onChange={(x) => setV({ ...v, glasses: x })} label="Glasses" options={[{ value: 'yes', label: 'Needed' }, { value: 'no', label: 'Not needed' }, { value: '', label: 'Not said' }]} /></Field> : null}
        </>
      ) : null}
      {mode === 'close' ? <Field label={r.status === 'seen' ? 'Note' : 'Why it is closed without the specialist’s answer'} required={r.status !== 'seen'}><textarea className="md-textarea" rows={3} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={600} /></Field> : null}
      {mode === 'cancel' ? <Field label="Why it is cancelled" required><textarea className="md-textarea" rows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} maxLength={300} /></Field> : null}
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

/** The family answers a referral. mode: booked | seen | declined */
export function FamilyReferralDialog({ referral, mode, onClose, onDone }) {
  const [v, setV] = useState({ appointmentOn: '', appointmentWith: '', seenOn: todayStr(), seenBy: '', diagnosis: '', advice: '', glasses: '', reason: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!referral) return null;
  const send = async () => {
    setBusy(true); setErr('');
    try {
      const body = mode === 'booked' ? { action: 'booked', appointmentOn: v.appointmentOn, appointmentWith: v.appointmentWith }
        : mode === 'declined' ? { action: 'declined', reason: v.reason }
          : { action: 'seen', seenOn: v.seenOn, seenBy: v.seenBy, diagnosis: v.diagnosis, advice: v.advice, ...(v.glasses ? { glasses: v.glasses === 'yes' } : {}) };
      await api.answerReferral(referral._id, body, mode === 'seen' ? file : null);
      toast.success('Sent to the school'); onDone?.();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const title = { booked: 'We have an appointment', seen: 'What the doctor said', declined: 'We will not go' }[mode];
  return (
    <Dialog open onClose={onClose} title={`${title} — ${referral.specialtyLabel}`} icon="send" tone="indigo" width={540}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={send}>Send to the school</Btn></>}>
      {mode === 'booked' ? (
        <>
          <Field label="Date of the appointment" required><input className="md-input" type="date" min={todayStr()} value={v.appointmentOn} onChange={(e) => setV({ ...v, appointmentOn: e.target.value })} /></Field>
          <Field label="With" optional><input data-text="title" className="md-input" value={v.appointmentWith} onChange={(e) => setV({ ...v, appointmentWith: e.target.value })} placeholder="Doctor or clinic" maxLength={160} /></Field>
        </>
      ) : null}
      {mode === 'seen' ? (
        <>
          <Field label="Seen on"><input className="md-input" type="date" max={todayStr()} value={v.seenOn} onChange={(e) => setV({ ...v, seenOn: e.target.value })} /></Field>
          <Field label="Doctor / clinic" optional><input data-text="title" className="md-input" value={v.seenBy} onChange={(e) => setV({ ...v, seenBy: e.target.value })} maxLength={160} /></Field>
          <Field label="What the doctor found" required><textarea className="md-textarea" rows={2} value={v.diagnosis} onChange={(e) => setV({ ...v, diagnosis: e.target.value })} maxLength={600} /></Field>
          <Field label="Advice or treatment" optional><textarea className="md-textarea" rows={2} value={v.advice} onChange={(e) => setV({ ...v, advice: e.target.value })} maxLength={1500} /></Field>
          {referral.specialty === 'eye' ? <Field label="Glasses"><Segmented value={v.glasses} onChange={(x) => setV({ ...v, glasses: x })} label="Glasses" options={[{ value: 'yes', label: 'Needed' }, { value: 'no', label: 'Not needed' }, { value: '', label: 'Not said' }]} /></Field> : null}
          <Field label="The doctor's report" optional hint="A photo or PDF — only the school's medical staff and your family can see it."><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
        </>
      ) : null}
      {mode === 'declined' ? <Field label="Please tell the school why" required><textarea className="md-textarea" rows={3} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} maxLength={600} /></Field> : null}
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

/* ── Campaigns, for the family ────────────────────────────────────────────── */

export function FamilyCampaigns({ rows = [], child, canAnswer, onAnswered }) {
  const [no, setNo] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  if (!rows.length) return null;
  const answer = async (c, a, why = '') => {
    setBusy(`${c._id}:${a}`);
    try { await api.answerCampaign({ campaign: c._id, child, answer: a, reason: why }); toast.success(a === 'yes' ? 'Thank you — the school has your yes' : 'The school has your answer'); setNo(null); setReason(''); onAnswered?.(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(''); }
  };
  return (
    <ul className="mdd-list mdpr-camps">
      {rows.map((c) => (
        <li key={c._id}>
          <div>
            <b>{c.title}</b>
            <em>{c.kindLabel} · {fmtDay(c.startOn)}{c.endOn && c.endOn !== c.startOn ? ` to ${fmtDay(c.endOn)}` : ''}{c.what && c.what !== c.kindLabel ? ` · ${c.what}` : ''}</em>
            {c.about ? <em>{c.about}</em> : null}
            {c.consent !== 'none' && !c.outcome ? <em>{c.answer === 'yes' ? 'You said yes' : c.answer === 'no' ? `You said no${c.consentReason ? ` — “${c.consentReason}”` : ''}` : c.consent === 'opt_in' ? 'Your child takes part only if you say yes' : 'Your child takes part unless you say no'}{c.consentBy ? ` · answer by ${fmtDay(c.consentBy)}` : ''}</em> : null}
          </div>
          {c.outcome ? <Badge tone={c.outcome === 'given' ? 'green' : 'slate'} size="sm">{c.outcomeLabel}</Badge> : <Badge tone={c.tone} size="sm">{c.phaseLabel}</Badge>}
          {canAnswer && c.canAnswer ? (
            <span className="md-acts">
              {c.answer !== 'yes' ? <Btn size="sm" kind="primary" busy={busy === `${c._id}:yes`} onClick={() => answer(c, 'yes')}>Yes</Btn> : null}
              {c.answer !== 'no' ? <Btn size="sm" busy={busy === `${c._id}:no`} onClick={() => setNo(c)}>No</Btn> : null}
            </span>
          ) : null}
        </li>
      ))}
      {no ? (
        <Dialog open onClose={() => setNo(null)} title={`No to ${no.title}`} icon="close" tone="slate" width={460}
          footer={<><Btn onClick={() => setNo(null)}>Cancel</Btn><Btn kind="primary" busy={!!busy} onClick={() => answer(no, 'no', reason)}>Send</Btn></>}>
          <Field label="Why (optional)" optional hint="It helps the school nurse — e.g. given recently by your doctor."><textarea className="md-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
        </Dialog>
      ) : null}
    </ul>
  );
}

/* ── Off sick ─────────────────────────────────────────────────────────────── */

export function IllnessDialog({ child, name, symptoms = {}, onClose, onDone }) {
  const [v, setV] = useState({ from: todayStr(), to: '', symptoms: [], note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = (k) => setV({ ...v, symptoms: v.symptoms.includes(k) ? v.symptoms.filter((x) => x !== k) : [...v.symptoms, k] });
  const send = async () => {
    setBusy(true); setErr('');
    try { await api.reportIllness({ child, from: v.from, to: v.to || null, symptoms: v.symptoms, note: v.note }); toast.success('The school has been told'); onDone?.(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`${name} is unwell`} icon="thermometer" tone="amber" width={540}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={send}>Tell the school</Btn></>}>
      <Note tone="indigo" icon="info">The school nurse reads this. It helps the school notice when an illness is going round a class — no child is ever named to other families.</Note>
      <div className="md-form__grid">
        <Field label="Unwell since" required><input className="md-input" type="date" max={addDays(todayStr(), 1)} min={addDays(todayStr(), -14)} value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} /></Field>
        <Field label="Expected back" optional><input className="md-input" type="date" min={v.from} value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} /></Field>
      </div>
      <Field label="Signs" required><Chips multi options={Object.entries(symptoms).map(([value, label]) => ({ value, label }))} value={v.symptoms} onPick={toggle} /></Field>
      <Field label="Anything else" optional={!v.symptoms.includes('other')} required={v.symptoms.includes('other')}><textarea className="md-textarea" rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={600} placeholder="e.g. the doctor said it is chickenpox" /></Field>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

export function IllnessList({ rows = [], onWithdraw }) {
  if (!rows.length) return null;
  return (
    <ul className="mdd-list">
      {rows.map((r) => (
        <li key={r._id}>
          <div><b>{(r.symptomLabels || []).join(', ')}</b><em>From {fmtDay(r.from)}{r.to ? ` to ${fmtDay(r.to)}` : ''} · told by {r.reportedByName}{r.note ? ` · “${r.note}”` : ''}</em></div>
          <Badge tone={r.status === 'seen' ? 'green' : r.status === 'withdrawn' ? 'slate' : 'amber'} size="sm">{r.status === 'seen' ? 'Read by the nurse' : r.status === 'withdrawn' ? 'Withdrawn' : 'Sent'}</Badge>
          {r.status === 'new' && onWithdraw ? <Btn size="sm" kind="ghost" onClick={() => onWithdraw(r)}>Withdraw</Btn> : null}
        </li>
      ))}
    </ul>
  );
}

export function NoticesList({ rows = [] }) {
  if (!rows.length) return null;
  return (
    <ul className="mdd-list">
      {rows.map((n) => <li key={`${n.at}${n.title}`}><div><b>{n.title}</b><em>{fmtStamp(n.at)}</em><em>{n.text}</em></div></li>)}
    </ul>
  );
}

export { data as unwrap };
