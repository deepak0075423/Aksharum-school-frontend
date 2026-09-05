/**
 * The frame shared by the three account-management screens — Students,
 * Teachers and Admins.
 *
 * They are the same page with different columns: a header, four headcount
 * tiles, a card holding the filter bar and the table, and a pair of closing
 * panels. Everything that is genuinely the same lives here; everything that
 * knows what a student or a teacher *is* stays in the page.
 *
 * Kept beside the pages rather than in components/ui because none of it is
 * general — a stat tile that filters the list it sits above, a table that
 * carries a tick column, a drawer shaped like a personnel record. Same file
 * convention as dashboardParts.jsx and pages/directory/parts.jsx.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Button, Empty, Spinner, Pagination, PageSize } from '../../components/ui/index';

// Uploads are served from the backend root while VITE_API_URL points at /api.
const uploadBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
export const fileUrl = (path) => (!path ? '' : /^https?:/.test(path) ? path : `${uploadBase}${path}`);

// ── Small formatters ─────────────────────────────────────────────────────────

export const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime())
    ? ''
    : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** "3 days ago" — closer to how someone thinks about a last sign-in. */
export const ago = (iso) => {
  if (!iso) return '';
  const mins = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)   return `${days} day${days === 1 ? '' : 's'} ago`;
  return fmtDate(iso);
};

/** An em dash, so an empty cell reads as "nothing recorded" rather than a gap. */
export const Blank = ({ children = '—' }) => <span className="lnone">{children}</span>;

/** The value, or a dash when there isn't one. */
export const orBlank = (v) => (v === 0 || (v && String(v).trim()) ? v : <Blank />);

// ── Avatar ───────────────────────────────────────────────────────────────────

const TONE_BG = {
  indigo: '#4f46e5', green: '#059669', amber: '#d97706',
  purple: '#7c3aed', pink: '#db2777', teal: '#0d9488',
};

/** Initials, or the account photo when there is one. */
export function Avatar({ name, src, size = 38, tone = 'indigo' }) {
  const initials = String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const style = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.38, fontWeight: 700, color: '#fff',
    background: TONE_BG[tone] || TONE_BG.indigo, objectFit: 'cover', overflow: 'hidden',
  };
  if (src) {
    return (
      <img src={fileUrl(src)} alt="" style={style} loading="lazy" decoding="async"
        onError={(e) => { e.currentTarget.style.display = 'none'; }} />
    );
  }
  return <div style={style} aria-hidden>{initials || '?'}</div>;
}

// ── Page frame ───────────────────────────────────────────────────────────────

export const Crumbs = ({ here }) => (
  <div className="breadcrumb">
    <Link to="/admin/dashboard">Dashboard</Link>
    <span>›</span>
    <span>{here}</span>
  </div>
);

/**
 * The header: what the page is, a drawing, and a line about the work.
 * `Scene` is one of the spot illustrations from components/ui/icons.
 */
export const ListHero = ({ title, subtitle, quote, scene: Scene }) => (
  <header className="lhero">
    <div className="lhero__text">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    {Scene ? <div className="lhero__art"><Scene /></div> : <div />}
    <blockquote className="lhero__quote">
      <span aria-hidden>“</span>
      <p>{quote}</p>
    </blockquote>
  </header>
);

/**
 * One headcount tile.
 *
 * When `onClick` is given the tile is also the fastest way to narrow the list —
 * "Inactive Students: 4" is a question, and tapping it should answer it. `on`
 * marks the tile whose filter is currently in force.
 */
export const ListStat = ({ icon, tone, value, label, caption, onClick, on }) => {
  const body = (
    <>
      <span className={`lstat__icon tint-${tone}`}><Icon name={icon} size={24} /></span>
      <span className="lstat__body">
        <span className="lstat__value">{value ?? 0}</span>
        <span className="lstat__label">{label}</span>
        <span className="lstat__cap">{caption}</span>
      </span>
    </>
  );
  if (!onClick) return <div className="lstat">{body}</div>;
  return (
    <button type="button" className={`lstat${on ? ' lstat--on' : ''}`} onClick={onClick}
      aria-pressed={on}>{body}</button>
  );
};

export const ListStats = ({ children }) => <div className="lstats">{children}</div>;

// ── Filter bar ───────────────────────────────────────────────────────────────

