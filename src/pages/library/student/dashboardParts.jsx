/**
 * The library landing page's panels — used by the student's Library page and
 * the teacher's, which are the same screen with different data behind it.
 *
 * The split that matters here is not student-vs-teacher but personal-vs-school:
 * a member sees their own loans and fines, and a teacher who runs the library
 * sees the counter's. The shapes below take either, so the page decides once
 * and nothing further down has to know which it got.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../components/ui/icons';

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const shortDate = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—');

/** "2 hours ago" — activity is read as recency, not as a timestamp. */
export function ago(d) {
  if (!d) return '';
  const secs = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const steps = [['minute', 60], ['hour', 60], ['day', 24], ['week', 7], ['month', 4.35], ['year', 12]];
  let n = secs / 60, unit = 'minute';
  for (let i = 0; i < steps.length - 1 && n >= steps[i + 1][1]; i++) {
    n /= steps[i + 1][1];
    unit = steps[i + 1][0];
  }
  const whole = Math.floor(n);
  return `${whole} ${unit}${whole === 1 ? '' : 's'} ago`;
}

const STATUS = {
  issued:   { label: 'Active',   tone: 'green' },
  overdue:  { label: 'Overdue',  tone: 'red' },
  returned: { label: 'Returned', tone: 'slate' },
  lost:     { label: 'Lost',     tone: 'red' },
};
export const StatusPill = ({ status }) => {
  const s = STATUS[status] || { label: status || '—', tone: 'slate' };
  return <span className={`liblg-pill liblg-t--${s.tone}`}>{s.label}</span>;
};

// ── Header band ──────────────────────────────────────────────────────────────
/** Books on a shelf. Ornament only — no data, no links. */
export const ShelfArt = () => (
  <svg className="liblg-art" viewBox="0 0 300 108" aria-hidden="true" focusable="false">
    <path d="M34 66c-12-2-17-11-15-23 11-1 17 8 15 23Z" fill="#34d399" />
    <path d="M36 66c10-3 14-13 10-24-10 2-14 11-10 24Z" fill="#10b981" />
    <path d="M35 66V48" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M24 68h23l-4 26H28l-4-26Z" fill="#6366f1" />

    <rect x="86"  y="30" width="15" height="64" rx="3" fill="#6366f1" />
    <rect x="103" y="18" width="13" height="76" rx="3" fill="#f59e0b" />
    <rect x="118" y="38" width="16" height="56" rx="3" fill="#ef4444" />
    <rect x="136" y="24" width="12" height="70" rx="3" fill="#3b82f6" />
    <rect x="150" y="44" width="15" height="50" rx="3" fill="#a78bfa" />
    <rect x="167" y="30" width="13" height="64" rx="3" fill="#10b981" />
    <rect x="182" y="20" width="16" height="74" rx="3" fill="#f472b6" />
    <rect x="90"  y="42" width="7" height="3" rx="1.5" fill="#fff" opacity=".65" />
    <rect x="106" y="32" width="7" height="3" rx="1.5" fill="#fff" opacity=".65" />
    <rect x="122" y="50" width="8" height="3" rx="1.5" fill="#fff" opacity=".65" />
    <rect x="186" y="34" width="8" height="3" rx="1.5" fill="#fff" opacity=".65" />

    <g transform="rotate(9 232 78)">
      <rect x="206" y="76" width="52" height="7" rx="2" fill="#818cf8" />
      <rect x="210" y="69" width="44" height="7" rx="2" fill="#fbbf24" />
      <rect x="214" y="62" width="36" height="7" rx="2" fill="#34d399" />
    </g>

    <path d="M270 26l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="currentColor" opacity=".35" />
    <rect x="14" y="94" width="272" height="4" rx="2" fill="currentColor" opacity=".12" />
  </svg>
);

export function LibHero({ title, blurb, quote }) {
  return (
    <header className="liblg-hero">
      <span className="liblg-ico liblg-ico--xl liblg-t--indigo"><Icon name="bookOpen" size={28} /></span>
      <div className="liblg-hero__body">
        <h1>{title}</h1>
        <p>{blurb}</p>
      </div>
      <div className="liblg-hero__art">
        <ShelfArt />
        {quote && <blockquote className="liblg-quote">{quote}</blockquote>}
      </div>
    </header>
  );
}

// ── Figures ──────────────────────────────────────────────────────────────────
export function Fig({ icon, tone = 'indigo', label, value, caption, to }) {
  const inner = (
    <>
      <span className="liblg-ico liblg-ico--lg"><Icon name={icon} size={24} /></span>
      <span className="liblg-fig__body">
        <span className="liblg-fig__label">{label}</span>
        <strong className="liblg-fig__value">{value}</strong>
        {caption && <span className="liblg-fig__cap">{caption}</span>}
      </span>
    </>
  );
  return to
    ? <Link to={to} className={`liblg-fig liblg-fig--go liblg-t--${tone}`}>{inner}</Link>
    : <div className={`liblg-fig liblg-t--${tone}`}>{inner}</div>;
}

