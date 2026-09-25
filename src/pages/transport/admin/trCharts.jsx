/**
 * Hand-written SVG charts for the Transport admin screens.
 *
 * No chart library: the mockups ask for a specific set of shapes and the whole
 * module needs about nine of them, so they are drawn directly. Every chart here
 * follows the same rules —
 *   · thin marks, 4px rounded data-ends anchored to the baseline, 2px lines;
 *   · a 2px surface gap between stacked segments and adjacent bars;
 *   · a recessive grid (one hairline per tick, no vertical rules, no frame);
 *   · text in ink tokens, never in the series colour — a colour chip beside a
 *     label carries identity instead;
 *   · a legend whenever there are two or more series, and direct labels only
 *     where the mockup shows them, never a number on every point;
 *   · a hover layer on every plotted mark (a <title>, which is the tooltip a
 *     screen reader also reads).
 *
 * SERIES is the validated categorical order (see ROUTE_COLORS on the server —
 * the same eight hues, same order). STATUS is a reserved state palette and is
 * never used as "series 5".
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { compactMoney, compact, num, count } from './trUI';

/* ── Palettes ─────────────────────────────────────────────────────────────── */

/** Categorical identity. Assigned in fixed order, never cycled. */
export const SERIES = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#a16207'];
/** A ninth category folds into this neutral; it is not a ninth hue. */
export const OTHER = '#94a3b8';
/** Reserved state colours — never reused for a data series. */
export const STATUS_INK = {
  good: '#16a34a', info: '#2563eb', warn: '#d97706', bad: '#dc2626', quiet: '#94a3b8',
  green: '#16a34a', blue: '#2563eb', amber: '#d97706', red: '#dc2626', slate: '#94a3b8',
  purple: '#7c3aed', pink: '#db2777', teal: '#0891b2', orange: '#ea580c',
};
export const ink = (tone, i = 0) => STATUS_INK[tone] || SERIES[i % SERIES.length];
export const seriesColor = (i) => (i < SERIES.length ? SERIES[i] : OTHER);

const GRID = '#eef2f7';
const AXIS = '#94a3b8';

/* ── Scales ───────────────────────────────────────────────────────────────── */

/** A tick scale that ends on a round number, with 4–5 gridlines. */
export function niceScale(max, ticks = 4) {
  const m = Math.max(1, num(max));
  const raw = m / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) || mag * 10;
  // Counts have no halves: a chart topping out at 2 incidents was labelled
  // 0 · 0.5 · 1 · 1.5 · 2. When the maximum is a small whole number the ticks
  // are whole numbers too, even if that means fewer of them.
  if (Number.isInteger(m)) step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(m / step) * step;
  return { top, step, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

/** A rounded-top bar path: square where it meets the baseline, round on top. */
function barPath(x, y, w, h, r = 4) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0.4) return '';
  return `M${x} ${y + h}V${y + rr}a${rr} ${rr} 0 0 1 ${rr} -${rr}h${w - rr * 2}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${y + h}Z`;
}

export const Legend = ({ items = [], style }) => (
  <div className="tr-legend" style={style}>
    {items.filter(Boolean).map((it) => (
      <span key={it.label}><i style={{ background: it.color }} />{it.label}</span>
    ))}
  </div>
);

/* ── Donut ────────────────────────────────────────────────────────────────── */

/**
 * A ring with a figure in the middle.
 *
 * Segments are separated by a 2px gap in the surface colour so two adjacent
 * slices never bleed into one another. A donut with nothing in it draws an
 * empty ring rather than disappearing.
 */
