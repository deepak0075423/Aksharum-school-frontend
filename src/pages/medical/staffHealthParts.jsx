/**
 * A member of staff's own health record (Oct 2026) — shown and edited the same
 * way by the person themselves (the teacher's "My Health") and by the medical
 * staff (Staff Health): blood group, allergies, conditions, medicines, the
 * person to call, their doctor.
 */
import React, { useEffect, useState } from 'react';
import { Btn, IconBtn, Dialog, Field, Note, KV, Badge, Ico } from './mdUI';
import { BLOOD_GROUPS, telOf, errorText } from './mdMeta';
import PhoneInput from '../../components/ui/PhoneInput';
import { phoneError } from '../../utils/validators';

const SEVERITY = { mild: 'Mild', moderate: 'Moderate', severe: 'Severe', life_threatening: 'Life-threatening' };
const SEV_TONE = { mild: 'green', moderate: 'amber', severe: 'red', life_threatening: 'red' };

export function StaffRecordView({ health = {}, emptyHint }) {
  const h = health || {};
  const ec = h.emergencyContact || {};
  const doc = h.doctor || {};
  const has = h.bloodGroup || (h.allergies || []).length || (h.conditions || []).length || h.medications || ec.name || doc.name || h.notes;
  if (!has) return <p className="md-muted" style={{ margin: 0 }}>{emptyHint || 'Nothing recorded yet.'}</p>;
  return (
    <div className="mdsh-view">
      {(h.allergies || []).length ? (
        <div className="mdsh-chips">
          {h.allergies.map((a, i) => <Badge key={i} tone={SEV_TONE[a.severity] || 'amber'} icon="alertTri">{a.allergen} · {SEVERITY[a.severity] || a.severity}{a.reaction ? ` — ${a.reaction}` : ''}</Badge>)}
        </div>
      ) : null}
      <KV cols={2} items={[
        ['Blood group', h.bloodGroup || '—'],
        ['Conditions', (h.conditions || []).map((c) => `${c.condition}${c.notes ? ` (${c.notes})` : ''}`).join('; ') || '—'],
        ['Medicines taken', h.medications || '—'],
        ['Person to call', ec.name ? <>{ec.name}{ec.relation ? ` (${ec.relation})` : ''}{ec.phone ? <> · <a href={`tel:${telOf(ec.phone)}`}>{ec.phone}</a></> : null}</> : '—'],
        ['Doctor', doc.name ? <>{doc.name}{doc.phone ? <> · <a href={`tel:${telOf(doc.phone)}`}>{doc.phone}</a></> : null}</> : '—'],
        ['Notes', h.notes || '—'],
      ]} />
      {h.updatedByName ? <p className="md-muted" style={{ margin: '6px 0 0', fontSize: '.78rem' }}><Ico name="pencil" size={12} /> Last updated by {h.updatedByName}</p> : null}
    </div>
  );
}

