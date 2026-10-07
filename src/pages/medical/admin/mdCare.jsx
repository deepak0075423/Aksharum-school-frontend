/**
 * A visit looked at over time (Oct 2026): the readings and their trend, how
 * urgent the case is (triage), the complaint protocol being followed, and the
 * body map — for the visit drawer, the room and incidents.
 *
 * The rules are the server's (services/medicalVitals + medicalProtocols); the
 * library of protocols, regions and scales is read once and shared.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Btn, Badge, Section, Dialog, Field, Segmented, Note, Ico, Kebab } from '../mdUI';
import { TRIAGE, TRIAGE_ORDER, fmtTime, stampInput, errorText } from '../mdMeta';

/* ── The library, read once ──────────────────────────────────────────────── */

let libraryPromise = null;
export function useCareLibrary() {
  const [lib, setLib] = useState(null);
  useEffect(() => {
    let alive = true;
    libraryPromise = libraryPromise || api.getCareLibrary().then((r) => r?.data ?? r).catch((e) => { libraryPromise = null; throw e; });
    libraryPromise.then((x) => { if (alive) setLib(x); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return lib;
}

/* ── Triage ───────────────────────────────────────────────────────────────── */

export const TriageBadge = ({ level, size = 'sm' }) => (level && TRIAGE[level]
  ? <Badge tone={TRIAGE[level].tone} size={size} icon={level === 'red' ? 'siren' : undefined}>{TRIAGE[level].label}</Badge> : null);

/** The colour picker, the suggestion and why. */
export function TriageControl({ visit, onSaved }) {
  const t = visit.triage || {};
  const [busy, setBusy] = useState('');
  const set = async (level) => {
    setBusy(level);
    try { const r = await api.setVisitTriage(visit._id, { level }); onSaved(r?.data ?? r); } catch (e) { toast.error(errorText(e)); } finally { setBusy(''); }
  };
  const rank = (l) => TRIAGE_ORDER.length - TRIAGE_ORDER.indexOf(l);
  const higherSuggested = t.setBy && t.suggested && rank(t.suggested) > rank(t.level);
  const open = !['closed'].includes(visit.status);
  return (
    <div className="mdc-triage">
      <div className="mdc-triage__row" role="radiogroup" aria-label="How urgent">
        {TRIAGE_ORDER.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={t.level === l} disabled={!open || !!busy}
            className={`mdc-triage__btn md-t-${TRIAGE[l].tone}${t.level === l ? ' is-on' : ''}`} onClick={() => set(l)} title={TRIAGE[l].hint}>
            <span className="mdc-triage__dot" />{TRIAGE[l].label}
          </button>
        ))}
      </div>
      <div className="mdc-triage__why">
        {t.setBy
          ? <>Set by <b>{t.setByName}</b>{t.setAt ? ` at ${fmtTime(t.setAt)}` : ''}{t.note ? ` — ${t.note}` : ''}. {open ? <button type="button" className="md-link" onClick={() => set('auto')}>Follow the suggestion</button> : null}</>
          : <>Following the suggestion{t.reasons?.length ? `: ${t.reasons.join(' · ')}` : ' — nothing raises it yet'}.</>}
      </div>
      {higherSuggested ? <Note tone="red" icon="alertTri">The readings and red flags now suggest <b>{TRIAGE[t.suggested].label}</b> ({(t.reasons || []).join(' · ')}).</Note> : null}
      {t.level && TRIAGE[t.level] ? <div className={`mdc-triage__hint md-t-${TRIAGE[t.level].tone}`}>{TRIAGE[t.level].hint}</div> : null}
    </div>
  );
}

/* ── Readings ─────────────────────────────────────────────────────────────── */

const COLS = [
  { key: 'temperature', label: 'Temp', show: (r) => (r.temperature != null ? `${r.temperature}°${r.tempUnit === 'C' ? 'C' : 'F'}` : '') },
  { key: 'pulse', label: 'Pulse', show: (r) => r.pulse ?? '' },
  { key: 'spo2', label: 'SpO₂', show: (r) => (r.spo2 != null ? `${r.spo2}%` : '') },
  { key: 'bp', label: 'BP', show: (r) => (r.bpSystolic != null ? `${r.bpSystolic}/${r.bpDiastolic ?? '—'}` : ''), num: 'bpSystolic' },
  { key: 'respRate', label: 'Breaths', show: (r) => r.respRate ?? '' },
  { key: 'painScore', label: 'Pain', show: (r) => (r.painScore != null ? `${r.painScore}/10` : '') },
  { key: 'avpu', label: 'AVPU', show: (r) => r.avpu || '' },
  { key: 'pupils', label: 'Pupils', show: (r) => ({ equal: 'Equal', unequal: 'Unequal', sluggish: 'Slow' }[r.pupils] || '') },
  { key: 'glucose', label: 'Sugar', show: (r) => r.glucose ?? '' },
];

/** ↑ ↓ against the reading before, for the numbers. */
function arrow(rows, i, key) {
  const cur = rows[i]?.[key];
  if (cur == null) return '';
  for (let j = i - 1; j >= 0; j -= 1) {
    const prev = rows[j][key];
    if (prev != null) return cur > prev ? '↑' : cur < prev ? '↓' : '';
  }
  return '';
}

/** A small line of one vital over the visit. */
function Spark({ rows, k, label }) {
  const pts = rows.filter((r) => r[k] != null);
  if (pts.length < 3) return null;
  const vals = pts.map((r) => Number(r[k]));
  const lo = Math.min(...vals); const hi = Math.max(...vals); const span = hi - lo || 1;
  const w = 120; const h = 30;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / span) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <span className="mdc-spark" title={`${label}: ${vals.join(' → ')}`}>
      <em>{label}</em>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
      <b>{vals[vals.length - 1]}</b>
    </span>
  );
}

