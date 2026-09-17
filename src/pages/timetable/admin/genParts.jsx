/**
 * Parts shared by Generate Timetable and the version page (prefix `ttg`, styles
 * in global.css).
 *
 * The problem cards render the server's problem report
 * (school-backend/services/timetable/problems.js): conflicts already folded into
 * causes with their effects, numbers, the slots involved, what kind of change
 * clears them and the actions that make it. Nothing here re-derives meaning from
 * conflict rows — both screens, and the app, read the same explanation.
 *
 * A fix is handed back to the page through `onFix(fix)`, because what "edit the
 * plan" or "show in grid" does depends on where the card is shown.
 */
import React, { useState } from 'react';
import Icon from '../../../components/ui/icons';
import { Button } from '../../../components/ui/index';

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const DAY_ABBR = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

export const fmtWhen = (d) => (d
  ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : '');

export const fmtSeconds = (ms) => (ms == null ? '—' : ms < 1000 ? '<1s' : `${(ms / 1000).toFixed(1)}s`);

/* ── Version status ──────────────────────────────────────────────────────── */
export const STATUS = {
  draft:      { label: 'Draft',          tone: '' },
  generating: { label: 'Generating',     tone: 'indigo' },
  generated:  { label: 'Ready to review', tone: 'indigo' },
  conflict:   { label: 'Has problems',   tone: 'red' },
  validated:  { label: 'Ready to publish', tone: 'green' },
  published:  { label: 'Published',      tone: 'green' },
  archived:   { label: 'Archived',       tone: '' },
  failed:     { label: 'Failed',         tone: 'red' },
};

export const StatusPill = ({ status }) => {
  const m = STATUS[status] || { label: status || '—', tone: '' };
  return <span className={`ttg-status${m.tone ? ` ttg-status--${m.tone}` : ''}`}><i />{m.label}</span>;
};

/* ── Frame ───────────────────────────────────────────────────────────────── */
export const TtgHeader = ({ icon, title, aside, subtitle, children }) => (
  <header className="ttg-head">
    <div className="ttg-head__badge"><Icon name={icon} size={28} /></div>
    <div className="ttg-head__text">
      <h1>{title}{aside}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {children && <div className="ttg-head__acts">{children}</div>}
  </header>
);

/**
 * A numbered step. `state` colours the number: 'done' green, 'bad' red, else
 * indigo — so a glance down the left edge says which step needs attention.
 */
