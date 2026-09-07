/**
 * The pieces of one student's 360° dashboard.
 *
 * Two rules run through all of it.
 *
 * **Nothing recorded is not zero.** An unmarked register, an unassessed
 * student, an unbilled fee — each of those is a null in the payload, and each
 * says so here. A tile that printed 0% for "no attendance marked" would tell
 * every reader this child never turned up.
 *
 * **Only what the school switched on.** The server sends a block per enabled
 * module; the tabs, the tiles and the columns are all built from those same
 * flags, so a school without fees is never shown an empty fee tab.
 *
 * Colours come from the module's validated palette (./palette): ordered things
 * (attendance bands) use its single-hue ramp; anything with a status meaning
 * uses the status trio and always carries its label and its number beside it —
 * those hues sit under 3:1 against the page, which obligates that relief.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Badge } from '../../components/ui/index';
import { VIZ, toneColor, toneForPercent } from './palette';

// ── Formatting ───────────────────────────────────────────────────────────────

export const fmtDate = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '');

export const fmtDay = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  : '');

export const fmtMoney = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);

export const fmtMonthKey = (key) => {
  if (!key) return '';
  const [y, m] = String(key).split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

/**
 * A stored "HH:MM" that may carry a stray leading zero.
 *
 * The timetable generator has written period times as "010:00" into live rows.
 * Printing that verbatim looks like a rendering fault on this page, so the
 * clock is normalised on the way out — the stored value is the timetable
 * module's to fix.
 */
export const fmtTime = (t) => {
  const s = String(t || '').trim();
  if (!s) return '';
  const [h, m = '00'] = s.split(':');
  const hour = Number(h);
  if (!Number.isFinite(hour)) return s;
  return `${String(hour).padStart(2, '0')}:${m.slice(0, 2)}`;
};

export const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

// ── Frame ────────────────────────────────────────────────────────────────────

export const Crumbs = ({ base, name }) => (
  <div className="breadcrumb">
    <Link to={base}>Student Analytics</Link>
    <span aria-hidden>›</span>
    <span>{name || 'Student'}</span>
  </div>
);

/**
 * Who this is.
 *
 * The mockup for this page carries a motivational quote in the corner. It is
 * not data about the student, and this is the screen an administrator opens to
 * answer a question about one — so the room goes to the facts instead.
 */
export const Identity = ({ general, year, roles }) => {
  const s = general.student;
  const p = general.profile;
  const pl = general.placement;
  const address = [p.address, p.city, p.state, p.pincode, p.country].filter(Boolean).join(', ');

  return (
    <header className="card sdid">
      <div className="sdid__who">
        <Avatar name={s.name} src={s.profileImage} size={72} />
        <div className="sdid__name">
          <h1>{s.name}</h1>
          <p>
            {`${pl.className} ${pl.sectionName}`.trim() || 'No section'}
            <span aria-hidden> · </span>
            {p.admissionNumber ? `Admission ${p.admissionNumber}` : 'No admission number'}
            {p.rollNumber ? <><span aria-hidden> · </span>{`Roll ${p.rollNumber}`}</> : null}
          </p>
          <div className="sdid__tags">
            {s.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}
            {year ? <Badge variant="muted">{year.yearName}</Badge> : null}
            {(roles || []).map((r) => <Badge key={r} variant="primary">{r}</Badge>)}
          </div>
        </div>
      </div>

      <ul className="sdid__facts">
        <Contact icon="mail" value={s.email} empty="No email" />
        <Contact icon="phone" value={s.phone} empty="No phone number" />
        <Contact icon="mapPin" value={address} empty="No address on file" />
        <Contact icon="calendar" value={p.dob ? `${fmtDate(p.dob)}${p.age != null ? ` · ${p.age} years` : ''}` : ''}
          empty="No date of birth" />
      </ul>
    </header>
  );
};

const Contact = ({ icon, value, empty }) => (
  <li>
    <Icon name={icon} size={15} />
    {value ? <span>{value}</span> : <span className="ed-none">{empty}</span>}
  </li>
);

export const Avatar = ({ name, src, size = 40 }) => (
  src
    ? <img className="sdav" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : (
      <span className="sdav sdav--mark" style={{ width: size, height: size, fontSize: size * 0.36 }}>
        {(name || '?').charAt(0).toUpperCase()}
      </span>
    )
);

/** The module tabs, in the order a school reads a student. */
export const TabStrip = ({ tabs, active, onPick }) => (
  <nav className="sdtabs" aria-label="Student sections">
    {tabs.map((t) => (
      <button key={t.key} type="button" onClick={() => onPick(t.key)}
        className={`sdtab${active === t.key ? ' is-on' : ''}`} aria-pressed={active === t.key}>
        <Icon name={t.icon} size={15} /> {t.label}
      </button>
    ))}
  </nav>
);

