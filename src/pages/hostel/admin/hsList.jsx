/**
 * The Hostel kit's list-screen half: everything the twenty-four admin list
 * screens are built from, to the user's mockups.
 *
 * One declarative table on purpose. A screen describes its columns once and
 * gets the header, the select column, the actions column, expandable rows AND
 * the narrow-page card layout from that one description — a hand-rolled
 * <table> quietly loses the card layout, which is how a list becomes unusable
 * on a phone.
 *
 * Menus (the row kebab, the split button's arrow) are portalled to <body> and
 * placed with position: fixed. `.hs-page` is a size container, and a container
 * is the containing block for its fixed descendants — a menu rendered inside it
 * would be placed against the page, not the window. The menu is measured on the
 * frame after it renders (hidden until then), so a menu near the foot of the
 * window opens upward by its real height, never by a guess.
 */
import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import Icon, { ICON_NAMES } from '../../../components/ui/icons';
import Tabs from '../../../components/ui/Tabs';
import { Glyph, Mark, count, num } from './hsUI';

/** The shared outline icon when it exists, else the kit's solid glyph. */
export const Ico = ({ name, size = 16 }) => (ICON_NAMES.includes(name)
  ? <Icon name={name} size={size} aria-hidden />
  : <Glyph name={name} size={size} />);

/* ── Buttons ─────────────────────────────────────────────────────────────── */

export const Btn = forwardRef(({ kind = 'outline', size, icon, iconRight, children, className = '', as: As = 'button', ...rest }, ref) => (
  <As
    ref={ref}
    className={`hs-btn hs-btn--${kind}${size ? ` hs-btn--${size}` : ''} ${className}`}
    {...(As === 'button' ? { type: rest.type || 'button' } : null)}
    {...rest}
  >
    {icon ? <Ico name={icon} size={size === 'sm' ? 15 : 17} /> : null}
    {children}
    {iconRight ? <Ico name={iconRight} size={15} /> : null}
  </As>
));
Btn.displayName = 'Btn';

export const IconBtn = forwardRef(({ icon, label, kind = 'outline', size = 'md', className = '', ...rest }, ref) => (
  <button ref={ref} type="button" className={`hs-ibtn hs-ibtn--${kind} hs-ibtn--${size} ${className}`} aria-label={label} title={label} {...rest}>
    <Ico name={icon} size={size === 'sm' ? 15 : 17} />
  </button>
));
IconBtn.displayName = 'IconBtn';

/* ── Anchored popover and menus ─────────────────────────────────────────── */

/**
 * A floating panel under (or over) its anchor. `align` 'end' lines its right
 * edge up with the anchor's. Closes on outside press, Escape, scroll-away.
 */
