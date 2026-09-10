/**
 * The pieces of one book's page.
 *
 * What is shown here is what the catalogue actually holds — title, authors,
 * publisher, edition, ISBN, language, category, description, and the copies
 * behind them. There is no cover art, no star rating, no page count and no
 * reader reviews anywhere in this module, so there are none here: a page that
 * prints "4.8 ★ (124 reviews)" over a table nobody wrote is worse than one that
 * says less.
 *
 * A book therefore leads with its spine, drawn from its own title, the same way
 * the catalogue and the reports do.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../components/ui/icons';

// ── Formatting ───────────────────────────────────────────────────────────────

export const fmtDate = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '');

export const authorsOf = (book) => (Array.isArray(book?.authors) ? book.authors : [])
  .filter(Boolean).join(', ');

/** An em dash, so an empty field reads as "not recorded" rather than a gap. */
export const Blank = ({ children = '—' }) => <span className="lnone">{children}</span>;

// ── The book's state ─────────────────────────────────────────────────────────
//
//  Four states, in the order a librarian cares about them. Derived here rather
//  than stored: `availableCopies` alone cannot tell "every copy is out" from
//  "this title has no copies at all", and those need different answers.

export const stateOf = (book, stats = {}) => {
  const total = book?.totalCopies ?? 0;
  const free  = book?.availableCopies ?? 0;
  if (!total)            return { key: 'none',      tone: 'mute', label: 'No copies',     hint: 'Nothing to lend yet' };
  if (stats.overdue)     return { key: 'overdue',   tone: 'bad',  label: 'Overdue',       hint: `${stats.overdue} ${stats.overdue === 1 ? 'copy' : 'copies'} past due` };
  if (free > 0)          return { key: 'available', tone: 'ok',   label: 'Available',     hint: 'On the shelf now' };
  return { key: 'out', tone: 'warn', label: 'All copies out', hint: 'Nothing left to lend' };
};

export const StateChip = ({ state }) => (
  <span className={`libbd-state is-${state.tone}`}>
    <i aria-hidden />{state.label}
  </span>
);

/** The spine, at whatever size the slot needs. */
export const Spine = ({ title, size = 'lg' }) => (
  <span className={`libbd-spine is-${size}`} aria-hidden>
    {String(title || '?').trim().charAt(0).toUpperCase()}
  </span>
);

// ── The header ───────────────────────────────────────────────────────────────

export const BookHero = ({ book, state }) => (
  <header className="libbd-hero">
    <Spine title={book.title} />
    <div className="libbd-hero__text">
      <h1>{book.title}</h1>
      <p className="libbd-hero__by">{authorsOf(book) || <Blank>Author not recorded</Blank>}</p>
      <div className="libbd-hero__chips">
        {book.category ? <span className="libbd-chip">{book.category}</span> : null}
        {book.language ? <span className="libbd-chip">{book.language}</span> : null}
        {book.edition ? <span className="libbd-chip">{book.edition}</span> : null}
        <StateChip state={state} />
      </div>
      {book.description
        ? <p className="libbd-hero__desc">{book.description}</p>
        : <p className="libbd-hero__desc lnone">No description recorded for this title.</p>}
    </div>
  </header>
);

// ── Tabs ─────────────────────────────────────────────────────────────────────

export const Tabs = ({ tabs, active, onPick }) => (
  <div className="libbd-tabs" role="tablist">
    {tabs.map((t) => (
      <button key={t.key} type="button" role="tab" aria-selected={active === t.key}
        className={`libbd-tab${active === t.key ? ' is-on' : ''}`}
        onClick={() => onPick(t.key)}>
        {t.label}
        {t.count !== undefined ? <b>{t.count}</b> : null}
      </button>
    ))}
  </div>
);

// ── Panels ───────────────────────────────────────────────────────────────────

export const Panel = ({ icon, tone = 'indigo', title, subtitle, action, className = '', children }) => (
  <section className={`card libbd-panel ${className}`.trim()}>
    <header className="libbd-panel__head">
      {icon ? <span className={`libbd-panel__icon tint-${tone}`}><Icon name={icon} size={17} /></span> : null}
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
    <div className="libbd-panel__body">{children}</div>
  </section>
);

