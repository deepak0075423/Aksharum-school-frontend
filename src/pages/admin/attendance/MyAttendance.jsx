/**
 * Admin → Attendance → My Attendance.
 *
 * The admin's OWN attendance (clocked the same way a teacher's is, into the
 * same store) — a calendar, a summary ring and the regularization flow — beside
 * two school-wide panels that the screen leads with: what just happened, and
 * today's register (TodayAttendance.jsx).
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import {
  clockIn, clockOut, getAttendanceActivity, getMyAttendance, getMyAttendanceSummary,
  getMyRegularizations, submitRegularization,
} from '../../../api/admin.api';
import { Button, Modal, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Drawer, DrawerFoot, ago } from '../listParts';
import { DialogHead } from '../leaveParts';
import {
  ActivityRow, Card, Dot, EmptyNote, Ring, STATUS, Segmented, StatusPill,
  addDays, addMonths, dateOf, fmtClock, fmtDay, fmtDayShort, fmtMonth, monthEnd,
  monthStart, plural, todayKey, workedFor,
} from '../attendanceParts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LEGEND = ['present', 'absent', 'leave', 'half-day', 'holiday', 'weekend'];

/** A past working day someone could ask to have corrected. */
const canRegularize = (d) => d && d.key < todayKey()
  && (d.status === 'absent' || (d.status === 'present' && (!d.checkIn || !d.checkOut)));

// ── Clock ────────────────────────────────────────────────────────────────────

/**
 * Today's clock-in, as one line beside the tabs. The mockup has no place for it
 * and the admin still has to clock in — so it takes the least room it can.
 */