export function Donut({ data = [], size = 168, thickness = 26, total, label, sub, gap = 2 }) {
  const rows = data.filter((d) => num(d.value) > 0);
  const sum = rows.reduce((s, d) => s + num(d.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gapFrac = rows.length > 1 ? (gap / c) * 100 : 0;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="tr-donut" role="img"
         aria-label={label ? `${label}: ${count(total ?? sum)}` : 'Donut chart'}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GRID} strokeWidth={thickness} />
      {rows.map((d, i) => {
        const frac = (num(d.value) / sum) * 100;
        const dash = Math.max(0, (frac - gapFrac) / 100) * c;
        const el = (
          <circle key={d.label ?? i} cx={size / 2} cy={size / 2} r={r} fill="none"
                  stroke={d.color || seriesColor(i)} strokeWidth={thickness}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-(acc / 100) * c}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <title>{`${d.label}: ${count(d.value)}${sum ? ` (${Math.round(frac)}%)` : ''}`}</title>
          </circle>
        );
        acc += frac;
        return el;
      })}
      {total != null || label ? (
        <>
          {(() => {
            // The ring's hole is what the figure has to fit in, so a long one
            // ("2,850 L", "₹1,25,430") is stepped down rather than spilling
            // over the stroke.
            const text = typeof total === 'number' ? count(total) : String(total ?? '');
            const hole = size - thickness * 2;
            // Bold digits advance at roughly .6em, so a string of n characters
            // needs n * .6 * fs of room. Solving that for 90% of the hole is
            // what keeps "₹24,000" off the ring instead of across it.
            const fs = Math.min(size * 0.185, (hole * 0.9) / (Math.max(3, text.length) * 0.6));
            return (
              <text x="50%" y={size / 2 - (sub || label ? 6 : 0)} textAnchor="middle" dominantBaseline="central"
                    style={{ fontSize: fs, fontWeight: 700, fill: 'var(--tr-ink)' }}>{text}</text>
            );
          })()}
          {(sub || label) ? (
            <text x="50%" y={size / 2 + size * 0.115} textAnchor="middle" dominantBaseline="central"
                  style={{ fontSize: size * 0.078, fill: 'var(--tr-muted)' }}>{sub || label}</text>
          ) : null}
        </>
      ) : null}
    </svg>
  );
}

/** The named list beside a donut — colour chip, name, figure. */
export const DonutLegend = ({ data = [], fmt = (d) => count(d.value), right }) => (
  <div className="tr-donutwrap__legend">
    {data.map((d, i) => (
      <div className="tr-dleg" key={d.label ?? i}>
        <i className="tr-dot" style={{ background: d.color || seriesColor(i) }} />
        <span className="tr-dleg__name">{d.label}</span>
        <span className="tr-dleg__val">{right ? right(d) : fmt(d)}</span>
      </div>
    ))}
  </div>
);

export const DonutRow = ({ children }) => <div className="tr-donutwrap">{children}</div>;

/* ── Measuring the plot ───────────────────────────────────────────────────── */

/**
 * The plot's own pixel width.
 *
 * Needed because the SVG is drawn with `preserveAspectRatio="none"`: one
 * horizontal user unit is one PERCENT of the width while one vertical unit is
 * one pixel. Anything that has to be round — a point marker — has to be given
 * an x radius scaled by 100/width, or it comes out as a flat ellipse. That is
 * exactly what turned every line marker into a white slash across its line.
 */
function usePlotWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(el.clientWidth || 0);
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/**
 * A round point marker in a plot whose horizontal unit is a percentage.
 * `w` is the plot's pixel width; until it has been measured the marker is not
 * drawn, which is one frame, rather than drawn wrong.
 */
function Point({ cx, cy, r = 3.2, color, w, children }) {
  if (!w) return null;
  return (
    <ellipse cx={cx} cy={cy} rx={(r * 100) / w} ry={r} fill={color} stroke="#fff" strokeWidth="1.5"
             vectorEffect="non-scaling-stroke">{children}</ellipse>
  );
}

/**
 * How many x labels fit. Rather than squeezing thirty dates into thirty 30px
 * slots — which clips every one of them mid-word — only every nth is printed;
 * the rest keep their slot so the printed ones stay over their marks.
 */
function labelStride(labels, width) {
  const n = labels.length;
  if (!n || !width) return 1;
  // Budget by the longest label, not a flat guess: six "Apr"s fit where
  // fifteen "28 Aug"s do not, and a flat budget thinned both the same.
  const longest = labels.reduce((m, l) => Math.max(m, String(l ?? '').length), 0);
  const per = Math.max(30, longest * 7 + 12);
  const room = Math.max(1, Math.floor(width / per));
  return Math.max(1, Math.ceil(n / room));
}