export function Popover({ anchor, open, onClose, align = 'end', className = '', children, label }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const m = ref.current;
      if (!a || !m) return;
      const mh = m.offsetHeight; const mw = m.offsetWidth;
      const vh = window.innerHeight; const vw = window.innerWidth;
      const below = a.bottom + 6 + mh <= vh - 8 || a.top - 6 - mh < 8;
      const top = below ? a.bottom + 6 : a.top - 6 - mh;
      let left = align === 'end' ? a.right - mw : a.left;
      left = Math.max(8, Math.min(left, vw - mw - 8));
      setPos({ top: Math.max(8, top), left });
    };
    // First frame renders it hidden; place once its real size is known.
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, align]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (ref.current?.contains(e.target) || anchor.current?.contains(e.target)) return;
      onClose();
    };
    const key = (e) => { if (e.key === 'Escape') { onClose(); anchor.current?.focus(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
      document.removeEventListener('keydown', key);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref} className={`hs-pop ${className}`} role="dialog" aria-label={label}
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Menu items: { label, icon, onClick, danger, disabled, hint } or '-' for a rule. */
function MenuList({ items, onPick }) {
  const box = useRef(null);
  useEffect(() => { box.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus(); }, []);
  const onKey = (e) => {
    const list = [...(box.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    const at = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(at + 1) % list.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus(); }
  };
  return (
    <div className="hs-menu2" role="menu" ref={box} onKeyDown={onKey}>
      {items.filter(Boolean).map((it, i) => (it === '-'
        ? <div key={`r${i}`} className="hs-menu2__rule" role="separator" />
        : (
          <button
            key={it.label} type="button" role="menuitem" disabled={it.disabled}
            className={`hs-menu2__item${it.danger ? ' is-danger' : ''}`}
            onClick={() => { onPick(); it.onClick?.(); }}
          >
            {it.icon ? <Ico name={it.icon} size={16} /> : null}
            <span>{it.label}{it.hint ? <small>{it.hint}</small> : null}</span>
          </button>
        )))}
    </div>
  );
}

/** The row's ⋮ button and its menu. Renders nothing when there is nothing in it. */
export function Kebab({ items = [], label = 'More actions', size = 'md', kind = 'outline' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <>
      <IconBtn ref={btn} icon="dotsV" label={label} size={size} kind={kind} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label={label}>
        <MenuList items={list} onPick={() => setOpen(false)} />
      </Popover>
    </>
  );
}

/** "+ Add Hostel ⌄": the primary action, with its relatives behind the arrow. */
export function SplitBtn({ label, icon = 'plus', onClick, items = [], menuLabel = 'More options' }) {
  const [open, setOpen] = useState(false);
  const arrow = useRef(null);
  return (
    <div className="hs-split">
      <Btn kind="primary" icon={icon} onClick={onClick}>{label}</Btn>
      {items.filter(Boolean).length ? (
        <>
          <button ref={arrow} type="button" className="hs-split__arrow" aria-label={menuLabel} aria-haspopup="menu" aria-expanded={open}
            onClick={() => setOpen((o) => !o)}>
            <Icon name="chevronDown" size={16} aria-hidden />
          </button>
          <Popover anchor={arrow} open={open} onClose={() => setOpen(false)} label={menuLabel}>
            <MenuList items={items} onPick={() => setOpen(false)} />
          </Popover>
        </>
      ) : null}
    </div>
  );
}

/* ── Badges, avatars, cells ──────────────────────────────────────────────── */

/**
 * `glyph` draws one of the kit's solid glyphs (the mockups' type tags: a house
 * for Home, a cross for Medical); `icon` draws the app's outline icon.
 * `size="lg"` is the taller tag those type and status columns use.
 */
export const Badge = ({ tone = 'slate', dot, icon, glyph, children, strong, pill, size, title }) => (
  <span className={`hs-badge hs-bt-${tone}${strong ? ' hs-badge--strong' : ''}${pill ? ' hs-badge--pill' : ''}${size ? ` hs-badge--${size}` : ''}`} title={title}>
    {dot ? <i className="hs-badge__dot" /> : null}
    {glyph ? <Glyph name={glyph} size={size === 'lg' ? 17 : 14} /> : null}
    {icon ? <Ico name={icon} size={size === 'lg' ? 15 : 13} /> : null}
    {children}
  </span>
);

const AV = [['#ede9fe', '#6d28d9'], ['#fce7f3', '#db2777'], ['#dcfce7', '#15803d'], ['#fee2e2', '#dc2626'],
  ['#e0e7ff', '#4338ca'], ['#f3e8ff', '#7e22ce'], ['#fdf2f8', '#be185d'], ['#e0f2fe', '#0369a1'],
  ['#fef3c7', '#b45309'], ['#ccfbf1', '#0f766e']];
export const initials = (name = '') => String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2)
  .map((w) => w[0]).join('').toUpperCase() || '?';
const toneOf = (key = '') => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV[h % AV.length]; };

const UPLOADS = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
const photoUrl = (p) => (!p ? '' : /^https?:|^data:/.test(p) ? p : `${UPLOADS}${p.startsWith('/') ? '' : '/'}${p}`);

export function Avatar({ name, src, size = 36 }) {
  const [broken, setBroken] = useState(false);
  const [bg, fg] = toneOf(name);
  const s = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src && !broken) return <img className="hs-av" src={photoUrl(src)} alt="" style={s} onError={() => setBroken(true)} />;
  return <span className="hs-av" style={{ ...s, background: bg, color: fg }} aria-hidden>{initials(name)}</span>;
}

