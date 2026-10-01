/**
 * The resident's own hostel page, in pieces — shared by a student, a parent
 * looking at a child, and a member of staff who lives in.
 *
 * Built from the same kit as the management screens (hsUI / hsList), so a
 * resident's page and the warden's desk read as one module. Everything here is
 * presentational: MyHostel.jsx loads the data and owns the forms.
 */
import React from 'react';
import { Glyph, Mark, Card, CardHead, words } from './admin/hsUI';
import { Btn, Badge, Avatar, Person, TwoLine, Kpis, Kpi, DataTable, ListCard, EmptyRows, fmtDate, fmtTime, rupees } from './admin/hsList';
import { ampm } from './admin/hsForm';

/* ── Shared small things ─────────────────────────────────────────────────── */

const TONE = {
  pending: 'amber', pending_approval: 'amber', applied: 'blue', parent_approved: 'blue', approved: 'green', rejected: 'red',
  waitlisted: 'amber', cancelled: 'slate', completed: 'green', active: 'green', returned: 'blue', overdue: 'red', draft: 'slate',
  present: 'green', absent: 'red', late: 'amber', excused: 'blue', on_leave: 'blue',
  open: 'amber', assigned: 'blue', in_progress: 'blue', resolved: 'green', reopened: 'amber', closed: 'slate', on_hold: 'slate',
  partial: 'amber', paid: 'green', refunded: 'slate',
  expected: 'blue', checked_in: 'green', checked_out: 'slate', blocked: 'red', denied: 'red',
  low: 'slate', medium: 'blue', high: 'amber', urgent: 'red',
  verified: 'green', issued: 'amber', served: 'slate', acknowledged: 'blue', appealed: 'violet', revoked: 'slate',
};
/** A status as a tinted tag; an unknown one is drawn grey rather than dropped. */
export const Status = ({ value, dot = true, size }) => (value
  ? <Badge tone={TONE[value] || 'slate'} dot={dot} size={size}>{words(value)}</Badge>
  : <span className="hs-muted">—</span>);

export const roomNo = (n) => (n ? (/^room\b/i.test(String(n)) ? String(n) : `Room ${n}`) : '');
const stamp = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '—');
const dash = (v) => (v === 0 || v ? v : '—');

/** Label / value pairs, as the cards on the overview list them. */
export const Facts = ({ rows }) => (
  <dl className="hsr-kv">
    {rows.filter((r) => r && (r[1] || r[1] === 0)).map(([k, v, icon]) => (
      <React.Fragment key={k}>
        <dt>{icon ? <Glyph name={icon} size={16} /> : null}{k}</dt>
        <dd>{v}</dd>
      </React.Fragment>
    ))}
  </dl>
);

/** A card's head with its count and one action, on a list tab. */
const ListHead = ({ icon, title, count, children }) => (
  <>
    <span className="hsr-lhead">
      <Mark name={icon} tone="indigo" size={34} glyph={19} />
      <h3>{title}{count != null ? <small>{count}</small> : null}</h3>
    </span>
    {children}
  </>
);

/* ── Parent: which child ─────────────────────────────────────────────────── */

export const ChildSwitch = ({ kids, value, onChange }) => (
  <div className="hsr-kids" role="tablist" aria-label="Children">
    {kids.map((k) => (
      <button key={k._id} type="button" role="tab" aria-selected={k._id === value} className={`hsr-kid${k._id === value ? ' is-on' : ''}`} onClick={() => onChange(k._id)}>
        <Avatar name={k.name} src={k.profileImage} size={28} />
        <span>{k.name}{k.className ? <small>{k.className}</small> : null}</span>
      </button>
    ))}
  </div>
);

/* ── The resident, and where they live ───────────────────────────────────── */

const PRESENCE = { in: ['In hostel', 'green'], out: ['Out of hostel', 'amber'], on_leave: ['On leave', 'blue'] };