export function ClockControl({ version, onChanged }) {
  const today = todayKey();
  const { data, loading, refetch } = useFetch(() => getMyAttendance({ from: today, to: today }), [version]);
  const [busy, setBusy] = useState(false);
  const state = data?.today;

  const act = async (fn, verb) => {
    setBusy(true);
    try {
      const res = await fn();
      const at = res?.data?.checkOut || res?.data?.checkIn;
      toast.success(`${verb}${at ? ` at ${fmtClock(at)}` : ''}`);
      refetch();
      onChanged?.();
    } catch (e) { toast.error(e?.message || 'Could not update your attendance'); }
    finally { setBusy(false); }
  };

  if (loading && !state) return <span className="atn-clock"><Spinner size="sm" /></span>;
  if (!state) return null;

  const day = data?.days?.[0];
  if (state.onLeave) {
    return <span className="atn-clock"><Dot status="leave" />On leave today · {state.leaveLabel}</span>;
  }
  if (day?.status === 'holiday' || day?.status === 'weekend') {
    return <span className="atn-clock"><Dot status={day.status} />{day.label || 'Not a working day'}</span>;
  }
  return (
    <span className="atn-clock">
      {state.clockedIn ? (
        <>
          <Dot status="present" />
          In {fmtClock(state.checkIn)}{state.checkOut ? ` · Out ${fmtClock(state.checkOut)}` : ''}
          <Button size="sm" variant={state.clockedOut ? 'secondary' : 'primary'} loading={busy}
            onClick={() => act(clockOut, 'Clocked out')}>
            <Icon name={state.clockedOut ? 'refresh' : 'logOut'} size={15} />
            {state.clockedOut ? 'Update clock-out' : 'Clock Out'}
          </Button>
        </>
      ) : (
        <>
          <Dot status="unmarked" />Not clocked in
          <Button size="sm" loading={busy} onClick={() => act(clockIn, 'Clocked in')}>
            <Icon name="logIn" size={15} /> Clock In
          </Button>
        </>
      )}
    </span>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────

function windowFor(view, cursor) {
  if (view === 'week') {
    const from = addDays(cursor, -dateOf(cursor).getDay());
    return { from, to: addDays(from, 6) };
  }
  if (view === 'list') return { from: monthStart(cursor), to: monthEnd(cursor) };
  const first = monthStart(cursor);
  const last  = monthEnd(cursor);
  return {
    from: addDays(first, -dateOf(first).getDay()),
    to:   addDays(last, 6 - dateOf(last).getDay()),
  };
}

function CalendarCard({ version, onPickDay, onDetails, onRequest }) {
  const [view, setView]     = useState('month');
  const [cursor, setCursor] = useState(todayKey());
  const { from, to } = windowFor(view, cursor);
  const { data, loading, error } = useFetch(() => getMyAttendance({ from, to }), [from, to, version]);
  // Only window replies carry `key`; anything else is not this calendar's answer.
  const days  = (data?.days || []).filter((d) => d.key);
  const today = todayKey();
  const month = cursor.slice(0, 7);

  const step = (dir) => setCursor((c) => (view === 'week' ? addDays(c, 7 * dir) : addMonths(c, dir)));
  const title = view === 'week'
    ? `${dateOf(from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${fmtDay(to)}`
    : fmtMonth(cursor);

  const cell = (d) => {
    const outside = view === 'month' && d.key.slice(0, 7) !== month;
    const s = !outside && d.status && d.status !== 'weekend' ? d.status : null;
    const future = d.key > today;
    const cls = [
      'atn-day',
      outside && 'is-out',
      d.status === 'weekend' && 'is-weekend',
      s && `is-${STATUS[s]?.tone}`,
      d.key === today && 'is-today',
    ].filter(Boolean).join(' ');
    const label = s === 'pending' ? 'Not in yet' : s ? STATUS[s].label : '';
    const open = !outside && !future && d.status !== 'weekend';
    const inner = (
      <>
        <span className="atn-day__num">{dateOf(d.key).getDate()}</span>
        {label && <span className="atn-day__label"><Dot status={s} />{label}</span>}
      </>
    );
    const tip = [fmtDay(d.key), d.label, d.checkIn && `In ${fmtClock(d.checkIn)}`, d.checkOut && `Out ${fmtClock(d.checkOut)}`]
      .filter(Boolean).join(' · ');
    return open
      ? <button key={d.key} type="button" className={cls} title={tip} onClick={() => onPickDay(d)}>{inner}</button>
      : <div key={d.key} className={cls} title={tip}>{inner}</div>;
  };

  return (
    <Card className="atn-cal"
      title={
        <span className="atn-cal__nav">
          <button type="button" className="atn-iconbtn" onClick={() => step(-1)} aria-label="Previous"><Icon name="chevronLeft" size={17} /></button>
          <button type="button" className="atn-iconbtn" onClick={() => step(1)} aria-label="Next"><Icon name="chevronRight" size={17} /></button>
          <span className="atn-cal__title">{title}</span>
          {loading && <Spinner size="sm" />}
        </span>
      }
      actions={
        <>
          <button type="button" className="atn-btn-ghost" onClick={() => setCursor(todayKey())}>Today</button>
          <Segmented label="Calendar view" value={view} onChange={setView}
            options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'list', label: 'List' }]} />
        </>
      }>
      {error && <EmptyNote icon="alert" title="Your attendance could not be loaded">{error}</EmptyNote>}

      {!error && view === 'month' && (
        <div className={`atn-grid${loading ? ' is-loading' : ''}`}>
          {WEEKDAYS.map((w) => <div key={w} className="atn-grid__dow">{w}</div>)}
          {days.map(cell)}
        </div>
      )}

      {!error && view === 'week' && (
        <div className={`atn-week${loading ? ' is-loading' : ''}`}>
          {days.map((d) => {
            const s = d.status && d.status !== 'weekend' ? d.status : null;
            const future = d.key > today;
            return (
              <button key={d.key} type="button"
                className={`atn-weekday${d.key === today ? ' is-today' : ''}${d.status === 'weekend' ? ' is-weekend' : ''}`}
                disabled={future || d.status === 'weekend'} onClick={() => onPickDay(d)}>
                <span className="atn-weekday__dow">{WEEKDAYS[dateOf(d.key).getDay()]}</span>
                <span className="atn-weekday__num">{dateOf(d.key).getDate()}</span>
                {s ? <StatusPill status={s} /> : <span className="atn-weekday__none">{d.status === 'weekend' ? 'Weekend' : '—'}</span>}
                {d.label && <span className="atn-weekday__note">{d.label}</span>}
                <span className="atn-weekday__times">
                  <span>In <b>{d.checkIn ? fmtClock(d.checkIn) : '—'}</b></span>
                  <span>Out <b>{d.checkOut ? fmtClock(d.checkOut) : '—'}</b></span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!error && view === 'list' && (
        <div className="table-wrap atn-list">
          <table className="atn-table">
            <thead><tr><th>Date</th><th>Status</th><th>Clock in</th><th>Clock out</th><th>Worked</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {days.filter((d) => d.status !== 'weekend').map((d) => (
                <tr key={d.key} className={d.key === today ? 'is-today' : ''}>
                  <td><b>{fmtDayShort(d.key)}</b>{d.label ? <small>{d.label}</small> : null}</td>
                  <td>{d.status ? <StatusPill status={d.status} /> : <span className="atn-muted">Upcoming</span>}</td>
                  <td>{d.checkIn ? fmtClock(d.checkIn) : <span className="atn-muted">—</span>}</td>
                  <td>{d.checkOut ? fmtClock(d.checkOut) : <span className="atn-muted">—</span>}</td>
                  <td>{workedFor(d.checkIn, d.checkOut) || <span className="atn-muted">—</span>}</td>
                  <td className="atn-table__act">
                    {canRegularize(d) && (
                      <button type="button" className="atn-textbtn" onClick={() => onRequest(d.key)}>Request fix</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="atn-cal__foot">
        <ul className="atn-legend">
          {LEGEND.map((k) => <li key={k}><Dot status={k} />{STATUS[k].label}</li>)}
        </ul>
        <button type="button" className="atn-textbtn" onClick={() => onDetails(cursor)}>
          View Attendance Details <Icon name="arrowRight" size={15} />
        </button>
      </footer>
    </Card>
  );
}

// ── Day & details drawers ────────────────────────────────────────────────────

function DayDrawer({ day, onClose, onRequest }) {
  if (!day) return null;
  const s = day.status;
  const note = {
    absent:   'No clock-in was recorded on this working day, so it counts as absent.',
    present:  !day.checkOut ? 'Clocked in, but no clock-out was recorded.' : 'A full day was recorded.',
    leave:    'Approved leave covers this day — nothing to regularise.',
    'half-day': 'An approved half-day leave covers this day.',
    holiday:  'A school holiday — attendance is not owed.',
    pending:  'Today. Clock in from the bar beside the tabs.',
  }[s] || 'Nothing is recorded for this day.';

  return (
    <Drawer open onClose={onClose}>
      <div className="ldrawer__head">
        <span className="atn-drawer__mark"><Icon name="calendar" size={22} /></span>
        <div className="ldrawer__id">
          <h3>{dateOf(day.key).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
          <p>My attendance</p>
          <div className="ldrawer__tags">{s ? <StatusPill status={s} /> : null}</div>
        </div>
        <button type="button" className="lact" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
      </div>
      <div className="ldrawer__body">
        <div className="atn-facts">
          <div><span>Clock in</span><b>{day.checkIn ? fmtClock(day.checkIn) : '—'}</b></div>
          <div><span>Clock out</span><b>{day.checkOut ? fmtClock(day.checkOut) : '—'}</b></div>
          <div><span>Worked</span><b>{workedFor(day.checkIn, day.checkOut) || '—'}</b></div>
          {day.label ? <div><span>{s === 'holiday' ? 'Holiday' : 'Leave'}</span><b>{day.label}</b></div> : null}
        </div>
        <p className="atn-drawer__note">{note}</p>
      </div>
      {canRegularize(day) && (
        <DrawerFoot>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={() => { onRequest(day.key); onClose(); }}>
            <Icon name="pencil" size={15} /> Request regularization
          </Button>
        </DrawerFoot>
      )}
    </Drawer>
  );
}

function DetailsDrawer({ monthKey, version, onClose, onRequest }) {
  const from = monthStart(monthKey), to = monthEnd(monthKey);
  const { data, loading } = useFetch(() => getMyAttendance({ from, to }), [from, to, version]);
  const { data: regs } = useFetch(() => getMyRegularizations(), [version]);
  const summary  = data?.summary || {};
  const requests = regs?.requests || [];
  const regStatus = (st) => (st === 'pending' ? 'waiting' : st);

  return (
    <Drawer open onClose={onClose}>
      <div className="ldrawer__head">
        <span className="atn-drawer__mark"><Icon name="clipboard" size={22} /></span>
        <div className="ldrawer__id">
          <h3>{fmtMonth(monthKey)}</h3>
          <p>My attendance in detail</p>
        </div>
        <button type="button" className="lact" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
      </div>
      <div className="ldrawer__body">
        {loading ? <Spinner /> : (
          <>
            <section className="ldrawer__sec">
              <h4>Month at a glance</h4>
              <div className="atn-facts atn-facts--5">
                {['present', 'absent', 'half-day', 'leave', 'holiday'].map((k) => (
                  <div key={k}><span><Dot status={k} /> {STATUS[k].label}</span><b>{summary[k] || 0}</b></div>
                ))}
              </div>
            </section>
            <section className="ldrawer__sec">
              <h4>Missing punches</h4>
              {(data?.days || []).filter(canRegularize).length === 0
                ? <p className="atn-muted">Nothing to correct this month.</p>
                : (
                  <ul className="atn-miss">
                    {(data?.days || []).filter(canRegularize).map((d) => (
                      <li key={d.key}>
                        <span><b>{fmtDayShort(d.key)}</b> {d.status === 'absent' ? 'No clock-in' : 'No clock-out'}</span>
                        <button type="button" className="atn-textbtn" onClick={() => onRequest(d.key)}>Request fix</button>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          </>
        )}
        <section className="ldrawer__sec">
          <h4>My regularization requests</h4>
          {requests.length === 0 ? <p className="atn-muted">You have not raised any.</p> : (
            <ul className="atn-reqs">
              {requests.map((r) => (
                <li key={r._id} data-focus-id={r._id}>
                  <div>
                    <b>{fmtDay(String(r.date).slice(0, 10))}</b>
                    <small>
                      {[r.checkIn && `In ${fmtClock(r.checkIn)}`, r.checkOut && `Out ${fmtClock(r.checkOut)}`].filter(Boolean).join(' · ')}
                      {r.reason ? ` — ${r.reason}` : ''}
                    </small>
                    {r.adminRemarks ? <small className="atn-reqs__remark">Remarks: {r.adminRemarks}</small> : null}
                  </div>
                  <StatusPill status={regStatus(r.status)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <DrawerFoot>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={() => onRequest('')}><Icon name="plus" size={15} /> New request</Button>
      </DrawerFoot>
    </Drawer>
  );
}

// ── Self regularization ──────────────────────────────────────────────────────

/**
 * Ask for a missed punch to be recorded. Another admin approves it — the server
 * refuses anyone reviewing their own request.
 */
function RequestDialog({ date, onClose, onSaved }) {
  const [form, setForm] = useState({ date: date || '', checkIn: '', checkOut: '', reason: '' });
  const [day, setDay]   = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form.date) { setDay(null); return undefined; }
    let live = true;
    getMyAttendance({ from: form.date, to: form.date }).then((res) => {
      if (!live) return;
      const d = (res?.data ?? res)?.days?.[0] || null;
      setDay(d);
      setForm((f) => ({ ...f, checkIn: d?.checkIn || '', checkOut: d?.checkOut || '' }));
    }).catch(() => live && setDay(null));
    return () => { live = false; };
  }, [form.date]);

  const blocked = day && ['leave', 'half-day', 'holiday', 'weekend'].includes(day.status);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.checkIn && !form.checkOut) return toast.error('Enter the missed clock-in and/or clock-out time');
    setSaving(true);
    try {
      await submitRegularization(form);
      toast.success('Sent for approval');
      onSaved();
    } catch (err) { toast.error(err?.message || 'Could not send the request'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} maxWidth={560}
      title={<DialogHead icon="pencil" title="Request regularization" subtitle="Enter only the punch you missed. Another admin approves it." />}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="atn-selfreg" loading={saving} disabled={blocked}>Send for approval</Button>
      </>}>
      <form id="atn-selfreg" onSubmit={submit} className="atn-form">
        <div className="form-group">
          <label className="form-label required" htmlFor="atn-sr-date">Date</label>
          <input id="atn-sr-date" type="date" className="form-control" required max={todayKey()} value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </div>
        {form.date && day && (
          <div className={`atn-callout atn-callout--${blocked ? 'warn' : 'info'}`}>
            <Icon name={blocked ? 'alert' : 'info'} size={17} />
            <span>
              {day.status === 'present' && <>Recorded: in <b>{day.checkIn ? fmtClock(day.checkIn) : 'missing'}</b>, out <b>{day.checkOut ? fmtClock(day.checkOut) : 'missing'}</b>.</>}
              {day.status === 'absent' && <>No punches recorded — this day currently counts as <b>absent</b>.</>}
              {day.status === 'pending' && <>Today — you can still clock in from the bar beside the tabs.</>}
              {blocked && <>{STATUS[day.status]?.label}{day.label ? ` (${day.label})` : ''} — there is nothing to regularise.</>}
              {!day.status && <>Nothing recorded for this day yet.</>}
            </span>
          </div>
        )}
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label" htmlFor="atn-sr-in">Clock-in time</label>
            <input id="atn-sr-in" type="time" className="form-control" value={form.checkIn}
              onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="atn-sr-out">Clock-out time</label>
            <input id="atn-sr-out" type="time" className="form-control" value={form.checkOut}
              onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label required" htmlFor="atn-sr-reason">Reason</label>
          <textarea id="atn-sr-reason" className="form-control" rows={3} required maxLength={500} value={form.reason}
            placeholder="e.g. Was in school but forgot to clock in"
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </div>
      </form>
    </Modal>
  );
}

// ── Summary ring ─────────────────────────────────────────────────────────────

function SummaryCard({ version }) {
  const [period, setPeriod] = useState('this-month');
  const { data, loading } = useFetch(() => getMyAttendanceSummary({ period }), [period, version]);
  const cur  = data?.current;
  const prev = data?.previous;
  const s    = cur?.summary || {};

  const callout = useMemo(() => {
    if (!cur) return null;
    if (cur.percentage == null) {
      return { tone: 'neutral', icon: 'info', title: 'Nothing counted yet', text: 'No working days have been owed in this period.' };
    }
    if (prev?.percentage == null) {
      return { tone: 'neutral', icon: 'info', title: `${cur.percentage}% attendance`, text: `No attendance was owed in ${prev?.label || 'the previous period'} to compare with.` };
    }
    const diff = cur.percentage - prev.percentage;
    const good = cur.percentage >= 85;
    if (diff > 0) {
      return { tone: 'good', icon: 'barsUp', title: good ? 'Good attendance!' : 'Attendance is improving',
        text: `Attendance is ${diff}% higher than ${prev.label}.` };
    }
    if (diff < 0) {
      return { tone: 'warn', icon: 'alert', title: 'Attendance has dipped', text: `Attendance is ${Math.abs(diff)}% lower than ${prev.label}.` };
    }
    // Unchanged is only reassuring when the level itself is.
    return good
      ? { tone: 'good', icon: 'barsUp', title: 'Good attendance!', text: `Steady — the same as ${prev.label}.` }
      : { tone: 'warn', icon: 'alert', title: 'Attendance is low', text: `No better than ${prev.label}. Missed punches can be regularised.` };
  }, [cur, prev]);

  return (
    <Card className="atn-sum" title="Attendance Summary"
      actions={
        <select className="atn-mini-select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Summary period">
          <option value="this-month">This Month</option>
          <option value="last-month">Last Month</option>
          <option value="this-year">This Year</option>
        </select>
      }>
      <div className={`atn-sum__body${loading ? ' is-loading' : ''}`}>
        <Ring value={cur?.percentage ?? null} caption="Present" />
        <ul className="atn-sum__list">
          {['present', 'absent', 'half-day', 'leave', 'holiday'].map((k) => (
            <li key={k}><Dot status={k} /><span>{STATUS[k].label}</span><b>{plural(s[k] || 0, 'day')}</b></li>
          ))}
        </ul>
      </div>
      {callout && (
        <div className={`atn-note atn-note--${callout.tone}`}>
          <span className="atn-note__icon"><Icon name={callout.icon} size={20} /></span>
          <span className="atn-note__text"><b>{callout.title}</b><small>{callout.text}</small></span>
          {callout.tone !== 'neutral' && <Icon name={callout.tone === 'warn' ? 'arrowDown' : 'trending'} size={20} />}
        </div>
      )}
      <p className="atn-sum__foot">
        {cur ? `${cur.label} · counted over working days owed; holidays and approved leave are left out.` : ''}
      </p>
    </Card>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────

function ActivityCard({ version, onOpen }) {
  const [all, setAll] = useState(false);
  const { data, loading } = useFetch(() => getAttendanceActivity({ limit: 5 }), [version]);
  const { data: more, loading: loadingMore } = useFetch(
    () => (all ? getAttendanceActivity({ limit: 40 }) : Promise.resolve(null)), [all, version]);
  const items = Array.isArray(data) ? data : [];
  const open = (item) => { setAll(false); onOpen(item); };

  return (
    <Card className="atn-feed" title="Recent Activity"
      actions={<button type="button" className="atn-textbtn" onClick={() => setAll(true)}>View all <Icon name="arrowRight" size={15} /></button>}>
      {loading && !items.length ? <div className="atn-center"><Spinner /></div>
        : items.length === 0 ? <EmptyNote icon="activity" title="Nothing yet">Registers, corrections and requests will show up here.</EmptyNote>
        : <div className="atn-acts">{items.map((it) => <ActivityRow key={it.id} item={it} onOpen={onOpen} ago={ago} />)}</div>}

      <Drawer open={all} onClose={() => setAll(false)}>
        <div className="ldrawer__head">
          <span className="atn-drawer__mark"><Icon name="activity" size={22} /></span>
          <div className="ldrawer__id"><h3>Recent activity</h3><p>Registers, corrections and requests across the school</p></div>
          <button type="button" className="lact" onClick={() => setAll(false)} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        <div className="ldrawer__body">
          {loadingMore ? <Spinner /> : (
            <div className="atn-acts">
              {(Array.isArray(more) ? more : []).map((it) => <ActivityRow key={it.id} item={it} onOpen={open} ago={ago} />)}
            </div>
          )}
        </div>
      </Drawer>
    </Card>
  );
}

// ── The tab ──────────────────────────────────────────────────────────────────

export default function MyAttendance({ selfVersion, schoolVersion, onChanged, onActivity, today }) {
  const [pickedDay, setPickedDay] = useState(null);
  const [details, setDetails]     = useState(null);   // month key
  const [request, setRequest]     = useState(null);   // date key ('' = blank form)

  const startRequest = (key) => { setDetails(null); setRequest(key || ''); };

  return (
    <div className="atn-body">
      <div className="atn-main">
        <CalendarCard version={selfVersion} onPickDay={setPickedDay} onDetails={setDetails} onRequest={startRequest} />
        {today}
      </div>
      <aside className="atn-rail">
        <SummaryCard version={selfVersion} />
        <ActivityCard version={`${selfVersion}.${schoolVersion}`} onOpen={onActivity} />
      </aside>

      <DayDrawer day={pickedDay} onClose={() => setPickedDay(null)} onRequest={startRequest} />
      {details && <DetailsDrawer monthKey={details} version={selfVersion} onClose={() => setDetails(null)} onRequest={startRequest} />}
      {request !== null && (
        <RequestDialog date={request} onClose={() => setRequest(null)}
          onSaved={() => { setRequest(null); onChanged(); }} />
      )}
    </div>
  );
}

