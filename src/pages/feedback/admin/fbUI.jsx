/**
 * The Teacher Feedback design system, built to the shared mockups.
 *
 * Every screen in this module is the same five bands in the same order:
 *
 *   breadcrumb → hero card → tinted stat row → panels / filter card + table
 *   → closing note
 *
 * so the components below are named after those bands rather than after the
 * page that happens to use them. Nothing here is general enough for
 * components/ui — a stat card that carries a "↑ 14%" delta and a rating cell
 * that knows about a privacy floor belong to this module.
 *
 * Charts are drawn here rather than borrowed from pages/analytics/viz.jsx: the
 * mockups call for an area-filled trend with point labels, per-category bar
 * colours and a donut with a counted centre, none of which viz.jsx does. The
 * colour rules it encodes are kept — see PALETTE below.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, BarChart, Cell, LabelList, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  // Aliased: this file exports its own <Bar>, the percentage-with-a-bar cell.
  Bar as RBar,
} from 'recharts';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';

export { fmtDate, daysLeft, RATING_LABELS } from '../shared/kit';
import { RATING_LABELS } from '../shared/kit';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';

/**
 * The module's colour set.
 *
 * `series` is a categorical ramp used ONLY where each bar is a different named
 * thing (a category, a department) and the name is printed beside it — colour
 * is decoration there, never the channel carrying the value.
 *
 * `rating` is a status scale: it means "how good", so it is ordered and is
 * never reused for series. Every rating on screen ships its number too.
 */
export const PALETTE = {
  ink: '#1e293b',
  muted: '#64748b',
  grid: '#eef2f7',
  accent: '#6366f1',
  green: '#22c55e',
  series: ['#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#2dd4bf', '#a78bfa', '#fb923c'],
  rating: ['#ef4444', '#f97316', '#facc15', '#4ade80', '#22c55e'],
};

export const ratingColor = (v) => (v == null ? PALETTE.muted
  : v >= 4 ? '#16a34a' : v >= 3 ? '#d97706' : '#dc2626');

/** A rating on a 0–5 scale always shows one decimal; a percentage never does. */
export const fmtVal = (v, max) => (typeof v === 'number' && max <= 5 ? v.toFixed(1) : v);

export const TONES = ['purple', 'green', 'blue', 'amber', 'pink', 'teal', 'indigo', 'orange'];
export const toneAt = (i) => TONES[i % TONES.length];

// ── Breadcrumb ───────────────────────────────────────────────────────────────

// The trail up to the module comes from the navigation tree now, so `trail`
// and `home` are only still accepted to save changing thirty call sites; the
// module step in them is dropped as a duplicate by the layout's crumb.
// eslint-disable-next-line no-unused-vars
export const Crumbs = ({ trail = [], here, home }) => {
  usePageCrumbs([...trail, { label: here }]);
  return null;
};

// ── Hero ─────────────────────────────────────────────────────────────────────

/**
 * The page's own header: a tinted mark, what the page is, what it is for, and
 * the one or two things you came here to do.
 */
export const Hero = ({ icon, tone = 'purple', title, subtitle, children }) => (
  <header className="fbhero">
    <span className={`fbhero__mark tint-${tone}`}><Icon name={icon} size={26} /></span>
    <div className="fbhero__text">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="fbhero__acts">{children}</div> : null}
  </header>
);

// ── Stat row ─────────────────────────────────────────────────────────────────

export const Stats = ({ children, cols }) => (
  <div className={`fbstats${cols ? ` fbstats--${cols}` : ''}`}>{children}</div>
);

/**
 * One tinted figure.
 *
 * `delta` is movement against the previous period and always carries its sign
 * and its unit — "↑ 14%" not a green arrow. `onClick` makes the tile the
 * fastest way to narrow the list beneath it; `on` marks the one in force.
 */
