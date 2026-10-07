/**
 * Medical Reports (Oct 2026) — twenty reports about students, the room and the
 * stock, each with its filters, a summary, a chart where one helps, the table
 * and a CSV export. Exporting is recorded in the audit trail.
 */
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Select, Table, Empty, Spin, LoadError, Toolbar, useLoad } from '../mdUI';
import { Bars } from '../mdShared';
import { useMeta } from './mdForms';
import {
  STATUS_MAPS, ALLERGY_CATEGORY, ALLERGY_SEVERITY, CONDITION_TYPE, CONDITION_SEVERITY, PLAN_STATUS, BLOOD_GROUPS, VACCINATION_STATUS, CHECKUP_TYPE,
  CHECKUP_OUTCOME, INCIDENT_TYPE, INCIDENT_SEVERITY, MOVE_TYPE, fmtDay, fmtDate, fmtStamp, money, qty, toCsv, downloadText,
} from '../mdMeta';

const PERIOD = ['history', 'medication', 'checkups', 'daily_visits', 'monthly_visits', 'incidents', 'first_aid', 'sent_home', 'referrals', 'expired', 'medicine_consumption', 'first_aid_consumption', 'movements', 'specialist_referrals', 'campaigns', 'outbreaks'];
const STUDENT_SCOPE = ['history', 'allergies', 'conditions', 'medication', 'blood_groups', 'vaccinations', 'checkups', 'daily_visits', 'monthly_visits', 'incidents', 'first_aid', 'sent_home', 'referrals', 'growth', 'vaccine_coverage', 'specialist_referrals'];
const KIND_SCOPE = ['current_stock', 'low_stock', 'expired', 'expiring', 'movements'];
const NUMERIC = ['number', 'money', 'signed'];
const toOpts = (map) => Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }));
const FILTERS = {
  allergies: { category: ['Allergy type', toOpts(ALLERGY_CATEGORY)], status: ['Severity', toOpts(ALLERGY_SEVERITY)] },
  conditions: { category: ['Condition type', toOpts(CONDITION_TYPE)], status: ['Severity', toOpts(CONDITION_SEVERITY)] },
  medication: { status: ['Plan status', toOpts(PLAN_STATUS)] },
  blood_groups: { category: ['Blood group', BLOOD_GROUPS], status: ['Recorded', [{ value: 'missing', label: 'Not recorded only' }]] },
  vaccinations: { status: ['Status', toOpts(VACCINATION_STATUS)] },
  checkups: { category: ['Checkup', toOpts(CHECKUP_TYPE)], status: ['Outcome', toOpts(CHECKUP_OUTCOME)] },
  incidents: { category: ['Incident type', toOpts(INCIDENT_TYPE)], status: ['Severity', toOpts(INCIDENT_SEVERITY)] },
  movements: { status: ['Movement', toOpts(MOVE_TYPE)] },
};

const ALL_MAPS = Object.values(STATUS_MAPS);
function statusBadge(v, statusMap) {
  if (v === null || v === undefined || v === '') return <span className="md-none">—</span>;
  const hit = statusMap?.[v] || ALL_MAPS.map((m) => m[v]).find(Boolean);
  return <Badge tone={hit?.tone || 'slate'} size="sm">{hit?.label || String(v).replace(/_/g, ' ')}</Badge>;
}
// A date never breaks across lines ("04 Oct" / "2026").
const nowrap = (text) => <span style={{ whiteSpace: 'nowrap' }}>{text}</span>;

