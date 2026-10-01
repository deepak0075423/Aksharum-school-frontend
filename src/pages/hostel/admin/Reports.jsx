/**
 * Hostel → Reports (Sep 2026 redesign, to the user's mockup).
 *
 * Twelve reports on one screen, each from GET /hostel/admin/board/reports:
 * the six figures across the top (the whole of the caller's hostels, whatever
 * the filters say), then for the chosen report three charts and its table.
 * The filters are drafted and applied together — a report may scan a term of
 * roll calls — and every number is counted the way the screen it summarises
 * counts it, so a report never disagrees with the list it came from.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import Tabs from '../../../components/ui/Tabs';
import { Drawer, DrawerHead, DrawerBody, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { PageHead, Mark, words, count as fmtCount, compact } from './hsUI';
import { Donut } from './hsCharts';
import {
  Kpis, Kpi, FilterBar, FSelect, FDateRange, Btn, Popover, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime, rupees,
} from './hsList';

const REPORTS = [
  ['occupancy', 'Occupancy', 'Room-wise Occupancy', '/admin/hostel/rooms'],
  ['admissions', 'Admissions', 'Applications', '/admin/hostel/admissions'],
  ['attendance', 'Attendance', 'Resident-wise Attendance', '/admin/hostel/attendance'],
  ['mess', 'Mess', 'Day-wise Meals', '/admin/hostel/mess'],
  ['fees', 'Fees', 'Invoices', '/admin/hostel/fees'],
  ['leave', 'Leave & Outpass', 'Leave & Outpass Requests', '/admin/hostel/leave'],
  ['visitors', 'Visitors', 'Visits', '/admin/hostel/visitors'],
  ['maintenance', 'Maintenance', 'Work Orders', '/admin/hostel/maintenance'],
  ['complaints', 'Complaints', 'Complaints', '/admin/hostel/complaints'],
  ['incidents', 'Incidents & Medical', 'Incidents & Medical Records', '/admin/hostel/incidents'],
  ['discipline', 'Discipline', 'Disciplinary Actions', '/admin/hostel/discipline'],
  ['summary', 'Summary', 'Period Summary', null],
];
const INFO = Object.fromEntries(REPORTS.map(([k, label, table, to]) => [k, { label, table, to }]));
/** Each report's own picker: [filter key, options key in the answer, "All …"]. */
const EXTRA = {
  occupancy: [['building', 'buildings', 'All buildings'], ['roomType', 'roomTypes', 'All room types']],
  admissions: [['status', 'statuses', 'All statuses']], attendance: [['session', 'sessions', 'All sessions']],
  mess: [['meal', 'meals', 'All meals']], fees: [['feeType', 'feeTypes', 'All fee types']], leave: [['kind', 'kinds', 'Leave & outpass']],
  visitors: [['status', 'statuses', 'All statuses']], maintenance: [['category', 'categories', 'All categories']],
  complaints: [['category', 'categories', 'All categories']], incidents: [['kind', 'kinds', 'All kinds']],
  discipline: [['group', 'groups', 'All actions']], summary: [],
};
const FILTER_KEYS = ['hostel', 'building', 'roomType', 'status', 'session', 'meal', 'feeType', 'kind', 'category', 'group', 'from', 'to'];
const BLANK = Object.fromEntries(FILTER_KEYS.map((k) => [k, '']));

