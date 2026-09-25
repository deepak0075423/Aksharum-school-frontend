/**
 * The pieces the transport PORTAL screens share.
 *
 * The seventeen admin screens were rebuilt on the `tr-` kit in September; these
 * screens were not, and still carried emoji headings and inline styles from the
 * original build. They are rebuilt on the same kit, so the module looks like one
 * product whichever door you come in by — the difference between a rider's
 * screen and the office's is what it says, not how it is drawn.
 *
 * Only what more than one portal screen needs lives here. Anything used once
 * stays on its own page.
 */
import React from 'react';
import {
  Card, CardHead, CardBody, Panel, Badge, Mark, Ico, Avatar, Empty, Note, Btn,
  Facts, Fact, Rows, Field, Select, Textarea, Modal, fmtTime, fmtDate, ago, money, words,
} from '../admin/trUI';

/* ── Words and colours the portal shares ──────────────────────────────────── */

export const BOARD_TONE = {
  pending: 'slate', boarded: 'green', dropped: 'blue', absent: 'red', no_show: 'red',
};
export const BOARD_WORD = {
  pending: 'Not boarded yet', boarded: 'On board', dropped: 'Dropped off',
  absent: 'Marked absent', no_show: 'Did not board',
};
export const TRIP_TONE = {
  scheduled: 'slate', started: 'green', paused: 'amber', completed: 'blue', cancelled: 'red',
};
export const INVOICE_TONE = {
  pending: 'amber', partial: 'blue', paid: 'green', overdue: 'red', cancelled: 'slate',
};
/** A direction said as a person would say it. */
export const runWord = (shift, direction) =>
  `${shift === 'evening' ? 'Afternoon' : 'Morning'} ${direction === 'drop' ? 'drop' : 'pickup'}`;

/* ── The bus, said once ───────────────────────────────────────────────────── */

/**
 * Which bus, which route, and who is on it — the card every rider screen opens
 * with, because it is the answer to the question they came to ask.
 */
export const BusCard = ({ route, seat, pickup, drop, status, title = 'My bus' }) => (
  <Card>
    <CardHead icon="bus" iconTone="blue" title={title}
              sub={route ? `${route.name}${route.routeCode ? ` · ${route.routeCode}` : ''}` : undefined}
              right={status ? <Badge tone={status === 'active' ? 'green' : 'amber'} dot={status === 'active' ? 'green' : 'amber'}>
                {words(status)}
              </Badge> : null} />
    <CardBody>
      <Facts>
        <Fact k="Bus" v={route?.vehicle?.vehicleNumber || '—'} />
        <Fact k="Model" v={route?.vehicle?.busName || '—'} />
        <Fact k="Pickup stop" v={pickup || <em className="tr-unset">Not set by the office</em>} />
        <Fact k="Drop stop" v={drop || <em className="tr-unset">Not set by the office</em>} />
        {seat ? <Fact k="Seat" v={seat} /> : null}
      </Facts>
    </CardBody>
  </Card>
);

/** The driver and the attendant, with the numbers a parent would ring. */
export const CrewCard = ({ route, title = 'Who is on board' }) => {
  const people = [
    route?.driver ? { ...route.driver, role: 'Driver' } : null,
    route?.attendant ? { ...route.attendant, role: 'Conductor / crew' } : null,
  ].filter(Boolean);
  return (
    <Card>
      <CardHead icon="people" iconTone="purple" title={title} sub="The people with the bus today" />
      <CardBody>
        {people.length ? people.map((p, i) => (
          <div className="tr-crewline" key={i}>
            <Avatar name={p.name} src={p.photo} id={p._id || i} />
            <div className="tr-crewline__text">
              <b>{p.name}</b>
              <span>{p.role}</span>
            </div>
            {p.phone ? (
              <Btn size="sm" kind="soft" icon="phone" as="a" href={`tel:${p.phone}`}>{p.phone}</Btn>
            ) : <span className="tr-field__hint">No number on file</span>}
          </div>
        )) : <Empty icon="people" sm title="No crew named yet">The office has not assigned a driver to this route.</Empty>}
      </CardBody>
    </Card>
  );
};

/**
 * The run as a line of stops, with what has already happened marked.
 *
 * This is the one thing a waiting parent actually watches, so it is a list of
 * places and times rather than a map they have to interpret.
 */
