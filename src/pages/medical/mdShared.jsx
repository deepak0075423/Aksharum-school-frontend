/**
 * Pieces every Medical Room audience shares (Oct 2026): the emergency card,
 * the history timeline, opening a protected file, and the visits chart.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { VIZ } from '../analytics/palette';
import { Ico, Badge, Btn, Avatar, Empty, Spin, Select, Pager, useLoad } from './mdUI';
import { apiUrl, fmtDay, fmtDate, fmtTime, ago, errorText, telOf, labelOf, RESCUE_PLACE } from './mdMeta';

/* ── Emergency card ───────────────────────────────────────────────────────── */


/**
 * The one screen someone needs in an emergency: blood group, what could kill
 * the child, what to do, who to ring, where to take them. Printable.
 */
export function EmergencyCard({ data, onClose, printable = true }) {
  if (!data) return null;
  const s = data.student || {};
  const crit = (data.allergies || []).filter((a) => a.critical);
  const otherAllergies = (data.allergies || []).filter((a) => !a.critical);
  const critCond = (data.conditions || []).filter((c) => c.critical);
  const otherCond = (data.conditions || []).filter((c) => !c.critical);
  return (
    <div className="md-em" role="region" aria-label={`Emergency profile of ${s.name}`}>
      <div className="md-em__band">
        <Avatar name={s.name} photo={s.photo} size={58} tone="red" />
        <div style={{ minWidth: 0 }}>
          <h2>{s.name}</h2>
          <p>{[s.classLabel, s.admissionNumber, s.age != null ? `${s.age} yrs` : '', s.gender].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="md-em__blood"><span>Blood group</span><strong>{data.bloodGroup || '—'}</strong></div>
      </div>
      <div className="md-em__body">
        <div className="md-em__block">
          <h3><Ico name="alertTri" size={14} />Critical allergies</h3>
          {crit.length ? crit.map((a) => (
            <div key={a._id} className="md-em__item">
              <b>{a.allergen}</b> — {a.severity === 'life_threatening' ? 'life-threatening' : 'severe'}{a.reaction ? `: ${a.reaction}` : ''}
              {a.emergencyInstructions ? <span className="md-em__do">Do: {a.emergencyInstructions}</span> : null}
              {a.medication ? <span className="md-em__do">Medicine: {a.medication}</span> : null}
            </div>
          )) : <div className="md-em__item is-plain">None recorded</div>}
          {otherAllergies.length ? <div className="md-em__item is-plain" style={{ marginTop: 6 }}><b>Other allergies:</b> {otherAllergies.map((a) => a.allergen).join(', ')}</div> : null}
        </div>
        <div className="md-em__block">
          <h3><Ico name="heartPulse" size={14} />Critical conditions</h3>
          {critCond.length ? critCond.map((c) => (
            <div key={c._id} className="md-em__item">
              <b>{c.condition}</b>{c.medication ? ` — ${c.medication}` : ''}
              {c.emergencyInstructions ? <span className="md-em__do">Do: {c.emergencyInstructions}</span> : null}
            </div>
          )) : <div className="md-em__item is-plain">None recorded</div>}
          {otherCond.length ? <div className="md-em__item is-plain" style={{ marginTop: 6 }}><b>Other conditions:</b> {otherCond.map((c) => c.condition).join(', ')}</div> : null}
        </div>
        {(data.carePlans || []).length ? (
          <div className="md-em__block is-wide is-plan">
            <h3><Ico name="heartPulse" size={14} />What to do — care plan{data.carePlans.length > 1 ? 's' : ''}</h3>
            {data.carePlans.map((c) => (
              <div key={c._id} className="md-em__item">
                <b>{c.title}</b>
                {(c.signs || []).length ? <span className="md-em__do">Signs: {c.signs.join('; ')}</span> : null}
                <ol className="md-em__steps">
                  {(c.steps || []).map((x, i) => <li key={i} className={x.critical ? 'is-critical' : ''}>{x.text}</li>)}
                </ol>
                {c.ambulanceWhen ? <span className="md-em__do"><b>Ambulance:</b> {c.ambulanceWhen}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
        {(data.rescueMeds || []).length ? (
          <div className="md-em__block">
            <h3><Ico name="syringe" size={14} />Rescue medicine — reach for it here</h3>
            {data.rescueMeds.map((m) => (
              <div key={m._id} className={`md-em__item${m.expired ? ' is-expired' : ''}`}>
                <b>{m.name}</b>{m.dose ? ` — ${m.dose}` : ''}
                {(m.locations || []).length ? <span className="md-em__do">Kept: {m.locations.map((l) => `${labelOf(RESCUE_PLACE, l.place)}${l.note ? ` (${l.note})` : ''}`).join(', ')}{m.selfCarry ? ' · the student carries one' : ''}</span> : null}
                {m.expiresOn ? <span className="md-em__do">{m.expired ? <b>EXPIRED {fmtDay(m.expiresOn)} — replace it. In an emergency an expired one is still better than none.</b> : `Expires ${fmtDay(m.expiresOn)}`}</span> : null}
                {m.instructions ? <span className="md-em__do">{m.instructions}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
        {data.emergencyMedication ? (
          <div className="md-em__block">
            <h3><Ico name="syringe" size={14} />Emergency medication</h3>
            <div className="md-em__item">
              <b>{data.emergencyMedication.name}</b>
              {data.emergencyMedication.location ? <span className="md-em__do">Kept: {data.emergencyMedication.location}</span> : null}
              {data.emergencyMedication.instructions ? <span className="md-em__do">{data.emergencyMedication.instructions}</span> : null}
            </div>
          </div>
        ) : null}
        {data.instructions ? (
          <div className="md-em__block">
            <h3><Ico name="clipboard" size={14} />Instructions</h3>
            <div className="md-em__item is-plain">{data.instructions}</div>
          </div>
        ) : null}
        <div className="md-em__block is-wide">
          <h3><Ico name="phone" size={14} />Call</h3>
          <div className="mdp-contacts">
            {(data.contacts || []).map((c, i) => (
              <div key={`${c.phone}-${i}`} className="mdp-contact">
                <span><Ico name={c.kind === 'parent' ? 'users' : 'phone'} size={16} /></span>
                <div style={{ minWidth: 0 }}>
                  <b>{c.name || '—'}</b>
                  <em>{c.relation}</em>
                  {c.phone ? <a className="md-em__phone" href={`tel:${telOf(c.phone)}`}><Ico name="phone" size={13} />{c.phone}</a> : <em>No phone on record</em>}
                </div>
              </div>
            ))}
            {!(data.contacts || []).length ? <div className="md-em__item is-plain">No contacts on record — check the admission file.</div> : null}
          </div>
        </div>
        <div className="md-em__block">
          <h3><Ico name="stethoscope" size={14} />Doctor</h3>
          {data.doctor?.name ? (
            <div className="md-em__item is-plain"><b>{data.doctor.name}</b>{data.doctor.clinic ? ` · ${data.doctor.clinic}` : ''}
              {data.doctor.phone ? <><br /><a className="md-em__phone" href={`tel:${telOf(data.doctor.phone)}`}><Ico name="phone" size={13} />{data.doctor.phone}</a></> : null}</div>
          ) : <div className="md-em__item is-plain">Not recorded</div>}
        </div>
        <div className="md-em__block">
          <h3><Ico name="hospital" size={14} />Preferred hospital</h3>
          {data.hospital?.name ? (
            <div className="md-em__item is-plain"><b>{data.hospital.name}</b>{data.hospital.address ? <><br />{data.hospital.address}</> : null}
              {data.hospital.phone ? <><br /><a className="md-em__phone" href={`tel:${telOf(data.hospital.phone)}`}><Ico name="phone" size={13} />{data.hospital.phone}</a></> : null}</div>
          ) : <div className="md-em__item is-plain">Not recorded</div>}
        </div>
      </div>
      <div className="md-em__foot">
        <span>{data.room?.name || 'Medical Room'}{data.room?.phone ? ` · ${data.room.phone}` : ''}{data.room?.location ? ` · ${data.room.location}` : ''}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {printable ? <Btn size="xs" kind="ghost" icon="printer" onClick={() => window.print()}>Print</Btn> : null}
          {onClose ? <Btn size="xs" kind="ghost" onClick={onClose}>Close</Btn> : null}
          <span>Shown {fmtDate(data.generatedAt || new Date())}, {fmtTime(data.generatedAt || new Date())}</span>
        </span>
      </div>
    </div>
  );
}

/* ── Opening a protected file ─────────────────────────────────────────────── */

/**
 * Medical files are not public: the API hands a ten-minute signed link to
 * someone it has checked, which is opened in a new tab. `getLink` is the
 * audience's link call (medDocLink for staff, fileLink for families).
 */
export async function openDocument(getLink, id, { download } = {}) {
  // Opened first, so the browser treats it as the click's own window.
  const win = window.open('about:blank', '_blank');
  try {
    const res = await getLink(id, { download });
    const url = apiUrl(res?.data?.url || res?.url);
    if (!url) throw new Error('The file could not be opened');
    const full = download ? `${url}&download=1` : url;
    if (win) win.location.href = full; else window.location.href = full;
  } catch (e) {
    if (win) win.close();
    toast.error(errorText(e, 'The file could not be opened'));
  }
}

export const DocButton = ({ getLink, id, children = 'View', size = 'sm', kind = 'tint', icon = 'eye', download }) => (
  <Btn size={size} kind={kind} icon={icon} onClick={(e) => { e.stopPropagation(); openDocument(getLink, id, { download }); }}>{children}</Btn>
);

/* ── History timeline ─────────────────────────────────────────────────────── */

const KIND = {
  visit:       { label: 'Medical Room visit', icon: 'stethoscope', tone: 'blue' },
  incident:    { label: 'Incident',           icon: 'alertTri',    tone: 'orange' },
  first_aid:   { label: 'First aid',          icon: 'firstAid',    tone: 'violet' },
  medicine:    { label: 'Medicine',           icon: 'pill',        tone: 'indigo' },
  referral:    { label: 'Hospital referral',  icon: 'ambulance',   tone: 'rose' },
  checkup:     { label: 'Health checkup',     icon: 'clipboard',   tone: 'teal' },
  vaccination: { label: 'Vaccination',        icon: 'syringe',     tone: 'green' },
  document:    { label: 'Document',           icon: 'fileDoc',     tone: 'slate' },
  follow_up:   { label: 'Follow-up',          icon: 'calendarCheck', tone: 'amber' },
  record:      { label: 'Record added',       icon: 'heartPulse',  tone: 'red' },
  hostel:      { label: 'Hostel',             icon: 'hotel',       tone: 'pink' },
};
export const HISTORY_KIND = KIND;

const dayKey = (it) => (it.day ? fmtDay(it.at) : fmtDate(it.at));

/**
 * The timeline of one student, with its filters. `fetcher(params)` returns
 * { items, total, page, pages, counts }. `years` come from meta (staff) or are
 * omitted. `onOpen(item)` opens the record behind an entry, when there is one.
 */
export function Timeline({ fetcher, years = [], onOpen, kinds = Object.keys(KIND), compact }) {
  const [f, setF] = useState({ kind: '', year: '', from: '', to: '', page: 1 });
  const { data, loading, error, reload } = useLoad(() => fetcher({ ...f, limit: 25 }), f);
  const groups = useMemo(() => {
    const out = [];
    for (const it of data?.items || []) {
      const k = dayKey(it);
      if (!out.length || out[out.length - 1].day !== k) out.push({ day: k, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [data]);
  const set = (patch) => setF((cur) => ({ ...cur, ...patch, page: patch.page || 1 }));
  return (
    <div className="md-tl">
      <div className="md-toolbar" style={{ borderBottom: 0, padding: compact ? '0 0 12px' : undefined }}>
        <Select value={f.kind} onChange={(v) => set({ kind: v })} all="All records" label="Type of record"
          options={kinds.map((k) => ({ value: k, label: `${KIND[k].label}${data?.counts?.[k] ? ` (${data.counts[k]})` : ''}` }))} />
        {years.length ? <Select value={f.year} onChange={(v) => set({ year: v })} all="Any academic year" label="Academic year" options={years.map((y) => ({ value: y._id, label: y.yearName }))} /> : null}
        <input className="md-input" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} aria-label="From" style={{ width: 150 }} />
        <input className="md-input" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} aria-label="To" style={{ width: 150 }} />
        {(f.kind || f.year || f.from || f.to) ? <Btn size="sm" kind="ghost" icon="close" onClick={() => setF({ kind: '', year: '', from: '', to: '', page: 1 })}>Clear</Btn> : null}
      </div>
      {error && !data ? <Empty compact title="The history could not be loaded" action={<Btn onClick={reload} icon="refresh">Try again</Btn>}>{error.message}</Empty> : null}
      {!data && loading ? <Spin /> : null}
      {data && !data.items.length ? <Empty compact title="Nothing in this period">Medical Room visits, incidents, medicines, checkups and vaccinations appear here as they happen.</Empty> : null}
      {groups.length ? (
        <ol className="md-timeline">
          {groups.map((g) => (
            <React.Fragment key={g.day}>
              <li className="md-timeline__day" aria-hidden>{g.day}</li>
              {g.items.map((it) => {
                const k = KIND[it.kind] || KIND.record;
                const link = onOpen && ['visit', 'incident', 'checkup', 'vaccination', 'document', 'dose', 'first_aid', 'allergy', 'condition'].includes(it.ref?.kind);
                return (
                  <li key={it.id} className={`md-titem${it.emergency ? ' is-emergency' : ''}`}>
                    <span className={`md-titem__mark md-t-${k.tone}`}><Ico name={k.icon} size={18} /></span>
                    <div className={`md-titem__card${link ? ' is-link' : ''}`} onClick={link ? () => onOpen(it) : undefined} role={link ? 'button' : undefined} tabIndex={link ? 0 : undefined}
                      onKeyDown={link ? (e) => { if (e.key === 'Enter') onOpen(it); } : undefined}>
                      <div className="md-titem__top">
                        <b>{it.title}</b>
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {it.emergency ? <Badge tone="red" size="sm">Emergency</Badge> : null}
                          {it.status ? <Badge tone={it.status.tone || 'slate'} size="sm">{it.status.label}</Badge> : null}
                        </span>
                      </div>
                      <div className="md-titem__meta">{[k.label, it.number, it.day ? '' : fmtTime(it.at), it.by].filter(Boolean).join(' · ')}</div>
                      {it.lines?.length ? <ul className="md-titem__lines">{it.lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : null}
                    </div>
                  </li>
                );
              })}
            </React.Fragment>
          ))}
        </ol>
      ) : null}
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} limit={data.limit} noun="record" onPage={(p) => set({ page: p })} /> : null}
    </div>
  );
}

/* ── Charts ───────────────────────────────────────────────────────────────── */

function DayTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e8f1', borderRadius: 10, padding: '8px 12px', boxShadow: '0 8px 20px rgba(16,20,58,.1)', fontSize: 12 }}>
      <b style={{ color: VIZ.ink }}>{fmtDay(r.day)}</b>
      <div style={{ color: VIZ.muted }}>{r.visits} visit{r.visits === 1 ? '' : 's'} · {r.incidents} incident{r.incidents === 1 ? '' : 's'}</div>
    </div>
  );
}

/** Visits per day — one series, the app's accent; the numbers are in the tooltip and the table. */
export function VisitsChart({ rows = [] }) {
  const data = rows.map((r) => ({ ...r, label: fmtDay(r.day).slice(0, 6) }));
  if (!data.some((r) => r.visits || r.incidents)) {
    return <Empty compact title="No visits in the last two weeks">Each day's Medical Room visits are drawn here.</Empty>;
  }
  return (
    <div className="mdx-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={VIZ.grid} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: VIZ.muted }} interval={1} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: VIZ.muted }} />
          <Tooltip content={<DayTip />} cursor={{ fill: 'rgba(79,70,229,.06)' }} />
          <Bar dataKey="visits" name="Visits" fill={VIZ.accent} radius={[5, 5, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Labelled horizontal bars — counts beside every bar, so colour is never the only cue. */
export function Bars({ rows = [], tone }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty compact title="Nothing yet">Figures appear here as records are made.</Empty>;
  return (
    <div className="mdx-bars">
      {rows.map((r) => (
        <div key={r.label} className={`mdx-bar md-t-${r.tone || tone || 'indigo'}`}>
          <span title={r.label}>{r.label}</span>
          <i><b style={{ width: `${Math.round((r.value / max) * 100)}%` }} /></i>
          <em>{r.value}</em>
        </div>
      ))}
    </div>
  );
}

export { ago };