export function ResidentHero({ st, c, staff }) {
  const cls = [st?.profile?.currentClass?.className, st?.profile?.currentSection?.sectionName].filter(Boolean).join(' - ');
  const meta = staff
    ? [st?.staff?.designation || 'Teacher', st?.staff?.employeeId && `Emp. ID ${st.staff.employeeId}`]
    : [cls, st?.profile?.admissionNumber && `Adm. No. ${st.profile.admissionNumber}`];
  const [presence, tone] = c.status === 'pending' ? ['Bed reserved', 'amber'] : (PRESENCE[c.presence] || PRESENCE.in);
  return (
    <section className="hsr-hero" aria-label="Resident">
      <div className="hsr-hero__who">
        <Avatar name={st?.name} src={st?.profileImage} size={60} />
        <div>
          <strong>{st?.name}</strong>
          <span>{meta.filter(Boolean).join(' · ')}</span>
          <Badge tone={tone} dot>{presence}</Badge>
        </div>
      </div>
      <dl className="hsr-hero__facts">
        {[['Hostel', c.hostel?.name, 'oBuilding'], ['Building', c.building?.name, 'oBuilding'], ['Floor', c.floor?.name, 'layers'],
          ['Room', c.room?.roomNumber ? String(c.room.roomNumber).replace(/^room\s*/i, '') : '', 'oDoor'], ['Bed', c.bed?.bedNumber, 'oBed'],
          ['Since', fmtDate(c.fromDate), 'calendar']].map(([k, v, icon]) => (
            <div key={k} className="hsr-fact">
              <dt><Glyph name={icon} size={15} />{k}</dt>
              <dd>{dash(v)}</dd>
            </div>
        ))}
      </dl>
    </section>
  );
}

/** The four figures over the tabs. Each opens the tab it is about. */
export function HeadlineKpis({ stats = {}, onTab }) {
  const requests = (stats.pendingLeaves || 0) + (stats.openOutpasses || 0);
  return (
    <Kpis cols={4} size="sm">
      <Kpi tone="green" icon="checkCircle" label="Attendance" onClick={() => onTab('attendance')}
        value={stats.presentPct == null ? '—' : `${stats.presentPct}%`}
        note={stats.rollCalls ? `Last ${stats.rollCalls} roll call${stats.rollCalls === 1 ? '' : 's'}` : 'No roll call taken yet'} />
      <Kpi tone={stats.outstanding > 0 ? 'amber' : 'green'} icon="rupee" label="Fees Outstanding" onClick={() => onTab('fees')}
        value={rupees(stats.outstanding || 0)}
        note={stats.dueInvoices ? `${stats.dueInvoices} invoice${stats.dueInvoices === 1 ? '' : 's'}${stats.overdueInvoices ? ` · ${stats.overdueInvoices} overdue` : ''}` : 'Nothing to pay'} />
      <Kpi tone="blue" icon="passes" label="Open Requests" onClick={() => onTab(stats.pendingLeaves ? 'leave' : 'outpass')}
        value={requests}
        note={requests ? `${stats.pendingLeaves || 0} leave · ${stats.openOutpasses || 0} outpass` : 'No leave or outpass waiting'} />
      <Kpi tone={stats.openComplaints ? 'red' : 'violet'} icon="chatSolid" label="Open Complaints" onClick={() => onTab('complaints')}
        value={stats.openComplaints || 0} note={stats.openComplaints ? 'Being looked at' : 'Nothing open'} />
    </Kpis>
  );
}

/* ── Overview ────────────────────────────────────────────────────────────── */

