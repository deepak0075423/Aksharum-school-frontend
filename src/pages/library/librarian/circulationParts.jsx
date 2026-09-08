/**
 * The pieces of the circulation register.
 *
 * The register lists **loans**, not events. That is why there is no "Issue /
 * Return" column: a row is one loan, and its state is already in Status —
 * a second column saying the same thing twice is a column that can disagree
 * with itself. The slot carries the copy code instead, which is what a
 * librarian actually needs when two copies of the same title are out.
 *
 * Filtering, searching, the date window and paging all travel with the request.
 * The register is paginated, so narrowing it in the browser would narrow one
 * page and leave the rest wrong.
 */
import React from 'react';
import Icon from '../../../components/ui/icons';

// ── Formatting ───────────────────────────────────────────────────────────────

export const fmtDate = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '');

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** Today, as the value a `<input type="date">` wants. */
export const dayValue = (d) => {
  const x = d ? new Date(d) : new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// ── Status ───────────────────────────────────────────────────────────────────

export const STATUS = {
  issued:   { label: 'On loan',  tone: 'ok' },
  returned: { label: 'Returned', tone: 'info' },
  overdue:  { label: 'Overdue',  tone: 'bad' },
  // A written-off loan is not an ordinary return, and used to fall through to
  // the grey default and look like one.
  lost:     { label: 'Lost',     tone: 'warn' },
};

export const StatusChip = ({ status }) => {
  const s = STATUS[status] || { label: status || '—', tone: 'mute' };
  return <span className={`libc-status is-${s.tone}`}>{s.label}</span>;
};

// ── Cells ────────────────────────────────────────────────────────────────────

/** The catalogue holds no cover art, so a loan leads with the book's spine. */
export const Spine = ({ title }) => (
  <span className="libc-spine" aria-hidden>{(title || '?').charAt(0).toUpperCase()}</span>
);

export const BookCell = ({ row }) => (
  <span className="libc-book">
    <Spine title={row.book?.title} />
    <span>
      <b>{row.book?.title || '—'}</b>
      {row.book?.isbn ? <small>ISBN {row.book.isbn}</small> : <small className="lnone">No ISBN</small>}
    </span>
  </span>
);

/**
 * Who has it.
 *
 * Staff have no class, and a student whose section was never set has none
 * either — both say so rather than leaving the line half empty.
 */
export const MemberCell = ({ row }) => {
  const role = row.issuedToRole ? row.issuedToRole[0].toUpperCase() + row.issuedToRole.slice(1) : '';
  const where = row.borrowerClass
    || (row.issuedToRole === 'student' ? 'No class set' : 'Staff');
  return (
    <span className="libc-member">
      <b>{row.issuedTo?.name || '—'}</b>
      <small>{[role, where].filter(Boolean).join(' · ')}</small>
    </span>
  );
};

/** The physical copy — which of the five is out, not just which title. */
export const CopyCell = ({ row }) => (
  row.bookCopy?.uniqueCode
    ? <span className="libc-copy">{row.bookCopy.uniqueCode}</span>
    : <span className="lnone">—</span>
);

/**
 * When it is due, and whether that has passed.
 *
 * The date is coloured only when the book is still out — a returned loan that
 * happened to come back late is history, not a job.
 */
export const DueCell = ({ row }) => {
  const open = row.status === 'issued' || row.status === 'overdue';
  const late = open && row.dueDate && new Date(row.dueDate) < new Date();
  const days = late ? Math.floor((Date.now() - new Date(row.dueDate).getTime()) / 86400000) : 0;
  return (
    <span className={`libc-due${late ? ' is-late' : ''}`}>
      {fmtDate(row.dueDate) || '—'}
      {days > 0 ? <small>{days} {days === 1 ? 'day' : 'days'} late</small> : null}
    </span>
  );
};

/**
 * What the loan cost and whether it has been settled.
 *
 * A loan closed as lost is a debt as much as a stock write-off, so the charge
 * and the payment against it are both shown; nothing charged prints a dash
 * rather than a zero, which would read as a fine of nothing.
 */
export const FineCell = ({ row }) => {
  const f = row.fineSummary;
  if (!f || !f.charged) return <span className="lnone">—</span>;
  const label = f.status === 'paid' ? 'Paid' : f.status === 'waived' ? 'Waived' : 'Unpaid';
  return (
    <span className={`libc-fine is-${f.status}`}>
      <b>{money(f.charged)}</b>
      <small>
        {label}
        {f.outstanding > 0 ? ` · ${money(f.outstanding)} due` : ''}
      </small>
    </span>
  );
};

// ── The filter bar ───────────────────────────────────────────────────────────

export const STATUS_FILTERS = [
  ['', 'All statuses'],
  ['issued', 'On loan'],
  ['overdue', 'Overdue'],
  ['returned', 'Returned'],
  ['lost', 'Lost'],
];

export const ROLE_FILTERS = [
  ['', 'Students & staff'],
  ['student', 'Students'],
  ['teacher', 'Teachers'],
];

/** A date window on when the loan was made. Either end may be left open. */
export const DateRange = ({ from, to, onChange }) => (
  <span className="libc-range">
    <Icon name="calendar" size={15} />
    <input type="date" className="form-control" value={from} max={to || undefined}
      aria-label="Issued from" onChange={(e) => onChange({ from: e.target.value, to })} />
    <span aria-hidden>–</span>
    <input type="date" className="form-control" value={to} min={from || undefined}
      aria-label="Issued until" onChange={(e) => onChange({ from, to: e.target.value })} />
  </span>
);

export const SearchBox = ({ value, onChange }) => (
  <span className="libc-search">
    <Icon name="search" size={16} />
    <input className="form-control" value={value} aria-label="Search the register"
      placeholder="Search by member, book title, ISBN or copy code…"
      onChange={(e) => onChange(e.target.value)} />
    {value && (
      <button type="button" onClick={() => onChange('')} aria-label="Clear search">
        <Icon name="close" size={14} />
      </button>
    )}
  </span>
);
