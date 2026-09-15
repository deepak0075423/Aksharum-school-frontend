/**
 * The pieces the admin Aptitude Exams page is built from.
 *
 * Its own frame, like documentParts.jsx and leaveParts.jsx: a marked header
 * with two actions, five tinted figures, an "upcoming" list beside an insights
 * panel, then one card holding the filter row, the list (table or cards) and
 * its footer. From documentParts it borrows the generic plumbing only — the
 * search field, the dropdown, the pager, the row menu and the drawer shell.
 *
 * Everything here is prefixed `apx` so nothing reaches another page.
 */
import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../components/ui/icons';
import { Empty, Spinner } from '../../components/ui/index';
import { VIZ, toneForPercent, toneColor } from '../analytics/palette';
import { Drawer, Pager, RowMenu } from './documentParts';
import { ReadinessList } from '../exams/readinessParts';

// ── What an exam is ─────────────────────────────────────────────────────────

/** Where an exam is in its life. The server decides the stage; this is how it looks. */
export const STAGES = {
  draft:     { label: 'Draft',     tone: 'amber'  },
  scheduled: { label: 'Scheduled', tone: 'blue'   },
  live:      { label: 'Live',      tone: 'green'  },
  completed: { label: 'Completed', tone: 'violet' },
  cancelled: { label: 'Cancelled', tone: 'slate'  },
};

export const STAGE_FILTERS = [
  { value: 'upcoming',       label: 'Upcoming' },
  { value: 'draft',          label: 'Draft' },
  { value: 'scheduled,live', label: 'Scheduled & live' },
  { value: 'scheduled',      label: 'Scheduled' },
  { value: 'live',           label: 'Live' },
  { value: 'completed',      label: 'Completed' },
  { value: 'cancelled',      label: 'Cancelled' },
];

export const PERIODS = [
  { value: 'year', label: 'This Year' },
  { value: '90d',  label: 'Last 90 Days' },
  { value: '30d',  label: 'Last 30 Days' },
  { value: 'all',  label: 'All Time' },
];

export const QUESTION_TYPE_LABEL = {
  mcq_single: 'Single choice', mcq_multiple: 'Multiple choice', true_false: 'True / False',
};

/**
 * The glyph beside an exam, read off its title and subject.
 *
 * Derived rather than stored: an exam has no "kind" column, and the admin
 * should not have to pick an icon to create one. Whole words only — a
 * substring test on "bio" would also catch "biography".
 */
const LOOKS = [
  { test: /\b(math|maths|mathematics|quant\w*|arithmetic|numer\w*|algebra|geometry)\b/i, icon: 'calculator', tone: 'green'  },
  { test: /\b(english|verbal|language|hindi|grammar|reading|vocabulary|comprehension|sanskrit)\b/i, icon: 'bookOpen', tone: 'purple' },
  { test: /\b(science|physics|chemistry|biology|bio|chem|evs)\b/i,                    icon: 'flask',      tone: 'blue'   },
  { test: /\b(logic\w*|reason\w*|puzzle\w*|critical|iq|brain)\b/i,                    icon: 'brain',      tone: 'pink'   },
];
export function examLook(exam) {
  const text = `${exam?.title || ''} ${exam?.subjectName || exam?.subject?.subjectName || ''}`;
  return LOOKS.find((l) => l.test.test(text)) || { icon: 'chart', tone: 'orange' };
}

// ── Dates ────────────────────────────────────────────────────────────────────

// A fixed month table — Intl renders September as "Sept", one character wider
// than every other month (see documentParts.fmtDate).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The exam's calendar day, as it was entered. `examDate` is UTC midnight of
 * that day, so it is read off the ISO string — local getters would put an IST
 * exam on the previous day for anyone west of Greenwich.
 */
