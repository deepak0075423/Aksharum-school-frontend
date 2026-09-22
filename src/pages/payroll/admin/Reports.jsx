/**
 * Payroll → Reports (mockup 5).
 *
 * Four figures for the month against the month before, the six-month trend, the
 * salary component split, and the reports people have already produced.
 *
 * Nothing is stored but the recipe: a report is a projection of runs that are
 * immutable once published, so re-running the recipe reproduces the file rather
 * than the database growing a blob per download. That also means a report of a
 * month that has since been recomputed shows what the month now says, which is
 * the only honest answer.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import {
  SectionBar, Crumbs, PrHead, Tiles, Tile, Card, CardHead, Panel, HelpCard,
  Btn, Select, Search, Badge, IconBtn, RowMenu, MenuItem, Mark, Glyph, Field,
  Loading, Empty, TableWrap, Pager, Note, LinkBtn,
  money, compactMoney, fmtDateTime, saveFile, MONTHS,
} from './prUI';
import { PayBars, Donut, DonutLegend, ChartEmpty, inkAt, OTHER_INK } from './prCharts';
import { GenerateReportDialog, ConfirmDialog } from './prForms';

const FORMAT = { pdf: ['red', 'PDF', 'filePdf'], excel: ['green', 'Excel', 'fileSheet'], csv: ['green', 'CSV', 'fileSheet'] };

export default function PayrollReports() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [yearId, setYearId] = useState('');
  const [hover, setHover] = useState(null);

  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [generating, setGenerating] = useState(false);
  const [preset, setPreset] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: ov, loading } = useFetch(
    () => api.getReportsOverview({ month, year, academicYear: yearId || undefined }), [month, year, yearId]);
  const { data: reports, meta, loading: listing, refetch } = useFetch(
    () => api.getReports({ search, type: typeFilter, page, limit }), [search, typeFilter, page, limit]);

  const d = ov || {};
  const t = d.tiles || {};
  const types = d.types || [];

  // Six categories plus "Other": a seventh is never a new hue.
  const slices = (d.components || []).slice(0, 6).map((c, i) => ({ ...c, color: inkAt(i) }));
  const rest = (d.components || []).slice(6);
  if (rest.length) {
    slices.push({
      name: `Other (${rest.length})`, color: OTHER_INK,
      value: rest.reduce((s, c) => s + c.value, 0),
      pct: +rest.reduce((s, c) => s + c.pct, 0).toFixed(1),
    });
  }

  const download = async (r) => {
    try {
      const blob = await api.downloadReport(r._id);
      const ext = r.format === 'pdf' ? 'pdf' : 'csv';
      saveFile(blob, `${r.name.replace(/[^\w-]+/g, '_')}.${ext}`);
    } catch (e) { toast.error(e.message || 'Download failed'); }
  };

  const remove = async (r) => {
    setBusy(true);
    try { await api.deleteReport(r._id); toast.success('Report removed'); await refetch(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); setConfirm(null); }
  };

  return (
    <div className="pr-page">
      <Crumbs trail={[{ label: 'Payroll', to: '/admin/payroll/dashboard' }, { label: 'Reports' }]} />
      <SectionBar years={d.academicYears || []} year={yearId || d.academicYear?._id} onYear={setYearId} />

      <PrHead title="Payroll Reports" subtitle="Generate and download detailed payroll reports and analytics">
        <Select value={String(month)} onChange={v => setMonth(Number(v))}
          options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} ariaLabel="Month" />
        <Select value={String(year)} onChange={v => setYear(Number(v))}
          options={Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i).map(y => ({ value: String(y), label: String(y) }))}
          ariaLabel="Year" />
      </PrHead>

      <Note tone="blue" glyph="info">
        Get detailed insights into employee salaries, deductions and payroll trends. Figures cover every run in the
        period except cancelled ones.
      </Note>

      <Tiles n={4}>
        <Tile glyph="users" tone="indigo" label="Total Employees"
          value={loading ? '—' : (t.employees?.value ?? 0)}
          delta={{ pct: t.employees?.deltaPct, caption: `As of ${MONTHS[month - 1].slice(0, 3)} ${year}` }} />
        <Tile glyph="rupee" tone="blue" label={`Total Payroll (${MONTHS[month - 1].slice(0, 3)} ${year})`} small
          value={loading ? '—' : money(t.gross?.value)}
          delta={{ pct: t.gross?.deltaPct, caption: t.gross?.caption || 'Gross salary' }} />
        <Tile glyph="docFill" tone="pink" label="Total Deductions" small
          value={loading ? '—' : money(t.deductions?.value)}
          delta={{ pct: t.deductions?.deltaPct, upIsGood: false, caption: t.deductions?.caption || 'PF, ESI, TDS etc.' }} />
        <Tile glyph="wallet" tone="purple" label="Net Payout" small
          value={loading ? '—' : money(t.net?.value)}
          delta={{ pct: t.net?.deltaPct, caption: t.net?.caption || 'Amount disbursed' }} />
      </Tiles>

      <div className="pr-split pr-split--wide">
        <div className="pr-stack">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)', gap: 18 }}>
            <Card>
              <CardHead title="Payroll Trend" sub="Monthly gross pay, deductions and net pay" glyph="chartUp">
                <Select value="6" onChange={() => {}} options={[{ value: '6', label: 'Last 6 Months' }]} ariaLabel="Range" />
              </CardHead>
              <div className="pr-cardbody">
                {loading ? <Loading rows={4} /> : (
                  <PayBars data={d.series || []} height={236}
                    empty={<ChartEmpty glyph="bars" title="No payroll yet" hint="Run a payroll month to see the trend" />} />
                )}
              </div>
            </Card>

            <Card>
              <CardHead title="Salary Component Distribution" sub={`Breakdown of total salary (${MONTHS[month - 1].slice(0, 3)} ${year})`} />
              <div className="pr-cardbody">
                {loading ? <Loading rows={4} /> : slices.length === 0 ? (
                  <Empty glyph="bars" title="Nothing to break down" hint="There is no payroll for this month yet." />
                ) : (
                  <>
                    <Donut slices={slices} center={{ value: compactMoney(d.componentTotal), label: 'Total' }}
                      size={172} thickness={27} hover={hover} onHover={setHover} />
                    <DonutLegend rows={slices} hover={hover} onHover={setHover} showPct />
                  </>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <CardHead title="Generated Reports" sub="View and download previously generated reports" glyph="docFill">
              <Search value={q} onChange={setQ} onEnter={() => { setSearch(q); setPage(1); }}
                placeholder="Search reports by name or type…" />
              <Select value={typeFilter} all="All Types" onChange={v => { setTypeFilter(v); setPage(1); }}
                options={types.map(x => ({ value: x.key, label: x.label }))} ariaLabel="Report type" />
            </CardHead>
            <div className="pr-cardbody pr-cardbody--flush">
              {listing ? <Loading rows={5} /> : !reports?.length ? (
                <Empty glyph="docFill" title="No reports yet"
                  hint="Generate a report from the panel on the right and it will be listed here.">
                  <Btn variant="primary" glyph="bars" onClick={() => setGenerating(true)}>Generate Report</Btn>
                </Empty>
              ) : (
                <>
                  <TableWrap>
                    <table className="pr-table pr-table--wide pr-table--stickyend">
                      <thead>
                        <tr>
                          <th className="pr-idx">#</th>
                          <th>Report Name</th>
                          <th>Report Type</th>
                          <th>Period</th>
                          <th>Generated On</th>
                          <th>Generated By</th>
                          <th>Format</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r, i) => {
                          const [tone, label, glyph] = FORMAT[r.format] || FORMAT.pdf;
                          return (
                            <tr key={r._id} data-focus-id={r._id}>
                              <td className="pr-idx">{(page - 1) * limit + i + 1}</td>
                              <td><div className="pr-cell2 pr-cell2--wrap"><b>{r.name}</b><small>{r.hint}</small></div></td>
                              <td><Badge tone="indigo">{r.typeLabel}</Badge></td>
                              <td>{r.periodLabel}</td>
                              <td><div className="pr-cell2"><b>{fmtDateTime(r.generatedAt).split(',')[0]}</b><small>{fmtDateTime(r.generatedAt).split(', ')[1]}</small></div></td>
                              <td>{r.generatedByName || '—'}</td>
                              <td>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <Glyph name={glyph} size={17} />{label}
                                </span>
                              </td>
                              <td>
                                <div className="pr-acts" style={{ justifyContent: 'flex-end' }}>
                                  <Btn size="sm" variant="soft" glyph="download" onClick={() => download(r)}>Download</Btn>
                                  <RowMenu label={`Actions for ${r.name}`}>
                                    <MenuItem glyph="download" onClick={() => download(r)}>Download again</MenuItem>
                                    <MenuItem glyph="refresh" onClick={() => { setPreset(r.type); setGenerating(true); }}>
                                      Generate for another period
                                    </MenuItem>
                                    <MenuItem glyph="trash" danger onClick={() => setConfirm(r)}>Remove from list</MenuItem>
                                  </RowMenu>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableWrap>
                  <Pager page={meta?.page || 1} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit}
                    noun="reports" onPage={setPage} onLimit={v => { setLimit(v); setPage(1); }} />
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="pr-rail">
          <Panel title="Generate Custom Report" sub="Select parameters to generate a report">
            <Btn variant="primary" className="pr-btn--block pr-btn--lg" glyph="docFill"
              onClick={() => { setPreset(null); setGenerating(true); }}>
              Generate Report
            </Btn>
            <div style={{ fontSize: '.78rem', color: 'var(--pr-muted)', marginTop: 10, lineHeight: 1.5 }}>
              Pick the type, the period, a department or one employee, and the format. Every report is built from the
              payroll runs in that period.
            </div>
          </Panel>

          <Panel title="Quick Reports" flush>
            <div className="pr-qa">
              {types.map((x, i) => (
                <button key={x.key} type="button" className="pr-qarow"
                  onClick={() => { setPreset(x.key); setGenerating(true); }}>
                  <Mark glyph={x.key === 'bank_transfer' ? 'bank' : x.key === 'annual' ? 'calendar' : x.key === 'department' ? 'users' : 'docFill'}
                    tone={['indigo', 'blue', 'pink', 'green', 'purple', 'orange', 'slate'][i % 7]} size={34} glyphSize={17} />
                  <span className="pr-qarow__t"><b>{x.label}</b><small>{x.hint}</small></span>
                  <Glyph name="chevronRight" size={16} />
                </button>
              ))}
            </div>
          </Panel>

          <HelpCard text="Reports read live payroll data, so a recomputed month reports its new figures."
            action="View Guide" onAction={() => toast('Only the recipe is stored — downloading a report rebuilds it from the runs in that period.', { icon: '📘', duration: 7000 })} />
        </div>
      </div>

      <GenerateReportDialog open={generating} onClose={() => setGenerating(false)}
        types={types} departments={d.departments || []} month={month} year={year} preset={preset}
        onDone={() => { setGenerating(false); refetch(); }} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        title="Remove this report?" danger confirm="Remove"
        body={confirm ? `“${confirm.name}” will be taken off the list. The payroll data behind it is untouched and you can generate it again at any time.` : ''}
        onConfirm={() => remove(confirm)} />
    </div>
  );
}
