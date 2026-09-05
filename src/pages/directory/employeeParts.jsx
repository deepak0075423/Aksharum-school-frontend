/**
 * The pieces the All Employees screen is built from.
 *
 * Kept beside the page like parts.jsx and overviewParts.jsx — a card shaped like
 * a staff record and a filter bar that knows what an employee is are not general
 * UI, and putting them in components/ui would only make them look reusable.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import {
  Avatar, Blank, BadgeIcon, BuildingIcon, MailIcon, PhoneIcon, SearchIcon,
  STATUS_LABEL, STATUS_TONE,
} from './parts';

// ── Header ───────────────────────────────────────────────────────────────────

export const Crumbs = ({ base, here }) => (
  <div className="breadcrumb">
    <Link to="/admin/dashboard">Dashboard</Link>
    <span aria-hidden>›</span>
    <Link to={`${base}/dashboard`}>Employee Directory</Link>
    <span aria-hidden>›</span>
    <span>{here}</span>
  </div>
);

export const PageTop = ({ title, subtitle, children }) => (
  <header className="edl-top">
    <div className="edl-top__text">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    {children ? <div className="edl-top__acts">{children}</div> : null}
  </header>
);

/**
 * One headcount tile.
 *
 * Every tile is the filter it describes: "2 Inactive Employees" is a question,
 * and pressing it should answer it rather than leave the reader to rebuild the
 * same filter by hand. `on` marks the one currently in force.
 */
export const StatTile = ({ icon, tone, value, label, caption, captionTone, on, onClick }) => {
  const body = (
    <>
      <span className={`edl-stat__icon tint-${tone}`}>{icon}</span>
      <span className="edl-stat__body">
        <span className="edl-stat__value">{value ?? 0}</span>
        <span className="edl-stat__label">{label}</span>
        {caption ? <span className={`edl-stat__cap${captionTone ? ` is-${captionTone}` : ''}`}>{caption}</span> : null}
      </span>
    </>
  );
  if (!onClick) return <div className="edl-stat">{body}</div>;
  return (
    <button type="button" className={`edl-stat edl-stat--btn${on ? ' is-on' : ''}`}
      onClick={onClick} aria-pressed={on}>{body}</button>
  );
};

// ── Filter bar ───────────────────────────────────────────────────────────────

export const SearchBox = ({ value, onChange, placeholder }) => (
  <div className="edl-search">
    <SearchIcon size={17} />
    <input className="form-control" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    {value && (
      <button type="button" className="edl-search__clear" onClick={() => onChange('')} aria-label="Clear search">
        <Icon name="close" size={15} />
      </button>
    )}
  </div>
);

/**
 * One dropdown in the bar.
 *
 * Marked as set only when it differs from its own default, so a sort sitting on
 * "Name (A–Z)" never reads as a filter someone forgot to clear.
 */
export const Pick = ({ value, onChange, all, options, label, defaultValue = '' }) => (
  <select className={`form-control edl-pick${value !== defaultValue ? ' is-set' : ''}`}
    value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
    {all ? <option value="">{all}</option> : null}
    {options.map((o) => {
      const v = typeof o === 'string' ? o : o.value;
      const t = typeof o === 'string' ? o : o.label;
      return <option key={v} value={v}>{t}</option>;
    })}
  </select>
);

export const MoreFiltersButton = ({ open, count, onClick }) => (
  <button type="button" className={`btn btn-secondary edl-more${count ? ' is-on' : ''}`}
    onClick={onClick} aria-expanded={open}>
    <Icon name="filter" size={16} />
    More Filters{count ? ` (${count})` : ''}
  </button>
);

export const MorePanel = ({ children, onReset }) => (
  <div className="edl-morepanel">
    {children}
    <div className="edl-morepanel__reset">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onReset}>
        <Icon name="refresh" size={14} /> Reset all filters
      </button>
    </div>
  </div>
);