/** The edit form; `save(body)` returns a promise. */
export function StaffRecordDialog({ open, health, title, intro, onClose, save, onSaved }) {
  const [v, setV] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    const h = health || {};
    setV({
      bloodGroup: h.bloodGroup || '', allergies: (h.allergies || []).map((a) => ({ ...a })), conditions: (h.conditions || []).map((c) => ({ ...c })),
      medications: h.medications || '', emergencyContact: { ...(h.emergencyContact || {}) }, doctor: { ...(h.doctor || {}) }, notes: h.notes || '',
    });
    setErr(''); setBusy(false);
  }, [open, health]);
  // The fields are filled by the effect above, a render after opening.
  if (!open || !v.allergies) return null;
  const list = (k, blank) => ({
    add: () => setV((x) => ({ ...x, [k]: [...x[k], { ...blank }] })),
    set: (i, patchIn) => setV((x) => ({ ...x, [k]: x[k].map((r, j) => (j === i ? { ...r, ...patchIn } : r)) })),
    remove: (i) => setV((x) => ({ ...x, [k]: x[k].filter((_, j) => j !== i) })),
  });
  const al = list('allergies', { allergen: '', severity: 'moderate', reaction: '' });
  const co = list('conditions', { condition: '', notes: '' });
  const go = async () => {
    const badPhone = phoneError(v.emergencyContact.phone, 'Their phone') || phoneError(v.doctor.phone, "The doctor's phone");
    if (badPhone) { setErr(badPhone); return; }
    setBusy(true); setErr('');
    try { const r = await save(v); onSaved?.(r?.data ?? r); onClose(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title={title} icon="heartPulse" tone="rose" width={720}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={go}>Save</Btn></>}>
      {intro ? <Note tone="indigo" icon="lock">{intro}</Note> : null}
      <div className="md-form__grid">
        <Field label="Blood group">
          <select className="md-input" value={v.bloodGroup} onChange={(e) => setV({ ...v, bloodGroup: e.target.value })}>
            <option value="">Not known</option>
            {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="Medicines taken regularly"><input className="md-input" value={v.medications} onChange={(e) => setV({ ...v, medications: e.target.value })} maxLength={600} /></Field>
      </div>
      <Field label="Allergies">
        <div className="mdsh-rows">
          {v.allergies.map((a, i) => (
            <div key={i} className="mdsh-row">
              <input className="md-input" value={a.allergen} onChange={(e) => al.set(i, { allergen: e.target.value })} placeholder="e.g. Penicillin" maxLength={80} aria-label="Allergy" />
              <select className="md-input" value={a.severity} onChange={(e) => al.set(i, { severity: e.target.value })} aria-label="Severity">
                {Object.entries(SEVERITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input className="md-input" value={a.reaction} onChange={(e) => al.set(i, { reaction: e.target.value })} placeholder="Reaction" maxLength={200} aria-label="Reaction" />
              <IconBtn icon="close" label="Remove this allergy" onClick={() => al.remove(i)} />
            </div>
          ))}
          <Btn size="sm" kind="tint" icon="plus" onClick={al.add}>Add an allergy</Btn>
        </div>
      </Field>
      <Field label="Conditions">
        <div className="mdsh-rows">
          {v.conditions.map((c, i) => (
            <div key={i} className="mdsh-row is-two">
              <input className="md-input" value={c.condition} onChange={(e) => co.set(i, { condition: e.target.value })} placeholder="e.g. Asthma" maxLength={120} aria-label="Condition" />
              <input className="md-input" value={c.notes} onChange={(e) => co.set(i, { notes: e.target.value })} placeholder="What helps, what to do" maxLength={300} aria-label="Notes" />
              <IconBtn icon="close" label="Remove this condition" onClick={() => co.remove(i)} />
            </div>
          ))}
          <Btn size="sm" kind="tint" icon="plus" onClick={co.add}>Add a condition</Btn>
        </div>
      </Field>
      <div className="md-form__grid md-form__grid--3">
        <Field label="Person to call"><input data-text="name" className="md-input" value={v.emergencyContact.name || ''} onChange={(e) => setV({ ...v, emergencyContact: { ...v.emergencyContact, name: e.target.value } })} maxLength={120} /></Field>
        <Field label="Relation"><input className="md-input" value={v.emergencyContact.relation || ''} onChange={(e) => setV({ ...v, emergencyContact: { ...v.emergencyContact, relation: e.target.value } })} maxLength={60} /></Field>
        <Field label="Their phone"><PhoneInput className="md-input" value={v.emergencyContact.phone || ''} onChange={(e) => setV({ ...v, emergencyContact: { ...v.emergencyContact, phone: e.target.value } })} /></Field>
        <Field label="Doctor"><input data-text="name" className="md-input" value={v.doctor.name || ''} onChange={(e) => setV({ ...v, doctor: { ...v.doctor, name: e.target.value } })} maxLength={120} /></Field>
        <Field label="Doctor's phone"><PhoneInput className="md-input" value={v.doctor.phone || ''} onChange={(e) => setV({ ...v, doctor: { ...v.doctor, phone: e.target.value } })} /></Field>
      </div>
      <Field label="Anything else the Medical Room should know"><textarea className="md-textarea" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={600} /></Field>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}
