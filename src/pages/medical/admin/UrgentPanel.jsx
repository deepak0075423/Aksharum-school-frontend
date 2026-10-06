/**
 * Families to reach (Oct 2026) — urgent news a parent has to answer: an
 * emergency, a child sent home, a hospital referral, a serious incident. Each
 * card says who is being tried now and when the call list moves on (the
 * parents are reminded in the app each time — the school sends no text
 * messages), gives a Call / WhatsApp button for every contact, and keeps the
 * call log; a parent's answer from the app ("on my way, 20 min") lands here.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Btn, Badge, Panel, Person, Ico, Dialog, Field, Chips, Note, ConfirmDialog } from '../mdUI';
import { fmtTime, since, telOf, studentLine, errorText } from '../mdMeta';

const RESULT = {
  answered: { label: 'Answered', tone: 'green' }, no_answer: { label: 'No answer', tone: 'amber' }, busy: { label: 'Busy', tone: 'amber' },
  left_message: { label: 'Left a message', tone: 'blue' }, wrong_number: { label: 'Wrong number', tone: 'red' },
  sent: { label: 'Sent', tone: 'blue' },
};
const CHANNEL = { app: 'App', whatsapp: 'WhatsApp', call: 'Call' };
const CALL_RESULTS = ['answered', 'no_answer', 'busy', 'left_message', 'wrong_number'];

/** The number WhatsApp wants: country code and digits, no plus (a 10-digit number is Indian). */
export const waOf = (p) => {
  const t = telOf(p);
  let d = t.replace(/\D/g, '');
  if (!d) return '';
  if (t.startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? `91${d}` : d;
};

const minutesTo = (d) => Math.max(0, Math.round((new Date(d).getTime() - Date.now()) / 60000));
const contactLine = (c) => `${c.name || 'Contact'}${c.relation ? ` (${c.relation})` : ''}`;

function StatusBadge({ n }) {
  if (n.status === 'escalated') return <Badge tone="red" size="sm" icon="alertTri">Nobody reached</Badge>;
  if (n.status === 'acknowledged') return <Badge tone="green" size="sm" icon="checkCircle">Answered</Badge>;
  return <Badge tone="amber" size="sm" icon="clock">Waiting {since(n.createdAt)}</Badge>;
}

function LogCall({ notice, onClose, onDone }) {
  const [contact, setContact] = useState('');
  const [other, setOther] = useState({ to: '', phone: '' });
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!notice) return;
    setContact(notice.contacts?.[notice.step || 0]?.key || notice.contacts?.[0]?.key || 'other');
    setOther({ to: '', phone: '' }); setResult(''); setNote(''); setErr(''); setBusy(false);
  }, [notice]);
  if (!notice) return null;
  const save = async () => {
    if (!result) { setErr('Say how the call went'); return; }
    if (contact === 'other' && !other.to.trim()) { setErr('Who did you call?'); return; }
    setBusy(true); setErr('');
    try {
      await api.logUrgentAttempt(notice._id, { contact: contact === 'other' ? undefined : contact, to: other.to, phone: other.phone, result, note, channel: 'call' });
      toast.success(result === 'answered' ? 'Family reached — the call list has stopped' : 'Call logged');
      onDone();
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title={`Log a call — ${notice.studentName}`} icon="phone" tone="indigo" width={520}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save</Btn></>}>
      <Field label="Who did you call?" required>
        <select className="md-input" value={contact} onChange={(e) => setContact(e.target.value)}>
          {(notice.contacts || []).map((c) => <option key={c.key} value={c.key}>{contactLine(c)} — {c.phone}</option>)}
          <option value="other">Someone else</option>
        </select>
      </Field>
      {contact === 'other' ? (
        <div className="md-form__grid">
          <Field label="Name and relation" required><input className="md-input" value={other.to} onChange={(e) => setOther((o) => ({ ...o, to: e.target.value }))} maxLength={120} placeholder="e.g. Grandmother" /></Field>
          <Field label="Number" optional><input className="md-input" value={other.phone} onChange={(e) => setOther((o) => ({ ...o, phone: e.target.value }))} maxLength={30} /></Field>
        </div>
      ) : null}
      <Field label="How did it go?" required>
        <Chips options={CALL_RESULTS.map((k) => ({ value: k, label: RESULT[k].label }))} value={result} onPick={setResult} />
      </Field>
      <Field label="Note" optional hint={result === 'answered' ? 'What they said — e.g. "Father coming, 20 minutes".' : ''}>
        <textarea className="md-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

function NoticeCard({ n, onLog, onClose, onOpenVisit }) {
  const [all, setAll] = useState(false);
  const attempts = [...(n.attempts || [])].reverse();
  const shown = all ? attempts : attempts.slice(0, 3);
  const trying = n.contacts?.[n.step || 0];
  const message = `${n.title}. Please call the school.`;
  return (
    <article className={`mdr-card mdu-card is-${n.status}`}>
      <div className="mdr-card__top">
        <Person name={n.studentName} photo={n.studentPhoto} size={40} sub={studentLine(n)} />
        <StatusBadge n={n} />
      </div>
      <div className="mdr-card__reason"><b>{n.kindLabel}</b>{n.body ? ` · ${n.body}` : ''}</div>
      {n.status === 'acknowledged' ? (
        <div className="mdu-answer">
          <Ico name="checkCircle" size={15} />
          <span><b>{n.ackByName}</b> answered at {fmtTime(n.ackAt)}
            {n.ackEtaMinutes != null ? <> · arriving in about {n.ackEtaMinutes} min (by {fmtTime(new Date(new Date(n.ackAt).getTime() + n.ackEtaMinutes * 60000))})</> : null}
            {n.ackNote ? <> — “{n.ackNote}”</> : null}</span>
        </div>
      ) : n.status === 'open' && trying ? (
        <div className="mdu-next"><Ico name="hourglass" size={14} />Trying {contactLine(trying)} — {n.step + 1 < (n.contacts || []).length ? `the next contact in ${minutesTo(n.nextEscalationAt)} min` : 'the last contact on the list'}</div>
      ) : n.status === 'escalated' ? (
        <div className="mdu-next is-red"><Ico name="alertTri" size={14} />Every contact on record has been tried. Decide what happens next.</div>
      ) : !(n.contacts || []).length ? (
        <div className="mdu-next is-red"><Ico name="alertTri" size={14} />There is no phone number on the student's record.</div>
      ) : null}
      {(n.contacts || []).length ? (
        <ul className="mdu-contacts">
          {n.contacts.map((c, i) => (
            <li key={c.key} className={n.status === 'open' && i === (n.step || 0) ? 'is-now' : ''}>
              <span className="mdu-contacts__who"><b>{contactLine(c)}</b><em>{c.phone}</em></span>
              <span className="mdu-contacts__acts">
                <Btn size="xs" as="a" href={`tel:${telOf(c.phone)}`} icon="phone">Call</Btn>
                {waOf(c.phone) ? <Btn size="xs" as="a" href={`https://wa.me/${waOf(c.phone)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">WhatsApp</Btn> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <ol className="mdu-log" aria-label="What has been tried">
        {shown.map((a, i) => (
          <li key={`${a.at}-${i}`}>
            <span className="mdu-log__when">{fmtTime(a.at)}</span>
            <span className="mdu-log__what">{CHANNEL[a.channel] || a.channel} · {a.to}{a.byName && a.channel === 'call' ? ` · by ${a.byName}` : ''}{a.note ? ` — ${a.note}` : ''}</span>
            <Badge tone={RESULT[a.result]?.tone || 'slate'} size="sm" dot={false}>{RESULT[a.result]?.label || a.result}</Badge>
          </li>
        ))}
        {attempts.length > 3 ? <li><button type="button" className="md-link" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${attempts.length}`}</button></li> : null}
      </ol>
      <div className="mdr-card__acts">
        <Btn size="sm" kind="primary" icon="phone" onClick={() => onLog(n)}>Log a call</Btn>
        {n.visit ? <Btn size="sm" onClick={() => onOpenVisit(n.visit)}>Open visit</Btn> : null}
        <Btn size="sm" onClick={() => onClose(n)}>Close</Btn>
      </div>
    </article>
  );
}

/** The panel; renders nothing when there is nobody to reach. */
export default function UrgentPanel({ data, reload, onOpenVisit }) {
  const [logging, setLogging] = useState(null);
  const [closing, setClosing] = useState(null);
  const items = data?.items || [];
  if (!items.length && !logging && !closing) return null;
  const waiting = items.filter((n) => n.status !== 'acknowledged').length;
  return (
    <>
      {items.length ? (
        <Panel title="Families to reach" icon="phone" tone={items.some((n) => n.status === 'escalated') ? 'red' : 'orange'} pad
          sub={waiting ? `${waiting} waiting for an answer — the call list moves on by itself` : 'Everyone has answered'}>
          <div className="mdr-cards">
            {items.map((n) => <NoticeCard key={n._id} n={n} onLog={setLogging} onClose={setClosing} onOpenVisit={onOpenVisit} />)}
          </div>
        </Panel>
      ) : null}
      {logging ? <LogCall notice={logging} onClose={() => setLogging(null)} onDone={() => { setLogging(null); reload(); }} /> : null}
      <ConfirmDialog open={!!closing} onClose={() => setClosing(null)} title={`Close — ${closing?.studentName || ''}`} icon="checkCircle" tone="indigo"
        message="Nobody will be chased any more about this. The call log stays on the record." confirmLabel="Close it"
        reason reasonLabel="What happened" reasonPlaceholder='e.g. "Spoke to the father, he is collecting at 1 pm"'
        onConfirm={async (note) => { await api.closeUrgentNotice(closing._id, { note }).catch((e) => { throw new Error(errorText(e)); }); toast.success('Closed'); setClosing(null); reload(); }} />
    </>
  );
}
