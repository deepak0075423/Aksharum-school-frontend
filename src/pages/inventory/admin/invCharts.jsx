/**
 * Inventory — the charts the twelve mockups draw. Hand-written SVG; no chart
 * library, because three shapes do not justify one.
 *
 * THE COLOURS. `SERIES` below is the output of the dataviz validator: adjacent
 * pairs are distinguishable under the three common colour-vision deficiencies,
 * every hue clears the chroma floor, they sit inside one lightness band, and
 * each one clears 3:1 against both the light card behind it and white text on
 * top of it. Reordering it, or adding a seventh, re-opens all four of those
 * checks — which is why a sixth-and-beyond category folds into a neutral
 * "Others" slice on the server rather than being given a generated hue.
 *
 * THE TRAP, from the Transport module's redesign: `preserveAspectRatio="none"`
 * turns one horizontal SVG unit into one PERCENT of the element's width, so a
 * fixed left gutter silently squeezes the whole drawing into the right-hand
 * part of the card, and every round point marker becomes a slash. Nothing here
 * sets it. Axis gutters are real DOM columns (`.inv-plot`) and tick labels are
 * HTML, so the SVG always uses its whole coordinate range.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { count, num, pct } from './invUI';

/**
 * The element's own width in pixels.
 *
 * The charts need it because they draw in REAL pixel coordinates. A viewBox of
 * "0 0 100 100" in a 270×186 box does not stretch: the default
 * preserveAspectRatio letterboxes it, so the whole plot is scaled to the
 * height and centred, leaving a chart two-thirds the width of its card with
 * the x-axis labels no longer under their own points. The other way out,
 * preserveAspectRatio="none", stretches one unit to one percent of the width
 * and turns every round marker into a slash. Measuring is the way that keeps
 * both the width and the shapes.
 */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(el.clientWidth || 0);
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** The categorical order. See the note above before touching it. */
export const SERIES = ['#4f46e5', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6'];
export const NEUTRAL = '#cbd5e1';

/** Status colours, which are NOT categorical — each one means a fixed thing. */
export const STATE_COLOR = {
  in_stock: '#22c55e', low_stock: '#f59e0b', out_of_stock: '#ef4444',
  under_repair: '#8b5cf6', not_tracked: '#cbd5e1',
  in_use: '#22c55e', under_maintenance: '#f59e0b', out_of_service: '#ef4444', retired: '#cbd5e1',
  spent: '#f59e0b', allocated: '#4f46e5', remaining: '#22c55e',
};

/** The colour for slice `i`, with the tail slice always neutral. */
export const sliceColor = (i, key) => (key === 'others' || key === 'none' ? NEUTRAL : SERIES[i % SERIES.length]);

/* ── Donut ───────────────────────────────────────────────────────────────── */

const polar = (cx, cy, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
function arc(cx, cy, rOuter, rInner, from, to) {
  // A full circle cannot be drawn as one arc — its start and end points are the
  // same, so the path collapses and the ring disappears. One slice at 100% is
  // the normal case for a school with a single category, so it is two arcs.
  if (to - from >= 359.999) {
    const [x1, y1] = polar(cx, cy, rOuter, 0);
    const [x2, y2] = polar(cx, cy, rOuter, 180);
    const [x3, y3] = polar(cx, cy, rInner, 180);
    const [x4, y4] = polar(cx, cy, rInner, 0);
    return `M${x1},${y1}A${rOuter},${rOuter} 0 0 1 ${x2},${y2}A${rOuter},${rOuter} 0 0 1 ${x1},${y1}`
      + `L${x4},${y4}A${rInner},${rInner} 0 0 0 ${x3},${y3}A${rInner},${rInner} 0 0 0 ${x4},${y4}Z`;
  }
  const [sx, sy] = polar(cx, cy, rOuter, to);
  const [ex, ey] = polar(cx, cy, rOuter, from);
  const [isx, isy] = polar(cx, cy, rInner, from);
  const [iex, iey] = polar(cx, cy, rInner, to);
  const big = to - from > 180 ? 1 : 0;
  return `M${sx},${sy}A${rOuter},${rOuter} 0 ${big} 0 ${ex},${ey}L${isx},${isy}A${rInner},${rInner} 0 ${big} 1 ${iex},${iey}Z`;
}

/**
 * slices: [{ key, label, value, pct, color? }]
 * The centre carries the total and what it counts; the legend is a list of
 * buttons, so a slice can be muted to read the rest.
 */
export function Donut({
  slices = [], total, unit = 'Items', size = 164, thickness = 24,
  centre, legend = true, legendRender, colorOf, onPick,
}) {
  const [off, setOff] = useState(() => new Set());
  const rows = slices.map((s, i) => ({
    ...s,
    color: s.color || (colorOf ? colorOf(s, i) : sliceColor(i, s.key)),
    muted: off.has(s.key),
  }));
  const live = rows.filter(r => !r.muted);
  const sum = live.reduce((a, s) => a + num(s.value), 0);
  const shown = total != null && !off.size ? num(total) : sum;

  const cx = size / 2; const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter - thickness;

  let cursor = 0;
  const paths = live.filter(s => num(s.value) > 0).map((s) => {
    const sweep = (num(s.value) / (sum || 1)) * 360;
    const d = arc(cx, cy, rOuter, rInner, cursor, cursor + sweep);
    cursor += sweep;
    return { key: s.key, d, color: s.color, label: s.label, value: s.value };
  });

  const toggle = (key) => setOff(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    // Muting the last live slice would leave an empty ring and no way back.
    else if (live.length > 1) next.add(key);
    return next;
  });

  return (
    <div className="inv-donut">
      <div className="inv-donut__svg" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
          aria-label={`${count(shown)} ${unit} by ${rows.map(r => r.label).join(', ')}`}>
          {paths.length
            ? paths.map(p => (
              <path key={p.key} d={p.d} fill={p.color}>
                <title>{p.label}: {count(p.value)}</title>
              </path>
            ))
            : <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke="#eef2f7" strokeWidth={thickness} />}
        </svg>
        <div className="inv-donut__mid">
          {centre ?? (<><strong>{count(shown)}</strong><span>{unit}</span></>)}
        </div>
      </div>
      {legend ? (
        <div className="inv-donut__legend">
          {rows.map((s) => (
            <button
              key={s.key} type="button"
              className={`inv-legend${s.muted ? ' is-off' : ''}`}
              onClick={() => (onPick ? onPick(s) : toggle(s.key))}
              aria-pressed={!s.muted}
            >
              <i className="inv-dot" style={{ background: s.color }} />
              <span className="inv-legend__name">{s.label}</span>
              <span className="inv-legend__end">
                {legendRender ? legendRender(s) : (
                  <>
                    <span className="inv-legend__v">{count(s.value)}</span>
                    <span className="inv-legend__p">({s.pct ?? pct(s.value, total ?? sum)}%)</span>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── Multi-series area / line chart ──────────────────────────────────────── */

/**
 * An axis top that divides evenly into `ticks` round steps.
 *
 * Rounding the MAXIMUM and then dividing gave 0 / 3 / 5 / 8 / 10 — arithmetic
 * that is correct and unreadable. The step is rounded instead, and the top
 * follows from it, so the labels are always 0 / 50 / 100 / 150 / 200.
 */
function niceAxis(v, ticks = 4) {
  if (!(v > 0)) return 10 * ticks === 0 ? 10 : 10;
  const raw = v / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  // 1, 2, 5, 10 only: a 2.5 step reads as 0 / 3 / 5 / 8 / 10 once the labels
  // are rounded, which is arithmetically right and visually broken.
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  return step * ticks;
}

/**
 * data:   [{ label, [seriesKey]: number, ... }]
 * series: [{ key, label, color }]
 *
 * The y axis and the x labels are HTML in `.inv-plot`'s own grid columns, so
 * the SVG is free to use its whole 0–100 range. See the note at the top.
 */
export function AreaTrend({ data = [], series = [], height = 190, ticks = 4, fmt = count, area = true }) {
  const gid = useId().replace(/:/g, '');
  const [box, W] = useWidth();
  const max = useMemo(
    () => niceAxis(Math.max(1, ...data.flatMap(d => series.map(s => num(d[s.key])))), ticks),
    [data, series, ticks],
  );

  if (!data.length) return <div className="inv-empty inv-empty--sm"><p>No movement recorded in this window.</p></div>;

  // Room for a marker's radius at each edge, so a point on the axis is not
  // sliced in half by the edge of the box.
  const PAD = 4;
  const H = height;
  const x = (i) => (data.length === 1 ? W / 2 : PAD + (i / (data.length - 1)) * Math.max(0, W - PAD * 2));
  const y = (v) => H - PAD - (num(v) / max) * (H - PAD * 2);
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max / ticks) * (ticks - i)));

  return (
    <div className="inv-plot">
      <div className="inv-plot__y" style={{ height }}>
        {tickVals.map(t => <span key={t}>{fmt(t)}</span>)}
      </div>
      <div className="inv-plot__area" ref={box}>
        {W > 0 ? (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
            aria-label={series.map(s => `${s.label}: ${data.map(d => `${d.label} ${fmt(d[s.key])}`).join(', ')}`).join('. ')}>
            <defs>
              {series.map(s => (
                <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity=".24" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {/* Grid lines, under everything. */}
            {tickVals.map(t => (
              <line key={t} x1="0" x2={W} y1={y(t)} y2={y(t)} stroke="#eef2f7" strokeWidth="1" />
            ))}
            {series.map((s) => {
              const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[s.key]).toFixed(1)}`).join(' ');
              return (
                <g key={s.key}>
                  {area ? <path d={`${line} L${x(data.length - 1)},${H} L${x(0)},${H} Z`} fill={`url(#${gid}-${s.key})`} /> : null}
                  <path d={line} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              );
            })}
            {/* Markers last, so a line never runs over a point. */}
            {series.map(s => data.map((d, i) => (
              <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(d[s.key])} r="3.4" fill="#fff" stroke={s.color} strokeWidth="2">
                <title>{d.label} — {s.label}: {fmt(d[s.key])}</title>
              </circle>
            )))}
          </svg>
        ) : <div style={{ height: H }} />}
      </div>
      <div className="inv-plot__x">
        {data.map((d, i) => <span key={`${d.label}-${i}`}>{d.label}</span>)}
      </div>
    </div>
  );
}

export const ChartLegend = ({ series = [] }) => (
  <div className="inv-chartlegend">
    {series.map(s => (
      <span key={s.key}><i className="inv-dot" style={{ background: s.color }} />{s.label}</span>
    ))}
  </div>
);

/* ── Vertical bars ───────────────────────────────────────────────────────── */

/** bars: [{ key, label, value, color? }] — Asset Status Overview. */
export function VBars({ bars = [], height = 190, colorOf }) {
  const max = Math.max(1, ...bars.map(b => num(b.value)));
  if (!bars.length) return <div className="inv-empty inv-empty--sm"><p>Nothing to plot yet.</p></div>;
  return (
    <div className="inv-vbars" style={{ height }}>
      {bars.map((b, i) => (
        <div className="inv-vbar" key={b.key}>
          <span className="inv-vbar__v">{count(b.value)}</span>
          <span className="inv-vbar__track">
            <span
              className="inv-vbar__fill"
              style={{
                height: `${Math.max(2, (num(b.value) / max) * 100)}%`,
                background: b.color || colorOf?.(b, i) || STATE_COLOR[b.key] || SERIES[i % SERIES.length],
              }}
              title={`${b.label}: ${count(b.value)}`}
            />
          </span>
          <span className="inv-vbar__k">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Two-scale bar + line ────────────────────────────────────────────────── */

/**
 * Money on the left, a count on the right — the Budgets "Monthly Overview".
 *
 * Two scales on one plot is an anti-pattern, so it is mitigated the way the
 * exception requires: BOTH axes carry tick labels, the two series use different
 * mark shapes (bars against a line with round markers), and the legend names
 * which axis each one belongs to.
 */
export function BarLine({
  data = [], bar = { key: 'spent', label: 'Spent', color: '#4f46e5' },
  line = { key: 'allocated', label: 'Allocated', color: '#f59e0b' },
  height = 210, fmtLeft = count, fmtRight = count, ticks = 4,
}) {
  const [box, W] = useWidth();
  const maxBar = niceAxis(Math.max(1, ...data.map(d => num(d[bar.key]))), ticks);
  const maxLine = niceAxis(Math.max(1, ...data.map(d => num(d[line.key]))), ticks);
  if (!data.length) return <div className="inv-empty inv-empty--sm"><p>No spending recorded yet.</p></div>;

  const PAD = 4;
  const H = height;
  const slot = W / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(slot * 0.5, 26));
  const x = (i) => slot * i + slot / 2;
  const yB = (v) => H - PAD - (num(v) / maxBar) * (H - PAD * 2);
  const yL = (v) => H - PAD - (num(v) / maxLine) * (H - PAD * 2);
  const fracs = Array.from({ length: ticks + 1 }, (_, i) => (ticks - i) / ticks);
  const linePath = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yL(d[line.key]).toFixed(1)}`).join(' ');

  return (
    <>
      <div className="inv-plot" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
        <div className="inv-plot__y" style={{ height }}>
          {fracs.map(t => <span key={t}>{fmtLeft(Math.round(maxBar * t))}</span>)}
        </div>
        <div className="inv-plot__area" ref={box}>
          {W > 0 ? (
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
              aria-label={`${bar.label} and ${line.label} by month`}>
              {fracs.map(t => (
                <line key={t} x1="0" x2={W} y1={H - PAD - t * (H - PAD * 2)} y2={H - PAD - t * (H - PAD * 2)}
                  stroke="#eef2f7" strokeWidth="1" />
              ))}
              {data.map((d, i) => {
                const top = yB(d[bar.key]);
                return (
                  <rect key={i} x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1, H - PAD - top)} rx="3" fill={bar.color}>
                    <title>{d.label} — {bar.label}: {fmtLeft(d[bar.key])}</title>
                  </rect>
                );
              })}
              <path d={linePath} fill="none" stroke={line.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              {data.map((d, i) => (
                <circle key={`p${i}`} cx={x(i)} cy={yL(d[line.key])} r="3.4" fill="#fff" stroke={line.color} strokeWidth="2">
                  <title>{d.label} — {line.label}: {fmtRight(d[line.key])}</title>
                </circle>
              ))}
            </svg>
          ) : <div style={{ height: H }} />}
        </div>
        <div className="inv-plot__y" style={{ height, alignItems: 'flex-start' }}>
          {fracs.map(t => <span key={t}>{fmtRight(Math.round(maxLine * t))}</span>)}
        </div>
        <div className="inv-plot__x">
          {data.map((d, i) => <span key={`${d.label}-${i}`}>{d.label}</span>)}
        </div>
      </div>
      <div className="inv-chartlegend" style={{ marginTop: 10 }}>
        <span><i className="inv-dot" style={{ background: bar.color, borderRadius: 2 }} />{bar.label} (left axis)</span>
        <span><i className="inv-dot" style={{ background: line.color }} />{line.label} (right axis)</span>
      </div>
    </>
  );
}
