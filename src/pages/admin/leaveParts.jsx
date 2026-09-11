/**
 * The pieces the admin Leave Management page is built from.
 *
 * This screen follows its own design rather than the shared listParts frame:
 * a hero with a badge and a drawing, five tinted summary tiles, a row of pill
 * tabs, and one card holding a titled header, a flat filter row and the
 * request table. Everything here is prefixed `lv` and reaches nothing else.
 *
 * The drawer and the decision dialog are borrowed from listParts, because a
 * slide-over record and a confirm-with-comment are the same everywhere.
 */
import React from 'react';
import Icon from '../../components/ui/icons';
import { Button, Modal, Spinner } from '../../components/ui/index';
import { Drawer, DrawerFoot, DrawerHead, DrawerSection } from './listParts';

// ── Formatters ───────────────────────────────────────────────────────────────

/** "11 Sep 2026" — the date format every cell on this page uses. */
export const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime())
    ? ''
    : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Both ends, always — a one-day leave still reads as a period. */
export const fmtRange = (from, to) => `${fmtDate(from)} – ${fmtDate(to)}`;

/** "1" / "2.5" — halves are real here, so don't round them away. */
export const dayNum = (n) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

/** "full day" / "half day (1st)" — which half matters for arranging cover. */
export const modeLabel = (r) =>
  r.leaveMode === 'half_day'
    ? `half day (${r.halfDaySession === 'second' ? '2nd' : '1st'})`
    : 'full day';