/* ── colours ──────────────────────────────────────────────────────────────── */
const KEYED = {
  occupied: '#22c55e', available: '#93c5fd', reserved: '#cbd5e1', maintenance: '#f59e0b', collected: '#22c55e', outstanding: '#f59e0b',
  refunded: '#94a3b8', present: '#22c55e', late: '#f59e0b', absent: '#ef4444', on_leave: '#93c5fd', excused: '#cbd5e1',
  taken: '#22c55e', skipped: '#ef4444', guest: '#8b5cf6', pending: '#f59e0b', approved: '#3b82f6', allocated: '#22c55e',
  waitlisted: '#8b5cf6', rejected: '#ef4444', cancelled: '#cbd5e1', returned: '#22c55e', away: '#3b82f6', overdue: '#ef4444',
  closed: '#cbd5e1', checked_out: '#22c55e', checked_in: '#3b82f6', completed: '#22c55e', progress: '#f59e0b', open: '#3b82f6',
  scheduled: '#8b5cf6', resolved: '#22c55e', reopened: '#f97316', incident: '#ef4444', medical: '#22c55e', emergency: '#b91c1c',
  critical: '#b91c1c', high: '#ef4444', medium: '#f59e0b', low: '#22c55e', warning: '#3b82f6', fine: '#ef4444', escalation: '#f97316',
  spent: '#f59e0b', repairs: '#8b5cf6',
};
const PALETTE = ['#4f46e5', '#3b82f6', '#93c5fd', '#cbd5e1', '#22c55e', '#f59e0b', '#8b5cf6', '#14b8a6', '#f97316'];

/* ── status tags ──────────────────────────────────────────────────────────── */
const STATE = {
  full: ['Full', 'red'], partial: ['Partially Occupied', 'amber'], available: ['Available', 'green'], maintenance: ['Maintenance', 'slate'],
  reserved: ['Reserved', 'lavender'], inactive: ['Inactive', 'slate'], pending: ['Pending', 'amber'], approved: ['Approved', 'blue'],
  allocated: ['Allocated', 'green'], waitlisted: ['Waitlisted', 'violet'], rejected: ['Rejected', 'red'], cancelled: ['Cancelled', 'slate'],
  paid: ['Paid', 'green'], overdue: ['Overdue', 'red'], refunded: ['Refunded', 'slate'], away: ['Away', 'blue'], returned: ['Returned', 'green'],
  closed: ['Closed', 'slate'], checked_in: ['Checked In', 'blue'], checked_out: ['Checked Out', 'green'], open: ['Open', 'blue'],
  progress: ['In Progress', 'amber'], completed: ['Completed', 'green'], scheduled: ['Scheduled', 'lavender'], resolved: ['Resolved', 'green'],
  reopened: ['Reopened', 'orange'], reported: ['Open', 'blue'], investigating: ['In Progress', 'amber'], action_taken: ['In Progress', 'amber'],
  issued: ['Pending', 'amber'], acknowledged: ['Under Review', 'orange'], served: ['Resolved', 'green'], revoked: ['Revoked', 'slate'],
};
const StateTag = ({ value }) => { const [t, tone] = STATE[value] || [words(value), 'slate']; return <Badge tone={tone}>{t}</Badge>; };

/** One cell, by the column's type. */
function cell(col, r) {
  const v = r[col.key];
  switch (col.type) {
    case 'num': return v == null ? '—' : fmtCount(v);
    case 'pct': return v == null ? '—' : `${v}%`;
    case 'money': return v == null ? '—' : rupees(v);
    case 'date': return v ? fmtDate(v) : '—';
    case 'datetime': return v ? <TwoLine top={fmtDate(v)} sub={fmtTime(v)} /> : '—';
    case 'words': return v ? words(v) : '—';
    case 'status': return <StateTag value={v} />;
    case 'clip': return <span className="hs-wrap2">{v || '—'}</span>;
    case 'metric': return v == null ? <span className="hs-muted">—</span> : r.kind === 'money' ? rupees(v) : r.kind === 'pct' ? `${v}%` : fmtCount(v);
    case 'change': return v == null ? <span className="hs-muted">—</span>
      : <span className={v > 0 ? 'hs-pt-green' : v < 0 ? 'hs-pt-red' : 'hs-muted'}>{v > 0 ? '+' : ''}{v}%</span>;
    default: return v === '' || v == null ? '—' : String(v);
  }
}
const plain = (col, r) => {
  const v = r[col.key];
  if (v == null || v === '') return '';
  if (['date', 'datetime'].includes(col.type)) return `${fmtDate(v)}${col.type === 'datetime' ? ` ${fmtTime(v)}` : ''}`;
  if (col.type === 'status') return (STATE[v] || [words(v)])[0];
  if (col.type === 'words') return words(v);
  return v;
};

