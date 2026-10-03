/**
 * The Results module's charts — hand-drawn SVG, no chart library.
 *
 * There is one real chart on the analytics page (results by grade); everything
 * else there is a figure, a meter or a table, because that is what the numbers
 * are. Twelve-odd bars against a linear scale are not worth a charting bundle.
 *
 * The rules it is drawn to (the dataviz method this app follows):
 *   · one series, one colour — the app's accent, validated on the white
 *     surface (lightness band, chroma, ≥3:1). Bars are not coloured by their
 *     height: the height already says it;
 *   · thin marks: a column is at most 24px wide, rounded 4px at the data end
 *     and square on the baseline; the grid is solid hairlines, recessive;
 *   · text wears text colours, never the bar's;
 *   · every bar answers to hover AND keyboard focus with the same tooltip, and
 *     the hit target is the whole band, not the painted bar;
 *   · the tooltip never gates a value — each bar carries its count on its cap,
 *     and the card offers the same numbers as a table.
 */
import React, { useCallback, useRef, useState } from 'react';
import { count } from './rsUI';

export const VIZ = { accent: '#4f46e5', accentHover: '#6d66ec', grid: '#edf0f6', axis: '#515a82', ink: '#10143a' };

/**
 * The width of whatever the ref is put on, kept up to date.
 *
 * A callback ref on purpose: an effect on a ref object runs once, possibly
 * before the element it wants exists, and never measures again.
 */
export function useWidth(fallback = 560) {
  const [width, setWidth] = useState(fallback);
  const observer = useRef(null);
  const ref = useCallback((el) => {
    observer.current?.disconnect();
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.floor(el.getBoundingClientRect().width)));
    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(el);
  }, []);
  return [width, ref];
}

/** Round gridlines for a count axis: 0 … a clean number at or above the largest bar. */
export function niceTicks(max, want = 4) {
  const top = Math.max(1, max);
  const rough = top / want;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) || 10 * pow);
  const ticks = [];
  for (let v = 0; v < top + step; v += step) { ticks.push(Math.round(v * 100) / 100); if (v >= top) break; }
  return ticks;
}

/**
 * Columns over ordered categories.
 * data: [{ key, label, sub, value, share }] — `sub` is a second line under the
 * label (a grade's range), `share` its percentage of the whole.
 */
