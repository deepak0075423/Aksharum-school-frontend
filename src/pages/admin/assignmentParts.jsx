/**
 * The pieces one opened document is built from.
 *
 * Documents.jsx is the shelf; DocumentDetail.jsx is one item off it, on four
 * tabs — what it is, who has handed work back, how the class did, and the
 * conversation hanging off it. Everything presentational lives here so the page
 * itself stays about loading and state.
 *
 * Charts use the app's validated palette (pages/analytics/palette.js) and its
 * rules: one accent for a single series, the status trio only for states, and
 * every status chart ships the same numbers as text beside it — the trio is
 * under 3:1 against the surface, so colour is never the only channel.
 *
 * Prefixed `ad` (assignment detail) so nothing here reaches another page.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  AreaChart, Area,
} from 'recharts';
import Icon from '../../components/ui/icons';
import { Spinner } from '../../components/ui/index';
import { VIZ } from '../analytics/palette';
import { FileMark, fileUrl, fmtSize, fmtDate, typeOf } from './documentParts';
import { usePageCrumbs } from '../../contexts/BreadcrumbContext';
import Tabs from '../../components/ui/Tabs';

export { fileUrl, fmtSize, fmtDate };

// ── Formatters ───────────────────────────────────────────────────────────────

/** "10 Sep 2026" over "10:30 AM" — the strip shows both, the table only the day. */
export const fmtTime = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime())
    ? ''
    : x.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
};

