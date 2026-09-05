/**
 * The chart palette, on its own so a page can have the colours without the
 * charting library.
 *
 * viz.jsx imports recharts at the top level, so anything importing VIZ from it
 * pulled the whole 105 kB chunk in — including screens that draw their figures
 * from divs. viz.jsx re-exports everything here, so its own importers are
 * unchanged; import from this file when all you need is a colour.
 */
// ── Palette ───────────────────────────────────────────────────────────────────
//  Every value below was run through the data-viz validator against this app's
//  light surface before being written down:
//
//   • accent (single-series magnitude & trend lines) — passes standalone, ≥3:1
//   • good / warn / bad (status: present / late / absent, paid / due …) — the
//     three app status tokens pass the lightness, chroma, CVD (worst adjacent
//     ΔE 8.9) and normal-vision (ΔE 19.8) checks. Contrast against the surface
//     is under 3:1, which obligates *relief*: every chart using them ships
//     visible labels and a table of the same numbers beside it. Both are here.
//   • band1..4 (ordered attendance bands) — a single-hue ordinal ramp: monotone
//     lightness, ≥0.06 ΔL per step, light end clears the 2:1 floor, 3° hue spread.
//
//  Status hues mean state and are never reused as "series N". Ordered bands use
//  the ramp, never the status trio.
export const VIZ = {
  accent: '#4f46e5',
  good:   '#10b981',
  warn:   '#f59e0b',
  bad:    '#ef4444',
  bands:  ['#9aa8fb', '#7c86f5', '#5b52e8', '#3730a3'],
  grid:   '#e2e8f0',
  ink:    '#0f172a',
  muted:  '#64748b',
  surface:'#ffffff',
};

// Percentages carry meaning, so give them a consistent status reading.
export const toneForPercent = (p) => (p == null ? 'muted' : p >= 75 ? 'good' : p >= 50 ? 'warn' : 'bad');
export const toneColor = { good: VIZ.good, warn: VIZ.warn, bad: VIZ.bad, muted: VIZ.muted, accent: VIZ.accent };