/** Avatar, name, and a grey line under it. */
export const Person = ({ name, sub, src, size = 36, strong = true }) => (
  <span className="hs-person">
    <Avatar name={name} src={src} size={size} />
    <span className="hs-two">
      <span className={strong ? 'hs-two__top is-strong' : 'hs-two__top'}>{name || '—'}</span>
      {sub ? <span className="hs-two__sub">{sub}</span> : null}
    </span>
  </span>
);

export const TwoLine = ({ top, sub, strong, danger }) => (
  <span className="hs-two">
    <span className={`hs-two__top${strong ? ' is-strong' : ''}${danger ? ' is-danger' : ''}`}>{top ?? '—'}</span>
    {sub ? <span className="hs-two__sub">{sub}</span> : null}
  </span>
);

/** A tinted icon square with two lines beside it — "Host / HOS-001". */
export const IconCell = ({ icon, tone = 'indigo', top, sub, size = 40 }) => (
  <span className="hs-person">
    <Mark name={icon} tone={tone} size={size} glyph={Math.round(size * 0.52)} />
    <TwoLine top={top} sub={sub} strong />
  </span>
);

export const Meter = ({ pct, color, label }) => (
  <span className="hs-cellmeter">
    <span className="hs-bar"><i style={{ '--pct': `${Math.max(0, Math.min(100, num(pct)))}%`, ...(color ? { '--bar': color } : null) }} /></span>
    <b>{label ?? `${num(pct)}%`}</b>
  </span>
);

/* ── Figure tiles for the list screens ───────────────────────────────────── */

/**
 * `size="sm"` is the shorter tile the five-across mockups draw. `tonePct` prints
 * a meter's percentage in its tile's colour ("21%" in green) rather than as a
 * grey caption, as Security does.
 */
export const Kpis = ({ children, cols, size, tonePct }) => (
  <div className={`hs-kpis${size ? ` hs-kpis--${size}` : ''}${tonePct ? ' hs-kpis--tonepct' : ''}${cols ? ` hs-kpis--c${cols}` : ''}`} style={cols ? { '--cols': cols } : undefined}>{children}</div>
);

/**
 * One figure tile. The mockups draw these several ways — a percentage under
 * the label, a percentage with a meter, a month-on-month change, a note, a
 * faint drawing at the right edge — so each is a prop rather than a variant.
 *
 *   pct / pctTone   "67%" under the label (tone colours it)
 *   bar             draw a meter for `pct` (barColor overrides the tone's)
 *   inline          put the pct text and meter on one row, text first
 *   labelTone       colours the label itself, where a mockup does ("Total Staff")
 *   delta           { pct, note, unit, tone, sign } → "↑ +12% from last month";
 *                   `tone` recolours it (a rising cost is amber, not green) and
 *                   `sign: false` drops the plus
 *   note            a plain grey line
 */
