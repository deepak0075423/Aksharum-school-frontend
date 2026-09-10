/**
 * The pieces of the fines register.
 *
 * A fine has three statuses — `pending`, `paid`, `waived` — and that is all the
 * model has. There is no "cancelled": writing a fine off *is* waiving it, and a
 * chip for a state nothing can ever be in would filter to an empty table
 * forever.
 *
 * What is owed is **arithmetic, not a status**: `amount − waived − paid`. A fine
 * can be part-waived and part-paid, so reading the status alone would miss the
 * remainder — every figure below is computed the same way the server computes
 * the totals.
 */
import React from 'react';
import Icon from '../../../components/ui/icons';

// ── Formatting ───────────────────────────────────────────────────────────────

export const fmtDate = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '');

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const today = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

/** What is still owed after any waiver and any part payment. */
export const owedOn = (f) => Math.max(0, (f?.amount || 0) - (f?.waivedAmount || 0) - (f?.paidAmount || 0));

// ── Reasons and statuses ─────────────────────────────────────────────────────

export const REASONS = {
  late_return: 'Late return',
  lost:        'Lost book',
  damaged:     'Damaged book',
};

export const REASON_FILTERS = [
  ['', 'All reasons'],
  ['late_return', 'Late return'],
  ['lost', 'Lost book'],
  ['damaged', 'Damaged book'],
];

export const PAYMENT_FILTERS = [
  ['', 'Paid any way'],
  ['cash', 'Paid in cash'],
  ['online', 'Paid online'],
];

export const STATUS = {
  pending: { label: 'Unpaid',      tone: 'bad',  chip: 'Unpaid' },
  paid:    { label: 'Paid',        tone: 'ok',   chip: 'Paid' },
  waived:  { label: 'Written off', tone: 'mute', chip: 'Written off' },
};

/** The three states, as counted filters. `''` is everything. */
export const StatusTabs = ({ value, counts, onPick }) => {
  const tabs = [
    ['', 'All', counts.total?.count],
    ['pending', STATUS.pending.chip, counts.pending?.count],
    ['paid', STATUS.paid.chip, counts.paid?.count],
    ['waived', STATUS.waived.chip, counts.waived?.count],
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

export const MemberCell = ({ row }) => {
  const name = row.user?.name || '—';
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const role = row.user?.role === 'teacher' ? 'Teacher' : row.user?.role === 'student' ? 'Student' : 'Staff';
  // Staff have no class, and a student whose section was never set has none.
  const where = row.borrowerClass ? `${row.borrowerClass} · ${role}` : role;
  return (
    <span className="libf-who">
      <span className="libf-who__mark" aria-hidden>{initials || '?'}</span>
      <span>
        <b>{name}</b>
        <small>{where}</small>
      </span>
    </span>
  );
};

/** The catalogue holds no cover art, so a fine leads with the book's spine. */
export const Spine = ({ title }) => (
  <span className="libf-spine" aria-hidden>{(title || '?').charAt(0).toUpperCase()}</span>
);

/**
 * What the fine is against.
 *
 * The title never used to reach this screen — the register said somebody owed
 * ₹60 without saying what for.
 */
export const BookCell = ({ row }) => (
  row.book
    ? (
      <span className="libf-book">
        <Spine title={row.book.title} />
        <span>
          <b>{row.book.title}</b>
          {row.book.isbn ? <small>ISBN {row.book.isbn}</small> : null}
        </span>
      </span>
    )
    : <span className="lnone">Book no longer catalogued</span>
);

/**
 * The charge, and what has happened to it.
 *
 * A part-waived, part-paid fine is not describable by one number, so the line
 * beneath says which parts moved and the remainder is called out in red.
 */
export const AmountCell = ({ row }) => {
  const owed = owedOn(row);
  return (
    <span className="libf-amount">
      <b>{money(row.amount)}</b>
      {row.waivedAmount || row.paidAmount ? (
        <small>
          {row.paidAmount ? `${money(row.paidAmount)} paid` : ''}
          {row.paidAmount && row.waivedAmount ? ' · ' : ''}
          {row.waivedAmount ? `${money(row.waivedAmount)} off` : ''}
        </small>
      ) : null}
      {owed > 0 && owed !== row.amount ? <em>{money(owed)} left</em> : null}
    </span>
  );
};

/**
 * Paid, unpaid or written off — and how it was paid.
 *
 * `paymentMode` defaults to 'cash' on every row including ones nobody has paid,
 * so it is only ever shown when money actually moved.
 */
export const PaymentCell = ({ row }) => {
  const s = STATUS[row.status] || { label: row.status || '—', tone: 'mute' };
  const paid = (row.paidAmount || 0) > 0;
  return (
    <span className="libf-pay">
      <span className={`libr-status is-${s.tone}`}>{s.label}</span>
      {paid ? <small>{row.paymentMode === 'online' ? 'Online' : 'Cash'}{row.receiptNumber ? ` · ${row.receiptNumber}` : ''}</small> : null}
      {row.status === 'waived' && row.waiverReason ? <small title={row.waiverReason}>{row.waiverReason}</small> : null}
    </span>
  );
};

/** Days late is a late-return measure; a lost or damaged book has none. */
export const DaysLateCell = ({ row }) => (
  row.daysOverdue > 0
    ? <span className="libf-late">{row.daysOverdue}</span>
    : <span className="lnone">—</span>
);

// ── Filter bar ───────────────────────────────────────────────────────────────

export const DateRange = ({ from, to, onChange }) => (
  <span className="libc-range">
    <Icon name="calendar" size={15} />
    <input type="date" className="form-control" value={from} max={to || today()}
      aria-label="Raised from" onChange={(e) => onChange({ from: e.target.value, to })} />
    <span aria-hidden>–</span>
    <input type="date" className="form-control" value={to} min={from || undefined} max={today()}
      aria-label="Raised until" onChange={(e) => onChange({ from, to: e.target.value })} />
  </span>
);

export const SearchBox = ({ value, onChange }) => (
  <span className="libc-search">
    <Icon name="search" size={16} />
    <input className="form-control" value={value} aria-label="Search fines"
      placeholder="Search by member name or book title…"
      onChange={(e) => onChange(e.target.value)} />
    {value && (
      <button type="button" onClick={() => onChange('')} aria-label="Clear search">
        <Icon name="close" size={14} />
      </button>
    )}
  </span>
);
