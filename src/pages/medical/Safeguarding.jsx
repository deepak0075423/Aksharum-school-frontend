/**
 * Safeguarding (Oct 2026) — one screen for every member of staff.
 *
 * Anyone raises a concern about a child's welfare: what they saw or were told,
 * in the words used, and what they did. They then see only that it is being
 * dealt with. The designated leads (named by the school admin; the school's
 * admins when none are) also see the log: every concern, the notes, the
 * referral, the status — and nothing of it appears anywhere else in the app.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../api/medical.api';
import { Panel, Btn, Badge, Dialog, Field, Switch, Note, Empty, Spin, LoadError, LineTabs, Segmented, useLoad } from './mdUI';
import { StudentPicker } from './mdForm';
import { BodyMap } from './admin/mdCare';
import { fmtStamp, stampInput, errorText } from './mdMeta';

const TONE = { open: 'red', monitoring: 'amber', referred: 'blue', closed: 'slate' };

function RaiseDialog({ me, role, onClose, onDone }) {
  const [v, setV] = useState({ student: null, category: 'disclosure', urgent: false, description: '', observedAt: stampInput(), location: '', actionTaken: '', injuries: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const find = role === 'teacher' ? (q) => api.findTeacherStudents(q, false) : (q) => api.findMedStudents(q);
  const go = async () => {
    if (!v.student?._id) { setErr('Choose the student'); return; }
    if (v.description.trim().length < 15) { setErr('Write down what you saw or were told, in the words used'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.raiseConcern({ ...v, student: v.student._id, observedAt: v.observedAt ? new Date(v.observedAt).toISOString() : undefined, injuries: v.injuries.map(({ id, ...x }) => x) });
      onDone(r?.data ?? r);
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title="Raise a safeguarding concern" icon="shieldCheck" tone="red" width={760}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="danger-solid" busy={busy} onClick={go}>Raise the concern</Btn></>}>
      <Note tone="indigo" icon="lock">Only the safeguarding {me.leads.length === 1 ? 'lead' : 'leads'} ({me.leads.join(', ') || 'the school admins'}) will read this. Write what you saw or were told in the words used; do not investigate yourself. If the child is in danger now, call 112 — or Childline on 1098.</Note>
      <div className="md-form__grid">
        <Field label="The student" required><StudentPicker value={v.student} onChange={(s) => setV({ ...v, student: s })} fetcher={find} autoFocus /></Field>
        <Field label="What kind of concern">
          <select className="md-input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
            {Object.entries(me.categories).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Switch checked={v.urgent} onChange={(x) => setV({ ...v, urgent: x })} label="The child may be in danger now" hint="The leads are told at once, as urgent." />
      <Field label="What you saw or were told" required hint="In the words used. Facts, not opinions.">
        <textarea className="md-textarea" rows={5} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={4000} />
      </Field>
      <div className="md-form__grid">
        <Field label="When"><input className="md-input" type="datetime-local" value={v.observedAt} onChange={(e) => setV({ ...v, observedAt: e.target.value })} /></Field>
        <Field label="Where"><input className="md-input" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} maxLength={200} placeholder="e.g. Art room" /></Field>
      </div>
      <Field label="What you did" hint="e.g. Listened, did not ask leading questions, told the child I must pass it on.">
        <textarea className="md-textarea" rows={2} value={v.actionTaken} onChange={(e) => setV({ ...v, actionTaken: e.target.value })} maxLength={1500} />
      </Field>
      <Field label="Marks you saw" optional>
        <BodyMap value={v.injuries} onChange={(x) => setV({ ...v, injuries: x })} lib={{ regions: me.regions, injuryKinds: me.injuryKinds }} />
      </Field>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

function ConcernDialog({ id, me, onClose, onChanged }) {
  const c = useLoad(() => api.getConcern(id), id);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [referTo, setReferTo] = useState('childline');
  const [reference, setReference] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const d = c.data;
  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); c.reload(); onChanged(); setNote(''); setStatus(''); setWhy(''); setReference(''); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={d ? `${d.number} — ${d.student?.name || ''}` : 'Concern'} icon="shieldCheck" tone="red" width={820}
      footer={<Btn onClick={onClose}>Close</Btn>}>
      {c.loading && !d ? <Spin /> : c.error && !d ? <LoadError error={c.error} onRetry={c.reload} /> : (
        <div className="mdsg">
          <div className="mdpl-figs">
            <Badge tone={TONE[d.status]} size="sm">{d.statusLabel}</Badge>
            {d.urgent ? <Badge tone="red" size="sm" icon="siren">Urgent</Badge> : null}
            <span>{d.categoryLabel}</span>
            <span>{d.student?.classLabel}</span>
            <span>Raised by <b>{d.raisedByName}</b>, {fmtStamp(d.raisedAt)}</span>
          </div>
          <h4 className="mdp-h">What was seen or said</h4>
          <blockquote className="mdsg-quote">{d.description}</blockquote>
          <p className="md-muted" style={{ margin: 0 }}>{[d.observedAt && `When: ${fmtStamp(d.observedAt)}`, d.location && `Where: ${d.location}`].filter(Boolean).join(' · ')}</p>
          {d.actionTaken ? <><h4 className="mdp-h">What they did</h4><p style={{ margin: 0 }}>{d.actionTaken}</p></> : null}
          {(d.injuries || []).length ? <><h4 className="mdp-h">Marks seen</h4><BodyMap value={d.injuries} onChange={() => {}} lib={{ regions: me.regions, injuryKinds: me.injuryKinds }} readOnly /></> : null}
          {d.referral ? <Note tone="blue" icon="info">Referred to {d.referral.toLabel}{d.referral.reference ? ` (ref ${d.referral.reference})` : ''} by {d.referral.byName}, {fmtStamp(d.referral.at)}{d.referral.note ? ` — ${d.referral.note}` : ''}</Note> : null}
          <h4 className="mdp-h">Notes</h4>
          {(d.notes || []).length ? (
            <ul className="mdd-list">{d.notes.map((n, i) => <li key={i}><div><b>{n.byName}</b><em>{fmtStamp(n.at)}</em><span className="mdsg-note">{n.text}</span></div></li>)}</ul>
          ) : <p className="md-muted" style={{ margin: 0 }}>No notes yet.</p>}
          <Field label="Add a note"><textarea className="md-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={3000} /></Field>
          <div><Btn size="sm" kind="primary" busy={busy} disabled={!note.trim()} onClick={() => act(() => api.addConcernNote(id, note), 'Note added')}>Add note</Btn></div>
          <h4 className="mdp-h">Where it stands</h4>
          <Segmented value={status || d.status} onChange={setStatus} label="Status" options={Object.entries(me.statuses).map(([value, label]) => ({ value, label }))} />
          {status === 'referred' ? (
            <div className="md-form__grid">
              <Field label="Referred to"><select className="md-input" value={referTo} onChange={(e) => setReferTo(e.target.value)}>{Object.entries(me.referTo).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Reference" optional><input className="md-input" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} /></Field>
            </div>
          ) : null}
          {status && status !== d.status ? (
            <>
              <Field label={status === 'closed' ? 'Why it is closed' : 'Note'} required={status === 'closed'}><input className="md-input" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={1000} /></Field>
              <div><Btn size="sm" kind="primary" busy={busy} onClick={() => act(() => api.setConcernStatus(id, { status, referTo, reference, note: why }), 'Updated')}>Save</Btn></div>
            </>
          ) : null}
          {(d.earlier || []).length ? (
            <>
              <h4 className="mdp-h">Earlier concerns about this child</h4>
              <ul className="mdd-list">{d.earlier.map((e) => <li key={e._id}><div><b>{e.number} · {e.categoryLabel}</b><em>{fmtStamp(e.raisedAt)}</em></div><Badge tone={TONE[e.status]} size="sm">{e.statusLabel}</Badge></li>)}</ul>
            </>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

/** `role`: 'teacher' or 'staff' (the admin pages) — which student search to use. */
export default function Safeguarding({ role = 'staff' }) {
  const me = useLoad(() => api.getSafeguardingMe(), 'sg-me');
  const mine = useLoad(() => api.getMyConcerns(), 'sg-mine');
  const [tab, setTab] = useState('active');
  const lead = !!me.data?.isLead;
  const log = useLoad(() => (lead ? api.getSafeguardingLog({ status: tab }) : Promise.resolve(null)), `sg-log:${lead}:${tab}`);
  const [raising, setRaising] = useState(false);
  const [open, setOpen] = useState(null);
  if (me.error && !me.data) return <LoadError error={me.error} onRetry={me.reload} />;
  if (!me.data) return <Spin />;
  const m = me.data;
  return (
    <>
      <Panel title="Safeguarding" icon="shieldCheck" tone="red" pad
        sub={`Concerns about a child's welfare go to ${m.leads.length === 1 ? 'the safeguarding lead' : 'the safeguarding leads'}: ${m.leads.join(', ') || 'the school admins'}.`}
        right={<Btn kind="danger-solid" icon="plus" onClick={() => setRaising(true)}>Raise a concern</Btn>}>
        <h4 className="mdp-h">Concerns you raised</h4>
        {(mine.data || []).length ? (
          <ul className="mdd-list">{mine.data.map((c) => <li key={c._id}><div><b>{c.number} · {c.studentName}</b><em>{c.categoryLabel} · {fmtStamp(c.raisedAt)}</em></div><Badge tone={TONE[c.status]} size="sm">{c.statusLabel}</Badge></li>)}</ul>
        ) : <p className="md-muted" style={{ margin: 0 }}>None.</p>}
      </Panel>
      {lead ? (
        <Panel pad={false}>
          <div className="md-listhead"><LineTabs items={[{ key: 'active', label: 'Open', count: log.data?.counts?.active }, { key: 'referred', label: 'Referred', count: log.data?.counts?.referred }, { key: 'closed', label: 'Closed' }, { key: 'all', label: 'All', count: log.data?.counts?.all }]} value={tab} onChange={setTab} /></div>
          <div className="md-panel__body">
            {log.loading && !log.data ? <Spin /> : (log.data?.rows || []).length ? (
              <ul className="mdd-list">
                {log.data.rows.map((c) => (
                  <li key={c._id} className="is-click" onClick={() => setOpen(c._id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(c._id); }} role="button" tabIndex={0}>
                    <div><b>{c.number} · {c.studentName}</b><em>{[c.classLabel, c.categoryLabel, `raised by ${c.raisedByName}`, fmtStamp(c.raisedAt), c.noteCount ? `${c.noteCount} note${c.noteCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</em></div>
                    {c.urgent ? <Badge tone="red" size="sm" icon="siren">Urgent</Badge> : null}
                    <Badge tone={TONE[c.status]} size="sm">{c.statusLabel}</Badge>
                  </li>
                ))}
              </ul>
            ) : <Empty compact title="Nothing here">Concerns raised by staff appear here, for the safeguarding leads only.</Empty>}
          </div>
        </Panel>
      ) : null}
      {raising ? <RaiseDialog me={m} role={role} onClose={() => setRaising(false)} onDone={(r) => { setRaising(false); toast.success(`${r.number} raised — the safeguarding lead has been told`); mine.reload(); log.reload(); }} /> : null}
      {open ? <ConcernDialog id={open} me={m} onClose={() => setOpen(null)} onChanged={() => { log.reload(); mine.reload(); }} /> : null}
    </>
  );
}
