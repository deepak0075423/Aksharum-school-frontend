/**
 * Payroll → Assignments (mockup 3).
 *
 * An assignment is what an employee is paid for: the salary structure they sit
 * on, the CTC in force, and the window it applies to. The list is one row per
 * employee, because a second live assignment for the same person is what used
 * to make a whole payroll run fail — so the screen never offers to create one.
 *
 * The rail answers "what about the row I picked": their structure, their pay,
 * their salary timeline.
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import {
  SectionBar, Crumbs, PrHead, Tiles, Tile, Card, CardHead, Panel, QuickActions, HelpCard,
  Btn, Select, Search, Check, Badge, StatusBadge, IconBtn, RowMenu, MenuItem, Avatar, Who, Mark,
  Loading, Empty, TableWrap, Pager, Facts, Fact, Note, Ledger, NetBar, Glyph, BulkBar, runBulk,
  money, fmtDate, saveFile, ASSIGN_STATUS, STRUCTURE_TYPE, PAYMENT_MODE,
} from './prUI';
import { AssignDialog, BulkAssignDialog, CopyAssignmentsDialog, ReviseCtcDialog, SettlementDialog, ConfirmDialog } from './prForms';

const STATUS_FILTER = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
];

export default function PayrollAssignments() {
  const [sp, setSp] = useSearchParams();
  const selected = sp.get('assignment') || '';

  const [yearId, setYearId] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState(sp.get('status') || 'active');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [picked, setPicked] = useState([]);

  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [copying, setCopying] = useState(false);
  const [revising, setRevising] = useState(null);
  const [settling, setSettling] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: rows, meta, loading, refetch } = useFetch(
    () => api.getAssignments({ search, department, type, status, page, limit, academicYear: yearId || undefined }),
    [search, department, type, status, page, limit, yearId]);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDetail = async (id) => {
    if (!id) { setDetail(null); return; }
    setDetailLoading(true);
    try { setDetail((await api.getAssignment(id)).data); }
    catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };
  useEffect(() => { loadDetail(selected); }, [selected]);
  useEffect(() => {
    if (selected || !rows?.length) return;
    setSp(p => { p.set('assignment', rows[0]._id); return p; }, { replace: true });
  }, [rows, selected, setSp]);

  const summary = meta?.summary || {};
  const years = meta?.academicYears || [];
  const departments = meta?.departments || [];
  const pick = (id) => setSp(p => { p.set('assignment', id); return p; });

  const reset = () => { setQ(''); setSearch(''); setDepartment(''); setType(''); setStatus('active'); setPage(1); };

  const act = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await Promise.all([refetch(), loadDetail(selected)]);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); setConfirm(null); }
  };

  /** The ticked rows, ended or reactivated one by one. */
  const bulkAct = async (kind) => {
    setBusy(true);
    try {
      const { ok: done, failed, reason } = await runBulk(picked,
        (id) => (kind === 'end' ? api.deactivateAssignment(id) : api.activateAssignment(id)));
      if (done) toast.success(`${done} assignment${done === 1 ? '' : 's'} ${kind === 'end' ? 'ended' : 'reactivated'}`);
      if (failed) toast.error(`${failed} could not be updated${reason ? ` — ${reason}` : ''}`);
      setPicked([]);
      await Promise.all([refetch(), loadDetail(selected)]);
    } finally { setBusy(false); }
  };

  /** The visible rows as a CSV — what the mockup's Export button does. */
  const exportCsv = () => {
    const cols = ['Employee', 'Employee ID', 'Department', 'Designation', 'Structure', 'Type', 'Annual CTC', 'Monthly', 'Start Date', 'End Date', 'Payment Mode', 'Status'];
    const cell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
    const body = (rows || []).map(r => [
      r.employee.name, r.employee.employeeId, r.employee.department, r.employee.designation,
      r.structure?.name || '', STRUCTURE_TYPE[r.structure?.type]?.[1] || '',
      r.ctc, r.monthlyCtc, fmtDate(r.effectiveDate), r.endDate ? fmtDate(r.endDate) : '',
      PAYMENT_MODE[r.paymentMode] || r.paymentMode, r.stateLabel,
    ].map(cell).join(','));
    saveFile('﻿' + [cols.join(','), ...body].join('\n'), 'salary_assignments.csv');
  };

  const a = detail;

  return (
    <div className="pr-page">
      <Crumbs trail={[{ label: 'Payroll', to: '/admin/payroll/dashboard' }, { label: 'Assignments' }]} />
      <SectionBar years={years} year={yearId || meta?.academicYear?._id} onYear={setYearId}>
        <Btn variant="primary" icon="userPlus" onClick={() => setAssigning(true)}>Assign Employee</Btn>
      </SectionBar>

      <PrHead title="Assignments" subtitle="Manage employee assignments for salary calculation" />

      <Note tone="blue" glyph="info" action={<Btn size="sm" onClick={() => toast(
        'An assignment ties one employee to one salary structure and an annual CTC, for a window of dates. Only one can be live per person at a time.',
        { icon: 'ℹ️', duration: 7000 })}>Learn More</Btn>}>
        Assignments define what an employee is paid for — the salary structure they sit on, the CTC in force, and the
        period it applies to.
      </Note>

      <Tiles n={4}>
        <Tile glyph="users" tone="indigo" valueFirst label="Total Employees"
          value={loading ? '—' : (summary.totalEmployees ?? 0)} caption="All staff members" />
        <Tile glyph="docCheck" tone="green" valueFirst label="Active Assignments"
          value={loading ? '—' : (summary.active ?? 0)} caption="For current academic year"
          onClick={() => { setStatus('active'); setPage(1); }} on={status === 'active'} />
        <Tile glyph="clock" tone="amber" valueFirst label="Pending Assignments"
          value={loading ? '—' : (summary.pending ?? 0)} caption="Not yet active"
          onClick={() => { setStatus('pending'); setPage(1); }} on={status === 'pending'} />
        <Tile glyph="ban" tone="red" valueFirst label="Inactive Assignments"
          value={loading ? '—' : (summary.inactive ?? 0)} caption="Ended or removed"
          onClick={() => { setStatus('inactive'); setPage(1); }} on={status === 'inactive'} />
      </Tiles>

      {summary.totalEmployees > summary.active && status === 'active' && (
        <div className="pr-note pr-note--amber">
          <Glyph name="bang" size={19} />
          <p>
            <b>{summary.totalEmployees - summary.active} of {summary.totalEmployees} employees have no active assignment.</b>{' '}
            They will be skipped by every payroll run until one is set up.
          </p>
          <Btn size="sm" onClick={() => setBulk(true)}>Assign in bulk</Btn>
        </div>
      )}

      <div className="pr-split">
        <div className="pr-stack">
          <div className="pr-filters">
            <Search value={q} onChange={setQ} onEnter={() => { setSearch(q); setPage(1); }}
              placeholder="Search by employee name, department, subject, or class…" />
            <Select value={department} all="All Departments" onChange={v => { setDepartment(v); setPage(1); }}
              options={departments.map(d => ({ value: d.name, label: `${d.name} (${d.count})` }))} ariaLabel="Department" />
            <Select value={type} all="All Types" onChange={v => { setType(v); setPage(1); }}
              options={Object.entries(STRUCTURE_TYPE).map(([value, [, label]]) => ({ value, label }))} ariaLabel="Assignment type" />
            <Select value={status} onChange={v => { setStatus(v); setPage(1); }} options={STATUS_FILTER} ariaLabel="Status" />
            <Btn variant="ghost" onClick={reset}>Reset</Btn>
          </div>

          <Card>
            <CardHead title={`Employee Assignments (${meta?.total ?? 0})`}>
              <Btn size="sm" glyph="upload" onClick={exportCsv}>Export</Btn>
            </CardHead>
            <div className="pr-cardbody pr-cardbody--flush">
              {loading ? <Loading rows={6} /> : !rows?.length ? (
                <Empty glyph="docFill" title="No assignments"
                  hint={search || department || type ? 'No assignment matches these filters.' : 'Assign an employee to a salary structure to start paying them.'}>
                  <Btn variant="primary" icon="userPlus" onClick={() => setAssigning(true)}>Assign Employee</Btn>
                </Empty>
              ) : (
                <>
                  <BulkBar count={picked.length} noun={`assignment${picked.length === 1 ? '' : 's'} selected`} onClear={() => setPicked([])}>
                    <Btn size="sm" glyph="ban" onClick={() => bulkAct('end')}>End</Btn>
                    <Btn size="sm" glyph="refresh" onClick={() => bulkAct('activate')}>Reactivate</Btn>
                  </BulkBar>
                  <TableWrap>
                    <table className="pr-table pr-table--wide pr-table--stickyend">
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}>
                            <Check checked={picked.length > 0 && picked.length === rows.length}
                              indeterminate={picked.length > 0 && picked.length < rows.length}
                              onChange={on => setPicked(on ? rows.map(r => r._id) : [])} label="Select all" />
                          </th>
                          <th className="pr-idx">#</th>
                          <th>Employee</th>
                          <th>Department</th>
                          <th>Assignment Type</th>
                          <th>Details</th>
                          <th>Start Date</th>
                          <th>End Date</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const [tone, label] = STRUCTURE_TYPE[r.structure?.type] || ['slate', 'General'];
                          return (
                            <tr key={r._id} data-focus-id={r._id} className={r._id === selected ? 'is-on' : ''}>
                              <td>
                                <Check checked={picked.includes(r._id)} label={`Select ${r.employee.name}`}
                                  onChange={on => setPicked(p => (on ? [...p, r._id] : p.filter(x => x !== r._id)))} />
                              </td>
                              <td className="pr-idx">{(page - 1) * limit + i + 1}</td>
                              <td>
                                <div className="pr-who">
                                  <Avatar name={r.employee.name} size={34} />
                                  <div className="pr-who__txt">
                                    <b>{r.employee.name}</b>
                                    <small>{r.employee.employeeId || r.employee.email}</small>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <Glyph name="sitemap" size={14} style={{ color: 'var(--pr-faint)' }} />
                                  {r.employee.department || '—'}
                                </span>
                              </td>
                              <td><Badge tone={tone}>{label}</Badge></td>
                              <td>
                                <div className="pr-cell2 pr-cell2--wrap">
                                  <b>{r.structure?.name || '—'}</b>
                                  <small>
                                    {r.structure?.payBasis === 'rate'
                                      ? `${money(r.structure.rate)} per ${r.structure.rateUnit}`
                                      : `${money(r.ctc)} a year · ${money(r.monthlyCtc)} a month`}
                                  </small>
                                </div>
                              </td>
                              <td>{fmtDate(r.effectiveDate)}</td>
                              <td>{r.endDate ? fmtDate(r.endDate) : <span style={{ color: 'var(--pr-faint)' }}>Open</span>}</td>
                              <td><StatusBadge status={r.state} map={ASSIGN_STATUS} /></td>
                              <td>
                                <div className="pr-acts" style={{ justifyContent: 'flex-end' }}>
                                  <IconBtn glyph="eye" label="View" onClick={() => pick(r._id)} />
                                  <IconBtn glyph="pencil" label="Edit" onClick={() => setEditing(r)} />
                                  <RowMenu label={`Actions for ${r.employee.name}`}>
                                    <MenuItem glyph="chartUp" onClick={() => setRevising(r)}>Revise CTC</MenuItem>
                                    <MenuItem glyph="ban" disabled={!r.isActive} onClick={() => setSettling(r)}>
                                      Settle &amp; release
                                    </MenuItem>
                                    <MenuItem glyph="pencil" onClick={() => setEditing(r)}>Edit assignment</MenuItem>
                                    {r.isActive ? (
                                      <MenuItem glyph="ban" onClick={() => setConfirm({
                                        title: 'End this assignment?',
                                        body: `${r.employee.name} will stop being included in payroll runs from today. Their past payslips are untouched.`,
                                        confirm: 'End Assignment',
                                        run: () => api.deactivateAssignment(r._id), msg: 'Assignment ended',
                                      })}>End assignment</MenuItem>
                                    ) : (
                                      <MenuItem glyph="refresh" onClick={() => act(() => api.activateAssignment(r._id), 'Assignment reactivated')}>
                                        Reactivate
                                      </MenuItem>
                                    )}
                                    <MenuItem glyph="trash" danger onClick={() => setConfirm({
                                      title: 'Delete this assignment?',
                                      body: `The assignment for ${r.employee.name} will be removed. This is refused if they have already been paid on it — end it instead.`,
                                      confirm: 'Delete', danger: true,
                                      run: () => api.deleteAssignment(r._id), msg: 'Assignment deleted',
                                    })}>Delete</MenuItem>
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
                    noun="assignments" onPage={setPage} onLimit={v => { setLimit(v); setPage(1); }} />
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="pr-rail">
          {detailLoading ? (
            <Panel title="Loading…"><Loading rows={5} /></Panel>
          ) : !a ? (
            <Panel title="Assignment Details">
              <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--pr-muted)' }}>
                Pick a row to see what that employee is paid and why.
              </p>
            </Panel>
          ) : (
            <>
              <Panel title="Assignment Details" status={<StatusBadge status={a.state} map={ASSIGN_STATUS} />} flush>
                <div className="pr-who pr-who--rail">
                  <Avatar name={a.employee.name} size={40} />
                  <div className="pr-who__txt">
                    <b>{a.employee.name}</b>
                    <small>{a.employee.employeeId || a.employee.email}</small>
                  </div>
                </div>
                <div className="pr-panel__body">
                  <Facts>
                    <Fact label="Department">{a.employee.department || '—'}</Fact>
                    <Fact label="Designation">{a.employee.designation || '—'}</Fact>
                    <Fact label="Assignment Type">
                      <Badge tone={STRUCTURE_TYPE[a.structure?.type]?.[0] || 'slate'}>
                        {STRUCTURE_TYPE[a.structure?.type]?.[1] || 'General'}
                      </Badge>
                    </Fact>
                    <Fact label="Structure">{a.structure?.name || '—'}</Fact>
                    <Fact label="Annual CTC">{money(a.activeCtc ?? a.ctc)}</Fact>
                    <Fact label="Monthly CTC">{money(a.activeMonthlyCtc ?? a.monthlyCtc)}</Fact>
                    {a.academicYearName && <Fact label="Academic Year">{a.academicYearName}</Fact>}
                    <Fact label="Start Date">{fmtDate(a.effectiveDate)}</Fact>
                    <Fact label="End Date">{a.endDate ? fmtDate(a.endDate) : 'Open-ended'}</Fact>
                    <Fact label="Paid by">{PAYMENT_MODE[a.paymentMode] || a.paymentMode}</Fact>
                  </Facts>

                  {a.pendingRevision && (
                    <div style={{ marginTop: 12 }}>
                      <Note tone="blue" glyph="chartUp">
                        Revised to <b>{money(a.pendingRevision.annualCtc)}</b> from {a.pendingRevision.effectiveLabel}.
                        The figures above are what {a.activeMonthLabel} pays.
                      </Note>
                    </div>
                  )}

                  {a.paymentMode === 'bank_transfer' && !a.employee.hasBank && (
                    <div style={{ marginTop: 12 }}>
                      <Note tone="amber" glyph="bang">
                        No bank account on file — this employee is left out of the bank transfer file.
                      </Note>
                    </div>
                  )}

                  {a.breakdown && (
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--pr-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                        {a.activeMonthLabel || 'This month'}
                      </div>
                      <Ledger title="Earnings" rows={a.breakdown.earnings} total={a.breakdown.grossSalary} />
                      {a.breakdown.deductions.length > 0 && (
                        <Ledger title="Deductions" rows={a.breakdown.deductions} total={a.breakdown.totalDeductions} tone="red" />
                      )}
                      <NetBar value={a.breakdown.netSalary} />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
                    <Btn variant="primary" className="pr-btn--block" glyph="chartUp" onClick={() => setRevising(a)}>Revise CTC</Btn>
                    <Btn className="pr-btn--block" glyph="pencil" onClick={() => setEditing(a)}>Edit</Btn>
                  </div>
                  {a.isActive && (
                    <Btn className="pr-btn--block" glyph="ban" style={{ marginTop: 9 }} onClick={() => setSettling(a)}>
                      Settle &amp; release
                    </Btn>
                  )}
                </div>
              </Panel>

              {a.ctcRevisions?.length > 1 && (
                <Panel title="Salary Timeline" sub={`${a.ctcRevisions.length} revisions`} flush>
                  <div style={{ padding: '4px 0 8px' }}>
                    {a.ctcRevisions.slice(0, 5).map((h, i) => (
                      <div className="pr-act" key={i}>
                        <Mark glyph={h.incrementType === 'initial' ? 'plusCircle' : 'chartUp'}
                          tone={h.incrementType === 'initial' ? 'slate' : 'green'} size={32} glyphSize={16} />
                        <span className="pr-act__t">
                          <b>{money(h.annualCtc)}</b>
                          <small>{h.note || (h.incrementType === 'initial' ? 'Initial CTC' : 'Revision')}</small>
                        </span>
                        <span className="pr-act__when">{h.effectiveLabel || `${h.effectiveMonth}/${h.effectiveYear}`}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {a.payHistory?.length > 0 && (
                <Panel title="Paid so far" sub={`Last ${a.payHistory.length} published months`} flush>
                  <div style={{ padding: '4px 0 8px' }}>
                    {a.payHistory.slice(0, 6).map(p => (
                      <div className="pr-act" key={p.label}>
                        <Mark glyph="wallet" tone="indigo" size={30} glyphSize={15} />
                        <span className="pr-act__t">
                          <b>{money(p.net)}</b>
                          <small>{p.label}{p.lopDays ? ` · ${p.lopDays} LOP days` : ''}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              <QuickActions items={[
                { glyph: 'userPlus', tone: 'indigo', label: 'Assign Employee', hint: 'Add a new assignment', onClick: () => setAssigning(true) },
                { glyph: 'users', tone: 'blue', label: 'Bulk Assign', hint: 'Several employees at once', onClick: () => setBulk(true) },
                { glyph: 'copy', tone: 'orange', label: 'Copy Assignments', hint: 'Carry forward to a new year', onClick: () => setCopying(true) },
                { glyph: 'sitemap', tone: 'purple', label: 'Salary Structures', hint: 'Manage pay scales', to: '/admin/payroll/structures' },
                { glyph: 'ban', tone: 'red', label: 'Settle a Leaver', hint: 'Final pay, leave, gratuity, advances', onClick: () => setSettling(a) },
                { glyph: 'clock', tone: 'slate', label: 'View Inactive', hint: 'See past assignments', onClick: () => { setStatus('inactive'); setPage(1); } },
              ]} />

              <HelpCard text="Contact support for help with assignments."
                action="View Guide" onAction={() => toast('One live assignment per employee. Revise the CTC rather than editing it, so past months keep what they were paid.', { icon: '📘', duration: 7000 })} />
            </>
          )}
        </div>
      </div>

      <AssignDialog open={assigning} onClose={() => setAssigning(false)}
        academicYear={yearId || meta?.academicYear?._id}
        onDone={() => { setAssigning(false); refetch(); }} />
      <AssignDialog open={!!editing} assignment={editing} onClose={() => setEditing(null)}
        onDone={() => { setEditing(null); refetch(); loadDetail(selected); }} />
      <BulkAssignDialog open={bulk} onClose={() => setBulk(false)}
        academicYear={yearId || meta?.academicYear?._id}
        onDone={() => { setBulk(false); refetch(); }} />
      <CopyAssignmentsDialog open={copying} onClose={() => setCopying(false)} years={years}
        currentYear={yearId || meta?.academicYear?._id}
        onDone={() => { setCopying(false); refetch(); }} />
      <ReviseCtcDialog open={!!revising} assignment={revising} onClose={() => setRevising(null)}
        onDone={() => { setRevising(null); refetch(); loadDetail(selected); }} />
      <SettlementDialog open={!!settling} assignment={settling} onClose={() => setSettling(null)}
        onDone={() => { setSettling(null); refetch(); loadDetail(selected); }} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        title={confirm?.title} body={confirm?.body} confirm={confirm?.confirm} danger={confirm?.danger}
        onConfirm={() => act(confirm.run, confirm.msg)} />
    </div>
  );
}