/* ── The plot frame ───────────────────────────────────────────────────────── */

/**
 * Charts are drawn in an SVG with `viewBox="0 0 100 H"` and
 * `preserveAspectRatio="none"`, so one horizontal unit is one PERCENT of the
 * plot's width while one vertical unit is one pixel. Axis padding therefore
 * cannot live inside the SVG: a 44-unit left gutter is 44% of the card, which
 * is what squeezed every chart into its right-hand third.
 *
 * So the gutters are real DOM columns of a fixed pixel width, the SVG fills
 * what is left and uses its whole 0–100 range, and the tick labels are HTML
 * positioned by percentage of the plot height. Text then keeps its real size at
 * every width, and the marks use the full card.
 */
function Plot({ height = 200, ticks = [], fmt = compact, rightTicks, rightFmt, labels = [], padT = 10, padB = 0,
                children, ariaLabel, mainRef, width = 0 }) {
  const plotH = height - padT - padB;
  const stride = labelStride(labels, width);
  const axis = (list, f, side) => (
    <div className={`tr-plot__y tr-plot__y--${side}`} style={{ height }}>
      {list.map((t, i) => (
        <span key={`${side}-${t}-${i}`} style={{ top: padT + plotH - (i / Math.max(1, list.length - 1)) * plotH }}>
          {f(t)}
        </span>
      ))}
    </div>
  );
  return (
    <div className="tr-chart">
      <div className="tr-plot">
        {ticks.length ? axis(ticks, fmt, 'left') : null}
        <div className="tr-plot__main" ref={mainRef}>
          <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label={ariaLabel || 'Chart'}>
            {children}
          </svg>
          {labels.length ? (
            <div className="tr-plot__x">
              {labels.map((l, i) => (
                <span key={`${l}-${i}`}>{stride === 1 || i % stride === 0 ? l : ''}</span>
              ))}
            </div>
          ) : null}
        </div>
        {rightTicks?.length ? axis(rightTicks, rightFmt || fmt, 'right') : null}
      </div>
    </div>
  );
}

/* ── Vertical bars ────────────────────────────────────────────────────────── */

/**
 * One or two series of vertical bars.
 *
 * `series` is [{ key, label, color }]. Two series sit side by side with a 2px
 * gap, which is what "Scheduled vs Completed" and "Expected vs Collected" are.
 */