function cell(c, r, statusMap) {
  const v = r[c.key];
  switch (c.type) {
  case 'datetime': return v ? nowrap(fmtStamp(v)) : '—';
  case 'date': return v ? nowrap(fmtDate(v)) : '—';
  case 'day': return v ? nowrap(fmtDay(v)) : '—';
  case 'month': return v ? nowrap(new Date(`${v}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })) : '—';
  case 'number': return v === '' || v === null || v === undefined ? '—' : qty(v);
  case 'money': return money(v);
  case 'signed': return <b style={{ color: v < 0 ? '#b91c1c' : '#15803d' }}>{v > 0 ? '+' : ''}{qty(v)}</b>;
  case 'status': return statusBadge(v, statusMap);
  default: return v === null || v === undefined || v === '' ? <span className="md-none">—</span> : <span className="md-clamp">{String(v)}</span>;
  }
}
const csvOf = (c, r, statusMap) => {
  const v = r[c.key];
  if (c.type === 'status' && statusMap?.[v]) return statusMap[v].label;
  if (c.type === 'datetime') return v ? fmtStamp(v) : '';
  if (c.type === 'day') return v ? fmtDay(v) : '';
  if (c.type === 'date') return v ? fmtDate(v) : '';
  if (c.type === 'status') { const hit = ALL_MAPS.map((m) => m[v]).find(Boolean); return hit?.label || v || ''; }
  return v ?? '';
};

export default function MedicalReports() {
  const [params, setParams] = useSearchParams();
  const { meta } = useMeta();
  const catalogue = useLoad(() => api.getMedReports(), 'catalogue');
  // `report` names the report; `kind` is a filter of the inventory reports.
  const kind = params.get('report') || 'daily_visits';
  const f = Object.fromEntries([...params.entries()].filter(([k]) => k !== 'report'));
  const report = useLoad(() => api.getMedReport(kind, f), { kind, ...f });
  const set = (patch) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    return next;
  }, { replace: true });
  const choose = (k) => setParams({ report: k }, { replace: true });
  const groups = useMemo(() => {
    const out = {};
    for (const c of catalogue.data || []) (out[c.group] = out[c.group] || []).push(c);
    return out;
  }, [catalogue.data]);
  const r = report.data;
  const classes = meta?.classes || [];
  const sections = classes.find((c) => c._id === f.classId)?.sections || [];
  const extra = FILTERS[kind] || {};
  const exportCsv = () => {
    const cols = r.columns.map((c) => ({ key: c.key, label: c.label, csv: (row) => csvOf(c, row, r.statusMap) }));
    downloadText(toCsv(cols, r.rows), `${kind}-${new Date().toISOString().slice(0, 10)}.csv`);
    api.getMedReport(kind, { ...f, export: 1 }).catch(() => {});
  };
  return (
    <Page>
      <PageHead icon="chart" tone="blue" title="Medical Reports" subtitle="Reports on students' health, the Medical Room's work and its stock — filtered by academic year, class, section, dates and category, and exported as CSV." />
      <div className="mdrep">
        <nav className="mdrep-nav" aria-label="Reports">
          {Object.entries(groups).map(([g, list]) => (
            <div key={g}>
              <h4>{g}</h4>
              {list.map((c) => (
                <button key={c.kind} type="button" className={c.kind === kind ? 'is-on' : ''} onClick={() => choose(c.kind)} aria-current={c.kind === kind ? 'page' : undefined}>
                  <b>{c.title}</b><em>{c.about}</em>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <Panel title={r?.title || 'Report'} sub={r ? [r.about, r.subtitle].filter(Boolean).join(' · ') : ''} icon="chart" tone="blue" pad={false}
          right={r ? <><Btn size="sm" icon="printer" onClick={() => window.print()}>Print</Btn><Btn size="sm" kind="primary" icon="download" onClick={exportCsv} disabled={!r.rows.length}>Export CSV</Btn></> : null}>
          <Toolbar>
            {meta?.years?.length && (PERIOD.includes(kind) || STUDENT_SCOPE.includes(kind)) ? <Select value={f.year} onChange={(v) => set({ year: v })} all="Any academic year" label="Academic year" options={meta.years.map((y) => ({ value: y._id, label: y.yearName }))} /> : null}
            {STUDENT_SCOPE.includes(kind) ? <Select value={f.classId} onChange={(v) => set({ classId: v, sectionId: '' })} all="All classes" label="Class" options={classes.map((c) => ({ value: c._id, label: c.className }))} /> : null}
            {STUDENT_SCOPE.includes(kind) && f.classId && sections.length ? <Select value={f.sectionId} onChange={(v) => set({ sectionId: v })} all="All sections" label="Section" options={sections.map((x) => ({ value: x._id, label: `Section ${x.sectionName}` }))} /> : null}
            {PERIOD.includes(kind) ? <><input className="md-input" type="date" value={f.from || ''} onChange={(e) => set({ from: e.target.value })} aria-label="From" style={{ width: 150 }} /><input className="md-input" type="date" value={f.to || ''} onChange={(e) => set({ to: e.target.value })} aria-label="To" style={{ width: 150 }} /></> : null}
            {KIND_SCOPE.includes(kind) ? <Select value={f.kind} onChange={(v) => set({ kind: v })} all="Medicines and supplies" label="Kind" options={[{ value: 'medicine', label: 'Medicines' }, { value: 'supply', label: 'First-aid supplies' }]} /> : null}
            {['current_stock', 'low_stock'].includes(kind) ? <Select value={f.category} onChange={(v) => set({ category: v })} all="Any category" label="Category" options={[...(meta?.settings?.medicineCategories || []), ...(meta?.settings?.supplyCategories || [])]} /> : null}
            {kind === 'vaccinations' ? <input data-text="title" className="md-input" value={f.category || ''} onChange={(e) => set({ category: e.target.value })} placeholder="Vaccine" style={{ width: 160 }} aria-label="Vaccine" /> : null}
            {kind === 'expiring' ? <Select value={f.days} onChange={(v) => set({ days: v })} all={`Within ${meta?.settings?.expiryAlertDays || 60} days`} label="Window" options={['7', '15', '30', '60', '90', '180'].map((d) => ({ value: d, label: `Within ${d} days` }))} /> : null}
            {extra.category ? <Select value={f.category} onChange={(v) => set({ category: v })} all={`Any ${extra.category[0].toLowerCase()}`} label={extra.category[0]} options={extra.category[1]} /> : null}
            {extra.status ? <Select value={f.status} onChange={(v) => set({ status: v })} all={`Any ${extra.status[0].toLowerCase()}`} label={extra.status[0]} options={extra.status[1]} /> : null}
            {Object.keys(f).length ? <Btn size="sm" kind="ghost" icon="close" onClick={() => setParams({ report: kind }, { replace: true })}>Clear</Btn> : null}
          </Toolbar>
          {report.error && !r ? <LoadError error={report.error} onRetry={report.reload} /> : !r ? <Spin /> : (
            <>
              {r.summary?.length ? (
                <div className="mdrep-sum">
                  {r.summary.map((x) => <div key={x.label} className={x.tone ? `md-t-${x.tone}` : ''}><span>{x.label}</span><strong>{x.money ? money(x.value) : qty(x.value)}</strong></div>)}
                </div>
              ) : null}
              {r.chart?.data?.some((d) => d.value) ? <Bars rows={r.chart.data.map((d) => ({ label: d.label, value: d.value, tone: d.tone }))} tone="blue" /> : null}
              <Table rows={r.rows.map((row, i) => ({ ...row, __k: i }))} rowKey="__k" minWidth={Math.max(640, r.columns.reduce((n, c) => n + (NUMERIC.includes(c.type) ? 92 : 150), 0))}
                columns={r.columns.map((c, i) => ({ key: c.key, label: c.label, align: NUMERIC.includes(c.type) ? 'right' : undefined, primary: i === 0, render: (row) => cell(c, row, r.statusMap) }))}
                empty={<Empty compact title="Nothing to report">No records match these filters.</Empty>} />
              {r.truncated ? <p className="md-muted" style={{ padding: '10px 18px' }}>Showing the first 5,000 rows — narrow the filters to see the rest.</p> : null}
            </>
          )}
        </Panel>
      </div>
    </Page>
  );
}
