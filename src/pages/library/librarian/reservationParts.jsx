/**
 * The pieces of the reservation queue.
 *
 * The queue has five real states — `pending`, `ready`, `collected`, `expired`
 * and `cancelled` — and all five get a chip. A hold that lapsed on the shelf is
 * not the same thing as one somebody cancelled, and folding them together would
 * make those rows unreachable under any filter.
 *
 * The two numbers worth acting on are not counts of rows: how many holds fall
 * off the shelf in the next two days, and how long the person at the front of
 * the queue has been waiting. Both ride under the tiles they belong to.
 */
import React from 'react';
import Icon from '../../../components/ui/icons';

// ── Formatting ───────────────────────────────────────────────────────────────

export const fmtDate = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '');

// ── Status ───────────────────────────────────────────────────────────────────

export const STATUS = {
  ready:     { label: 'Ready',     tone: 'ok',   chip: 'Ready to collect' },
  pending:   { label: 'Waiting',   tone: 'warn', chip: 'Waiting in queue' },
  collected: { label: 'Collected', tone: 'info', chip: 'Collected' },
  expired:   { label: 'Expired',   tone: 'mute', chip: 'Expired' },
  cancelled: { label: 'Cancelled', tone: 'bad',  chip: 'Cancelled' },
};

export const StatusChip = ({ status }) => {
  const s = STATUS[status] || { label: status || '—', tone: 'mute' };
  return <span className={`libr-status is-${s.tone}`}>{s.label}</span>;
};

/** The states, as a row of counted filters. `''` is everything. */
export const StatusTabs = ({ value, counts, onPick }) => {
  const tabs = [
    ['', 'All', counts.all],
    ['ready', STATUS.ready.chip, counts.ready],
    ['pending', STATUS.pending.chip, counts.waiting],
    ['collected', STATUS.collected.chip, counts.collected],
    ['expired', STATUS.expired.chip, counts.expired],
    ['cancelled', STATUS.cancelled.chip, counts.cancelled],
  ];
  return (
    <div className="libr-tabs" role="group" aria-label="Filter by status">
      {tabs.map(([v, label, n]) => (
        <button key={v || 'all'} type="button" aria-pressed={value === v}
          className={`libr-tab${value === v ? ' is-on' : ''}${v ? ` is-${STATUS[v].tone}` : ''}`}
          onClick={() => onPick(v)}>
          {v ? <i /> : null}{label} <b>{n ?? 0}</b>
        </button>
      ))}
    </div>
  );
};

// ── Cells ────────────────────────────────────────────────────────────────────

/** The catalogue holds no cover art, so a reservation leads with the spine. */
export const Spine = ({ title }) => (
  <span className="libr-spine" aria-hidden>{(title || '?').charAt(0).toUpperCase()}</span>
);

export const BookCell = ({ row }) => (
  <span className="libr-book">
    <Spine title={row.book?.title} />
    <span>
      <b>{row.book?.title || '—'}</b>
      {row.book?.isbn ? <small>ISBN {row.book.isbn}</small> : <small className="lnone">No ISBN</small>}
    </span>
  </span>
);

export const MemberCell = ({ row }) => {
  const name = row.reservedBy?.name || '—';
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span className="libr-who">
      <span className="libr-who__mark" aria-hidden>{initials || '?'}</span>
      <b>{name}</b>
    </span>
  );
};

/** Staff have no class, and a student whose section was never set has none. */
export const ClassCell = ({ row }) => {
  const role = row.reservedBy?.role || row.reservedByRole || '';
  const where = row.borrowerClass;
  if (where) return <span className="libr-class"><b>{where}</b><small>Student</small></span>;
  return <span className="libr-class"><b className="lnone">No class</b><small>{role === 'teacher' ? 'Teacher' : 'Staff or unplaced'}</small></span>;
};

/**
 * How long is left on the hold.
 *
 * A hold that lapses is given away, so the last two days are worth flagging —
 * and a date that has already passed with the row still marked ready means the
 * sweep has not run yet, which is worth saying rather than hiding.
 */
export const ExpiryCell = ({ row }) => {
  if (!row.expiresAt) return <span className="lnone">—</span>;
  const live = row.status === 'ready';
  const days = Math.ceil((new Date(row.expiresAt).getTime() - Date.now()) / 86400000);
  return (
    <span className={`libr-expiry${live && days <= 2 ? ' is-soon' : ''}`}>
      {fmtDate(row.expiresAt)}
      {live ? <small>{days <= 0 ? 'Due to lapse' : days === 1 ? 'Tomorrow' : `in ${days} days`}</small> : null}
    </span>
  );
};

/** Where they stand. Only a live queue has a position worth printing. */
export const QueueCell = ({ row }) => (
  row.status === 'pending' || row.status === 'ready'
    ? <span className="libr-queue">#{row.queuePosition || 1}</span>
    : <span className="lnone">—</span>
);

/**
 * The copy that would be handed over.
 *
 * This screen is where a held book is actually given out, so the row names the
 * copy and its shelf — otherwise the librarian goes to Circulation and looks
 * the same book up again.
 */
export const CopyCell = ({ row }) => {
  if (row.availableCopy) {
    return (
      <span className="libr-copy">
        <b>{row.availableCopy.uniqueCode}</b>
        {row.availableCopy.rackLocation ? <small>{row.availableCopy.rackLocation}</small> : null}
      </span>
    );
  }
  const closed = ['collected', 'cancelled', 'expired'].includes(row.status);
  return <span className="lnone">{closed ? '—' : 'None free'}</span>;
};

// ── Filter bar ───────────────────────────────────────────────────────────────

export const DateRange = ({ from, to, onChange }) => (
  <span className="libc-range">
    <Icon name="calendar" size={15} />
    <input type="date" className="form-control" value={from} max={to || undefined}
      aria-label="Reserved from" onChange={(e) => onChange({ from: e.target.value, to })} />
    <span aria-hidden>–</span>
    <input type="date" className="form-control" value={to} min={from || undefined}
      aria-label="Reserved until" onChange={(e) => onChange({ from, to: e.target.value })} />
  </span>
);

export const SearchBox = ({ value, onChange }) => (
  <span className="libc-search">
    <Icon name="search" size={16} />
    <input className="form-control" value={value} aria-label="Search reservations"
      placeholder="Search by book title, ISBN or member name…"
      onChange={(e) => onChange(e.target.value)} />
    {value && (
      <button type="button" onClick={() => onChange('')} aria-label="Clear search">
        <Icon name="close" size={14} />
      </button>
    )}
  </span>
);