export const Field = ({ label, children }) => (
  <div className="edl-field"><label>{label}</label>{children}</div>
);

/** Which filters are actually doing something — the button's badge. */
export const activeCount = (filters, defaults, ignore = []) =>
  Object.keys(defaults).filter((k) => !ignore.includes(k) && filters[k] !== defaults[k]).length;

/** The chips under the bar: what is in force, each removable on its own. */
export const ActiveChips = ({ items, onClear }) => {
  if (!items.length) return null;
  return (
    <div className="edl-chips">
      {items.map((c) => (
        <button key={c.key} type="button" className="edl-chip" onClick={c.onRemove}
          title={`Remove the ${c.label} filter`}>
          <b>{c.label}:</b> {c.value}
          <Icon name="close" size={13} />
        </button>
      ))}
      <button type="button" className="edl-chip edl-chip--clear" onClick={onClear}>Clear all</button>
    </div>
  );
};

// ── Result bar ───────────────────────────────────────────────────────────────

export const ViewToggle = ({ value, onChange }) => (
  <div className="edl-view" role="group" aria-label="Layout">
    {[
      { v: 'card',  label: 'Grid', icon: 'grid' },
      { v: 'table', label: 'List', icon: 'menu' },
    ].map((o) => (
      <button key={o.v} type="button" className={value === o.v ? 'is-on' : ''}
        aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
        <Icon name={o.icon} size={15} /> {o.label}
      </button>
    ))}
  </div>
);

// ── The card ─────────────────────────────────────────────────────────────────

/** One fact on a card. Always rendered, so the four cards in a row line up. */
const CardFact = ({ icon, children, title }) => (
  <span className="edl-card__fact" title={title}>{icon}<span>{children}</span></span>
);

/**
 * One employee.
 *
 * The whole card is not a link: it carries a menu and two of its own controls,
 * and nesting those inside an anchor makes every one of them a place the browser
 * might navigate from instead. The name and the button are the ways in.
 */
export function EmployeeCard({ e, base, onCopy }) {
  const status = e.employmentStatus || 'active';
  return (
    <article className="edl-card" data-focus-id={e._id}>
      <div className="edl-card__top">
        <Avatar name={e.name} src={e.profileImage} size={46} />
        <span className={`badge badge-${STATUS_TONE[status] || 'muted'}`}>
          {STATUS_LABEL[status] || status}
        </span>
      </div>

      <Link to={`${base}/employees/${e._id}`} className="edl-card__name">{e.name}</Link>
      <div className={`edl-card__role${e.designation ? '' : ' ed-none'}`}>
        {e.designation || 'No designation'}
      </div>

      <div className="edl-card__facts">
        <CardFact icon={<BadgeIcon />} title={e.employeeId || 'No employee ID'}>
          {e.employeeId || <Blank />}
        </CardFact>
        <CardFact icon={<BuildingIcon />} title={e.department || 'No department'}>
          {e.department || <Blank>No department</Blank>}
        </CardFact>
        <CardFact icon={<PhoneIcon />} title={e.officialPhone || 'No phone'}>
          {e.officialPhone || <Blank>No phone</Blank>}
        </CardFact>
        <CardFact icon={<MailIcon />} title={e.officialEmail}>
          {e.officialEmail || <Blank>No email</Blank>}
        </CardFact>
      </div>

      <div className="edl-card__foot">
        <Link to={`${base}/employees/${e._id}`} className="btn btn-secondary btn-sm">View Profile</Link>
        <RowMenu label={`Actions for ${e.name}`} trigger="Actions">
          <MenuItem icon="eye" to={`${base}/employees/${e._id}`}>View profile</MenuItem>
          {e.officialEmail && (
            <MenuItem icon="mail" href={`mailto:${e.officialEmail}`}>Send email</MenuItem>
          )}
          {e.officialPhone && (
            <MenuItem icon="phone" href={`tel:${e.officialPhone}`}>Call</MenuItem>
          )}
          <MenuSep />
          {e.officialEmail && (
            <MenuItem icon="clipboard" onClick={() => onCopy(e.officialEmail, 'Email')}>Copy email</MenuItem>
          )}
          {e.officialPhone && (
            <MenuItem icon="clipboard" onClick={() => onCopy(e.officialPhone, 'Phone')}>Copy phone</MenuItem>
          )}
        </RowMenu>
      </div>
    </article>
  );
}

