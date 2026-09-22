/**
 * Payroll → Payroll Runs (mockup 2).
 *
 * The list on the left, the run you picked on the right. The rail is the
 * working surface: it carries the four-step progress, the figures, and the one
 * button that moves the run on — so a month is driven from configure to
 * published without leaving the screen.
 *
 * A run is selected through `?run=`, which is what the dashboard's "Continue"
 * links to and what survives a reload.
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import {
  SectionBar, Crumbs, PrHead, Tiles, Tile, Card, CardHead, Panel, QuickActions, HelpCard, Steps,
  Btn, Select, Search, Check, Badge, StatusBadge, IconBtn, RowMenu, MenuItem, Mark, Glyph,
  Loading, Empty, TableWrap, SortTh, Pager, Facts, Fact, Note, Avatar, BulkBar, runBulk,
  money, fmtDate, fmtDateTime, saveFile, MONTHS, RUN_STATUS, RUN_STEPS,
} from './prUI';
import { CreateRunDialog, EntryDrawer, ConfirmDialog, SettingsDialog } from './prForms';

const STATUS_FILTER = [
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function PayrollRuns() {
  const [sp, setSp] = useSearchParams();
  const selected = sp.get('run') || '';

  const [yearId, setYearId] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('period');
  const [dir, setDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [picked, setPicked] = useState([]);

  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [entry, setEntry] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: runs, meta, loading, refetch } = useFetch(
    () => api.getPayrollRuns({ search, month, status, sort, dir, page, limit, academicYear: yearId || undefined }),
    [search, month, status, sort, dir, page, limit, yearId]);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDetail = async (id) => {
    if (!id) { setDetail(null); return; }
    setDetailLoading(true);
    try { setDetail((await api.getRunDetail(id)).data); }
    catch (e) { toast.error(e.message); setDetail(null); }
    finally { setDetailLoading(false); }
  };

  useEffect(() => { loadDetail(selected); }, [selected]);
  // Nothing picked yet: open whichever run is most in need of attention.
  useEffect(() => {
    if (selected || !runs?.length) return;
    const next = runs.find(r => r.state === 'in_progress') || runs[0];
    if (next) setSp(p => { p.set('run', next._id); return p; }, { replace: true });
  }, [runs, selected, setSp]);

  const summary = meta?.summary || {};
  const years = meta?.academicYears || [];
  const pick = (id) => setSp(p => { p.set('run', id); return p; });

  const onSort = (field) => {
    if (sort === field) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(field); setDir('desc'); }
  };

  const reset = () => { setQ(''); setSearch(''); setMonth(''); setStatus(''); setPage(1); };

  const act = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await Promise.all([refetch(), loadDetail(selected)]);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); setConfirm(null); }
  };

  /** The same per-row action over every ticked run, reported honestly. */
  const bulk = async (kind) => {
    setBusy(true);
    try {
      const { ok: done, failed, reason } = await runBulk(picked,
        (id) => (kind === 'delete' ? api.deleteRun(id) : api.cancelRun(id)));
      if (done) toast.success(`${done} run${done === 1 ? '' : 's'} ${kind === 'delete' ? 'deleted' : 'cancelled'}`);
      if (failed) toast.error(`${failed} could not be ${kind === 'delete' ? 'deleted' : 'cancelled'}${reason ? ` — ${reason}` : ''}`);
      setPicked([]);
      await Promise.all([refetch(), loadDetail(selected)]);
    } finally { setBusy(false); }
  };

  const download = async (loader, name) => {
    try { saveFile(await loader(), name); }
    catch (e) { toast.error(e.message || 'Download failed'); }
  };

  const run = detail;
  const stage = run ? (RUN_STEPS.indexOf(run.stageLabel) + 1 || (run.status === 'published' ? 4 : 1)) : 1;

  /** The one button that moves this run on. */
  const nextAction = () => {
    if (!run) return null;
    if (run.status === 'draft')     return { label: 'Mark Reviewed', run: () => api.updateRunStatus(run._id, 'reviewed'), msg: 'Marked reviewed' };
    if (run.status === 'reviewed')  return { label: 'Approve Run',   run: () => api.updateRunStatus(run._id, 'approved'), msg: 'Approved' };
    if (run.status === 'approved')  return { label: 'Publish & Pay', run: () => api.publishRun(run._id), msg: 'Published — payslips issued', confirm: {
      title: 'Publish this payroll run?',
      body: `${run.totalEmployees} payslips will be issued for ${run.runName} and every employee told their net pay. A published run is locked.`,
      confirm: 'Publish Run',
    } };
    return null;
  };
  const next = nextAction();

  return (
    <div className="pr-page">
      <Crumbs trail={[{ label: 'Payroll', to: '/admin/payroll/dashboard' }, { label: 'Payroll Runs' }]} />
      <SectionBar years={years} year={yearId || meta?.academicYear?._id} onYear={setYearId}>
        <Btn variant="primary" icon="plus" onClick={() => setCreating(true)}>Create Payroll Run</Btn>
      </SectionBar>

      <PrHead title="Payroll Runs" subtitle="Create, manage and track payroll runs for all employees" />

      <Tiles n={4}>
        <Tile glyph="docFill" tone="indigo" valueFirst label="Total Runs"
          value={loading ? '—' : (summary.total ?? 0)} caption="This academic year" />
        <Tile glyph="checkCircle" tone="green" valueFirst label="Completed"
          value={loading ? '—' : (summary.completed ?? 0)}
          share={{ pct: summary.total ? +((summary.completed / summary.total) * 100).toFixed(1) : 0, color: '#16a34a' }} />
        <Tile glyph="clock" tone="blue" valueFirst label="In Progress"
          value={loading ? '—' : (summary.inProgress ?? 0)}
          share={{ pct: summary.total ? +((summary.inProgress / summary.total) * 100).toFixed(1) : 0, color: '#2563eb' }} />
        <Tile glyph="xCircle" tone="red" valueFirst label="Failed"
          value={loading ? '—' : (summary.failed ?? 0)}
          share={{ pct: summary.total ? +((summary.failed / summary.total) * 100).toFixed(1) : 0, color: '#dc2626' }} />
      </Tiles>

      <div className="pr-split">
        <div className="pr-stack">
          <div className="pr-filters">
            <Search value={q} onChange={setQ} onEnter={() => { setSearch(q); setPage(1); }}
              placeholder="Search by run name, month or description…" />
            <Select value={month} all="All Months" onChange={v => { setMonth(v); setPage(1); }}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} ariaLabel="Month" />
            <Select value={status} all="All Status" onChange={v => { setStatus(v); setPage(1); }}
              options={STATUS_FILTER} ariaLabel="Status" />
            <Btn icon="filter" onClick={() => { setSearch(q); setPage(1); }}>Filter</Btn>
            <Btn variant="ghost" onClick={reset}>Reset</Btn>
          </div>

          <Card>
            <div className="pr-cardbody pr-cardbody--flush">
              {loading ? <Loading rows={6} /> : !runs?.length ? (
                <Empty glyph="docFill" title="No payroll runs"
                  hint={search || month || status ? 'No run matches these filters.' : 'Create your first payroll run to get started.'}>
                  <Btn variant="primary" icon="plus" onClick={() => setCreating(true)}>Create Payroll Run</Btn>
                </Empty>
              ) : (
                <>
                  <BulkBar count={picked.length} noun={`run${picked.length === 1 ? '' : 's'} selected`} onClear={() => setPicked([])}>
                    <Btn size="sm" glyph="ban" onClick={() => bulk('cancel')}>Cancel</Btn>
                    <Btn size="sm" variant="danger" glyph="trash" onClick={() => bulk('delete')}>Delete</Btn>
                  </BulkBar>
                  <TableWrap>
                    <table className="pr-table pr-table--wide pr-table--stickyend">
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}>
                            <Check checked={picked.length > 0 && picked.length === runs.length}
                              indeterminate={picked.length > 0 && picked.length < runs.length}
                              onChange={on => setPicked(on ? runs.map(r => r._id) : [])} label="Select all runs" />
                          </th>
                          <th className="pr-idx">#</th>
                          <SortTh label="Run Name" field="runName" sort={sort} dir={dir} onSort={onSort} />
                          <SortTh label="Period" field="period" sort={sort} dir={dir} onSort={onSort} />
                          <SortTh label="Employees" field="employees" sort={sort} dir={dir} onSort={onSort} align="right" />
                          <SortTh label="Gross Pay" field="gross" sort={sort} dir={dir} onSort={onSort} align="right" />
                          <SortTh label="Deductions" field="deductions" sort={sort} dir={dir} onSort={onSort} align="right" />
                          <SortTh label="Net Pay" field="net" sort={sort} dir={dir} onSort={onSort} align="right" />
                          <SortTh label="Status" field="status" sort={sort} dir={dir} onSort={onSort} />
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((r, i) => (
                          <tr key={r._id} data-focus-id={r._id} className={r._id === selected ? 'is-on' : ''}>
                            <td>
                              <Check checked={picked.includes(r._id)} label={`Select ${r.runName}`}
                                onChange={on => setPicked(p => (on ? [...p, r._id] : p.filter(x => x !== r._id)))} />
                            </td>
                            <td className="pr-idx">{(page - 1) * limit + i + 1}</td>
                            <td>
                              <div className="pr-cell2">
                                <b>
                                  {r.runName}
                                  {r.state === 'in_progress' && <span title="In progress" style={{ marginLeft: 6 }}>⭐</span>}
                                </b>
                                <small>{r.notes || 'Monthly payroll run'}</small>
                              </div>
                            </td>
                            <td><div className="pr-cell2"><b>{r.period}</b><small>{r.periodRange}</small></div></td>
                            <td className="pr-num">{r.totalEmployees}</td>
                            <td className="pr-num">{money(r.totalGross)}</td>
                            <td className="pr-num">{money(r.totalDeductions)}</td>
                            <td className="pr-num pr-strong">{money(r.totalNet)}</td>
                            <td><StatusBadge status={r.status} map={RUN_STATUS} /></td>
                            <td>
                              <div className="pr-acts" style={{ justifyContent: 'flex-end' }}>
                                <Btn size="sm" variant={r.state === 'in_progress' ? 'primary' : 'outline'}
                                  glyph={r.state === 'in_progress' ? 'play' : 'eye'} onClick={() => pick(r._id)}>
                                  {r.state === 'in_progress' ? 'Continue' : 'View'}
                                </Btn>
                                <RowMenu label={`Actions for ${r.runName}`}>
                                  <MenuItem glyph="eye" onClick={() => pick(r._id)}>Open run</MenuItem>
                                  <MenuItem glyph="download" onClick={() => download(() => api.exportRun(r._id), `salary_register_${r.period.replace(' ', '_')}.csv`)}>
                                    Salary register (CSV)
                                  </MenuItem>
                                  <MenuItem glyph="bank" onClick={() => download(() => api.getBankFile(r._id), `bank_transfer_${r.period.replace(' ', '_')}.csv`)}>
                                    Bank transfer file
                                  </MenuItem>
                                  <MenuItem glyph="refresh" disabled={r.status === 'published' || r.status === 'cancelled'}
                                    onClick={() => act(() => api.recomputeRun(r._id), 'Recomputed')}>
                                    Recompute
                                  </MenuItem>
                                  {r.status === 'published' ? (
                                    <MenuItem glyph="ban" danger onClick={() => setConfirm({
                                      title: 'Reverse this publish?',
                                      body: `The ${r.totalEmployees} payslips issued for ${r.runName} will be withdrawn and the run returned to approved. Employees who have already seen theirs will no longer find it.`,
                                      confirm: 'Reverse Publish', danger: true,
                                      run: () => api.unpublishRun(r._id), msg: 'Publish reversed',
                                    })}>Reverse publish</MenuItem>
                                  ) : (
                                    <>
                                      <MenuItem glyph="ban" disabled={r.status === 'cancelled'} onClick={() => setConfirm({
                                        title: 'Cancel this run?',
                                        body: `${r.runName} will be marked cancelled and its entries deleted. Nothing has been published, so no payslip is affected.`,
                                        confirm: 'Cancel Run', danger: true,
                                        run: () => api.cancelRun(r._id), msg: 'Run cancelled',
                                      })}>Cancel run</MenuItem>
                                      <MenuItem glyph="trash" danger onClick={() => setConfirm({
                                        title: 'Delete this run?',
                                        body: `${r.runName} and its entries will be removed. This cannot be undone.`,
                                        confirm: 'Delete Run', danger: true,
                                        run: () => api.deleteRun(r._id), msg: 'Run deleted',
                                      })}>Delete run</MenuItem>
                                    </>
                                  )}
                                </RowMenu>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                  <Pager page={meta?.page || 1} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit}
                    noun="runs" onPage={setPage} onLimit={v => { setLimit(v); setPage(1); }} />
                </>
              )}
            </div>
          </Card>
        {run && run.entries?.length > 0 && (
          <Card>
            <CardHead title={`Entries — ${run.runName}`} sub={`${run.entries.length} employees`} glyph="users">
              <Btn size="sm" glyph="download"
                onClick={() => download(() => api.exportRun(run._id), `salary_register_${run.period.replace(' ', '_')}.csv`)}>
                Export
              </Btn>
            </CardHead>
            <div className="pr-cardbody pr-cardbody--flush">
              <TableWrap>
                <table className="pr-table pr-table--wide pr-table--stickyend">
                  <thead>
                    <tr>
                      <th className="pr-idx">#</th>
                      <th>Employee</th>
                      <th>Department</th>
                      <th style={{ textAlign: 'right' }}>Paid Days</th>
                      <th style={{ textAlign: 'right' }}>Gross</th>
                      <th style={{ textAlign: 'right' }}>LOP</th>
                      <th style={{ textAlign: 'right' }}>Deductions</th>
                      <th style={{ textAlign: 'right' }}>Adjustments</th>
                      <th style={{ textAlign: 'right' }}>Net Pay</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.entries.map((e, i) => (
                      <tr key={e._id}>
                        <td className="pr-idx">{i + 1}</td>
                        <td>
                          <div className="pr-who">
                            <Avatar name={e.employee.name} size={32} />
                            <div className="pr-who__txt">
                              <b>{e.employee.name}</b>
                              <small>{e.employee.employeeId || e.employee.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>{e.employee.department || '—'}</td>
                        <td className="pr-num">{e.paidDays}/{e.workingDays}</td>
                        <td className="pr-num">{money(e.grossSalary)}</td>
                        <td className="pr-num" style={e.lopAmount ? { color: '#dc2626' } : undefined}>
                          {e.lopAmount ? `−${money(e.lopAmount)}` : '—'}
                        </td>
                        <td className="pr-num">{money(e.totalDeductions)}</td>
                        <td className="pr-num">
                          {(e.arrears + e.bonus + e.reimbursement + e.overtimeAmount) > 0 && (
                            <div style={{ color: '#16a34a' }}>+{money(e.arrears + e.bonus + e.reimbursement + e.overtimeAmount)}</div>
                          )}
                          {e.advanceRecovery > 0 && <div style={{ color: '#dc2626' }}>−{money(e.advanceRecovery)}</div>}
                          {(e.arrears + e.bonus + e.reimbursement + e.overtimeAmount + e.advanceRecovery) === 0 ? '—' : null}
                        </td>
                        <td className="pr-num pr-strong">{money(e.netSalary)}</td>
                        <td>
                          {e.isOnHold ? <Badge tone="amber">On hold</Badge>
                            : e.payslip ? <Badge tone="green">Paid</Badge>
                            : e.isEdited ? <Badge tone="blue">Edited</Badge>
                            : <Badge tone="slate">Payable</Badge>}
                        </td>
                        <td>
                          <div className="pr-acts" style={{ justifyContent: 'flex-end' }}>
                            <IconBtn glyph="eye" label="Open entry" onClick={() => setEntry(e)} />
                            {e.payslip && (
                              <IconBtn glyph="download" label="Download payslip"
                                onClick={() => download(() => api.adminDownloadPayslip(e.payslip._id),
                                  `payslip_${e.employee.name.replace(/\s+/g, '_')}_${run.period.replace(' ', '_')}.pdf`)} />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </Card>
        )}
        </div>

        <div className="pr-rail">
          {detailLoading ? (
            <Panel title="Loading…"><Loading rows={5} /></Panel>
          ) : !run ? (
            <Panel title="No run selected"><p style={{ margin: 0, fontSize: '.85rem', color: 'var(--pr-muted)' }}>
              Pick a run from the list to see its progress and figures.
            </p></Panel>
          ) : (
            <>
              <Panel title={run.runName} sub={run.periodRange} status={<StatusBadge status={run.status} map={RUN_STATUS} />}>
                {run.status === 'failed' ? (
                  <Note tone="red" glyph="bang">{run.failureReason || 'This run could not be computed.'}</Note>
                ) : run.status === 'cancelled' ? (
                  <Note tone="slate" glyph="ban">This run was cancelled.</Note>
                ) : (
                  <Steps step={stage} />
                )}

                <Facts>
                  <Fact label="Period" glyph="calendar">{run.periodRange} {run.year}</Fact>
                  <Fact label="Employees" glyph="users">{run.totalEmployees} employees</Fact>
                  <Fact label="Working days" glyph="clock">{run.workingDays} days</Fact>
                  <Fact label="Gross Pay" glyph="rupee">{money(run.totalGross)}</Fact>
                  <Fact label="Deductions" glyph="bars">{money(run.totalDeductions)}</Fact>
                  <Fact label="Net Pay" glyph="wallet">{money(run.totalNet)}</Fact>
                  {run.totalEmployerCost > 0 && <Fact label="Employer cost" glyph="bank">{money(run.totalEmployerCost)}</Fact>}
                  {run.publishedAt && <Fact label="Published" glyph="checkCircle">{fmtDate(run.publishedAt)}</Fact>}
                </Facts>

                {run.held > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Note tone="amber" glyph="pause">
                      {run.held} {run.held === 1 ? 'entry is' : 'entries are'} on hold — {money(run.heldAmount)} is outside these totals.
                    </Note>
                  </div>
                )}
                {run.warnings?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Note tone="amber" glyph="bang">
                      <b>{run.warnings.length} {run.warnings.length === 1 ? 'entry needs' : 'entries need'} a second look.</b>{' '}
                      {run.warnings.slice(0, 2).map(w => `${w.name}: ${w.message}`).join('; ')}
                      {run.warnings.length > 2 ? `; and ${run.warnings.length - 2} more.` : '.'}
                    </Note>
                  </div>
                )}
                {run.skipped?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Note tone="amber" glyph="bang">
                      <b>{run.skipped.length} left out of this run.</b>{' '}
                      {run.skipped.slice(0, 2).map(s => `${s.name}: ${s.reason}`).join('; ')}
                      {run.skipped.length > 2 ? `; and ${run.skipped.length - 2} more.` : '.'}
                    </Note>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
                  {next && (
                    <Btn variant="primary" className="pr-btn--block pr-btn--lg" loading={busy}
                      onClick={() => (next.confirm
                        ? setConfirm({ ...next.confirm, run: next.run, msg: next.msg })
                        : act(next.run, next.msg))}>
                      {next.label} <Glyph name="arrowRight" size={16} />
                    </Btn>
                  )}
                  {run.status === 'published' && (
                    <Btn className="pr-btn--block" glyph="bank"
                      onClick={() => download(() => api.getBankFile(run._id), `bank_transfer_${run.period.replace(' ', '_')}.csv`)}>
                      Bank Transfer File
                    </Btn>
                  )}
                  <Btn className="pr-btn--block" glyph="download"
                    onClick={() => download(() => api.exportRun(run._id), `salary_register_${run.period.replace(' ', '_')}.csv`)}>
                    Download Salary Register
                  </Btn>
                </div>
              </Panel>

              <QuickActions items={[
                { glyph: 'plusCircle', tone: 'indigo', label: 'Create New Payroll Run', hint: 'Start the next month', onClick: () => setCreating(true) },
                { glyph: 'refresh', tone: 'blue', label: 'Recompute This Run', hint: 'Re-read CTC, structures and leave',
                  disabled: run.status === 'published' || run.status === 'cancelled',
                  onClick: () => act(() => api.recomputeRun(run._id), 'Recomputed — hand-edited entries were kept') },
                { glyph: 'docFill', tone: 'green', label: 'Manage Assignments', hint: 'Who is paid, and on what', to: '/admin/payroll/assignments' },
                { glyph: 'sitemap', tone: 'orange', label: 'Salary Structures', hint: 'Pay scales and components', to: '/admin/payroll/structures' },
                { glyph: 'gear', tone: 'slate', label: 'Payroll Settings', hint: 'Working days, tax, approvals', to: '/admin/payroll/settings' },
              ]} />

              <HelpCard text="Check the payroll guide or contact support."
                action="View Guide" onAction={() => toast('A run goes Configure → Review → Process → Complete. Only the last step issues payslips.', { icon: '📘', duration: 6000 })} />
            </>
          )}
        </div>
      </div>

      <CreateRunDialog open={creating} onClose={() => setCreating(false)}
        academicYear={yearId || meta?.academicYear?._id}
        onDone={(r) => { setCreating(false); refetch(); if (r?._id) pick(r._id); }} />

      <EntryDrawer open={!!entry} entry={entry} run={run} runId={run?._id}
        onClose={() => setEntry(null)}
        onDone={(res) => {
          if (res?.download) {
            download(() => api.adminDownloadPayslip(res.download), 'payslip.pdf');
            return;
          }
          setEntry(null);
          refetch();
          loadDetail(selected);
        }} />

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        title={confirm?.title} body={confirm?.body} confirm={confirm?.confirm} danger={confirm?.danger}
        onConfirm={() => act(confirm.run, confirm.msg)} />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)}
        onDone={() => { setSettingsOpen(false); refetch(); }} />
    </div>
  );
}
