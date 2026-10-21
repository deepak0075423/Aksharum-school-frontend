/**
 * /<slug>/visit — campus visits (Oct 2026). Anyone sees the open times and the
 * places left; a signed-in family books one for so many people, cancels it up
 * to the school's limit, and adds it to its calendar. Room is counted by the
 * server (services/admission/visits.js) — a full time is refused there.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { pub, portal as api, openProtected } from '../../../api/admission.api';
import { useLoad, Spin, ErrorBox, Panel, Btn, Chip, Note, Dialog, Field, Select, TextArea, Empty } from '../admUI';
import { fmtDate, fmtTime, fmtDateTime, errMsg } from '../meta';
import { usePortal, useApplicantHere } from './PortalShell';

const STATUS = { booked: ['Booked', 'green'], cancelled: ['Cancelled', 'gray'], attended: ['Visited', 'indigo'], no_show: ['Missed', 'amber'] };

export default function VisitsPage() {
  const portal = usePortal();
  const here = useApplicantHere();
  const { data, loading, error, reload } = useLoad(() => (here ? api.visits() : pub.visits(portal.slug)), [here, portal.slug]);
  const [booking, setBooking] = useState(null);
  const days = useMemo(() => {
    const m = new Map();
    for (const s of data?.slots || []) {
      const k = new Date(s.startsAt).toDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    }
    return [...m.values()];
  }, [data]);
  if (loading && !data) return <Spin />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const bookedSlots = new Set((data.mine || []).filter((b) => b.status === 'booked').map((b) => String(b.slotId)));
  const cancel = async (b) => {
    if (!window.confirm(`Cancel your visit on ${fmtDateTime(b.startsAt)}?`)) return;
    try { await api.cancelVisit(b._id); toast.success('Visit cancelled'); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const calendar = (b) => openProtected(api.visitCalUrl(b._id), { download: true, filename: 'school-visit.ics' }).catch((e) => toast.error(e.message));

  return (
    <div className="adm-page" style={{ maxWidth: 920, margin: '0 auto' }}>
      <div className="adm-head">
        <div>
          <div className="adm-head__eyebrow">Visit us</div>
          <h1>Visit {portal.data.school.name}</h1>
          <p>{data.intro || 'See the school for yourself — book a time that suits you.'}</p>
        </div>
      </div>
      {!data.enabled ? <Note tone="gray" icon="info">The school is not taking visit bookings online just now. Please contact the admission office.</Note> : null}
      {here && (data.mine || []).length ? (
        <Panel title="Your visits" icon="calendar">
          <div className="adm-doclist">
            {data.mine.map((b) => (
              <div key={b._id} className="adm-row adm-row--between">
                <div>
                  <strong>{b.title}</strong> <Chip tone={STATUS[b.status]?.[1]}>{STATUS[b.status]?.[0]}</Chip>
                  <div className="adm-muted" style={{ fontSize: '.84rem' }}>
                    {fmtDateTime(b.startsAt)} · {b.people} {b.people === 1 ? 'person' : 'people'}{b.location ? ` · ${b.location}` : ''}
                    {b.status === 'cancelled' && b.cancelledBy === 'school' ? ` — cancelled by the school${b.cancelReason ? `: ${b.cancelReason}` : ''}` : ''}
                  </div>
                </div>
                {b.status === 'booked' ? (
                  <div className="adm-row">
                    <Btn size="sm" icon="calendar" onClick={() => calendar(b)}>Add to calendar</Btn>
                    {b.canCancel ? <Btn size="sm" kind="ghost" onClick={() => cancel(b)}>Cancel</Btn> : <span className="adm-muted" style={{ fontSize: '.78rem' }}>Call the office to cancel</span>}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      {data.enabled ? (
        <Panel title="Open times" icon="calendarDays" sub={here ? `Up to ${data.maxPeople} people per booking. Cancel up to ${data.cancelUntilHours} hours before.` : null}>
          {!here ? (
            <Note tone="indigo" icon="lock" action={<Link to={`/${portal.slug}/login`} className="btn btn-primary btn-sm">Sign in to book</Link>}>
              Sign in (or create an account — it takes a minute) to book a visit.
            </Note>
          ) : null}
          {days.length ? days.map((list) => (
            <div key={list[0].startsAt} style={{ marginTop: 10 }}>
              <div className="adm-slotday">{fmtDate(list[0].startsAt)}</div>
              <div className="adm-slots">
                {list.map((s) => {
                  const mine = bookedSlots.has(String(s._id));
                  return (
                    <button key={s._id} type="button" className={`adm-slot ${mine ? 'is-mine' : ''}`} disabled={!here || s.left <= 0 || mine} onClick={() => setBooking(s)}
                      title={[s.title, s.location, s.notes].filter(Boolean).join(' — ')}>
                      <b>{fmtTime(s.startsAt)}</b>
                      <em>{mine ? 'Booked' : s.left <= 0 ? 'Full' : `${s.left} place${s.left === 1 ? '' : 's'}`} · {s.title}</em>
                    </button>
                  );
                })}
              </div>
            </div>
          )) : <Empty compact icon="calendar" title="No visit times are open just now">Please check again soon, or contact the admission office.</Empty>}
        </Panel>
      ) : null}
      {booking ? <BookDialog slot={booking} max={data.maxPeople} onClose={() => setBooking(null)} onDone={() => { setBooking(null); reload(); }} /> : null}
    </div>
  );
}

function BookDialog({ slot, max, onClose, onDone }) {
  const [people, setPeople] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api.bookVisit(slot._id, { people: Number(people), note: note.trim() }); toast.success('Visit booked — we have emailed you the details'); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const most = Math.min(max, slot.left);
  return (
    <Dialog open onClose={onClose} title={`Book: ${slot.title}`} width={480}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={go}>Book the visit</Btn></>}>
      <Note tone="indigo" icon="calendar">{fmtDateTime(slot.startsAt)} · {slot.durationMinutes} minutes{slot.location ? ` · ${slot.location}` : ''}</Note>
      {slot.notes ? <p className="adm-muted" style={{ fontSize: '.86rem' }}>{slot.notes}</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <Field label="How many people are coming" required>
          <Select value={people} onChange={(e) => setPeople(e.target.value)}>
            {Array.from({ length: most }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Field label="Anything the school should know" hint="Optional — a question, or help you need on the day">
          <TextArea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} data-text="sentence" />
        </Field>
      </div>
    </Dialog>
  );
}