export const StepCard = React.forwardRef(({ step, state, title, sub, actions, children, flush, className = '' }, ref) => (
  <section ref={ref} className={`ttg-card ${className}`}>
    <div className="ttg-card__head">
      <div className="ttg-card__title">
        {step != null && (
          <span className={`ttg-step${state === 'done' ? ' is-done' : state === 'bad' ? ' is-bad' : ''}`}>
            {state === 'done' ? <Icon name="check" size={15} strokeWidth={2.5} /> : step}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <h2>{title}</h2>
          {sub && <div className="ttg-card__sub">{sub}</div>}
        </div>
      </div>
      {actions && <div className="ttg-card__acts">{actions}</div>}
    </div>
    <div className={`ttg-card__body${flush ? ' ttg-card__body--flush' : ''}`}>{children}</div>
  </section>
));

const NOTE_ICON = { info: 'info', warn: 'alert', bad: 'alert', good: 'checkCircle' };
export const Note = ({ tone = 'info', children }) => (
  <div className={`ttg-note ttg-note--${tone}`}>
    <Icon name={NOTE_ICON[tone]} size={17} />
    <div>{children}</div>
  </div>
);

export const Figures = ({ items }) => (
  <div className="ttg-figs" style={{ '--n': items.length }}>
    {items.map((f) => (
      <div key={f.label} className={`ttg-fig${f.tone ? ` ttg-fig--${f.tone}` : ''}`} title={f.title}>
        <div className="ttg-fig__value">{f.value}{f.unit && <small>{f.unit}</small>}</div>
        <div className="ttg-fig__label">{f.label}</div>
      </div>
    ))}
  </div>
);

export const Switch = ({ on }) => <span className={`ttg-switch${on ? ' is-on' : ''}`} aria-hidden="true" />;

export function Stepper({ value, onChange, min = 0, max = 60, label }) {
  const n = Number(value) || 0;
  const set = (v) => onChange(Math.max(min, Math.min(max, Number(v) || 0)));
  return (
    <span className="ttg-stepper">
      <button type="button" onClick={() => set(n - 1)} disabled={n <= min} aria-label={`Fewer ${label || ''}`}>
        <Icon name="minus" size={14} />
      </button>
      <input type="number" min={min} max={max} value={n} aria-label={label}
        onChange={(e) => set(e.target.value)} onFocus={(e) => e.target.select()} />
      <button type="button" onClick={() => set(n + 1)} disabled={n >= max} aria-label={`More ${label || ''}`}>
        <Icon name="plus" size={14} />
      </button>
    </span>
  );
}

/* ── A generation run in progress ────────────────────────────────────────── */
export const ProgressBar = ({ percent }) => (
  <div className="ttg-progress" role="progressbar" aria-valuenow={percent || 0} aria-valuemin={0} aria-valuemax={100}>
    <i style={{ width: `${Math.max(2, percent || 0)}%` }} />
  </div>
);

export const RunSteps = ({ steps = [] }) => (
  <ol className="ttg-runsteps">
    {steps.map((s) => (
      <li key={s.key} className={s.status === 'done' ? 'is-done' : s.status === 'active' ? 'is-active' : ''}>
        <i>{s.status === 'done' && <Icon name="check" size={10} strokeWidth={3} />}</i>
        <span>{s.label}</span>
      </li>
    ))}
  </ol>
);

/* ══════════════════════════════════════════════════════════════════════════
   Problems
   ══════════════════════════════════════════════════════════════════════════ */

const KIND_ICON = {
  week_overbooked: 'calendarDays',
  daily_ceiling: 'gauge',
  teacher_overloaded: 'teacher',
  teacher_clash: 'teacher',
  teacher_unavailable: 'teacher',
  teacher_daily_limit: 'teacher',
  teacher_weekly_limit: 'teacher',
  staff_shortage: 'users',
  room_supply: 'building',
  no_room: 'building',
  room_clash: 'building',
  room_unavailable: 'building',
  no_teacher: 'userPlus',
  merge_teacher: 'userPlus',
  teacher_not_assigned: 'userPlus',
  subject_short: 'layers',
  section_short: 'layers',
  subject_extra: 'layers',
  class_clash: 'grid',
  outside_timetable: 'clock',
  not_back_to_back: 'listDots',
  subject_daily_limit: 'gauge',
  merge_counts: 'repeat',
  merge_not_aligned: 'repeat',
  dropped_edits: 'pencil',
};

const FIX_ICON = {
  plan: 'sliders', rules: 'settings', availability: 'calendar', rooms: 'building',
  section_subjects: 'userPlus', configuration: 'clock', grid: 'grid', regenerate: 'refresh',
};

/** Fixes that leave the page open in a new tab — setup lives on other screens. */
export const EXTERNAL_FIXES = new Set(['availability', 'rooms', 'section_subjects', 'configuration']);

export function linkForFix(fix) {
  switch (fix.type) {
    case 'availability':     return `/admin/timetable/availability${fix.teacherId ? `?teacher=${fix.teacherId}` : ''}`;
    case 'rooms':            return '/admin/timetable/rooms';
    case 'section_subjects': return fix.sectionId ? `/admin/sections/${fix.sectionId}` : '/admin/classes';
    case 'configuration':    return '/admin/timetable/configuration';
    default:                 return null;
  }
}

/** Open a setup screen beside the timetable, so nothing on this page is lost. */
export const openFixInNewTab = (fix) => {
  const href = linkForFix(fix);
  if (href) window.open(href, '_blank', 'noopener');
};

const REMEDY_HELP = {
  plan: 'The plan asks for something the week cannot give — regenerating alone will not change that.',
  setup: 'Something is missing outside the timetable: a teacher, a room, availability.',
  regenerate: 'Nothing in the plan makes this impossible; a fresh attempt usually clears it.',
  grid: 'A period in the grid breaks a rule — move or clear it, or regenerate.',
  review: 'Not blocking — worth a quick look.',
};

const MAX_SLOTS = 12;

export function ProblemCard({ problem: p, onFix, disabledFixes }) {
  const [allSlots, setAllSlots] = useState(false);
  const manySections = new Set(p.slots.map((s) => s.sectionId)).size > 1;
  const sectionLabel = (id) => p.sections.find((s) => s._id === id)?.label || '';
  const slots = allSlots ? p.slots : p.slots.slice(0, MAX_SLOTS);
  const fig = p.figures;
  const pct = fig && fig.need ? Math.max(0, Math.min(100, Math.round(((fig.have || 0) / fig.need) * 100))) : 0;

  return (
    <article className={`ttg-prob ttg-prob--${p.severity}`}>
      <div className="ttg-prob__icon"><Icon name={KIND_ICON[p.kind] || 'alert'} size={20} /></div>
      <div className="ttg-prob__body">
        <div className="ttg-prob__head">
          <h3 className="ttg-prob__title">{p.title}</h3>
          {p.remedyLabel && (
            <span className={`ttg-remedy ttg-remedy--${p.remedy}`} title={REMEDY_HELP[p.remedy]}>{p.remedyLabel}</span>
          )}
        </div>
        {p.detail && <p className="ttg-prob__detail">{p.detail}</p>}

        {fig && fig.need > 0 && fig.have != null && (
          <div className="ttg-gap">
            <div className="ttg-gap__track"><i style={{ width: `${pct}%` }} /></div>
            <div className="ttg-gap__legend">
              <span>{fig.haveLabel} <b>{fig.have}</b></span>
              <span>{fig.needLabel} <b>{fig.need}</b> {fig.unit}</span>
            </div>
          </div>
        )}

        {!!p.effects?.length && (
          <div className="ttg-prob__part">
            <div className="ttg-prob__label">Because of this</div>
            <ul className="ttg-prob__list">
              {p.effects.map((e, i) => (
                <li key={i}><span>{e.text}{e.reason && <small>{capitalise(e.reason)}</small>}</span></li>
              ))}
            </ul>
          </div>
        )}

        {!!p.reasons?.length && (
          <div className="ttg-prob__part">
            <div className="ttg-prob__label">Why no slot was found</div>
            <ul className="ttg-prob__list">
              {p.reasons.map((r) => <li key={r.code}><span title={r.example}>{capitalise(r.text)}</span></li>)}
            </ul>
          </div>
        )}

        {(p.slots.length > 0 || (p.sections.length > 1 && !p.slots.length)) && (
          <div className="ttg-prob__part">
            <div className="ttg-prob__label">Where</div>
            <div className="ttg-prob__where">
              {!p.slots.length && p.sections.map((s) => <span key={s._id} className="ttg-slot ttg-slot--section">{s.label}</span>)}
              {slots.map((s) => {
                const text = manySections ? `${shortSection(sectionLabel(s.sectionId))} · ${s.text}` : s.text;
                return onFix && !disabledFixes?.has('grid')
                  ? (
                    <button key={`${s.sectionId}#${s.day}#${s.period}`} type="button" className="ttg-slot"
                      title={`Show ${sectionLabel(s.sectionId)} ${s.text} in the grid`}
                      onClick={() => onFix({ type: 'grid', sectionId: s.sectionId, day: s.day, period: s.period })}>
                      {text}
                    </button>
                  )
                  : <span key={`${s.sectionId}#${s.day}#${s.period}`} className="ttg-slot">{text}</span>;
              })}
              {p.slots.length > MAX_SLOTS && (
                <button type="button" className="ttg-slot" onClick={() => setAllSlots((v) => !v)}>
                  {allSlots ? 'Show fewer' : `+${p.slots.length - MAX_SLOTS} more`}
                </button>
              )}
            </div>
          </div>
        )}

        {onFix && !!p.fixes?.length && (
          <div className="ttg-prob__fixes">
            {p.fixes.filter((f) => !disabledFixes?.has(f.type)).map((f, i) => (
              <Button key={`${f.type}${i}`} size="sm" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => onFix(f)}>
                <Icon name={FIX_ICON[f.type] || 'arrowRight'} size={14} />
                {f.label}
                {EXTERNAL_FIXES.has(f.type) && <Icon name="externalLink" size={13} />}
              </Button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

const capitalise = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** "Class 8 A" → "8 A" inside a crowded chip; anything else unchanged. */
const shortSection = (label) => String(label || '').replace(/^Class\s+/i, '');

/**
 * Every problem in a report: blocking ones open, warnings and notes folded away
 * behind a count so they never bury what stops publishing.
 */
export function ProblemList({ report, onFix, disabledFixes, openWarnings = false }) {
  const [showRest, setShowRest] = useState(openWarnings);
  const problems = report?.problems || [];
  const errors = problems.filter((p) => p.severity === 'error');
  const rest = problems.filter((p) => p.severity !== 'error');
  if (!problems.length) return null;

  return (
    <div className="ttg-problems">
      {errors.map((p) => <ProblemCard key={p.key} problem={p} onFix={onFix} disabledFixes={disabledFixes} />)}
      {!!rest.length && (errors.length && !showRest ? (
        <button type="button" className="ttg-disclose" onClick={() => setShowRest(true)}>
          <Icon name="chevronDown" size={16} />
          Show {plural(rest.length, 'thing')} worth checking (not blocking)
        </button>
      ) : (
        <>
          {!!errors.length && <div className="ttg-problems__group">Worth checking — not blocking</div>}
          {rest.map((p) => <ProblemCard key={p.key} problem={p} onFix={onFix} disabledFixes={disabledFixes} />)}
        </>
      ))}
    </div>
  );
}

/** The one-line verdict above a report: can this be published, and what to do. */
export function Verdict({ report, children, running }) {
  if (!report) return null;
  const s = report.summary;
  const tone = s.errors ? 'bad' : s.warnings ? 'warn' : 'good';
  return (
    <div className={`ttg-verdict ttg-verdict--${tone}`}>
      <Icon name={tone === 'good' ? 'checkCircle' : 'alert'} size={22} />
      <div className="ttg-verdict__text">
        <b>{s.headline}</b>
        {!running && (s.advice || (!s.errors && s.warnings ? 'Nothing here stops publishing.' : ''))
          && <span>{s.advice || 'Nothing here stops publishing.'}</span>}
      </div>
      {children && <div className="ttg-verdict__acts">{children}</div>}
    </div>
  );
}

export const EmptyState = ({ icon = 'info', title, children, actions, good }) => (
  <div className={`ttg-empty${good ? ' ttg-empty--good' : ''}`}>
    <div className="ttg-empty__icon"><Icon name={icon} size={24} /></div>
    <b>{title}</b>
    {children && <p>{children}</p>}
    {actions && <div className="ttg-empty__acts">{actions}</div>}
  </div>
);
