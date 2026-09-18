/**
 * The timetable module's own UI kit.
 *
 * Every admin screen in this module — the section editor, substitutions,
 * generation, versions, availability, rooms, reports, configuration — is a wide
 * working area with a narrow rail that answers "what about the row I just
 * picked". The shared list frame (pages/admin/listParts.jsx) has nowhere to put
 * that rail, so this module carries its own vocabulary instead of bending one
 * that does not fit. The CSS lives under the `tt-` prefix in global.css.
 *
 * Nothing here talks to the network or knows what a timetable is. A component
 * that needed to would belong on the screen that owns it.
 */
import React from 'react';
import Icon from '../../../components/ui/icons';

/* ── Small helpers every screen reaches for ───────────────────────────────── */

/** "Sneha Verma" → "SV". One letter for a single name, never more than two. */
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** '08:45' → '08:45'; '8:5' → '08:05'; anything unparseable comes back as-is. */
export function hhmm(t) {
  const m = /^(\d{1,2}):(\d{1,2})/.exec(String(t || ''));
  if (!m) return t || '';
  return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`;
}

/** '08:45'–'09:30' as one label, with an en dash and no stray separator. */
export const timeRange = (a, b) => (a ? `${hhmm(a)}${b ? ` – ${hhmm(b)}` : ''}` : '—');

export const toMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{1,2})/.exec(String(t || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 95 minutes → "1h 35m". Used for the day's working hours and break time. */
export function duration(mins) {
  const n = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

/** Percent of a whole, guarding the empty case that would print NaN. */
export const pct = (n, of) => (of > 0 ? Math.round((Number(n) || 0) / of * 100) : 0);

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A stored YYYY-MM-DD read back as a calendar day, never shifted by a zone. */
export function fmtDay(iso, opts) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', ...(opts || {}),
  });
}

export function fmtWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** The eight tints the module colours chips, tiles and subjects with. */
export const TONES = ['indigo', 'blue', 'green', 'amber', 'red', 'violet', 'pink', 'teal'];

/** A stable tint per id, so one subject is the same colour on every screen. */
export function toneFor(key) {
  const s = String(key || '');
  if (!s) return 'slate';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

/** The colour a tone paints, for SVG and inline styles the classes cannot reach. */
export const TONE_INK = {
  indigo: '#4f46e5', blue: '#2563eb', green: '#059669', amber: '#d97706',
  red: '#dc2626', violet: '#7c3aed', pink: '#db2777', teal: '#0d9488',
  slate: '#64748b',
};
export const TONE_BG = {
  indigo: '#eef2ff', blue: '#eff6ff', green: '#f0fdf4', amber: '#fffbeb',
  red: '#fef2f2', violet: '#f5f3ff', pink: '#fdf2f8', teal: '#f0fdfa',
  slate: '#f8fafc',
};

/* ── Page furniture ───────────────────────────────────────────────────────── */

export const TtHead = ({ icon = 'calendar', title, subtitle, children }) => (
  <header className="tt-head">
    <div className="tt-head__icon"><Icon name={icon} size={28} /></div>
    <div className="tt-head__text">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    <div className="tt-head__acts">{children}</div>
  </header>
);

/**
 * The academic year every screen in the module reads. Rendered as a labelled
 * control rather than a bare select: on a page whose numbers are all per-year,
 * which year they are is a caption, not a filter.
 */
export const YearPicker = ({ years = [], value, onChange, label = 'Academic Year' }) => (
  <div className="tt-year">
    <Icon name="calendar" size={18} />
    <div className="tt-year__body">
      <span className="tt-year__cap">{label}</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {!years.length && <option value="">No years</option>}
        {years.map((y) => (
          <option key={y._id} value={y._id}>
            {y.yearName}{y.status === 'active' ? ' (Active)' : ''}
          </option>
        ))}
      </select>
    </div>
  </div>
);

/** tabs: [{ key, label, icon?, count? }] */
export const TtTabs = ({ tabs, value, onChange }) => (
  <nav className="tt-tabs" aria-label="Sections of this screen">
    {tabs.map((t) => (
      <button key={t.key} type="button"
        className={`tt-tab${value === t.key ? ' is-on' : ''}`}
        aria-current={value === t.key ? 'page' : undefined}
        onClick={() => onChange(t.key)}>
        {t.icon && <Icon name={t.icon} size={17} />}
        {t.label}
        {t.count != null && <span className="tt-tab__count">{t.count}</span>}
      </button>
    ))}
  </nav>
);

/** options: [[value, label], …] */
export const Seg = ({ options, value, onChange, quiet }) => (
  <div className={`tt-seg${quiet ? ' tt-seg--quiet' : ''}`}>
    {options.map(([v, label]) => (
      <button key={v} type="button" className={value === v ? 'is-on' : ''}
        onClick={() => onChange(v)}>{label}</button>
    ))}
  </div>
);

export const Stats = ({ cols = 4, children }) => (
  <div className="tt-stats" style={{ '--tt-cols': cols }}>{children}</div>
);

export const Stat = ({ icon, tone = 'slate', value, label, cap, pct: percent, onClick, active }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined}
      className={`tt-stat tt-stat--${tone}${active ? ' is-on' : ''}`}
      onClick={onClick}>
      {icon && <span className="tt-stat__icon"><Icon name={icon} size={22} /></span>}
      <span className="tt-stat__body">
        <span className="tt-stat__value">{value}</span>
        <span className="tt-stat__label">{label}</span>
        {cap && <span className="tt-stat__cap">{cap}</span>}
      </span>
      {percent != null && <span className="tt-stat__pct">{percent}%</span>}
    </Tag>
  );
};

export const Card = ({ icon, title, subtitle, actions, children, flush, foot, className = '' }) => (
  <section className={`tt-card${flush ? ' tt-card--flush' : ''} ${className}`.trim()}>
    {(title || actions) && (
      <div className="tt-card__head">
        <div className="tt-card__title">
          {icon && <span className="tt-card__icon"><Icon name={icon} size={21} /></span>}
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="tt-card__acts">{actions}</div>}
      </div>
    )}
    {children}
    {foot && <div className="tt-card__foot">{foot}</div>}
  </section>
);

export const Body = ({ children, className = '' }) => (
  <div className={`tt-card__body ${className}`.trim()}>{children}</div>
);

export const Filters = ({ children, plain }) => (
  <div className={`tt-filters${plain ? ' tt-filters--plain' : ''}`}>{children}</div>
);

export const Field = ({ label, required, hint, children, grow, fix, style }) => (
  <div className={`tt-field${grow ? ' tt-field--grow' : ''}${fix ? ' tt-field--fix' : ''}`} style={style}>
    {label && <label>{label}{required && <span className="tt-req">*</span>}</label>}
    {children}
    {hint && <span style={{ fontSize: '.73rem', color: 'var(--text-muted)' }}>{hint}</span>}
  </div>
);

/**
 * A labelled <select>. `is-set` marks a filter that is actually narrowing the
 * list — five identical grey selects give an admin no way to see which ones
 * they set five minutes ago.
 */
export const Pick = ({ label, value, onChange, children, allLabel, grow, fix = true, disabled, required }) => (
  <Field label={label} grow={grow} fix={fix} required={required}>
    {/* `is-set` marks a filter that is narrowing the list. A form field always
        has a value, so marking it says nothing — only a control with an "all"
        option is a filter. */}
    <select className={`form-control${value && allLabel ? ' is-set' : ''}`} value={value || ''} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}>
      {allLabel && <option value="">{allLabel}</option>}
      {children}
    </select>
  </Field>
);

export const Search = ({ value, onChange, placeholder = 'Search…' }) => (
  <div className="tt-search">
    <Icon name="search" size={17} />
    <input className="form-control" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} />
    {value && (
      <button type="button" className="tt-search__clear" onClick={() => onChange('')} aria-label="Clear search">
        <Icon name="close" size={14} />
      </button>
    )}
  </div>
);

export const Chip = ({ tone = 'slate', dot, children, title }) => (
  <span className={`tt-chip tt-chip--${tone}${dot ? ' tt-chip--dot' : ''}`} title={title}>{children}</span>
);

export const Avatar = ({ name, tone, lg }) => (
  <span className={`tt-avatar${lg ? ' tt-avatar--lg' : ''}`}
    style={tone ? { background: TONE_BG[tone], color: TONE_INK[tone] } : undefined}>
    {initials(name)}
  </span>
);

export const Person = ({ name, sub, tone, lg }) => (
  <span className="tt-person">
    <Avatar name={name} tone={tone} lg={lg} />
    <span style={{ minWidth: 0 }}>
      <span className="tt-person__name">{name || '—'}</span>
      {sub && <span className="tt-person__sub" style={{ display: 'block' }}>{sub}</span>}
    </span>
  </span>
);

/** A load bar. `tone` is read from the percentage unless one is given. */
export const Bar = ({ value, max = 100, tone, showPct = true, width }) => {
  const percent = max > 0 ? Math.round((Number(value) || 0) / max * 100) : 0;
  const t = tone || (percent > 100 ? 'bad' : percent >= 90 ? 'bad' : percent >= 60 ? 'good' : 'warn');
  return (
    <span className={`tt-bar tt-bar--${t}`} style={width ? { minWidth: width } : undefined}>
      <span className="tt-bar__track">
        <span className="tt-bar__fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </span>
      {showPct && <span className="tt-bar__pct">{percent}%</span>}
    </span>
  );
};

export const Panel = ({ icon, title, right, children, tight, tone }) => (
  <section className={`tt-panel${tone ? ` tt-panel--${tone}` : ''}`}>
    {(title || right) && (
      <div className="tt-panel__head">
        <h3>{icon && <Icon name={icon} size={17} />}{title}</h3>
        {right}
      </div>
    )}
    <div className={`tt-panel__body${tight ? ' tt-panel__body--tight' : ''}`}>{children}</div>
  </section>
);

export const KV = ({ icon, k, v }) => (
  <div className="tt-kv">
    <span className="tt-kv__k">{icon && <Icon name={icon} size={15} />}{k}</span>
    <span className="tt-kv__v">{v}</span>
  </div>
);

const NOTE_ICON = { info: 'info', good: 'checkCircle', warn: 'alert', bad: 'closeCircle', quiet: 'info' };
export const Note = ({ tone = 'info', icon, children }) => (
  <div className={`tt-note tt-note--${tone}`}>
    <Icon name={icon || NOTE_ICON[tone] || 'info'} size={16} />
    <div>{children}</div>
  </div>
);

/** One precondition: met, not met, or met with a caveat. */
export const Check = ({ state = 'ok', children, hint }) => (
  <div className={`tt-check tt-check--${state}`}>
    <Icon name={state === 'ok' ? 'checkCircle' : state === 'warn' ? 'alert' : 'closeCircle'} size={17} />
    <div className="tt-check__body">
      {children}
      {hint && <small>{hint}</small>}
    </div>
  </div>
);

/** items: [{ icon, tone, title, hint, onClick }] */
export const QuickActions = ({ items }) => (
  <div className="tt-qa">
    {items.filter(Boolean).map((a) => (
      <button key={a.title} type="button" className={`tt-qa__item tt-qa--${a.tone || 'indigo'}`}
        onClick={a.onClick} disabled={a.disabled}>
        <Icon name={a.icon} size={19} />
        <span>
          <strong>{a.title}</strong>
          <span>{a.hint}</span>
        </span>
      </button>
    ))}
  </div>
);

/**
 * steps: [{ key, title, hint }]. `done` is the set of keys already satisfied,
 * so a step the admin has completed reads as complete even when they have
 * scrolled back up to it.
 */
export const Steps = ({ steps, current, done = [], onPick }) => (
  <div className="tt-steps" style={{ '--tt-steps': steps.length }}>
    {steps.map((s, i) => {
      const isOn = s.key === current;
      const isDone = !isOn && done.includes(s.key);
      return (
        <button key={s.key} type="button"
          className={`tt-step${isOn ? ' is-on' : ''}${isDone ? ' is-done' : ''}`}
          onClick={onPick ? () => onPick(s.key) : undefined}
          disabled={!onPick}>
          <span className="tt-step__num">{isDone ? <Icon name="check" size={16} /> : i + 1}</span>
          <span className="tt-step__body">
            <strong>{s.title}</strong>
            <span>{s.hint}</span>
          </span>
        </button>
      );
    })}
  </div>
);

export const SwitchRow = ({ checked, onChange, title, hint, disabled, lead }) => (
  <label className={`tt-switchrow${lead ? ' tt-switchrow--lead' : ''}${disabled ? ' is-off' : ''}`}>
    <input type="checkbox" checked={!!checked} disabled={disabled}
      onChange={(e) => onChange(e.target.checked)} />
    <span className={`tt-switch${checked ? ' is-on' : ''}`} aria-hidden="true" />
    <span className="tt-switchrow__body">
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </span>
  </label>
);

export const CheckRow = ({ checked, onChange, children, disabled }) => (
  <label className="tt-checkrow" style={disabled ? { opacity: .55 } : undefined}>
    <input type="checkbox" checked={!!checked} disabled={disabled}
      onChange={(e) => onChange(e.target.checked)} />
    {children}
  </label>
);

/** A settings group: tinted head, then its controls. */
export const SetCard = ({ tone = 'indigo', icon, title, hint, children }) => (
  <section className={`tt-set tt-set--${tone}`}>
    <div className="tt-set__head">
      <span className="tt-set__icon"><Icon name={icon} size={19} /></span>
      <div>
        <h3>{title}</h3>
        {hint && <p>{hint}</p>}
      </div>
    </div>
    <div className="tt-set__body">{children}</div>
  </section>
);

export const Weight = ({ label, value, onChange, max = 10 }) => (
  <div className="tt-weight">
    <span>{label}</span>
    <input type="range" min="0" max={max} value={Number(value) || 0}
      onChange={(e) => onChange(Number(e.target.value))} />
    <span className="tt-weight__n">{Number(value) || 0}</span>
  </div>
);

/** A compact pager. Shows at most seven numbers, anchored on the current page. */
export const Pager = ({ page, pages, onPage }) => {
  if (pages <= 1) return null;
  const from = Math.max(1, Math.min(page - 3, pages - 6));
  const to = Math.min(pages, from + 6);
  const nums = [];
  for (let i = from; i <= to; i++) nums.push(i);
  return (
    <div className="tt-pager">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <Icon name="chevronLeft" size={15} />
      </button>
      {nums.map((n) => (
        <button key={n} type="button" className={n === page ? 'is-on' : ''} onClick={() => onPage(n)}>{n}</button>
      ))}
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
        <Icon name="chevronRight" size={15} />
      </button>
    </div>
  );
};

/** items: [[colour, label], …] */
export const Legend = ({ items }) => (
  <div className="tt-legend">
    {items.map(([colour, label]) => (
      <span key={label}><i style={{ background: colour }} />{label}</span>
    ))}
  </div>
);

export const Rank = ({ n, name, value, tone = 'slate' }) => (
  <div className="tt-rank">
    <span className="tt-rank__n" style={{ background: TONE_BG[tone], color: TONE_INK[tone] }}>{n}</span>
    <span className="tt-rank__name" title={name}>{name}</span>
    <Chip tone={tone}>{value}</Chip>
  </div>
);

/**
 * A donut drawn as SVG arcs rather than pulled from the chart library: three
 * slices and a total in the middle is not worth a 105 kB chunk, and every
 * screen that shows one also prints the same numbers beside it.
 *
 * segments: [{ label, value, colour }]
 */
export const Donut = ({ segments, total, label, size = 118, thickness = 16 }) => {
  const sum = segments.reduce((n, s) => n + (Number(s.value) || 0), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="tt-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={label || 'Breakdown'}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
        {sum > 0 && segments.map((s) => {
          const frac = (Number(s.value) || 0) / sum;
          const dash = `${c * frac} ${c * (1 - frac)}`;
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.colour} strokeWidth={thickness}
              strokeDasharray={dash} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          offset += c * frac;
          return el;
        })}
      </svg>
      <div className="tt-donut__mid">
        <strong>{total ?? sum}</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
};

/** A pie is a donut with no hole — same arcs, so the two read as one family. */
export const Pie = ({ segments, size = 130 }) => {
  const sum = segments.reduce((n, s) => n + (Number(s.value) || 0), 0);
  const r = size / 2;
  let angle = -Math.PI / 2;
  const point = (a) => [r + r * Math.cos(a), r + r * Math.sin(a)];
  return (
    <svg width={size} height={size} role="img" aria-label="Breakdown" style={{ flexShrink: 0 }}>
      {sum <= 0 && <circle cx={r} cy={r} r={r} fill="#e2e8f0" />}
      {sum > 0 && segments.map((s) => {
        const frac = (Number(s.value) || 0) / sum;
        // A single slice covering the whole circle cannot be drawn as an arc —
        // start and end land on the same point and the path collapses.
        if (frac >= 0.9999) return <circle key={s.label} cx={r} cy={r} r={r} fill={s.colour} />;
        const start = point(angle);
        angle += frac * 2 * Math.PI;
        const end = point(angle);
        const large = frac > 0.5 ? 1 : 0;
        return (
          <path key={s.label} fill={s.colour}
            d={`M ${r} ${r} L ${start[0]} ${start[1]} A ${r} ${r} 0 ${large} 1 ${end[0]} ${end[1]} Z`} />
        );
      })}
    </svg>
  );
};

/** A bar chart with no axis library — labelled columns over a baseline. */
export const Columns = ({ data, height = 150, colour = '#818cf8', format = (v) => v }) => {
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, padding: '0 2px' }}>
        {data.map((d) => (
          <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              {d.value ? format(d.value) : ''}
            </span>
            <div title={`${d.label}: ${d.value}`} style={{
              width: '100%', borderRadius: '5px 5px 0 0', background: d.colour || colour,
              height: `${Math.max(2, (Number(d.value) || 0) / max * (height - 22))}px`,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
        {data.map((d) => (
          <span key={d.label} style={{
            flex: 1, textAlign: 'center', fontSize: '.68rem', color: 'var(--text-muted)',
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{d.label}</span>
        ))}
      </div>
    </div>
  );
};

export const EmptyRow = ({ colSpan, icon = 'info', title, message }) => (
  <tr>
    <td colSpan={colSpan}>
      <div className="tt-table__empty">
        <Icon name={icon} size={26} />
        <strong style={{ marginTop: 8 }}>{title}</strong>
        {message && <span>{message}</span>}
      </div>
    </td>
  </tr>
);

export const Loading = ({ label = 'Loading…' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 56 }}>
    <span className="spinner" />
    <span style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>{label}</span>
  </div>
);