export function OverviewTab({ data, who, onRoomChange }) {
  const c = data.current; const r = data.rules || {};
  const mates = data.roommates || [];
  // The latest room-change request: waiting, or (for a fortnight) how it ended.
  const rc = data.roomChange;
  const recent = rc?.decidedAt && Date.now() - new Date(rc.decidedAt) < 14 * 864e5;
  return (
    <div className="hsr-grid">
      <Card label="Room">
        <CardHead icon="bedSolid" tone="indigo" title="Room" rule />
        <Facts rows={[
          ['Hostel', c.hostel?.name, 'oBuilding'], ['Building & floor', [c.building?.name, c.floor?.name].filter(Boolean).join(' · '), 'layers'],
          ['Room', [roomNo(c.room?.roomNumber), c.room?.roomType && words(c.room.roomType)].filter(Boolean).join(' · '), 'oDoor'],
          ['Bed', c.bed?.bedNumber ? `Bed ${c.bed.bedNumber}${c.bed.code ? ` (${c.bed.code})` : ''}` : '', 'oBed'],
          ['Allocated', [fmtDate(c.fromDate), words(c.allocationType)].filter(Boolean).join(' · '), 'calendar'],
          ['Until', c.toDate ? fmtDate(c.toDate) : '', 'calendar'],
        ]} />
        {c.room?.facilities?.length ? <div className="hsr-chips">{c.room.facilities.map((f) => <Badge key={f} tone="slate">{words(f)}</Badge>)}</div> : null}
        {rc?.status === 'pending' ? (
          <div className="hsr-banner is-warn hsr-cardnote"><Glyph name="clockSolid" size={18} /><span><b>Room change requested</b> ({rc.requestNumber}, {fmtDate(rc.createdAt)}). The hostel office will decide and choose the bed.</span></div>
        ) : rc?.status === 'rejected' && recent ? (
          <div className="hsr-banner is-warn hsr-cardnote"><Glyph name="alertTri" size={18} /><span><b>Room change not approved.</b> {rc.decisionRemark}</span></div>
        ) : rc?.status === 'approved' && recent ? (
          <div className="hsr-banner hsr-cardnote"><Glyph name="checkCircle" size={18} /><span><b>Room change approved</b> on {fmtDate(rc.decidedAt)} — this is the new room.</span></div>
        ) : null}
        {onRoomChange && rc?.status !== 'pending' ? (
          <div className="hsr-cardfoot"><Btn size="sm" icon="repeat" onClick={onRoomChange}>Request Room Change</Btn></div>
        ) : null}
      </Card>

      <Card label="Warden">
        <CardHead icon="shieldSolid" tone="violet" title="Warden" rule />
        {data.warden ? (
          <>
            <div className="hsr-person"><Person name={data.warden.name} src={data.warden.profileImage} sub="Hostel warden" size={44} /></div>
            <Facts rows={[
              ['Phone', data.warden.phone ? <a href={`tel:${data.warden.phone}`}>{data.warden.phone}</a> : '', 'phone'],
              ['Email', data.warden.email ? <a href={`mailto:${data.warden.email}`}>{data.warden.email}</a> : '', 'mail'],
              ['Hostel office', c.hostel?.contactNumber ? <a href={`tel:${c.hostel.contactNumber}`}>{c.hostel.contactNumber}</a> : '', 'phone'],
            ]} />
          </>
        ) : <p className="hsr-none">No warden has been assigned to this hostel yet.</p>}
      </Card>

      <Card label="Timings">
        <CardHead icon="clockSolid" tone="amber" title="Timings" rule />
        <Facts rows={[
          ['Gate opens', ampm(r.entryTime), 'logIn'], ['Gate closes', ampm(r.exitTime), 'logOut'], ['Curfew', ampm(r.curfewTime), 'clock'],
          ['Visitors', r.visitorFrom && r.visitorTo ? `${ampm(r.visitorFrom)} – ${ampm(r.visitorTo)}${(r.visitorDays || []).length ? ` · ${r.visitorDays.join(', ')}` : ''}` : '', 'users'],
          ['Outpass', r.outpassFrom && r.outpassTo ? `${ampm(r.outpassFrom)} – ${ampm(r.outpassTo)}${r.maxOutpassHours ? ` · up to ${r.maxOutpassHours} h` : ''}` : '', 'oExit'],
        ]} />
      </Card>

      <Card label="Roommates">
        <CardHead icon="people" tone="teal" title={`Roommates (${mates.length})`} rule />
        {mates.length ? (
          <ul className="hsr-list">
            {mates.map((m) => (
              <li key={m._id}><Person name={m.student?.name} src={m.student?.profileImage} size={34} strong={false} /><Badge tone="slate">Bed {m.bed?.bedNumber}</Badge></li>
            ))}
          </ul>
        ) : <p className="hsr-none">{who === 'you' ? 'You have' : `${who} has`} the room to {who === 'you' ? 'yourself' : 'themselves'}.</p>}
      </Card>

      {data.assets?.length ? (
        <Card label="Items issued">
          <CardHead icon="boxSolid" tone="orange" title={`Items Issued (${data.assets.length})`} rule />
          <ul className="hsr-list">
            {data.assets.map((a) => <li key={a._id}><TwoLine top={`${a.name}${a.quantity > 1 ? ` × ${a.quantity}` : ''}`} sub={a.assetCode || a.category || ''} /><small>{fmtDate(a.issuedAt)}</small></li>)}
          </ul>
        </Card>
      ) : null}

      {r.facilities?.length ? (
        <Card label="Facilities">
          <CardHead icon="wifi" tone="blue" title="Hostel Facilities" rule />
          <div className="hsr-chips">{r.facilities.map((f) => <Badge key={f} tone="indigo">{words(f)}</Badge>)}</div>
        </Card>
      ) : null}

      {r.hostelRules?.length ? (
        <Card label="Hostel rules" className="is-wide">
          <CardHead icon="listSolid" tone="red" title="Hostel Rules" rule />
          <ol className="hsr-rules">{r.hostelRules.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </Card>
      ) : null}
    </div>
  );
}

/* ── Attendance ──────────────────────────────────────────────────────────── */

export function AttendanceTab({ att }) {
  const rows = att?.rows || []; const s = att?.summary || {};
  const strip = rows.slice(0, 30).reverse();
  return (
    <>
      <Kpis cols={4} size="xs">
        <Kpi tone="green" icon="checkCircle" value={s.present || 0} label="Present" />
        <Kpi tone="red" icon="xCircle" value={s.absent || 0} label="Absent" />
        <Kpi tone="amber" icon="clockSolid" value={s.late || 0} label="Late" />
        <Kpi tone="blue" icon="calendar" value={rows.length ? `${s.presentPercent || 0}%` : '—'} label="Present Rate" note={rows.length ? `${rows.length} roll calls` : 'No roll call yet'} />
      </Kpis>
      {strip.length ? (
        <div className="hsr-strip" aria-label={`The last ${strip.length} roll calls`}>
          <span>Last {strip.length}</span>
          <span className="hsr-dots">{strip.map((x) => <i key={x._id} className={`is-${TONE[x.status] || 'slate'}`} title={`${fmtDate(x.date)} · ${words(x.session)} · ${words(x.status)}`} />)}</span>
          <span className="hsr-legend"><i className="is-green" />Present<i className="is-amber" />Late<i className="is-red" />Absent<i className="is-blue" />Leave</span>
        </div>
      ) : null}
      <ListCard>
        <DataTable select={false} loading={!att} rows={rows} columns={[
          { key: 'date', label: 'Date', render: (x) => fmtDate(x.date), nowrap: true },
          { key: 'session', label: 'Session', render: (x) => words(x.session) },
          { key: 'status', label: 'Status', render: (x) => <Status value={x.status} /> },
          { key: 'remarks', label: 'Remarks', render: (x) => x.remarks || <span className="hs-muted">—</span> },
        ]} empty={<EmptyRows icon="checkCircle" title="No attendance yet">Roll calls taken by the warden appear here.</EmptyRows>} />
      </ListCard>
    </>
  );
}

/* ── Leave ───────────────────────────────────────────────────────────────── */

export function LeaveTab({ rows, role, onNew, onCancel, onConsent, onOpen }) {
  const list = rows || [];
  return (
    <ListCard head={<ListHead icon="beach" title="Leave Requests" count={list.length}><Btn kind="primary" icon="plus" onClick={onNew}>Request Leave</Btn></ListHead>}>
      <DataTable select={false} loading={!rows} rows={list} onRowClick={onOpen} columns={[
        { key: 'no', label: 'Leave', render: (x) => <TwoLine top={x.leaveNumber} sub={x.leaveType === 'home' ? 'Home leave' : words(x.leaveType)} strong /> },
        { key: 'dates', label: 'Dates', render: (x) => <TwoLine top={`${fmtDate(x.fromDate)} – ${fmtDate(x.toDate)}`} sub={`${x.totalDays} day${x.totalDays === 1 ? '' : 's'}`} />, nowrap: true },
        { key: 'reason', label: 'Reason', render: (x) => <span className="hsr-clip">{x.reason}</span>, hideNarrow: true },
        { key: 'status', label: 'Status', render: (x) => <Status value={x.status} /> },
      ]} actions={(x) => (
        <>
          {role === 'parent' && x.status === 'pending' ? (
            <>
              <Btn size="sm" kind="primary" icon="check" onClick={(e) => { e.stopPropagation(); onConsent(x._id, true); }}>Consent</Btn>
              <Btn size="sm" kind="danger" onClick={(e) => { e.stopPropagation(); onConsent(x._id, false); }}>Decline</Btn>
            </>
          ) : null}
          {['pending', 'parent_approved', 'approved'].includes(x.status)
            ? <Btn size="sm" onClick={(e) => { e.stopPropagation(); onCancel(x); }}>Cancel</Btn> : null}
        </>
      )} empty={<EmptyRows icon="beach" title="No leave requests" action={<Btn kind="primary" icon="plus" onClick={onNew}>Request Leave</Btn>}>Going home or away for a few days? File it here for the warden to approve.</EmptyRows>} />
    </ListCard>
  );
}

/* ── Outpass ─────────────────────────────────────────────────────────────── */

const OUTPASS_NAME = { day: 'Day out', night: 'Overnight', weekend: 'Weekend', other: 'Personal' };

/** A pass the school will not approve until a parent has agreed. */
export const awaitingParent = (x) => x.status === 'pending' && !!x.parentApprovalRequired && !x.parentApprovedAt;

export function OutpassTab({ rows, role, onNew, onCancel, onPass, onOpen, onConsent }) {
  const list = rows || [];
  return (
    <ListCard head={<ListHead icon="passes" title="Outpasses" count={list.length}><Btn kind="primary" icon="plus" onClick={onNew}>Request Outpass</Btn></ListHead>}>
      <DataTable select={false} loading={!rows} rows={list} onRowClick={onOpen} columns={[
        { key: 'no', label: 'Outpass', render: (x) => <TwoLine top={x.outpassNumber} sub={OUTPASS_NAME[x.outpassType] || words(x.outpassType)} strong /> },
        { key: 'when', label: 'When', render: (x) => <TwoLine top={fmtDate(x.departureDate)} sub={[ampm(x.expectedDepartureTime), x.expectedReturnAt ? `back ${stamp(x.expectedReturnAt)}` : ampm(x.expectedReturnTime)].filter(Boolean).join(' → ')} />, nowrap: true },
        { key: 'purpose', label: 'Purpose', render: (x) => <span className="hsr-clip">{x.purpose}</span>, hideNarrow: true },
        { key: 'status', label: 'Status', render: (x) => (
          <span className="hs-stack"><Status value={x.status} />{awaitingParent(x) ? <small className="is-warn">{role === 'parent' ? 'Needs your consent' : 'Waiting for a parent'}</small> : null}</span>
        ) },
      ]} actions={(x) => (
        <>
          {role === 'parent' && awaitingParent(x) && onConsent ? (
            <>
              <Btn size="sm" kind="primary" icon="check" onClick={(e) => { e.stopPropagation(); onConsent(x._id, true); }}>Consent</Btn>
              <Btn size="sm" kind="danger" onClick={(e) => { e.stopPropagation(); onConsent(x._id, false); }}>Decline</Btn>
            </>
          ) : null}
          {role !== 'parent' && ['approved', 'active', 'overdue'].includes(x.status)
            ? <Btn size="sm" kind="primary" icon="qr" onClick={(e) => { e.stopPropagation(); onPass(x._id); }}>Gate Pass</Btn> : null}
          {['pending', 'approved'].includes(x.status)
            ? <Btn size="sm" onClick={(e) => { e.stopPropagation(); onCancel(x); }}>Cancel</Btn> : null}
        </>
      )} empty={<EmptyRows icon="passes" title="No outpasses" action={<Btn kind="primary" icon="plus" onClick={onNew}>Request Outpass</Btn>}>An outpass lets a resident leave the hostel for a few hours or a night.</EmptyRows>} />
    </ListCard>
  );
}

/* ── Visitors ────────────────────────────────────────────────────────────── */

export function VisitorsTab({ data, onNew, rules = {} }) {
  const visits = data?.visits || []; const blocked = data?.restricted || []; const known = data?.authorized || [];
  return (
    <>
      {blocked.length ? (
        <div className="hsr-banner is-warn"><Glyph name="alertTri" size={18} /><span><b>Restricted visitors:</b> {blocked.map((v) => v.visitorName).join(', ')}. They will not be let in.</span></div>
      ) : null}
      {known.length ? (
        <div className="hsr-banner"><Glyph name="checkCircle" size={18} /><span><b>Approved visitors on file:</b> {known.map((v) => [v.visitorName, v.relationship && `(${v.relationship})`].filter(Boolean).join(' ')).join(', ')}.</span></div>
      ) : null}
      <ListCard head={(
        <ListHead icon="walker" title="Visits" count={visits.length}>
          <span className="hsr-lhead__note">{rules.visitorFrom && rules.visitorTo ? `${(rules.visitorDays || []).join(', ') || 'Any day'}, ${ampm(rules.visitorFrom)} – ${ampm(rules.visitorTo)}` : ''}</span>
          <Btn kind="primary" icon="plus" onClick={onNew}>Pre-register Visitor</Btn>
        </ListHead>
      )}>
        <DataTable select={false} loading={!data} rows={visits} columns={[
          { key: 'name', label: 'Visitor', render: (x) => <Person name={x.visitorName} sub={[x.relationship, x.mobile].filter(Boolean).join(' · ')} size={34} /> },
          { key: 'purpose', label: 'Purpose', render: (x) => x.purpose || <span className="hs-muted">—</span>, hideNarrow: true },
          { key: 'expected', label: 'Expected', render: (x) => (x.scheduledAt ? stamp(x.scheduledAt) : '—'), nowrap: true },
          { key: 'in', label: 'In / Out', render: (x) => (x.entryTime ? <TwoLine top={stamp(x.entryTime)} sub={x.exitTime ? `out ${fmtTime(x.exitTime)}` : 'still inside'} /> : <span className="hs-muted">—</span>), nowrap: true },
          { key: 'status', label: 'Status', render: (x) => <Status value={x.status} /> },
        ]} empty={<EmptyRows icon="walker" title="No visitors yet" action={<Btn kind="primary" icon="plus" onClick={onNew}>Pre-register Visitor</Btn>}>Tell the hostel who is coming so the gate expects them.</EmptyRows>} />
      </ListCard>
    </>
  );
}

/* ── Mess ────────────────────────────────────────────────────────────────── */

const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** When a meal on `date` starts, from the mess's "HH:MM". */
const mealStart = (date, hhmm) => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); const d = new Date(date); d.setHours(h || 0, m || 0, 0, 0); return d; };