export const Stat = ({ icon, tone = 'purple', value, label, caption, delta, deltaDir = 'up', onClick, on }) => {
  const body = (
    <>
      <span className={`fbstat__icon tint-${tone}`}><Icon name={icon} size={26} /></span>
      <span className="fbstat__body">
        <span className="fbstat__row">
          <span className="fbstat__value">{value}</span>
          {delta != null && (
            <span className={`fbstat__delta is-${deltaDir}`}>
              <Icon name={deltaDir === 'down' ? 'arrowDown' : 'arrowUp'} size={11} />{delta}
            </span>
          )}
        </span>
        <span className="fbstat__label">{label}</span>
        {caption ? <span className="fbstat__cap">{caption}</span> : null}
      </span>
    </>
  );
  const cls = `fbstat fbstat--${tone}${on ? ' is-on' : ''}`;
  return onClick
    ? <button type="button" className={cls} onClick={onClick} aria-pressed={!!on}>{body}</button>
    : <div className={cls}>{body}</div>;
};

/**
 * The comparison variant: the label leads, the figure follows, and the delta
 * sits under it naming what it is measured against. Used where every tile on
 * the row is "this period vs last".
 */
export const StatVs = ({ icon, tone = 'purple', label, value, unit, delta, deltaDir = 'up', vs }) => (
  <div className={`fbstat fbstat--${tone} fbstat--vs`}>
    <span className={`fbstat__icon tint-${tone}`}><Icon name={icon} size={22} /></span>
    <span className="fbstat__body">
      <span className="fbstat__label">{label}</span>
      <span className="fbstat__value">
        {value}{unit ? <em>{unit}</em> : null}
      </span>
      {(delta != null || vs) && (
        <span className="fbstat__vs">
          {delta != null && (
            <span className={`fbstat__delta is-${deltaDir}`}>
              <Icon name={deltaDir === 'down' ? 'arrowDown' : 'arrowUp'} size={11} />{delta}
            </span>
          )}
          {vs ? <small>{vs}</small> : null}
        </span>
      )}
    </span>
  </div>
);

// ── Panels ───────────────────────────────────────────────────────────────────

export const Row = ({ children, split = '2' }) => (
  <div className={`fbgrid fbgrid--${split}`}>{children}</div>
);

export const Panel = ({ icon, tone = 'purple', title, subtitle, right, children, className = '' }) => (
  <section className={`fbpanel ${className}`.trim()}>
    <header className="fbpanel__head">
      {icon ? <span className={`fbpanel__icon tint-${tone}`}><Icon name={icon} size={17} /></span> : null}
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {right ? <div className="fbpanel__right">{right}</div> : null}
    </header>
    <div className="fbpanel__body">{children}</div>
  </section>
);

export const PanelLink = ({ to, children = 'View all' }) => (
  <Link to={to} className="fbpanel__link">{children}</Link>
);

export const Blank = ({ children = 'No data yet' }) => <p className="fbblank">{children}</p>;
export const Muted = ({ children }) => <p className="fbmuted">{children}</p>;

// ── Filter bar ───────────────────────────────────────────────────────────────

export const Toolbar = ({ children }) => <div className="fbtools">{children}</div>;

export const Search = ({ value, onChange, placeholder, wide }) => (
  <div className={`fbsearch${wide ? ' fbsearch--wide' : ''}`}>
    <Icon name="search" size={16} />
    <input value={value} placeholder={placeholder} aria-label={placeholder}
      onChange={(e) => onChange(e.target.value)} />
    {value ? (
      <button type="button" onClick={() => onChange('')} aria-label="Clear search">
        <Icon name="close" size={14} />
      </button>
    ) : null}
  </div>
);

/** A dropdown that shows it is doing something when it is off its default. */
export const Pick = ({ value, onChange, options, all, label, width, dflt = '' }) => (
  <select className={`fbsel${value !== dflt ? ' is-on' : ''}`} value={value} aria-label={label}
    style={width ? { minWidth: width } : undefined}
    onChange={(e) => onChange(e.target.value)}>
    {all ? <option value="">{all}</option> : null}
    {options.map((o) => {
      const v = typeof o === 'string' ? o : o.value;
      const t = typeof o === 'string' ? o : o.label;
      return <option key={v} value={v}>{t}</option>;
    })}
  </select>
);

/** "Sort by" and its dropdown, kept together so the label never wraps alone. */
export const SortBy = ({ value, onChange, options, dflt }) => (
  <span className="fbsort">
    <label>Sort by</label>
    <Pick value={value} onChange={onChange} options={options} label="Sort by" dflt={dflt} />
  </span>
);

export const Spacer = () => <span className="fbtools__gap" />;