// ── Figures ──────────────────────────────────────────────────────────────────

/**
 * A headline figure.
 *
 * `value == null` renders the `empty` sentence instead of a number — see the
 * file header. `onClick` turns the tile into the jump to the tab behind it.
 */
export const Tile = ({ icon, tone = 'indigo', value, unit, label, caption, empty = 'No data yet', onClick }) => {
  const body = (
    <>
      <span className={`sdtile__icon tint-${tone}`}><Icon name={icon} size={20} /></span>
      <span className="sdtile__body">
        <span className="sdtile__label">{label}</span>
        {value == null
          ? <span className="sdtile__none">{empty}</span>
          : <span className="sdtile__value">{value}{unit ? <small>{unit}</small> : null}</span>}
        {caption ? <span className="sdtile__cap">{caption}</span> : null}
      </span>
      {onClick ? <Icon name="arrowRight" size={15} /> : null}
    </>
  );
  return onClick
    ? <button type="button" className="sdtile sdtile--go" onClick={onClick}>{body}</button>
    : <div className="sdtile">{body}</div>;
};

export const Tiles = ({ children }) => <div className="sdtiles">{children}</div>;

export const Panel = ({ icon, tone = 'indigo', title, subtitle, wide, children }) => (
  <section className={`card sdpanel${wide ? ' sdpanel--wide' : ''}`}>
    <header className="sdpanel__head">
      {icon ? <span className={`sdpanel__icon tint-${tone}`}><Icon name={icon} size={17} /></span> : null}
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </header>
    <div className="sdpanel__body">{children}</div>
  </section>
);

export const Grid = ({ cols = 'auto', children }) => (
  <div className={`sdgrid sdgrid--${cols}`}>{children}</div>
);

/** Nothing recorded is not zero — say which one it is, and why it is empty. */
export const NoData = ({ icon = 'files', title, hint }) => (
  <div className="sdnone">
    <Icon name={icon} size={22} />
    <p>{title}</p>
    {hint ? <span>{hint}</span> : null}
  </div>
);

export const Fact = ({ label, value, empty = '—' }) => (
  <div className="sdfact">
    <span className="sdfact__k">{label}</span>
    <span className="sdfact__v">{value || value === 0 ? value : <span className="ed-none">{empty}</span>}</span>
  </div>
);

/**
 * A part-to-whole bar.
 *
 * 2px of the page shows between segments rather than a border, so two fills are
 * separated without introducing a third colour. Every segment is named and
 * counted underneath — colour is never the only channel.
 */
