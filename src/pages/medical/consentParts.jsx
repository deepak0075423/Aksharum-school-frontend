/**
 * The parents' yearly medical consent (Oct 2026) — the form a parent signs in
 * the app and the medical staff fill from a signed paper form, and the summary
 * both read. The rules are the server's (services/medicalConsent).
 */
import React, { useEffect, useState } from 'react';
import { Btn, Dialog, Field, Note, Switch, Badge } from './mdUI';
import { fmtStamp, errorText } from './mdMeta';

export const CONSENT_STATUS = {
  given: { label: 'Given', tone: 'green' }, requested: { label: 'Asked, not answered', tone: 'amber' }, withdrawn: { label: 'Withdrawn', tone: 'red' },
};

/** What a consent says, line by line. */
export function ConsentSummary({ consent: c, year }) {
  if (!c || c.status !== 'given') {
    return <p className="md-muted" style={{ margin: 0 }}>{c?.status === 'withdrawn' ? `Withdrawn${c.withdrawReason ? ` — ${c.withdrawReason}` : ''}.` : `No consent for ${year?.yearName || 'this year'} yet.`}</p>;
  }
  return (
    <ul className="mdc-consent">
      <li className={c.emergencyTreatment ? 'is-yes' : 'is-no'}>{c.emergencyTreatment ? 'May arrange emergency treatment when the family cannot be reached' : 'No emergency treatment without the family'}</li>
      <li className={(c.otc || []).length ? 'is-yes' : 'is-no'}>{(c.otc || []).length ? `Everyday medicines: ${c.otc.join(', ')}` : 'No everyday medicines from the school'}</li>
      <li className={c.shareWithTeachers ? 'is-yes' : 'is-no'}>{c.shareWithTeachers ? 'Medical alerts shared with teachers' : 'Teachers see only the critical alerts'}</li>
      <li className={c.injuryPhotos ? 'is-yes' : 'is-no'}>{c.injuryPhotos ? 'Injury photos may be taken for the record' : 'No injury photos'}</li>
      {c.selfCarry ? <li className="is-yes">May carry their own rescue medicine</li> : null}
      <li className="mdc-consent__by">{c.onPaper ? 'Signed paper form' : 'Signed in the app'} by {c.signedName || c.givenByName}{c.givenAt ? `, ${fmtStamp(c.givenAt)}` : ''}</li>
    </ul>
  );
}

export const ConsentBadge = ({ consent }) => {
  const st = CONSENT_STATUS[consent?.status] || { label: 'Not answered', tone: 'amber' };
  return <Badge tone={st.tone} size="sm">{st.label}</Badge>;
};

/**
 * The form. `asParent`: a parent signs (types their name); otherwise the
 * medical staff record a signed paper form (the parent's name is required).
 */
export function ConsentDialog({ open, consent, year, categories = [], studentName, asParent, save, onClose, onSaved }) {
  const [v, setV] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    const c = consent?.status === 'given' ? consent : null;
    setV({
      emergencyTreatment: c ? !!c.emergencyTreatment : true, otc: c ? [...(c.otc || [])] : [...categories],
      shareWithTeachers: c ? c.shareWithTeachers !== false : true, injuryPhotos: c ? !!c.injuryPhotos : false, selfCarry: c ? !!c.selfCarry : false,
      note: c?.note || '', signedName: '',
    });
    setErr(''); setBusy(false);
  }, [open, consent, categories]);
  if (!open || !v.otc) return null;
  const toggle = (cat) => setV((x) => ({ ...x, otc: x.otc.includes(cat) ? x.otc.filter((y) => y !== cat) : [...x.otc, cat] }));
  const go = async () => {
    if (v.signedName.trim().length < 3) { setErr(asParent ? 'Type your full name to sign' : 'Give the name of the parent who signed the form'); return; }
    setBusy(true); setErr('');
    try { const r = await save(v); onSaved?.(r?.data ?? r); onClose(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title={`Medical consent ${year?.yearName ? `for ${year.yearName}` : ''} — ${studentName || ''}`} icon="shieldCheck" tone="indigo" width={640}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={go}>{asParent ? 'Sign and send' : 'Record the form'}</Btn></>}>
      {!asParent ? <Note tone="indigo" icon="info">Copy what the parent ticked on the signed paper form.</Note> : null}
      <Switch checked={v.emergencyTreatment} onChange={(x) => setV({ ...v, emergencyTreatment: x })} label="Emergency treatment"
        hint="If my child needs urgent medical care and I cannot be reached, the school may take them to hospital and doctors may treat them." />
      <Field label="Everyday medicines the Medical Room may give" hint="From the school's own stock, at the dose on the pack for the child's age — and you are told each time.">
        <div className="mdc-consent__cats">
          {categories.map((cat) => (
            <label key={cat} className="md-check"><input type="checkbox" checked={v.otc.includes(cat)} onChange={() => toggle(cat)} />{cat}</label>
          ))}
        </div>
      </Field>
      <Switch checked={v.shareWithTeachers} onChange={(x) => setV({ ...v, shareWithTeachers: x })} label="Share medical alerts with teachers"
        hint="Off: teachers see only the critical alerts — a severe allergy, an emergency care plan — which they need to keep your child safe." />
      <Switch checked={v.injuryPhotos} onChange={(x) => setV({ ...v, injuryPhotos: x })} label="Injury photos" hint="The Medical Room may photograph an injury for the record. Only the medical staff see it." />
      <Switch checked={v.selfCarry} onChange={(x) => setV({ ...v, selfCarry: x })} label="May carry their own rescue medicine" hint="A reliever inhaler or an adrenaline auto-injector, in their bag." />
      <Field label="Anything else" optional><input className="md-input" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={500} /></Field>
      <Field label={asParent ? 'Type your full name to sign' : 'Name of the parent who signed'} required>
        <input className="md-input" value={v.signedName} onChange={(e) => setV({ ...v, signedName: e.target.value })} maxLength={120} placeholder="e.g. Rahul Sharma" />
      </Field>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}