/** Table / Card, or any other pair of ways to look at the same rows. */
export const ViewToggle = ({ value, onChange, options }) => (
  <div className="fbvt" role="group" aria-label="Layout">
    {options.map((o) => (
      <button key={o.value} type="button" aria-pressed={value === o.value}
        className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
        <Icon name={o.icon} size={15} />{o.label}
      </button>
    ))}
  </div>
);

// ── Selection ────────────────────────────────────────────────────────────────

export function useSelection(rows, resetKey) {
  const [ids, setIds] = useState([]);
  useEffect(() => { setIds([]); }, [resetKey]);
  const visible = rows.map((r) => r._id);
  const picked = ids.filter((id) => visible.includes(id));
  const allOn = picked.length > 0 && picked.length === visible.length;
  return {
    ids: picked,
    has: (id) => picked.includes(id),
    toggle: (id) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    toggleAll: () => setIds(allOn ? [] : visible),
    allOn,
    some: picked.length > 0 && !allOn,
    clear: () => setIds([]),
  };
}

export const SelectionBar = ({ count, noun, onClear, children }) => (count ? (
  <div className="fbselbar">
    <Icon name="checkCircle" size={16} />
    <b>{count} {count === 1 ? noun : `${noun}s`} selected</b>
    <span className="fbtools__gap" />
    {children}
    <button type="button" className="fbtb" onClick={onClear}>Clear</button>
  </div>
) : null);

// ── Table ────────────────────────────────────────────────────────────────────

/**
 * The list.
 *
 * `columns` are `{ key, label, render, className }`. The row number is drawn
 * here because every table in the mockups carries one, and the tick column
 * appears only when a `selection` is handed in.
 */
