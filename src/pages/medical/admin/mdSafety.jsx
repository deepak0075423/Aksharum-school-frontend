/**
 * Before a medicine is given (Oct 2026) — the screen half of the server's
 * safety check (services/medicalSafety): an allergy on the record, the gap
 * since the last dose of the same medicine, its most in 24 hours.
 *
 *   <DoseCheck studentId item plan medicineName />
 *        what the check says as the medicine is chosen — the stop, the
 *        caution and the doses given lately — before anyone presses Give
 *
 *   withSafety((override) => api.giveDose({ ...body, override }))
 *        sends; when the server stops the dose (MEDICAL_SAFETY), asks why it
 *        should go ahead and sends again with the reason; when a controlled
 *        medicine needs a witness (MEDICAL_WITNESS_REQUIRED), asks who.
 *        Without an answer nothing is given.
 *
 *   <SafetyHost />   the one dialog withSafety asks through — rendered by useMedWorkspace
 */
import React, { useEffect, useState } from 'react';
import * as api from '../../../api/medical.api';
import { Dialog, Btn, Field, Note, Ico, useDebounced } from '../mdUI';
import { StudentPicker } from '../mdForm';
import { fmtTime, ago } from '../mdMeta';

/* ── The prompt ───────────────────────────────────────────────────────────── */

let ask = null;   // set by the mounted <SafetyHost />

/**
 * send(override) → the request. Resolves with what it returns; rejects with
 * "Not given …" when the person decides not to go ahead.
 */
export async function withSafety(send) {
  // One override grows as the server asks: a reason past a safety check, then
  // a witness for a controlled medicine (MEDICAL_WITNESS_REQUIRED).
  let override;
  for (let round = 0; round < 3; round += 1) {
    try {
      return await send(override);
    } catch (e) {
      const d = e?.data;
      if (!ask) throw e;
      if (d?.code === 'MEDICAL_SAFETY') {
        const reason = await new Promise((resolve) => ask({ problems: d.problems || [], warnings: d.warnings || [], recent: d.recent || [], resolve }));
        if (!reason) throw new Error('Not given — the safety check stopped it');
        override = { ...(override || {}), reason };
      } else if (d?.code === 'MEDICAL_WITNESS_REQUIRED') {
        const witness = await new Promise((resolve) => ask({ witness: true, message: d.message, resolve }));
        if (!witness) throw new Error('Not given — a controlled medicine needs a witness');
        override = { ...(override || {}), witness };
      } else throw e;
    }
  }
  return send(override);
}

const findStaff = (q) => api.searchStaffPatients(q).then((r) => (r?.data ?? r ?? []).map((s) => ({ ...s, classLabel: s.designation || (s.role === 'school_admin' ? 'School admin' : 'Teacher') })));

/** A controlled medicine: the second member of staff who watches it given. */
function WitnessPrompt({ st, finish }) {
  const [who, setWho] = useState(null);
  return (
    <Dialog open onClose={() => finish(null)} title="A witness is needed" icon="users" tone="amber" width={520}
      footer={<><Btn onClick={() => finish(null)}>Don&rsquo;t give it</Btn><Btn kind="primary" disabled={!who?._id} onClick={() => finish(who._id)}>Witnessed — give it</Btn></>}>
      <Note tone="amber" icon="info">{st.message}. The witness is recorded with the dose.</Note>
      <Field label="Who is watching?" required>
        <StudentPicker value={who} onChange={setWho} fetcher={findStaff} placeholder="Search staff by name" autoFocus />
      </Field>
    </Dialog>
  );
}

export function SafetyHost() {
  const [st, setSt] = useState(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    ask = (x) => { setReason(''); setSt(x); };
    return () => { ask = null; };
  }, []);
  if (!st) return null;
  const finish = (r) => { st.resolve(r); setSt(null); };
  if (st.witness) return <WitnessPrompt st={st} finish={finish} />;
  const allergy = st.problems.some((p) => p.code === 'allergy');
  return (
    <Dialog open onClose={() => finish(null)} title="Stop — check before giving this" icon="alertTri" tone="red" width={560}
      footer={<>
        <Btn onClick={() => finish(null)}>Don&rsquo;t give it</Btn>
        <Btn kind="danger-solid" disabled={reason.trim().length < 5} onClick={() => finish(reason.trim())}>Give anyway</Btn>
      </>}>
      <ul className="md-safety__list">
        {st.problems.map((p, i) => <li key={i} className="is-stop"><Ico name="alert" size={15} /><span>{p.message}</span></li>)}
        {st.warnings.map((w, i) => <li key={`w${i}`} className="is-caution"><Ico name="info" size={15} /><span>{w.message}</span></li>)}
      </ul>
      {st.recent.length ? (
        <p className="md-safety__recent">Given in the last 24 hours: {st.recent.map((r) => `${r.name} at ${fmtTime(r.at)}`).join(', ')}</p>
      ) : null}
      <Field label="Why it is safe to give it now" required hint={allergy
        ? 'Name who confirmed it — e.g. "Dr Rao checked: the penicillin entry was a rash in infancy". The medical staff are told.'
        : 'e.g. "Prescribed dose is every 3 hours — doctor\'s note on file". It is kept with the dose and in the audit log.'}>
        <textarea className="md-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
      </Field>
    </Dialog>
  );
}

/* ── The check, as the medicine is chosen ─────────────────────────────────── */

export function DoseCheck({ studentId, item, plan, medicineName, compact }) {
  const [res, setRes] = useState(null);
  const name = useDebounced(medicineName || '', 400);
  useEffect(() => {
    if (!studentId || (!item && !plan && !name.trim())) { setRes(null); return undefined; }
    let alive = true;
    api.checkDoseSafety({ student: studentId, item: item || undefined, plan: plan || undefined, medicineName: name || undefined })
      .then((r) => alive && setRes(r?.data ?? r)).catch(() => alive && setRes(null));
    return () => { alive = false; };
  }, [studentId, item, plan, name]);
  if (!res) return null;
  const { blocks = [], warnings = [], recent = [], limits = {} } = res;
  if (!blocks.length && !warnings.length && !recent.length && compact) return null;
  return (
    <div className={`md-safety${compact ? ' is-compact' : ''}`}>
      {blocks.map((b, i) => <Note key={i} tone="red" icon="alert"><b>Stop:</b> {b.message}</Note>)}
      {warnings.map((w, i) => <Note key={`w${i}`} tone="amber" icon="info">{w.message}</Note>)}
      {recent.length && !blocks.length ? (
        <p className="md-safety__recent"><Ico name="history" size={13} /> Last given {ago(recent[0].at)} ({fmtTime(recent[0].at)}{recent[0].by ? `, ${recent[0].by}` : ''}){recent.length > 1 ? ` · ${recent.length} times in 24 h` : ''}</p>
      ) : null}
      {!compact && (limits.minHours || limits.maxPerDay) ? (
        <p className="md-safety__limits">{[limits.minHours ? `At least ${limits.minHours} h between doses` : '', limits.maxPerDay ? `at most ${limits.maxPerDay} in 24 hours` : ''].filter(Boolean).join(' · ')}</p>
      ) : null}
    </div>
  );
}
