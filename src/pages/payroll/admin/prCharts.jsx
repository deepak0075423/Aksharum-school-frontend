/**
 * The Payroll screens' charts — hand-drawn inline SVG rather than a charting
 * package: two forms (a grouped bar and a donut) are not worth a 375 kB chunk,
 * and the rest of this app draws its charts the same way.
 *
 * ── Colour ──────────────────────────────────────────────────────────────────
 * Both palettes below were run through the palette validator against the white
 * card surface, not chosen by eye.
 *
 *   SERIES (gross / deductions / net) — #2563eb, #ec4899, #16a34a
 *       all six checks PASS; worst adjacent pair ΔE 8.8 under deuteranopia.
 *
 *   CATEGORICAL (donut slices, fixed order, never cycled)
 *       #2563eb, #16a34a, #d97706, #a21caf, #ec4899, #0891b2
 *       passes every check over ALL pairs, with one warning: green ↔ amber sit
 *       at ΔE 6.2 under protanopia. That is the floor band, which is legal only
 *       with secondary encoding — so every donut here ships a named legend
 *       carrying the value and the share, 2px surface gaps between slices, and
 *       hover dimming. The mockups' violet (#a855f7) and teal (#14b8a6) are not
 *       used: the first is indistinguishable from the blue under deuteranopia
 *       and the second sits ΔE 10.8 from the green for NORMAL vision, which is a
 *       hard fail no amount of labelling excuses.
 *
 * A seventh category is never a generated hue — it folds into "Other", which
 * wears the neutral.
 */
import React, { useState } from 'react';
import { compactMoney, money, useWidth, Mark } from './prUI';

export const SERIES = { gross: '#2563eb', deductions: '#ec4899', net: '#16a34a' };
export const CATEGORICAL = ['#2563eb', '#16a34a', '#d97706', '#a21caf', '#ec4899', '#0891b2'];
export const OTHER_INK = '#64748b';

/** The colour for slot `i`, in fixed order; anything past the sixth is "Other". */
export const inkAt = (i) => CATEGORICAL[i] || OTHER_INK;

