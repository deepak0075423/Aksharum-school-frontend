/**
 * The Fees screens' charts — hand-drawn SVG, like the leave reports, rather
 * than recharts: a dozen bars and one donut are not worth a 375 kB chunk.
 *
 * Colours are the mockups', with one change the palette validator forced:
 * the mockups' violet "Other" (#a855f7) is ΔE 0.9 from the blue under
 * deuteranopia — the same slice — so it is #a21caf here, the fuchsia the leave
 * module settled on for the same reason. The remaining pairs sit in the 6–8
 * floor band, which is legal only with secondary encoding: every chart below
 * has a named legend with values, 2px surface gaps between marks, and a
 * tooltip per mark.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { compactMoney, money } from './feeUI';

export const INK = {
  green: '#16a34a', blue: '#2563eb', amber: '#f59e0b', pink: '#ec4899', purple: '#a21caf',
  lavender: '#c4b5fd', slate: '#94a3b8', rose: '#f43f5e', indigo: '#4f46e5',
};
/** Payment groups, one colour each everywhere a group is drawn. */
export const GROUP_INK = { online: INK.green, cash: INK.blue, card: INK.amber, other: INK.pink };
/** Categorical order for donuts of named things (concessions, fee heads). */
export const SERIES = [INK.green, INK.blue, INK.amber, INK.pink, INK.purple];

/** Width of the element, following resizes, so text in the SVG is never scaled. */
function useWidth(initial = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setW(Math.max(200, el.clientWidth || initial));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, w];
}