export const SearchField = ({ value, onChange, placeholder }) => (
  <div className="lsearch">
    <Icon name="search" size={17} />
    <input className="form-control" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    {value && (
      <button type="button" className="lsearch__clear" onClick={() => onChange('')} aria-label="Clear search">
        <Icon name="close" size={15} />
      </button>
    )}
  </div>
);

/**
 * The toggle for the filter panel, showing how many filters are in force.
 *
 * Every filter lives in the panel rather than as a row of dropdowns beside the
 * search box: the toolbar then fits on one line at any width the app is used
 * at, and the count says what is hidden behind it.
 */
export const FiltersButton = ({ open, count, onClick }) => (
  <button type="button" className={`btn btn-secondary lfbtn${count ? ' lfbtn--on' : ''}`}
    onClick={onClick} aria-expanded={open}>
    <Icon name="filter" size={16} />
    Filters{count ? ` (${count})` : ''}
  </button>
);

export const FilterPanel = ({ children, onReset }) => (
  <div className="lmore">
    {children}
    <div className="lmore__reset">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onReset}>
        <Icon name="refresh" size={14} /> Reset filters
      </button>
    </div>
  </div>
);

/**
 * One labelled dropdown inside the panel.
 *
 * `all` is the "everything" option, so an unset filter still reads as a
 * sentence — "All Classes", not a blank box. `options` take either plain
 * strings or `{ value, label }`.
 */
export const FilterField = ({ label, value, onChange, all, options, defaultValue = '' }) => (
  <div>
    <label>{label}</label>
    {/* Marked as set only when it differs from its own default — a sort left on
        "Name (A–Z)" is not a filter, and must not look like one. */}
    <select className={`form-control${value !== defaultValue ? ' lfsel--on' : ''}`}
      value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {all ? <option value="">{all}</option> : null}
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const txt = typeof o === 'string' ? o : o.label;
        return <option key={val} value={val}>{txt}</option>;
      })}
    </select>
  </div>
);

/**
 * How many filters are actually doing something — the Filters button's badge.
 * Compares against the page's own "nothing selected" object, so a sort left on
 * its default does not read as a filter.
 */
export const activeFilterCount = (filters, defaults) =>
  Object.keys(defaults).filter((k) => filters[k] !== defaults[k]).length;

// ── Selection ────────────────────────────────────────────────────────────────

/**
 * Ticked rows and what may be done to them.
 *
 * Only ever appears with a selection, and always says the count — a bulk action
 * that does not tell you how many records it is about is a trap.
 */