export const Split = ({ segments, unit = '' }) => {
  const total = segments.reduce((n, s) => n + (Number(s.value) || 0), 0);
  if (!total) return null;
  return (
    <div className="sdsplit">
      <div className="sdsplit__bar">
        {segments.filter((s) => s.value > 0).map((s) => (
          <span key={s.label} style={{ flex: s.value, background: s.color }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <ul className="sdsplit__key">
        {segments.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{s.display != null ? s.display : `${s.value}${unit}`}</b>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** A single proportion, with the number that made it beside the bar. */
export const Meter = ({ value, label, right, tone }) => {
  const t = tone || toneForPercent(value);
  return (
    <div className="sdmeter">
      <div className="sdmeter__top">
        <span>{label}</span>
        <b style={{ color: toneColor[t] }}>{right != null ? right : `${value ?? 0}%`}</b>
      </div>
      <div className="sdmeter__bar">
        <i style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%`, background: toneColor[t] }} />
      </div>
    </div>
  );
};

export const Pct = ({ value, empty = '—' }) => (
  value == null
    ? <span className="ed-none">{empty}</span>
    : <b style={{ color: toneColor[toneForPercent(value)] }}>{value}%</b>
);

// ── Tables ───────────────────────────────────────────────────────────────────

/**
 * A table that says so when it is empty.
 *
 * `cols` are `{ key, label, width, render, align }`. Cells that come back blank
 * print an em dash rather than leaving a hole in the row.
 */
export const DataTable = ({ cols, rows, empty = 'Nothing recorded yet', emptyHint, emptyIcon }) => {
  if (!rows?.length) return <NoData icon={emptyIcon} title={empty} hint={emptyHint} />;
  return (
    <div className="table-wrap">
      <table className="table sdtable">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}
                className={c.align === 'right' ? 'sdta-r' : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r._id || `${i}`}>
              {cols.map((c) => {
                const v = c.render ? c.render(r, i) : r[c.key];
                return (
                  <td key={c.key} className={c.align === 'right' ? 'sdta-r' : undefined}>
                    {v === '' || v == null ? <span className="ed-none">—</span> : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** A long list, cut to a readable length until somebody asks for the rest. */
export const ShowMore = ({ rows, initial = 8, children, noun = 'more' }) => {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, initial);
  return (
    <>
      {children(shown)}
      {rows.length > initial && (
        <button type="button" className="sdmore" onClick={() => setOpen((v) => !v)}>
          {open ? 'Show fewer' : `Show all ${rows.length} ${noun}`}
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
        </button>
      )}
    </>
  );
};

// ── Attendance calendar ──────────────────────────────────────────────────────

const STATUS_TONE = { present: VIZ.good, late: VIZ.warn, absent: VIZ.bad };
const WEEK_HEAD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * One month of marked days.
 *
 * Only days the register was actually marked on are coloured. An unmarked day
 * is left blank rather than shaded as present — the school not marking a day is
 * not the same as the student being there, and the legend says so.
 */
export const MonthCalendar = ({ month, byDate, onPrev, onNext, canPrev, canNext }) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  return (
    <div className="sdcal">
      <div className="sdcal__head">
        <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Previous month">
          <Icon name="chevronLeft" size={16} />
        </button>
        <b>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b>
        <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next month">
          <Icon name="chevronRight" size={16} />
        </button>
      </div>

      <div className="sdcal__grid" role="grid">
        {WEEK_HEAD.map((d) => <span key={d} className="sdcal__dow">{d}</span>)}
        {cells.map((d, i) => {
          if (d == null) return <span key={`p${i}`} className="sdcal__pad" />;
          const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const rec = byDate[key];
          const color = rec ? STATUS_TONE[rec.status] : null;
          return (
            <span key={key} className={`sdcal__day${rec ? ' is-marked' : ''}`}
              title={rec ? `${d} — ${titleCase(rec.status)}${rec.remarks ? ` · ${rec.remarks}` : ''}` : undefined}>
              {d}
              {color ? <i style={{ background: color }} /> : null}
            </span>
          );
        })}
      </div>

      <ul className="sdcal__key">
        <li><i style={{ background: VIZ.good }} />Present</li>
        <li><i style={{ background: VIZ.warn }} />Late</li>
        <li><i style={{ background: VIZ.bad }} />Absent</li>
        <li><i className="is-blank" />Not marked</li>
      </ul>
    </div>
  );
};

// ── Timetable grid ───────────────────────────────────────────────────────────

/**
 * The week, as it is actually taught.
 *
 * Built from the timetable's own period structure, so a break sits in the row
 * the school put it in rather than being drawn wherever a gap happens to fall.
 * The grid scrolls inside itself; the page never scrolls sideways.
 */
export const WeekGrid = ({ days, periods, entries, today }) => {
  const at = {};
  entries.forEach((e) => { at[`${e.day}|${e.period}`] = e; });

  return (
    <div className="sdweek-wrap">
      <table className="sdweek">
        <thead>
          <tr>
            <th className="sdweek__time">Time</th>
            {days.map((d) => (
              <th key={d} className={d === today ? 'is-today' : undefined}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            p.isRecess
              ? (
                <tr key={`r${p.period}`} className="sdweek__break">
                  <td colSpan={days.length + 1}>
                    {p.recessName}
                    {p.startTime ? ` · ${fmtTime(p.startTime)}–${fmtTime(p.endTime)}` : ''}
                  </td>
                </tr>
              )
              : (
                <tr key={p.period}>
                  <th className="sdweek__time">
                    <b>Period {p.period}</b>
                    {p.startTime ? <small>{fmtTime(p.startTime)}–{fmtTime(p.endTime)}</small> : null}
                  </th>
                  {days.map((d) => {
                    const e = at[`${d}|${p.period}`];
                    return (
                      <td key={d} className={d === today ? 'is-today' : undefined}>
                        {e
                          ? (
                            <span className="sdslot">
                              <b>{e.subject || 'Subject'}</b>
                              {e.teacher ? <small>{e.teacher}</small> : null}
                              {e.room ? <em>{e.room}</em> : null}
                            </span>
                          )
                          : <span className="sdslot sdslot--free">Free</span>}
                      </td>
                    );
                  })}
                </tr>
              )
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Small pieces ─────────────────────────────────────────────────────────────

export const StatusBadge = ({ status, map }) => {
  const s = String(status || '').toLowerCase();
  const variant = map[s] || 'muted';
  return <Badge variant={variant}>{titleCase(s) || '—'}</Badge>;
};

/** A row of "what happened, when" — used for trips and for alerts. */
export const TimeLine = ({ items }) => (
  <ol className="sdline">
    {items.map((it, i) => (
      <li key={it.key || i}>
        <span className="sdline__dot" style={{ background: it.color || VIZ.accent }} />
        <div>
          <b>{it.title}</b>
          {it.sub ? <small>{it.sub}</small> : null}
        </div>
        {it.right ? <span className="sdline__right">{it.right}</span> : null}
      </li>
    ))}
  </ol>
);
