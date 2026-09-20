/**
 * Fees → Reports (mockup 9). Five tiles for the chosen window, a filter card,
 * and eight reports. The overview draws the collection trend, collection by
 * fee head, a class summary and the latest transactions; every other tab is
 * one table the server builds once for the screen, the Excel file, the email
 * and the scheduled send alike.
 *
 * There are no terms in this app. "Term 1" / "Term 2" are the academic year's
 * two halves and say so; the comparison reads "vs last term" only then.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getReportOverview, getReport, exportReport } from '../../../api/fees.api';
import {
  FeHead, Btn, Card, CardHead, Tile, Tiles, Select, DateRange, StatusBadge, LinkBtn, IconBtn, Note, Glyph,
  money, fmtDate, yearOptions, isoDay, rangePresets, Empty, Loading, saveFile,
} from './feeUI';
import { AreaTrend, Donut, DonutLegend, INK } from './feeCharts';
import { EmailReportDialog, ScheduleDialog, REPORT_TABS } from './feeForms';
import { useFeesMeta, classOptions, sectionOptions, useUrlState } from './feeData';
import { MoreMenu } from './FeeStructures';

const DEFAULTS = { tab: 'collection', academicYearId: '', term: '', classId: '', sectionId: '', from: '', to: '', categoryId: '', status: '', studentType: '' };
const HEAD_INK = ['#2563eb', '#16a34a', '#f59e0b', '#ec4899', '#a21caf', '#94a3b8'];

/** One cell of a server-built report. */
function Cell({ col, value, sym }) {
  if (value == null || value === '') return <span className="fe-muted">—</span>;
  if (col.type === 'money') return <span className="fe-num">{money(value, { sym, space: true })}</span>;
  if (col.type === 'pct') return <span>{value}%</span>;
  if (col.type === 'date') return <span className="fe-num">{fmtDate(value)}</span>;
  return <span>{value}</span>;
}

function ReportTable({ report, sym, columns }) {
  if (!report) return <Loading rows={6} />;
  const cols = columns ? report.columns.filter(c => columns.has(c.key)) : report.columns;
  if (!report.rows.length) return <Empty title="Nothing to report" hint="No records match these filters for this period." />;
  return (
    <div className="fe-tablewrap">
      <table className="fe-table">
        <thead><tr><th>#</th>{cols.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>
          {report.rows.slice(0, 500).map((r, i) => (
            <tr key={i}><td className="fe-w-idx">{i + 1}</td>{cols.map(c => <td key={c.key}><Cell col={c} value={r[c.key]} sym={sym} /></td>)}</tr>
          ))}
        </tbody>
        {report.totals ? <tfoot><tr><td />{cols.map(c => <td key={c.key}><Cell col={c} value={report.totals[c.key]} sym={sym} /></td>)}</tr></tfoot> : null}
      </table>
      {report.rows.length > 500 ? <p className="fe-form__hint" style={{ padding: '10px 18px' }}>Showing the first 500 of {report.rows.length} rows — Export to Excel has all of them.</p> : null}
    </div>
  );
}