// ── Card ─────────────────────────────────────────────────────────────────────
export function Panel({ icon, tone = 'indigo', title, action, children, className = '' }) {
  return (
    <section className={`liblg-card ${className}`}>
      <header className="liblg-card__head">
        <h2>
          <span className={`liblg-hicon liblg-t--${tone}`}><Icon name={icon} size={19} /></span>
          {title}
        </h2>
        {action}
      </header>
      <div className="liblg-card__body">{children}</div>
    </section>
  );
}

export const ViewAll = ({ to, label = 'View All' }) => (
  to ? <Link className="liblg-more" to={to}>{label}<Icon name="arrowRight" size={15} /></Link> : null
);

// ── Quick actions ────────────────────────────────────────────────────────────
export const Action = ({ to, icon, tone, label, sub }) => (
  <Link to={to} className={`liblg-act liblg-t--${tone}`}>
    <span className="liblg-act__icon"><Icon name={icon} size={26} /></span>
    <strong>{label}</strong>
    <em>{sub}</em>
  </Link>
);

// ── Loans table ──────────────────────────────────────────────────────────────
/**
 * `rows` are `{ _id, title, borrower, borrowerClass, issueDate, dueDate, status }`.
 * The borrower column only appears when there is somebody other than the reader
 * to name — on a member's own page every row would say "me".
 */
export function LoanTable({ rows, showBorrower, empty }) {
  if (!rows.length) {
    return (
      <div className="liblg-empty">
        <span className="liblg-empty__icon"><Icon name="bookOpen" size={26} /></span>
        <div><strong>{empty.title}</strong><p>{empty.body}</p></div>
      </div>
    );
  }
  return (
    <div className="liblg-tablewrap">
      <table className="liblg-table">
        <thead>
          <tr>
            <th className="liblg-num">#</th>
            <th>Book title</th>
            {showBorrower && <th>Issued to</th>}
            <th>Issue date</th>
            <th>Due date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r._id}>
              <td className="liblg-num">{i + 1}</td>
              <td><strong>{r.title}</strong></td>
              {showBorrower && (
                <td>
                  <span className="liblg-who">{r.borrower}</span>
                  {r.borrowerClass && <em>{r.borrowerClass}</em>}
                </td>
              )}
              <td>{shortDate(r.issueDate)}</td>
              <td>{shortDate(r.dueDate)}</td>
              <td><StatusPill status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────
/** `items` are `{ _id, icon, tone, title, sub, at }`. */
export function Activity({ items, empty }) {
  if (!items.length) {
    return (
      <div className="liblg-empty">
        <span className="liblg-empty__icon"><Icon name="activity" size={26} /></span>
        <div><strong>{empty.title}</strong><p>{empty.body}</p></div>
      </div>
    );
  }
  return (
    <div className="liblg-acts">
      {items.map((a) => (
        <div key={a._id} className={`liblg-actrow liblg-t--${a.tone}`}>
          <span className="liblg-ico"><Icon name={a.icon} size={18} /></span>
          <span className="liblg-actrow__body">
            <strong>{a.title}</strong>
            {a.sub && <em>{a.sub}</em>}
          </span>
          <time>{ago(a.at)}</time>
        </div>
      ))}
    </div>
  );
}

// ── Categories ───────────────────────────────────────────────────────────────
const CAT_TONES = ['blue', 'violet', 'pink', 'green', 'amber', 'indigo'];

export function Categories({ categories, empty }) {
  const all  = categories || [];
  const rows = all.slice(0, 5);
  // Divided by every category, not just the five on screen: each book has
  // exactly one category, so this sums to the whole collection and the shares
  // cannot add up to more than it.
  const total = all.reduce((n, c) => n + Number(c.count || 0), 0);
  if (!rows.length) {
    return (
      <div className="liblg-empty">
        <span className="liblg-empty__icon"><Icon name="layers" size={26} /></span>
        <div><strong>{empty.title}</strong><p>{empty.body}</p></div>
      </div>
    );
  }
  const top = Math.max(...rows.map((c) => c.count), 1);
  return (
    <div className="liblg-cats">
      {rows.map((c, i) => {
        const share = total ? Math.round((c.count / total) * 100) : 0;
        return (
          <div key={c.category} className={`liblg-cat liblg-t--${CAT_TONES[i % CAT_TONES.length]}`}>
            <span className="liblg-ico"><Icon name="book" size={17} /></span>
            <span className="liblg-cat__name">
              <strong>{c.category}</strong>
              <em>{c.count} book{c.count === 1 ? '' : 's'}</em>
            </span>
            <span className="liblg-cat__bar"><i style={{ width: `${Math.max(4, Math.round((c.count / top) * 100))}%` }} /></span>
            <span className="liblg-cat__pct">{share}%</span>
          </div>
        );
      })}
    </div>
  );
}
