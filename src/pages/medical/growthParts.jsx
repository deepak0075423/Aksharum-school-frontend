/**
 * Growth against the WHO charts (Oct 2026) — shared by the student's record
 * (medical staff) and the family's page.
 *
 *   GrowthPanel   the latest percentiles in words, a BMI / height switch, the
 *                 chart and the measurements behind it
 *   GrowthChart   the 3rd–97th percentile curves (the 15th–85th band shaded)
 *                 with the child's points; drawn in SVG, no chart library
 *   GrowthLine    one line for a profile: "BMI-for-age: 42nd percentile — Healthy weight"
 *
 * The numbers come from the server (services/medicalGrowth): WHO's own tables,
 * nothing estimated here.
 */
import React, { useMemo, useState } from 'react';
import { Badge, Segmented, Note, Empty } from './mdUI';
import { fmtDay } from './mdMeta';

const W = 640; const H = 300;
const M = { l: 44, r: 50, t: 14, b: 34 };
const LABEL = { 3: '3rd', 15: '15th', 50: '50th', 85: '85th', 97: '97th' };

// "42nd percentile" → "42nd" for a narrow cell.
const short = (label) => String(label || '').replace(/ percentile$/, '');
const yearsLabel = (m) => `${Math.floor(m / 12)} y${m % 12 ? ` ${m % 12} m` : ''}`;