export function fmtExamDay(exam) {
  if (!exam?.examDate) return '—';
  const [y, m, d] = new Date(exam.examDate).toISOString().slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "09:30" → "09:30 AM" — the wall-clock time the exam was set for. */
export function fmtClock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return '—';
  const h = Number(m[1]);
  return `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * The exam's window as one compact range — "3:05 – 4:05 PM", with the half
 * named once when both ends share it. The facts strip puts this beside five
 * other values, and "03:05 PM – 04:05 PM" was long enough to overflow its cell.
 */
export function fmtClockRange(exam) {
  const from = fmtClock(exam?.startTime);
  const to = fmtEndClock(exam);
  if (from === '—' || to === '—') return '—';
  const half = from.slice(-2);
  const trim = (t) => t.replace(/^0/, '');
  return half === to.slice(-2)
    ? `${trim(from.slice(0, -3))} – ${trim(to)}`
    : `${trim(from)} – ${trim(to)}`;
}

export function fmtEndClock(exam) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(exam?.startTime || '');
  if (!m) return '—';
  const mins = Number(m[1]) * 60 + Number(m[2]) + (Number(exam.duration) || 0);
  const h = Math.floor(mins / 60) % 24;
  return fmtClock(`${h}:${String(mins % 60).padStart(2, '0')}`);
}

export const fmtShortDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : `${x.getDate()} ${MONTHS[x.getMonth()]}`;
};

export const fmtLongDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '—' : `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Small marks ──────────────────────────────────────────────────────────────

export const ExamMark = ({ exam, size = 40 }) => {
  const look = examLook(exam);
  return (
    <span className={`apxmark tint-${look.tone}`} style={{ width: size, height: size }} aria-hidden>
      <Icon name={look.icon} size={Math.round(size * 0.5)} />
    </span>
  );
};

export const StagePill = ({ stage }) => {
  const s = STAGES[stage] || STAGES.draft;
  return (
    <span className={`apxpill apxpill--${s.tone}`}>
      {stage === 'live' && <span className="apxpill__dot" aria-hidden />}
      {s.label}
    </span>
  );
};

/** Who the exam is for. The full section list rides in the tooltip. */
export const Audience = ({ exam, chip = false }) => {
  const a = exam?.audience;
  if (!a || !a.items?.length) return <span className="apxnone">—</span>;
  return (
    <span className={chip ? 'apxchip' : 'apxaud'} title={a.items.join(', ')}>
      {chip ? a.label : a.short}
    </span>
  );
};

/** Where the results stand, once there are any. */
export const ResultsCell = ({ exam }) => {
  const r = exam?.results || { state: 'none' };
  switch (r.state) {
    case 'released':
      return (
        <span className="apxres">
          <strong>{r.average == null ? '—' : `${r.average}%`}</strong>
          <small className="apxres__ok">Released</small>
        </span>
      );
    case 'scheduled':
      return (
        <span className="apxres">
          <strong>{r.average == null ? '—' : `${r.average}%`}</strong>
          <small>Out {fmtShortDate(r.publishDate)}</small>
        </span>
      );
    case 'awaiting':
      return (
        <span className="apxres">
          <strong>{r.average == null ? '—' : `${r.average}%`}</strong>
          <small className="apxres__wait">Awaiting release</small>
        </span>
      );
    case 'withheld':
      return <span className="apxres"><small className="apxres__bad">Withheld</small></span>;
    default:
      return <span className="apxnone">—</span>;
  }
};

/**
 * How many students it reaches, and — once it has opened — how many sat it.
 * The roster counts students who can sit it now plus those who already did.
 */
export const Participants = ({ exam, compact = false }) => {
  const sat = ['live', 'completed'].includes(exam.stage);
  return (
    <span className="apxpart">
      {compact && <Icon name="users" size={16} />}
      <span>
        <span className="apxpart__n">{sat ? `${exam.submitted} / ${exam.eligible}` : exam.eligible}</span>
        {!compact && sat && <small>submitted</small>}
      </span>
    </span>
  );
};

// ── Page frame ───────────────────────────────────────────────────────────────

export const ExamHero = ({
  actions,
  title = 'Aptitude Exams',
  subtitle = 'Create, schedule and monitor aptitude assessments across the school',
}) => (
  <header className="apxhero">
    <span className="apxhero__mark">
      {/* Filled, unlike the outline set — at 30px the stroked bars read as a hairline sketch. */}
      <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="3.5" y="11" width="4.2" height="9.5" rx="1.4" />
        <rect x="9.9" y="4" width="4.2" height="16.5" rx="1.4" />
        <rect x="16.3" y="8" width="4.2" height="12.5" rx="1.4" />
      </svg>
    </span>
    <div className="apxhero__text">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    {actions && <div className="apxhero__acts">{actions}</div>}
  </header>
);

export const ExamStats = ({ children }) => {
  // Four tiles sit four across rather than leaving a fifth slot empty.
  const n = React.Children.toArray(children).filter(Boolean).length;
  return <div className={`apxstats${n === 4 ? ' apxstats--4' : ''}`}>{children}</div>;
};

/**
 * One figure, and the one thing worth knowing about it.
 *
 * `chip` is `{ text, tone, arrow }` — a change against last year where that is
 * a fair comparison, or a fact about now where it is not: last year's drafts
 * say nothing about this year's, so the Drafts tile says how many still need
 * questions instead.
 */
export const ExamStat = ({ icon, tone, value, label, chip, note, onClick, on }) => {
  const body = (
    <>
      <span className={`apxstat__icon apxstat__icon--${tone}`}><Icon name={icon} size={24} /></span>
      <span className="apxstat__body">
        <span className="apxstat__value">{value ?? '—'}</span>
        <span className="apxstat__label">{label}</span>
        {(chip || note) && (
          <span className="apxstat__meta">
            {chip && (
              <span className={`apxstat__chip apxstat__chip--${chip.tone || 'flat'}`}>
                {chip.arrow && <Icon name={chip.arrow} size={12} strokeWidth={2.4} />}
                {chip.text}
              </span>
            )}
            {note && <small>{note}</small>}
          </span>
        )}
      </span>
    </>
  );
  const cls = `apxstat apxstat--${tone}${on ? ' is-on' : ''}`;
  return onClick
    ? <button type="button" className={cls} onClick={onClick} aria-pressed={!!on}>{body}</button>
    : <div className={cls}>{body}</div>;
};

/** A card with a marked, titled header. */
export const Panel = ({ icon, title, subtitle, action, className = '', children, id }) => (
  <section className={`card apxpanel ${className}`} id={id}>
    <header className="apxpanel__head">
      <span className="apxpanel__mark"><Icon name={icon} size={20} /></span>
      <div className="apxpanel__title">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="apxpanel__act">{action}</div>}
    </header>
    {children}
  </section>
);