export function Table({
  columns, rows, loading, selection, startIndex = 0,
  empty, expandedId, renderExpanded, numbered = true,
}) {
  if (loading) return <div className="fbloading"><Spinner /></div>;
  if (!rows.length) return empty || <Blank />;
  return (
    <div className="fbtable__wrap">
      <table className="fbtable">
        <thead>
          <tr>
            {selection && (
              <th className="fbtable__tick">
                <input type="checkbox" checked={selection.allOn} onChange={selection.toggleAll}
                  ref={(el) => { if (el) el.indeterminate = selection.some; }}
                  aria-label="Select every row on this page" />
              </th>
            )}
            {numbered ? <th className="fbtable__num">#</th> : null}
            {columns.map((c) => <th key={c.key} className={c.className}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const open = renderExpanded && expandedId != null && expandedId === r._id;
            return (
              <React.Fragment key={r._id ?? i}>
                <tr data-focus-id={r._id} className={open ? 'is-open' : undefined}>
                  {selection && (
                    <td className="fbtable__tick">
                      <input type="checkbox" checked={selection.has(r._id)}
                        onChange={() => selection.toggle(r._id)} aria-label="Select this row" />
                    </td>
                  )}
                  {numbered ? <td className="fbtable__num">{startIndex + i + 1}</td> : null}
                  {columns.map((c) => <td key={c.key} className={c.className}>{c.render(r)}</td>)}
                </tr>
                {open && (
                  <tr className="fbtable__exp">
                    <td colSpan={columns.length + (numbered ? 1 : 0) + (selection ? 1 : 0)}>{renderExpanded(r)}</td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Showing 1 to 10 of 18 questions", and the pager. */
export const Foot = ({ page, pages, total, limit, count, noun, plural, onPage }) => {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = (page - 1) * limit + count;
  const many = plural || `${noun}s`;
  const nums = [];
  for (let n = 1; n <= pages; n += 1) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) nums.push(n);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <div className="fbfoot">
      <span>
        {total === 0 ? `No ${many} to show`
          : `Showing ${from} to ${to} of ${total} ${total === 1 ? noun : many}`}
      </span>
      <div className="fbpager">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <Icon name="chevronLeft" size={15} />
        </button>
        {nums.map((n, i) => (n === '…'
          // eslint-disable-next-line
          ? <span key={`gap${i}`} className="fbpager__gap">…</span>
          : (
            <button key={n} type="button" className={n === page ? 'is-on' : ''}
              onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}>
              {n}
            </button>
          )))}
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
    </div>
  );
};

export const EmptyState = ({ icon = '📭', title, message, action }) => (
  <div className="fbempty">
    <span aria-hidden>{icon}</span>
    <h3>{title}</h3>
    {message ? <p>{message}</p> : null}
    {action}
  </div>
);

// ── Cells ────────────────────────────────────────────────────────────────────

// Uploads are served from the backend root while VITE_API_URL points at /api.
const uploadBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
const fileUrl = (path) => (!path ? '' : /^https?:/.test(path) ? path : `${uploadBase}${path}`);

export const Avatar = ({ name, tone = 'purple', size = 36, src }) => {
  const [broken, setBroken] = useState(false);
  const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase();
  if (src && !broken) {
    return (
      <img className="fbav fbav--img" src={fileUrl(src)} alt="" loading="lazy"
        style={{ width: size, height: size }} onError={() => setBroken(true)} />
    );
  }
  return (
    <span className={`fbav tint-${tone}`} style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden>
      {initials || '?'}
    </span>
  );
};

/** Avatar, name, and the quieter line under it. */
export const Who = ({ name, sub, to, tone = 'purple', size, src }) => {
  const body = (
    <>
      <Avatar name={name} tone={tone} size={size} src={src} />
      <span className="fbwho__id">
        <b>{name}</b>
        {sub ? <small title={sub}>{sub}</small> : null}
      </span>
    </>
  );
  return to
    ? <Link to={to} className="fbwho fbwho--link">{body}</Link>
    : <span className="fbwho">{body}</span>;
};

/** A bold line with a quieter one under it — no avatar. */
export const Stack = ({ main, sub, to }) => (
  <div className="fbstack">
    {to ? <Link to={to}><b>{main}</b></Link> : <b>{main}</b>}
    {sub ? <small>{sub}</small> : null}
  </div>
);

export const Dash = () => <span className="fbdash">—</span>;

export const Badge = ({ tone = 'slate', children }) => (
  <span className={`fbbadge tint-${tone}`}>{children}</span>
);

/** A status with its dot — the word always carries the meaning. */
export const Dot = ({ tone = 'green', children }) => (
  <span className={`fbdot fbdot--${tone}`}><i aria-hidden />{children}</span>
);

/** A chip with a coloured mark, for a category or a department. */
export const Tag = ({ tone = 'purple', icon, children }) => (
  <span className={`fbtag tint-${tone}`}>
    {icon ? <Icon name={icon} size={13} /> : null}
    {children}
  </span>
);

/**
 * A rating: star, number, and the word under it.
 *
 * Below the privacy floor the whole cell is replaced rather than dimmed — a
 * withheld figure that still shows a colour leaks what the floor exists to hide.
 */
export const Rating = ({ value, sub, locked, responses, minimum, big }) => {
  if (locked) return <Locked responses={responses} minimum={minimum} />;
  if (value == null) return <div className="fbrating is-none"><Dash />{sub ? <small>{sub}</small> : null}</div>;
  return (
    <div className={`fbrating${big ? ' fbrating--big' : ''}`}>
      <span>
        <i className="fbrating__star" aria-hidden>★</i>
        <b>{Number(value).toFixed(1)}</b>
        {big ? <em>/ 5.0</em> : null}
      </span>
      {sub === undefined
        ? null
        : <small>{sub}</small>}
    </div>
  );
};

export const Locked = ({ responses, minimum }) => (
  <span className="fblocked" title={responses === 0
    ? 'Nobody has answered yet.'
    : `${responses} of ${minimum} responses needed before a rating can be shown.`}>
    <Icon name="key" size={12} />
    {responses === 0 ? 'No responses' : `${responses} / ${minimum}`}
  </span>
);

export const Stars = ({ value = 0, size = 15 }) => (
  <span className="fbstars" style={{ fontSize: size }} aria-label={`${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((n) => <span key={n} className={value >= n ? 'is-on' : ''}>★</span>)}
  </span>
);

/** A percentage with its bar. The number is always beside it. */
export const Bar = ({ value, tone, width = 74 }) => {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = tone || '#3b82f6';
  return (
    <span className="fbbar">
      <span className="fbbar__track" style={{ width }} aria-hidden>
        <span style={{ width: `${v}%`, background: color }} />
      </span>
      <b>{value ?? 0}%</b>
    </span>
  );
};

/** Movement against the previous campaign — never a bare arrow. */
export const Trend = ({ value }) => {
  if (value == null) return <Dash />;
  const dir = value > 0.05 ? 'up' : value < -0.05 ? 'down' : 'flat';
  return (
    <span className={`fbtrendc is-${dir}`}>
      <Icon name={dir === 'up' ? 'trending' : dir === 'down' ? 'arrowDown' : 'arrowRight'} size={14} />
      {dir === 'flat' ? '0.0' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`}
    </span>
  );
};

// ── Row actions ──────────────────────────────────────────────────────────────

export const Acts = ({ children }) => <div className="fbacts">{children}</div>;

export const IconBtn = ({ icon, label, onClick, to, variant = '', disabled }) => {
  const cls = `fbib${variant ? ` fbib--${variant}` : ''}`;
  const body = <Icon name={icon} size={15} />;
  return to
    ? <Link to={to} className={cls} title={label} aria-label={label}>{body}</Link>
    : (
      <button type="button" className={cls} title={label} aria-label={label}
        onClick={onClick} disabled={disabled}>{body}</button>
    );
};

export const TextBtn = ({ icon, children, onClick, to, variant = '' }) => {
  const cls = `fbtb${variant ? ` fbtb--${variant}` : ''}`;
  const body = <>{icon ? <Icon name={icon} size={14} /> : null}{children}</>;
  return to
    ? <Link to={to} className={cls}>{body}</Link>
    : <button type="button" className={cls} onClick={onClick}>{body}</button>;
};

/**
 * The overflow menu.
 *
 * Positioned from the button's own rect and rendered at the end of the page
 * rather than in the cell: inside the table it would be clipped by the
 * horizontal scroll box, and the last row's menu would open below the fold.
 */
export function Menu({ children, label = 'More actions', bare }) {
  const btn = useRef(null);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!rect) return undefined;
    const close = () => setRect(null);
    const away = (e) => {
      if (!e.target.closest?.('[data-fbmenu]') && !btn.current?.contains(e.target)) setRect(null);
    };
    const esc = (e) => { if (e.key === 'Escape') setRect(null); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [rect]);

  const W = 196;
  const style = rect && (() => {
    const below = window.innerHeight - rect.bottom;
    const up = below < 210 && rect.top > below;
    return {
      left: Math.max(8, Math.min(rect.right - W, window.innerWidth - W - 8)),
      ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    };
  })();

  return (
    <>
      <button ref={btn} type="button" className={`fbib${bare ? ' fbib--bare' : ''}${rect ? ' is-on' : ''}`} title={label}
        aria-label={label} aria-expanded={!!rect}
        onClick={() => setRect(rect ? null : btn.current.getBoundingClientRect())}>
        <Icon name="dots" size={15} />
      </button>
      {rect && (
        <div className="fbmenu" data-fbmenu style={style} onClick={() => setRect(null)}>
          {children}
        </div>
      )}
    </>
  );
}

export const MenuItem = ({ icon, children, onClick, to, danger }) => {
  const cls = `fbmenu__i${danger ? ' is-danger' : ''}`;
  const body = <><Icon name={icon} size={15} />{children}</>;
  return to ? <Link to={to} className={cls}>{body}</Link>
    : <button type="button" className={cls} onClick={onClick}>{body}</button>;
};

export const MenuSep = () => <span className="fbmenu__sep" />;

// ── Closing pieces ───────────────────────────────────────────────────────────

/** The pair of cards under a table — a tip, and the next place to go. */
export const TipCard = ({ icon = 'info', tone = 'amber', title, children, action }) => (
  <section className="fbtip">
    <span className={`fbtip__icon tint-${tone}`}><Icon name={icon} size={20} /></span>
    <div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
    {action ? <div className="fbtip__act">{action}</div> : null}
  </section>
);

/** A full-width note, for the sentence a screen must not be read without. */
export const NoteBar = ({ icon = 'info', tone = 'blue', children, action, title }) => (
  <section className={`fbnote fbnote--${tone}`}>
    <span className="fbnote__icon"><Icon name={icon} size={17} /></span>
    <p>{title ? <b className="fbnote__title">{title}</b> : null}{children}</p>
    {action ? <div className="fbnote__act">{action}</div> : null}
  </section>
);

/** A bulleted list of findings, each with its own tinted mark. */
export const Insights = ({ items }) => (
  <ul className="fbins">
    {items.map((it, i) => (
      // eslint-disable-next-line
      <li key={i}>
        <span className={`fbins__dot tint-${it.tone || 'blue'}`}><Icon name={it.icon || 'info'} size={14} /></span>
        <span>{it.text}</span>
      </li>
    ))}
  </ul>
);

// ── Toggle ───────────────────────────────────────────────────────────────────

export const Toggle = ({ label, hint, value, onChange, disabled }) => (
  <label className={`fbtoggle${disabled ? ' is-off' : ''}`}>
    <input type="checkbox" checked={!!value} disabled={disabled}
      onChange={(e) => onChange(e.target.checked)} />
    <span className="fbtoggle__sw" aria-hidden><i /></span>
    <span className="fbtoggle__t">
      <b>{label}</b>
      {hint ? <small>{hint}</small> : null}
    </span>
  </label>
);

export const Field = ({ label, hint, children }) => (
  <div className="fbfield">
    <label>{label}</label>
    {children}
    {hint ? <small>{hint}</small> : null}
  </div>
);

export const NumberField = ({ label, hint, value, onChange, min = 0, disabled }) => (
  <Field label={label} hint={hint}>
    <input className="fbinput" type="number" min={min} value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)} aria-label={label} />
  </Field>
);

// ══ CHARTS ═══════════════════════════════════════════════════════════════════

const ChartTip = ({ active, payload, label, unit = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="fbtt">
      <b>{label}</b>
      {payload.map((p) => (
        <span key={p.dataKey}>
          <i style={{ background: p.color || p.fill }} aria-hidden />
          {p.value}{unit}
        </span>
      ))}
    </div>
  );
};

/**
 * The rating trend: an area-filled line on a fixed 1–5 axis.
 *
 * The axis is fixed, not fitted to the data — a trend drawn 3.9 to 4.3 on a
 * fitted axis reads as a collapse and a surge that never happened.
 */
export const TrendArea = ({ data, xKey = 'label', yKey = 'value', domain = [1, 5], unit = '', height = 230, color = PALETTE.accent, labels }) => {
  if (!data?.length) return <Blank />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: labels ? 22 : 8, right: 16, left: unit ? -2 : -14, bottom: 0 }}>
        <defs>
          <linearGradient id={`fbg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.24} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={PALETTE.grid} vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} interval={0} padding={{ left: 22, right: 22 }}
          tick={{ fontSize: 11, fill: PALETTE.muted }} />
        <YAxis domain={domain} tickLine={false} axisLine={false} width={unit ? 46 : 36}
          ticks={domain[1] === 5 ? [1, 2, 3, 4, 5] : domain[1] === 100 ? [0, 25, 50, 75, 100] : undefined}
          tick={{ fontSize: 11, fill: PALETTE.muted }}
          tickFormatter={(v) => `${v}${unit}`} />
        <Tooltip content={<ChartTip unit={unit} />} cursor={{ stroke: PALETTE.grid }} />
        <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2.4}
          fill={`url(#fbg-${color.replace('#', '')})`} isAnimationActive={false}
          dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 2 }}>
          {labels && (
            <LabelList dataKey={yKey} position="top" offset={10}
              formatter={(v) => `${fmtVal(v, domain[1])}${unit}`}
              style={{ fontSize: 11, fontWeight: 600, fill: PALETTE.ink }} />
          )}
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  );
};