/** "in 3 days" / "6 days ago" — for the drawer, where context beats precision. */
export function relDay(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.round((then.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0)  return 'today';
  if (days === 1)  return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

// ── Header ───────────────────────────────────────────────────────────────────

/**
 * The page header: a badge, what the module is, a drawing, and a line about
 * the work. The drawing is the first thing to go when the row gets tight — it
 * carries no information.
 */
export const LeaveHero = ({ title, subtitle, quote, icon, scene: Scene }) => (
  <header className="lvhero">
    <span className="lvhero__badge"><Icon name={icon} size={30} /></span>
    <div className="lvhero__text">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    {Scene ? <div className="lvhero__art"><Scene /></div> : <div />}
    <blockquote className="lvhero__quote">
      <p>{quote}</p>
      <span aria-hidden />
    </blockquote>
  </header>
);

// ── Summary tiles ────────────────────────────────────────────────────────────

/**
 * One summary figure.
 *
 * With `onClick` the tile is also the fastest way to narrow the list below it —
 * "Pending: 3" is a question, and pressing it should answer it. `on` marks the
 * tile whose filter is currently in force.
 */
export const LeaveStat = ({ icon, tone, label, value, caption, onClick, on, valueFirst, share, delta, deltaNote = 'vs last year' }) => {
  const figure = <span className="lvstat__value" key="v">{value ?? 0}</span>;
  const name   = <span className="lvstat__label" key="l">{label}</span>;
  const body = (
    <>
      <span className="lvstat__icon"><Icon name={icon} size={24} /></span>
      <span className="lvstat__body">
        {/* Which of the two leads depends on the question the row answers:
            a queue is scanned for a label, a census is scanned for a figure. */}
        {valueFirst ? [figure, name] : [name, figure]}
        {caption ? <span className="lvstat__cap">{caption}</span> : null}
        {/* The share this figure is of the whole, drawn once as a bar. The
            caption already says the percentage in words — the bar is the shape
            of it, not a second reading of it. */}
        {share != null && (
          <span className="lvstat__bar" aria-hidden>
            <i style={{ width: `${Math.max(2, Math.min(100, share))}%` }} />
          </span>
        )}
        {delta != null && (
          <span className={`lvstat__delta${delta < 0 ? ' is-down' : ''}`}>
            <Icon name={delta < 0 ? 'arrowDown' : 'arrowUp'} size={13} />
            {delta > 0 ? '+' : ''}{delta}% <em>{deltaNote}</em>
          </span>
        )}
      </span>
    </>
  );
  const cls = `lvstat lvstat--${tone}${on ? ' is-on' : ''}`;
  return onClick
    ? <button type="button" className={cls} onClick={onClick} aria-pressed={!!on}>{body}</button>
    : <div className={cls}>{body}</div>;
};

export const LeaveStats = ({ children, className = '' }) => (
  <div className={`lvstats${className ? ` ${className}` : ''}`}>{children}</div>
);

// ── Tabs ─────────────────────────────────────────────────────────────────────

/** The module's sections, as a row of pills. The active one is filled. */
export const LeaveTabs = ({ tabs, value, onChange }) => (
  <div className="lvtabs" role="tablist">
    {tabs.map((t) => (
      <button
        key={t.value}
        type="button"
        role="tab"
        aria-selected={value === t.value}
        className={`lvtab${value === t.value ? ' is-on' : ''}`}
        onClick={() => onChange(t.value)}
      >
        <Icon name={t.icon} size={17} />
        {t.label}
      </button>
    ))}
  </div>
);

// ── Card furniture ───────────────────────────────────────────────────────────

/**
 * A card's title, the line under it, and whatever acts on the whole card.
 *
 * `icon` puts a mark beside the title, for a card whose heading names a job
 * rather than repeating the tab it sits under.
 */
export const CardHead = ({ title, subtitle, icon, children }) => (
  <div className="lvcardhead">
    <div className="lvcardhead__id">
      {icon ? <span className="lvcardhead__mark"><Icon name={icon} size={20} /></span> : null}
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
    {children ? <div className="lvcardhead__acts">{children}</div> : null}
  </div>
);

/** A labelled control in a card header — the year an allocation belongs to. */
export const HeadField = ({ label, children }) => (
  <label className="lvheadfield">
    <span>{label}</span>
    {children}
  </label>
);

/** The flat filter row under a card's header. */
export const FilterRow = ({ children }) => <div className="lvfilters">{children}</div>;

export const SearchBox = ({ value, onChange, placeholder }) => (
  <div className="lvsearch">
    <Icon name="search" size={17} />
    <input className="form-control" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    {value && (
      <button type="button" className="lvsearch__clear" onClick={() => onChange('')}
        aria-label="Clear search">
        <Icon name="close" size={15} />
      </button>
    )}
  </div>
);

/**
 * One dropdown in the filter row.
 *
 * `all` is the "everything" option, so an unset filter still reads as a
 * sentence — "All Teachers", not a blank box — and a set one is marked, so the
 * row says at a glance which of its fields are doing something.
 */
export const FilterSelect = ({ value, onChange, all, options, label }) => (
  <select className={`form-control lvsel${value ? ' is-set' : ''}`}
    value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
    <option value="">{all}</option>
    {options.map((o) => {
      const val = typeof o === 'string' ? o : o.value;
      const txt = typeof o === 'string' ? o : o.label;
      return <option key={val} value={val}>{txt}</option>;
    })}
  </select>
);

/**
 * The period filter: two native date inputs inside one bordered control, so it
 * reads as a single range rather than a pair of unrelated boxes. Each end
 * bounds the other, which is the only way to stop a range that cannot match.
 */
export const DateRange = ({ from, to, onFrom, onTo }) => (
  <div className={`lvrange${from || to ? ' is-set' : ''}`}>
    <Icon name="calendar" size={16} />
    <input type="date" value={from} max={to || undefined}
      onChange={(e) => onFrom(e.target.value)} aria-label="Leave starting on or after" />
    <span aria-hidden>–</span>
    <input type="date" value={to} min={from || undefined}
      onChange={(e) => onTo(e.target.value)} aria-label="Leave starting on or before" />
    {(from || to) && (
      <button type="button" className="lvrange__clear" aria-label="Clear date range"
        onClick={() => { onFrom(''); onTo(''); }}>
        <Icon name="close" size={14} />
      </button>
    )}
  </div>
);

// ── Table cells ──────────────────────────────────────────────────────────────

const AVATAR_TONES = ['#6366f1', '#7c3aed', '#0d9488', '#db2777', '#0284c7', '#d97706'];

/**
 * Initials on a coloured disc.
 *
 * The colour is derived from the name rather than the row index, so a teacher
 * keeps the same disc from page to page instead of changing colour whenever
 * the list is re-sorted or paged.
 */
export const Avatar = ({ name }) => {
  const text = String(name || '?');
  const initials = text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hash = [...text].reduce((n, c) => n + c.charCodeAt(0), 0);
  return (
    <span className="lvavatar" style={{ background: AVATAR_TONES[hash % AVATAR_TONES.length] }} aria-hidden>
      {initials || '?'}
    </span>
  );
};

export const TeacherCell = ({ request: r }) => (
  <div className="lvwho">
    <Avatar name={r.teacher?.name} />
    <div>
      <b>{r.teacher?.name || 'Unknown teacher'}</b>
      {r.teacher?.employeeId ? <small>{r.teacher.employeeId}</small> : null}
    </div>
  </div>
);

/** The leave type: its name, with the code under it as the short form. */
export const LeaveTypeCell = ({ request: r }) => (
  <div className="lvtype">
    <b>{r.leaveType?.name || '—'}</b>
    {r.leaveType?.code ? <small>{r.leaveType.code}</small> : null}
  </div>
);

/**
 * The period, and the reason the day count beside it differs from it.
 *
 * A range of dates is not the number of days charged — weekends and holidays
 * inside it are usually free, and a half day costs half — so the mode sits
 * under the dates. Loss of pay is called out because it is the part that
 * reaches payroll.
 */
export const PeriodCell = ({ request: r }) => (
  <div className="lvperiod">
    <span>{fmtRange(r.fromDate, r.toDate)}</span>
    {r.leaveMode === 'half_day' && <small>{modeLabel(r)}</small>}
    {r.lopDays > 0 && <small className="lvperiod__lop">{dayNum(r.lopDays)} day loss of pay</small>}
  </div>
);

export const STATUS = {
  pending:   { label: 'Pending',   icon: 'clock' },
  approved:  { label: 'Approved',  icon: 'checkCircle' },
  rejected:  { label: 'Rejected',  icon: 'closeCircle' },
  cancelled: { label: 'Cancelled', icon: 'repeat' },
  // Comp Off only: a request the engine has prepared from attendance but the
  // employee has not sent yet, and one whose credited days ran out of time.
  draft:     { label: 'Ready to apply', icon: 'files' },
  expired:   { label: 'Expired',        icon: 'clock' },
};

/**
 * The statuses a *leave application* can be in.
 *
 * Not every key of STATUS: `draft` and `expired` belong to Comp Off, whose own
 * filter lists them explicitly. Deriving this from the whole map put two
 * states into the leave filters that no leave application can ever be in.
 */
export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
export const STATUS_OPTIONS = LEAVE_STATUSES.map((value) => ({ value, label: STATUS[value].label }));

export const StatusBadge = ({ status }) => {
  const s = STATUS[status];
  return <span className={`lvbadge is-${status}`}>{s ? s.label : status || 'Unknown'}</span>;
};

/**
 * How far through a two-level approval a request is.
 *
 * Only rendered when the type's policy actually asks for two signatures —
 * "1 of 1" on every other row would be noise on every page.
 */
export const ApprovalStep = ({ request: r }) => {
  const need = Number(r.approvalsRequired) || 1;
  if (need < 2 || r.status !== 'pending') return null;
  return (
    <span className="lvstep" title={`${r.approvalLevel || 0} of ${need} approvals recorded`}>
      {r.approvalLevel || 0}/{need} approved
    </span>
  );
};

/** Leave documents are served from the backend root, not from /api. */
export const docUrl = (name) => (!name ? '' : `/uploads/leave-docs/${name}`);

export const ReasonCell = ({ request: r }) => (
  <div className="lvreason" title={r.reason || ''}>
    <span>{r.reason || '—'}</span>
    {r.document && (
      <a href={docUrl(r.document)} target="_blank" rel="noopener noreferrer" className="lvdoc">
        <Icon name="files" size={12} /> Document
      </a>
    )}
  </div>
);

// ── The record, in full ──────────────────────────────────────────────────────

/**
 * One request, beside the queue.
 *
 * A slide-over rather than a route: the admin filtered their way to this row,
 * and deciding on it should hand the queue straight back.
 */
export function RequestDrawer({ request: r, onClose, onDecide, onCancel, busy }) {
  if (!r) return null;
  const need  = Number(r.approvalsRequired) || 1;
  const trail = Array.isArray(r.approvals) ? r.approvals : [];

  return (
    <Drawer open={!!r} onClose={onClose}>
      <DrawerHead
        name={r.teacher?.name || 'Unknown teacher'}
        sub={[r.teacher?.employeeId, r.teacher?.designation].filter(Boolean).join(' · ')}
        tone="indigo"
        tags={[
          <StatusBadge key="s" status={r.status} />,
          r.leaveType?.code ? <span key="t" className="lvtag">{r.leaveType.code}</span> : null,
        ].filter(Boolean)}
        onClose={onClose}
      />

      {/* The scrolling middle. Without it the sections sit as bare flex children
          of the drawer column: no padding, and nothing to take up the slack, so
          the footer rides up under the last field instead of the bottom edge. */}
      <div className="ldrawer__body">
        <DrawerSection
          title="The leave"
          fields={[
            ['Type',    r.leaveType?.name],
            ['Period',  fmtRange(r.fromDate, r.toDate)],
            ['Charged', `${dayNum(r.totalDays)} day${Number(r.totalDays) === 1 ? '' : 's'} · ${modeLabel(r)}`],
            ['Loss of pay', r.lopDays > 0
              ? <span className="lvlop">{dayNum(r.lopDays)} days unpaid</span>
              : 'None — fully paid'],
            ['Academic year', r.academicYear],
          ]}
        />

        <DrawerSection
          title="The request"
          fields={[
            ['Reason', r.reason],
            ['Applied', r.appliedAt ? `${fmtDate(r.appliedAt)} (${relDay(r.appliedAt)})` : null],
            ['Document', r.document
              ? <a href={docUrl(r.document)} target="_blank" rel="noopener noreferrer" className="lvdoc">
                  <Icon name="files" size={13} /> Open attachment
                </a>
              : 'None attached'],
            ['Email', r.teacher?.email],
          ]}
        />

        <DrawerSection
          title="The decision"
          fields={[
            ['Status', <StatusBadge status={r.status} />],
            ['Decided by', r.approvedBy?.name],
            ['Decided on', r.approvedAt || r.rejectedAt || r.cancelledAt
              ? fmtDate(r.approvedAt || r.rejectedAt || r.cancelledAt) : null],
            ['Comment', r.adminComment],
            // Only when the type's policy asks for two signatures — otherwise the
            // trail says nothing the status has not already said.
            ['Approvals', need > 1 ? `${r.approvalLevel || 0} of ${need} recorded` : null],
          ]}
        />

        {need > 1 && trail.length > 0 && (
          <section className="ldrawer__sec">
            <h4>Approval trail</h4>
            <ol className="lvtrail">
              {trail.map((a, i) => (
                <li key={`${a.level}-${i}`}>
                  <b>Level {a.level}</b>
                  <span>{a.byName || 'Someone'} · {a.at ? fmtDate(a.at) : ''}</span>
                  {a.comment ? <em>“{a.comment}”</em> : null}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <DrawerFoot>
        {/* Only where deciding is possible. The same drawer shows an employee
            their own application, and they must not be offered the approve
            buttons — before this guard, opening it without `onDecide` rendered
            them and threw the moment one was pressed. */}
        {onDecide && r.status === 'pending' && (
          <>
            <Button variant="success" loading={busy} onClick={() => onDecide('approve', r)}>
              <Icon name="checkCircle" size={16} /> Approve
            </Button>
            <Button variant="danger" loading={busy} onClick={() => onDecide('reject', r)}>
              <Icon name="close" size={16} /> Reject
            </Button>
          </>
        )}
        {/* Undoing an approval is the only way the days go back — and Comp Off
            refuses to withdraw a credit until the leave that spent it is
            reversed here. */}
        {onDecide && r.status === 'approved' && (
          <Button variant="secondary" loading={busy} onClick={() => onDecide('reverse', r)}>
            <Icon name="repeat" size={16} /> Reverse approval
          </Button>
        )}
        {/* Withdrawing your own application, which is a different act from an
            admin deciding on it. */}
        {onCancel && r.status === 'pending' && (
          <Button variant="danger" loading={busy} onClick={() => onCancel(r)}>
            <Icon name="close" size={16} /> Cancel application
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DrawerFoot>
    </Drawer>
  );
}

// ── Deciding ─────────────────────────────────────────────────────────────────

const DECISION = {
  approve: {
    title: 'Approve leave',
    verb: 'Approve',
    variant: 'success',
    note: 'The days come off the balance and the teacher is told straight away.',
  },
  reject: {
    title: 'Reject leave',
    verb: 'Reject',
    variant: 'danger',
    note: 'The held days go back to the balance. Say why — the teacher sees this comment.',
  },
  reverse: {
    title: 'Reverse approved leave',
    verb: 'Reverse',
    variant: 'secondary',
    note: 'The days are handed back and the approval is undone. Anything already arranged around the absence — cover, attendance — does not undo itself.',
  },
};

/** Approve, reject or reverse — one dialog behind all three. */
export function DecisionDialog({ open, kind, request, comment, onComment, onClose, onConfirm, loading }) {
  const d = DECISION[kind] || DECISION.approve;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={d.title}
      maxWidth={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={d.variant} onClick={onConfirm} loading={loading}>{d.verb}</Button>
        </>
      }
    >
      {request && (
        <div className="lvdec__card">
          <b>{request.teacher?.name}</b>
          <span>{request.leaveType?.name} · {fmtRange(request.fromDate, request.toDate)}</span>
          <span>{dayNum(request.totalDays)} day(s) · {modeLabel(request)}</span>
          {request.reason ? <em>“{request.reason}”</em> : null}
        </div>
      )}

      <p className="lvdec__note">
        <Icon name="alert" size={13} />
        <span>
          {d.note}
          {/* Comp off days do not go back to a pool, they go back to the
              individual lots they were spent from — worth saying before the
              reversal, not after. */}
          {kind === 'reverse' && request?.leaveType?.category === 'compoff'
            && ' The Comp Off days go back into the lots they were spent from.'}
        </span>
      </p>

      <label className="lvdec__label" htmlFor="leave-decision-comment">
        Comment {kind === 'reject' ? '' : <span>(optional)</span>}
      </label>
      <textarea
        id="leave-decision-comment"
        className="form-control"
        rows={3}
        value={comment}
        onChange={(e) => onComment(e.target.value)}
        placeholder={kind === 'reject' ? 'Why is this being rejected?' : 'Anything the teacher should know…'}
      />
    </Modal>
  );
}

// ── Small shared bits ────────────────────────────────────────────────────────

/** "Showing 1 to 5 of 12 requests" — the answer to "did my filter do anything". */
// `plural` for the nouns English does not make by adding an s — a footer that
// says "No entrys to show" undoes a page's worth of care.
export const ShowingCount = ({ page, limit, count, total, noun = 'request', plural }) => {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = (page - 1) * limit + count;
  const many = plural || `${noun}s`;
  return (
    <span className="lvfoot__count">
      {total === 0
        ? `No ${many} to show`
        : `Showing ${from} to ${to} of ${total} ${total === 1 ? noun : many}`}
    </span>
  );
};

/**
 * ‹ 1 2 3 › — the pager this design asks for.
 *
 * Local rather than the shared <Pagination/>, which prints "N total records"
 * beside itself and brings its own margins; here the count already sits on the
 * other side of the footer, and saying it twice is saying it once too often.
 *
 * Long runs collapse around the current page, so page 40 of 200 is still nine
 * buttons rather than two hundred.
 */
export const Pager = ({ page, pages, onPage }) => {
  // Shown even for a single page — it is part of the footer's shape, and a
  // control that appears only once a list gets long reads as a layout shift.
  // `pages` of 0 means there is nothing to page at all.
  if (!pages || pages < 1) return null;
  const window = 5;
  let first = Math.max(1, page - Math.floor(window / 2));
  const last = Math.min(pages, first + window - 1);
  first = Math.max(1, last - window + 1);
  const nums = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  return (
    <nav className="lvpager" aria-label="Pages of requests">
      <button type="button" className="lvpage" disabled={page <= 1}
        onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
      {first > 1 && <span className="lvpager__gap" aria-hidden>…</span>}
      {nums.map((n) => (
        <button key={n} type="button" className={`lvpage${n === page ? ' is-on' : ''}`}
          aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
      ))}
      {last < pages && <span className="lvpager__gap" aria-hidden>…</span>}
      <button type="button" className="lvpage" disabled={page >= pages}
        onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
    </nav>
  );
};

/** A bar of buttons above a tab that is not the queue. */
export const TabActions = ({ children }) => <div className="lvtabacts">{children}</div>;

// ── Leave Types ──────────────────────────────────────────────────────────────

/**
 * The leave-type palette.
 *
 * These are chart marks as well as chips, so the hexes are not taste: the
 * order below was run through the data-viz validator against this app's light
 * surface and passes the lightness band, the chroma floor, all-pairs CVD
 * separation and the normal-vision floor. All-pairs, not adjacent-pairs,
 * because a donut is a closed ring — its first and last slice touch.
 *
 * Two hues had to move to get there:
 *   • maternity was #6d28d9, which is ΔE 0.3 from earned's blue under
 *     deuteranopia and only 11.4 with full colour vision — the two slices were
 *     the same slice. It is fuchsia now.
 *   • sick was red, which is a *status* colour on these very screens ("Low
 *     Balance", "Rejected"). Status hues are reserved and never double as an
 *     identity, so sick took amber — which is also what the comps draw.
 *
 * Past six types the seventh does not get a generated hue; it folds into
 * "Other" in `donutSlices`.
 */
export const TYPE_TONES = {
  green:   '#047857',
  blue:    '#1d4ed8',
  amber:   '#b45309',
  fuchsia: '#a21caf',
  pink:    '#db2777',
  lime:    '#65a30d',
  slate:   '#64748b',
};

/**
 * A glyph and a colour for a leave type.
 *
 * Derived rather than stored: the types every school starts with get the mark
 * you would draw for them, and a type the school invents gets a neutral
 * calendar rather than a blank square. Codes are matched whole — a substring
 * test on "EL" also matches "Travel".
 */
export function typeLook(t = {}) {
  const name = String(t.name || '').toLowerCase();
  const code = String(t.code || '').toUpperCase();
  if (t.category === 'compoff' || code === 'COMPOFF')                     return { icon: 'repeat',     tone: 'pink'    };
  if (/casual/.test(name)             || code === 'CL')                   return { icon: 'umbrella',   tone: 'green'   };
  if (/earned|privilege/.test(name)   || code === 'EL' || code === 'PL')  return { icon: 'briefcase',  tone: 'blue'    };
  if (/sick|medical/.test(name)       || code === 'SL')                   return { icon: 'heart',      tone: 'amber'   };
  if (/matern|patern|child/.test(name)|| code === 'ML')                   return { icon: 'userCircle', tone: 'fuchsia' };
  if (/unpaid|without pay|loss of pay/.test(name) || code === 'UL' || code === 'LOP')
    return { icon: 'layers', tone: 'slate' };
  return { icon: 'calendar', tone: 'lime' };
}

export const TypeIcon = ({ type }) => {
  const look = typeLook(type);
  return (
    <span className={`lvtypeicon lvtypeicon--${look.tone}`} aria-hidden>
      <Icon name={look.icon} size={19} />
    </span>
  );
};

export const TypeNameCell = ({ type }) => (
  <div className="lvtypename">
    <TypeIcon type={type} />
    <b>{type.name}</b>
  </div>
);

/**
 * The active switch.
 *
 * A real checkbox under the paint, so it is reachable by keyboard and reads as
 * a control to a screen reader rather than as a coloured div.
 */
export const Toggle = ({ on, onChange, label, disabled }) => (
  <label className={`lvtoggle${on ? ' is-on' : ''}${disabled ? ' is-busy' : ''}`}>
    <input type="checkbox" checked={!!on} disabled={disabled}
      onChange={(e) => onChange(e.target.checked)} aria-label={label} />
    <span aria-hidden />
  </label>
);

// ── The rail ─────────────────────────────────────────────────────────────────

/** The things about this screen that are true but not visible in the table. */
export const NotesPanel = ({ title, notes }) => (
  <section className="lvrail">
    <header>
      <span className="lvrail__mark lvrail__mark--info"><Icon name="info" size={17} /></span>
      <h3>{title}</h3>
    </header>
    <ul className="lvnotes">
      {notes.map((n) => <li key={n}>{n}</li>)}
    </ul>
  </section>
);

/**
 * The shortcuts beside the table. Each row is a real destination or a real
 * action — nothing here is decoration.
 */
export const QuickLinks = ({ title, items }) => (
  <section className="lvrail">
    <header>
      <span className="lvrail__mark lvrail__mark--gear"><Icon name="settings" size={17} /></span>
      <h3>{title}</h3>
    </header>
    <div className="lvlinks">
      {items.map((it) => (
        <button key={it.label} type="button" className="lvlink" onClick={it.onClick}>
          <span className={`lvlink__icon lvlink__icon--${it.tone}`}><Icon name={it.icon} size={17} /></span>
          <span className="lvlink__text">
            <b>{it.label}</b>
            <small>{it.sub}</small>
          </span>
          <Icon name="chevronRight" size={16} />
        </button>
      ))}
    </div>
  </section>
);

// ── Allocations ──────────────────────────────────────────────────────────────

/**
 * The colour a leave type wears as a chip.
 *
 * A type gets ONE colour across the whole module — the same hue as the glyph
 * beside its name on the Leave Types tab — so a chip can be read without
 * checking which column it is in. Types the school invents are not in
 * `typeLook`'s vocabulary, so they walk a palette instead, skipping hues the
 * recognised types have already taken.
 */
const SPARE_TONES = ['lime', 'pink', 'amber', 'fuchsia', 'blue', 'green'];
export function chipTones(types = []) {
  const known = types.map((t) => [String(t._id), typeLook(t)])
    .filter(([, look]) => look.icon !== 'calendar');   // 'calendar' is the fallback
  const taken = new Set(known.map(([, look]) => look.tone));
  const spare = SPARE_TONES.filter((t) => !taken.has(t));
  const out = Object.fromEntries(known.map(([id, look]) => [id, look.tone]));
  let n = 0;
  types.forEach((t) => {
    const id = String(t._id);
    if (out[id]) return;
    out[id] = spare[n % spare.length] || SPARE_TONES[n % SPARE_TONES.length];
    n += 1;
  });
  return out;
}

/**
 * What a teacher holds, one chip per leave type.
 *
 * Codes rather than names: a row carries four or five of these, and the full
 * names would push everything else off the table. The title spells it out.
 */
export const AllocChips = ({ balances = [], tones = {} }) => {
  if (!balances.length) return <span className="lvmuted">Nothing allocated</span>;
  return (
    <div className="lvchips">
      {balances.map((b) => {
        const id = String(b.leaveType?._id || '');
        const total = (b.totalAllocated || 0) + (b.carriedForward || 0);
        return (
          <span key={id} className={`lvchip lvchip--${tones[id] || 'indigo'}`}
            title={`${b.leaveType?.name || 'Leave'} — ${total} day${total === 1 ? '' : 's'} allocated`}>
            {b.leaveType?.code}: {total}
          </span>
        );
      })}
    </div>
  );
};

/**
 * A primary action with the rarer ones folded in behind a caret.
 *
 * Allocating is the job; carrying a year forward or wiping a balance are the
 * things you do once a year, and putting all five in the header as equals
 * would make the one you want hardest to find.
 */
export function SplitButton({ label, icon, onClick, items }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="lvsplit" ref={ref}>
      <button type="button" className="lvsplit__main" onClick={onClick}>
        {icon ? <Icon name={icon} size={16} /> : null}{label}
      </button>
      <button type="button" className="lvsplit__caret" aria-haspopup="menu" aria-expanded={open}
        aria-label={`More ${label.toLowerCase()} actions`} onClick={() => setOpen((o) => !o)}>
        <Icon name="chevronDown" size={15} />
      </button>
      {open && (
        <div className="lvsplit__menu" role="menu">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem"
              className={`lvsplit__item${it.danger ? ' is-danger' : ''}`}
              onClick={() => { setOpen(false); it.onClick(); }}>
              <Icon name={it.icon} size={16} />
              <span>
                {it.label}
                {it.sub ? <small>{it.sub}</small> : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Balance Summary ──────────────────────────────────────────────────────────

/**
 * The year's days split by leave type, as slices and as a list.
 *
 * Past six types the rest fold into "Other" rather than being handed a
 * generated hue — the palette is six hues deep because that is how far it can
 * go and still be told apart, and a seventh would be a colour nobody can name.
 */
export function donutSlices(rows = [], tones = {}, max = 6) {
  const sorted = [...rows].filter((r) => r.days > 0).sort((a, b) => b.days - a.days);
  const head = sorted.slice(0, max);
  const tail = sorted.slice(max);
  const slices = head.map((r) => ({
    key: r._id, label: r.name, days: r.days,
    color: TYPE_TONES[tones[r._id]] || TYPE_TONES.lime,
  }));
  if (tail.length) {
    slices.push({
      key: '__other', label: 'Others',
      // The names it stands for go in the tooltip — a legend row that reads
      // "Others" and nothing else is a legend row nobody can act on.
      note: tail.map((r) => r.name).join(', '),
      days: tail.reduce((n, r) => n + r.days, 0),
      color: TYPE_TONES.slate,
    });
  }
  return slices;
}

/**
 * A ring with the total in the middle, and every slice named and numbered
 * beside it.
 *
 * A donut is only honest when the numbers are on the page — nobody reads 18%
 * off an arc — so the legend carries the exact figure for each type and the
 * hole carries the sum. The arcs are the index; the list is the answer.
 *
 * Drawn as stroke-dashoffset arcs on one circle, the same way the dashboard's
 * attendance ring is drawn, so the two read as the same hand. A 2px surface
 * gap sits between neighbouring slices.
 */
export function LeaveDonut({ slices = [], total, caption = 'Total Days', emptyNote, showPct, unit = 'days' }) {
  const sum = slices.reduce((n, s) => n + s.days, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  const GAP = 2;   // surface gap between slices, in px of circumference

  let cursor = 0;
  const arcs = slices.map((s) => {
    const len = sum ? (C * s.days) / sum : 0;
    // Never let the gap eat a slice whole — a 1-day type still has to show.
    const draw = Math.max(1, len - GAP);
    const arc = { ...s, len: draw, offset: -cursor };
    cursor += len;
    return arc;
  });

  return (
    <div className="lvdonut">
      <div className="lvdonut__dial">
        <svg width="132" height="132" viewBox="0 0 132 132" role="img"
          aria-label={`${total ?? sum} ${caption}: ${slices.map((s) => `${s.label} ${s.days} ${unit}`).join(', ')}`}>
          <circle cx="66" cy="66" r={R} fill="none" stroke="#eef1f6" strokeWidth="14" />
          {sum > 0 && arcs.map((a) => (
            <circle key={a.key} cx="66" cy="66" r={R} fill="none"
              stroke={a.color} strokeWidth="14" strokeLinecap="butt"
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={a.offset}
              transform="rotate(-90 66 66)">
              {/* "1 requests" in a tooltip is a small thing done badly. */}
              <title>{`${a.label}: ${a.days} ${a.days === 1 ? unit.replace(/s$/, '') : unit}${a.note ? ` — ${a.note}` : ''}`}</title>
            </circle>
          ))}
        </svg>
        <div className="lvdonut__center">
          <span className="lvdonut__total">{total ?? sum}</span>
          <span className="lvdonut__cap">{caption}</span>
        </div>
      </div>

      {slices.length ? (
        <ul className="lvdonut__legend">
          {slices.map((s) => (
            <li key={s.key} title={s.note || undefined}>
              <span className="lvdonut__dot" style={{ background: s.color }} />
              <span className="lvdonut__k">{s.label}</span>
              <span className="lvdonut__v">
                {s.days}
                {/* The share only when it was asked for: on a balance panel the
                    days are the answer, on a distribution the split is. */}
                {showPct && sum ? <small>({((s.days / sum) * 100).toFixed(1)}%)</small> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lvrail__none">{emptyNote}</p>
      )}
    </div>
  );
}

/** One leave type's remaining days, in the balance table's per-type column. */
export const BalancePill = ({ days, tone, low, title }) => (
  <span className={`lvpill lvpill--${low ? 'low' : tone || 'slate'}`} title={title}>
    {dayNum(days)}
  </span>
);

/** A panel that ends in a button rather than a list. */
export const HelpPanel = ({ title, text, action }) => (
  <section className="lvrail">
    <header>
      <span className="lvrail__mark lvrail__mark--help"><Icon name="lifebuoy" size={17} /></span>
      <h3>{title}</h3>
    </header>
    <p className="lvhelp">{text}</p>
    {action}
  </section>
);

/**
 * One teacher's balances, beside the table.
 *
 * A slide-over rather than a dialog, the same way a subject opens on the
 * Subjects screen: the admin filtered their way to this row, and a modal that
 * blacks out the list they were reading throws that context away to show them
 * one person.
 *
 * The four figures behind "remaining" are laid out per type rather than summed,
 * because "12 left" and "12 allocated, 6 used, 6 carried in" are answers to
 * different questions and only the second one explains a number that looks
 * wrong.
 */
export function BalanceDrawer({ open, teacher, academicYear, balances = [], tones = {}, low = 2, onClose, onAdjust }) {
  if (!open) return null;
  const remainingOf = (b) =>
    Math.max(0, (b.totalAllocated || 0) + (b.carriedForward || 0) - (b.used || 0) - (b.pending || 0));
  const held = balances.filter(Boolean);
  const total = held.reduce((n, b) => n + remainingOf(b), 0);

  return (
    <Drawer open={open} onClose={onClose}>
      <DrawerHead
        name={teacher?.name || 'Unknown teacher'}
        sub={[teacher?.employeeId, teacher?.department].filter(Boolean).join(' · ')}
        tone="indigo"
        tags={[
          academicYear ? <span key="y" className="lvtag">{academicYear}</span> : null,
          <span key="t" className="lvbadge is-approved">{dayNum(total)} days left</span>,
        ].filter(Boolean)}
        onClose={onClose}
      />

      <div className="ldrawer__body">
        {held.length === 0 ? (
          <p className="lvrail__none">
            Nothing has been allocated to {teacher?.name || 'this teacher'} for {academicYear || 'this year'} yet,
            so there is no balance to break down.
          </p>
        ) : held.map((b) => {
          const left = remainingOf(b);
          const id   = String(b.leaveType?._id || '');
          return (
            <section className="ldrawer__sec lvbal" key={id || b._id}>
              <h4>
                <span className={`lvdonut__dot`} style={{ background: TYPE_TONES[tones[id]] || TYPE_TONES.lime }} />
                {b.leaveType?.name || 'Leave'}
                <em>{b.leaveType?.code}</em>
                <BalancePill days={left} tone={tones[id]} low={left <= low}
                  title={`${dayNum(left)} day(s) left`} />
              </h4>
              <dl className="lvbal__grid">
                <div><dt>Allocated</dt><dd>{dayNum(b.totalAllocated || 0)}</dd></div>
                <div><dt>Carried in</dt><dd>{dayNum(b.carriedForward || 0)}</dd></div>
                <div><dt>Used</dt><dd>{dayNum(b.used || 0)}</dd></div>
                {/* Held by a request nobody has decided on — not spent, not
                    available, and the usual reason a figure looks short. */}
                <div><dt>Pending</dt><dd>{dayNum(b.pending || 0)}</dd></div>
                {b.expired ? <div><dt>Expired</dt><dd>{dayNum(b.expired)}</dd></div> : null}
                <div className="lvbal__left"><dt>Remaining</dt><dd>{dayNum(left)}</dd></div>
              </dl>
            </section>
          );
        })}
      </div>

      <DrawerFoot>
        {onAdjust && (
          <Button onClick={onAdjust}><Icon name="pencil" size={16} /> Adjust allocation</Button>
        )}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DrawerFoot>
    </Drawer>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────

/**
 * A page-level title and its controls, sitting on the page rather than in a
 * card — for a screen whose body is several cards rather than one.
 */
export const SectionHead = ({ title, subtitle, children }) => (
  <div className="lvsection">
    <div>
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="lvsection__acts">{children}</div> : null}
  </div>
);

/** A round ceiling, so the gridlines land on numbers a person would say. */
function niceStep(max) {
  if (max <= 4) return 1;
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rough) || 10 * mag;
}

/**
 * Applications per month, as bars.
 *
 * One series, so there is no legend — the panel title names it. Hand-drawn SVG
 * rather than the charting library: this page imports none of it, and twelve
 * bars against a linear scale are not worth a 375 kB chunk.
 *
 * Every bar carries a <title>, which is the hover tooltip; the axis carries the
 * scale. Bars sit on the baseline with rounded tops, and the grid is drawn
 * light enough to stay behind the data.
 */
export function TrendBars({ data = [], color = '#4f46e5', emptyNote }) {
  const W = 660;
  const H = 230;
  const PAD = { top: 14, right: 6, bottom: 28, left: 34 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max  = Math.max(0, ...data.map((d) => d.count || 0));
  const step = niceStep(max);
  const top  = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(30, Math.max(8, slot * 0.52));
  const y = (v) => PAD.top + plotH - (v / top) * plotH;

  if (!data.length || max === 0) {
    return <p className="lvrail__none lvchart__empty">{emptyNote}</p>;
  }

  return (
    <div className="lvchart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
        aria-label={`Leave applications by month: ${data.map((d) => `${d.label} ${d.count}`).join(', ')}`}>
        {/* Grid and scale, drawn first so they stay behind the bars. */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)}
              stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end"
              fontSize="11" fill="#94a3b8">{v}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = d.count ? Math.max(3, (d.count / top) * plotH) : 0;
          const x = PAD.left + i * slot + (slot - barW) / 2;
          return (
            <g key={d.month}>
              {h > 0 && (
                <rect x={x} y={PAD.top + plotH - h} width={barW} height={h} rx="4" fill={color}>
                  <title>{`${d.label}: ${d.count} application${d.count === 1 ? '' : 's'}, ${d.days} day${d.days === 1 ? '' : 's'}`}</title>
                </rect>
              )}
              <text x={x + barW / 2} y={H - 9} textAnchor="middle"
                fontSize="11" fill="#94a3b8">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A card that holds a chart: a marked title, a line under it, and one control. */
export const ChartCard = ({ icon, tone = 'indigo', title, subtitle, control, children }) => (
  <section className="card lvcard lvchartcard">
    <div className="lvcardhead">
      <div className="lvcardhead__id">
        <span className={`lvcardhead__mark lvcardhead__mark--${tone}`}><Icon name={icon} size={18} /></span>
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {control ? <div className="lvcardhead__acts">{control}</div> : null}
    </div>
    {children}
  </section>
);

/**
 * One teacher's year, beside the report.
 *
 * The table row is a total; this is what the total is made of — the split by
 * type it already had to hand, and the applications behind it, fetched when the
 * drawer opens rather than shipped with every row of the table.
 *
 * Same slide-over as the request and balance views, so "view" means the same
 * thing on every tab of this module.
 */
export function ReportDrawer({
  open, teacher, academicYear, types = [], tones = {},
  applications, loading, error, onClose, onSeeRequests,
}) {
  if (!open || !teacher) return null;
  const held = types.filter((t) => (teacher.perType?.[t._id] || 0) > 0);

  return (
    <Drawer open={open} onClose={onClose}>
      <DrawerHead
        name={teacher.name || 'Unknown teacher'}
        sub={[teacher.employeeId, teacher.department].filter(Boolean).join(' · ')}
        tone="indigo"
        tags={[
          academicYear ? <span key="y" className="lvtag">{academicYear}</span> : null,
          <span key="d" className="lvbadge is-approved">{dayNum(teacher.days || 0)} days</span>,
        ].filter(Boolean)}
        onClose={onClose}
      />

      <div className="ldrawer__body">
        <DrawerSection
          title="This year"
          fields={[
            ['Applications', teacher.applications ?? null],
            ['Days taken', dayNum(teacher.days || 0)],
            ['Department', teacher.department],
            ['Employee ID', teacher.employeeId],
          ]}
        />

        <section className="ldrawer__sec">
          <h4>By leave type</h4>
          {held.length ? (
            <div className="lvchips">
              {held.map((t) => (
                <span key={t._id} className={`lvchip lvchip--${tones[t._id] || 'lime'}`}
                  title={`${t.name} — ${dayNum(teacher.perType[t._id])} day(s)`}>
                  {t.code}: {dayNum(teacher.perType[t._id])}
                </span>
              ))}
            </div>
          ) : (
            <p className="lvrail__none">No leave of any type was taken this year.</p>
          )}
        </section>

        <section className="ldrawer__sec">
          <h4>Applications</h4>
          {loading ? (
            <div className="lvtable__state"><Spinner /></div>
          ) : error ? (
            <p className="lvrail__none">{error}</p>
          ) : !applications?.length ? (
            <p className="lvrail__none">Nothing filed in this year.</p>
          ) : (
            <ol className="lvapps">
              {applications.map((a) => (
                <li key={a._id}>
                  <span className="lvapps__when">
                    <b>{fmtRange(a.fromDate, a.toDate)}</b>
                    <small>{a.leaveType?.name} · {dayNum(a.totalDays)} day{Number(a.totalDays) === 1 ? '' : 's'}</small>
                  </span>
                  <StatusBadge status={a.status} />
                  {a.reason ? <em title={a.reason}>{a.reason}</em> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <DrawerFoot>
        {/* The queue is the place to act on any of these, so the drawer hands
            over to it rather than growing its own approve buttons. */}
        {onSeeRequests && (
          <Button onClick={onSeeRequests}>
            <Icon name="fileCheck" size={16} /> Open in Requests
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DrawerFoot>
    </Drawer>
  );
}

// ── Comp Off ─────────────────────────────────────────────────────────────────

/**
 * A row of sub-tabs inside a tab.
 *
 * Underlined rather than filled, so the module's sections (the pill row above)
 * and one section's own views never read as the same level of navigation.
 */
export const SubTabs = ({ tabs, value, onChange }) => (
  <div className="lvsubtabs" role="tablist">
    {tabs.map((t) => (
      <button key={t.value} type="button" role="tab" aria-selected={value === t.value}
        className={`lvsubtab${value === t.value ? ' is-on' : ''}`}
        onClick={() => onChange(t.value)}>
        <Icon name={t.icon} size={16} />
        {t.label}
      </button>
    ))}
  </div>
);

/** The kind of day that earned the comp off, in words rather than a slug. */
export const WORK_TYPES = {
  holiday:     'Holiday',
  weekly_off:  'Weekly Off',
  sunday:      'Sunday',
  working_day: 'Working Day',
  unknown:     'Unclassified',
};

/** The date worked, with the weekday under it — which is half the reason it counted. */
export const WorkDateCell = ({ request: r }) => {
  const d = r.workDate ? new Date(r.workDate) : null;
  const ok = d && !Number.isNaN(d.getTime());
  return (
    <div className="lvperiod">
      <span>{ok ? fmtDate(d) : '—'}</span>
      {ok && <small>{d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}</small>}
    </div>
  );
};

/**
 * What was earned, and what it was worked out from.
 *
 * The days are the figure that matters — the hours are how the engine got
 * there, and only shown when they were recorded.
 */
export const EarnedCell = ({ request: r }) => (
  <div className="lvperiod">
    <span>{dayNum(r.compOffDays)} day{Number(r.compOffDays) === 1 ? '' : 's'}</span>
    {r.workedHours > 0 && <small>{r.workedHours} h worked</small>}
  </div>
);

/** How far through a multi-level sign-off a comp off request is. */
export const SignOffStep = ({ request: r }) => {
  const need = Number(r.approvalsRequired) || 1;
  if (need < 2 || r.status !== 'pending') return null;
  return (
    <span className="lvstep" title={`${r.approvalLevel || 0} of ${need} sign-offs recorded`}>
      sign-off {r.approvalLevel || 0}/{need}
    </span>
  );
};

/**
 * One Comp Off request, beside the queue.
 *
 * The row is a summary; this is the working it came from — which day, what
 * kind of day the engine decided it was, the hours behind the figure, and what
 * was actually credited once it was approved.
 */
export function CompOffDrawer({ request: r, onClose, onDecide, onSeeRequests, onWithdraw, busy }) {
  if (!r) return null;
  const need  = Number(r.approvalsRequired) || 1;
  const day   = r.workDate ? new Date(r.workDate) : null;
  const dayOk = day && !Number.isNaN(day.getTime());

  return (
    <Drawer open={!!r} onClose={onClose}>
      <DrawerHead
        name={r.teacher?.name || 'Unknown employee'}
        sub={[r.teacher?.designation, r.teacher?.department].filter(Boolean).join(' · ')}
        tone="indigo"
        tags={[
          <StatusBadge key="s" status={r.status} />,
          <span key="d" className="lvtag">{dayNum(r.compOffDays)} day{Number(r.compOffDays) === 1 ? '' : 's'}</span>,
        ]}
        onClose={onClose}
      />

      <div className="ldrawer__body">
        <DrawerSection
          title="The day worked"
          fields={[
            ['Date', dayOk
              ? `${fmtDate(day)} (${day.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' })})`
              : null],
            ['Work type', WORK_TYPES[r.dayCategory] || r.dayCategory],
            ['Holiday', r.holiday?.name],
            ['Hours worked', r.workedHours > 0 ? `${r.workedHours} h` : null],
            ['Clocked', (r.checkIn || r.checkOut) ? `${r.checkIn || '—'} → ${r.checkOut || '—'}` : null],
            ['Raised', r.source === 'attendance' ? 'Automatically, from attendance' : 'Manually'],
          ]}
        />

        <DrawerSection
          title="The claim"
          fields={[
            ['Comp off earned', `${dayNum(r.compOffDays)} day${Number(r.compOffDays) === 1 ? '' : 's'}`],
            ['Reason', r.reason],
            ['Applied', r.appliedAt ? `${fmtDate(r.appliedAt)} (${relDay(r.appliedAt)})` : null],
          ]}
        />

        <DrawerSection
          title="The decision"
          fields={[
            ['Status', <StatusBadge status={r.status} />],
            ['Decided by', r.approvedBy?.name],
            ['Decided on', r.approvedAt ? fmtDate(r.approvedAt) : null],
            ['Sign-offs', need > 1 ? `${r.approvalLevel || 0} of ${need} recorded` : null],
            // Credited days are the only thing that reaches a balance, and they
            // stay at zero until every sign-off is in.
            ['Credited', r.creditedDays > 0
              ? `${dayNum(r.creditedDays)} day${Number(r.creditedDays) === 1 ? '' : 's'} on ${fmtDate(r.creditedAt || r.approvedAt)}`
              : 'Nothing credited yet'],
            ['Expires', r.expiresAt ? `${fmtDate(r.expiresAt)} (${relDay(r.expiresAt)})` : null],
            ['Comment', r.adminComment],
          ]}
        />
      </div>

      <DrawerFoot>
        {/* Only where deciding is actually possible. Opened from a report the
            drawer is a record, and the queue is where it gets acted on. */}
        {onDecide && r.status === 'pending' && (
          <>
            <Button variant="success" loading={busy} onClick={() => onDecide('approve', r)}>
              <Icon name="checkCircle" size={16} /> Approve
            </Button>
            <Button variant="danger" loading={busy} onClick={() => onDecide('reject', r)}>
              <Icon name="close" size={16} /> Reject
            </Button>
          </>
        )}
        {onDecide && r.status === 'approved' && (
          <Button variant="secondary" loading={busy} onClick={() => onDecide('cancel', r)}>
            <Icon name="repeat" size={16} /> Withdraw approval
          </Button>
        )}
        {onSeeRequests && (
          <Button onClick={() => onSeeRequests(r)}>
            <Icon name="fileCheck" size={16} /> Open in Requests
          </Button>
        )}
        {/* Withdrawing your own claim, which is a different act from an
            approver deciding on it. */}
        {onWithdraw && (r.status === 'pending' || r.status === 'draft') && (
          <Button variant="danger" loading={busy} onClick={() => onWithdraw(r)}>
            <Icon name="close" size={16} /> Withdraw
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DrawerFoot>
    </Drawer>
  );
}

// ── Policy form primitives ───────────────────────────────────────────────────
// Declared at module scope so React keeps the element type stable across
// renders and an input never loses focus mid-typing.

export const RuleNum = ({ label, value, onChange, hint, step = 1, disabled, error }) => (
  <label className="lvfield">
    <span className="lvfield__label">{label}</span>
    <input type="number" className={`form-control${error ? ' is-error' : ''}`}
      min={0} step={step} disabled={disabled} value={value ?? 0}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    {error ? <span className="lvfield__err">{error}</span>
      : hint ? <span className="lvfield__hint">{hint}</span> : null}
  </label>
);

export const RulePick = ({ label, value, onChange, options, hint }) => (
  <label className="lvfield">
    <span className="lvfield__label">{label}</span>
    <select className="form-control" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
    {hint && <span className="lvfield__hint">{hint}</span>}
  </label>
);

export const RuleCheck = ({ label, checked, onChange, hint, children }) => (
  <div className="lvcheck">
    <label>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
    {hint && <p className="lvcheck__hint">{hint}</p>}
    {/* The detail a rule needs once it is switched on, indented under it so the
        dependency is visible rather than remembered. */}
    {checked && children ? <div className="lvcheck__more">{children}</div> : null}
  </div>
);

export const RuleList = ({ label, options, selected = [], onChange, empty }) => (
  <div className="lvfield">
    <span className="lvfield__label">{label}</span>
    <div className="lvchecks">
      {options.map(([val, text]) => (
        <label key={val} className="lvcheckitem">
          <input type="checkbox" checked={selected.includes(val)}
            onChange={(e) => onChange(e.target.checked
              ? [...selected, val]
              : selected.filter((x) => x !== val))} />
          <span>{text}</span>
        </label>
      ))}
      {!options.length && <span className="lvmuted">{empty}</span>}
    </div>
  </div>
);

/** One numbered group of rules. */
export const RuleCard = ({ n, icon, tone, title, note, children, wide }) => (
  <section className={`card lvpolsec${wide ? ' lvpolsec--wide' : ''}`}>
    <header>
      <span className={`lvpolsec__mark lvpolsec__mark--${tone}`}><Icon name={icon} size={19} /></span>
      <div>
        <h3>{n}. {title}</h3>
        <p>{note}</p>
      </div>
    </header>
    <div className="lvpolsec__body">{children}</div>
  </section>
);


/**
 * The sticky header a policy editor is saved from.
 *
 * `state` renders as a badge that is also the switch — suspending a policy is
 * a policy edit, so it saves with everything else rather than acting on its own.
 */
export const PolicyHead = ({ icon, tone = 'indigo', title, subtitle, active, onToggleActive, activeLabel = 'Active', offLabel = 'Inactive', children }) => (
  <div className="card lvpolhead">
    <span className={`lvpolhead__icon lvtypeicon--${tone}`}><Icon name={icon} size={26} /></span>
    <div className="lvpolhead__id">
      <h2>
        {title}
        {onToggleActive && (
          <button type="button" onClick={() => onToggleActive(!active)}
            className={`lvpolhead__state is-${active ? 'on' : 'off'}`}
            title={active
              ? `${activeLabel} — press to suspend`
              : `${offLabel} — press to switch back on`}>
            {active ? activeLabel : offLabel}
          </button>
        )}
      </h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children}
  </div>
);

/**
 * One employee's Comp Off balance, beside the table.
 *
 * The row is six numbers; this is what they mean and where they came from —
 * the figures laid out with the one that matters last, and the movements that
 * produced them fetched when the drawer opens.
 */
export function CompOffBalanceDrawer({
  open, row, entries, loading, error, onClose, onOpenLedger,
}) {
  if (!open || !row) return null;
  const t = row.teacher || {};

  return (
    <Drawer open={open} onClose={onClose}>
      <DrawerHead
        name={t.name || 'Unknown employee'}
        sub={[t.employeeId, t.designation].filter(Boolean).join(' · ')}
        tone="indigo"
        tags={[
          <span key="a" className={`lvbadge is-${row.remaining > 0 ? 'approved' : 'cancelled'}`}>
            {dayNum(row.remaining || 0)} day{Number(row.remaining) === 1 ? '' : 's'} available
          </span>,
        ]}
        onClose={onClose}
      />

      <div className="ldrawer__body">
        <section className="ldrawer__sec lvbal">
          <h4>The balance</h4>
          <dl className="lvbal__grid">
            <div><dt>Earned</dt><dd>{dayNum(row.earned || 0)}</dd></div>
            <div><dt>Carried in</dt><dd>{dayNum(row.carried || 0)}</dd></div>
            <div><dt>Used</dt><dd>{dayNum(row.used || 0)}</dd></div>
            {/* Held by a claim nobody has decided on — not spent, not
                available, and the usual reason a figure looks short. */}
            <div><dt>Pending</dt><dd>{dayNum(row.pending || 0)}</dd></div>
            <div><dt>Expired</dt><dd className={row.expired > 0 ? 'lvdown' : undefined}>{dayNum(row.expired || 0)}</dd></div>
            <div className="lvbal__left"><dt>Available</dt><dd>{dayNum(row.remaining || 0)}</dd></div>
          </dl>
        </section>

        <section className="ldrawer__sec">
          <h4>Recent movements</h4>
          {loading ? (
            <div className="lvtable__state"><Spinner /></div>
          ) : error ? (
            <p className="lvrail__none">{error}</p>
          ) : !entries?.length ? (
            <p className="lvrail__none">Nothing has moved on this balance yet.</p>
          ) : (
            <ol className="lvapps">
              {entries.map((e) => (
                <li key={e._id}>
                  <span className="lvapps__when">
                    <b>{fmtDate(e.createdAt)}</b>
                    <small>{e.description || '—'}</small>
                  </span>
                  <strong className={e.delta >= 0 ? 'lvup' : 'lvdown'}>
                    {e.delta >= 0 ? '+' : ''}{e.delta}
                  </strong>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <DrawerFoot>
        {/* The ledger is the full working; this drawer is the last few lines
            of it. */}
        {onOpenLedger && (
          <Button onClick={() => onOpenLedger(t._id)}>
            <Icon name="clipboard" size={16} /> Open in Ledger
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DrawerFoot>
    </Drawer>
  );
}

/**
 * One ledger entry, in full.
 *
 * A row of a log is terse by design; this is the same entry with the lot it
 * came out of, what the balance stood at afterwards, and the whole description
 * rather than a clipped one.
 */
export function LedgerDrawer({ entry: e, labels = {}, tones = {}, onClose, onOnlyEmployee }) {
  if (!e) return null;
  const t = e.teacher || {};
  const isLot = e.entryType === 'EARNED' || e.remainingDays > 0;

  return (
    <Drawer open={!!e} onClose={onClose}>
      <DrawerHead
        name={t.name || 'Unknown employee'}
        sub={[t.employeeId, t.designation].filter(Boolean).join(' · ')}
        tone="indigo"
        tags={[
          <span key="t" className={`lvbadge is-${tones[e.entryType] || 'cancelled'}`}>
            {labels[e.entryType] || e.entryType}
          </span>,
          <span key="d" className={`lvtag ${e.delta >= 0 ? 'lvup' : 'lvdown'}`}>
            {e.delta >= 0 ? '+' : ''}{e.delta} day{Math.abs(e.delta) === 1 ? '' : 's'}
          </span>,
        ]}
        onClose={onClose}
      />

      <div className="ldrawer__body">
        <DrawerSection
          title="The entry"
          fields={[
            ['When', e.createdAt ? `${fmtDate(e.createdAt)} (${relDay(e.createdAt)})` : null],
            ['Type', labels[e.entryType] || e.entryType],
            ['Change', `${e.delta >= 0 ? '+' : ''}${e.delta} day${Math.abs(e.delta) === 1 ? '' : 's'}`],
            // The running balance is what makes a ledger a ledger — it is the
            // only figure that says where this entry left things.
            ['Balance after', e.balanceAfter],
            ['Description', e.description],
          ]}
        />

        {isLot && (
          <DrawerSection
            title="The lot"
            fields={[
              ['Days in this lot', e.days],
              ['Still unspent', e.remainingDays],
              ['Expires', e.expiresAt ? `${fmtDate(e.expiresAt)} (${relDay(e.expiresAt)})` : 'No expiry set'],
            ]}
          />
        )}
      </div>

      <DrawerFoot>
        {onOnlyEmployee && (
          <Button onClick={() => onOnlyEmployee(t._id)}>
            <Icon name="user" size={16} /> Only this employee
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DrawerFoot>
    </Drawer>
  );
}

// ── My Leave: balance ────────────────────────────────────────────────────────

/**
 * One leave type's balance, as a card.
 *
 * The figure people want is how many days are left, so that is the big one;
 * the bar underneath says how much of the year's allowance it represents,
 * because "12 left" means something different out of 12 than out of 90.
 */
export const BalanceCard = ({ balance: b, tone = 'indigo', onView }) => {
  const type = b.leaveType || {};
  const allocated = (b.totalAllocated || 0) + (b.carriedForward || 0);
  const used = b.used || 0;
  const left = b.remaining ?? Math.max(0, allocated - used - (b.pending || 0));
  const pct  = allocated > 0 ? Math.min(100, (used / allocated) * 100) : 0;

  return (
    <section className="card lvbalcard">
      <header>
        <TypeIcon type={type} />
        <div className="lvbalcard__id">
          <b>{type.name || 'Leave'}</b>
          <small>{[type.code, b.academicYear].filter(Boolean).join(' · ')}</small>
        </div>
        <div className="lvbalcard__left">
          <strong>{dayNum(left)}</strong>
          <small>day{Number(left) === 1 ? '' : 's'} left</small>
        </div>
      </header>

      {/* Filled by what has been used, not by what is left — the bar is a
          measure of the year spent, and it fills as the year goes on. */}
      <div className="lvbalcard__bar" role="img"
        aria-label={`${dayNum(used)} of ${dayNum(allocated)} days used`}>
        <i className={`lvbalcard__fill lvbalcard__fill--${tone}`} style={{ width: `${Math.max(pct, used > 0 ? 4 : 0)}%` }} />
      </div>
      <div className="lvbalcard__nums">
        <span><b>{dayNum(used)}</b> used of {dayNum(allocated)}</span>
        <span>{dayNum(allocated)} allocated</span>
      </div>

      {onView && (
        <button type="button" className="lvbalcard__more" onClick={onView}>
          View Details <Icon name="arrowRight" size={15} />
        </button>
      )}
    </section>
  );
};

/** A label and a figure, for the summary panel. */
export const SummaryRow = ({ label, value, strong }) => (
  <div className={`lvsumrow${strong ? ' is-strong' : ''}`}>
    <span>{label}</span>
    <b>{value}</b>
  </div>
);

/**
 * One leave type, in full: the balance, and the rules that govern it.
 *
 * The rules are the half an employee cannot see anywhere else — how far ahead
 * they must apply, whether a half day counts, what the office will ask for —
 * and they are the reason an application gets refused.
 */
export function MyBalanceDrawer({ balance: b, policy, onClose, onApply }) {
  if (!b) return null;
  const type = b.leaveType || {};
  const allocated = (b.totalAllocated || 0) + (b.carriedForward || 0);
  const left = b.remaining ?? Math.max(0, allocated - (b.used || 0) - (b.pending || 0));
  const cap = (n, unit) => (n > 0 ? `${dayNum(n)} ${unit}` : 'No limit');

  return (
    <Drawer open={!!b} onClose={onClose}>
      <DrawerHead
        name={type.name || 'Leave'}
        sub={[type.code, b.academicYear].filter(Boolean).join(' · ')}
        tone={typeLook(type).tone}
        tags={[
          <span key="l" className={`lvbadge is-${left > 0 ? 'approved' : 'cancelled'}`}>
            {dayNum(left)} day{Number(left) === 1 ? '' : 's'} left
          </span>,
          policy && !policy.eligible
            ? <span key="e" className="lvbadge is-rejected" title={policy.ineligibleReason}>Not available to you</span>
            : null,
        ].filter(Boolean)}
        onClose={onClose}
      />

      <div className="ldrawer__body">
        <section className="ldrawer__sec lvbal">
          <h4>Your balance</h4>
          <dl className="lvbal__grid">
            <div><dt>Allocated</dt><dd>{dayNum(b.totalAllocated || 0)}</dd></div>
            <div><dt>Carried in</dt><dd>{dayNum(b.carriedForward || 0)}</dd></div>
            <div><dt>Used</dt><dd>{dayNum(b.used || 0)}</dd></div>
            {/* Held by an application nobody has decided on — not spent, not
                available, and the usual reason a figure looks short. */}
            <div><dt>Pending</dt><dd>{dayNum(b.pending || 0)}</dd></div>
            {b.expired ? <div><dt>Expired</dt><dd>{dayNum(b.expired)}</dd></div> : null}
            <div className="lvbal__left"><dt>Remaining</dt><dd>{dayNum(left)}</dd></div>
          </dl>
        </section>

        {policy && !policy.eligible && (
          <div className="lvnotice lvnotice--warn lvnotice--flat">
            <Icon name="alert" size={15} />
            <span>{policy.ineligibleReason || 'You cannot apply for this leave type.'}</span>
          </div>
        )}

        {policy && (
          <>
            <DrawerSection
              title="Applying"
              fields={[
                ['Minimum per application', policy.minDaysPerApplication > 0 ? dayNum(policy.minDaysPerApplication) : 'No minimum'],
                ['Longest single spell', cap(policy.maxConsecutiveDays, 'at a time')],
                ['Notice needed', policy.advanceNoticeDays > 0
                  ? `${dayNum(policy.advanceNoticeDays)} ahead` : 'None'],
                ['Back-dated', policy.allowBackdated
                  ? (policy.backdatedWithinDays > 0 ? `Within ${dayNum(policy.backdatedWithinDays)}` : 'Allowed')
                  : 'Not allowed'],
                ['Half days', policy.halfDayAllowed ? 'Allowed' : 'Not allowed'],
                ['Document', policy.requiresDocument
                  ? (policy.documentRequiredAfterDays > 0
                    ? `Needed past ${dayNum(policy.documentRequiredAfterDays)}`
                    : 'Always needed')
                  : 'Not needed'],
              ]}
            />

            <DrawerSection
              title="How often"
              fields={[
                ['Per month', policy.maxApplicationsPerMonth > 0
                  ? `${policy.maxApplicationsPerMonth} application(s)` : 'No cap'],
                ['Days per month', cap(policy.maxDaysPerMonth, 'a month')],
                ['Per year', policy.maxApplicationsPerYear > 0
                  ? `${policy.maxApplicationsPerYear} application(s)` : 'No cap'],
                // The sandwich rule is the one that surprises people: it charges
                // the weekend in the middle of a Friday-to-Monday absence.
                ['Sandwich rule', policy.sandwichRule
                  ? 'On — holidays and weekly offs inside the leave are charged'
                  : 'Off — weekends and holidays inside the leave are free'],
              ]}
            />

            <DrawerSection
              title="Year end"
              fields={[
                ['Carry forward', policy.carryForward?.enabled
                  ? (policy.carryForward.maxDays > 0
                    ? `Up to ${dayNum(policy.carryForward.maxDays)}`
                    : 'Everything unused')
                  : 'Unused days lapse'],
                ['Encashable', policy.encashable ? 'Yes, on exit settlement' : 'No'],
              ]}
            />
          </>
        )}
      </div>

      <DrawerFoot>
        {onApply && policy?.eligible !== false && (
          <Button onClick={() => onApply(type)}>
            <Icon name="plus" size={16} /> Apply for {type.name}
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DrawerFoot>
    </Drawer>
  );
}

/**
 * The three things worth saying about Comp Off, under the list.
 *
 * Rules an employee is judged by should be readable where they are applied,
 * not only in a policy screen they cannot reach.
 */
export const InfoPanels = ({ items }) => (
  <section className="card lvinfo">
    {items.map((it) => (
      <div className="lvinfo__item" key={it.title}>
        <span className={`lvinfo__mark lvinfo__mark--${it.tone || 'indigo'}`}>
          <Icon name={it.icon} size={19} />
        </span>
        <div>
          <b>{it.title}</b>
          <p>{it.text}</p>
        </div>
      </div>
    ))}
  </section>
);

/** A column heading with the second line of its cells named under it. */
export const ThSub = ({ children, sub, className }) => (
  <th className={className}>
    <span className="lvth">
      {children}
      {sub ? <small>{sub}</small> : null}
    </span>
  </th>
);

// ── Apply for leave ──────────────────────────────────────────────────────────

/** A dialog's own title block: a mark, what it is, and what pressing submit does. */
export const DialogHead = ({ icon, title, subtitle }) => (
  <div className="lvdlghead">
    <span className="lvdlghead__mark"><Icon name={icon} size={24} /></span>
    <div>
      <b>{title}</b>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  </div>
);

/** One numbered step of a form. */
export const FormStep = ({ n, title, note, children }) => (
  <section className="lvstep-sec">
    <header>
      <span className="lvstep-sec__n">{n}</span>
      <div>
        <b>{title}</b>
        {note ? <p>{note}</p> : null}
      </div>
    </header>
    <div className="lvstep-sec__body">{children}</div>
  </section>
);

/**
 * A choice between two or three things, as cards rather than a dropdown.
 *
 * Full day or half day is the sort of decision a dropdown hides — there are
 * two options, both matter, and one is nearly always right.
 */
export const ChoiceCards = ({ name, value, onChange, options }) => (
  <div className="lvchoices" role="radiogroup">
    {options.map((o) => (
      <label key={o.value} className={`lvchoice${value === o.value ? ' is-on' : ''}${o.disabled ? ' is-off' : ''}`}
        title={o.disabled ? o.disabledHint : undefined}>
        <input type="radio" name={name} value={o.value} checked={value === o.value}
          disabled={o.disabled} onChange={() => onChange(o.value)} />
        <span className="lvchoice__dot" aria-hidden />
        <span className="lvchoice__text">
          {o.label}
          {o.sub ? <small>{o.sub}</small> : null}
        </span>
      </label>
    ))}
  </div>
);

/** The file field, drawn as a drop target rather than a browse button. */
export const DropZone = ({ inputRef, accept, hint, fileName, error, required, onPick }) => (
  <div className={`lvdrop${error ? ' is-error' : ''}${fileName ? ' is-set' : ''}`}>
    <input ref={inputRef} type="file" accept={accept} onChange={onPick}
      aria-label={`Supporting document${required ? ' (required)' : ' (optional)'}`} />
    <Icon name={fileName ? 'fileCheck' : 'upload'} size={26} />
    <span className="lvdrop__text">
      {fileName
        ? <><b>{fileName}</b><small>Click to choose a different file</small></>
        : <><b>Click to upload</b> or drag and drop<small>{hint}</small></>}
    </span>
  </div>
);

/**
 * One ratio, drawn round, with the figure that matters in the middle.
 *
 * A meter rather than a chart — there is one number here, and the ring is the
 * shape of it against the year's allowance.
 */
export const MiniRing = ({ value, total, caption, note, tone = '#4f46e5' }) => {
  const R = 34;
  const C = 2 * Math.PI * R;
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return (
    <div className="lvring">
      <svg width="86" height="86" viewBox="0 0 86 86" role="img"
        aria-label={`${value} of ${total} ${caption}`}>
        <circle cx="43" cy="43" r={R} fill="none" stroke="#eef1f6" strokeWidth="10" />
        {pct > 0 && (
          <circle cx="43" cy="43" r={R} fill="none" stroke={tone} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`}
            transform="rotate(-90 43 43)" />
        )}
      </svg>
      <div className="lvring__text">
        <strong>{dayNum(value)}</strong>
        <span>{caption}</span>
        {note ? <small>{note}</small> : null}
      </div>
    </div>
  );
};

/** A figure with an icon and a name, in the dialog's side panel. */
export const FactRow = ({ icon, label, value, tone }) => (
  <div className="lvfact">
    <span className="lvfact__mark"><Icon name={icon} size={16} /></span>
    <span className="lvfact__label">{label}</span>
    <b className={tone ? `lv${tone}` : undefined}>{value}</b>
  </div>
);

/** A note across the top of a dialog — the one thing to know before filling it in. */
export const DialogNote = ({ children, tone = 'info' }) => (
  <div className={`lvdlgnote lvdlgnote--${tone}`}>
    <Icon name="alert" size={16} />
    <span>{children}</span>
  </div>
);

/** A label and a value, in a dialog's summary panel. `lead` marks the answer. */
export const SummaryLine = ({ label, value, lead }) => (
  <div className={`lvsumline${lead ? ' is-lead' : ''}`}>
    <span>{label}</span>
    <b>{value}</b>
  </div>
);

/** The rules a form will be judged by, as a list beside it. */
export const RulesNote = ({ title, items }) => (
  <section className="lvrules">
    <header><Icon name="alert" size={16} /><b>{title}</b></header>
    <ul>
      {items.filter(Boolean).map((t) => <li key={t}>{t}</li>)}
    </ul>
  </section>
);

/** "9h 30m" from a pair of HH:MM strings, or null when either is missing. */
export function hoursBetween(from, to) {
  if (!from || !to) return null;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) return null;
  // A shift that ends "before" it starts ran past midnight.
  const mins = (th * 60 + tm) - (fh * 60 + fm) + ((th * 60 + tm) < (fh * 60 + fm) ? 1440 : 0);
  return mins / 60;
}

export const fmtHours = (h) =>
  h == null ? '—' : `${Math.floor(h)}h ${Math.round((h - Math.floor(h)) * 60)}m`;

/** The weekday a date falls on — half the reason a Comp Off claim is valid. */
export const weekdayOf = (d) => {
  if (!d) return '';
  const x = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
};