/** A round ceiling and step for the y axis: 5.4L → 6L in 2L steps. */
export function niceScale(max, ticks = 3) {
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
  return (
    <div className="fe-tip" style={{ left: tip.x, top: tip.y }}>
      {tip.title ? <strong>{tip.title}</strong> : null}
      {tip.rows.map(r => (
        <div key={r.label} className="fe-tip__row">
          {r.color ? <i style={{ background: r.color }} /> : null}<span>{r.label}</span><b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

export const Legend = ({ items, className = '' }) => (
  <div className={`fe-legend ${className}`}>
    {items.map(i => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}
  </div>
);

/* ── Dashboard: collected beside what was charged (settled + still pending) ── */

export function CollectionTrend({ data = [], height = 200, sym = '₹' }) {
  const [ref, width] = useWidth(460);
  const [tip, setTip] = useState(null);
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const max = Math.max(0, ...data.map(d => Math.max(d.collected, d.charged)));
  const { top, step } = niceScale(max, 3);
  const ih = height - pad.t - pad.b;
  const iw = width - pad.l - pad.r;
  const band = iw / Math.max(1, data.length);
  const bw = Math.min(22, band * 0.28);
  const y = (v) => pad.t + ih - (v / top) * ih;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return (
    <div className="fe-chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label="Fee collection by month">
        {ticks.map(v => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className="fe-grid" />
            <text x={pad.l - 8} y={y(v) + 4} className="fe-axis" textAnchor="end">{compactMoney(v, sym)}</text>
          </g>
        ))}
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={pad.t + ih} className="fe-grid" />
        {data.map((d, i) => {
          const cx = pad.l + band * i + band / 2;
          const x1 = cx - bw - 1, x2 = cx + 1;
          const hC = (d.collected / top) * ih;
          const hS = (d.settled / top) * ih;
          const hP = (d.pending / top) * ih;
          const base = pad.t + ih;
          return (
            <g key={d.month} onMouseMove={(e) => {
              const r = ref.current.getBoundingClientRect();
              setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title: `${d.label} ${d.year}`, rows: [
                { label: 'Collected', value: money(d.collected, { sym }), color: INK.green },
                { label: 'Charged', value: money(d.charged, { sym }) },
                { label: 'Pending of that', value: money(d.pending, { sym }), color: INK.lavender },
              ] });
            }}>
              <rect x={cx - band / 2} y={pad.t} width={band} height={ih} fill="transparent" />
              <path d={topRounded(x1, base - hC, bw, hC)} fill={INK.green} />
              {/* What that month charged: the settled part at the base, a 2px
                  surface gap, then the part still open on top. */}
              {hS > 0 ? (hP > 0
                ? <rect x={x2} y={base - hS} width={bw} height={hS} fill={INK.green} />
                : <path d={topRounded(x2, base - hS, bw, hS)} fill={INK.green} />) : null}
              {hP > 0 ? <path d={topRounded(x2, base - hS - hP, bw, Math.max(1, hP - (hS > 0 ? 2 : 0)))} fill={INK.lavender} /> : null}
              <text x={cx} y={height - 6} className="fe-axis" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/* ── Payments: stacked by mode ────────────────────────────────────────────── */

const GROUPS = [['online', 'Online'], ['cash', 'Cash'], ['card', 'Card'], ['other', 'Other']];

export function ModeTrend({ data = [], height = 150, sym = '₹' }) {
  const [ref, width] = useWidth(480);
  const [tip, setTip] = useState(null);
  const pad = { l: 40, r: 8, t: 8, b: 24 };
  const totals = data.map(d => GROUPS.reduce((s, [k]) => s + (d[k] || 0), 0));
  const { top, step } = niceScale(Math.max(0, ...totals), 4);
  const ih = height - pad.t - pad.b;
  const iw = width - pad.l - pad.r;
  const band = iw / Math.max(1, data.length);
  const bw = Math.min(34, band * 0.42);
  const y = (v) => pad.t + ih - (v / top) * ih;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return (
    <div className="fe-chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label="Payments by month and mode">
        {ticks.map(v => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className="fe-grid" />
            <text x={pad.l - 8} y={y(v) + 4} className="fe-axis" textAnchor="end">{compactMoney(v, sym)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + band * i + band / 2;
          let acc = 0;
          const present = GROUPS.filter(([k]) => d[k] > 0);
          return (
            <g key={d.month} onMouseMove={(e) => {
              const r = ref.current.getBoundingClientRect();
              setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title: `${d.label} ${d.year}`,
                rows: [...GROUPS.map(([k, l]) => ({ label: l, value: money(d[k] || 0, { sym }), color: GROUP_INK[k] })),
                  { label: 'Total', value: money(totals[i], { sym }) }] });
            }}>
              <rect x={cx - band / 2} y={pad.t} width={band} height={ih} fill="transparent" />
              {present.map(([k], j) => {
                const h = (d[k] / top) * ih;
                const yTop = pad.t + ih - acc - h;
                acc += h;
                const last = j === present.length - 1;
                const gap = j > 0 ? 2 : 0; // 2px surface gap between stacked segments
                return last
                  ? <path key={k} d={topRounded(cx - bw / 2, yTop, bw, Math.max(0, h - gap))} fill={GROUP_INK[k]} />
                  : <rect key={k} x={cx - bw / 2} y={yTop} width={bw} height={Math.max(0, h - gap)} fill={GROUP_INK[k]} />;
              })}
              <text x={cx} y={height - 6} className="fe-axis" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/* ── Donut ────────────────────────────────────────────────────────────────── */

/**
 * slices: [{ label, value, color, names? }]. `center`: [big, small]. A 2px
 * surface gap separates neighbours; hovering a slice (or its legend row)
 * lifts it and names it.
 */
export function Donut({ slices = [], size = 170, thickness = 26, center, hover, onHover, sym = '₹', unit }) {
  const [own, setOwn] = useState(null);
  const active = hover !== undefined ? hover : own;
  const set = onHover || setOwn;
  const total = slices.reduce((s, x) => s + (x.value || 0), 0);
  const r = size / 2 - 4, ir = r - thickness;
  const c = size / 2;
  let a0 = -Math.PI / 2;
  const arcs = total > 0 ? slices.filter(s => s.value > 0).map((s) => {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, a) => `${c + rad * Math.cos(a)},${c + rad * Math.sin(a)}`;
    const full = s.value === total;
    const d = full
      ? `M${c},${c - r}A${r},${r} 0 1 1 ${c - 0.01},${c - r}Z M${c},${c - ir}A${ir},${ir} 0 1 0 ${c + 0.01},${c - ir}Z`
      : `M${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}L${p(ir, a1)}A${ir},${ir} 0 ${large} 0 ${p(ir, a0)}Z`;
    a0 = a1;
    return { ...s, d };
  }) : [];
  const hot = arcs.find(a => a.label === active);
  return (
    <div className="fe-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label="Share by category">
        {total <= 0 ? <circle cx={c} cy={c} r={r - thickness / 2} fill="none" stroke="#e2e8f0" strokeWidth={thickness} /> : null}
        {arcs.map(a => (
          <path key={a.label} d={a.d} fill={a.color} stroke="#fff" strokeWidth="2" fillRule="evenodd"
            opacity={active && active !== a.label ? 0.35 : 1}
            onMouseEnter={() => set(a.label)} onMouseLeave={() => set(null)}>
            <title>{`${a.label}: ${unit === 'count' ? a.value : money(a.value, { sym })}${a.names ? ` (${a.names.join(', ')})` : ''}`}</title>
          </path>
        ))}
      </svg>
      <div className="fe-donut__c">
        {hot ? (<><b>{unit === 'count' ? hot.value : money(hot.value, { sym, space: center?.space })}</b><span>{hot.label}</span></>)
          : center ? (<><b>{center[0]}</b><span>{center[1]}</span></>) : null}
      </div>
    </div>
  );
}

/** The legend rows the donuts sit beside: dot, name, percent, and optionally an amount. */
export function DonutLegend({ rows, hover, onHover, amounts, sym = '₹', className = '' }) {
  return (
    <ul className={`fe-dlegend ${className}`}>
      {rows.map(r => (
        <li key={r.label} className={hover && hover !== r.label ? 'is-dim' : ''}
          onMouseEnter={() => onHover?.(r.label)} onMouseLeave={() => onHover?.(null)} title={r.names ? r.names.join(', ') : undefined}>
          <i style={{ background: r.color }} />
          <span className="fe-dlegend__n">{r.label}</span>
          <span className="fe-dlegend__p">{r.pct}%</span>
          {amounts ? <span className="fe-dlegend__a">{money(r.value, { sym, space: true })}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/* ── Horizontal bars: collection by class ─────────────────────────────────── */

/** Bar colour follows the value (higher = deeper indigo), never the row's rank. */
const indigoFor = (pct) => {
  const t = Math.max(0, Math.min(1, ((pct || 0) - 30) / 65));
  const from = [176, 172, 250], to = [79, 70, 229];
  return `rgb(${from.map((f, i) => Math.round(f + (to[i] - f) * t)).join(',')})`;
};

export function ClassBars({ rows = [] }) {
  return (
    <ul className="fe-hbars">
      {rows.map(r => (
        <li key={r._id} title={`${r.label}: ${r.pct == null ? 'nothing charged yet' : `${r.pct}% collected`} · ${r.students} student${r.students === 1 ? '' : 's'}`}>
          <span className="fe-hbars__l">{r.label}</span>
          <span className="fe-hbars__t"><span style={{ width: `${r.pct || 0}%`, background: indigoFor(r.pct) }} /></span>
          <span className="fe-hbars__v">{r.pct == null ? '—' : `${r.pct}%`}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Reports: two smooth series with a crosshair ──────────────────────────── */

/** Monotone cubic through the points (no overshoot below zero). */
function monotonePath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length;
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

export function AreaTrend({ data = [], series, height = 190, sym = '₹' }) {
  const [ref, width] = useWidth(640);
  const [hi, setHi] = useState(null);
  const pad = { l: 78, r: 14, t: 12, b: 24 };
  const max = Math.max(0, ...data.flatMap(d => series.map(s => d[s.key] || 0)));
  const { top, step } = niceScale(max, 5);
  const ih = height - pad.t - pad.b;
  const iw = width - pad.l - pad.r;
  const x = (i) => pad.l + (data.length <= 1 ? iw / 2 : (iw * i) / (data.length - 1));
  const y = (v) => pad.t + ih - (v / top) * ih;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0, bd = Infinity;
    data.forEach((_, i) => { const dd = Math.abs(x(i) - px); if (dd < bd) { bd = dd; best = i; } });
    setHi(best);
  };
  const d = hi != null ? data[hi] : null;
  return (
    <div className="fe-chart" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
      <svg width={width} height={height} role="img" aria-label="Collection and dues by month">
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`fe-area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity=".22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map(v => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className="fe-grid" />
            <text x={pad.l - 8} y={y(v) + 4} className="fe-axis" textAnchor="end">{money(v, { sym, space: true })}</text>
          </g>
        ))}
        {hi != null ? <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={pad.t + ih} className="fe-cross" /> : null}
        {series.map(s => {
          const pts = data.map((dd, i) => [x(i), y(dd[s.key] || 0)]);
          const line = monotonePath(pts);
          const area = pts.length ? `${line}L${pts[pts.length - 1][0]},${pad.t + ih}L${pts[0][0]},${pad.t + ih}Z` : '';
          return (
            <g key={s.key}>
              <path d={area} fill={`url(#fe-area-${s.key})`} />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2" />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={hi === i ? 5 : 3.6} fill={hi === i ? s.color : '#fff'} stroke={hi === i ? '#fff' : s.color} strokeWidth="2" />
              ))}
            </g>
          );
        })}
        {data.map((dd, i) => <text key={dd.month} x={x(i)} y={height - 6} className="fe-axis" textAnchor="middle">{dd.label}</text>)}
      </svg>
      {d ? (
        <div className="fe-tip fe-tip--card" style={{ left: Math.min(x(hi) + 14, width - 190), top: 18 }}>
          <strong>{`${d.label} ${d.year}`}</strong>
          {series.map(s => (
            <div key={s.key} className="fe-tip__row"><i style={{ background: s.color }} /><span>{s.label}:</span><b>{money(d[s.key] || 0, { sym, space: true })}</b></div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