// ── Upcoming & active ────────────────────────────────────────────────────────

export function UpcomingList({ rows, loading, onView, onEdit, menu, onCreate }) {
  if (loading) return <div className="apxloading"><Spinner /></div>;
  if (!rows?.length) {
    return (
      <div className="apxupcoming__empty">
        <Icon name="calendar" size={28} />
        <p>Nothing scheduled. Exams you create and publish appear here until they close.</p>
        <button type="button" className="btn btn-secondary" onClick={onCreate}>
          <Icon name="plus" size={15} /> Create Exam
        </button>
      </div>
    );
  }
  return (
    <ul className="apxupcoming">
      {rows.map((r) => (
        <li key={r._id} className="apxup" data-focus-id={r._id}>
          <div className="apxup__who">
            <ExamMark exam={r} size={42} />
            <span className="apxup__name">
              <button type="button" className="apxlink" onClick={() => onView(r)} title={r.title}>{r.title}</button>
              <small>{r.subjectName || 'General Aptitude'}</small>
            </span>
          </div>
          <span className="apxup__aud"><Audience exam={r} chip /></span>
          <span className="apxup__when">
            <Icon name="calendar" size={17} />
            <span>
              <strong>{fmtExamDay(r)}</strong>
              <small>{fmtClock(r.startTime)}</small>
            </span>
          </span>
          <span className="apxup__fact"><Icon name="clock" size={17} />{r.duration} min</span>
          <span className="apxup__fact"><Participants exam={r} compact /></span>
          <span className="apxup__stage"><StagePill stage={r.stage} /></span>
          <span className="apxup__acts">
            {r.stage === 'draft'
              ? <button type="button" className="btn btn-secondary apxup__btn" onClick={() => onEdit(r)}>Edit</button>
              : <button type="button" className="btn btn-secondary apxup__btn" onClick={() => onView(r)}>View</button>}
            <RowMenu>{menu(r)}</RowMenu>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Insights ─────────────────────────────────────────────────────────────────

/**
 * One ratio against its whole, as a ring.
 *
 * The track is the fill's own hue, lightened — a meter reads as one scale, not
 * two colours. `color` carries the reading; the figure and label beside it
 * carry the number, so nothing depends on the hue alone.
 */
export const RingMeter = ({ value, color, label, sub }) => {
  const r = 21;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="apxring">
      <svg width="56" height="56" viewBox="0 0 56 56" role="img"
        aria-label={`${label}: ${value == null ? 'no data' : `${value}%`}`}>
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeOpacity=".16" strokeWidth="7" />
        {value != null && (
          <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 28 28)" />
        )}
      </svg>
      <div className="apxring__text">
        <strong>{value == null ? '—' : `${value}%`}</strong>
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
};

const clip = (t, width) => (t.length > width ? `${t.slice(0, width - 1)}…` : t);

/**
 * A title over at most two lines of about `width` characters, split where the
 * two lines come out most even — "Maths / Term 1", not "Maths Term / 1".
 */
function twoLines(text, width = 12) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const full = words.join(' ');
  if (full.length <= width || words.length < 2) return [clip(full, width)];
  let best = null;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const worst = Math.max(a.length, b.length);
    if (!best || worst < best.worst) best = { a, b, worst };
  }
  return [clip(best.a, width), clip(best.b, width)];
}

/**
 * Class average for the most recent closed exams — one series, so no legend;
 * the panel heading names it. Columns grow from one baseline against a fixed
 * 0–100 scale (a percentage has a natural ceiling, and a scale that stretched
 * to the tallest bar would make 40% look like a triumph). Values sit on the
 * caps in ink; the bar carries the colour.
 */
/**
 * The rendered width of an element, kept current as the layout changes.
 *
 * A callback ref, not a ref object: the chart often mounts empty (no data yet)
 * and only renders its measured box later, and an effect keyed on a ref object
 * runs once while that box does not exist — it never measured anything and the
 * chart stayed at its fallback width.
 */
function useWidth(fallback) {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!el) return undefined;
    setWidth(Math.round(el.getBoundingClientRect().width) || fallback);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, fallback]);
  return [setEl, width];
}

