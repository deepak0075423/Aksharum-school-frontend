/**
 * Teacher → Attendance → My Attendance.
 *
 * The teacher's own days: clocking in and out, a week at a glance with the
 * chosen day's punches, the month's history, and the regularization flow for a
 * missed punch. Self attendance belongs to the teacher role — an admin who also
 * teaches does it here, from their teacher account.
 *
 * Statuses are derived on the server (services/staffAttendanceDays.js): a clock
 * in is present, approved leave is leave or half-day, a past working day with
 * nothing is absent.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { useAuth } from '../../../contexts/AuthContext';
import {
  clockIn, clockOut, getMyAttendance, getMyRegularizations, submitRegularization,
} from '../../../api/teacher.api';
import { Button, Modal, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Pager, ShowingCount } from '../../admin/leaveParts';
import { RowMenu, MenuItem } from '../../admin/listParts';
import {
  Card, Change, Empty, Frame, PillSelect, STATUS, StatusPill, Tile, WEEKDAYS,
  addDays, addMonths, dateOf, downloadCsv, fmtClock, fmtDay, fmtMonth, monthShort, plural, todayKey, workedFor,
} from '../../../components/attendance/parts';

const HISTORY_PAGE = 7;
const OWED = ['present', 'absent', 'leave', 'half-day'];

/** Attendance over the days owed: holidays out, a half day counts half. */
const percentOf = (s = {}) => {
  const half = s['half-day'] || 0;
  const counted = (s.present || 0) + (s.absent || 0) + half;
  return counted ? Math.round((((s.present || 0) + half * 0.5) / counted) * 100) : null;
};
const shareOf = (n, s = {}) => {
  const counted = (s.present || 0) + (s.absent || 0) + (s['half-day'] || 0);
  return counted ? Math.round(((n || 0) / counted) * 100) : null;
};

/** A past working day someone could ask to have corrected. */
const canRegularize = (d) => d && d.key < todayKey()
  && (d.status === 'absent' || (d.status === 'present' && (!d.checkIn || !d.checkOut)));

const monthParams = (key) => ({ month: dateOf(key).getMonth() + 1, year: dateOf(key).getFullYear() });

/** What a request asks the day to become: "Marked as Present". */
const cap = (x) => String(x || '').replace(/(^|-)(\w)/g, (m, sep, ch) => `${sep}${ch.toUpperCase()}`);
const requestTitle = (r) => (r.requestType && !['Missed Punch', 'Correction'].includes(r.requestType)
  ? r.requestType
  : `Marked as ${cap(r.requestedStatus || 'present')}`);
/** Which punch a missed-punch request supplies. */
const punchNote = (r) => [r.checkIn && `In ${fmtClock(r.checkIn)}`, r.checkOut && `Out ${fmtClock(r.checkOut)}`].filter(Boolean).join(' · ');
const reqStatus = (s) => (s === 'pending' ? 'waiting' : s);



const Dash = () => <span className="tat-change tat-change--flat">—</span>;

