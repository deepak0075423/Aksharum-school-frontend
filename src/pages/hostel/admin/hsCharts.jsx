/**
 * The Hostel dashboard's two charts, hand-written SVG like the Inventory and
 * Transport kits'.
 *
 * Both draw in real pixels. A `viewBox` stretched to its box either letterboxes
 * (the default preserveAspectRatio) or squashes every round mark into a slash
 * (`none`) — both have already cost this repo a pass — so the column chart
 * measures its plot and the donut is square by construction.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { num } from './hsUI';

/* ── Donut ───────────────────────────────────────────────────────────────── */

/**
 * slices: [{ key, value, color }], drawn clockwise from twelve o'clock, each
 * as its share of `total` (default: the slices' own sum). With a `total`
 * larger than the slices the rest of the ring stays bare track — which is how
 * the Bed Occupancy card shows free beds, and why "0% Occupied" is an empty
 * ring, as the mockup draws it.
 */
export function Donut({ slices = [], total: whole, size = 176, thickness = 25, track = '#edf0f6', label, children }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = whole ?? slices.reduce((s, x) => s + num(x.value), 0);
  const drawn = slices.filter((s) => num(s.value) > 0);
  const gap = drawn.length > 1 || (drawn.length && drawn.reduce((s, x) => s + num(x.value), 0) < total) ? 1.5 : 0;
  let at = 0;
  return (
    // The drawn size comes from CSS (--donut), so a narrow card can shrink it;
    // `size` only sets the geometry, which the square viewBox scales.
    <div className="hs-donut" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        {total > 0 ? drawn.map((s) => {
          const len = (num(s.value) / total) * c;
          const el = (
            <circle
              key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-at}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          at += len;
          return el;
        }) : null}
      </svg>
      <div className="hs-donut__center">{children}</div>
    </div>
  );
}

/* ── Columns ─────────────────────────────────────────────────────────────── */

/** The width of an element, kept current. */
function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/**
 * Four equal steps from zero. The STEP is rounded and the top follows —
 * rounding the maximum gives ticks like 0 / 3 / 5 / 8 / 10. The ladder is
 * finer than 1-2-5, which leaves a ₹4.2L month in an 8L chart, half of it
 * empty; every rung still gives round ticks (1.5L / 3L / 4.5L / 6L). With
 * nothing to plot the axis reads 0–4, as the mockup's does.
 */
const LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
export function niceAxis(max, steps = 4) {
  if (!(max > 0)) return { top: steps, ticks: Array.from({ length: steps + 1 }, (_, i) => i) };
  const raw = max / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  let step = LADDER.find((r) => r >= raw / mag - 1e-9) * mag;
  if (Number.isInteger(max) && step < 1) step = 1;    // no 0.5 on a count
  return { top: step * steps, ticks: Array.from({ length: steps + 1 }, (_, i) => +(i * step).toFixed(6)) };
}

/**
 * Grouped columns with a dashed grid, the axis on the left and the bottom, and
 * a tick under each group — the mockup's Monthly Fee Collection.
 *
 *   data    [{ key, label, title?, ...values }]
 *   series  [{ key, label, color }]
 *   tick    formats an axis value; `tip` formats a value in the tooltip
 */
export function Columns({ data = [], series = [], height = 119, tick = String, tip = String, label }) {
  const plot = useRef(null);
  const tipRef = useRef(null);
  const w = useWidth(plot);
  const [hover, setHover] = useState(null);
  const [tipW, setTipW] = useState(150);
  useLayoutEffect(() => { if (tipRef.current) setTipW(tipRef.current.offsetWidth); }, [hover]);

  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => num(d[s.key]))));
  const axis = niceAxis(max);
  const n = Math.max(1, data.length);
  const slot = w / n;
  const bw = Math.max(3, Math.min(11, slot * 0.24));
  const gap = Math.min(3, bw * 0.3);
  const y = (v) => height - (num(v) / axis.top) * height;

  return (
    <div className="hs-cols">
      <div className="hs-cols__y" aria-hidden>
        {axis.ticks.map((t) => <span key={t}>{tick(t)}</span>)}
      </div>
      <div
        className="hs-cols__plot" ref={plot} style={{ height }}
        role="img" aria-label={label}
        onMouseLeave={() => setHover(null)}
      >
        {w > 0 ? (
          <svg width={w} height={height} aria-hidden focusable="false">
            {axis.ticks.slice(1).map((t) => (
              <line key={t} x1={0} x2={w} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5}
                stroke="#dfe3eb" strokeDasharray="4 4" />
            ))}
            {data.map((d, i) => {
              const cx = slot * i + slot / 2;
              const groupW = series.length * bw + (series.length - 1) * gap;
              return (
                <g key={d.key}>
                  <rect x={slot * i} y={0} width={slot} height={height} fill={hover === i ? 'rgba(79,70,229,.05)' : 'transparent'}
                    onMouseEnter={() => setHover(i)} />
                  {series.map((s, j) => {
                    const v = num(d[s.key]);
                    if (v <= 0) return null;
                    const top = y(v);
                    const x = cx - groupW / 2 + j * (bw + gap);
                    const h = Math.max(2, height - top);
                    const rr = Math.min(3, bw / 2, h);
                    return (
                      <path key={s.key} fill={s.color} pointerEvents="none"
                        d={`M${x},${height} V${height - h + rr} Q${x},${height - h} ${x + rr},${height - h} H${x + bw - rr} Q${x + bw},${height - h} ${x + bw},${height - h + rr} V${height} Z`} />
                    );
                  })}
                  <line x1={cx} x2={cx} y1={height} y2={height + 5} stroke="#8e94ab" />
                </g>
              );
            })}
            <line x1={0.5} x2={0.5} y1={0} y2={height} stroke="#aab0c2" />
            <line x1={0} x2={w} y1={height - 0.5} y2={height - 0.5} stroke="#8e94ab" />
          </svg>
        ) : null}
        {hover != null && data[hover] ? (
          // Over the month, at the top of the plot and kept inside it — above
          // the plot it covered the card's own title.
          <div className="hs-tip" ref={tipRef}
            style={{ left: Math.max(0, Math.min(slot * hover + slot / 2 - tipW / 2, w - tipW)) }}>
            <b>{data[hover].title || data[hover].label}</b>
            {series.map((s) => (
              <div key={s.key}><i style={{ '--key': s.color }} />{s.label}: {tip(data[hover][s.key])}</div>
            ))}
          </div>
        ) : null}
      </div>
      <div className={`hs-cols__x${slot > 0 && slot < 26 ? ' hs-cols__x--dense' : ''}`} aria-hidden>
        {data.map((d) => <span key={d.key}>{d.label}</span>)}
      </div>
    </div>
  );
}

/** The key under a chart; `text` colours a label, as the mockup's Collected is. */
export const Keys = ({ items = [] }) => (
  <div className="hs-keys">
    {items.map((k) => (
      <span className="hs-key" key={k.label} style={{ '--key': k.color, ...(k.text ? { '--key-text': k.text } : null) }}>
        <i />{k.label}
      </span>
    ))}
  </div>
);
