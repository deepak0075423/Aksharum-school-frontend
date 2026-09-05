import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';

// The palette lives in palette.js so colour-only consumers need not pull
// recharts in with it. Re-exported here so every existing importer is unchanged.
export { VIZ, toneForPercent, toneColor } from './palette';

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtMoney = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);
export const fmtMonth = (key) => {
  if (!key) return '';
  const [y, m] = String(key).split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

// ── Section heading inside a panel ────────────────────────────────────────────
export const Panel = ({ title, subtitle, right, children }) => (
  <section style={{
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 16,
  }}>
    {(title || right) && (
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          {title && <h3 style={{ fontSize: '.95rem', fontWeight: 600, margin: 0 }}>{title}</h3>}
          {subtitle && <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>{subtitle}</p>}
        </div>
        {right}
      </header>
    )}
    {children}
  </section>
);

// ── Hero figure — the one number a panel leads with ───────────────────────────
export const Hero = ({ value, unit, label, tone = 'accent', sub }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: '2.6rem', fontWeight: 700, lineHeight: 1, color: VIZ.ink }}>
        {value ?? '—'}
      </span>
      {unit && <span style={{ fontSize: '1.1rem', fontWeight: 600, color: VIZ.muted }}>{unit}</span>}
      <span style={{ width: 10, height: 10, borderRadius: 3, marginLeft: 8, background: toneColor[tone] }} />
    </div>
    <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: 6 }}>{label}</div>
    {sub && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
);

// ── Meter — a single ratio against its limit ──────────────────────────────────
export const Meter = ({ value, label, tone, right, height = 8 }) => {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = toneColor[tone || toneForPercent(value)];
  return (
    <div style={{ minWidth: 90 }}>
      {(label || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
          <span>{label}</span>{right}
        </div>
      )}
      <div style={{ background: '#eef2f7', borderRadius: 99, height, overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
};

// ── Band bar — an ordered part-to-whole distribution ──────────────────────────
//  Segments touch, so a 2px surface-coloured gap does the separating (never a
//  stroke). Every segment is labelled beside the bar, so identity never rests on
//  colour alone.
export const BandBar = ({ segments }) => {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0);
  if (!total) return <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Nothing recorded yet.</p>;
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height: 14, marginBottom: 12 }}>
        {segments.filter((s) => s.value > 0).map((s, i) => (
          <div key={s.label}
            title={`${s.label}: ${s.value}`}
            style={{
              flex: s.value, background: s.color,
              borderRadius: i === 0 ? '4px 0 0 4px' : (i === segments.filter((x) => x.value > 0).length - 1 ? '0 4px 4px 0' : 0),
            }} />
        ))}
      </div>
      <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', listStyle: 'none', margin: 0, padding: 0 }}>
        {segments.map((s) => (
          <li key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            <strong style={{ color: VIZ.ink }}>{s.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ── Tooltip shared by every chart ─────────────────────────────────────────────
const VizTooltip = ({ active, payload, label, unit = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: VIZ.surface, border: '1px solid var(--border)', borderRadius: 8,
      padding: '8px 10px', boxShadow: '0 4px 12px rgba(15,23,42,.08)', fontSize: '.78rem',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, color: VIZ.ink, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill }} />
          {p.name}: {p.value}{unit}
        </div>
      ))}
    </div>
  );
};