export const StopLine = ({ stops = [], highlight, compact }) => {
  if (!stops.length) {
    return <Empty icon="mapPin" sm title="No stops on this run">The route has not been laid out yet.</Empty>;
  }
  return (
    <ol className={`tr-stopline${compact ? ' tr-stopline--compact' : ''}`}>
      {stops.map((s, i) => {
        const done = s.status === 'reached';
        const skipped = s.status === 'skipped';
        const mine = highlight && s.name === highlight;
        return (
          <li key={i} className={`tr-stopline__item${done ? ' is-done' : ''}${skipped ? ' is-skipped' : ''}${mine ? ' is-mine' : ''}`}>
            <span className="tr-stopline__dot">{done ? <Ico name="check" size={11} /> : null}</span>
            <span className="tr-stopline__text">
              <b>{s.name}{mine ? <em> · your stop</em> : null}</b>
              <span>
                {done ? `Reached ${fmtTime(s.reachedAt)}`
                  : skipped ? 'Skipped'
                    : s.plannedTime ? `Due ${s.plannedTime}` : 'No time set'}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
};

/** The live-trip banner: what is running, how late, and where it last was. */
export const LiveStrip = ({ trip }) => {
  if (!trip) return null;
  const late = (trip.delayMinutes || 0) > 0;
  return (
    <div className={`tr-livestrip${late ? ' tr-livestrip--late' : ''}`}>
      <Mark name="bus" tone={late ? 'amber' : 'green'} size={38} glyph={18} />
      <div className="tr-livestrip__text">
        <b>{runWord(trip.shift, trip.direction)} · {words(trip.status || '')}</b>
        <span>
          {late ? `Running ${trip.delayMinutes} minutes late` : 'Running to time'}
          {trip.lastLocation?.at ? ` · last reported ${ago(trip.lastLocation.at)}` : ''}
        </span>
      </div>
      <Badge tone={TRIP_TONE[trip.status] || 'slate'} dot={trip.status === 'started' ? 'green' : undefined}>
        {words(trip.status || '')}
      </Badge>
    </div>
  );
};

/** A money row for the fee lists, said the same way on every portal screen. */
export const InvoiceRow = ({ inv }) => {
  const due = Math.max(0, (inv.netAmount || 0) - (inv.paidAmount || 0));
  return (
    <div className="tr-row">
      <Mark name="wallet" tone={INVOICE_TONE[inv.status] === 'red' ? 'red' : 'green'} size={34} glyph={16} />
      <div className="tr-row__text">
        <b>{inv.invoiceNumber}</b>
        <span>{inv.period?.label || ''}{inv.dueDate ? ` · due ${fmtDate(inv.dueDate)}` : ''}</span>
      </div>
      <div className="tr-row__end">
        <b>{money(inv.netAmount)}</b>
        {due ? <span>{money(due)} outstanding</span> : <span>Settled</span>}
      </div>
      <Badge tone={INVOICE_TONE[inv.status] || 'slate'}>{words(inv.status || '')}</Badge>
    </div>
  );
};

/** What a rider sees when the office has not put them on a bus. */
export const NotEnrolled = ({ who = 'You are' }) => (
  <Panel title="No transport yet">
    <Note tone="info" title={`${who} not on a bus`}>
      Nobody has been enrolled on a route for this account. The transport office
      arranges that — once they do, the bus, its crew, the live run and the fees
      all appear here.
    </Note>
  </Panel>
);

/* ── Complaints ───────────────────────────────────────────────────────────── */

export const COMPLAINT_CATS = ['driver_behavior', 'vehicle_condition', 'delay', 'safety', 'cleanliness', 'other'];
export const COMPLAINT_WORD = {
  driver_behavior: 'How the driver behaved', vehicle_condition: 'The state of the bus',
  delay: 'It was late', safety: 'Something unsafe', cleanliness: 'It was not clean',
  other: 'Something else',
};
const COMPLAINT_TONE = { open: 'amber', investigating: 'blue', resolved: 'green', closed: 'slate', rejected: 'red' };

/**
 * Raise something with the transport office, and see what came of it.
 *
 * The endpoints for this existed on all four portals from the start and NO
 * screen called three of them, so a student or a teacher who rides the bus had
 * no way to report a driver — and a parent could send one but never see the
 * reply. One component now serves all of them; only the two calls differ.
 */
export function Complaints({ list = [], onSend, routeName, who = 'your' }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({ category: 'delay', description: '' });

  const send = async () => {
    if (!form.description.trim()) return;
    setBusy(true);
    try {
      await onSend(form);
      setOpen(false);
      setForm({ category: 'delay', description: '' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <Card>
        <CardHead icon="megaphone" iconTone="amber" title="Complaints"
                  sub={`Anything about the driving, the state of the bus, or a run that was late`}
                  right={<Btn kind="primary" size="sm" icon="megaphone" onClick={() => setOpen(true)}>Raise one</Btn>} />
        <CardBody flush>
          {list.length ? (
            <Rows>
              {list.map((c) => (
                <div className="tr-row" key={c._id}>
                  <Mark name="megaphone" size={34} glyph={16}
                        tone={COMPLAINT_TONE[c.status] === 'green' ? 'green' : COMPLAINT_TONE[c.status] === 'red' ? 'red' : 'amber'} />
                  <div className="tr-row__text">
                    <b>{COMPLAINT_WORD[c.category] || words(c.category || '')}</b>
                    <span>{[c.complaintCode, c.description].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="tr-row__end">
                    <b>{fmtDate(c.createdAt)}</b>
                    {c.resolution ? <span>answered</span> : <span>with the office</span>}
                  </div>
                  <Badge tone={COMPLAINT_TONE[c.status] || 'slate'}>{words(c.status || 'open')}</Badge>
                </div>
              ))}
            </Rows>
          ) : (
            <Empty icon="megaphone" sm title="Nothing raised">
              If something goes wrong on the bus, tell the office here and you can follow what
              they did about it.
            </Empty>
          )}
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} slim icon="megaphone" iconTone="amber"
             title="Tell the transport office"
             sub={routeName ? `About ${routeName}` : undefined}
             foot={<>
               <Btn onClick={() => setOpen(false)} disabled={busy}>Cancel</Btn>
               <Btn kind="primary" onClick={send} disabled={busy || !form.description.trim()}>
                 {busy ? 'Sending…' : 'Send'}
               </Btn>
             </>}>
        <Field label="What is it about">
          <Select value={form.category} onChange={(x) => setForm((f) => ({ ...f, category: x }))}
                  options={COMPLAINT_CATS.map((c) => ({ value: c, label: COMPLAINT_WORD[c] }))} />
        </Field>
        <Field label="What happened" required hint="Dates and times help the office find the run">
          <Textarea rows={4} value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="On Tuesday the bus reached our stop about 20 minutes late…" />
        </Field>
        <Note tone="info" title={`It goes to the office with ${who} route attached`}>
          They can see which bus and which run you mean, so you do not have to explain it.
        </Note>
      </Modal>
    </>
  );
}