/** A round ceiling and step for the y axis: 5.4L → 6L in 2L steps. */
export function niceScale(max, ticks = 4) {
  if (!(max > 0)) return { top: ticks, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
  return { top: step * Math.ceil(max / step), step };
}

/** A rect with only its top corners rounded — data ends round, baselines stay square. */
function topRounded(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function Tip({ tip }) {
  if (!tip) return null;
  return <div className="pr-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>;
}

export const Legend = ({ items }) => (
  <div className="pr-legend">
    {items.map(it => (
      <span key={it.label}><i style={{ background: it.color }} />{it.label}</span>
    ))}
  </div>
);

/**
 * Gross / deductions / net, one group of three bars per month.
 *
 * Three series of the same measure (rupees) on ONE axis — never two scales.
 * Each bar carries its own hover tooltip; the legend names all three because
 * colour alone must not be the only thing telling them apart.
 */
export function PayBars({ data = [], height = 236, sym = '₹', empty }) {
  const [ref, w] = useWidth(620);
  const [tip, setTip] = useState(null);

  const hasData = data.some(d => (d.gross || d.deductions || d.net));
  const padL = 56, padR = 8, padT = 12, padB = 30;
  const plotW = Math.max(60, w - padL - padR);
  const plotH = height - padT - padB;
  const max = Math.max(...data.flatMap(d => [d.gross || 0, d.deductions || 0, d.net || 0]), 0);
  const { top, step } = niceScale(max || 1);
  const ticks = [];
  for (let v = 0; v <= top + 0.001; v += step) ticks.push(v);

  const slot = data.length ? plotW / data.length : plotW;
  const groupW = Math.min(slot * 0.62, 74);
  // A 2px surface gap between adjacent bars, as the mark spec asks.
  const barW = Math.max(4, (groupW - 4) / 3);
  const y = (v) => padT + plotH - (top > 0 ? (v / top) * plotH : 0);

  const keys = [['gross', 'Gross Pay'], ['deductions', 'Deductions'], ['net', 'Net Pay']];

  return (
    <div className="pr-chart" ref={ref}>
      <svg viewBox={`0 0 ${w} ${height}`} role="img" aria-label="Payroll by month">
        {ticks.map(v => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="#eef1f6" strokeWidth="1" />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="#94a3b8">
              {v === 0 ? `${sym} 0` : `${sym}${compactMoney(v, '').replace(/^₹/, '')}`}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = padL + i * slot + (slot - groupW) / 2;
          return (
            <g key={`${d.label}-${i}`}>
              {keys.map(([k], j) => {
                const v = d[k] || 0;
                const h = top > 0 ? (v / top) * plotH : 0;
                const x = gx + j * (barW + 2);
                return (
                  <path key={k} d={topRounded(x, y(v), barW, h, 4)} fill={SERIES[k]}
                    onMouseEnter={e => setTip({
                      x: x + barW / 2,
                      y: y(v) - 8,
                      text: `${d.label} · ${keys[j][1]}: ${money(v, { sym })}`,
                    })}
                    onMouseLeave={() => setTip(null)} />
                );
              })}
              {/* A generous, invisible hit target so a zero-height bar is still hoverable. */}
              <rect x={gx - 4} y={padT} width={groupW + 8} height={plotH} fill="transparent" />
              <text x={gx + groupW / 2} y={height - 10} textAnchor="middle" fontSize="11" fill="#64748b">{d.label}</text>
            </g>
          );
        })}
        <line x1={padL} x2={w - padR} y1={padT + plotH} y2={padT + plotH} stroke="#e2e8f0" strokeWidth="1" />
      </svg>
      {!hasData && empty ? (
        <div style={{
          position: 'absolute', inset: `${padT}px ${padR}px ${padB}px ${padL}px`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', gap: 8,
        }}>
          {empty}
        </div>
      ) : null}
      <Tip tip={tip} />
      <Legend items={keys.map(([k, label]) => ({ label, color: SERIES[k] }))} />
    </div>
  );
}

/** Font size that keeps `text` inside the donut's hole (≈0.58em per character). */
function centreSize(text, hole) {
  const ideal = hole * 0.28;
  const fit = (hole * 0.92) / Math.max(1, text.length * 0.58);
  return Math.max(11, Math.min(ideal, fit));
}

/**
 * A donut. Slices keep a 2px surface gap, and hovering one dims the rest — the
 * secondary encoding the palette's floor-band pair requires.
 */
export function Donut({ slices = [], size = 176, thickness = 28, center, hover, onHover }) {
  const total = slices.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="pr-donutwrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={center?.label ? `${center.label}: ${center.value}` : 'Distribution'}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#eef1f6" strokeWidth={thickness} />
        {total > 0 && slices.map((s, i) => {
          const frac = (Number(s.value) || 0) / total;
          const len = frac * circumference;
          // 2px of surface between slices; a slice too small to hold the gap
          // keeps its whole length so it does not vanish.
          const gap = len > 6 ? 2 : 0;
          const dash = `${Math.max(0, len - gap)} ${circumference - Math.max(0, len - gap)}`;
          const rot = (offset / circumference) * 360 - 90;
          offset += len;
          const dim = hover !== undefined && hover !== null && hover !== i;
          return (
            <circle key={`${s.name}-${i}`} cx={c} cy={c} r={r} fill="none"
              stroke={s.color || inkAt(i)} strokeWidth={thickness}
              strokeDasharray={dash} transform={`rotate(${rot} ${c} ${c})`}
              opacity={dim ? 0.32 : 1} style={{ transition: 'opacity .15s ease', cursor: onHover ? 'pointer' : 'default' }}
              onMouseEnter={() => onHover?.(i)} onMouseLeave={() => onHover?.(null)} />
          );
        })}
        {center ? (
          <>
            {/* The hole is only (size − 2×thickness) wide, so a long value like
                "₹3,21,282" has to step down or it paints over the ring. */}
            <text x={c} y={c - 2} textAnchor="middle" fontWeight="700" fill="#0f172a"
              fontSize={centreSize(String(center.value), size - thickness * 2)}>
              {center.value}
            </text>
            <text x={c} y={c + size * 0.13} textAnchor="middle" fontSize={size * 0.072} fill="#64748b">{center.label}</text>
          </>
        ) : null}
      </svg>
    </div>
  );
}

/**
 * The donut's legend — the slice name, and its value or share. Always present:
 * with six categories colour alone cannot carry identity.
 */
export function DonutLegend({ rows = [], hover, onHover, showPct, sym = '₹' }) {
  return (
    <div className="pr-dlegend">
      {rows.map((r, i) => (
        <div key={`${r.name}-${i}`}
          className={`pr-dlegend__row${hover !== undefined && hover !== null && hover !== i ? ' is-dim' : ''}`}
          onMouseEnter={() => onHover?.(i)} onMouseLeave={() => onHover?.(null)}>
          <i style={{ background: r.color || inkAt(i) }} />
          <span title={r.name}>{r.name}</span>
          <b>{showPct ? `${r.pct}%` : (r.money ? money(r.value, { sym }) : r.value)}</b>
        </div>
      ))}
    </div>
  );
}

/** The "no data yet" block the mockups draw inside the empty chart. */
export const ChartEmpty = ({ glyph = 'bars', title, hint }) => (
  <>
    <Mark glyph={glyph} tone="slate" size={54} />
    <b style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--pr-ink)' }}>{title}</b>
    <span style={{ fontSize: '.82rem', color: 'var(--pr-muted)' }}>{hint}</span>
  </>
);