/** A span in words, longest unit first. Used for how long a submission took. */
export const fmtSpan = (fromISO, toISO) => {
  if (!fromISO || !toISO) return null;
  const ms = new Date(toISO) - new Date(fromISO);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'}${mins % 60 ? ` ${mins % 60} minutes` : ''}`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'}${hrs % 24 ? ` ${hrs % 24} hours` : ''}`;
};

export const ASSIGNMENT_TYPES = [
  { value: 'homework',  label: 'Homework' },
  { value: 'classwork', label: 'Classwork' },
  { value: 'project',   label: 'Project' },
  { value: 'practice',  label: 'Practice' },
  { value: 'lab',       label: 'Lab Work' },
  { value: 'reading',   label: 'Reading' },
];

export const assignmentTypeLabel = (v) => ASSIGNMENT_TYPES.find((t) => t.value === v)?.label || null;

/** What a student's row says. `missed` is "the date passed and nothing came". */
export const STATES = {
  submitted: { label: 'Submitted',     tone: 'yes'  },
  late:      { label: 'Late',          tone: 'warn' },
  pending:   { label: 'Pending',       tone: 'warn' },
  missed:    { label: 'Not Submitted', tone: 'bad'  },
};

export const StatePill = ({ state }) => {
  const s = STATES[state] || STATES.pending;
  return <span className={`adpill adpill--${s.tone}`}>{s.label}</span>;
};

// ── Header ───────────────────────────────────────────────────────────────────

/** Adds this assignment's own steps to the layout's breadcrumb. */
// eslint-disable-next-line no-unused-vars
export const Crumbs = ({ trail = [], here, home }) => {
  usePageCrumbs([...trail, { label: here }]);
  return null;
};

const STATUS_TONE = { active: 'yes', overdue: 'bad', archived: 'slate' };
const STATUS_TEXT = { active: 'Active', overdue: 'Overdue', archived: 'Archived' };

export const DetailHero = ({ doc, actions }) => (
  <header className="adhero">
    <FileMark file={doc.files?.[0]} size={56} />
    <div className="adhero__text">
      <h1>
        {doc.title}
        <span className={`adpill adpill--${STATUS_TONE[doc.status] || 'slate'}`}>
          {STATUS_TEXT[doc.status] || doc.status}
        </span>
      </h1>
      {doc.description ? <p>{doc.description}</p> : null}
    </div>
    <div className="adhero__acts">{actions}</div>
  </header>
);

/** The facts strip under the title. Cells with nothing to say are left out. */
export const MetaStrip = ({ items }) => (
  <div className="admeta">
    {items.filter((i) => i && i.value).map((i) => (
      <div className="admeta__cell" key={i.label}>
        <span className="admeta__icon"><Icon name={i.icon} size={17} /></span>
        <span className="admeta__body">
          <span className="admeta__label">{i.label}</span>
          <span className="admeta__value">{i.value}</span>
          {i.sub ? <span className="admeta__sub">{i.sub}</span> : null}
        </span>
      </div>
    ))}
  </div>
);

export const DetailTabs = ({ tabs, value, onChange }) => (
  <Tabs variant="line" items={tabs} value={value} onChange={onChange} label="Assignment" />
);

// ── The four tiles ───────────────────────────────────────────────────────────

/**
 * Submitted / Pending / Not Submitted / Total, over the whole roster.
 *
 * The bar under each figure is the same ratio as the percentage beside it, so
 * the four read as one split rather than four unrelated counts. They describe
 * the assignment and never move when the table below is filtered.
 */
export const StatTiles = ({ counts, percent, active, onPick }) => {
  const tiles = [
    { key: 'submitted', icon: 'checkCircle', tone: 'green',  label: 'Submitted',     value: counts.submitted, pct: percent.submitted, bar: VIZ.good },
    { key: 'pending',   icon: 'clock',       tone: 'amber',  label: 'Pending',       value: counts.pending,   pct: percent.pending,   bar: VIZ.warn },
    { key: 'missed',    icon: 'closeCircle', tone: 'red',    label: 'Not Submitted', value: counts.missed,    pct: percent.missed,    bar: VIZ.bad  },
    { key: '',          icon: 'users',       tone: 'indigo', label: 'Total Students', value: counts.total,    pct: percent.total,     bar: VIZ.accent },
  ];
  return (
    <div className="adtiles">
      {tiles.map((t) => {
        const body = (
          <>
            <span className={`adtile__icon tint-${t.tone}`}><Icon name={t.icon} size={22} /></span>
            <span className="adtile__body">
              <span className="adtile__top">
                <span className="adtile__value">{t.value ?? 0}</span>
                <span className="adtile__pct">{t.pct ?? 0}%</span>
              </span>
              <span className="adtile__label">{t.label}</span>
              <span className="adtile__sub">{t.key ? `${t.pct}% of ${counts.total} students` : 'On this assignment'}</span>
              <span className="adtile__bar">
                <span style={{ width: `${t.pct || 0}%`, background: t.bar }} />
              </span>
            </span>
          </>
        );
        if (!onPick || !t.key) return <div className="adtile" key={t.label}>{body}</div>;
        return (
          <button type="button" key={t.label} aria-pressed={active === t.key}
            className={`adtile${active === t.key ? ' is-on' : ''}`}
            onClick={() => onPick(active === t.key ? '' : t.key)}>
            {body}
          </button>
        );
      })}
    </div>
  );
};

// ── Panels ───────────────────────────────────────────────────────────────────

export const Panel = ({ title, subtitle, lead, right, children, className = '' }) => (
  <section className={`adpanel ${className}`.trim()}>
    {(title || right) && (
      <header className="adpanel__head">
        <div className="adpanel__title">
          {/* `subtitle` qualifies the title on the same line — "(Out of 50)".
              `lead` is a sentence, and goes under it so the controls opposite
              still fit on the title's own row. */}
          <h2>{title}{subtitle ? <small> {subtitle}</small> : null}</h2>
          {lead ? <p>{lead}</p> : null}
        </div>
        {right}
      </header>
    )}
    {children}
  </section>
);

export const Blank = ({ text = 'Nothing recorded yet' }) => <p className="adblank">{text}</p>;

export const Loading = () => <div className="adloading"><Spinner /></div>;

// ── Charts ───────────────────────────────────────────────────────────────────

const Tip = ({ active, payload, label, unit = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="adtip">
      <div className="adtip__x">{payload[0]?.payload?.name || label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="adtip__row">
          <span style={{ background: p.color || p.fill }} />
          {p.name}: <b>{p.value}{unit}</b>
        </div>
      ))}
    </div>
  );
};

/**
 * The submission split.
 *
 * Submitted / Pending / Not Submitted are *states*, so they wear the status
 * trio rather than a categorical ramp. That trio sits under 3:1 against a white
 * surface, which obliges relief: the legend beside it carries every label, its
 * count and its share, so nobody has to read the ring by colour.
 */
export const SubmissionDonut = ({ counts, percent, centerLabel = 'Submitted' }) => {
  const data = [
    { name: 'Submitted',     value: counts.submitted, pct: percent.submitted, color: VIZ.good },
    { name: 'Pending',       value: counts.pending,   pct: percent.pending,   color: VIZ.warn },
    { name: 'Not Submitted', value: counts.missed,    pct: percent.missed,    color: VIZ.bad  },
  ];
  const any = data.some((d) => d.value > 0);

  return (
    <div className="addonut">
      <div className="addonut__ring">
        {any ? (
          <ResponsiveContainer width="100%" height={188}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86}
                startAngle={90} endAngle={-270} paddingAngle={1} isAnimationActive={false}>
                {/* A 2px ring in the surface colour between slices, so two
                    adjacent fills never touch. */}
                {data.map((d) => <Cell key={d.name} fill={d.color} stroke={VIZ.surface} strokeWidth={2} />)}
              </Pie>
              <Tooltip content={<Tip />} />
            </PieChart>
          </ResponsiveContainer>
        ) : <div className="addonut__empty" style={{ height: 188 }}><Blank text="No students yet" /></div>}
        <div className="addonut__mid">
          <strong>{percent.submitted ?? 0}%</strong>
          <small>{centerLabel}</small>
        </div>
      </div>
      <ul className="adlegend">
        {data.map((d) => (
          <li key={d.name}>
            <span className="adlegend__dot" style={{ background: d.color }} />
            <span className="adlegend__name">{d.name}</span>
            <span className="adlegend__val">{d.value}<em>({d.pct}%)</em></span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** How the marks fell. One series, so one colour and no legend — the title names it. */
export const ScoreHistogram = ({ data, height = 200, xTitle, yTitle }) => {
  if (!data?.some((d) => d.count > 0)) return <Blank text="No marks awarded yet" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 22, right: 8, left: yTitle ? 6 : -20, bottom: xTitle ? 18 : 0 }}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: VIZ.muted }} tickLine={false}
          axisLine={{ stroke: VIZ.grid }}
          label={xTitle ? { value: xTitle, position: 'insideBottom', offset: -12, fontSize: 11, fill: VIZ.muted } : undefined} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: VIZ.muted }} tickLine={false} axisLine={false} width={40}
          label={yTitle ? { value: yTitle, angle: -90, position: 'insideLeft', fontSize: 11, fill: VIZ.muted } : undefined} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(79,70,229,.05)' }} />
        <Bar dataKey="count" name="Students" fill={VIZ.accent} barSize={38} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {/* Five bars is few enough to label every one, which retires the
              axis as the only way to read a value. */}
          <LabelList dataKey="count" position="top" offset={7}
            style={{ fontSize: 11, fontWeight: 700, fill: VIZ.ink }}
            formatter={(v) => (v > 0 ? v : '')} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/** Work coming in over the days it was open, cumulated. */
export const SubmissionTrend = ({ data, height = 210 }) => {
  if (!data?.length) return <Blank text="Nothing has come in yet" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 14, right: 12, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id="adTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={VIZ.accent} stopOpacity={0.22} />
            <stop offset="100%" stopColor={VIZ.accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: VIZ.muted }} tickLine={false}
          axisLine={{ stroke: VIZ.grid }} interval="preserveStartEnd" minTickGap={12} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: VIZ.muted }} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<Tip />} cursor={{ stroke: VIZ.grid, strokeWidth: 1 }} />
        <Area type="monotone" dataKey="total" name="Submissions"
          stroke={VIZ.accent} strokeWidth={2} fill="url(#adTrendFill)"
          dot={{ r: 4, fill: VIZ.accent, stroke: VIZ.surface, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: VIZ.accent, stroke: VIZ.surface, strokeWidth: 2 }}
          isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

/** Named things compared. Drawn as bars in divs — five rows do not need a chart library. */
export const RankRows = ({ rows, unit = '%', empty = 'Nothing to compare yet' }) => {
  if (!rows?.length) return <Blank text={empty} />;
  const max = Math.max(100, ...rows.map((r) => Number(r.value) || 0));
  return (
    <ul className="adrank">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="adrank__name" title={r.label}>{r.label}</span>
          <span className="adrank__track">
            <span className="adrank__fill" style={{ width: `${((Number(r.value) || 0) / max) * 100}%` }} />
          </span>
          <span className="adrank__val">{r.value == null ? '—' : `${r.value}${unit}`}</span>
        </li>
      ))}
    </ul>
  );
};

/** Average score per question — the panel that says which one the class lost marks on. */
export const QuestionBars = ({ questions, height = 200 }) => {
  const marked = (questions || []).filter((q) => q.average != null);
  if (!marked.length) {
    return (
      <Blank text="No per-question marks yet. Add questions to the assignment and mark them one by one to see this." />
    );
  }
  const data = marked.map((q) => ({ label: q.label, value: q.percent ?? q.average, raw: q.average, max: q.maxMarks }));
  const usePct = marked.every((q) => q.percent != null);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 22, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: VIZ.muted }} tickLine={false} axisLine={{ stroke: VIZ.grid }} />
        {/* Wide enough for a three-digit tick — "100" was being clipped to "00". */}
        <YAxis domain={usePct ? [0, 100] : undefined} tick={{ fontSize: 11, fill: VIZ.muted }}
          tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<Tip unit={usePct ? '%' : ''} />} cursor={{ fill: 'rgba(79,70,229,.05)' }} />
        <Bar dataKey="value" name={usePct ? 'Average' : 'Average score'} fill={VIZ.accent}
          barSize={38} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          <LabelList dataKey="value" position="top" offset={7}
            style={{ fontSize: 11, fontWeight: 700, fill: VIZ.ink }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ── People ───────────────────────────────────────────────────────────────────

const TONES = ['#4f46e5', '#059669', '#d97706', '#7c3aed', '#db2777', '#0d9488'];

export const Avatar = ({ name, src, size = 32 }) => {
  // A photo that 404s falls back to the initials rather than leaving a hole —
  // see the same note in documentParts.jsx.
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);

  const text = String(name || '?');
  const initials = text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const tone = TONES[[...text].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];
  const style = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.38, fontWeight: 700, color: '#fff',
    background: tone, objectFit: 'cover', overflow: 'hidden',
  };
  if (src && !broken) {
    return <img src={fileUrl(src)} alt="" style={style} loading="lazy" decoding="async"
      onError={() => setBroken(true)} />;
  }
  return <span style={style} aria-hidden>{initials || '?'}</span>;
};

export const Person = ({ name, photo, sub, size = 32 }) => (
  <span className="adwho">
    <Avatar name={name} src={photo} size={size} />
    <span className="adwho__text">
      <span className="adwho__name">{name}</span>
      {sub ? <span className="adwho__sub">{sub}</span> : null}
    </span>
  </span>
);

// ── The roster table ─────────────────────────────────────────────────────────

export const RowActions = ({ children }) => <div className="adacts">{children}</div>;

export const IconAction = ({ icon, label, onClick, disabled, variant = '' }) => (
  <button type="button" className={`adact${variant ? ` adact--${variant}` : ''}`}
    onClick={onClick} title={label} aria-label={label} disabled={disabled}>
    <Icon name={icon} size={16} />
  </button>
);

/**
 * Who has handed what back.
 *
 * `columns` trims the table for the Overview tab, which shows the feedback
 * column the Submissions tab keeps in its side panel instead. Rows carry
 * `data-focus-id` so a notification can flag the student it was about.
 */
export function RosterTable({
  rows, loading, outOf, showFeedback, selected, onSelect, onOpen, onMark, empty,
}) {
  if (loading) return <Loading />;
  if (!rows.length) return empty || <Blank text="No students match these filters" />;

  return (
    <div className="table-wrap">
      <table className="table adtable">
        <thead>
          <tr>
            <th className="adtable__num">#</th>
            <th>Student Name</th>
            <th>Roll No.</th>
            <th>Status</th>
            <th>Submitted On</th>
            <th>{outOf ? `Marks (${outOf})` : 'Marks'}</th>
            {showFeedback && <th>Feedback</th>}
            <th className="adtable__acts">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r._id} data-focus-id={r._id}
              className={selected === r._id ? 'is-picked' : undefined}>
              <td className="adtable__num">{(r.index ?? i) + 1}</td>
              <td>
                <button type="button" className="adlink" onClick={() => onOpen(r)}>
                  <Person name={r.name} photo={r.photo} sub={r.sectionLabel} />
                </button>
              </td>
              <td className="admono">{r.rollNumber || <span className="adnone">—</span>}</td>
              <td><StatePill state={r.state} /></td>
              <td>
                {r.submittedAt
                  ? <span className="addate">{fmtDate(r.submittedAt)}<small>{fmtTime(r.submittedAt)}</small></span>
                  : <span className="adnone">—</span>}
              </td>
              <td>
                {r.marks == null
                  ? <span className="adnone">—</span>
                  : <span className="admarks">{r.marks}{outOf ? ` / ${outOf}` : ''}</span>}
              </td>
              {showFeedback && (
                <td>
                  {r.feedback
                    ? <span className="adfeed" title={r.feedback}>{r.feedback}</span>
                    : <span className="adnone">—</span>}
                </td>
              )}
              <td className="adtable__acts">
                <RowActions>
                  <IconAction icon="eye" label="Open submission" onClick={() => onOpen(r)} />
                  <IconAction icon="pencil" label="Mark and give feedback" variant="edit"
                    onClick={() => onMark(r)}
                    disabled={r.state === 'pending' || r.state === 'missed'} />
                  {onSelect && (
                    <IconAction icon="bell" label="Send a reminder to this student"
                      onClick={() => onSelect(r)}
                      disabled={r.state === 'submitted' || r.state === 'late'} />
                  )}
                </RowActions>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Pager = ({ page, pages, onPage }) => {
  if (!pages || pages < 1) return null;
  const span = 4;
  let first  = Math.max(1, page - Math.floor(span / 2));
  const last = Math.min(pages, first + span - 1);
  first = Math.max(1, last - span + 1);
  const nums = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  return (
    <nav className="adpager" aria-label="Pages of students">
      <button type="button" className="adpage" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
      {nums.map((n) => (
        <button key={n} type="button" className={`adpage${n === page ? ' is-on' : ''}`}
          aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
      ))}
      <button type="button" className="adpage" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
    </nav>
  );
};

// ── Left rail on the Submissions tab ─────────────────────────────────────────

export const RailGroup = ({ title, items, value, onPick }) => (
  <section className="adrail__group">
    <h3>{title}</h3>
    <ul>
      {items.map((it) => (
        <li key={it.value}>
          <button type="button" className={`adrail__row${value === it.value ? ' is-on' : ''}`}
            onClick={() => onPick(it.value)} aria-pressed={value === it.value}>
            {it.icon ? <Icon name={it.icon} size={16} /> : <span className="adrail__dot" style={{ background: it.color }} />}
            <span>{it.label}</span>
            <b>{it.count}</b>
          </button>
        </li>
      ))}
    </ul>
  </section>
);

export const RailActions = ({ items }) => (
  <section className="adrail__group">
    <h3>Quick Actions</h3>
    <ul>
      {items.map((it) => (
        <li key={it.label}>
          <button type="button" className="adrail__act" onClick={it.onClick} disabled={it.disabled}>
            <Icon name={it.icon} size={16} /> {it.label}
          </button>
        </li>
      ))}
    </ul>
  </section>
);

// ── The submission panel ─────────────────────────────────────────────────────

/**
 * One student's work, beside the list.
 *
 * Three faces: what they handed in, what has happened to it, and the marking
 * form. Marking is a form rather than an inline cell because it writes three
 * things at once — a total, per-question scores and the feedback the student
 * reads — and half-saving any of them would be worse than not saving at all.
 */
export function SubmissionPanel({ student, doc, onClose, onSave, saving, onRemind }) {
  const [face, setFace]   = useState('work');
  const [marks, setMarks] = useState('');
  const [scores, setScores] = useState({});
  const [note, setNote]   = useState('');

  const questions = doc.questions || [];
  const byQuestion = questions.length > 0;

  useEffect(() => {
    if (!student) return;
    setFace('work');
    setMarks(student.marks == null ? '' : String(student.marks));
    setNote(student.feedback || '');
    setScores(Object.fromEntries(
      questions.map((q) => {
        const hit = (student.questionScores || []).find((s) => s.label === q.label);
        return [q.label, hit?.score == null ? '' : String(hit.score)];
      }),
    ));
    // Keyed on the student, so switching rows reloads the form rather than
    // carrying the previous student's marks into it.
  }, [student?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The total is derived when questions exist — two numbers that must agree are
  // one number with an extra chance to be wrong.
  const derived = useMemo(() => {
    if (!byQuestion) return null;
    const vals = questions.map((q) => Number(scores[q.label])).filter((n) => Number.isFinite(n));
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }, [byQuestion, questions, scores]);

  if (!student) {
    return (
      <aside className="adpanel adside adside--empty">
        <Icon name="clipboard" size={30} />
        <h3>No student selected</h3>
        <p>Pick a row to see what they handed in, mark it and write feedback.</p>
      </aside>
    );
  }

  const handedIn = student.state === 'submitted' || student.state === 'late';
  const span = fmtSpan(doc.assignedOn, student.submittedAt);
  const pct  = student.marks != null && doc.totalMarks ? Math.round((student.marks / doc.totalMarks) * 100) : null;

  return (
    <aside className="adpanel adside">
      <header className="adside__head">
        <h2>Submission Details</h2>
        <button type="button" className="adact" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
      </header>

      <div className="adside__who">
        <Avatar name={student.name} src={student.photo} size={40} />
        <div>
          <strong>{student.name}</strong>
          <small>
            {student.rollNumber ? `Roll No. ${student.rollNumber}` : 'No roll number'}
            {student.sectionLabel ? ` · ${student.sectionLabel}` : ''}
          </small>
        </div>
        <StatePill state={student.state} />
      </div>

      <Tabs variant="solid" className="uitabs--sm" label="This submission"
        value={face} onChange={setFace} items={[
          { key: 'work',    label: 'Submission' },
          { key: 'history', label: 'History' },
          { key: 'mark',    label: 'Feedback' },
        ]} />

      <div className="adside__body">
        {face === 'work' && (
          handedIn ? (
            <>
              <dl className="adfacts">
                <div><dt><Icon name="calendar" size={15} /> Submitted On</dt>
                  <dd>{fmtDate(student.submittedAt)}, {fmtTime(student.submittedAt)}</dd></div>
                {span && (
                  <div>
                    <dt><Icon name="clock" size={15} /> Time Taken</dt>
                    {/* Measured from when the assignment went out, which is the
                        only clock the system has — nothing records when a
                        student actually sat down to it. */}
                    <dd title="Elapsed between the assignment being set and this submission arriving">{span}</dd>
                  </div>
                )}
                <div><dt><Icon name="trophy" size={15} /> Marks Obtained</dt>
                  <dd>
                    {student.marks == null
                      ? <span className="adnone">Not marked yet</span>
                      : <>{student.marks} / {doc.totalMarks ?? '—'}{pct != null && <span className="adpill adpill--yes">{pct}%</span>}</>}
                  </dd></div>
              </dl>

              <div className="adside__filehead">
                <h4>Submitted Files ({student.files.length})</h4>
                {student.files.length > 0 && (
                  <a className="adlinkbtn" href={fileUrl(student.files[0].filePath)} target="_blank" rel="noreferrer">
                    <Icon name="download" size={14} /> Open first
                  </a>
                )}
              </div>
              {student.files.length ? (
                <ul className="adfiles">
                  {student.files.map((f, i) => (
                    <li key={`${f.storedName || f.originalName}-${i}`}>
                      <FileMark file={f} size={34} />
                      <span className="adfiles__name" title={f.originalName}>{f.originalName}</span>
                      <span className="adfiles__size">{fmtSize(f.fileSize)}</span>
                      <a className="adact" href={fileUrl(f.filePath)} target="_blank" rel="noreferrer"
                        title="Open file" aria-label={`Open ${f.originalName}`}><Icon name="eye" size={15} /></a>
                    </li>
                  ))}
                </ul>
              ) : <Blank text="Submitted with no files attached" />}

              {student.feedback && (
                <div className="adfeedbox">
                  <h4><Icon name="chat" size={15} /> Teacher Feedback</h4>
                  <p>{student.feedback}</p>
                  {student.reviewedAt && <small>{fmtDate(student.reviewedAt)}, {fmtTime(student.reviewedAt)}</small>}
                </div>
              )}
            </>
          ) : (
            <div className="adside__none">
              <Icon name={student.state === 'missed' ? 'alert' : 'clock'} size={28} />
              <p>
                {student.state === 'missed'
                  ? 'Nothing was handed in, and the due date has passed.'
                  : 'Nothing handed in yet — the due date has not passed.'}
              </p>
              {onRemind && (
                <button type="button" className="btn btn-secondary" onClick={() => onRemind(student)}>
                  <Icon name="bell" size={15} /> Send a reminder
                </button>
              )}
            </div>
          )
        )}

        {face === 'history' && (
          <ul className="adhistory">
            <li><span /><div><b>Assigned</b><small>{fmtDate(doc.assignedOn)}, {fmtTime(doc.assignedOn)}</small></div></li>
            {doc.dueDate && <li><span /><div><b>Due</b><small>{fmtDate(doc.dueDate)}, {fmtTime(doc.dueDate)}</small></div></li>}
            {student.submittedAt && (
              <li className="is-on"><span /><div>
                <b>{student.state === 'late' ? 'Submitted late' : 'Submitted'}</b>
                <small>{fmtDate(student.submittedAt)}, {fmtTime(student.submittedAt)}</small>
              </div></li>
            )}
            {student.reviewedAt && (
              <li className="is-on"><span /><div>
                <b>Marked{student.marks != null ? ` — ${student.marks}${doc.totalMarks ? `/${doc.totalMarks}` : ''}` : ''}</b>
                <small>{fmtDate(student.reviewedAt)}, {fmtTime(student.reviewedAt)}</small>
              </div></li>
            )}
            {!student.submittedAt && !student.reviewedAt && <Blank text="Nothing has happened on this one yet" />}
          </ul>
        )}

        {face === 'mark' && (
          handedIn ? (
            <form className="admark" onSubmit={(e) => {
              e.preventDefault();
              onSave({
                marks: byQuestion ? undefined : marks,
                feedback: note,
                questionScores: byQuestion ? questions.map((q) => ({ label: q.label, score: scores[q.label] })) : undefined,
              });
            }}>
              {byQuestion ? (
                <>
                  <label className="form-label">Marks per question</label>
                  <div className="adqgrid">
                    {questions.map((q) => (
                      <div key={q.label}>
                        <label htmlFor={`q-${q.label}`}>{q.label}{q.maxMarks ? <small> / {q.maxMarks}</small> : null}</label>
                        <input id={`q-${q.label}`} className="form-control" type="number" min="0" step="0.5"
                          max={q.maxMarks || undefined} value={scores[q.label] ?? ''}
                          onChange={(e) => setScores((s) => ({ ...s, [q.label]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                  <p className="adqtotal">
                    Total <b>{derived ?? '—'}</b>{doc.totalMarks ? ` / ${doc.totalMarks}` : ''}
                    <small>Added up from the questions above.</small>
                  </p>
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label" htmlFor="ad-marks">
                    Marks{doc.totalMarks ? ` (out of ${doc.totalMarks})` : ''}
                  </label>
                  <input id="ad-marks" className="form-control" type="number" min="0" step="0.5"
                    max={doc.totalMarks || undefined} value={marks}
                    onChange={(e) => setMarks(e.target.value)} placeholder="Leave empty to unmark" />
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="ad-note">Feedback</label>
                <textarea id="ad-note" className="form-control" rows={4} value={note} maxLength={600}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What they did well, and what to fix next time" />
                <div className="form-hint">The student sees this alongside their marks.</div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save marks & feedback'}
              </button>
            </form>
          ) : <Blank text="There is nothing to mark until something is handed in." />
        )}
      </div>
    </aside>
  );
}

// ── Comments ─────────────────────────────────────────────────────────────────

const ROLE_LABEL = { school_admin: 'Admin', teacher: 'Teacher', student: 'Student', parent: 'Parent' };

export function CommentCard({ c, onReply, onLike, onPin, onDelete, onEdit, depth = 0 }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const box = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [menu]);

  return (
    <article className={`adcomment${depth ? ' adcomment--reply' : ''}`}>
      <Avatar name={c.author.name} src={c.author.photo} size={depth ? 30 : 36} />
      <div className="adcomment__body">
        <header>
          <b>{c.author.name}</b>
          <span className={`adrole adrole--${c.author.role}`}>{ROLE_LABEL[c.author.role] || c.author.role}</span>
          <time>{fmtDate(c.createdAt)}, {fmtTime(c.createdAt)}</time>
          {c.isEdited && <em>edited</em>}
          {c.visibility === 'staff' && <span className="adpill adpill--slate">Staff only</span>}
          <span className="adcomment__end">
            {c.isPinned && <span className="adpill adpill--indigo"><Icon name="star" size={12} /> Pinned</span>}
            <span ref={box} className="adcomment__menu">
              <button type="button" className="adact" onClick={() => setMenu((v) => !v)}
                aria-label="Comment actions" aria-expanded={menu}><Icon name="dots" size={15} /></button>
              {menu && (
                <div className="admenu">
                  {c.mine && (
                    <button type="button" onClick={() => { setMenu(false); setEditing(true); setDraft(c.body); }}>
                      <Icon name="pencil" size={15} /> Edit
                    </button>
                  )}
                  {!depth && (
                    <button type="button" onClick={() => { setMenu(false); onPin(c, !c.isPinned); }}>
                      <Icon name="star" size={15} /> {c.isPinned ? 'Unpin' : 'Pin to top'}
                    </button>
                  )}
                  <button type="button" className="is-danger" onClick={() => { setMenu(false); onDelete(c); }}>
                    <Icon name="trash" size={15} /> Delete
                  </button>
                </div>
              )}
            </span>
          </span>
        </header>

        {editing ? (
          <form className="adcomment__edit" onSubmit={(e) => { e.preventDefault(); onEdit(c, draft); setEditing(false); }}>
            <textarea className="form-control" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div>
              <button type="submit" className="btn btn-primary btn-sm">Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          c.body ? <p>{c.body}</p> : null
        )}

        {c.files?.length > 0 && (
          <ul className="adcomment__files">
            {c.files.map((f, i) => (
              <li key={`${f.storedName || f.originalName}-${i}`}>
                <FileMark file={f} size={32} />
                <span className="adfiles__name" title={f.originalName}>{f.originalName}</span>
                <span className="adfiles__size">{fmtSize(f.fileSize)}</span>
                <a className="adact" href={fileUrl(f.filePath)} target="_blank" rel="noreferrer"
                  title="Open attachment" aria-label={`Open ${f.originalName}`}><Icon name="eye" size={15} /></a>
              </li>
            ))}
          </ul>
        )}

        <footer>
          <button type="button" className={`adchip${c.likedByMe ? ' is-on' : ''}`} onClick={() => onLike(c)}>
            <Icon name="heart" size={14} /> {c.likes || 0}
          </button>
          <button type="button" className="adchip" onClick={() => onReply(c)}>
            <Icon name="repeat" size={14} /> Reply
          </button>
        </footer>

        {c.replies?.length > 0 && (
          <div className="adcomment__replies">
            {c.replies.map((r) => (
              <CommentCard key={r._id} c={r} depth={depth + 1}
                onReply={onReply} onLike={onLike} onPin={onPin} onDelete={onDelete} onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export const GUIDELINES = [
  'Keep the discussion relevant to the document.',
  'Be respectful and constructive.',
  'Students can ask doubts related to the work set.',
  'Teachers can share extra resources and clarifications.',
  'Anything inappropriate will be removed.',
];

export const MiniStats = ({ items }) => (
  <div className="adminis">
    {items.map((it) => (
      <div className="adminis__cell" key={it.label}>
        <span className={`adminis__icon tint-${it.tone}`}><Icon name={it.icon} size={18} /></span>
        <strong>{it.value}</strong>
        <small>{it.label}</small>
      </div>
    ))}
  </div>
);

export const Timeline = ({ items }) => (
  items?.length
    ? (
      <ul className="adtimeline">
        {items.map((it) => (
          <li key={it._id}>
            <Avatar name={it.who} size={28} />
            <div>
              <b>{it.what}</b>
              <small>by {it.who} ({ROLE_LABEL[it.role] || it.role})</small>
            </div>
            <time>{fmtDate(it.at)}<small>{fmtTime(it.at)}</small></time>
          </li>
        ))}
      </ul>
    )
    : <Blank text="No activity yet" />
);

export { typeOf };
