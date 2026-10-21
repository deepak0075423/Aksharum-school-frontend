/**
 * Admissions → Visits (Oct 2026): campus visits families book on the portal.
 * Open times (several days and times at once), see who booked each, mark who
 * came, change a time's room or cancel it — everyone booked is told why.
 * Room is counted on the server, under a lock, from the bookings themselves.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import {
  Page, Head, Panel, Btn, Chip, Table, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, Field, Input, TextArea, Toggle, Note, IconBtn, Tiles, Tile, useLoad,
} from '../admUI';
import { fmtDate, fmtTime, fmtDateTime, errMsg, toDateInput } from '../meta';
import { useAdmission } from './parts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BOOKING = { booked: ['Booked', 'green'], cancelled: ['Cancelled', 'gray'], attended: ['Came', 'indigo'], no_show: ['Did not come', 'amber'] };

export default function Visits() {
  const adm = useAdmission();
  const { data, loading, error, reload } = useLoad(() => admin.visits({}), []);
  const [opening, setOpening] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const v = adm.settings?.visits || {};
  const upcoming = (data || []).filter((s) => new Date(s.startsAt) > new Date() && s.status === 'open');
  const days = useMemo(() => {
    const m = new Map();
    for (const s of data || []) {
      const k = new Date(s.startsAt).toDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    }
    return [...m.values()];
  }, [data]);

  return (
    <Page>
      <Head eyebrow="Admissions" title="Campus visits" subtitle="Times families book on the portal to see the school.">
        <Btn kind="primary" icon="plus" onClick={() => setOpening(true)}>Open times</Btn>
      </Head>
      <VisitSettings v={v} onSaved={adm.reload} />
      <Tiles>
        <Tile icon="calendar" tone="indigo" label="Upcoming times" value={upcoming.length} />
        <Tile icon="users" tone="green" label="People booked" value={upcoming.reduce((n, s) => n + s.booked, 0)} sub={`of ${upcoming.reduce((n, s) => n + s.capacity, 0)} places`} />
      </Tiles>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : days.length ? days.map((list) => (
        <Panel key={list[0].startsAt} title={fmtDate(list[0].startsAt)} icon="calendarDays" pad={false}>
          <Table dense rows={list} columns={[
            { key: 't', label: 'Time', render: (s) => <b>{fmtTime(s.startsAt)}</b> },
            { key: 'n', label: 'Visit', render: (s) => <>{s.title}<div className="adm-muted" style={{ fontSize: '.74rem' }}>{s.durationMinutes} min{s.location ? ` · ${s.location}` : ''}</div></> },
            { key: 'b', label: 'Booked', render: (s) => <span style={{ fontWeight: 600, color: s.booked >= s.capacity ? '#b91c1c' : undefined }}>{s.booked} / {s.capacity}</span> },
            { key: 's', label: '', render: (s) => (s.status === 'cancelled' ? <Chip tone="gray" title={s.cancelReason}>Cancelled</Chip> : new Date(s.startsAt) < new Date() ? <Chip tone="gray">Past</Chip> : <Chip tone="green">Open</Chip>) },
            { key: 'x', label: '', render: (s) => (
              <div className="adm-row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                <IconBtn icon="users" label="Who booked" onClick={() => setViewing(s)} />
                {s.status === 'open' ? <IconBtn icon="pencil" label="Change" onClick={() => setEditing(s)} /> : null}
                {s.status === 'open' && new Date(s.startsAt) > new Date() ? <IconBtn icon="closeCircle" kind="danger" label="Cancel this time" onClick={() => setCancelling(s)} /> : null}
              </div>
            ) },
          ]} />
        </Panel>
      )) : <Empty icon="calendar" title="No visit times yet" action={<Btn kind="primary" onClick={() => setOpening(true)}>Open times</Btn>}>Open a few times and switch bookings on — families see them on the portal under “Visit us”.</Empty>}
      {opening ? <OpenDialog onClose={() => setOpening(false)} onDone={() => { setOpening(false); reload(); }} /> : null}
      {viewing ? <BookingsDialog slot={viewing} onClose={() => { setViewing(null); reload(); }} /> : null}
      {editing ? <EditDialog slot={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} /> : null}
      <ConfirmDialog open={!!cancelling} onClose={() => setCancelling(null)} title={`Cancel the visit on ${cancelling ? fmtDateTime(cancelling.startsAt) : ''}?`} confirmLabel="Cancel the visit" reason
        message={`${cancelling?.bookings || 0} booking(s) are cancelled and each family is emailed the reason.`}
        onConfirm={async (why) => { try { const r = await admin.cancelVisit(cancelling._id, why); toast.success(`Cancelled — ${r.data.cancelled} family(ies) told`); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Page>
  );
}

function VisitSettings({ v, onSaved }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const cur = f || v;
  const set = (patch) => setF({ ...cur, ...patch });
  const save = async () => {
    setBusy(true);
    try { await admin.saveSettings({ visits: { ...cur, intro: (cur.intro || '').trim() } }); toast.success('Saved'); setF(null); onSaved?.(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel title="Booking on the portal" icon="settings" right={f ? <Btn size="sm" kind="primary" busy={busy} onClick={save}>Save</Btn> : null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Toggle checked={!!cur.enabled} onChange={(x) => set({ enabled: x })} label="Families can book visits on the portal" sub="A “Visit us” page appears on the portal; booking needs a signed-in account" />
        <div className="adm-grid3">
          <Field label="People per booking, at most"><Input type="number" min="1" max="10" step="1" value={cur.maxPeople ?? 4} onChange={(e) => set({ maxPeople: Number(e.target.value) || 1 })} /></Field>
          <Field label="Families may cancel until (hours before)"><Input type="number" min="0" max="72" step="1" value={cur.cancelUntilHours ?? 2} onChange={(e) => set({ cancelUntilHours: Number(e.target.value) || 0 })} /></Field>
          <Field label="Reminder (hours before)" hint="0: no reminder"><Input type="number" min="0" max="72" step="1" value={cur.reminderHours ?? 24} onChange={(e) => set({ reminderHours: Number(e.target.value) || 0 })} /></Field>
        </div>
        <Field label="A note on the visits page" hint="What a visit covers, what to bring"><TextArea rows={2} maxLength={600} value={cur.intro || ''} onChange={(e) => set({ intro: e.target.value })} data-text="sentence" /></Field>
      </div>
    </Panel>
  );
}

/** Several days and times at once: each chosen day × each time. */
function OpenDialog({ onClose, onDone }) {
  const today = toDateInput(new Date());
  const [f, setF] = useState({ from: today, to: today, weekdays: [1, 2, 3, 4, 5, 6], times: '10:00, 14:00', title: 'Campus tour', durationMinutes: 60, capacity: 10, location: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const starts = useMemo(() => {
    const out = [];
    const times = String(f.times).split(/[,\s]+/).filter((t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t));
    if (!f.from || !f.to) return out;
    for (let d = new Date(`${f.from}T00:00:00`); d <= new Date(`${f.to}T00:00:00`) && out.length <= 200; d.setDate(d.getDate() + 1)) {
      if (!f.weekdays.includes(d.getDay())) continue;
      for (const t of times) {
        const [h, m] = t.split(':').map(Number);
        const at = new Date(d); at.setHours(h, m, 0, 0);
        if (at > new Date()) out.push(at);
      }
    }
    return out;
  }, [f]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await admin.openVisits({ starts: starts.map((d) => d.toISOString()), title: f.title.trim(), durationMinutes: Number(f.durationMinutes), capacity: Number(f.capacity), location: f.location.trim(), notes: f.notes.trim() });
      toast.success(`${r.data.length} time(s) opened`);
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const set = (patch) => setF({ ...f, ...patch });
  return (
    <Dialog open onClose={onClose} title="Open visit times" width={640}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!starts.length || starts.length > 200} onClick={go}>Open {starts.length} time{starts.length === 1 ? '' : 's'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-grid2">
          <Field label="From" required><Input type="date" min={today} value={f.from} onChange={(e) => set({ from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} /></Field>
          <Field label="To" required><Input type="date" min={f.from} value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
        </div>
        <Field label="On">
          <div className="adm-choices">
            {WEEKDAYS.map((w, i) => (
              <label key={w} className={`adm-choice ${f.weekdays.includes(i) ? 'is-on' : ''}`}>
                <input type="checkbox" checked={f.weekdays.includes(i)} onChange={(e) => set({ weekdays: e.target.checked ? [...f.weekdays, i] : f.weekdays.filter((x) => x !== i) })} />{w}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Times" hint="24-hour, separated by commas — e.g. 10:00, 14:30"><Input value={f.times} onChange={(e) => set({ times: e.target.value })} data-text="code" /></Field>
        <div className="adm-grid3">
          <Field label="Title"><Input value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} data-text="title" /></Field>
          <Field label="Minutes"><Input type="number" min="15" max="480" step="5" value={f.durationMinutes} onChange={(e) => set({ durationMinutes: e.target.value })} /></Field>
          <Field label="Places (people)"><Input type="number" min="1" max="1000" step="1" value={f.capacity} onChange={(e) => set({ capacity: e.target.value })} /></Field>
        </div>
        <Field label="Where to come"><Input value={f.location} onChange={(e) => set({ location: e.target.value })} maxLength={160} data-text="title" placeholder="Main gate, reception" /></Field>
        <Field label="Notes for families"><TextArea rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={600} data-text="sentence" /></Field>
        <Note tone={starts.length > 200 ? 'red' : 'indigo'} icon="calendar">
          {starts.length ? `${starts.length} time${starts.length === 1 ? '' : 's'}: ${starts.slice(0, 4).map((d) => fmtDateTime(d)).join('; ')}${starts.length > 4 ? '…' : ''}` : 'No times — check the dates, days and times.'}
          {starts.length > 200 ? ' At most 200 at once.' : ''}
        </Note>
      </div>
    </Dialog>
  );
}

function EditDialog({ slot, onClose, onDone }) {
  const [f, setF] = useState({ title: slot.title, capacity: slot.capacity, durationMinutes: slot.durationMinutes, location: slot.location || '', notes: slot.notes || '' });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await admin.updateVisit(slot._id, { ...f, capacity: Number(f.capacity), durationMinutes: Number(f.durationMinutes) }); toast.success('Saved'); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Visit on ${fmtDateTime(slot.startsAt)}`} width={520}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={go}>Save</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} data-text="title" /></Field>
        <div className="adm-grid2">
          <Field label="Places (people)" hint={`${slot.booked} booked`}><Input type="number" min={Math.max(1, slot.booked)} max="1000" step="1" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
          <Field label="Minutes"><Input type="number" min="15" max="480" step="5" value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: e.target.value })} /></Field>
        </div>
        <Field label="Where to come"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={160} data-text="title" /></Field>
        <Field label="Notes for families"><TextArea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={600} data-text="sentence" /></Field>
      </div>
    </Dialog>
  );
}

function BookingsDialog({ slot, onClose }) {
  const { data, loading, error, reload } = useLoad(() => admin.visitBookings(slot._id), [slot._id]);
  const mark = async (b, status) => {
    try { await admin.markVisit(b._id, status); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open onClose={onClose} title={`${slot.title} — ${fmtDateTime(slot.startsAt)}`} width={760} footer={<Btn onClick={onClose}>Close</Btn>}>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <Table rows={data.bookings} empty={<Empty compact icon="users" title="Nobody has booked yet" />} columns={[
          { key: 'n', label: 'Family', render: (b) => <><b>{b.name || '—'}</b><div className="adm-muted" style={{ fontSize: '.74rem' }}>{b.email}{b.phone ? ` · ${b.phone}` : ''}</div></> },
          { key: 'p', label: 'People', align: 'right', render: (b) => b.people },
          { key: 'o', label: 'Note', render: (b) => b.note || <span className="adm-muted">—</span> },
          { key: 's', label: '', render: (b) => <Chip tone={BOOKING[b.status]?.[1]}>{BOOKING[b.status]?.[0]}{b.status === 'cancelled' && b.cancelledBy ? ` (${b.cancelledBy === 'school' ? 'school' : 'family'})` : ''}</Chip> },
          { key: 'x', label: '', render: (b) => (b.status === 'cancelled' ? null : (
            <div className="adm-row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <Btn size="sm" kind={b.status === 'attended' ? 'success' : 'ghost'} onClick={() => mark(b, b.status === 'attended' ? 'booked' : 'attended')}>Came</Btn>
              <Btn size="sm" kind={b.status === 'no_show' ? 'danger' : 'ghost'} onClick={() => mark(b, b.status === 'no_show' ? 'booked' : 'no_show')}>Did not come</Btn>
            </div>
          )) },
        ]} />
      )}
    </Dialog>
  );
}