/** A printable page of the current report, for "Download PDF" (the browser saves it). */
function printReport({ title, period, tiles, table, sym }) {
  const w = window.open('', '_blank');
  if (!w) { toast.error('Allow pop-ups to download the PDF'); return; }
  const esc = (s) => String(s ?? '').replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
  const fmt = (c, v) => (v == null || v === '' ? '' : c.type === 'money' ? money(v, { sym, space: true }) : c.type === 'pct' ? `${v}%` : c.type === 'date' ? fmtDate(v) : esc(v));
  const body = table ? `<table><thead><tr>${table.columns.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${
    table.rows.map(r => `<tr>${table.columns.map(c => `<td>${fmt(c, r[c.key])}</td>`).join('')}</tr>`).join('')}${
    table.totals ? `<tr class="t">${table.columns.map(c => `<td>${fmt(c, table.totals[c.key])}</td>`).join('')}</tr>` : ''}</tbody></table>` : '';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;padding:28px}
    h1{font-size:20px;margin:0 0 4px}p{color:#64748b;margin:0 0 18px;font-size:13px}
    .tiles{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}.tiles div{border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;min-width:150px}
    .tiles small{display:block;color:#64748b;font-size:11px}.tiles b{font-size:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0}
    th{background:#f8fafc;color:#475569}.t td{font-weight:700}@media print{button{display:none}}
  </style></head><body><button onclick="window.print()" style="float:right">Print or save as PDF</button>
  <h1>${esc(title)}</h1><p>${esc(period)}</p>
  <div class="tiles">${tiles.map(t => `<div><small>${esc(t[0])}</small><b>${esc(t[1])}</b></div>`).join('')}</div>${body}
  <script>setTimeout(function(){window.print()},300)</script></body></html>`);
  w.document.close();
}

export default function FeesReports() {
  const nav = useNavigate();
  const [applied, setApplied] = useUrlState(DEFAULTS);
  const [draft, setDraft] = useState(applied);
  const [scope, setScope] = useState('period');
  const [hover, setHover] = useState(null);
  const [emailing, setEmailing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [customCols, setCustomCols] = useState(null);
  useEffect(() => { setDraft(applied); }, [JSON.stringify(applied)]); // eslint-disable-line react-hooks/exhaustive-deps

  const { meta } = useFeesMeta(applied.academicYearId);
  const { meta: draftMeta } = useFeesMeta(draft.academicYearId);
  const { tab, ...filters } = applied;
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null));
  const { data: ov, loading } = useFetch(() => getReportOverview(scope === 'year' ? { ...clean, from: undefined, to: undefined, term: undefined } : clean),
    [JSON.stringify(clean), scope]);
  const { data: tableData } = useFetch(() => getReport(tab, clean), [tab, JSON.stringify(clean)]);
  const sym = meta?.settings?.currencySymbol || '₹';
  const t = ov?.tiles || {};
  const year = ov?.year || meta?.year;
  const yearValue = draft.academicYearId || year?._id || '';
  const win = ov?.window;
  const period = win ? `${fmtDate(win.from)} - ${fmtDate(win.to)}` : '';
  const cmp = ov?.compareLabel || 'vs previous period';
  const setD = (k) => (v) => setDraft(d => ({ ...d, [k]: v, ...(k === 'classId' ? { sectionId: '' } : {}),
    ...(k === 'academicYearId' ? { classId: '', sectionId: '', term: '', from: '', to: '' } : {}), ...(k === 'term' ? { from: '', to: '' } : {}) }));
  const generate = () => setApplied({ ...draft });
  const reset = () => { setDraft({ ...DEFAULTS, tab }); setApplied({ ...DEFAULTS, tab }); };
  const custom = useMemo(() => (tab === 'custom' && tableData ? (customCols || new Set(tableData.columns.map(c => c.key))) : null), [tab, tableData, customCols]);

  const exportXlsx = async () => {
    try {
      const params = { ...clean, ...(custom ? { columns: [...custom].join(',') } : {}) };
      const blob = await exportReport(tab, params);
      saveFile(blob, `${REPORT_TABS.find(r => r[0] === tab)[1].toLowerCase().replace(/\s+/g, '-')}-${year?.yearName || ''}.xlsx`);
    } catch (e) { toast.error(e.message === 'Something went wrong' ? 'The export could not be built' : e.message); }
  };
  const pdf = () => printReport({
    title: `Fees — ${REPORT_TABS.find(r => r[0] === tab)[1]}`, period: `${year?.yearName || ''} · ${period}`, sym,
    tiles: [['Total Collection', money(t.collection, { sym })], ['Total Dues', money(t.dues, { sym })], ['Students Paid', `${t.studentsPaid || 0} / ${t.studentsCharged || 0}`],
      ['Pending Payments', String(t.pendingPayments || 0)], ['Concessions Given', money(t.concessions, { sym })]],
    table: tableData ? { ...tableData, columns: custom ? tableData.columns.filter(c => custom.has(c.key)) : tableData.columns } : null,
  });
  const paidPct = t.studentsCharged ? Math.round(t.studentsPaid / t.studentsCharged * 100) : 0;
  const slices = (ov?.byHead?.slices || []).map((s, i) => ({ label: s.name, value: s.amount, pct: s.pct, color: HEAD_INK[i] || INK.slate, names: s.names }));
  // The year's two halves, named by their months: "Term 1 (Apr–Sep)".
  const mon = (add) => { const x = new Date(year.startDate); x.setMonth(x.getMonth() + add); return x.toLocaleString('en-IN', { month: 'short' }); };
  const termOptions = year ? [
    { value: 't1', label: `Term 1 (${mon(0)}–${mon(5)})` },
    { value: 't2', label: `Term 2 (${mon(6)}–${mon(11)})` },
  ] : [];

  return (
    <div className="fe-page">
      <FeHead title="Fees Reports" subtitle="Get detailed insights and analytics about fee collection, dues, concessions and more">
        <Btn variant="outline" glyph="calendar" onClick={() => setScheduling(true)}>Scheduled Reports</Btn>
        <MoreMenu label="Generate Report" variant="primary" width={220} items={[
          { icon: 'filePdf', label: 'Download PDF', onClick: pdf },
          { icon: 'fileSheet', label: 'Export to Excel', onClick: exportXlsx },
          { icon: 'mail', label: 'Email this report', onClick: () => setEmailing(true) },
        ]} />
      </FeHead>

      <Tiles n={5}>
        <Tile glyph="rupee" tone="green" label="Total Collection" value={money(t.collection, { sym, space: true })} delta={{ pct: t.collectionChange, caption: cmp, noSign: true }} />
        <Tile glyph="bangRing" tone="red" label="Total Dues" value={money(t.dues, { sym, space: true })} delta={{ pct: t.duesChange, upIsGood: false, caption: cmp, noSign: true }} />
        <Tile glyph="users" tone="blue" label="Students Paid" value={`${t.studentsPaid || 0} / ${t.studentsCharged || 0}`} share={{ pct: paidPct, color: '#2563eb' }} />
        <Tile glyph="clockRing" tone="amber" label="Pending Payments" value={(t.pendingPayments || 0).toLocaleString('en-IN')} share={{ pct: t.studentsCharged ? 100 - paidPct : 0, color: '#f59e0b' }} />
        <Tile glyph="docFill" tone="purple" label="Concessions Given" value={money(t.concessions, { sym, space: true })} delta={{ pct: t.concessionsChange, caption: cmp, noSign: true }} />
      </Tiles>

      <Card className="fe-filters">
        <h3 className="fe-filters__title">Report Filters</h3>
        <div className="fe-frow" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr)) minmax(0, 1.2fr)' }}>
          <Select label="Academic Year" value={yearValue} onChange={setD('academicYearId')} options={yearOptions(draftMeta?.years || meta?.years)} />
          <Select label="Term" value={draft.term} onChange={setD('term')} all="All Terms" options={termOptions} />
          <Select label="Class" value={draft.classId} onChange={setD('classId')} all="All Classes" options={classOptions(draftMeta)} />
          <Select label="Section" value={draft.sectionId} onChange={setD('sectionId')} all="All Sections" options={sectionOptions(draftMeta, draft.classId)} disabled={!draft.classId} />
          <Select label="Report Type" value={tab} onChange={v => setApplied({ tab: v })} options={REPORT_TABS.map(([value, label]) => ({ value, label: value === 'collection' ? 'Collection Summary' : label }))} />
          <div className="is-top" style={{ paddingTop: 22 }}>
            <DateRange from={draft.from || (win ? isoDay(win.from) : '')} to={draft.to || (win ? isoDay(win.to) : '')} presets={rangePresets(year)}
              onChange={v => setDraft(d => ({ ...d, from: v.from, to: v.to, term: '' }))} />
          </div>
        </div>
        <div className="fe-frow" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) minmax(0, 1fr) auto auto' }}>
          <Select label="Fee Category" value={draft.categoryId} onChange={setD('categoryId')} all="All Categories" options={(draftMeta?.categories || []).map(c => ({ value: c._id, label: c.name }))} />
          <Select label="Payment Status" value={draft.status} onChange={setD('status')} all="All" options={[{ value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partially paid' }, { value: 'pending', label: 'Pending' }, { value: 'none', label: 'Not charged' }]} />
          <Select label="Student Type" value={draft.studentType} onChange={setD('studentType')} all="All Students"
            options={[{ value: 'new', label: 'New admissions' }, { value: 'existing', label: 'Existing students' }, { value: 'with_concession', label: 'With a concession' }, { value: 'without_concession', label: 'Without a concession' }]} />
          <span />
          <Btn variant="outline" onClick={reset} style={{ minWidth: 100 }}>Reset</Btn>
          <Btn variant="primary" onClick={generate} style={{ minWidth: 150 }}>Generate Report</Btn>
        </div>
      </Card>

      <div className="fe-segs" role="tablist">
        {REPORT_TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`fe-seg${tab === key ? ' is-on' : ''}`} onClick={() => setApplied({ tab: key })}>{label}</button>
        ))}
      </div>

      {tab === 'collection' ? (
        <>
          <div className="fe-report2">
            <Card>
              <CardHead title="Collection Trend">
                <span className="fe-legend" style={{ margin: 0 }}><span><i style={{ background: INK.green }} />Collected</span><span><i style={{ background: INK.rose }} />Dues</span></span>
              </CardHead>
              <div className="fe-cardbody">
                {loading && !ov ? <Loading rows={4} /> : <AreaTrend data={ov?.trend || []} sym={sym}
                  series={[{ key: 'collected', label: 'Collected', color: INK.green }, { key: 'dues', label: 'Dues', color: INK.rose }]} />}
              </div>
            </Card>
            <Card>
              <CardHead title="Collection by Fee Category">
                <div style={{ width: 130 }}><Select compact value={scope} onChange={setScope} options={[{ value: 'period', label: win?.term ? 'This Term' : 'This Period' }, { value: 'year', label: 'Whole Year' }]} /></div>
              </CardHead>
              <div className="fe-cardbody" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                <Donut size={170} thickness={28} slices={slices} sym={sym} hover={hover} onHover={setHover}
                  center={[money(ov?.byHead?.total || 0, { sym, space: true }), 'Total Collected']} />
                {slices.length ? <DonutLegend rows={slices} hover={hover} onHover={setHover} /> : <p className="fe-form__hint">No collection in this period.</p>}
              </div>
            </Card>
          </div>
          <div className="fe-report3">
            <Card>
              <CardHead title="Class Wise Collection Summary"><LinkBtn onClick={() => setApplied({ tab: 'class' })}>View All</LinkBtn></CardHead>
              <div className="fe-tablewrap">
                <table className="fe-table fe-table--tight" style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>#</th><th>Class</th><th>Total Students</th><th>Collected</th><th>Dues</th><th>Collection %</th><th>Actions</th></tr></thead>
                  <tbody>{(ov?.classSummary || []).slice(0, 5).map((c, i) => (
                    <tr key={c._id}>
                      <td>{i + 1}</td><td>{c.label}</td><td>{c.students}</td>
                      <td className="fe-num">{money(c.collected, { sym, space: true })}</td>
                      <td className="fe-num fe-red">{money(c.dues, { sym, space: true })}</td>
                      <td><span className="fe-bar" title={c.pct == null ? 'Nothing charged' : `${c.pct}%`}><span style={{ width: `${c.pct || 0}%`, background: (c.pct || 0) >= 70 ? '#22c55e' : '#fbbf24' }} /></span></td>
                      <td><IconBtn icon="eye" label="Open in Student Fees" bordered onClick={() => nav(`/admin/fees/student-fees?classId=${c._id}`)} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                {ov && !(ov.classSummary || []).length ? <Empty title="No classes in scope" /> : null}
              </div>
            </Card>
            <Card>
              <CardHead title="Recent Transactions"><LinkBtn onClick={() => nav('/admin/fees/payments')}>View All</LinkBtn></CardHead>
              <div className="fe-tablewrap">
                <table className="fe-table fe-table--tight" style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Date</th><th>Student</th><th>Class</th><th>Amount</th><th>Mode</th><th>Status</th></tr></thead>
                  <tbody>{(ov?.recent || []).map(p => (
                    <tr key={p._id}>
                      <td className="fe-num">{fmtDate(p.date)}</td><td>{p.student.name}</td><td>{p.classLabel}</td>
                      <td className="fe-num fe-strong">{money(p.amount, { sym, space: true })}</td>
                      <td>{{ upi: 'UPI', bank_transfer: 'Net Banking', online: 'Online', cash: 'Cash', card: 'Card', cheque: 'Cheque', dd: 'DD' }[p.mode] || p.mode}</td>
                      <td><StatusBadge status={p.status === 'completed' ? 'paid' : p.status} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                {ov && !(ov.recent || []).length ? <Empty title="No transactions in this period" /> : null}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <Card style={{ marginBottom: 14 }}>
          <CardHead title={tableData?.title || REPORT_TABS.find(r => r[0] === tab)[1]}
            sub={tableData?.window ? `${fmtDate(tableData.window.from)} – ${fmtDate(tableData.window.to)}` : tableData?.year ? `Academic year ${tableData.year.yearName}` : ''} />
          {tab === 'custom' && tableData ? (
            <div className="fe-colpick">
              {tableData.columns.map(c => (
                <label key={c.key}><input type="checkbox" className="fe-check" checked={custom.has(c.key)}
                  onChange={() => { const n = new Set(custom); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); setCustomCols(n); }} />{c.label}</label>
              ))}
            </div>
          ) : null}
          <ReportTable report={tableData} sym={sym} columns={custom} />
        </Card>
      )}

      <div className="fe-reportfoot">
        <div className="fe-quick">
          <strong>Quick Actions</strong>
          <button type="button" className="fe-qbtn fe-qbtn--red" onClick={pdf}><Glyph name="docFill" size={18} />Download PDF</button>
          <button type="button" className="fe-qbtn fe-qbtn--green" onClick={exportXlsx}><Glyph name="receipt" size={18} />Export to Excel</button>
          <button type="button" className="fe-qbtn fe-qbtn--blue" onClick={() => setScheduling(true)}><Glyph name="calendar" size={18} />Schedule Report</button>
          <button type="button" className="fe-qbtn fe-qbtn--blue" onClick={() => setEmailing(true)}><Glyph name="bell" size={18} />Email Report</button>
        </div>
        <Note>Reports are generated from the latest data. Use the filters for accurate results; Excel and email carry the same rows as the screen.</Note>
      </div>

      <EmailReportDialog open={emailing} onClose={() => setEmailing(false)} type={tab} filters={clean} />
      <ScheduleDialog open={scheduling} onClose={() => setScheduling(false)} type={tab} />
    </div>
  );
}