// ── Trend line — one series over time ─────────────────────────────────────────
//  A single series, so no legend box: the panel title says what is plotted. The
//  last point is labelled directly; the rest are carried by the axis + tooltip.
export const TrendLine = ({ data, xKey, yKey, unit = '%', name = 'Value', height = 210, domain = [0, 100] }) => {
  if (!data?.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 16, right: 34, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} vertical={false} />
        {/* preserveStartEnd keeps the first and last period labelled — recharts
            otherwise drops colliding ticks starting with the first, which reads
            as a rendering bug rather than as thinning. */}
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: VIZ.muted }} tickLine={false}
          axisLine={{ stroke: VIZ.grid }} interval="preserveStartEnd" minTickGap={4} />
        <YAxis domain={domain} tick={{ fontSize: 11, fill: VIZ.muted }} tickLine={false} axisLine={false} width={46} />
        <Tooltip content={<VizTooltip unit={unit} />} cursor={{ stroke: VIZ.grid, strokeWidth: 1 }} />
        <Line
          type="monotone" dataKey={yKey} name={name}
          stroke={VIZ.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          dot={{ r: 4, fill: VIZ.accent, stroke: VIZ.surface, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: VIZ.accent, stroke: VIZ.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        >
          <LabelList dataKey={yKey} position="top" offset={10}
            content={({ x, y, value, index }) => (index === data.length - 1
              ? <text x={x} y={y - 10} textAnchor="middle" fontSize={11} fontWeight={700} fill={VIZ.ink}>{value}{unit}</text>
              : null)} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
};

// ── Rank bars — compare magnitude across named items ──────────────────────────
//  One series → one colour for every bar (never a value-ramp on the bars); the
//  value rides at the tip so the numbers are readable without the axis.
export const RankBars = ({ data, labelKey, valueKey, unit = '%', height, max = 100, color = VIZ.accent }) => {
  if (!data?.length) return <Empty />;
  const h = height || Math.max(120, data.length * 34 + 20);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 46, left: 4, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} horizontal={false} />
        <XAxis type="number" domain={[0, max]} hide />
        <YAxis type="category" dataKey={labelKey} width={112} tick={{ fontSize: 11, fill: VIZ.muted }} tickLine={false} axisLine={false} />
        <Tooltip content={<VizTooltip unit={unit} />} cursor={{ fill: 'rgba(79,70,229,.05)' }} />
        <Bar dataKey={valueKey} name="Score" fill={color} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList dataKey={valueKey} position="right" offset={8}
            style={{ fontSize: 11, fontWeight: 600, fill: VIZ.ink }}
            formatter={(v) => `${v}${unit}`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ── Columns — a magnitude per period ──────────────────────────────────────────
//  The peak column is labelled; the rest are carried by the axis and tooltip.
export const Columns = ({ data, xKey, yKey, unit = '', height = 200, format = (v) => v }) => {
  if (!data?.length) return <Empty />;
  const peak = Math.max(...data.map((d) => Number(d[yKey]) || 0));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: VIZ.muted }} tickLine={false} axisLine={{ stroke: VIZ.grid }} />
        <YAxis tick={{ fontSize: 11, fill: VIZ.muted }} tickLine={false} axisLine={false} width={54}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
        <Tooltip content={<VizTooltip unit={unit} />} cursor={{ fill: 'rgba(79,70,229,.05)' }} />
        <Bar dataKey={yKey} name="Amount" fill={VIZ.accent} barSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          <LabelList dataKey={yKey}
            content={({ x, y, width, value }) => (Number(value) === peak && peak > 0
              ? <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={VIZ.ink}>{format(value)}</text>
              : null)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ── Status column stack shown as separate labelled bars ───────────────────────
//  Present / Late / Absent are states, not series, so they wear the status
//  tokens — and each carries its own label so colour is never the only channel.
export const StatusSplit = ({ items }) => (
  <ul style={{ display: 'grid', gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
    {items.map((it) => (
      <li key={it.label}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />{it.label}
          </span>
          <strong style={{ color: VIZ.ink }}>{it.value}{it.suffix || ''}</strong>
        </div>
        <div style={{ background: '#eef2f7', borderRadius: 99, height: 6, overflow: 'hidden' }}>
          <div style={{ width: `${it.percent || 0}%`, height: '100%', background: it.color, borderRadius: 99 }} />
        </div>
      </li>
    ))}
  </ul>
);

export const Empty = ({ text = 'No data recorded yet' }) => (
  <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', padding: '18px 0', textAlign: 'center', margin: 0 }}>{text}</p>
);

// ── Definition list used across the General tab ───────────────────────────────
export const KV = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{label}</span>
    <span style={{ fontSize: '.82rem', fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
  </div>
);

export const Grid = ({ min = 240, gap = 16, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap }}>{children}</div>
);