export function Columns({ data, unit = 'result', units, height = 264, label }) {
  const [width, ref] = useWidth();
  const [on, setOn] = useState(null);
  const many = units || `${unit}s`;

  const pad = { l: 38, r: 10, t: 26, b: 46 };
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const band = plotW / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(10, band * 0.5));
  const y = (v) => pad.t + plotH - (v / top) * plotH;
  const base = pad.t + plotH;

  const hover = on !== null ? data[on] : null;
  const hx = on !== null ? pad.l + band * on + band / 2 : 0;

  return (
    <div className="rs-chart" ref={ref}>
      <svg width={width} height={height} role="group" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="rs-chart__tick">{count(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + band * i + band / 2;
          const x = cx - bw / 2;
          const yt = y(d.value);
          const r = Math.min(4, (base - yt) / 2);
          return (
            <g key={d.key}>
              {d.value > 0 ? (
                <path
                  d={`M${x},${base}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + bw - r}Q${x + bw},${yt} ${x + bw},${yt + r}V${base}Z`}
                  fill={on === i ? VIZ.accentHover : VIZ.accent}
                />
              ) : null}
              <text x={cx} y={(d.value > 0 ? yt : base) - 7} textAnchor="middle" className={`rs-chart__val${d.value ? '' : ' is-none'}`}>{count(d.value)}</text>
              <text x={cx} y={base + 19} textAnchor="middle" className="rs-chart__cat">{d.label}</text>
              {d.sub ? <text x={cx} y={base + 34} textAnchor="middle" className="rs-chart__sub">{d.sub}</text> : null}
              {/* The whole band is the target, top to bottom: nobody should have to land on a short bar. */}
              <rect
                x={pad.l + band * i} y={pad.t - 14} width={band} height={plotH + 14 + pad.b} fill="transparent" tabIndex={0}
                role="img" aria-label={`${d.label}${d.sub ? `, ${d.sub}` : ''}: ${count(d.value)} ${d.value === 1 ? unit : many}, ${d.share}%`}
                onPointerEnter={() => setOn(i)} onPointerLeave={() => setOn(null)} onFocus={() => setOn(i)} onBlur={() => setOn(null)}
                className="rs-chart__hit"
              />
            </g>
          );
        })}
        <line x1={pad.l} x2={width - pad.r} y1={base} y2={base} stroke="#d9deea" strokeWidth="1" />
      </svg>
      {hover ? (
        <div className="rs-chart__tip" role="status"
          style={{ left: Math.max(70, Math.min(width - 70, hx)), top: Math.max(4, y(hover.value) - 12) }}>
          <strong>{count(hover.value)} {hover.value === 1 ? unit : many}</strong>
          <span>{hover.label}{hover.sub ? ` · ${hover.sub}` : ''} · {hover.share}%</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Percentages across a run of exams — a student's own progress. One column
 * per exam in the accent, and a short neutral bar across it at the class's
 * average: "how did I do" and "against whom" at a glance, on one 0–100 axis.
 * Two series, so a legend; every column carries its value on its cap, and the
 * hover/focus tip gives both figures and the exam's full name.
 * data: [{ key, label, sub, title, value, ref }]   value and ref are percentages
 */
export function Trend({ data, height = 252, label, valueName = 'Score', refName = 'Class average' }) {
  const [width, ref] = useWidth();
  const [on, setOn] = useState(null);
  const pad = { l: 38, r: 10, t: 24, b: 46 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const band = plotW / Math.max(1, data.length);
  const bw = Math.min(26, Math.max(12, band * 0.42));
  const y = (v) => pad.t + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  const base = pad.t + plotH;
  const hover = on !== null ? data[on] : null;
  const hx = on !== null ? pad.l + band * on + band / 2 : 0;
  const fmt = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 10) / 10}%`);

  return (
    <div className="rs-chart">
      <div className="rs-chart__legend" aria-hidden>
        <span><i className="is-value" />{valueName}</span>
        <span><i className="is-ref" />{refName}</span>
      </div>
      <div ref={ref}>
        <svg width={width} height={height} role="group" aria-label={label}>
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth="1" />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="rs-chart__tick">{t}%</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2;
            const x = cx - bw / 2;
            const yt = y(d.value);
            const r = Math.min(4, (base - yt) / 2);
            return (
              <g key={d.key}>
                {d.value > 0 ? (
                  <path d={`M${x},${base}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + bw - r}Q${x + bw},${yt} ${x + bw},${yt + r}V${base}Z`}
                    fill={on === i ? VIZ.accentHover : VIZ.accent} />
                ) : null}
                {d.ref !== null && d.ref !== undefined ? (
                  <>
                    <line x1={x - 5} x2={x + bw + 5} y1={y(d.ref)} y2={y(d.ref)} stroke="#fff" strokeWidth="5" strokeLinecap="round" />
                    <line x1={x - 5} x2={x + bw + 5} y1={y(d.ref)} y2={y(d.ref)} stroke="#7d86a3" strokeWidth="2.5" strokeLinecap="round" />
                  </>
                ) : null}
                <text x={cx} y={Math.min(yt, d.ref !== null && d.ref !== undefined ? y(d.ref) : yt) - 8} textAnchor="middle" className="rs-chart__val">{fmt(d.value)}</text>
                <text x={cx} y={base + 19} textAnchor="middle" className="rs-chart__cat">{d.label}</text>
                {d.sub ? <text x={cx} y={base + 34} textAnchor="middle" className="rs-chart__sub">{d.sub}</text> : null}
                <rect x={pad.l + band * i} y={pad.t - 14} width={band} height={plotH + 14 + pad.b} fill="transparent" tabIndex={0}
                  role="img" aria-label={`${d.title || d.label}: ${valueName.toLowerCase()} ${fmt(d.value)}, ${refName.toLowerCase()} ${fmt(d.ref)}`}
                  onPointerEnter={() => setOn(i)} onPointerLeave={() => setOn(null)} onFocus={() => setOn(i)} onBlur={() => setOn(null)}
                  className="rs-chart__hit" />
              </g>
            );
          })}
          <line x1={pad.l} x2={width - pad.r} y1={base} y2={base} stroke="#d9deea" strokeWidth="1" />
        </svg>
      </div>
      {hover ? (
        <div className="rs-chart__tip" role="status" style={{ left: Math.max(80, Math.min(width - 80, hx)), top: Math.max(30, y(hover.value) + 14) }}>
          <strong>{hover.title || hover.label}</strong>
          <span>{valueName} {fmt(hover.value)} · {refName.toLowerCase()} {fmt(hover.ref)}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A share of 100, as a meter: the fill in the accent, the track a lighter step
 * of the same hue, the figure beside it in text colour.
 */
export const Share = ({ value, label, tone }) => {
  const none = value === null || value === undefined;
  return (
    <span className={`rs-share${tone ? ` rs-share--${tone}` : ''}`}>
      <span className="rs-share__bar" role="presentation"><i style={{ width: `${none ? 0 : Math.max(0, Math.min(100, value))}%` }} /></span>
      <b>{none ? '—' : (label ?? `${value}%`)}</b>
    </span>
  );
};