/** A labelled list of what the catalogue holds. Rows are [label, value, icon]. */
export const Facts = ({ rows }) => (
  <dl className="libbd-facts">
    {rows.map(([label, value, icon]) => (
      <div key={label}>
        <dt>
          {icon ? <Icon name={icon} size={15} /> : null}
          {label}
        </dt>
        <dd>{value === '' || value === null || value === undefined ? <Blank /> : value}</dd>
      </div>
    ))}
  </dl>
);

// ── Where the copies are ─────────────────────────────────────────────────────

const SEGMENTS = [
  { key: 'available', label: 'On the shelf', tone: 'ok' },
  { key: 'issued',    label: 'Out on loan',  tone: 'info' },
  { key: 'reserved',  label: 'Held',         tone: 'warn' },
  { key: 'damaged',   label: 'Damaged',      tone: 'amber' },
  { key: 'lost',      label: 'Lost',         tone: 'bad' },
];

/**
 * The stock, split by where it is. A bar plus a counted key beside it — the
 * colours are a second reading of the same numbers, never the only one.
 */
export const StockBar = ({ breakdown = {}, total = 0 }) => {
  const parts = SEGMENTS.map((s) => ({ ...s, n: Number(breakdown[s.key] || 0) })).filter((s) => s.n > 0);
  const sum = parts.reduce((a, s) => a + s.n, 0) || total;

  if (!sum) {
    return <p className="libbd-none">No copies are registered against this title yet.</p>;
  }
  return (
    <div className="libbd-stock">
      <div className="libbd-stock__bar" role="img"
        aria-label={parts.map((s) => `${s.n} ${s.label}`).join(', ')}>
        {parts.map((s) => (
          <span key={s.key} className={`is-${s.tone}`} style={{ width: `${(s.n / sum) * 100}%` }} />
        ))}
      </div>
      <ul className="libbd-stock__key">
        {SEGMENTS.map((s) => (
          <li key={s.key}>
            <i className={`is-${s.tone}`} aria-hidden />
            <span>{s.label}</span>
            <b>{Number(breakdown[s.key] || 0)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ── The sidebar ──────────────────────────────────────────────────────────────

export const QuickActions = ({ items }) => (
  <div className="libbd-quick">
    {items.map((a) => (
      <button key={a.label} type="button" className={`libbd-quick__btn is-${a.tone || 'indigo'}`}
        onClick={a.onClick} disabled={a.disabled} title={a.disabled ? a.why : undefined}>
        <span className={`libbd-quick__icon tint-${a.tone === 'danger' ? 'pink' : (a.tone || 'indigo')}`}>
          <Icon name={a.icon} size={18} />
        </span>
        {a.label}
      </button>
    ))}
  </div>
);

/**
 * What a reader who liked this one might take next — another book by the same
 * author first, then the rest of the category. The server decides which; this
 * only says why each one is here.
 */
export const RelatedBooks = ({ books = [], to }) => {
  if (!books.length) {
    return <p className="libbd-none">Nothing else by this author or in this category yet.</p>;
  }
  return (
    <ul className="libbd-related">
      {books.map((b) => (
        <li key={b._id}>
          <Link to={`${to}/${b._id}`}>
            <Spine title={b.title} size="sm" />
            {/* Why it is here rides on the second line with the author. As a
                chip of its own it took 110px out of a 288px row and left the
                title with barely a word. */}
            <span className="libbd-related__text">
              <b>{b.title}</b>
              <small>
                {b.sameAuthor ? 'Same author' : (b.category || 'Same shelf')}
                {' · '}
                {b.availableCopies > 0 ? `${b.availableCopies} on the shelf` : 'None free'}
              </small>
            </span>
            <Icon name="chevronRight" size={14} />
          </Link>
        </li>
      ))}
    </ul>
  );
};

// ── Small shared cells ───────────────────────────────────────────────────────

export const LOAN_TONE = {
  issued: 'info', overdue: 'bad', returned: 'ok', lost: 'bad',
};

export const CopyStatus = ({ status }) => (
  <span className={`libbd-tag is-${{
    available: 'ok', issued: 'info', reserved: 'warn', damaged: 'amber', lost: 'bad',
  }[status] || 'mute'}`}>{status}</span>
);

export const LoanStatus = ({ status }) => (
  <span className={`libbd-tag is-${LOAN_TONE[status] || 'mute'}`}>{status}</span>
);

export const Who = ({ name, sub }) => (
  <div className="libbd-who">
    <b>{name || <Blank>Unknown</Blank>}</b>
    {sub ? <small>{sub}</small> : null}
  </div>
);