export function Bars({ data = [], series = [{ key: 'value', label: '', color: SERIES[0] }], height = 200, fmt = compact, valueLabels = false, yTicks = 4 }) {
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => num(d[s.key]))));
  const scale = niceScale(max, yTicks);
  const padT = valueLabels ? 16 : 8;
  const plotH = height - padT;
  const slot = 100 / Math.max(1, data.length);
  const groupW = Math.min(slot * 0.66, 12);
  const gap = series.length > 1 ? 0.5 : 0;
  const barW = Math.max(0.8, (groupW - (series.length - 1) * gap) / series.length);
  const y = (v) => padT + plotH - (num(v) / scale.top) * plotH;
  const [mainRef, w] = usePlotWidth();

  return (
    <Plot height={height} ticks={scale.ticks} fmt={fmt} labels={data.map((d) => d.label)} padT={padT}
          mainRef={mainRef} width={w} ariaLabel="Bar chart">
      {scale.ticks.map((t) => (
        <line key={t} x1="0" x2="100" y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {data.map((d, i) => {
        const gx = slot * i + (slot - groupW) / 2;
        return series.map((s, j) => {
          const v = num(d[s.key]);
          const h = Math.max(0, padT + plotH - y(v));
          const x = gx + j * (barW + gap);
          return (
            <g key={`${s.key}-${i}`}>
              <path d={barPath(x, y(v), barW, h)} fill={s.color || seriesColor(j)}>
                <title>{`${d.label} · ${s.label || s.key}: ${fmt(v)}`}</title>
              </path>
              {valueLabels && series.length === 1 && v > 0 ? (
                <text x={x + barW / 2} y={y(v) - 5} textAnchor="middle"
                      style={{ fontSize: 9, fontWeight: 700, fill: 'var(--tr-ink-2)' }}>{fmt(v)}</text>
              ) : null}
            </g>
          );
        });
      })}
    </Plot>
  );
}

/* ── Combo: bars plus a line ──────────────────────────────────────────────── */

/**
 * Bars for a volume and a line for a price, on their own scales.
 *
 * Two scales on one plot is normally the wrong answer — but it is what the Fuel
 * and Invoices mockups draw, and these screens are reviewed against those
 * images. The mitigation the pattern needs is applied: BOTH axes are labelled
 * and tick-marked (litres on the left, rupees on the right), the two marks are
 * different shapes, and the legend names each with the axis it belongs to, so a
 * reader is never asked to guess which scale a mark is on.
 */
export function ComboChart({ data = [], barKey = 'litres', lineKey = 'cost', barLabel = 'Litres', lineLabel = 'Cost',
                             barColor = '#a5b4fc', lineColor = '#16a34a', height = 210,
                             barFmt = (v) => `${compact(v)} L`, lineFmt = compactMoney }) {
  const barMax = niceScale(Math.max(1, ...data.map((d) => num(d[barKey]))));
  const lineMax = niceScale(Math.max(1, ...data.map((d) => num(d[lineKey]))));
  const padT = 10;
  const plotH = height - padT;
  const slot = 100 / Math.max(1, data.length);
  const barW = Math.min(slot * 0.5, 7);
  const yBar = (v) => padT + plotH - (num(v) / barMax.top) * plotH;
  const yLine = (v) => padT + plotH - (num(v) / lineMax.top) * plotH;
  const cx = (i) => slot * i + slot / 2;
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${cx(i)} ${yLine(d[lineKey])}`).join(' ');
  const [mainRef, w] = usePlotWidth();

  return (
    <>
      <Legend style={{ marginBottom: 10 }} items={[
        { label: `${barLabel} (left axis)`, color: barColor },
        { label: `${lineLabel} (right axis)`, color: lineColor },
      ]} />
      <Plot height={height} ticks={barMax.ticks} fmt={barFmt} rightTicks={lineMax.ticks} rightFmt={lineFmt}
            labels={data.map((d) => d.label)} padT={padT} mainRef={mainRef} width={w}
            ariaLabel={`${barLabel} bars with a ${lineLabel} line`}>
        {barMax.ticks.map((t) => (
          <line key={t} x1="0" x2="100" y1={yBar(t)} y2={yBar(t)} stroke={GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => {
          const h = Math.max(0, padT + plotH - yBar(d[barKey]));
          return (
            <path key={`b${i}`} d={barPath(cx(i) - barW / 2, yBar(d[barKey]), barW, h)} fill={barColor}>
              <title>{`${d.label} · ${barLabel}: ${barFmt(d[barKey])}`}</title>
            </path>
          );
        })}
        <path d={path} fill="none" stroke={lineColor} strokeWidth="2" vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" strokeLinecap="round" />
        {data.length <= 16 ? data.map((d, i) => (
          <Point key={`p${i}`} cx={cx(i)} cy={yLine(d[lineKey])} color={lineColor} w={w}>
            <title>{`${d.label} · ${lineLabel}: ${lineFmt(d[lineKey])}`}</title>
          </Point>
        )) : null}
      </Plot>
    </>
  );
}

/* ── Lines & areas ────────────────────────────────────────────────────────── */

/** One or more lines. Every point carries a tooltip. */
export function LineChart({ data = [], series = [{ key: 'value', label: '', color: SERIES[0] }], height = 190, fmt = compact, area = false, yTicks = 4 }) {
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => num(d[s.key]))));
  const scale = niceScale(max, yTicks);
  const padT = 10;
  const plotH = height - padT;
  const y = (v) => padT + plotH - (num(v) / scale.top) * plotH;
  const uid = useId().replace(/[:]/g, '');
  const [mainRef, w] = usePlotWidth();
  // A line spans the full width, so its first and last points sit exactly on
  // the viewBox edges and the marker and half the stroke are clipped away.
  // Inset by a marker's radius, in the percent units the x axis is drawn in.
  const padX = w ? Math.min(6, (4.5 * 100) / w) : 1;
  const span = 100 - padX * 2;
  const cx = (i) => (data.length === 1 ? 50 : padX + (i / (data.length - 1)) * span);

  return (
    <Plot height={height} ticks={scale.ticks} fmt={fmt} labels={data.map((d) => d.label)} padT={padT}
          mainRef={mainRef} width={w} ariaLabel="Line chart">
      <defs>
        {series.map((s, j) => (
          <linearGradient key={s.key} id={`${uid}-${j}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color || seriesColor(j)} stopOpacity=".26" />
            <stop offset="100%" stopColor={s.color || seriesColor(j)} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {scale.ticks.map((t) => (
        <line key={t} x1="0" x2="100" y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {series.map((s, j) => {
        const line = data.map((d, i) => `${i ? 'L' : 'M'}${cx(i)} ${y(d[s.key])}`).join(' ');
        return (
          <g key={s.key}>
            {area ? <path d={`${line} L${cx(data.length - 1)} ${padT + plotH} L${cx(0)} ${padT + plotH} Z`} fill={`url(#${uid}-${j})`} /> : null}
            <path d={line} fill="none" stroke={s.color || seriesColor(j)} strokeWidth="2"
                  vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            {data.length <= 16 ? data.map((d, i) => (
              <Point key={i} cx={cx(i)} cy={y(d[s.key])} color={s.color || seriesColor(j)} w={w}>
                <title>{`${d.label} · ${s.label || s.key}: ${fmt(d[s.key])}`}</title>
              </Point>
            )) : null}
          </g>
        );
      })}
    </Plot>
  );
}

/* ── Stacked bars with a rate line ────────────────────────────────────────── */

/**
 * Money stacked by state, with the collection rate over it. Same two-scale
 * caveat as ComboChart, handled the same way. Segments carry a 2px surface gap
 * so the stack reads as parts rather than one block.
 */
export function StackedBars({ data = [], series = [], rateKey, rateLabel = 'Collection Rate', rateColor = '#7c3aed',
                              height = 210, fmt = compactMoney }) {
  const totals = data.map((d) => series.reduce((s, x) => s + num(d[x.key]), 0));
  const scale = niceScale(Math.max(1, ...totals));
  const padT = 10;
  const plotH = height - padT;
  const slot = 100 / Math.max(1, data.length);
  const barW = Math.min(slot * 0.52, 8);
  const y = (v) => padT + plotH - (num(v) / scale.top) * plotH;
  const cx = (i) => slot * i + slot / 2;
  const rateTicks = [0, 25, 50, 75, 100];
  const [mainRef, w] = usePlotWidth();

  return (
    <>
      <Legend style={{ marginBottom: 10 }} items={[
        ...series.map((s, i) => ({ label: s.label, color: s.color || seriesColor(i) })),
        rateKey ? { label: `${rateLabel} (right axis)`, color: rateColor } : null,
      ]} />
      <Plot height={height} ticks={scale.ticks} fmt={fmt} labels={data.map((d) => d.label)} padT={padT}
            rightTicks={rateKey ? rateTicks : null} rightFmt={(v) => `${v}%`}
            mainRef={mainRef} width={w} ariaLabel="Stacked bar chart">
        {scale.ticks.map((t) => (
          <line key={t} x1="0" x2="100" y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => {
          let acc = 0;
          return series.map((s, j) => {
            const v = num(d[s.key]);
            if (v <= 0) return null;
            const top = y(acc + v);
            const h = Math.max(0, y(acc) - top - (j < series.length - 1 ? 2 : 0));
            acc += v;
            const isTop = series.slice(j + 1).every((x) => num(d[x.key]) <= 0);
            return (
              <path key={`${i}-${s.key}`}
                    d={isTop ? barPath(cx(i) - barW / 2, top, barW, h) : `M${cx(i) - barW / 2} ${top}h${barW}v${h}h${-barW}Z`}
                    fill={s.color || seriesColor(j)}>
                <title>{`${d.label} · ${s.label}: ${fmt(v)}`}</title>
              </path>
            );
          });
        })}
        {rateKey ? (
          <>
            <path d={data.map((d, i) => `${i ? 'L' : 'M'}${cx(i)} ${padT + plotH - (num(d[rateKey]) / 100) * plotH}`).join(' ')}
                  fill="none" stroke={rateColor} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {data.length <= 16 ? data.map((d, i) => (
              <Point key={`r${i}`} cx={cx(i)} cy={padT + plotH - (num(d[rateKey]) / 100) * plotH}
                     color={rateColor} w={w}>
                <title>{`${d.label} · ${rateLabel}: ${num(d[rateKey])}%`}</title>
              </Point>
            )) : null}
          </>
        ) : null}
      </Plot>
    </>
  );
}

/* ── Horizontal ranking ───────────────────────────────────────────────────── */

/**
 * A ranked list with a bar behind each figure — "Top Fuel Consuming Vehicles",
 * "Route Performance", "Route Utilization". A ranking is a list first and a
 * chart second, so the name and the figure are real text, not axis labels.
 */
export function RankBars({ data = [], fmt = count, nameWidth = 110, color, max }) {
  const top = max ?? Math.max(1, ...data.map((d) => num(d.value)));
  return (
    <div className="tr-hbars">
      {data.map((d, i) => (
        <div className="tr-hbar" key={d.key ?? d.label ?? i}>
          {d.lead}
          <span className="tr-hbar__name" style={{ flexBasis: nameWidth }} title={d.label}>{d.label}</span>
          <span className="tr-hbar__track">
            {/* A floor of 2% keeps a small-but-real value visible; zero draws
                nothing, because a stub of colour beside "0" reads as a glitch. */}
            {num(d.value) > 0 ? (
              <i className="tr-hbar__fill"
                 style={{ width: `${Math.max(2, (num(d.value) / top) * 100)}%`,
                          background: d.color || color || seriesColor(i) }} />
            ) : null}
          </span>
          <span className="tr-hbar__val">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Small column chart used inside tiles and narrow panels. */
export function MiniBars({ data = [], height = 92, color = '#a5b4fc', fmt = count }) {
  const max = Math.max(1, ...data.map((d) => num(d.value)));
  return (
    <div className="tr-chart" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}
             title={`${d.label}: ${fmt(d.value)}`}>
          <div style={{
            width: '72%', height: `${Math.max(3, (num(d.value) / max) * (height - 22))}px`,
            background: d.color || color, borderRadius: '4px 4px 0 0',
          }} />
          <span style={{ fontSize: '.64rem', color: AXIS, whiteSpace: 'nowrap' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A single proportion as a bar with its two ends labelled. */
export function ProgressLine({ value, total, left, right, color = '#16a34a', height = 9 }) {
  const p = total ? Math.min(100, Math.round((num(value) / num(total)) * 100)) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.76rem', color: 'var(--tr-muted)', marginBottom: 6 }}>
        <span>{left}</span><span>{right ?? `${p}%`}</span>
      </div>
      <span className="tr-bar tr-bar--lg" style={{ height }}>
        <i style={{ width: `${p}%`, background: color }} />
      </span>
    </div>
  );
}

/** Turn a list of {label,count|value} into donut rows with the shared palette. */
export function toSlices(rows = [], { valueKey = 'count', toneKey = 'tone' } = {}) {
  return rows.map((r, i) => ({
    label: r.label,
    value: num(r[valueKey] ?? r.value),
    color: r.color || (r[toneKey] ? STATUS_INK[r[toneKey]] : null) || seriesColor(i),
    pct: r.pct,
  }));
}