/**
 * "I will not be at this meal" — the week ahead, a meal at a time. A meal can
 * be skipped, or taken back, until the school's notice period before it starts;
 * after that the kitchen is already cooking for it.
 */
function SkipMeals({ served, timings, skips = [], notice = 0, onSkip, busy }) {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
  const isSkipped = (d, k) => skips.some((x) => x.meal === k && sameDay(x.date, d));
  return (
    <ListCard head={(
      <ListHead icon="cutlery" title="Skip a Meal">
        <span className="hsr-lhead__note">{notice ? `Tell the mess at least ${notice} hour${notice === 1 ? '' : 's'} before the meal` : 'Any time before the meal starts'}</span>
      </ListHead>
    )}>
      <div className="hs-table-wrap">
        <table className="hs-table hsr-menu hsr-skip">
          <thead><tr><th>Day</th>{served.map((k) => <th key={k}>{words(k)}</th>)}</tr></thead>
          <tbody>
            {days.map((d) => (
              <tr key={ymd(d)} className={sameDay(d, new Date()) ? 'is-today' : ''}>
                <td><TwoLine top={d.toLocaleDateString('en-IN', { weekday: 'long' })} sub={fmtDate(d)} strong /></td>
                {served.map((k) => {
                  const open = mealStart(d, timings[k].start) - Date.now() >= notice * 36e5;
                  const off = isSkipped(d, k);
                  const key = `${ymd(d)}:${k}`;
                  if (!open) return <td key={k}>{off ? <Badge tone="amber">Skipped</Badge> : <span className="hs-muted" title="Too late to change">—</span>}</td>;
                  return (
                    <td key={k}>
                      <button type="button" className={`hsr-skipbtn${off ? ' is-on' : ''}`} aria-pressed={off} disabled={busy === key}
                        onClick={() => onSkip(ymd(d), k, off)}>{off ? 'Skipping · undo' : 'Skip'}</button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ListCard>
  );
}

export function MessTab({ data, onSkip, busy }) {
  if (!data) return <ListCard><DataTable select={false} loading rows={[]} columns={[{ key: 'x', label: 'Menu' }]} /></ListCard>;
  if (!data.member) {
    return <ListCard><div className="hsr-pad"><EmptyRows icon="cutlery" title="Not enrolled in a mess">Speak to the hostel office to join the mess.</EmptyRows></div></ListCard>;
  }
  const m = data.member; const menu = data.menu || [];
  const meals = MEALS.filter((k) => menu.some((x) => x.meal === k)).concat([...new Set(menu.map((x) => x.meal))].filter((k) => !MEALS.includes(k)));
  const days = [...new Set(menu.map((x) => new Date(x.date).toDateString()))];
  const timings = m.mess?.mealTimings || {};
  // Meals the mess actually serves, in the order of the day.
  const served = MEALS.filter((k) => timings[k] && timings[k].enabled !== false && (timings[k].start || timings[k].end));
  return (
    <>
      <div className="hsr-grid">
        <Card label="Mess membership">
          <CardHead icon="cutlery" tone="orange" title={m.mess?.name || 'Mess'} rule />
          <Facts rows={[
            ['Food preference', words(m.foodPreference), 'cutlery'], ['Meal plan', words(m.mealPlan), 'calendar'],
            ['Allergies', (m.allergies || []).length ? m.allergies.map(words).join(', ') : 'None on record', 'oHeart'], ['Member since', fmtDate(m.fromDate), 'calendar'],
          ]} />
        </Card>
        <Card label="Meal timings">
          <CardHead icon="clockSolid" tone="amber" title="Meal Timings" rule />
          {served.length ? (
            <Facts rows={served.map((k) => [words(k), [ampm(timings[k].start), ampm(timings[k].end)].filter(Boolean).join(' – '), 'clock'])} />
          ) : <p className="hsr-none">The mess has not published its timings.</p>}
        </Card>
      </div>
      <ListCard head={<ListHead icon="cloche" title="This Week's Menu" />}>
        {days.length ? (
          <div className="hs-table-wrap">
            <table className="hs-table hsr-menu">
              <thead><tr><th>Day</th>{meals.map((k) => <th key={k}>{words(k)}</th>)}</tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d} className={sameDay(d, new Date()) ? 'is-today' : ''}>
                    <td><TwoLine top={new Date(d).toLocaleDateString('en-IN', { weekday: 'long' })} sub={fmtDate(d)} strong />{sameDay(d, new Date()) ? <Badge tone="indigo">Today</Badge> : null}</td>
                    {meals.map((k) => {
                      const cell = menu.find((x) => x.meal === k && sameDay(x.date, d));
                      return <td key={k}>{cell?.items?.length ? cell.items.join(', ') : <span className="hs-muted">—</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="hsr-pad"><EmptyRows icon="cloche" title="No menu published">The mess has not published a menu for this week yet.</EmptyRows></div>}
      </ListCard>
      {onSkip && served.length ? <SkipMeals served={served} timings={timings} skips={data.skips} notice={data.noticeHours || 0} onSkip={onSkip} busy={busy} /> : null}
    </>
  );
}

/* ── Complaints ──────────────────────────────────────────────────────────── */

export function ComplaintsTab({ rows, onNew, onReopen, onOpen }) {
  const list = rows || [];
  return (
    <ListCard head={<ListHead icon="chatSolid" title="Complaints" count={list.length}><Btn kind="primary" icon="plus" onClick={onNew}>Raise a Complaint</Btn></ListHead>}>
      <DataTable select={false} loading={!rows} rows={list} onRowClick={onOpen} columns={[
        { key: 'no', label: 'Ticket', render: (x) => <TwoLine top={x.ticketNumber} sub={words(x.category)} strong /> },
        { key: 'what', label: 'Complaint', render: (x) => <span className="hsr-clip">{x.subject || x.description}</span> },
        { key: 'priority', label: 'Priority', render: (x) => <Status value={x.priority} dot={false} />, hideNarrow: true },
        { key: 'raised', label: 'Raised', render: (x) => fmtDate(x.createdAt), nowrap: true, hideNarrow: true },
        { key: 'status', label: 'Status', render: (x) => <Status value={x.status} /> },
      ]} actions={(x) => (['resolved', 'closed'].includes(x.status)
        ? <Btn size="sm" icon="refresh" onClick={(e) => { e.stopPropagation(); onReopen(x); }}>Reopen</Btn> : null)}
        empty={<EmptyRows icon="chatSolid" title="No complaints raised" action={<Btn kind="primary" icon="plus" onClick={onNew}>Raise a Complaint</Btn>}>Something broken or not right? Report it and track it here.</EmptyRows>} />
    </ListCard>
  );
}

/* ── Record ──────────────────────────────────────────────────────────────── */

export function RecordTab({ data, who, onFile }) {
  const d = data || {};
  const loading = !data;
  return (
    <div className="hsr-grid">
      <Card label="Discipline">
        <CardHead icon="gavel" tone="red" title={`Discipline (${d.discipline?.length || 0})`} rule />
        {d.discipline?.length ? (
          <ul className="hsr-list">
            {d.discipline.map((x) => (
              <li key={x._id}>
                <TwoLine top={x.violation} sub={fmtDate(x.date)} />
                <span className="hsr-list__end"><Badge tone="violet">{words(x.actionType)}</Badge>{x.fineAmount > 0 ? <Badge tone="amber">{rupees(x.fineAmount)}</Badge> : null}</span>
              </li>
            ))}
          </ul>
        ) : <p className="hsr-none">{loading ? 'Loading…' : `A clean record — nothing has been raised against ${who}.`}</p>}
      </Card>

      <Card label="Gate movement">
        <CardHead icon="gateIn" tone="blue" title="Recent Gate Movement" rule />
        {d.movements?.length ? (
          <ol className="hsr-tl">
            {d.movements.slice(0, 15).map((m) => (
              <li key={m._id} className={m.direction === 'out' ? 'is-out' : 'is-in'}>
                <span><b>{m.direction === 'out' ? 'Went out' : 'Came in'}</b>{m.movementType ? ` · ${words(m.movementType)}` : ''}</span>
                <small>{stamp(m.at)}</small>
              </li>
            ))}
          </ol>
        ) : <p className="hsr-none">{loading ? 'Loading…' : 'No gate movement has been recorded.'}</p>}
      </Card>

      {d.incidents?.length ? (
        <Card label="Incidents" className="is-wide">
          <CardHead icon="siren" tone="orange" title={`Incidents & Medical (${d.incidents.length})`} rule />
          <ul className="hsr-list">
            {d.incidents.map((x) => (
              <li key={x._id}><TwoLine top={x.title || words(x.incidentType)} sub={[fmtDate(x.date), x.description].filter(Boolean).join(' · ')} /><Status value={x.status} /></li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card label="Documents" className="is-wide">
        <CardHead icon="doc" tone="teal" title={`Hostel Documents (${d.documents?.length || 0})`} rule />
        {d.documents?.length ? (
          <ul className="hsr-list">
            {d.documents.map((x) => (
              <li key={x._id}>
                <TwoLine top={x.title || x.originalName} sub={[words(x.docType), fmtDate(x.createdAt)].filter(Boolean).join(' · ')} />
                <span className="hsr-list__end"><Status value={x.verificationStatus} />{onFile ? <Btn size="sm" icon="eye" onClick={() => onFile(x)}>Open</Btn> : null}</span>
              </li>
            ))}
          </ul>
        ) : <p className="hsr-none">{loading ? 'Loading…' : 'No documents are on file with the hostel.'}</p>}
      </Card>
    </div>
  );
}

/* ── Not (yet) a resident ────────────────────────────────────────────────── */

const APPLY_STEPS = [['applied', 'Applied'], ['review', 'Under review'], ['approved', 'Approved'], ['bed', 'Bed allotted']];
const stepOf = (a) => (a.status === 'approved' ? 2 : ['pending_approval', 'waitlisted'].includes(a.status) ? 1 : 0);

export function ApplicationCard({ application: a }) {
  const at = stepOf(a);
  return (
    <Card label="Application" className="hsr-app">
      <CardHead icon="doc" tone="indigo" title="Application in Progress" side={<Status value={a.status} />} rule />
      <ol className="hsr-steps">
        {APPLY_STEPS.map(([k, t], i) => <li key={k} className={i < at ? 'is-done' : i === at ? 'is-on' : ''}><i>{i < at ? <Glyph name="check" size={13} /> : i + 1}</i><span>{t}</span></li>)}
      </ol>
      <Facts rows={[
        ['Application', a.applicationNumber, 'oHash'], ['Hostel', a.hostel?.name, 'oBuilding'], ['Academic year', a.academicYear?.yearName, 'calendar'],
        ['Applied on', fmtDate(a.appliedAt || a.createdAt), 'calendar'], ['Waitlist position', a.status === 'waitlisted' ? a.waitlistPosition : '', 'oRows'],
      ]} />
      <p className="hsr-none">{a.status === 'approved' ? 'Approved — the hostel office will allot a bed and it will appear here.' : 'The hostel office is reviewing it. You will be notified when there is a decision.'}</p>
    </Card>
  );
}

export const NotResident = ({ staff, canApply, onApply }) => (
  <section className="hsr-empty">
    <Mark name="hostel" tone="indigo" size={64} glyph={32} />
    <h2>{staff ? 'No hostel bed yet' : 'Not a hostel resident'}</h2>
    <p>{staff ? 'The hostel office allocates a bed to a teacher directly — ask them if you need accommodation.'
      : canApply ? 'Apply for hostel accommodation and the hostel office will review it.' : 'Contact the hostel office to apply for accommodation.'}</p>
    {canApply ? <Btn kind="primary" icon="plus" onClick={onApply}>Apply for Hostel</Btn> : null}
  </section>
);

export const HistoryCard = ({ rows }) => (
  <ListCard head={<ListHead icon="doc" title="Application History" count={rows.length} />}>
    <DataTable select={false} rows={rows} columns={[
      { key: 'no', label: 'Application', render: (x) => <strong>{x.applicationNumber}</strong> },
      { key: 'hostel', label: 'Hostel', render: (x) => x.hostel?.name || '—' },
      { key: 'year', label: 'Academic Year', render: (x) => x.academicYear?.yearName || '—' },
      { key: 'on', label: 'Applied', render: (x) => fmtDate(x.appliedAt || x.createdAt), nowrap: true },
      { key: 'status', label: 'Status', render: (x) => <Status value={x.status} /> },
    ]} />
  </ListCard>
);