export function GrowthChart({ curves, points = [], indicator = 'bmi' }) {
  const c = curves?.[indicator];
  const val = (p) => (indicator === 'bmi' ? p.bmi : p.heightCm);
  const pts = useMemo(() => (points || []).filter((p) => p.ageMonths !== null && val(p) > 0 && c && p.ageMonths >= c.rows[0][0] - 0.5 && p.ageMonths <= c.rows[c.rows.length - 1][0] + 0.5), [points, c]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c || !c.rows.length) return null;
  const x0 = c.rows[0][0]; const x1 = c.rows[c.rows.length - 1][0];
  const all = [...c.rows.flatMap((r) => [r[1], r[5]]), ...pts.map(val)];
  const step = indicator === 'bmi' ? 2 : 10;
  const y0 = Math.floor(Math.min(...all) / step) * step; const y1 = Math.ceil(Math.max(...all) / step) * step;
  const X = (m) => M.l + ((m - x0) / Math.max(1, x1 - x0)) * (W - M.l - M.r);
  const Y = (v) => H - M.b - ((v - y0) / Math.max(1, y1 - y0)) * (H - M.t - M.b);
  const line = (i) => c.rows.map((r, k) => `${k ? 'L' : 'M'}${X(r[0]).toFixed(1)},${Y(r[i]).toFixed(1)}`).join(' ');
  const band = (lo, hi) => `${c.rows.map((r, k) => `${k ? 'L' : 'M'}${X(r[0]).toFixed(1)},${Y(r[hi]).toFixed(1)}`).join(' ')} ${[...c.rows].reverse().map((r) => `L${X(r[0]).toFixed(1)},${Y(r[lo]).toFixed(1)}`).join(' ')} Z`;
  const yTicks = []; for (let v = y0; v <= y1; v += step) yTicks.push(v);
  const xTicks = []; for (let m = Math.ceil(x0 / 12) * 12; m <= x1; m += 12) xTicks.push(m);
  const last = c.rows[c.rows.length - 1];
  const latest = pts[pts.length - 1];
  const summary = latest ? `${c.label}: ${latest.indicators?.[indicator]?.centileLabel || ''} at ${yearsLabel(Math.round(latest.ageMonths))}` : c.label;
  return (
    <svg className="mdg-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
      <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} className="mdg-bg" />
      <path d={band(1, 5)} className="mdg-outer" />
      <path d={band(2, 4)} className="mdg-inner" />
      {yTicks.map((v) => <g key={v}><line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} className="mdg-grid" /><text x={M.l - 6} y={Y(v) + 3} className="mdg-tick" textAnchor="end">{v}</text></g>)}
      {xTicks.map((m) => <g key={m}><line x1={X(m)} x2={X(m)} y1={M.t} y2={H - M.b} className="mdg-grid" /><text x={X(m)} y={H - M.b + 14} className="mdg-tick" textAnchor="middle">{m / 12} y</text></g>)}
      {[1, 2, 3, 4, 5].map((i) => <path key={i} d={line(i)} className={`mdg-c mdg-c${c.centiles[i - 1]}`} />)}
      {c.centiles.map((p, i) => <text key={p} x={W - M.r + 4} y={Y(last[i + 1]) + 3} className="mdg-lab">{LABEL[p]}</text>)}
      <text x={M.l} y={H - 4} className="mdg-axis">Age (years)</text>
      <text x={8} y={M.t + 2} className="mdg-axis" transform={`rotate(-90 8 ${M.t + 2})`} textAnchor="end">{c.unit}</text>
      {pts.length > 1 ? <path d={pts.map((p, k) => `${k ? 'L' : 'M'}${X(p.ageMonths).toFixed(1)},${Y(val(p)).toFixed(1)}`).join(' ')} className="mdg-path" /> : null}
      {pts.map((p) => {
        const ind = p.indicators?.[indicator];
        return (
          <circle key={p.on} cx={X(p.ageMonths)} cy={Y(val(p))} r={4.5} className={`mdg-pt mdg-pt--${ind?.tone || 'slate'}`}>
            <title>{`${fmtDay(p.on)} · ${yearsLabel(Math.round(p.ageMonths))} · ${indicator === 'bmi' ? `BMI ${p.bmi}` : `${p.heightCm} cm`}${ind?.centileLabel ? ` · ${ind.centileLabel} (${ind.bandLabel})` : ''}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

/** "BMI-for-age: 42nd percentile — Healthy weight" for the latest measurement. */
export function GrowthLine({ growth, keys = ['bmi', 'height'] }) {
  const ind = growth?.latest?.indicators || {};
  const shown = keys.map((k) => ind[k]).filter(Boolean);
  if (!shown.length) return null;
  return (
    <span className="mdg-line">
      {shown.map((x) => <Badge key={x.key} tone={x.tone} size="sm">{x.label}: {x.implausible ? 'check the measurement' : `${x.centileLabel} — ${x.bandLabel}`}</Badge>)}
    </span>
  );
}

export function GrowthPanel({ growth, family = false }) {
  const [ind, setInd] = useState('bmi');
  if (!growth) return null;
  const points = growth.points || [];
  if (!points.length) {
    return <Empty compact title="No height or weight yet">{family ? 'The school records height and weight at its health checkups; the chart appears after the first.' : 'Record a checkup with height and weight to start the chart.'}</Empty>;
  }
  const latest = growth.latest;
  const li = latest?.indicators || {};
  return (
    <div className="mdg">
      {growth.note ? <Note tone="amber" icon="info">{growth.note}</Note> : null}
      {latest ? (
        <div className="mdg-now">
          <div><span>Latest</span><b>{fmtDay(latest.on)}</b><em>{latest.ageLabel}</em></div>
          <div><span>Height</span><b>{latest.heightCm ? `${latest.heightCm} cm` : '—'}</b><em>{li.height && !li.height.implausible ? li.height.centileLabel : ''}</em></div>
          <div><span>Weight</span><b>{latest.weightKg ? `${latest.weightKg} kg` : '—'}</b><em>{li.weight && !li.weight.implausible ? li.weight.centileLabel : ''}</em></div>
          <div><span>BMI</span><b>{latest.bmi ?? '—'}</b><em>{li.bmi && !li.bmi.implausible ? li.bmi.centileLabel : ''}</em></div>
        </div>
      ) : null}
      <GrowthLine growth={growth} keys={['bmi', 'height', 'weight']} />
      {Object.values(li).some((x) => x.concern) ? (
        <Note tone="red" icon="alertTri">{family ? 'The school nurse may suggest seeing your doctor about this — growth outside the usual range is worth a check, and is often nothing serious.' : 'Outside the usual range — consider a referral to a paediatrician or dietitian.'}</Note>
      ) : null}
      {growth.curves ? (
        <>
          <div className="mdg-head">
            <Segmented value={ind} onChange={setInd} label="Chart" options={[{ value: 'bmi', label: 'BMI-for-age' }, { value: 'height', label: 'Height-for-age' }]} />
            <span className="mdg-key"><i className="mdg-key-in" />15th–85th percentile <i className="mdg-key-out" />3rd–97th</span>
          </div>
          <GrowthChart curves={growth.curves} points={points} indicator={ind} />
        </>
      ) : null}
      <div className="mdc-readings">
        <table>
          <thead><tr><th>Measured</th><th>Age</th><th>Height</th><th>Weight</th><th>BMI</th><th>BMI-for-age</th><th>Height-for-age</th></tr></thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.on}>
                <td>{fmtDay(p.on)}</td><td>{p.ageLabel || '—'}</td><td>{p.heightCm ? `${p.heightCm} cm` : '—'}</td><td>{p.weightKg ? `${p.weightKg} kg` : '—'}</td><td>{p.bmi ?? '—'}</td>
                <td>{p.indicators?.bmi ? <Badge tone={p.indicators.bmi.tone} size="sm">{p.indicators.bmi.implausible ? 'Check' : `${short(p.indicators.bmi.centileLabel)} · ${p.indicators.bmi.bandLabel}`}</Badge> : '—'}</td>
                <td>{p.indicators?.height ? <Badge tone={p.indicators.height.tone} size="sm">{p.indicators.height.implausible ? 'Check' : `${short(p.indicators.height.centileLabel)} · ${p.indicators.height.bandLabel}`}</Badge> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="md-muted mdg-src">{growth.source}. A percentile compares a child with others of the same age and sex: the 50th is the middle.</p>
    </div>
  );
}