export function Kpi({ tone = 'indigo', icon, value, label, labelTone, pct, pctLabel, pctTone, bar, barColor, inline, delta, note, art, to, onClick, valueSize }) {
  const body = (
    <>
      <Mark name={icon} tone={tone} className="hs-kpi__mark" />
      <span className="hs-kpi__text">
        <strong style={valueSize ? { fontSize: valueSize } : undefined}>{typeof value === 'number' ? count(value) : value}</strong>
        <span className={`hs-kpi__label${labelTone ? ` hs-pt-${labelTone}` : ''}`}>{label}</span>
        {delta && delta.pct != null ? (
          delta.pct === 0 ? <span className="hs-kpi__delta is-flat">No change {delta.note || 'from last month'}</span> : (
            <span className={`hs-kpi__delta${delta.pct < 0 ? ' is-down' : ''}${delta.tone ? ` is-${delta.tone}` : ''}`}>
              <Icon name={delta.diagonal ? (delta.pct < 0 ? 'arrowDownRight' : 'arrowUpRight') : (delta.pct < 0 ? 'arrowDown' : 'arrowUp')} size={delta.diagonal ? 15 : 13} aria-hidden />
              <b>{delta.pct > 0 && delta.sign !== false ? '+' : ''}{delta.pct}{delta.unit ?? '%'}</b> {delta.note || 'from last month'}
            </span>
          )
        ) : null}
        {pct != null && !bar ? <span className={`hs-kpi__pct hs-pt-${pctTone || 'ink'}`}>{pctLabel ?? `${pct}%`}</span> : null}
        {pct != null && bar ? (
          <span className={`hs-kpi__meter${inline ? ' is-inline' : ''}`}>
            <span className={`hs-kpi__pct hs-pt-${pctTone || tone}`}>{pctLabel ?? `${pct}%`}</span>
            <span className="hs-bar"><i style={{ '--pct': `${Math.max(0, Math.min(100, num(pct)))}%`, '--bar': barColor || 'var(--t-ink)' }} /></span>
          </span>
        ) : null}
        {note ? <span className="hs-kpi__note">{note}</span> : null}
      </span>
      {art ? <span className="hs-kpi__art" aria-hidden>{art}</span> : null}
    </>
  );
  const cls = `hs-kpi hs-t-${tone} hs-k-${tone}`;
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" className={cls} onClick={onClick}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/* ── Filters ─────────────────────────────────────────────────────────────── */

/** `below` is a second row — the search and its buttons, where a mockup splits them off. */
export const FilterBar = ({ children, card, band, title, below }) => (
  <div className={`hs-filters${card ? ' hs-filters--card' : ''}${band ? ' hs-filters--band' : ''}`}>
    {title ? <div className="hs-filters__title"><Icon name="filter" size={17} aria-hidden />{title}</div> : null}
    <div className="hs-filters__row">{children}</div>
    {below ? <div className="hs-filters__row hs-filters__row--below">{below}</div> : null}
  </div>
);

/**
 * A control's share of its row. One that does not grow is given a real width,
 * not just a basis: a flex container sizes itself by its items' content, so a
 * basis alone leaves the row too narrow for the controls it then lays out.
 */
const sizing = (grow, width) => ({
  flexGrow: grow,
  ...(width ? { flexBasis: width, ...(grow === 0 ? { width, flexShrink: 0 } : null) } : null),
});

export function FSearch({ value, onChange, placeholder = 'Search…', grow = 1, width, label = 'Search', compact }) {
  return (
    <label className={`hs-fsearch${compact ? ' hs-fsearch--sm' : ''}`} style={sizing(grow, width)}>
      <Icon name="search" size={17} aria-hidden />
      <input type="search" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
    </label>
  );
}

/**
 * A native select, restyled. `all` is the empty option ("All hostels"); leave
 * it out for a select that must always hold a value.
 */
export function FSelect({ value, onChange, options = [], all, label, grow = 1, width, icon }) {
  return (
    <span className={`hs-fselect${icon ? ' has-icon' : ''}`} style={sizing(grow, width)}>
      {icon ? <span className="hs-fselect__icon"><Ico name={icon} size={16} /></span> : null}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={label || all}>
        {all ? <option value="">{all}</option> : null}
        {options.map((o) => (typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>))}
      </select>
      <Icon name="chevronDown" size={15} className="hs-fselect__chev" aria-hidden />
    </span>
  );
}

/** From → to, as the mockups draw it: one box, two dates, an arrow between. */
export function FDateRange({ from, to, onChange, grow = 1, width, icon = true }) {
  return (
    <span className="hs-fdates" style={sizing(grow, width)}>
      {icon ? <Icon name="calendar" size={16} aria-hidden /> : null}
      <input type="date" value={from || ''} onChange={(e) => onChange({ from: e.target.value, to })} aria-label="From date" />
      <Icon name="arrowRight" size={14} className="hs-fdates__arrow" aria-hidden />
      <input type="date" value={to || ''} onChange={(e) => onChange({ from, to: e.target.value })} aria-label="To date" />
    </span>
  );
}

/** A labelled control, for the filter rows that name each field (Attendance). */
export const FField = ({ label, children, grow = 1, width }) => (
  <label className="hs-ffield" style={sizing(grow, width)}>
    <span>{label}</span>
    {children}
  </label>
);

/* ── Tabs ────────────────────────────────────────────────────────────────── */

/**
 * The underlined tabs with a count pill, on the app's one Tabs component.
 * items: [{ key, label, count, tone }] — tone 'bad' | 'warn' | 'good' tints
 * the count as the mockups do for Rejected / Overdue.
 */
export const LineTabs = ({ items, value, onChange, rule = false, label = 'Views' }) => (
  <Tabs
    variant="line" className={`hs-ltabs${rule ? ' hs-ltabs--rule' : ''}`} label={label}
    value={value} onChange={onChange}
    items={items.map((t) => ({ key: t.key, label: t.label, icon: t.icon, count: t.count ?? undefined, tone: t.tone }))}
  />
);

/* ── The table ───────────────────────────────────────────────────────────── */

/**
 * columns: [{ key, label, render(row, i), width, align: 'right'|'center', nowrap, className, hideNarrow }]
 * pad / headPad: a cell's vertical padding in px, where a mockup's rows are taller
 * actionsAlign: 'start' lines the row buttons up from the left with the ⋮ at the
 *   right edge, as the Leave and Outpass mockups draw them
 * select:  true to show the check column (selected: Set, onSelect(Set))
 * actions: row => node, drawn in the last column (header "ACTIONS")
 * expand:  row => node, drawn in a full-width row under an expanded one
 */
export function DataTable({
  columns, rows = [], rowKey = '_id', select = true, selected, onSelect, actions, actionsLabel = 'Actions',
  expand, expanded, onExpand, empty, loading, onRowClick, number, numberFrom = 1, minWidth, className = '', pad, headPad, dense, actionsAlign,
}) {
  const keyOf = (r, i) => String(r[rowKey] ?? i);
  const allOn = select && rows.length > 0 && rows.every((r, i) => selected?.has(keyOf(r, i)));
  const someOn = select && rows.some((r, i) => selected?.has(keyOf(r, i)));
  const toggleAll = () => {
    const next = new Set(selected || []);
    rows.forEach((r, i) => (allOn ? next.delete(keyOf(r, i)) : next.add(keyOf(r, i))));
    onSelect?.(next);
  };
  const toggle = (k) => { const next = new Set(selected || []); next.has(k) ? next.delete(k) : next.add(k); onSelect?.(next); };
  const span = columns.length + (select ? 1 : 0) + (expand ? 1 : 0) + (number ? 1 : 0) + (actions ? 1 : 0);

  // Wider than its card? Then it scrolls sideways, and the actions column is
  // pinned so a row's buttons never scroll out of reach.
  const wrap = useRef(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const check = () => setWide(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [rows, columns.length]);

  return (
    <div ref={wrap} className={`hs-table-wrap${loading ? ' is-loading' : ''}${wide ? ' is-wide' : ''} ${className}`} aria-busy={loading || undefined}>
      <table className={`hs-table${dense ? ' hs-table--dense' : ''}${actionsAlign === 'start' ? ' hs-table--acts-start' : ''}`} style={{ ...(minWidth ? { minWidth } : null), ...(pad ? { '--td-pad': `${pad}px` } : null), ...(headPad ? { '--th-pad': `${headPad}px` } : null) }}>
        <thead>
          <tr>
            {select ? (
              <th className="hs-table__check">
                <input type="checkbox" className="hs-check" checked={allOn} aria-label="Select all rows on this page"
                  ref={(el) => { if (el) el.indeterminate = !allOn && someOn; }} onChange={toggleAll} />
              </th>
            ) : null}
            {expand ? <th className="hs-table__exp" aria-label="Expand" /> : null}
            {number ? <th className="hs-table__num">#</th> : null}
            {columns.map((c) => (
              <th key={c.key} className={`${c.align ? `is-${c.align}` : ''} ${c.hideNarrow ? 'hs-hide-narrow' : ''}`} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
            {actions ? <th className="is-right hs-table__acts">{actionsLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((r, i) => {
            const k = keyOf(r, i);
            const open = expand && expanded === k;
            return (
              <React.Fragment key={k}>
                <tr className={`${open ? 'is-open' : ''}${selected?.has(k) ? ' is-selected' : ''}${onRowClick ? ' is-clickable' : ''}`}
                  onClick={onRowClick ? (e) => { if (!e.target.closest('button,a,input,select,label')) onRowClick(r); } : undefined}>
                  {select ? (
                    <td className="hs-table__check">
                      <input type="checkbox" className="hs-check" checked={!!selected?.has(k)} onChange={() => toggle(k)} aria-label="Select row" />
                    </td>
                  ) : null}
                  {expand ? (
                    <td className="hs-table__exp">
                      <button type="button" className={`hs-exp${open ? ' is-open' : ''}`} aria-expanded={!!open}
                        aria-label={open ? 'Collapse' : 'Expand'} onClick={() => onExpand?.(open ? null : k)}>
                        <Icon name="chevronRight" size={15} aria-hidden />
                      </button>
                    </td>
                  ) : null}
                  {number ? <td className="hs-table__num" data-label="#">{numberFrom + i}</td> : null}
                  {columns.map((c) => (
                    <td key={c.key} data-label={typeof c.label === 'string' ? c.label : c.textLabel}
                      className={`${c.align ? `is-${c.align}` : ''}${c.nowrap ? ' is-nowrap' : ''} ${c.className || ''} ${c.hideNarrow ? 'hs-hide-narrow' : ''}`}>
                      {c.render ? c.render(r, i) : (r[c.key] ?? '—')}
                    </td>
                  ))}
                  {actions ? <td className="is-right hs-table__acts" data-label={actionsLabel}><span className="hs-acts">{actions(r, i)}</span></td> : null}
                </tr>
                {open ? (
                  <tr className="hs-table__detail"><td colSpan={span}>{expand(r)}</td></tr>
                ) : null}
              </React.Fragment>
            );
          }) : (
            <tr className="hs-table__empty"><td colSpan={span}>{loading ? <div className="hs-table__loading">Loading…</div> : empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** "Showing 1 to 7 of 24 allocations" + rows per page + page buttons. */
export function Pager({ page = 1, pages = 1, total = 0, limit = 10, noun = 'items', onPage, sizes, onLimit, compact, size }) {
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(total, page * limit);
  const list = [];
  const push = (v) => list.push(v);
  if (pages <= 5) for (let n = 1; n <= pages; n++) push(n);
  else {
    push(1);
    if (page > 3) push('…a');
    for (let n = Math.max(2, page - 1); n <= Math.min(pages - 1, page + 1); n++) push(n);
    if (page < pages - 2) push('…b');
    push(pages);
  }
  return (
    <div className={`hs-pager${size ? ` hs-pager--${size}` : ''}`}>
      <span className="hs-pager__info">
        {compact && total <= limit ? `Showing ${count(total)} of ${count(total)} ${noun}` : `Showing ${count(from)} to ${count(to)} of ${count(total)} ${noun}`}
      </span>
      <span className="hs-pager__side">
        {sizes && onLimit ? (
          <span className="hs-pager__size">
            Rows per page
            <FSelect value={String(limit)} onChange={(v) => onLimit(Number(v))} options={sizes.map((s) => ({ value: String(s), label: String(s) }))} label="Rows per page" grow={0} width="76px" />
          </span>
        ) : null}
        <span className="hs-pager__pages" role="navigation" aria-label="Pages">
          <IconBtn icon="chevronLeft" label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} />
          {list.map((n) => (typeof n === 'number'
            ? <button key={n} type="button" className={`hs-pgbtn${n === page ? ' is-on' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
            : <span key={n} className="hs-pgbtn is-gap">…</span>))}
          <IconBtn icon="chevronRight" label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} />
        </span>
      </span>
    </div>
  );
}

/**
 * What can be done with the ticked rows. Drawn only while something is ticked,
 * so a list with nothing selected looks exactly as its mockup does.
 */
export const BulkBar = ({ count: n = 0, noun = 'row', plural, onClear, children }) => (n ? (
  <div className="hs-bulk" role="region" aria-label="Selected rows">
    <strong>{count(n)} {n === 1 ? noun : (plural || `${noun}s`)} selected</strong>
    <span className="hs-bulk__acts">{children}</span>
    <button type="button" className="hs-bulk__clear" onClick={onClear}>Clear</button>
  </div>
) : null);

/** The white card a table sits in, with an optional head row and a footer. */
export const ListCard = ({ head, children, foot, className = '' }) => (
  <section className={`hs-lcard ${className}`}>
    {head ? <div className="hs-lcard__head">{head}</div> : null}
    {children}
    {foot ? <div className="hs-lcard__foot">{foot}</div> : null}
  </section>
);

export const EmptyRows = ({ icon = 'search', title = 'Nothing here', children, action }) => (
  <div className="hs-emptyrows">
    <Mark name={icon} tone="slate" size={46} glyph={22} />
    <strong>{title}</strong>
    {children ? <p>{children}</p> : null}
    {action}
  </div>
);

/* ── State and data ──────────────────────────────────────────────────────── */

/**
 * A list screen's state: tab, filters, search, page, page size. Filters named
 * in `fromUrl` start from the query string, so the Dashboard's links like
 * `?status=pending` still land on a filtered list. Changing any filter or the
 * tab goes back to page 1.
 */
export function useListState(defaults = {}, { fromUrl = ['status', 'tab'] } = {}) {
  const [params] = useSearchParams();
  const [state, setState] = useState(() => {
    const s = { page: 1, limit: 10, tab: 'all', search: '', ...defaults };
    fromUrl.forEach((k) => { if (params.get(k)) s[k] = params.get(k); });
    return s;
  });
  const set = useCallback((patch) => setState((s) => ({ ...s, page: 1, ...(typeof patch === 'function' ? patch(s) : patch) })), []);
  const setPage = useCallback((page) => setState((s) => ({ ...s, page })), []);
  const reset = useCallback(() => setState((s) => ({ page: 1, limit: s.limit, tab: s.tab, search: '', ...defaults })), [defaults]);
  return { state, set, setPage, reset };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Fetch a board for the current list state. The previous answer stays on
 * screen while the next is fetched; a slow reply to an old request is dropped.
 * The search box is debounced so typing does not fire a request per key.
 */
export function useBoardData(fetcher, state) {
  const search = useDebounced(state.search, 300);
  const query = useMemo(() => {
    const q = {};
    for (const [k, v] of Object.entries({ ...state, search })) if (v !== '' && v !== null && v !== undefined) q[k] = v;
    return q;
  }, [state, search]);
  const key = JSON.stringify(query);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    let alive = true;
    setLoading(true);
    Promise.resolve().then(() => fetcher(query))
      .then((res) => { if (alive && mine === seq.current) { setData(res?.data ?? res); setError(null); } })
      .catch((e) => { if (alive && mine === seq.current) setError(e); })
      .finally(() => { if (alive && mine === seq.current) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload, query };
}

/** Download rows as CSV: columns [{ label, value(row) }]. */
export function exportCsv(filename, columns, rows) {
  const esc = (v) => {
    if (v == null) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))].join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ── Formatting shared by the list screens ───────────────────────────────── */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const valid = (d) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? x : null; };
/** 12 Aug 2025 */
export const fmtDate = (d) => { const x = valid(d); return x ? `${String(x.getDate()).padStart(2, '0')} ${MON[x.getMonth()]} ${x.getFullYear()}` : '—'; };
/** 04:30 PM */
export const fmtTime = (d) => { const x = valid(d); return x ? x.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''; };
/** Sep 2026 */
export const fmtMonth = (d) => { const x = valid(d); return x ? `${MON[x.getMonth()]} ${x.getFullYear()}` : '—'; };
/** +91 98765 43210 — an Indian mobile number as the mockups print it. */
export const fmtPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return ten.length === 10 ? `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` : (p || '');
};
export const rupees = (n) => `₹${num(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
export const fileSize = (b) => { const n = num(b); return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`; };
/** "Room 101 · Bed 1" style place label from a board row. */
export const place = (r, { bed = true, short } = {}) => {
  if (!r?.roomNumber) return '';
  const b = r.buildingCode || r.buildingName || '';
  const room = short ? String(r.roomNumber).replace(/^room\s*/i, 'R') : r.roomNumber;
  return `${b ? `${b} - ` : ''}${room}${bed && r.bedNumber ? ` (Bed ${r.bedNumber})` : ''}`;
};
export const classLine = (r, prefix = 'student') => {
  const c = r[`${prefix}Class`]; const roll = r[`${prefix}Roll`];
  return [c ? String(c).replace(/^Class\s*/i, 'Class ') : '', roll ? `Roll ${roll}` : ''].filter(Boolean).join(' | ');
};
