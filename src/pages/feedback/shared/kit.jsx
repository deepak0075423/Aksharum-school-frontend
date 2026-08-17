import React from 'react';
import { Badge, Empty } from '../../../components/ui/index';
import { VIZ } from '../../analytics/viz';

// Shared feedback UI pieces. Charts are deliberately NOT redefined here — the
// module reuses the validated chart set in pages/analytics/viz.jsx (TrendLine,
// RankBars, Columns, Meter, Panel …) so feedback reads as the same system as
// the rest of the ERP.

export const RATING_LABELS = {
  1: 'Poor',
  2: 'Needs Improvement',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

export const EMOJI_SCALE = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };

// A rating is a state, not a series — it wears the status tokens and always
// ships the number beside the colour.
export const ratingTone = (v) => (v == null ? 'muted' : v >= 4 ? 'good' : v >= 3 ? 'warn' : 'bad');
export const ratingColor = (v) => ({ good: VIZ.good, warn: VIZ.warn, bad: VIZ.bad, muted: VIZ.muted }[ratingTone(v)]);
export const ratingBadge = (v) => ({ good: 'success', warn: 'warning', bad: 'danger', muted: 'muted' }[ratingTone(v)]);

export const fmtDate = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—');

export const daysLeft = (end) => {
  if (!end) return null;
  const e = new Date(end); e.setHours(23, 59, 59, 999);
  return Math.ceil((e - new Date()) / 86400000);
};

// ── Score chip — "4.3 / 5.0" with its status colour and a word ───────────────
export const Score = ({ value, size = 'md', showLabel = true }) => {
  if (value == null) return <span className="text-muted">—</span>;
  const font = size === 'lg' ? '2.2rem' : size === 'sm' ? '.95rem' : '1.35rem';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <strong style={{ fontSize: font, lineHeight: 1.1, color: ratingColor(value) }}>
        {Number(value).toFixed(1)}
      </strong>
      <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>/ 5.0</span>
      {showLabel && (
        <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          {RATING_LABELS[Math.round(value)] || ''}
        </span>
      )}
    </span>
  );
};

// ── Star row (read-only) ─────────────────────────────────────────────────────
export const Stars = ({ value, size = 15 }) => (
  <span aria-label={`${value ?? 0} out of 5`} style={{ letterSpacing: 1, fontSize: size, color: '#f59e0b' }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <span key={n} style={{ opacity: value >= n ? 1 : 0.22 }}>★</span>
    ))}
  </span>
);

// ── Large touch-friendly rating control (student form) ───────────────────────
//  Five 44px+ targets in a row, each carrying its number AND its word, so the
//  meaning never rests on position alone.
export const RatingInput = ({ value, onChange, name }) => (
  <div role="radiogroup" aria-label={name} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {[1, 2, 3, 4, 5].map((n) => {
      const active = value === n;
      return (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(active ? null : n)}
          title={RATING_LABELS[n]}
          style={{
            flex: '1 1 62px', minWidth: 62, minHeight: 58, cursor: 'pointer',
            borderRadius: 'var(--radius)', padding: '6px 4px',
            border: `1.5px solid ${active ? ratingColor(n) : 'var(--border)'}`,
            background: active ? `${ratingColor(n)}14` : 'var(--bg-card)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            transition: 'border-color .15s, background .15s',
          }}
        >
          <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>{EMOJI_SCALE[n]}</span>
          <span style={{ fontSize: '.92rem', fontWeight: 700, color: active ? ratingColor(n) : 'var(--text)' }}>{n}</span>
          <span style={{
            fontSize: '.58rem', textAlign: 'center', lineHeight: 1.15,
            color: active ? ratingColor(n) : 'var(--text-muted)',
          }}>
            {RATING_LABELS[n]}
          </span>
        </button>
      );
    })}
  </div>
);

// ── Multi-select chips (likes / improvements) ────────────────────────────────
export const OptionChips = ({ options, selected, onToggle, single }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    {options.map((o) => {
      const active = selected.includes(o._id);
      return (
        <button
          key={o._id}
          type="button"
          aria-pressed={active}
          onClick={() => onToggle(o._id, !!single)}
          style={{
            cursor: 'pointer', minHeight: 40, padding: '8px 14px', fontSize: '.83rem',
            borderRadius: 999, fontWeight: active ? 600 : 400,
            border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
            background: active ? 'rgba(79,70,229,.08)' : 'var(--bg-card)',
            color: active ? 'var(--primary)' : 'var(--text)',
          }}
        >
          {active ? '✓ ' : ''}{o.optionText}
        </button>
      );
    })}
  </div>
);

// ── Step indicator (reuses the app's .stepper styles) ────────────────────────
export const Stepper = ({ step, steps }) => (
  <div className="stepper">
    {steps.map((label, i) => {
      const n = i + 1;
      const done = n < step;
      const active = n === step;
      return (
        <React.Fragment key={label}>
          {i > 0 && <div className="stepper__bar" style={{ background: done || active ? 'var(--primary)' : 'var(--border)' }} />}
          <div className="stepper__step">
            <div className="stepper__dot" style={{
              background: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--border)',
              color: done || active ? '#fff' : 'var(--text-muted)',
            }}>
              {done ? '✓' : n}
            </div>
            <span className={`stepper__label${active ? ' stepper__label--active' : ''}`}
              style={{ color: active ? 'var(--primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>
              {label}
            </span>
          </div>
        </React.Fragment>
      );
    })}
  </div>
);

// ── Privacy gate notice (spec §10, §25) ──────────────────────────────────────
export const LockedNotice = ({ responses, minimum, compact }) => {
  const text = responses === 0
    ? 'No responses have been submitted yet.'
    : `Not enough responses to display anonymous results — ${responses} of ${minimum} needed.`;
  if (compact) return <span className="text-muted text-xs">🔒 {text}</span>;
  return (
    <Empty
      icon="🔒"
      title="Results are hidden"
      message={`${text} Aggregated results appear once at least ${minimum} students have responded, so no individual can be identified.`}
    />
  );
};

// ── Campaign status badge ────────────────────────────────────────────────────
const CAMPAIGN_TONE = {
  draft: 'muted', scheduled: 'info', active: 'success', closed: 'warning', archived: 'muted',
};
export const CampaignBadge = ({ status }) => (
  <Badge variant={CAMPAIGN_TONE[status] || 'muted'}>{status}</Badge>
);

// ── Category score list — a labelled meter per category ──────────────────────
//  Magnitude on a 0–5 scale, so the bar is proportional and the number rides
//  beside it; identity never rests on colour.
export const CategoryScores = ({ categories }) => {
  if (!categories?.length) return <Empty icon="📊" title="No category scores yet" />;
  return (
    <ul style={{ display: 'grid', gap: 12, listStyle: 'none', margin: 0, padding: 0 }}>
      {categories.map((c) => (
        <li key={c._id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 10 }}>
            <span style={{ fontSize: '.83rem' }}>{c.name}</span>
            <strong style={{ fontSize: '.86rem', color: ratingColor(c.average) }}>
              {c.average == null ? '—' : c.average.toFixed(1)}
            </strong>
          </div>
          <div style={{ background: '#eef2f7', borderRadius: 99, height: 8, overflow: 'hidden' }}>
            <div style={{
              width: `${((c.average || 0) / 5) * 100}%`, height: '100%',
              background: ratingColor(c.average), borderRadius: 99,
            }} />
          </div>
        </li>
      ))}
    </ul>
  );
};