export default function MyAttendance({ tab, onTab }) {
  const today = todayKey();
  const { user } = useAuth();
  // The attendance is recorded against this school — the location a day belongs to.
  const schoolName = user?.school?.name || 'School';
  const [month, setMonth]       = useState(`${today.slice(0, 7)}-01`);
  const [selected, setSelected] = useState(today);
  const [histStatus, setHistStatus] = useState('');
  const [histQuery, setHistQuery]   = useState('');
  const [histPage, setHistPage]     = useState(1);
  const [version, setVersion]   = useState(0);
  const [busy, setBusy]         = useState(false);
  const [request, setRequest]   = useState(null);   // date key ('' = blank) while the form is open
  const [log, setLog]           = useState(null);   // day key
  const [allRequests, setAllRequests] = useState(false);
  const [openReq, setOpenReq]   = useState(null);
  const historyRef = useRef(null);

  const weekFrom = addDays(selected, -dateOf(selected).getDay());
  const weekTo   = addDays(weekFrom, 6);
  const prevMonth = addMonths(month, -1);

  const { data: cur, loading } = useFetch(() => getMyAttendance(monthParams(month)), [month, version]);
  const { data: prev }         = useFetch(() => getMyAttendance(monthParams(prevMonth)), [prevMonth]);
  const { data: week, loading: weekLoading } = useFetch(() => getMyAttendance({ from: weekFrom, to: weekTo }), [weekFrom, version]);
  const { data: regs }         = useFetch(() => getMyRegularizations(), [version]);

  useEffect(() => { setHistPage(1); }, [month, histStatus, histQuery]);

  const summary  = cur?.summary || {};
  const psummary = prev?.summary || {};
  const requests = regs?.requests || [];
  const pending  = requests.filter((r) => r.status === 'pending').length;
  const weekDays = (week?.days || []).filter((d) => d.key);
  const day      = weekDays.find((d) => d.key === selected) || null;
  const todayState = week?.today || cur?.today || null;
  // Punches are only ever made for today, and not on a day of approved leave.
  const clockable = selected === today && !!todayState && !todayState.onLeave;

  const presentPct = percentOf(summary);
  const presentPrev = percentOf(psummary);
  const absentPct = shareOf(summary.absent, summary);
  const absentPrev = shareOf(psummary.absent, psummary);
  const notMarked = (cur?.days || []).filter((d) => d.status === 'pending').length;

  const act = async (fn, verb) => {
    setBusy(true);
    try {
      const res = await fn();
      const at = res?.data?.checkOut || res?.data?.checkIn;
      toast.success(`${verb}${at ? ` at ${fmtClock(at)}` : ''}`);
      setVersion((v) => v + 1);
    } catch (e) { toast.error(e?.message || 'Could not update your attendance'); }
    finally { setBusy(false); }
  };

  const history = useMemo(() => {
    const q = histQuery.trim().toLowerCase();
    return (cur?.days || [])
      .filter((d) => d.status && !['weekend'].includes(d.status) && d.key <= today)
      .filter((d) => !histStatus || d.status === histStatus)
      .filter((d) => !q || fmtDay(d.key).toLowerCase().includes(q) || d.key.includes(q)
        || String(d.label || d.remarks || '').toLowerCase().includes(q))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [cur, histStatus, histQuery, today]);
  const histPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE));
  const histRows = history.slice((histPage - 1) * HISTORY_PAGE, histPage * HISTORY_PAGE);

  const downloadReport = () => downloadCsv(`my-attendance-${month.slice(0, 7)}.csv`,
    ['Date', 'Day', 'Check In', 'Check Out', 'Total Hours', 'Status', 'Remark'],
    history.slice().reverse().map((d) => [d.key, WEEKDAYS[dateOf(d.key).getDay()], d.checkIn || '', d.checkOut || '',
      workedFor(d.checkIn, d.checkOut), STATUS[d.status]?.label || d.status, d.label || d.remarks || '']));

  const toHistory = () => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const monthOptions = Array.from({ length: 12 }, (_, i) => addMonths(`${today.slice(0, 7)}-01`, -i));

  const periodCaption = month.slice(0, 7) === today.slice(0, 7) ? 'This Month' : fmtMonth(month);

  const insight = (() => {
    if (presentPct == null) return { tone: 'flat', text: 'Nothing has been counted this month yet.' };
    if (presentPrev == null) return { tone: 'flat', text: `${presentPct}% attendance so far — there is no ${fmtMonth(prevMonth)} to compare with.` };
    const diff = presentPct - presentPrev;
    if (diff > 0) return { tone: 'good', text: <>You are <span className="tat-ink--green">{diff}%</span> more consistent than last month.</> };
    if (diff < 0) return { tone: 'bad', text: <>You are <span className="tat-ink--red">{Math.abs(diff)}%</span> less consistent than last month.</> };
    return { tone: 'flat', text: 'Steady — the same as last month.' };
  })();

  const rail = (
    <>
      <Card className="tat-monthcard" title="This Month"
        actions={(
          <PillSelect value={month} onChange={setMonth} className="tat-pillselect--sm">
            {monthOptions.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </PillSelect>
        )}>
        <div className={`tat-donutwrap${loading ? ' tat-dim' : ''}`}>
          <Donut summary={summary} value={presentPct} />
          <ul className="tat-donutlegend">
            {[...OWED.map((k) => [k, summary[k] || 0]), ['unmarked', notMarked]].map(([k, n]) => (
              <li key={k}><i style={{ background: STATUS[k].dot }} /><span>{k === 'unmarked' ? 'Not Marked' : STATUS[k].label}</span><b>{n}</b></li>
            ))}
          </ul>
        </div>
      </Card>

      <section className={`tat-insight tat-insight--${insight.tone}`}>
        <span className="tat-insight__icon"><Icon name="chart" size={24} /></span>
        <div><b>Attendance Insights</b><p>{insight.text}</p></div>
        {insight.tone !== 'flat' && <Icon name={insight.tone === 'good' ? 'trending' : 'trendDown'} size={30} strokeWidth={2} />}
      </section>

      <Card title="Quick Actions">
        <div className="tat-quick">
          <button type="button" className="tat-quick__btn" onClick={() => setRequest('')}>
            <Icon name="fileDoc" size={20} /> Request Regularization
          </button>
          <button type="button" className="tat-quick__btn" onClick={toHistory}>
            <Icon name="history" size={20} /> View Attendance History
          </button>
          <button type="button" className="tat-quick__btn" onClick={downloadReport}>
            <Icon name="download" size={20} /> Download Report
          </button>
        </div>
      </Card>

      <Card title="Recent Regularization Requests" className="tat-reqlistcard"
        actions={<button type="button" className="tat-link" onClick={() => setAllRequests(true)}>View All <Icon name="chevronRight" size={14} /><Icon name="chevronRight" size={14} style={{ marginLeft: -10 }} /></button>}>
        {requests.length === 0 ? <p className="tat-muted tat-small">You have not raised any.</p> : (
          <RequestList items={requests.slice(0, 3)} onOpen={setOpenReq} />
        )}
      </Card>
    </>
  );

  return (
    <Frame tab={tab} onTab={onTab} rail={rail}
      subtitle="Manage your attendance, view history and request regularization."
      actions={(
        <>
          <button type="button" className="tat-btn tat-btn--primary tat-btn--lg" onClick={() => setAllRequests(true)}>
            <Icon name="refresh" size={19} /> Regularization Requests
            {pending ? <span className="tat-badge">{pending}</span> : null}
          </button>
          <button type="button" className="tat-btn tat-btn--lg" onClick={toHistory}>
            <Icon name="history" size={19} /> Attendance History
          </button>
        </>
      )}>

      <div className="tat-tiles tat-tiles--4">
        <Tile layout="stack" icon="calendar" tone="green" value={summary.present || 0} label="Present"
          note={presentPct == null ? '—' : `${presentPct}%`} caption={periodCaption}
          trail={presentPct != null && presentPrev != null ? <Change value={presentPct - presentPrev} /> : <Dash />} />
        <Tile layout="stack" icon="user" tone="red" value={summary.absent || 0} label="Absent"
          note={absentPct == null ? '—' : `${absentPct}%`} caption={periodCaption}
          trail={absentPct != null && absentPrev != null ? <Change value={absentPct - absentPrev} good="down" /> : <Dash />} />
        <Tile layout="stack" icon="gauge" tone="amber" value={summary.leave || 0} label="Leave"
          caption={periodCaption} trail={<Dash />} />
        <Tile layout="stack" icon="users" tone="indigo" value={summary['half-day'] || 0} label="Half-Day"
          caption={periodCaption} trail={<Dash />} />
      </div>

      <div className="tat-weekrow">
        <section className="tat-card tat-weekcard">
          <header className="tat-weekcard__head">
            <h2>My Attendance Calendar</h2>
            <div className="tat-weekcard__nav">
              <button type="button" className="tat-iconbtn" aria-label="Previous week" onClick={() => setSelected(addDays(selected, -7))}>
                <Icon name="chevronLeft" size={18} />
              </button>
              <b>{fmtMonth(selected)}</b>
              <button type="button" className="tat-iconbtn" aria-label="Next week" disabled={weekTo >= today}
                onClick={() => setSelected(addDays(selected, 7) > today ? today : addDays(selected, 7))}>
                <Icon name="chevronRight" size={18} />
              </button>
              <button type="button" className="tat-btn tat-btn--sm" onClick={() => setSelected(today)}>Today</button>
            </div>
          </header>
          <div className={`tat-week${weekLoading ? ' is-loading' : ''}`}>
            {Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i)).map((k, i) => {
              const d = weekDays.find((x) => x.key === k);
              const st = d?.status && d.status !== 'weekend' ? d.status : null;
              const future = k > today;
              return (
                <button key={k} type="button" disabled={future}
                  className={`tat-week__day${k === selected ? ' is-on' : ''}${d?.status === 'weekend' ? ' is-off' : ''}`}
                  title={[fmtDay(k), st ? STATUS[st]?.label : future ? 'Upcoming' : '', d?.label].filter(Boolean).join(' · ')}
                  onClick={() => setSelected(k)}>
                  <small>{WEEKDAYS[i]}</small>
                  <b>{dateOf(k).getDate()}</b>
                  <i className={st && STATUS[st] && !['pending', 'holiday'].includes(st) ? '' : 'is-none'}
                    style={st && !['pending', 'holiday'].includes(st) ? { background: STATUS[st].dot } : undefined} />
                </button>
              );
            })}
          </div>
          <ul className="tat-legend tat-legend--row">
            {[...OWED, 'unmarked'].map((k) => <li key={k}><i style={{ background: STATUS[k].dot }} />{k === 'unmarked' ? 'Not Marked' : STATUS[k].label}</li>)}
          </ul>
        </section>

        <section className="tat-card tat-daycard">
          <header className="tat-daycard__head">
            <b>{`${dateOf(selected).toLocaleDateString('en-GB', { weekday: 'long' })}, ${dateOf(selected).getDate()} ${dateOf(selected).toLocaleDateString('en-GB', { month: 'long' })} ${dateOf(selected).getFullYear()}`}</b>
            {day?.status && !['weekend', 'pending'].includes(day.status) ? (
              <span className={`atn-pill atn-pill--${STATUS[day.status]?.tone || 'muted'}`}>
                {day.status === 'present' && <Icon name="checkCircle" size={14} strokeWidth={2.2} />}{STATUS[day.status]?.label}
              </span>
            ) : day?.status === 'weekend' ? <StatusPill status="weekend" label="Weekly off" />
              : day?.status === 'pending' ? <StatusPill status="pending" label="Not clocked in" /> : null}
          </header>
          {/* Today's punches are made where their value would be: the row holds
              the button until the punch exists. */}
          <dl className="tat-daycard__facts">
            <div><dt>Clock In</dt><dd>
              {day?.checkIn ? fmtClock(day.checkIn)
                : clockable && !todayState.clockedIn
                  ? <button type="button" className="tat-btn tat-btn--primary" disabled={busy} onClick={() => act(clockIn, 'Clocked in')}><Icon name="logIn" size={14} /> Clock In</button>
                  : '—'}
            </dd></div>
            <div><dt>Clock Out</dt><dd>
              {day?.checkOut ? fmtClock(day.checkOut)
                : clockable && todayState.clockedIn
                ? <button type="button" className="tat-btn tat-btn--primary" disabled={busy} onClick={() => act(clockOut, 'Clocked out')}><Icon name="logOut" size={14} /> Clock Out</button>
                : '—'}
            </dd></div>
            <div><dt>Total Hours</dt><dd>{workedFor(day?.checkIn, day?.checkOut) || '—'}</dd></div>
            <div><dt>Location</dt><dd>{day?.checkIn ? <><Icon name="mapPin" size={15} />{schoolName}</> : '—'}</dd></div>
          </dl>
          <div className="tat-daycard__acts">
            <button type="button" className="tat-btn tat-btn--soft"
              title={canRegularize(day) ? '' : 'Pick a past working day with a missed punch, or choose the date in the form'}
              onClick={() => setRequest(canRegularize(day) ? selected : '')}>
              <Icon name="fileDoc" size={17} /> Request Regularization
            </button>
            <button type="button" className="tat-btn" onClick={() => setLog(selected)}>
              <Icon name="history" size={17} /> View Logs
            </button>
          </div>
        </section>
      </div>

      <div ref={historyRef}>
        <Card title="Attendance History" sub="Your daily attendance records" className="tat-historycard" bodyClass="tat-card__body--flush"
          actions={(
            <>
              <PillSelect value={month} onChange={setMonth} className="tat-pillselect--sm">
                {monthOptions.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </PillSelect>
              <PillSelect value={histStatus} onChange={setHistStatus} className="tat-pillselect--sm">
                <option value="">All Status</option>
                {['present', 'absent', 'leave', 'half-day', 'holiday'].map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
              </PillSelect>
              <label className="tat-search">
                <Icon name="search" size={16} />
                <input value={histQuery} placeholder="Search by date or remark..." aria-label="Search history"
                  onChange={(e) => setHistQuery(e.target.value)} />
              </label>
            </>
          )}>
          {loading && !cur ? <div className="tat-center"><Spinner /></div>
            : histRows.length === 0 ? <Empty icon="calendar" title="No records">Nothing matches in {fmtMonth(month)}.</Empty> : (
              <div className="tat-tablewrap">
                <table className="tat-table tat-table--history">
                  <thead>
                    <tr><th>Date</th><th>Day</th><th>Check In</th><th>Check Out</th><th>Total Hours</th><th>Status</th><th>Remark</th><th className="tat-table__act">Actions</th></tr>
                  </thead>
                  <tbody>
                    {histRows.map((d) => (
                      <tr key={d.key}>
                        <td>{fmtDay(d.key)}</td>
                        <td>{WEEKDAYS[dateOf(d.key).getDay()]}</td>
                        <td>{d.checkIn ? fmtClock(d.checkIn) : '–'}</td>
                        <td>{d.checkOut ? fmtClock(d.checkOut) : '–'}</td>
                        <td>{workedFor(d.checkIn, d.checkOut) || '–'}</td>
                        <td><StatusPill status={d.status} /></td>
                        <td className="tat-table__reason tat-muted">{d.label || (d.source === 'regularized' ? 'Regularized' : '') || '–'}</td>
                        <td className="tat-table__act">
                          <RowMenu>
                            <MenuItem icon="eye" onClick={() => { setSelected(d.key); setLog(d.key); }}>View log</MenuItem>
                            {canRegularize(d) && <MenuItem icon="pencil" onClick={() => setRequest(d.key)}>Request regularization</MenuItem>}
                          </RowMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <footer className="tat-foot">
            <ShowingCount page={histPage} limit={HISTORY_PAGE} count={histRows.length} total={history.length} noun="record" />
            <Pager page={histPage} pages={histPages} onPage={setHistPage} />
          </footer>
        </Card>
      </div>

      {request !== null && (
        <RequestDialog date={request} onClose={() => setRequest(null)}
          onSaved={() => { setRequest(null); setVersion((v) => v + 1); }} />
      )}
      {log && <DayLog dayKey={log} onClose={() => setLog(null)} requests={requests} />}
      <Modal open={allRequests} onClose={() => setAllRequests(false)} maxWidth={560}
        title={<span className="tat-modaltitle"><Icon name="refresh" size={20} /> Regularization requests</span>}
        footer={<Button onClick={() => { setAllRequests(false); setRequest(''); }}><Icon name="plus" size={15} /> New request</Button>}>
        {requests.length === 0 ? <Empty icon="fileDoc" title="No requests yet">Missed a punch? Ask for it to be recorded.</Empty>
          : <RequestList items={requests} onOpen={(r) => { setAllRequests(false); setOpenReq(r); }} />}
      </Modal>
      {openReq && <RequestDetail request={openReq} onClose={() => setOpenReq(null)} />}
    </Frame>
  );
}

// ── Donut ────────────────────────────────────────────────────────────────────

/**
 * The month's owed days as parts of a whole — present, absent, leave, half-day —
 * with the attendance percentage in the middle. 2px gaps between segments; each
 * segment names itself on hover; the legend beside it carries every count.
 */
function Donut({ summary, value, size = 150, stroke = 16 }) {
  const parts = OWED.map((k) => ({ k, n: summary[k] || 0 })).filter((p) => p.n > 0);
  const total = parts.reduce((n, p) => n + p.n, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = parts.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="tat-donut" style={{ width: size, height: size }}
      role="img" aria-label={parts.map((p) => `${STATUS[p.k].label} ${p.n}`).join(', ') || 'Nothing counted'}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        {parts.map((p) => {
          const len = (p.n / total) * c;
          const seg = (
            <circle key={p.k} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={STATUS[p.k].dot} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <title>{`${STATUS[p.k].label}: ${plural(p.n, 'day')}`}</title>
            </circle>
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="tat-donut__label">
        <b>{value == null ? '—' : `${value}%`}</b>
        <span>Present</span>
      </div>
    </div>
  );
}

// ── Requests ─────────────────────────────────────────────────────────────────

function RequestList({ items, onOpen }) {
  return (
    <ul className="tat-reqs">
      {items.map((r) => {
        const d = dateOf(String(r.date).slice(0, 10));
        return (
          <li key={r._id}>
            <button type="button" onClick={() => onOpen(r)}>
              <span className="tat-datetile"><b>{String(d.getDate()).padStart(2, '0')}</b><small>{monthShort(d)}</small></span>
              <span className="tat-reqs__text"><b>{requestTitle(r)}</b><small title={punchNote(r)}>{r.reason || punchNote(r) || '—'}</small></span>
              <StatusPill status={reqStatus(r.status)} />
              <Icon name="chevronRight" size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RequestDetail({ request: r, onClose }) {
  return (
    <Modal open onClose={onClose} maxWidth={480}
      title={<span className="tat-modaltitle"><Icon name="fileDoc" size={20} /> {requestTitle(r)}</span>}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <dl className="tat-facts">
        <div><dt>Date</dt><dd>{fmtDay(r.date)}</dd></div>
        <div><dt>Status</dt><dd><StatusPill status={reqStatus(r.status)} /></dd></div>
        <div><dt>Clock in asked for</dt><dd>{r.checkIn ? fmtClock(r.checkIn) : '—'}</dd></div>
        <div><dt>Clock out asked for</dt><dd>{r.checkOut ? fmtClock(r.checkOut) : '—'}</dd></div>
        <div className="is-wide"><dt>Reason</dt><dd>{r.reason || '—'}</dd></div>
        <div className="is-wide"><dt>Remarks</dt><dd>{r.adminRemarks || '—'}</dd></div>
        <div><dt>Raised</dt><dd>{r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</dd></div>
        <div><dt>Reviewed</dt><dd>{r.reviewedAt ? new Date(r.reviewedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</dd></div>
      </dl>
    </Modal>
  );
}

/** Everything recorded about one day, in the order it happened. */
function DayLog({ dayKey, onClose, requests }) {
  const { data, loading } = useFetch(() => getMyAttendance({ from: dayKey, to: dayKey }), [dayKey]);
  const d = data?.days?.[0];
  const onDay = requests.filter((r) => String(r.date).slice(0, 10) === dayKey);
  const events = [
    d?.checkIn && { icon: 'logIn', tone: 'green', title: `Clocked in at ${fmtClock(d.checkIn)}`, sub: d.source === 'regularized' ? 'Recorded by regularization' : 'Self clock-in' },
    d?.checkOut && { icon: 'logOut', tone: 'indigo', title: `Clocked out at ${fmtClock(d.checkOut)}`, sub: workedFor(d.checkIn, d.checkOut) ? `Worked ${workedFor(d.checkIn, d.checkOut)}` : '' },
    (d?.status === 'leave' || d?.status === 'half-day') && { icon: 'umbrella', tone: 'amber', title: STATUS[d.status].label, sub: d.label },
    d?.status === 'holiday' && { icon: 'party', tone: 'slate', title: 'Holiday', sub: d.label },
    d?.status === 'absent' && { icon: 'alert', tone: 'red', title: 'No clock-in recorded', sub: 'A past working day with no punch counts as absent' },
    ...onDay.map((r) => ({
      icon: 'fileDoc', tone: r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : 'amber',
      title: `${requestTitle(r)} — ${STATUS[reqStatus(r.status)]?.label || r.status}`,
      sub: [r.checkIn && `In ${fmtClock(r.checkIn)}`, r.checkOut && `Out ${fmtClock(r.checkOut)}`, r.reason].filter(Boolean).join(' · '),
    })),
  ].filter(Boolean);

  return (
    <Modal open onClose={onClose} maxWidth={500}
      title={<span className="tat-modaltitle"><Icon name="clock" size={20} /> {dateOf(dayKey).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {loading ? <div className="tat-center"><Spinner /></div>
        : !events.length ? <Empty icon="calendar" title="Nothing recorded">{d?.status === 'weekend' ? 'A weekly off.' : 'No punches, leave or requests on this day.'}</Empty>
        : (
          <ol className="tat-timeline">
            {events.map((e, i) => (
              <li key={i} className={`tat-timeline__item tat-timeline__item--${e.tone}`}>
                <i />
                <div><b>{e.title}</b>{e.sub ? <small>{e.sub}</small> : null}</div>
              </li>
            ))}
          </ol>
        )}
    </Modal>
  );
}

/** Ask for a missed punch to be recorded. The school office approves it. */
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
    <Modal open onClose={onClose} maxWidth={540}
      title={<span className="tat-modaltitle"><Icon name="fileDoc" size={20} /> Request regularization</span>}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="tat-regform" loading={saving} disabled={blocked}>Send for approval</Button>
      </>}>
      <form id="tat-regform" onSubmit={submit} className="tat-form">
        <p className="tat-muted tat-small">Enter only the punch you missed. The school office approves it.</p>
        <div className="form-group">
          <label className="form-label required" htmlFor="tat-rg-date">Date</label>
          <input id="tat-rg-date" type="date" className="form-control" required max={addDays(todayKey(), -1)} value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </div>
        {form.date && day && (
          <div className={`tat-callout tat-callout--${blocked ? 'warn' : 'info'}`}>
            <Icon name={blocked ? 'alert' : 'info'} size={17} />
            <span>
              {day.status === 'present' && <>Recorded: in <b>{day.checkIn ? fmtClock(day.checkIn) : 'missing'}</b>, out <b>{day.checkOut ? fmtClock(day.checkOut) : 'missing'}</b>.</>}
              {day.status === 'absent' && <>No punches recorded — this day currently counts as <b>absent</b>.</>}
              {blocked && <>{STATUS[day.status]?.label}{day.label ? ` (${day.label})` : ''} — there is nothing to regularize.</>}
              {!day.status && <>Nothing is owed on this day.</>}
            </span>
          </div>
        )}
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label" htmlFor="tat-rg-in">Clock-in time</label>
            <input id="tat-rg-in" type="time" className="form-control" value={form.checkIn}
              onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="tat-rg-out">Clock-out time</label>
            <input id="tat-rg-out" type="time" className="form-control" value={form.checkOut}
              onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label required" htmlFor="tat-rg-reason">Reason</label>
          <textarea id="tat-rg-reason" className="form-control" rows={3} required maxLength={500} value={form.reason}
            placeholder="e.g. Was in school but forgot to clock in"
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </div>
      </form>
    </Modal>
  );
}