/** A value as the drawer shows it; the CSV keeps plain numbers for spreadsheets. */
const shown = (col, r) => {
  const v = r[col.key];
  if (v == null || v === '') return '—';
  if (col.type === 'money') return rupees(v);
  if (col.type === 'pct') return `${v}%`;
  if (col.type === 'metric') return r.kind === 'money' ? rupees(v) : r.kind === 'pct' ? `${v}%` : fmtCount(v);
  if (col.type === 'change') return `${v > 0 ? '+' : ''}${v}%`;
  return String(plain(col, r));
};

/* ── charts ───────────────────────────────────────────────────────────────── */
const fmt = (money) => (v) => (money ? rupees(v) : fmtCount(v));
function DonutCard({ c }) {
  const total = c.items.reduce((s, i) => s + i.value, 0);
  const slices = c.items.map((i, n) => ({ key: i.key, value: i.value, color: KEYED[i.key] || PALETTE[n % PALETTE.length] }));
  const center = typeof c.center?.value === 'number' && c.money ? `${c.center.value < 0 ? '−' : ''}₹${compact(Math.abs(c.center.value))}` : c.center?.value;
  return (
    <section className="hs-card hs-rchart">
      <h3>{c.title}</h3>
      {total > 0 ? (
        <div className="hs-rchart__donut">
          <Donut slices={slices} size={150} thickness={24} label={c.title}>
            <strong>{typeof center === 'number' ? fmtCount(center) : center}</strong><span>{c.center?.label}</span>
          </Donut>
          <ul className="hs-rlegend">
            {c.items.map((i, n) => (
              <li key={i.key}>
                <i style={{ background: slices[n].color }} /><span>{i.label}</span>
                <b>{c.money ? rupees(i.value) : fmtCount(i.value)} <small>({total ? Math.round((i.value / total) * 1000) / 10 : 0}%)</small></b>
              </li>
            ))}
            {c.foot ? <li className="hs-rlegend__foot"><span>{c.foot.label}</span><b>{c.money ? rupees(c.foot.value) : fmtCount(c.foot.value)}</b></li> : null}
          </ul>
        </div>
      ) : <p className="hs-muted hs-rchart__none">Nothing to show for these filters.</p>}
    </section>
  );
}
function BarsCard({ c }) {
  const f = fmt(c.money);
  return (
    <section className="hs-card hs-rchart">
      <div className="hs-rchart__head">
        <h3>{c.title}</h3>
        {c.legend ? <span className="hs-rchart__keys"><span><i className="is-a" />{c.legend[0]}</span><span><i className={c.compare ? 'is-c' : 'is-b'} />{c.legend[1]}</span></span> : null}
      </div>
      {c.items.length ? (
        <ul className="hs-rbars">
          {c.items.map((i) => (
            <li key={i.label}>
              <span className="hs-rbars__label">{i.label}</span>
              {c.compare ? (
                // This period against the last: two bars on one scale, and the change.
                <span className="hs-rbars__pair">
                  <i style={{ width: `${i.total ? Math.min(100, (i.value / i.total) * 100) : 0}%` }} />
                  <i className="is-before" style={{ width: `${i.total ? Math.min(100, (i.before / i.total) * 100) : 0}%` }} />
                </span>
              ) : <span className="hs-rbars__track">{i.total ? <i style={{ width: `${Math.min(100, (i.value / i.total) * 100)}%` }} /> : null}</span>}
              <span className="hs-rbars__val">{c.compare ? `${f(i.value)} · was ${f(i.before)}` : c.money ? `₹${compact(i.value)} / ₹${compact(i.total)}` : `${f(i.value)} / ${f(i.total)}`}</span>
              <span className={`hs-rbars__pct${c.compare && i.before ? (i.value >= i.before ? ' hs-pt-green' : ' hs-pt-red') : ''}`}>
                {c.compare ? (i.before ? `${i.value >= i.before ? '+' : ''}${Math.round(((i.value - i.before) / i.before) * 100)}%` : '—')
                  : i.total ? `${Math.round((i.value / i.total) * 1000) / 10}%` : '-'}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="hs-muted hs-rchart__none">Nothing to show for these filters.</p>}
    </section>
  );
}

/** The table card's Export menu. */
function ExportMenu({ onPage, onAll }) {
  const [open, setOpen] = useState(false);
  const btn = React.useRef(null);
  return (
    <>
      <Btn ref={btn} size="sm" icon="download" iconRight="chevronDown" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Export</Btn>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label="Export">
        <div className="hs-menu2" role="menu">
          <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { setOpen(false); onPage(); }}><span>This page (CSV)</span></button>
          <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { setOpen(false); onAll(); }}><span>Every row (CSV)</span></button>
          <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { setOpen(false); window.print(); }}><span>Print</span></button>
        </div>
      </Popover>
    </>
  );
}

export default function Reports() {
  const { state, set, setPage } = useListState({ limit: 10, report: 'occupancy', ...BLANK }, { fromUrl: ['report', 'hostel', 'from', 'to'] });
  const report = INFO[state.report] ? state.report : 'occupancy';
  const [draft, setDraft] = useState(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, state[k] || ''])));
  const { data, loading } = useBoardData((q) => api.getBoard('reports', q), { ...state, report });
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const [selected, setSelected] = useState(new Set());
  const [row, setRow] = useState(null);

  const t = data?.tiles || {};
  const opts = data?.options || {};
  const rows = data?.rows || [];
  const columns = data?.columns || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const dirty = FILTER_KEYS.some((k) => (draft[k] || '') !== (state[k] || ''));

  const choose = (k) => {
    // Filters that belong to one report do not follow the user to the next.
    const keep = { hostel: draft.hostel, from: draft.from, to: draft.to };
    setDraft({ ...BLANK, ...keep }); set({ ...BLANK, ...keep, report: k }); setSelected(new Set());
  };
  const apply = () => { set({ ...draft }); setSelected(new Set()); };
  const clear = () => { setDraft(BLANK); set({ ...BLANK }); setSelected(new Set()); };

  const tableCols = useMemo(() => [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    ...columns.map((c) => ({ key: c.key, label: c.label, render: (r) => cell(c, r), nowrap: ['date', 'num', 'pct', 'money', 'status'].includes(c.type) })),
  ], [columns, from]);
  const csvCols = columns.map((c) => ({ label: c.label, value: (r) => plain(c, r) }));
  const file = `hostel-${report}-report.csv`;
  const exportAll = async () => {
    try {
      const res = await api.getBoard('reports', { ...state, report, page: 1, limit: 5000 });
      const d = res.data ?? res;
      exportCsv(file, (d.columns || []).map((c) => ({ label: c.label, value: (r) => plain(c, r) })), d.rows || []);
    } catch (err) { toast.error(err.message); }
  };
  const info = INFO[report];

  return (
    <div className="hs-page hs-reports">
      <PageHead title="Hostel Reports" subtitle="Get detailed insights about hostel occupancy, admissions, fees, attendance, mess, maintenance and more.">
        <Btn className="hs-btn--accent" icon="printer" onClick={() => window.print()}>Print</Btn>
        <Btn kind="primary" icon="download" onClick={exportAll}>Export CSV</Btn>
      </PageHead>

      <Kpis cols={6} size="sm">
        <Kpi tone="indigo" icon="group" value={t.capacity ?? 0} label="Total Capacity" note={t.hostels === 1 ? 'In the one hostel' : 'Across all hostels'} />
        <Kpi tone="green" icon="bedSolid" value={t.occupied ?? 0} label="Occupied Beds" pct={t.occupiedPct ?? 0} pctLabel={`${t.occupiedPct ?? 0}% occupancy`} pctTone="muted" bar barColor="#22c55e" />
        <Kpi tone="sky" icon="person" value={t.vacant ?? 0} label="Vacant Beds" pct={t.vacantPct ?? 0} pctLabel={`${t.vacantPct ?? 0}% available`} pctTone="muted" bar barColor="#3b82f6" />
        <Kpi tone="red" icon="personAlert" value={t.residents ?? 0} label="Active Residents" note={`+${t.joined ?? 0} new this month`} />
        <Kpi tone="amber" icon="stack" value={rupees(t.collected ?? 0)} label="Fees Collected" note="This academic year" />
        <Kpi tone="violet" icon="wrench" value={t.maintenance ?? 0} label="Maintenance Requests" note={`${t.pending ?? 0} pending`} />
      </Kpis>

      <Tabs variant="pill" className="hs-rtabs" label="Reports" value={report} onChange={choose}
        items={REPORTS.map(([key, label]) => ({ key, label }))} />

      <FilterBar>
        <FSelect value={draft.hostel} onChange={(v) => setDraft((d) => ({ ...d, hostel: v, building: '' }))} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="180px" />
        {(EXTRA[report] || []).map(([k, optKey, all]) => (
          <FSelect key={k} value={draft[k]} onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} all={all} options={opts[optKey] || []} grow={0} width="180px" />
        ))}
        {data?.noDates ? null : <FDateRange from={draft.from} to={draft.to} onChange={(v) => setDraft((d) => ({ ...d, ...v }))} grow={1} width="300px" />}
        <span className="hs-filters__gap" />
        <Btn kind="primary" icon="filter" onClick={apply} className={dirty ? 'is-dirty' : ''} title={dirty ? 'The filters have changed — apply them' : undefined}>Apply Filters</Btn>
        <Btn icon="refresh" onClick={clear}>Reset</Btn>
      </FilterBar>
      {report === 'summary' && data?.period ? (
        <p className="hs-roll__saved">{fmtDate(data.period.from)} – {fmtDate(data.period.to)}, against the same length of time before it ({fmtDate(data.period.prevFrom)} onwards). Choose dates to compare another period.</p>
      ) : null}

      <div className="hs-rcharts">
        {(data?.charts || []).map((c) => (c.kind === 'donut' ? <DonutCard key={c.title} c={c} /> : <BarsCard key={c.title} c={c} />))}
      </div>

      <ListCard head={(
        <>
          <h2 className="hs-lcard__title">{info.table}</h2>
          <ExportMenu onPage={() => exportCsv(file, csvCols, rows)} onAll={exportAll} />
        </>
      )}>
        <BulkBar count={selected.size} noun="row" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => exportCsv(file, csvCols, rows.filter((r, i) => selected.has(String(r._id ?? r.day ?? i))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          key={report} columns={tableCols} rows={rows} loading={loading} pad={7} headPad={11} dense
          rowKey={report === 'mess' ? 'day' : '_id'} selected={selected} onSelect={setSelected}
          actions={report === 'summary' ? undefined : (r) => <Btn size="sm" onClick={() => setRow(r)}>View</Btn>}
          empty={<EmptyRows icon="barsUp" title="Nothing to report">No records match these filters. Try a wider date range, or another hostel.</EmptyRows>}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={report === 'occupancy' ? (data?.total === 1 ? 'room' : 'rooms') : data?.total === 1 ? 'row' : 'rows'}
          onPage={setPage} size="sm" sizes={[10, 25, 50, 100]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      <Drawer open={!!row} onClose={() => setRow(null)} label="Report row">
        {row ? (
          <>
            <DrawerHead mark={<Mark name="barsUp" tone="indigo" size={52} glyph={26} />} name={String(row[columns[0]?.key] ?? info.table)}
              sub={info.label} onClose={() => setRow(null)} />
            <DrawerBody>
              <DrawerFields fields={columns.slice(1).map((c) => [c.label, shown(c, row)])} />
            </DrawerBody>
            {info.to ? (
              <DrawerFoot>
                <Btn as={Link} kind="primary" iconRight="arrowRight" to={report === 'leave' && row.kind === 'outpass' ? '/admin/hostel/outpass' : info.to}>
                  Open {report === 'leave' && row.kind === 'outpass' ? 'Outpass' : info.label}
                </Btn>
              </DrawerFoot>
            ) : null}
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