export function ReadingsSection({ visit, onAdd, onChanged, confirm }) {
  const all = [...(visit.readings || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  const standing = all.filter((r) => !r.struck);
  const open = visit.status !== 'closed' && !visit.archivedAt;
  const used = COLS.filter((c) => all.some((r) => c.show(r) !== ''));
  const flagOf = (r, key) => (r.flags || []).find((f) => f.key === key || (key === 'bp' && f.key === 'bp'))?.level || '';
  const strike = (r) => confirm({
    title: 'Strike out this reading?', message: `The reading from ${fmtTime(r.at)} stays on the record, crossed out, with your reason.`,
    reason: true, reasonLabel: 'Why', reasonPlaceholder: 'e.g. Entered on the wrong student', confirmLabel: 'Strike out', danger: true,
    run: async (why) => { await api.strikeVisitReading(visit._id, r._id, why); toast.success('Reading struck out'); onChanged(); },
  });
  return (
    <Section title={`Readings${standing.length ? ` (${standing.length})` : ''}`} icon="thermometer"
      right={open ? <Btn size="sm" icon="plus" onClick={onAdd}>Add reading</Btn> : null}>
      {visit.nextCheckAt && open ? (
        <div className={`mdc-next${visit.recheckDue ? ' is-due' : ''}`}>
          <Ico name="clock" size={14} />{visit.recheckDue ? <>Recheck due — it was due at {fmtTime(visit.nextCheckAt)}</> : <>Next check at {fmtTime(visit.nextCheckAt)}</>}
        </div>
      ) : null}
      {standing.length >= 3 ? (
        <div className="mdc-sparks">
          <Spark rows={standing} k="temperature" label="Temp" />
          <Spark rows={standing} k="pulse" label="Pulse" />
          <Spark rows={standing} k="spo2" label="SpO₂" />
          <Spark rows={standing} k="painScore" label="Pain" />
        </div>
      ) : null}
      {all.length ? (
        <div className="mdc-readings" role="region" aria-label="Readings" tabIndex={0}>
          <table>
            <thead><tr><th>Time</th>{used.map((c) => <th key={c.key}>{c.label}</th>)}<th>Note</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {all.map((r) => {
                const i = standing.indexOf(r);
                return (
                  <tr key={r._id} className={r.struck ? 'is-struck' : ''} title={r.struck ? `Struck out by ${r.struck.byName}: ${r.struck.reason}` : undefined}>
                    <td><b>{fmtTime(r.at)}</b><em>{r.byName}</em></td>
                    {used.map((c) => {
                      const lvl = r.struck ? '' : flagOf(r, c.key);
                      const a = !r.struck && i >= 0 ? arrow(standing, i, c.num || c.key) : '';
                      return <td key={c.key} className={lvl ? `is-${lvl}` : ''}>{c.show(r)}{a ? <span className="mdc-arrow">{a}</span> : null}</td>;
                    })}
                    <td className="mdc-readings__note">{r.struck ? <span className="md-muted">Struck out: {r.struck.reason}</span> : [r.note, ...(r.flags || []).map((f) => f.label)].filter(Boolean).join(' · ')}</td>
                    <td>{open && !r.struck ? <Kebab label="Reading actions" items={[{ label: 'Strike out', icon: 'close', danger: true, onClick: () => strike(r) }]} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="md-muted" style={{ margin: 0 }}>No readings yet.</p>}
    </Section>
  );
}

const NUM = (label, k, v, set, props = {}) => (
  <Field label={label}><input className="md-input" type="number" inputMode="decimal" step="any" value={v[k] ?? ''} onChange={(e) => set({ ...v, [k]: e.target.value })} {...props} /></Field>
);

/** Another set of readings. Head injury puts AVPU and pupils first. */
export function ReadingDialog({ visit, unit = 'F', onClose, onSaved }) {
  const [v, setV] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (visit) { setV({ tempUnit: unit, at: stampInput() }); setErr(''); setBusy(false); } }, [visit, unit]);
  if (!visit) return null;
  const head = visit.protocol?.key === 'head_injury';
  const save = async () => {
    setBusy(true); setErr('');
    const body = { tempUnit: v.tempUnit, note: v.note, takenAt: v.at ? new Date(v.at).toISOString() : undefined, avpu: v.avpu || undefined, pupils: v.pupils || undefined };
    for (const k of ['temperature', 'pulse', 'spo2', 'bpSystolic', 'bpDiastolic', 'respRate', 'painScore', 'glucose', 'weightKg']) {
      if (v[k] !== undefined && String(v[k]).trim() !== '') body[k] = Number(v[k]);
    }
    try { const r = await api.addVisitReading(visit._id, body); onSaved(r?.data ?? r); } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  const neuro = (
    <div className="md-form__grid">
      <Field label="AVPU" hint="Alert · responds to Voice · to Pain · Unresponsive">
        <Segmented value={v.avpu || ''} onChange={(x) => setV({ ...v, avpu: v.avpu === x ? '' : x })} label="AVPU"
          options={[{ value: 'A', label: 'A' }, { value: 'V', label: 'V', tone: 'red' }, { value: 'P', label: 'P', tone: 'red' }, { value: 'U', label: 'U', tone: 'red' }]} />
      </Field>
      <Field label="Pupils">
        <Segmented value={v.pupils || ''} onChange={(x) => setV({ ...v, pupils: v.pupils === x ? '' : x })} label="Pupils"
          options={[{ value: 'equal', label: 'Equal' }, { value: 'sluggish', label: 'Slow' }, { value: 'unequal', label: 'Unequal', tone: 'red' }]} />
      </Field>
    </div>
  );
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title="Add a reading" icon="thermometer" tone="blue" width={640}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save reading</Btn></>}>
      {head ? <Note tone="amber" icon="alertTri">Head injury: check alertness and pupils every time.</Note> : null}
      {head ? neuro : null}
      <div className="md-form__grid md-form__grid--3">
        <Field label={`Temperature °${v.tempUnit || unit}`}><input className="md-input" type="number" step="0.1" inputMode="decimal" value={v.temperature ?? ''} onChange={(e) => setV({ ...v, temperature: e.target.value })} /></Field>
        {NUM('Pulse / min', 'pulse', v, setV)}
        {NUM('SpO₂ %', 'spo2', v, setV)}
        {NUM('BP systolic', 'bpSystolic', v, setV)}
        {NUM('BP diastolic', 'bpDiastolic', v, setV)}
        {NUM('Breaths / min', 'respRate', v, setV)}
        {NUM('Blood sugar mg/dL', 'glucose', v, setV)}
        {NUM('Weight kg', 'weightKg', v, setV, { step: '0.1' })}
        <Field label="Taken at"><input className="md-input" type="datetime-local" value={v.at || ''} onChange={(e) => setV({ ...v, at: e.target.value })} /></Field>
      </div>
      <Field label="Pain (0 none – 10 worst)">
        <div className="md-chips">
          {Array.from({ length: 11 }, (_, n) => <button key={n} type="button" className={String(v.painScore) === String(n) ? 'is-on' : ''} aria-pressed={String(v.painScore) === String(n)} onClick={() => setV({ ...v, painScore: String(v.painScore) === String(n) ? '' : n })}>{n}</button>)}
        </div>
      </Field>
      {!head ? neuro : null}
      <Field label="Note" optional><input className="md-input" value={v.note || ''} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={300} placeholder="e.g. Vomited once, feeling better" /></Field>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

/* ── Protocol ─────────────────────────────────────────────────────────────── */

export function ProtocolSection({ visit, lib, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const p = visit.protocol?.key ? lib?.protocols?.find((x) => x.key === visit.protocol.key) : null;
  const open = visit.status !== 'closed' && !visit.archivedAt;
  const save = async (body) => {
    setBusy(true);
    try { const r = await api.setVisitProtocol(visit._id, body); onSaved(r?.data ?? r); setPicking(false); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  if (!lib) return null;
  const suggested = (visit.protocolSuggestions || []).map((k) => lib.protocols.find((x) => x.key === k)).filter(Boolean);
  if (!p || picking) {
    return (
      <Section title="Protocol" icon="clipboard">
        {suggested.length && !picking ? (
          <div className="mdc-suggest">
            <span className="md-muted">The reason points to:</span>
            {suggested.slice(0, 3).map((x) => <Btn key={x.key} size="sm" kind="tint" disabled={!open || busy} onClick={() => save({ key: x.key })}>{x.title}</Btn>)}
          </div>
        ) : null}
        {open ? (
          <div className="mdc-suggest">
            <select className="md-input" style={{ maxWidth: 280 }} value="" onChange={(e) => e.target.value && save({ key: e.target.value })} disabled={busy} aria-label="Choose a protocol">
              <option value="">{p ? 'Change to…' : 'Choose a protocol…'}</option>
              {lib.protocols.map((x) => <option key={x.key} value={x.key}>{x.title}</option>)}
            </select>
            {picking ? <Btn size="sm" onClick={() => setPicking(false)}>Cancel</Btn> : null}
          </div>
        ) : <p className="md-muted" style={{ margin: 0 }}>No protocol was followed.</p>}
      </Section>
    );
  }
  const flags = new Set(visit.protocol.redFlags || []);
  const done = new Set(visit.protocol.stepsDone || []);
  const toggleFlag = (k) => { const next = new Set(flags); if (next.has(k)) next.delete(k); else next.add(k); save({ key: p.key, redFlags: [...next] }); };
  const toggleStep = (i) => { const next = new Set(done); if (next.has(i)) next.delete(i); else next.add(i); save({ key: p.key, stepsDone: [...next] }); };
  return (
    <Section title={`Protocol — ${p.title}`} icon="clipboard"
      right={open ? <Kebab label="Protocol actions" items={[{ label: 'Change protocol', icon: 'repeat', onClick: () => setPicking(true) }, { label: 'Stop following it', icon: 'close', onClick: () => save({ key: null }) }]} /> : null}>
      <div className="mdc-proto">
        <div className="mdc-proto__col">
          <h5>Red flags <em>— any one raises the colour</em></h5>
          <ul className="mdc-checks">
            {p.redFlags.map((f) => (
              <li key={f.key} className={flags.has(f.key) ? `is-on md-t-${TRIAGE[f.level]?.tone}` : ''}>
                <label><input type="checkbox" checked={flags.has(f.key)} disabled={!open || busy} onChange={() => toggleFlag(f.key)} /><span>{f.label}</span><TriageBadge level={f.level} /></label>
              </li>
            ))}
          </ul>
        </div>
        <div className="mdc-proto__col">
          <h5>Steps</h5>
          <ol className="mdc-checks is-steps">
            {p.steps.map((x, i) => (
              <li key={i} className={done.has(i) ? 'is-done' : ''}>
                <label><input type="checkbox" checked={done.has(i)} disabled={!open || busy} onChange={() => toggleStep(i)} /><span>{x}</span></label>
              </li>
            ))}
          </ol>
          {p.sendHomeIf?.length ? <><h5>Send home if</h5><ul className="mdc-plain">{p.sendHomeIf.map((x) => <li key={x}>{x}</li>)}</ul></> : null}
          {p.returnIf?.length ? <><h5>Back to class if</h5><ul className="mdc-plain">{p.returnIf.map((x) => <li key={x}>{x}</li>)}</ul></> : null}
          {p.parentAdvice ? <Note tone="blue" icon="info">When the student leaves, the parents are sent what to watch for.</Note> : null}
        </div>
      </div>
    </Section>
  );
}

/* ── Body map ─────────────────────────────────────────────────────────────── */

// Shapes on a 120 × 250 figure. `side` is the viewer's side: in the front
// view the student's right is on the viewer's left; in the back view it is not.
const SHAPES = [
  { r: 'head', el: 'ellipse', a: { cx: 60, cy: 22, rx: 15, ry: 18 } },
  { r: 'face', el: 'ellipse', a: { cx: 60, cy: 26, rx: 9, ry: 11 }, view: 'front' },
  { r: 'neck', el: 'rect', a: { x: 53, y: 39, width: 14, height: 9, rx: 3 } },
  { r: 'chest', el: 'rect', a: { x: 40, y: 48, width: 40, height: 30, rx: 8 }, view: 'front' },
  { r: 'abdomen', el: 'rect', a: { x: 42, y: 78, width: 36, height: 25, rx: 6 }, view: 'front' },
  { r: 'groin', el: 'rect', a: { x: 46, y: 103, width: 28, height: 13, rx: 5 }, view: 'front' },
  { r: 'upper_back', el: 'rect', a: { x: 40, y: 48, width: 40, height: 30, rx: 8 }, view: 'back' },
  { r: 'lower_back', el: 'rect', a: { x: 42, y: 78, width: 36, height: 25, rx: 6 }, view: 'back' },
  { r: 'buttocks', el: 'rect', a: { x: 42, y: 103, width: 36, height: 16, rx: 7 }, view: 'back' },
  { r: 'shoulder', el: 'circle', a: { cx: 34, cy: 52, r: 7 }, pair: true },
  { r: 'upper_arm', el: 'rect', a: { x: 23, y: 58, width: 12, height: 28, rx: 5 }, pair: true },
  { r: 'elbow', el: 'circle', a: { cx: 28.5, cy: 90, r: 5 }, pair: true },
  { r: 'forearm', el: 'rect', a: { x: 21, y: 95, width: 11, height: 24, rx: 5 }, pair: true },
  { r: 'wrist', el: 'rect', a: { x: 20.5, y: 119, width: 11, height: 6, rx: 2 }, pair: true },
  { r: 'hand', el: 'ellipse', a: { cx: 26, cy: 133, rx: 6.5, ry: 8 }, pair: true },
  { r: 'hip', el: 'circle', a: { cx: 44, cy: 110, r: 5 }, pair: true },
  { r: 'thigh', el: 'rect', a: { x: 43, y: 119, width: 15, height: 40, rx: 6 }, pair: true },
  { r: 'knee', el: 'circle', a: { cx: 50.5, cy: 164, r: 6 }, pair: true },
  { r: 'lower_leg', el: 'rect', a: { x: 45, y: 171, width: 12, height: 40, rx: 5 }, pair: true },
  { r: 'ankle', el: 'rect', a: { x: 45.5, y: 211, width: 11, height: 6, rx: 2 }, pair: true },
  { r: 'foot', el: 'ellipse', a: { cx: 50.5, cy: 225, rx: 7.5, ry: 6.5 }, pair: true },
];
const mirror = (el, a) => {
  if (el === 'rect') return { ...a, x: 120 - a.x - a.width };
  return { ...a, cx: 120 - a.cx };
};
const centre = (el, a) => (el === 'rect' ? [a.x + a.width / 2, a.y + a.height / 2] : [a.cx, a.cy]);

/** Every shape of one view, with the region it is. */
function shapesOf(view) {
  const out = [];
  for (const s of SHAPES) {
    if (s.view && s.view !== view) continue;
    if (!s.pair) { out.push({ region: s.r, el: s.el, a: s.a }); continue; }
    // Viewer's left: the student's right in front, their left from behind.
    const leftIs = view === 'front' ? 'r' : 'l';
    const rightIs = leftIs === 'r' ? 'l' : 'r';
    out.push({ region: `${s.r}_${leftIs}`, el: s.el, a: s.a });
    out.push({ region: `${s.r}_${rightIs}`, el: s.el, a: mirror(s.el, s.a) });
  }
  return out;
}

function Figure({ view, marks, regions, onPick, readOnly }) {
  const shapes = useMemo(() => shapesOf(view), [view]);
  const marked = new Set(marks.map((m) => m.region));
  return (
    <figure className="mdc-body__fig">
      <svg viewBox="0 0 120 250" role="group" aria-label={`Body, ${view}`}>
        {shapes.map((s) => {
          const El = s.el;
          return (
            <El key={s.region} {...s.a} className={`mdc-body__part${marked.has(s.region) ? ' is-marked' : ''}${readOnly ? '' : ' is-live'}`}
              onClick={readOnly ? undefined : () => onPick(view, s.region)} role={readOnly ? undefined : 'button'} tabIndex={readOnly ? undefined : 0}
              aria-label={readOnly ? undefined : `${regions?.[s.region] || s.region} (${view})`}
              onKeyDown={readOnly ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(view, s.region); } }}>
              <title>{regions?.[s.region] || s.region}</title>
            </El>
          );
        })}
        {marks.map((m) => {
          const s = shapes.find((x) => x.region === m.region);
          if (!s) return null;
          const [x, y] = centre(s.el, s.a);
          const dup = marks.filter((o) => o.region === m.region).indexOf(m);
          return (
            <g key={m.id} className="mdc-body__mark" transform={`translate(${x + dup * 5}, ${y - dup * 5})`}>
              <circle r="5" /><text y="2.2" textAnchor="middle">{m.n}</text>
            </g>
          );
        })}
        <text x="6" y="246" className="mdc-body__lr">{view === 'front' ? 'R' : 'L'}</text>
        <text x="114" y="246" textAnchor="end" className="mdc-body__lr">{view === 'front' ? 'L' : 'R'}</text>
      </svg>
      <figcaption>{view === 'front' ? 'Front' : 'Back'}</figcaption>
    </figure>
  );
}

/** Front and back; a tap on a part adds a mark. */
export function BodyMap({ value = [], onChange, lib, readOnly }) {
  const [draft, setDraft] = useState(null);
  const numbered = value.map((m, i) => ({ ...m, n: i + 1 }));
  const kinds = lib?.injuryKinds || {};
  const regions = lib?.regions || {};
  return (
    <div className="mdc-body">
      <div className="mdc-body__figs">
        {['front', 'back'].map((view) => (
          <Figure key={view} view={view} regions={regions} readOnly={readOnly}
            marks={numbered.filter((m) => (m.view || 'front') === view)}
            onPick={(v, region) => setDraft({ id: null, view: v, region, kind: 'bruise', note: '' })} />
        ))}
      </div>
      <ol className="mdc-body__list">
        {numbered.map((m) => (
          <li key={m.id}>
            <span className="mdc-body__n">{m.n}</span>
            <span><b>{kinds[m.kind] || m.kind}</b> — {regions[m.region] || m.region}{m.view === 'back' ? ' (back)' : ''}{m.note ? <em> · {m.note}</em> : null}</span>
            {!readOnly ? (
              <span className="mdc-body__acts">
                <button type="button" className="md-link" onClick={() => setDraft({ ...m })}>Edit</button>
                <button type="button" className="md-link is-danger" onClick={() => onChange(value.filter((x) => x.id !== m.id))}>Remove</button>
              </span>
            ) : null}
          </li>
        ))}
        {!numbered.length ? <li className="md-muted">{readOnly ? 'Nothing marked.' : 'Tap the part of the body that is hurt.'}</li> : null}
      </ol>
      {draft ? (
        <Dialog open onClose={() => setDraft(null)} title={regions[draft.region] || draft.region} icon="bandage" tone="orange" width={460}
          footer={<><Btn onClick={() => setDraft(null)}>Cancel</Btn><Btn kind="primary" onClick={() => {
            const mark = { id: draft.id || `new-${Date.now()}`, view: draft.view, region: draft.region, kind: draft.kind, note: draft.note };
            onChange(draft.id ? value.map((x) => (x.id === draft.id ? mark : x)) : [...value, mark]);
            setDraft(null);
          }}>{draft.id ? 'Save' : 'Add mark'}</Btn></>}>
          <Field label="What is it?">
            <div className="md-chips">
              {Object.entries(kinds).map(([k, l]) => <button key={k} type="button" className={draft.kind === k ? 'is-on' : ''} aria-pressed={draft.kind === k} onClick={() => setDraft({ ...draft, kind: k })}>{l}</button>)}
            </div>
          </Field>
          <Field label="Note" optional><input className="md-input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} maxLength={200} placeholder="e.g. 3 cm graze, cleaned" /></Field>
        </Dialog>
      ) : null}
    </div>
  );
}

/** The body map of a visit or an incident, saved as it changes. */
export function BodyMapSection({ kind, record, lib, onSaved }) {
  const [busy, setBusy] = useState(false);
  const readOnly = !!record.archivedAt || (kind === 'visit' && record.status === 'closed');
  const save = async (next) => {
    setBusy(true);
    // New marks carry a temporary id; the server gives them real ones.
    const body = next.map((m) => (String(m.id).startsWith('new-') ? { ...m, id: undefined } : m));
    try {
      const r = kind === 'incident' ? await api.setIncidentInjuries(record._id, body) : await api.setVisitInjuries(record._id, body);
      onSaved(r?.data ?? r);
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  if (!lib) return null;
  return (
    <Section title={`Body map${(record.injuries || []).length ? ` (${record.injuries.length})` : ''}`} icon="user" right={busy ? <span className="md-muted">Saving…</span> : null}>
      <BodyMap value={record.injuries || []} onChange={save} lib={lib} readOnly={readOnly} />
    </Section>
  );
}