export const SelectionBar = ({ count, noun, onClear, children }) => {
  if (!count) return null;
  return (
    <div className="lselbar">
      <Icon name="checkCircle" size={17} />
      {count} {count === 1 ? noun : `${noun}s`} selected
      <div className="lselbar__acts">
        {children}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
};

/**
 * Tracks which rows are ticked.
 *
 * Selection is dropped whenever the visible page changes — a bulk action must
 * only ever touch rows the admin can actually see, never a leftover from two
 * filters ago.
 */
export function useSelection(rows, resetKey) {
  const [ids, setIds] = useState([]);
  useEffect(() => { setIds([]); }, [resetKey]);

  const visible = rows.map((r) => r._id);
  const picked  = ids.filter((id) => visible.includes(id));
  const allOn   = picked.length > 0 && picked.length === visible.length;

  return {
    ids: picked,
    has:    (id) => picked.includes(id),
    toggle: (id) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    toggleAll: () => setIds(allOn ? [] : visible),
    allOn,
    some:  picked.length > 0 && !allOn,
    clear: () => setIds([]),
    rows:  rows.filter((r) => picked.includes(r._id)),
  };
}

// ── Table ────────────────────────────────────────────────────────────────────

/**
 * The list itself.
 *
 * `columns` are `{ key, label, render, className }`; the tick column, the row
 * number and the empty state are handled here because all three pages want
 * them identically. Row ids go on `data-focus-id` so a notification or the
 * header's global search can flag the row it was about — see
 * hooks/useFocusHighlight.js.
 */
export function ListTable({
  columns, rows, loading, selection, startIndex = 0,
  emptyIcon, emptyTitle, emptyMessage, emptyAction,
}) {
  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>;
  }
  if (!rows.length) {
    return <Empty icon={emptyIcon} title={emptyTitle} message={emptyMessage} action={emptyAction} />;
  }
  return (
    <div className="table-wrap">
      <table className="table ltable">
        <thead>
          <tr>
            {selection && (
              <th className="ltable__tick">
                <input type="checkbox" checked={selection.allOn}
                  ref={(el) => { if (el) el.indeterminate = selection.some; }}
                  onChange={selection.toggleAll} aria-label="Select all rows on this page" />
              </th>
            )}
            <th className="ltable__num">#</th>
            {columns.map((c) => <th key={c.key} className={c.className}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row._id} data-focus-id={row._id}
              className={selection?.has(row._id) ? 'is-picked' : undefined}>
              {selection && (
                <td className="ltable__tick">
                  <input type="checkbox" checked={selection.has(row._id)}
                    onChange={() => selection.toggle(row._id)}
                    aria-label={`Select ${row.name}`} />
                </td>
              )}
              <td className="ltable__num">{startIndex + i + 1}</td>
              {columns.map((c) => (
                <td key={c.key} className={c.className}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Name over a secondary line — the identity cell every list leads with. */
export const Who = ({ name, sub, photo, tone, to, badge }) => {
  const body = (
    <>
      <Avatar name={name} src={photo} tone={tone} />
      <div style={{ minWidth: 0 }}>
        <div className="lwho__name">{name}{badge}</div>
        {sub ? <div className="lwho__sub" title={sub}>{sub}</div> : null}
      </div>
    </>
  );
  return to
    ? <Link to={to} className="lwho lwho__link">{body}</Link>
    : <div className="lwho">{body}</div>;
};

/** A main value with a quieter one under it — designation over department. */
export const Stack = ({ main, sub }) => (
  main || sub
    ? (
      <>
        <div className="lstack__main">{main || <Blank />}</div>
        {sub ? <div className="lstack__sub">{sub}</div> : null}
      </>
    )
    : <Blank />
);

/**
 * A short list as chips.
 *
 * Past `max` the rest collapse into a +N, so one heavily loaded teacher cannot
 * stretch every row on the page. The full list is in the title attribute.
 */
export const Chips = ({ items = [], max = 2 }) => {
  if (!items.length) return <Blank />;
  const shown = items.slice(0, max);
  const rest  = items.length - shown.length;
  return (
    <div className="lchips" title={items.join(', ')}>
      {shown.map((s) => <span key={s} className="lchip">{s}</span>)}
      {rest > 0 && <span className="lchip lchip--more">+{rest}</span>}
    </div>
  );
};

// ── Row actions ──────────────────────────────────────────────────────────────

export const RowActions = ({ children }) => <div className="lacts">{children}</div>;

export const IconAction = ({ icon, label, onClick, variant = '', disabled }) => (
  <button type="button" className={`lact${variant ? ` lact--${variant}` : ''}`}
    onClick={onClick} title={label} aria-label={label} disabled={disabled}>
    <Icon name={icon} size={16} />
  </button>
);

/**
 * The overflow menu on a row.
 *
 * Portalled and positioned from the button's own rect: rendered in place it
 * would be clipped by the table's horizontal scroll box, and the last row's
 * menu would open below the fold.
 */
export function RowMenu({ children, label = 'More actions' }) {
  const btnRef = useRef(null);
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    if (!rect) return undefined;
    const close = () => setRect(null);
    // Capture phase, so scrolling any ancestor closes it rather than leaving
    // the panel floating where the row used to be.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [rect]);

  useEffect(() => {
    if (!rect) return undefined;
    const away = (e) => {
      if (!e.target.closest?.('[data-row-menu]') && !btnRef.current?.contains(e.target)) setRect(null);
    };
    const esc = (e) => { if (e.key === 'Escape') setRect(null); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [rect]);

  const open = () => setRect(rect ? null : btnRef.current.getBoundingClientRect());

  // Right-aligned to the button, and flipped above it when the space below is
  // too tight — which is exactly the last row of every page.
  const WIDTH = 190;
  const style = rect && (() => {
    const below = window.innerHeight - rect.bottom;
    const up    = below < 220 && rect.top > below;
    return {
      left: Math.max(8, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - 8)),
      ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    };
  })();

  return (
    <>
      <button ref={btnRef} type="button" className={`lact${rect ? ' lact--on' : ''}`}
        onClick={open} title={label} aria-label={label} aria-expanded={!!rect}>
        <Icon name="dots" size={16} />
      </button>
      {rect && createPortal(
        <div className="lmenu" data-row-menu style={style} onClick={() => setRect(null)}>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

export const MenuItem = ({ icon, children, onClick, to, danger }) => {
  const cls = `lmenu__item${danger ? ' lmenu__item--danger' : ''}`;
  const body = <><Icon name={icon} size={16} />{children}</>;
  return to
    ? <Link to={to} className={cls}>{body}</Link>
    : <button type="button" className={cls} onClick={onClick}>{body}</button>;
};

export const MenuSep = () => <div className="lmenu__sep" />;

// ── Card footer ──────────────────────────────────────────────────────────────

/**
 * "Showing 1 to 20 of 214 students", the pager and the rows-per-page control.
 *
 * Rendered even for a single page, because the count sentence is the answer to
 * "did my filter do anything" and it should not vanish once the list is short.
 */
export const ListFooter = ({ page, pages, total, limit, count, noun, onPage, onLimit }) => {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = (page - 1) * limit + count;
  return (
    <div className="lfoot">
      <span className="lfoot__count">
        {total === 0
          ? `No ${noun}s to show`
          : `Showing ${from} to ${to} of ${total} ${total === 1 ? noun : `${noun}s`}`}
      </span>
      <div className="lfoot__right">
        <Pagination page={page} pages={pages} total={total} onPage={onPage} />
        <PageSize value={limit} total={total} onChange={onLimit} />
      </div>
    </div>
  );
};

// ── Closing panels ───────────────────────────────────────────────────────────

/**
 * The shortcuts under the table. Each tile is a real destination or a real
 * action — nothing here is decoration.
 */
export const QuickActions = ({ items }) => (
  <section className="lpanel">
    <h2>Quick Actions</h2>
    <div className="lqa">
      {items.map((it) => {
        const inner = (
          <>
            <span className={`lstat__icon tint-${it.tone}`} style={{ width: 42, height: 42, borderRadius: 12 }}>
              <Icon name={it.icon} size={20} />
            </span>
            <span>{it.label}</span>
            {it.sub ? <small>{it.sub}</small> : null}
          </>
        );
        const cls = 'lqa__tile';
        const bg  = { background: it.bg };
        return it.to
          ? <Link key={it.label} to={it.to} className={cls} style={bg}>{inner}</Link>
          : <button key={it.label} type="button" className={cls} style={bg} onClick={it.onClick}>{inner}</button>;
      })}
    </div>
  </section>
);

export const HelpPanel = ({ text, scene: Scene }) => (
  <section className="lpanel lhelp">
    <span className="lhelp__mark"><Icon name="lifebuoy" size={22} /></span>
    <div className="lhelp__body">
      <h2>Need Help?</h2>
      <p>{text}</p>
      <Link to="/chat" className="btn btn-secondary">
        Contact Support <Icon name="arrowRight" size={15} />
      </Link>
    </div>
    {Scene ? <div className="lhelp__art"><Scene /></div> : null}
  </section>
);

export const PageFoot = ({ schoolName }) => (
  <footer className="lpagefoot">
    <span>© {new Date().getFullYear()} {schoolName || 'Aksharum'}. All rights reserved.</span>
    <span className="lpagefoot__brand"><Icon name="sparkle" size={14} /> Powered by Aksharum ERP</span>
  </footer>
);

// ── Detail drawer ────────────────────────────────────────────────────────────

/**
 * The whole record, beside the list.
 *
 * A slide-over rather than a route: the admin filtered their way to this row,
 * and navigating away would throw that away to show them one person.
 */
export function Drawer({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="ldrawer__scrim" onClick={onClose} />
      <aside className="ldrawer" role="dialog" aria-modal="true">{children}</aside>
    </>,
    document.body,
  );
}

export const DrawerHead = ({ name, sub, photo, tone, tags, onClose }) => (
  <div className="ldrawer__head">
    <Avatar name={name} src={photo} tone={tone} size={52} />
    <div className="ldrawer__id">
      <h3>{name}</h3>
      {sub ? <p>{sub}</p> : null}
      {tags?.length ? <div className="ldrawer__tags">{tags}</div> : null}
    </div>
    <button type="button" className="lact" onClick={onClose} aria-label="Close">
      <Icon name="close" size={16} />
    </button>
  </div>
);

/** A titled group of fields; renders nothing when every field is empty. */
export const DrawerSection = ({ title, fields }) => {
  const rows = fields.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  if (!rows.length) return null;
  return (
    <section className="ldrawer__sec">
      <h4>{title}</h4>
      <dl>
        {rows.map(([k, v]) => (
          <div className="lfield" key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </section>
  );
};

export const DrawerFoot = ({ children }) => <div className="ldrawer__foot">{children}</div>;