/**
 * Horizontal bars for named things.
 *
 * Bars are proportional to `max` — a fixed 5 for ratings, 100 for percentages —
 * never to the largest value present, so the same category reads the same way
 * on every screen. The label sits left and the number right of every bar.
 */
export const CatBars = ({ data, max = 5, unit = '', colored, color = PALETTE.accent, labelWidth = 150 }) => {
  if (!data?.length) return <Blank />;
  return (
    <ul className="fbcatbars" style={{ '--lw': `${labelWidth}px` }}>
      {data.map((d, i) => (
        <li key={d.label}>
          <span className="fbcatbars__l" title={d.label}>{d.label}</span>
          <span className="fbcatbars__t" aria-hidden>
            <span style={{
              width: `${Math.max(0, Math.min(100, ((d.value ?? 0) / max) * 100))}%`,
              background: colored ? PALETTE.series[i % PALETTE.series.length] : color,
            }} />
          </span>
          <b>{d.value == null ? '—' : `${fmtVal(d.value, max)}${unit}`}</b>
        </li>
      ))}
    </ul>
  );
};

/** Vertical columns with the value written on top of each. */
export const Columns = ({ data, max = 5, unit = '', height = 240, colored = true }) => {
  if (!data?.length) return <Blank />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 22, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid stroke={PALETTE.grid} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false}
          tick={{ fontSize: 11, fill: PALETTE.muted }} interval={0} />
        <YAxis domain={[0, max]} tickLine={false} axisLine={false} width={36}
          ticks={max === 5 ? [0, 1, 2, 3, 4, 5] : undefined}
          tick={{ fontSize: 11, fill: PALETTE.muted }} />
        <Tooltip content={<ChartTip unit={unit} />} cursor={{ fill: 'rgba(99,102,241,.06)' }} />
        <RBar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={d.label} fill={colored ? PALETTE.series[i % PALETTE.series.length] : PALETTE.accent} />
          ))}
          <LabelList dataKey="value" position="top" offset={7}
            formatter={(v) => `${fmtVal(v, max)}${unit}`}
            style={{ fontSize: 11.5, fontWeight: 700, fill: PALETTE.ink }} />
        </RBar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/**
 * A donut with its total counted in the middle and a legend that spells out
 * both the share and the count — the ring is the picture, the legend is the
 * data, and neither is asked to do the other's job.
 */