// ── Menus ────────────────────────────────────────────────────────────────────

/**
 * The actions menu on a card or row.
 *
 * Portalled and positioned from the trigger's own rect: rendered in place it
 * would be clipped by the card's bounds and by the table's horizontal scroll
 * box, and the last row's menu would open below the fold.
 */
export function RowMenu({ children, label = 'More actions', trigger }) {
  const btnRef = useRef(null);
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    if (!rect) return undefined;
    const close = () => setRect(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [rect]);

  useEffect(() => {
    if (!rect) return undefined;
    const away = (ev) => {
      if (!ev.target.closest?.('[data-row-menu]') && !btnRef.current?.contains(ev.target)) setRect(null);
    };
    const esc = (ev) => { if (ev.key === 'Escape') setRect(null); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [rect]);

  const WIDTH = 190;
  const style = rect && (() => {
    const below = window.innerHeight - rect.bottom;
    const up = below < 230 && rect.top > below;
    return {
      left: Math.max(8, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - 8)),
      ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    };
  })();

  return (
    <>
      <button ref={btnRef} type="button" aria-label={label} aria-expanded={!!rect}
        className={trigger ? `btn btn-secondary btn-sm edl-actbtn${rect ? ' is-on' : ''}` : `edl-kebab${rect ? ' is-on' : ''}`}
        onClick={() => setRect(rect ? null : btnRef.current.getBoundingClientRect())}>
        {trigger ? <>{trigger} <Icon name="chevronDown" size={13} /></> : <Icon name="dots" size={16} />}
      </button>
      {rect && createPortal(
        <div className="edl-menu" data-row-menu style={style} onClick={() => setRect(null)}>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

export const MenuItem = ({ icon, children, onClick, to, href, danger }) => {
  const cls = `edl-menu__item${danger ? ' is-danger' : ''}`;
  const body = <><Icon name={icon} size={16} />{children}</>;
  if (to)   return <Link to={to} className={cls}>{body}</Link>;
  if (href) return <a href={href} className={cls}>{body}</a>;
  return <button type="button" className={cls} onClick={onClick}>{body}</button>;
};

export const MenuSep = () => <div className="edl-menu__sep" />;

// ── Footer ───────────────────────────────────────────────────────────────────

export const ListFoot = ({ page, pages, total, limit, count, onPage, onLimit, sizes }) => {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = (page - 1) * limit + count;
  return (
    <div className="edl-foot">
      <span className="edl-foot__count">
        {total === 0
          ? 'No employees to show'
          : `Showing ${from} to ${to} of ${total} employee${total === 1 ? '' : 's'}`}
      </span>
      <div className="edl-foot__right">
        {pages > 1 && (
          <div className="pagination">
            <button className="pagination__btn" disabled={page <= 1} onClick={() => onPage(page - 1)}
              aria-label="Previous page">‹</button>
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1).map((n) => (
              <button key={n} className={`pagination__btn${n === page ? ' active' : ''}`}
                onClick={() => onPage(n)}>{n}</button>
            ))}
            <button className="pagination__btn" disabled={page >= pages} onClick={() => onPage(page + 1)}
              aria-label="Next page">›</button>
          </div>
        )}
        <label className="edl-foot__size">
          <select className="form-control" value={limit} aria-label="Employees per page"
            onChange={(ev) => onLimit(Number(ev.target.value))}>
            {sizes.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </label>
      </div>
    </div>
  );
};