/**
 * Single-series columns growing from one baseline — the insights panel's
 * recent averages, a teacher's score bands, a parent's trend. Values sit on
 * the caps in ink; the bar carries the colour. `max` fixes the scale (a
 * percentage has a natural ceiling; a scale stretched to the tallest bar would
 * make 40% look like a triumph).
 */
export function ColumnChart({ items, max = 100, ticks = [0, 25, 50, 75, 100], ariaLabel, empty, format = (v) => v }) {
  // Drawn at the container's real pixel width: a fixed viewBox stretched to a
  // full-width panel scales the axis text up with it.
  const [ref, measured] = useWidth(320);
  if (!items?.length) return <p className="apxchart__empty">{empty}</p>;
  const W = Math.max(240, measured), H = 178;
  const left = 30, right = 6, top = 18, bottom = 34;
  const plotW = W - left - right, plotH = H - top - bottom;
  const band = plotW / items.length;
  const barW = Math.min(24, band * 0.5);
  const y = (v) => top + plotH - (Math.max(0, Math.min(max, v)) / (max || 1)) * plotH;

  return (
    <div ref={ref} className="apxchart__box">
    <svg className="apxchart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth="1" />
          <text x={left - 6} y={y(t) + 3} textAnchor="end" className="apxchart__tick">{t}</text>
        </g>
      ))}
      {items.map((it, i) => {
        const cx = left + band * i + band / 2;
        const top0 = y(it.value);
        const h = top + plotH - top0;
        const rr = Math.min(4, h);
        const x0 = cx - barW / 2;
        // Rounded at the data end, square at the baseline.
        const d = h <= 0
          ? ''
          : `M${x0},${top + plotH} V${top0 + rr} Q${x0},${top0} ${x0 + rr},${top0} H${x0 + barW - rr} Q${x0 + barW},${top0} ${x0 + barW},${top0 + rr} V${top + plotH} Z`;
        const [l1, l2] = twoLines(it.label, Math.max(10, Math.floor(band / 6.2)));
        return (
          <g key={it.key} className="apxchart__bar">
            <title>{it.title}</title>
            <rect x={cx - band / 2} y={top} width={band} height={plotH + bottom} fill="transparent" />
            {d && <path d={d} fill={VIZ.accent} />}
            <text x={cx} y={top0 - 5} textAnchor="middle" className="apxchart__val">{format(it.value)}</text>
            <text x={cx} y={H - bottom + 14} textAnchor="middle" className="apxchart__lab">{l1}</text>
            {l2 && <text x={cx} y={H - bottom + 26} textAnchor="middle" className="apxchart__lab">{l2}</text>}
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/** A tidy upper bound and gridlines for a count axis: 7 → 8 with 0/2/4/6/8. */
export function countScale(maxValue) {
  const m = Math.max(1, Number(maxValue) || 0);
  const step = m <= 4 ? 1 : m <= 10 ? 2 : m <= 25 ? 5 : m <= 50 ? 10 : Math.ceil(m / 50) * 10;
  const max = Math.ceil(m / step) * step;
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) };
}

export function ScoreColumns({ items }) {
  return (
    <ColumnChart
      items={(items || []).map((it) => ({
        key: it._id, label: it.title, value: it.average,
        title: `${it.title} — ${it.average}% average · ${plural(it.submitted, 'submission')}`,
      }))}
      ariaLabel={`Average score of the ${items?.length || 0} most recent closed exams`}
      empty="No closed exams with submissions in this period yet."
    />
  );
}

export function InsightsPanel({ data, loading, period, onPeriod }) {
  const rate = data?.completion?.rate ?? null;
  return (
    <Panel icon="trending" title="Exam Insights" className="apxinsights"
      action={
        <select className="form-control apxperiod" value={period} onChange={(e) => onPeriod(e.target.value)}
          aria-label="Insights period">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      }>
      {loading && !data
        ? <div className="apxloading"><Spinner /></div>
        : (
          <div className="apxinsights__body">
            <div className="apxrings">
              <RingMeter value={rate} color={toneColor[toneForPercent(rate)]} label="Completion Rate"
                sub={data?.completion?.eligible ? `${data.completion.submitted} of ${data.completion.eligible}` : 'no closed exams'} />
              <RingMeter value={data?.average ?? null} color={VIZ.accent} label="Average Score"
                sub={data?.exams ? plural(data.exams, 'closed exam') : 'no closed exams'} />
            </div>
            <h3 className="apxinsights__sub">Average Score (Recent Exams)</h3>
            <ScoreColumns items={data?.recent} />
          </div>
        )}
    </Panel>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

const fmtInputDay = (ymd) => {
  const [, m, d] = String(ymd).split('-');
  return m ? `${Number(d)} ${MONTHS[Number(m) - 1]}` : '';
};

/**
 * The date filter: one button, like the other controls in the row, opening a
 * small panel with From and To. Either end may be left open. Each change
 * applies as it is made — Done only closes the panel.
 */
export function DateRange({ from, to, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const set = from || to;
  const label = set ? `${from ? fmtInputDay(from) : 'Any'} – ${to ? fmtInputDay(to) : 'Any'}` : 'Select date range';

  return (
    <div className="apxrange" ref={ref}>
      <button type="button" className={`apxrange__btn${set ? ' is-on' : ''}`} onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-haspopup="dialog">
        <Icon name="calendar" size={16} />
        <span>{label}</span>
      </button>
      {open && (
        <div className="apxrange__pop" role="dialog" aria-label="Exam date range">
          <label>
            <span>From</span>
            <input type="date" className="form-control" value={from} max={to || undefined}
              onChange={(e) => onChange({ from: e.target.value, to })} />
          </label>
          <label>
            <span>To</span>
            <input type="date" className="form-control" value={to} min={from || undefined}
              onChange={(e) => onChange({ from, to: e.target.value })} />
          </label>
          <div className="apxrange__foot">
            <button type="button" className="btn btn-secondary btn-sm" disabled={!set}
              onClick={() => onChange({ from: '', to: '' })}>Clear</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

export const ViewSwitch = ({ value, onChange }) => (
  <div className="apxview" role="group" aria-label="View">
    {[['list', 'list', 'List'], ['grid', 'grid', 'Card']].map(([v, icon, label]) => (
      <button key={v} type="button" className={`apxview__btn${value === v ? ' is-on' : ''}`}
        onClick={() => onChange(v)} aria-pressed={value === v}>
        <Icon name={icon} size={16} /> {label}
      </button>
    ))}
  </div>
);

// ── Row actions ──────────────────────────────────────────────────────────────

export const IconAction = ({ icon, label, onClick, disabled }) => (
  <button type="button" className="apxact" onClick={onClick} title={label} aria-label={label} disabled={disabled}>
    <Icon name={icon} size={17} />
  </button>
);

const editBlockedReason = (r) => (r.stage === 'draft' ? null
  : r.stage === 'scheduled' ? 'Move it back to draft to edit'
    : 'Only a draft can be edited');

export const RowButtons = ({ row, onView, onEdit, onDuplicate, menu, canEdit = () => true }) => {
  const blocked = canEdit(row) ? editBlockedReason(row) : 'Only the teacher who wrote it can edit it';
  return (
    <div className="apxacts">
      <IconAction icon="eye" label="View exam" onClick={() => onView(row)} />
      <IconAction icon="pencil" label={blocked || 'Edit exam'} disabled={!!blocked} onClick={() => onEdit(row)} />
      {onDuplicate && <IconAction icon="copy" label="Duplicate exam" onClick={() => onDuplicate(row)} />}
      <RowMenu>{menu(row)}</RowMenu>
    </div>
  );
};

// ── The list ─────────────────────────────────────────────────────────────────

const COLUMNS = ['Exam', 'Subject', 'Classes', 'Scheduled', 'Duration', 'Participants', 'Status', 'Results', 'Actions'];

export function ExamTable({ rows, loading, empty, onView, onEdit, onDuplicate, menu, tag, canEdit }) {
  if (loading) return <div className="apxloading"><Spinner /></div>;
  if (!rows.length) return empty;
  return (
    <div className="table-wrap">
      <table className="table apxtable">
        <thead>
          <tr>{COLUMNS.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} data-focus-id={r._id}>
              <td>
                <button type="button" className="apxtitle" onClick={() => onView(r)}>
                  <ExamMark exam={r} size={34} />
                  <span>
                    {r.title}
                    {tag?.(r) && <small className="apxtag">{tag(r)}</small>}
                  </span>
                </button>
              </td>
              <td className="apxmuted">{r.subjectName || 'General Aptitude'}</td>
              <td><Audience exam={r} /></td>
              <td className="apxwhen">
                <span>{fmtExamDay(r)}</span>
                <small>{fmtClock(r.startTime)}</small>
              </td>
              <td className="apxnowrap">{r.duration} min</td>
              <td><Participants exam={r} /></td>
              <td><StagePill stage={r.stage} /></td>
              <td><ResultsCell exam={r} /></td>
              <td><RowButtons row={r} onView={onView} onEdit={onEdit} onDuplicate={onDuplicate} menu={menu} canEdit={canEdit} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExamGrid({ rows, loading, empty, onView, onEdit, onDuplicate, menu, canEdit }) {
  if (loading) return <div className="apxloading"><Spinner /></div>;
  if (!rows.length) return empty;
  return (
    <div className="apxgrid">
      {rows.map((r) => (
        <article key={r._id} className="apxcard" data-focus-id={r._id}>
          <header className="apxcard__head">
            <ExamMark exam={r} size={40} />
            <StagePill stage={r.stage} />
          </header>
          <button type="button" className="apxcard__title" onClick={() => onView(r)}>{r.title}</button>
          <p className="apxcard__sub">{r.subjectName || 'General Aptitude'}</p>
          <dl className="apxcard__meta">
            <div><dt>Classes</dt><dd><Audience exam={r} chip /></dd></div>
            <div><dt>Scheduled</dt><dd className="apxwhen"><span>{fmtExamDay(r)}</span><small>{fmtClock(r.startTime)}</small></dd></div>
            <div><dt>Duration</dt><dd>{r.duration} min</dd></div>
            <div><dt>Participants</dt><dd><Participants exam={r} /></dd></div>
            <div><dt>Questions</dt><dd>{r.questionCount} / {r.totalQuestions}</dd></div>
            <div><dt>Results</dt><dd><ResultsCell exam={r} /></dd></div>
          </dl>
          <footer className="apxcard__foot">
            <RowButtons row={r} onView={onView} onEdit={onEdit} onDuplicate={onDuplicate} menu={menu} canEdit={canEdit} />
          </footer>
        </article>
      ))}
    </div>
  );
}

/** "Showing 1 to 5 of 12 exams", and the pager — the sentence stays even on one page. */
export const ExamFoot = ({ page, pages, total, limit, count, onPage }) => {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = (page - 1) * limit + count;
  return (
    <div className="apxfoot">
      <span>{total === 0 ? 'No exams to show' : `Showing ${from} to ${to} of ${plural(total, 'exam')}`}</span>
      <Pager page={page} pages={pages} onPage={onPage} />
    </div>
  );
};

export const ExamEmpty = ({ filtered, onClear, onCreate }) => (
  <Empty
    icon={filtered ? '🔍' : '📝'}
    title={filtered ? 'No exams match these filters' : 'No aptitude exams yet'}
    message={filtered
      ? 'Try another status, subject, class or date range.'
      : 'Create an exam, add its questions, and publish it to the classes that should sit it.'}
    action={filtered
      ? <button type="button" className="btn btn-secondary" onClick={onClear}>Clear filters</button>
      : <button type="button" className="btn btn-primary" onClick={onCreate}><Icon name="plus" size={16} /> Create Exam</button>}
  />
);

// ── Detail drawer ────────────────────────────────────────────────────────────

const Field = ({ label, children }) => <div className="docfield"><dt>{label}</dt><dd>{children}</dd></div>;

const Warn = ({ children }) => (
  <p className="apxwarn"><Icon name="alert" size={15} />{children}</p>
);

const APPROVAL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

/**
 * One exam, beside the list. `exam` is the list row (shown at once); `detail`
 * is the fuller read that arrives a moment later — attempts, question types,
 * who signed the results off.
 */
export function ExamDrawer({ exam, detail, onClose, footer }) {
  if (!exam) return null;
  const x = detail && detail._id === exam._id ? detail : exam;
  const opened = ['live', 'completed'].includes(x.stage);
  const marksOff = x.questionCount > 0 && Math.abs((x.questionMarks || 0) - x.totalMarks) > 0.001;
  const att = detail?._id === exam._id ? detail.attempts : null;

  return (
    <Drawer open={!!exam} onClose={onClose}>
      <div className="docdrawer__head">
        <ExamMark exam={x} size={48} />
        <div className="docdrawer__id">
          <h3>{x.title}</h3>
          <div className="docdrawer__tags">
            <StagePill stage={x.stage} />
            <span className="apxchip">{x.subjectName || 'General Aptitude'}</span>
          </div>
        </div>
        <button type="button" className="docact" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="docdrawer__body">
        <section className="docdrawer__sec">
          <h4>Schedule</h4>
          <dl>
            <Field label="Date">{fmtExamDay(x)}</Field>
            <Field label="Time">{fmtClock(x.startTime)} – {fmtEndClock(x)}</Field>
            <Field label="Duration">{x.duration} minutes</Field>
            <Field label="Anti-cheat">Auto-submits after {plural(x.maxViolations || 3, 'tab switch', 'tab switches')}</Field>
          </dl>
        </section>

        <section className="docdrawer__sec">
          <h4>Audience</h4>
          <dl>
            <Field label="Sections">
              {x.audience?.items?.length
                ? <span className="apxchips">{x.audience.items.map((s) => <span key={s} className="apxchip">{s}</span>)}</span>
                : '—'}
            </Field>
            <Field label="Students">{plural(x.eligible, 'student')}</Field>
          </dl>
        </section>

        <section className="docdrawer__sec">
          <h4>Paper</h4>
          <dl>
            <Field label="Questions">{x.questionCount} of {x.totalQuestions}</Field>
            <Field label="Marks">{x.questionMarks || 0} assigned of {x.totalMarks}</Field>
            {detail?._id === exam._id && detail.questionTypes?.length > 0 && (
              <Field label="Types">
                {detail.questionTypes.map((t) => `${QUESTION_TYPE_LABEL[t.type] || t.type} ${t.n}`).join(' · ')}
              </Field>
            )}
          </dl>
          {x.stage === 'draft' && x.readiness && (
            <div className="apxdrawer__ready">
              <strong>{x.readiness.ready ? 'Ready to publish' : 'Before it can be published'}</strong>
              <ReadinessList readiness={x.readiness} dense />
            </div>
          )}
          {marksOff && x.stage !== 'draft' && (
            <Warn>
              The questions carry {x.questionMarks} marks but the exam is out of {x.totalMarks} — scores are
              worked out against {x.totalMarks}.
            </Warn>
          )}
        </section>

        {opened && (
          <section className="docdrawer__sec">
            <h4>Attempts</h4>
            {att ? (
              <dl>
                <Field label="Submitted">{att.submitted + att.auto_submitted} of {x.eligible}{att.auto_submitted ? ` (${att.auto_submitted} auto-submitted)` : ''}</Field>
                {att.in_progress > 0 && <Field label="In progress">{att.in_progress}</Field>}
                <Field label="Not attempted">{Math.max(0, x.eligible - x.attemptCount)}</Field>
                <Field label="Average">{x.averageScore == null ? '—' : `${x.averageScore}%`}</Field>
                {att.highest != null && <Field label="Highest / lowest">{att.highest} / {att.lowest} of {x.totalMarks}</Field>}
                {att.highest != null && <Field label="Passed">{att.passed} (pass mark {att.passMark})</Field>}
                {att.violations > 0 && <Field label="Violations">{att.violations} logged</Field>}
              </dl>
            ) : <div className="apxloading apxloading--sm"><Spinner /></div>}
          </section>
        )}

        {x.stage === 'completed' && (
          <section className="docdrawer__sec">
            <h4>Results</h4>
            <dl>
              <Field label="Status"><ResultsCell exam={x} /></Field>
              {detail?._id === exam._id && (
                <>
                  <Field label="Subject teacher">
                    {APPROVAL[detail.approval.subjectTeacher.status]}
                    {detail.approval.subjectTeacher.by ? ` · ${detail.approval.subjectTeacher.by}` : ''}
                  </Field>
                  <Field label="Final sign-off">
                    {APPROVAL[detail.approval.final.status]}
                    {detail.approval.final.by ? ` · ${detail.approval.final.by}, ${fmtLongDate(detail.approval.final.at)}` : ''}
                  </Field>
                </>
              )}
              {x.results?.reason && <Field label="Reason">{x.results.reason}</Field>}
            </dl>
          </section>
        )}

        <section className="docdrawer__sec">
          <h4>Record</h4>
          <dl>
            <Field label="Created by">{x.createdBy?.name || '—'}</Field>
            <Field label="Created on">{fmtLongDate(x.createdAt)}</Field>
          </dl>
        </section>
      </div>

      {footer && <div className="docdrawer__foot">{footer}</div>}
    </Drawer>
  );
}