export const Donut = ({ data, total, centerLabel, height = 220 }) => {
  const sum = total ?? data.reduce((n, d) => n + (d.value || 0), 0);
  if (!sum) return <Blank />;
  return (
    <div className="fbdonut">
      <div className="fbdonut__ring" style={{ height }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="94%"
              startAngle={90} endAngle={-270} paddingAngle={1.5} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.label} fill={d.color} stroke="#fff" strokeWidth={2} />)}
            </Pie>
            <Tooltip content={<ChartTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="fbdonut__mid">
          <strong>{sum}</strong>
          <small>{centerLabel}</small>
        </div>
      </div>
      <ul className="fbdonut__key">
        {data.map((d) => (
          <li key={d.label}>
            <i style={{ background: d.color }} aria-hidden />
            <span>{d.label}</span>
            <b>{Math.round(((d.value || 0) / sum) * 100)}%</b>
            <em>({d.value})</em>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** The five rating bands and how many teachers sit in each. */
export const RatingSpread = ({ counts, height = 200 }) => {
  const data = [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: counts[n] || 0 }));
  const most = Math.max(...data.map((d) => d.value));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid stroke={PALETTE.grid} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false}
          tick={{ fontSize: 11, fill: PALETTE.muted }} />
        <YAxis allowDecimals={false} domain={[0, Math.max(2, most)]} tickLine={false} axisLine={false}
          width={36} tick={{ fontSize: 11, fill: PALETTE.muted }} />
        <RBar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={52} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={d.label} fill={PALETTE.rating[i]} fillOpacity={d.value ? 1 : 0.25} />)}
          <LabelList dataKey="value" position="top" offset={6}
            style={{ fontSize: 11.5, fontWeight: 700, fill: PALETTE.ink }} />
        </RBar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export const ratingWord = (v) => (v == null ? '' : RATING_LABELS[Math.round(v)] || '');


