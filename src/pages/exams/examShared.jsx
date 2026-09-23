/**
 * Aptitude exam pieces shared by the teacher, student and parent screens (and
 * the admin question editor).
 *
 * They sit on the same `apx` frame as the admin page — pages/admin/examParts.jsx
 * holds the marks, pills, tiles, panels and chart — so the four roles read as
 * one module. Everything added here is still prefixed `apx`.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Avatar } from '../admin/documentParts';
import { QUESTION_TYPE_LABEL } from '../admin/examParts';
import { VIZ, toneForPercent, toneColor } from '../analytics/palette';
import UiTabs from '../../components/ui/Tabs';

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Time ─────────────────────────────────────────────────────────────────────

/** The current time, re-read every `ms` — for countdowns. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** "2d 4h", "3h 12m", "8m 05s" — a gap, at the precision that matters at that size. */
export function fmtGap(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

/** Minutes and seconds a student spent — "24 min", "1 h 05 min", "45 s". */
export function fmtSpent(ms) {
  if (ms == null) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const fmtStamp = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  const h = x.getHours();
  return `${x.getDate()} ${MONTHS[x.getMonth()]}, ${String(h % 12 || 12).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** The calendar tile an upcoming exam leads with. Read off the ISO day, as fmtExamDay does. */
export const DateBlock = ({ exam, tone = 'indigo' }) => {
  const [, m, d] = exam?.examDate ? new Date(exam.examDate).toISOString().slice(0, 10).split('-') : [];
  return (
    <span className={`apxdate apxdate--${tone}`} aria-hidden>
      <small>{m ? MONTHS[Number(m) - 1] : '—'}</small>
      <strong>{d ? Number(d) : '—'}</strong>
    </span>
  );
};

// ── Frame ────────────────────────────────────────────────────────────────────

export const BackLink = ({ to, children }) => (
  <Link to={to} className="apxback"><Icon name="chevronLeft" size={16} />{children}</Link>
);

/** Page tabs. `badge` is a count worth seeing before opening the tab. */
export const Tabs = ({ tabs, value, onChange }) => (
  <UiTabs
    variant="line"
    label="Exam views"
    value={value}
    onChange={onChange}
    items={tabs.map(t => ({ ...t, count: t.count ?? t.badge }))}
  />
);

export const Pills = ({ items, value, onChange, label }) => (
  <div className="apxpills" role="group" aria-label={label}>
    {items.map((p) => (
      <button key={p.value} type="button" className={`apxpills__pill${value === p.value ? ' is-on' : ''}`}
        aria-pressed={value === p.value} onClick={() => onChange(p.value)}>
        {p.label}{p.count != null && <span>{p.count}</span>}
      </button>
    ))}
  </div>
);

/**
 * Which academic year a list shows. '' is the school's current year — the
 * default everywhere — 'all' is every year, anything else a year's id.
 * `years` is the server's `academicYears` ({ _id, name, current, count }).
 */
export const YearPicker = ({ years, value, onChange }) => {
  if (!years?.length) return null;
  return (
    <select className={`form-control docsel apxyear${value ? ' is-on' : ''}`} value={value}
      onChange={(e) => onChange(e.target.value)} aria-label="Academic year">
      {years.map((y) => (
        <option key={y._id} value={y.current ? '' : y._id}>
          {y.name}{y.current ? ' (current)' : ''} · {y.count}
        </option>
      ))}
      <option value="all">All years</option>
    </select>
  );
};

/** A row of facts under a header: icon, what, value. */
export const Facts = ({ items }) => (
  <dl className="apxfacts">
    {items.filter(Boolean).map((f) => (
      <div key={f.label} className="apxfacts__item">
        <span className="apxfacts__icon"><Icon name={f.icon} size={17} /></span>
        <div>
          <dt>{f.label}</dt>
          <dd title={f.title}>{f.value}</dd>
        </div>
      </div>
    ))}
  </dl>
);

export const Person = ({ name, sub, photo, size = 34 }) => (
  <span className="apxperson">
    <Avatar name={name} src={photo} size={size} />
    <span className="apxperson__text">
      <strong>{name || '—'}</strong>
      {sub && <small title={sub}>{sub}</small>}
    </span>
  </span>
);

/** A percentage as a short bar with its number — the colour reads the band, the number carries the value. */
export const PctBar = ({ value, label }) => (
  <span className="apxpct" title={label}>
    <span className="apxpct__track">
      <span className="apxpct__fill" style={{ width: `${Math.max(0, Math.min(100, value || 0))}%`, background: toneColor[toneForPercent(value)] }} />
    </span>
    <span className="apxpct__n">{value == null ? '—' : `${value}%`}</span>
  </span>
);

/** A large score ring: the fill is the student's share of the marks. */
export const ScoreRing = ({ value, size = 132, stroke = 12, children }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  const color = toneColor[toneForPercent(value)] || VIZ.accent;
  return (
    <div className="apxscorering" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${value}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity=".15" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="apxscorering__text">{children}</div>
    </div>
  );
};

export const Outcome = ({ passed }) => (
  <span className={`apxpill apxpill--${passed ? 'green' : 'red'}`}>
    <Icon name={passed ? 'checkCircle' : 'closeCircle'} size={14} />{passed ? 'Passed' : 'Not passed'}
  </span>
);

const ATTEMPT = {
  not_started:    { label: 'Not started',    tone: 'slate' },
  in_progress:    { label: 'In progress',    tone: 'blue' },
  submitted:      { label: 'Submitted',      tone: 'green' },
  auto_submitted: { label: 'Auto-submitted', tone: 'amber' },
  missed:         { label: 'Missed',         tone: 'red' },
};
export const AttemptPill = ({ status }) => {
  const a = ATTEMPT[status] || ATTEMPT.not_started;
  return <span className={`apxpill apxpill--${a.tone}`}>{a.label}</span>;
};

// ── Publish readiness ────────────────────────────────────────────────────────
// In their own file so the admin parts can use them without importing this one.
export { ReadinessList, ReadinessPanel, PublishButton, PublishMenuItem } from './readinessParts';

// ── Question review ──────────────────────────────────────────────────────────

const letter = (i) => String.fromCharCode(65 + i);

/**
 * One question as it was answered — for the student's result, the teacher's
 * view of a student's paper, and the question editor (no answers there, just
 * the key). States are spelled out beside the colour: "Your answer",
 * "Correct answer".
 */
export function QuestionReview({ q, index, viewer = 'student', actions, showKeyOnly = false }) {
  const selected = q.selected || [];
  const key = q.correctAnswers || [];
  const state = showKeyOnly ? null : !selected.length ? 'unanswered' : q.isCorrect ? 'correct' : 'incorrect';
  const who = viewer === 'student' ? 'Your answer' : 'Chosen';

  return (
    <article className={`apxqr${state ? ` apxqr--${state}` : ''}`}>
      <header className="apxqr__head">
        <span className="apxqr__num">Q{index + 1}</span>
        <span className="apxchip">{QUESTION_TYPE_LABEL[q.questionType] || q.questionType}</span>
        {state === 'correct' && <span className="apxqr__state is-correct"><Icon name="checkCircle" size={15} />Correct</span>}
        {state === 'incorrect' && <span className="apxqr__state is-incorrect"><Icon name="closeCircle" size={15} />Incorrect</span>}
        {state === 'unanswered' && <span className="apxqr__state is-unanswered"><Icon name="info" size={15} />Not answered</span>}
        <span className="apxqr__marks">
          {showKeyOnly ? plural(q.marks, 'mark') : `${q.earnedMarks ?? (q.isCorrect ? q.marks : 0)} / ${q.marks}`}
        </span>
        {actions && <span className="apxqr__acts">{actions}</span>}
      </header>
      <p className="apxqr__text">{q.questionText}</p>
      <ul className="apxqr__opts">
        {(q.options || []).map((o, i) => {
          const isKey = key.includes(o.optionId);
          const isSel = selected.includes(o.optionId);
          const cls = isKey ? 'is-key' : isSel ? 'is-wrong' : '';
          return (
            <li key={o.optionId} className={cls}>
              <span className="apxqr__letter">{q.questionType === 'true_false' ? (o.optionId === 'true' ? 'T' : 'F') : letter(i)}</span>
              <span className="apxqr__opt">{o.text}</span>
              <span className="apxqr__tags">
                {!showKeyOnly && isSel && <em className={isKey ? 'is-ok' : 'is-bad'}>{who}</em>}
                {isKey && <em className="is-key">{showKeyOnly ? 'Correct' : 'Correct answer'}</em>}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/** "All · Correct · Incorrect · Not answered" over a list of graded questions. */
export function useReviewFilter(questions) {
  const [filter, setFilter] = useState('all');
  const stateOf = (q) => (!(q.selected || []).length ? 'unanswered' : q.isCorrect ? 'correct' : 'incorrect');
  const count = (s) => (questions || []).filter((q) => stateOf(q) === s).length;
  const pills = [
    { value: 'all', label: 'All', count: (questions || []).length },
    { value: 'correct', label: 'Correct', count: count('correct') },
    { value: 'incorrect', label: 'Incorrect', count: count('incorrect') },
    { value: 'unanswered', label: 'Not answered', count: count('unanswered') },
  ];
  const shown = (questions || []).map((q, i) => ({ q, i })).filter(({ q }) => filter === 'all' || stateOf(q) === filter);
  return { filter, setFilter, pills, shown };
}
