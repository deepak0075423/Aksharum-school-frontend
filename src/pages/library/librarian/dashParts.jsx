/**
 * The pieces of the library dashboard.
 *
 * The layout follows the module's design: five figures across the top, then
 * circulation / collection / quick actions, then the two lists. Everything in
 * it is measured — the trend under each figure is a real period-over-period
 * comparison from the server, not a decoration, and where there is nothing to
 * compare against it says so rather than printing a percentage of zero.
 *
 * Colour never carries meaning alone: the circulation chart runs two series off
 * the validated single-hue ramp (pages/analytics/palette.js) with a legend and
 * per-bar values, and every donut segment is named and counted beside it.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../components/ui/icons';
import { Badge } from '../../../components/ui/index';
import { VIZ } from '../../analytics/palette';

// ── Formatting ───────────────────────────────────────────────────────────────

export const fmtDay = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  : '');

export const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * The line under a figure: which way it moved, in as few words as fit.
 *
 * A percentage off a base of zero is not a hundred percent, it is undefined —
 * so a period with nothing in it says that instead.
 */
export const delta = (now, then, period) => {
  if (now === then)  return { dir: 'flat', text: 'No change' };
  if (then === 0)    return { dir: 'up',   text: `${now} — none ${period}` };
  const diff = now - then;
  const pct  = Math.abs(Math.round((diff / then) * 100));
  return { dir: diff > 0 ? 'up' : 'down', text: `${pct}% ${diff > 0 ? 'up on' : 'down on'} ${period}` };
};

/** A plain count with no comparison behind it — said as a count, not a trend. */
export const note = (text) => ({ dir: 'flat', text });

// ── The header ───────────────────────────────────────────────────────────────

export const Hero = ({ icon = 'library', title = 'Library', tagline, subtitle, quote }) => (
  <header className="libd-hero">
    <span className="libd-hero__mark"><Icon name={icon} size={30} /></span>
    <div className="libd-hero__text">
      <h1>{title}</h1>
      {tagline ? <p className="libd-hero__tag">{tagline}</p> : null}
      <p>{subtitle}</p>
    </div>
    <BooksArt />
    <blockquote className="libd-hero__quote">
      <span aria-hidden>“</span>
      <p>{quote.text}</p>
      <cite>— {quote.by}</cite>
    </blockquote>
  </header>
);

/** A stack of books, drawn rather than fetched — no asset pipeline needed. */
const BooksArt = () => (
  <svg className="libd-hero__art" viewBox="0 0 200 110" fill="none" aria-hidden focusable="false">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M46 96h108" opacity=".5" />
      <rect x="52" y="78" width="96" height="16" rx="3" />
      <rect x="58" y="62" width="84" height="16" rx="3" />
      <rect x="64" y="46" width="72" height="16" rx="3" />
      <path d="M62 78v16M68 62v16M74 46v16" opacity=".55" />
      <path d="M100 46V30M100 30c-6-8-16-9-22-6 2 8 12 12 22 6zM100 30c6-8 16-9 22-6-2 8-12 12-22 6z" opacity=".7" />
      <path d="M30 40c2-2.6 4-2.6 6 0M164 32c2-2.6 4-2.6 6 0" opacity=".45" />
    </g>
  </svg>
);

// ── Tiles ────────────────────────────────────────────────────────────────────

/**
 * One figure, what it is, and how it moved.
 *
 * The whole tile is the link to the page that explains it — a librarian reading
 * "2 overdue" wants the two, not a tour of the module.
 */
export const Tile = ({ icon, tone, value, label, caption, trend, to }) => (
  <Link to={to} className="libd-tile">
    <span className={`libd-tile__icon tint-${tone}`}><Icon name={icon} size={19} /></span>
    <span className="libd-tile__body">
      <span className="libd-tile__value">{value}</span>
      <span className="libd-tile__label">{label}</span>
      {caption ? <span className="libd-tile__cap">{caption}</span> : null}
      {trend ? (
        <span className={`libd-trend is-${trend.dir}`}>
          <Icon name={trend.dir === 'up' ? 'arrowUp' : trend.dir === 'down' ? 'arrowDown' : 'arrowRight'} size={11} />
          {trend.text}
        </span>
      ) : null}
    </span>
    <Icon name="chevronRight" size={15} />
  </Link>
);

export const Panel = ({ icon, tone = 'indigo', title, subtitle, to, linkLabel = 'View all', className = '', children }) => (
  <section className={`card libd-panel ${className}`.trim()}>
    <header className="libd-panel__head">
      <span className={`libd-panel__icon tint-${tone}`}><Icon name={icon} size={17} /></span>
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {to ? <Link to={to}>{linkLabel} <Icon name="arrowRight" size={13} /></Link> : null}
    </header>
    <div className="libd-panel__body">{children}</div>
  </section>
);

export const NoData = ({ icon = 'bookOpen', title, hint }) => (
  <div className="libd-none">
    <Icon name={icon} size={22} />
    <p>{title}</p>
    {hint ? <span>{hint}</span> : null}
  </div>
);