// ══ MODAL ════════════════════════════════════════════════════════════════════

/**
 * The module's popup: a marked header, an optional step rail, the form, an
 * optional live side panel, and a footer that never scrolls away.
 *
 * Portalled to <body> for the same reason components/ui Modal is — rendered in
 * place it would measure against the scrolling main column. It does not close
 * on a click outside or on Escape: these are long forms, and a stray click must
 * not throw one away. Closing is the ✕ or Cancel.
 *
 * It does not lock the page's scroll either. The ui Modal's lock is a counter
 * private to that file; a second, separate counter here would restore the
 * wrong value when a confirm opens over a form. The overlay scrolls itself and
 * contains its own overscroll instead.
 */
export function FbModal({
  open, onClose, icon = 'plus', tone = 'purple', title, subtitle,
  width = 760, steps, step, onStep, aside, footer, children, busy,
}) {
  const bodyRef = useRef(null);
  // A new step starts at its top, not wherever the last one was scrolled to.
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [step]);
  if (!open) return null;

  return createPortal(
    <div className="fbm__overlay">
      <div className={`fbm${aside ? ' fbm--aside' : ''}${steps ? ' fbm--steps' : ''}`}
        style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="fbm__head">
          <span className={`fbm__mark tint-${tone}`}><Icon name={icon} size={22} /></span>
          <div className="fbm__title">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="fbm__close" onClick={onClose} aria-label="Close" disabled={busy}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="fbm__main">
          {steps ? (
            <nav className="fbm__steps" aria-label="Steps">
              {steps.map((st, i) => (
                <button key={st.key} type="button"
                  className={`fbm__step is-${st.state}${step === st.key ? ' is-current' : ''}`}
                  onClick={() => onStep?.(st.key)} disabled={!onStep}
                  aria-current={step === st.key ? 'step' : undefined}>
                  <span className="fbm__stepn">
                    {st.state === 'done' ? <Icon name="checkCircle" size={15} />
                      : st.state === 'locked' ? <Icon name="key" size={13} />
                      : st.state === 'error' ? '!' : i + 1}
                  </span>
                  <span className="fbm__stept">
                    <b>{st.label}</b>
                    {st.hint ? <small>{st.hint}</small> : null}
                  </span>
                </button>
              ))}
            </nav>
          ) : null}

          <div className="fbm__body" ref={bodyRef}>{children}</div>

          {aside ? <aside className="fbm__aside">{aside}</aside> : null}
        </div>

        {footer ? <footer className="fbm__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

/** A titled group inside a modal body. */
export const FormSection = ({ title, hint, right, children, locked }) => (
  <section className={`fbfs${locked ? ' is-locked' : ''}`}>
    {(title || right) && (
      <header>
        <div>
          {title ? <h3>{title}{locked ? <span className="fbfs__lock"><Icon name="key" size={11} /> Locked</span> : null}</h3> : null}
          {hint ? <p>{hint}</p> : null}
        </div>
        {right}
      </header>
    )}
    {children}
  </section>
);

/** A labelled input with its error and hint, in the module's field style. */
export const FormField = ({ label, required, error, hint, count, children }) => (
  <div className={`fbff${error ? ' has-error' : ''}`}>
    {label ? (
      <label>
        {label}{required ? <em> *</em> : null}
        {count ? <span className="fbff__count">{count}</span> : null}
      </label>
    ) : null}
    {children}
    {error ? <span className="fbff__err"><Icon name="alert" size={12} /> {error}</span> : null}
    {!error && hint ? <small>{hint}</small> : null}
  </div>
);

/** A big choice tile — a radio that says what the choice means. */
export const ChoiceTile = ({ icon, title, text, on, onClick, disabled, badge, tone = 'purple' }) => (
  <button type="button" className={`fbct${on ? ' is-on' : ''}`} onClick={onClick} disabled={disabled}
    aria-pressed={!!on}>
    {icon ? <span className={`fbct__icon tint-${on ? tone : 'slate'}`}><Icon name={icon} size={18} /></span> : null}
    <span className="fbct__text">
      <b>{title}{badge ? <em>{badge}</em> : null}</b>
      {text ? <small>{text}</small> : null}
    </span>
    <span className="fbct__radio" aria-hidden />
  </button>
);

/** − 5 + — a small number with its own buttons, clamped. */
export const Stepper = ({ value, onChange, min = 1, max = 999, disabled, suffix }) => {
  const n = Number(value) || 0;
  const set = (v) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <span className={`fbstep${disabled ? ' is-off' : ''}`}>
      <button type="button" onClick={() => set(n - 1)} disabled={disabled || n <= min} aria-label="Decrease">−</button>
      <input type="number" value={value} min={min} max={max} disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? '' : Math.max(min, Math.min(max, Number(e.target.value))))} />
      <button type="button" onClick={() => set(n + 1)} disabled={disabled || n >= max} aria-label="Increase">+</button>
      {suffix ? <small>{suffix}</small> : null}
    </span>
  );
};

/** Text-sized segmented control. */
export const Segmented = ({ value, onChange, options, disabled }) => (
  <span className="fbseg" role="radiogroup">
    {options.map((o) => (
      <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
        className={value === o.value ? 'is-on' : ''} disabled={disabled} onClick={() => onChange(o.value)}>
        {o.label}
      </button>
    ))}
  </span>
);