// ── Circulation ──────────────────────────────────────────────────────────────

const weekLabel = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/**
 * Books out against books back, week by week.
 *
 * Two series, so a legend is always present and every bar carries its own
 * value — the two steps come from one hue, and lightness alone is not allowed
 * to be the whole answer. Bars sit in pairs with 2px of the page between them
 * rather than a border, so nothing introduces a third colour.
 *
 * Drawn in CSS rather than through the charting library: twelve pairs of bars
 * is not worth a 100 kB chunk on a page that otherwise has none.
 */
export const WeekBars = ({ weeks }) => {
  const peak = Math.max(1, ...weeks.map((w) => Math.max(w.issued, w.returned)));
  const totalIssued = weeks.reduce((n, w) => n + w.issued, 0);
  const totalReturned = weeks.reduce((n, w) => n + w.returned, 0);

  if (!totalIssued && !totalReturned) {
    return <NoData icon="repeat" title="Nothing has crossed the counter yet"
      hint="Issues and returns appear here week by week as they happen." />;
  }

  return (
    <div className="libd-chart">
      <ul className="libd-legend">
        <li><i style={{ background: VIZ.accent }} />Issued <b>{totalIssued}</b></li>
        <li><i style={{ background: VIZ.bands[0] }} />Returned <b>{totalReturned}</b></li>
      </ul>

      <div className="libd-bars" role="img"
        aria-label={`Issues and returns per week. ${weeks.map((w) => `Week of ${weekLabel(w.week)}: ${w.issued} issued, ${w.returned} returned`).join('. ')}`}>
        {weeks.map((w) => (
          <div key={w.week} className="libd-bars__week">
            <div className="libd-bars__pair">
              <span className="libd-bars__bar" style={{ height: `${(w.issued / peak) * 100}%`, background: VIZ.accent }}
                title={`Week of ${weekLabel(w.week)}: ${w.issued} issued`}>
                {w.issued ? <b>{w.issued}</b> : null}
              </span>
              <span className="libd-bars__bar" style={{ height: `${(w.returned / peak) * 100}%`, background: VIZ.bands[0] }}
                title={`Week of ${weekLabel(w.week)}: ${w.returned} returned`}>
                {w.returned ? <b>{w.returned}</b> : null}
              </span>
            </div>
            <span className="libd-bars__x">{weekLabel(w.week)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Collection ───────────────────────────────────────────────────────────────

const TINTS = ['#4f46e5', '#0284c7', '#059669', '#d97706', '#7c3aed', '#db2777', '#0d9488', '#ea580c'];
const REST = '#94a3b8';

/**
 * A category's colour, fixed by its **name** rather than its rank.
 *
 * The panel lists categories largest-first, and that order changes the moment a
 * book is catalogued. Keying the hue to the alphabetical position instead means
 * Fiction stays the same colour when Science overtakes it — colour follows the
 * thing, never its place in a league table. Past the eighth it goes neutral
 * rather than starting the order again.
 */
const tintFor = (name, names) => {
  const i = [...names].sort((a, b) => a.localeCompare(b)).indexOf(name);
  return i >= 0 && i < TINTS.length ? TINTS[i] : REST;
};

/**
 * What the collection is made of.
 *
 * Every book carries exactly one category, so these do sum to the title count —
 * which is what makes a ring honest here. Each segment is named and counted in
 * the legend beside it, so the colour is a second channel and never the only
 * one, and 2px of the surface separates neighbouring arcs.
 */
export const CategoryDonut = ({ categories, total, to }) => {
  if (!categories?.length) {
    return <NoData icon="book" title="No books catalogued yet"
      hint="Categories appear as soon as the first title is added." />;
  }

  const names = categories.map((c) => c.category);
  const R = 52;
  const C = 2 * Math.PI * R;
  const GAP = categories.length > 1 ? 3 : 0;   // surface showing through, not a stroke

  let offset = 0;
  const arcs = categories.map((c) => {
    const len = Math.max(0, (c.count / (total || 1)) * C - GAP);
    const arc = { ...c, len, offset, color: tintFor(c.category, names) };
    offset += (c.count / (total || 1)) * C;
    return arc;
  });

  return (
    <div className="libd-donut">
      <div className="libd-donut__ring">
        <svg viewBox="0 0 130 130" role="img"
          aria-label={`${total} titles: ${categories.map((c) => `${c.category} ${c.count}`).join(', ')}`}>
          <circle cx="65" cy="65" r={R} fill="none" stroke="var(--bg)" strokeWidth="20" />
          {arcs.map((a) => (
            <circle key={a.category} cx="65" cy="65" r={R} fill="none"
              stroke={a.color} strokeWidth="20" strokeLinecap="butt"
              strokeDasharray={`${a.len} ${C - a.len}`} strokeDashoffset={-a.offset}
              transform="rotate(-90 65 65)">
              <title>{`${a.category}: ${a.count}`}</title>
            </circle>
          ))}
        </svg>
        <div className="libd-donut__mid">
          <b>{total ?? 0}</b>
          <small>{total === 1 ? 'Title' : 'Titles'}</small>
        </div>
      </div>

      <ul className="libd-donut__key">
        {categories.slice(0, 6).map((c) => (
          <li key={c.category}>
            <i style={{ background: tintFor(c.category, names) }} />
            <Link to={`${to}?category=${encodeURIComponent(c.category)}`}>{c.category}</Link>
            <b>{c.count}</b>
          </li>
        ))}
        {categories.length > 6 && (
          <li className="libd-donut__more">
            <i style={{ background: REST }} />
            <span>{categories.length - 6} more</span>
            <b>{categories.slice(6).reduce((n, c) => n + c.count, 0)}</b>
          </li>
        )}
      </ul>
    </div>
  );
};

// ── Quick actions ────────────────────────────────────────────────────────────

/** One line per action — the counter's five jobs, each a real destination. */
export const Actions = ({ items }) => (
  <ul className="libd-acts">
    {items.map((a) => (
      <li key={a.label}>
        <Link to={a.to}>
          <span className={`libd-acts__icon tint-${a.tone}`}><Icon name={a.icon} size={16} /></span>
          <span className="libd-acts__text">
            <b>{a.label}</b>
            {a.sub ? <small>{a.sub}</small> : null}
          </span>
          <Icon name="chevronRight" size={15} />
        </Link>
      </li>
    ))}
  </ul>
);

// ── Lists ────────────────────────────────────────────────────────────────────

const ISSUE_STATUS = { issued: 'info', returned: 'success', overdue: 'danger', lost: 'muted' };

/** A book's spine — the catalogue holds no cover art, so this stands in for it. */
export const Spine = ({ title }) => (
  <span className="libd-spine" aria-hidden>{(title || '?').charAt(0).toUpperCase()}</span>
);

/** Who has it. Staff have no class, and saying so beats an empty cell. */
export const Borrower = ({ person }) => (
  <span className="libd-who">
    <b>{person?.name || '—'}</b>
    <small>{person?.className || (person?.role === 'teacher' ? 'Staff' : 'No class')}</small>
  </span>
);

export const RecentTable = ({ rows }) => {
  if (!rows?.length) {
    return <NoData icon="repeat" title="Nothing issued yet"
      hint="The last ten trips across the counter show up here." />;
  }
  return (
    <div className="table-wrap">
      <table className="table libd-table">
        <thead>
          <tr><th>Book</th><th>Borrower</th><th>Issued</th><th>Due</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} data-focus-id={r._id}>
              <td>
                <span className="libd-book">
                  <Spine title={r.book?.title} />
                  <span>
                    <b>{r.book?.title || '—'}</b>
                    {r.book?.authors?.length ? <small>{r.book.authors.join(', ')}</small> : null}
                  </span>
                </span>
              </td>
              <td><Borrower person={r.issuedTo} /></td>
              <td className="libd-nowrap">{fmtDay(r.issueDate)}</td>
              <td className="libd-nowrap">{fmtDay(r.dueDate)}</td>
              <td><Badge variant={ISSUE_STATUS[r.status] || 'muted'}>{r.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** The books that are late, worst first — the one list worth acting on today. */
export const OverdueList = ({ rows }) => {
  if (!rows?.length) {
    return <NoData icon="checkCircle" title="Nothing is overdue"
      hint="Every book that is out is still within its loan period." />;
  }
  return (
    <ul className="libd-overdue">
      {rows.map((r) => (
        <li key={r._id}>
          <Spine title={r.book?.title} />
          <div>
            <b>{r.book?.title || '—'}</b>
            <small>{r.issuedTo?.name}{r.issuedTo?.className ? ` · ${r.issuedTo.className}` : ''}</small>
          </div>
          <span className="libd-late">
            <b>{r.daysOverdue}</b>
            <small>{r.daysOverdue === 1 ? 'day late' : 'days late'}</small>
          </span>
        </li>
      ))}
    </ul>
  );
};

// ── Closing card ─────────────────────────────────────────────────────────────

export const QUOTES = [
  { text: 'Books open new worlds.', by: 'Unknown' },
  { text: 'A book is a dream that you hold in your hands.', by: 'Neil Gaiman' },
  { text: 'A room without books is like a body without a soul.', by: 'Cicero' },
  { text: 'There is no friend as loyal as a book.', by: 'Ernest Hemingway' },
];

/** Picked by the day so the page does not reshuffle itself on every render. */
export const quoteOfTheDay = (offset = 0) =>
  QUOTES[(Math.floor(Date.now() / 86400000) + offset) % QUOTES.length];

export const InspirationCard = ({ quote }) => (
  <section className="card libd-inspire">
    <span className="libd-inspire__icon tint-amber"><Icon name="sparkle" size={17} /></span>
    <div>
      <h2>Reading inspiration</h2>
      <p>“{quote.text}”</p>
      <cite>— {quote.by}</cite>
    </div>
  </section>
);
