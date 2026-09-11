import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import useFocusTarget, { useFocusFilterReset } from '../../hooks/useFocusTarget';
import { Button, Modal, Spinner, Empty } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { IconAction, MenuItem, MenuSep, RowActions, RowMenu, useSelection } from './listParts';
import {
  CardHead, ChartCard, CompOffBalanceDrawer, CompOffDrawer, DateRange, EarnedCell,
  FilterRow, FilterSelect, LedgerDrawer,
  LeaveDonut, LeaveStat, LeaveStats, Pager, PolicyHead, RuleCard, RuleCheck, RuleList,
  RuleNum, RulePick, STATUS, SearchBox, SectionHead, ShowingCount, SignOffStep, StatusBadge,
  SubTabs, TYPE_TONES, TeacherCell, WORK_TYPES, WorkDateCell,
} from './leaveParts';

// Comp Off lives inside Leave Management — these two panels are mounted as
// tabs by pages/admin/Leave.jsx rather than being routed on their own.

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const todayStr = () => new Date().toISOString().slice(0, 10);

const DAY_LABEL = {
  holiday: '🎉 Holiday', weekly_off: '🗓️ Weekly Off', sunday: '☀️ Sunday',
  working_day: '💼 Working Day', unknown: '❔ Unclassified',
};

// The six ledger entry types, in words and in the badge tones the rest of the
// module uses.
const ENTRY_LABEL = {
  EARNED: 'Earned', USED: 'Used', EXPIRED: 'Expired',
  CANCELLED: 'Cancelled', REVERSED: 'Reversed', ADJUSTMENT: 'Adjustment',
};
const ENTRY_TONE = {
  EARNED: 'approved', REVERSED: 'approved', USED: 'pending',
  EXPIRED: 'cancelled', CANCELLED: 'rejected', ADJUSTMENT: 'pending',
};

const EMPTY_APPLY = { teacherId: '', workDate: '', checkIn: '', checkOut: '', compOffDays: '', reason: '' };

function downloadBuffer(data, filename) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// A school that has not set Comp Off up yet gets told exactly what is missing
// rather than an empty table.
function NotConfigured({ reason }) {
  return (
    <div className="card"><div className="card-body">
      <Empty icon="🕓" title="Comp Off is not available yet" message={reason} />
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem', marginTop: -12 }}>
        Create a leave type with category <strong>Comp Off</strong> under the Leave Types tab to switch it on.
      </div>
    </div></div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Comp Off — requests, balances, ledger, reports
// ════════════════════════════════════════════════════════════════════════════
export function AdminCompOff() {
  const [sub, setSub] = useState('requests');

  // ── Requests ───────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [fStatus, setFStatus] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fSource, setFSource] = useState('');
  const [fTeacher, setFTeacher] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  // Following a notification: the server is told which request to show and
  // answers with the page holding it, instead of page 1 where it rarely is.
  const { focusId, release: releaseFocus } = useFocusTarget();
  const { data, loading, refetch } = useFetch(
    () => api.getCompOffRequests({
      page, limit: 20,
      status:      fStatus   || undefined,
      teacherId:   fTeacher  || undefined,
      dayCategory: fCategory || undefined,
      source:      fSource   || undefined,
      fromDate:    fFrom     || undefined,
      toDate:      fTo       || undefined,
      focus:       focusId   || undefined,
    }),
    [page, fStatus, fTeacher, fCategory, fSource, fFrom, fTo, focusId],
  );

  const clearFilters = useCallback(() => {
    setFStatus(''); setFTeacher(''); setFCategory(''); setFSource(''); setFFrom(''); setFTo(''); setPage(1);
  }, []);
  // The request exists but a filter in force hides it — clearing them is what
  // following the notification meant.
  useFocusFilterReset(data, focusId, clearFilters);

  // Every filter and page control releases the notification's hold on the list.
  const onFilter = (setter) => (value) => { releaseFocus(); setPage(1); setter(value); };
  const onPage   = (p) => { releaseFocus(); setPage(p); };

  const enabled  = data?.enabled !== false;
  const requests = data?.items || [];
  const policy   = data?.policy;

  // ── Action modal (approve / reject / withdraw) ─────────────────────────────
  const [action, setAction] = useState(null);   // { type, request } | { type, bulk }
  const [detail, setDetail] = useState(null);  // the row the drawer is open on
  // Pressing the eye on a balance opens the ledger already narrowed to that
  // employee. Keyed on it, so a second press re-seeds the filter.
  const [ledgerTeacher, setLedgerTeacher] = useState('');
  const [comment, setComment] = useState('');
  const [actLoad, setActLoad] = useState(false);

  const runAction = async () => {
    setActLoad(true);
    try {
      const { type, request, bulk } = action;
      // A batch is sent one at a time on purpose: each approval is its own
      // transaction that credits a balance and writes a ledger row, and one the
      // rules refuse must not take the rest down with it.
      if (bulk?.length) {
        const call = type === 'approve' ? api.approveCompOff : api.rejectCompOff;
        let okCount = 0; const failed = [];
        for (const r of bulk) {
          try { await call(r._id, { adminComment: comment }); okCount += 1; }
          catch (err) { failed.push(err?.response?.data?.message || err.message); }
        }
        if (okCount)       toast.success(`${okCount} request${okCount === 1 ? '' : 's'} ${type === 'approve' ? 'approved' : 'rejected'}`);
        if (failed.length) toast.error(`${failed.length} could not be done — ${failed[0]}`);
        setAction(null); setComment(''); setDetail(null); selection.clear(); refetch();
        return;
      }
      if (type === 'approve') {
        const res = await api.approveCompOff(request._id, { adminComment: comment });
        const credited = res?.data?.credited ?? res?.credited ?? 0;
        const left = res?.data?.pendingLevels ?? res?.pendingLevels ?? 0;
        toast.success(left > 0
          ? `Approval recorded — ${left} more sign-off needed before any balance is credited`
          : `Approved — ${credited} day(s) credited`);
      } else if (type === 'reject') {
        await api.rejectCompOff(request._id, { adminComment: comment });
        toast.success('Rejected — no balance credited');
      } else {
        const res = await api.cancelCompOff(request._id, { adminComment: comment });
        toast.success(`Withdrawn — ${res?.data?.reversed ?? res?.reversed ?? 0} day(s) removed`);
      }
      setAction(null); setComment(''); setDetail(null); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setActLoad(false); }
  };

  // ── Raise on behalf of an employee ────────────────────────────────────────
  const [applyModal, setApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState(EMPTY_APPLY);
  const [applyLoad, setApplyLoad] = useState(false);
  const [preview, setPreview] = useState(null);

  const { data: employees } = useFetch(() => api.getCompOffEmployees());
  const employeeList = employees || [];

  // Live classification of the chosen work date — the same engine the request
  // will be judged by, so the admin sees the verdict before submitting.
  useEffect(() => {
    if (!applyModal || !applyForm.workDate || !applyForm.teacherId) { setPreview(null); return; }
    let cancelled = false;
    api.previewCompOffDate({
      date: applyForm.workDate, teacherId: applyForm.teacherId,
      checkIn: applyForm.checkIn || undefined, checkOut: applyForm.checkOut || undefined,
    })
      .then(res => { if (!cancelled) setPreview(res?.data ?? res); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [applyModal, applyForm.workDate, applyForm.teacherId, applyForm.checkIn, applyForm.checkOut]);

  const handleApply = async (e) => {
    e.preventDefault();
    setApplyLoad(true);
    try {
      await api.applyCompOffFor({
        ...applyForm,
        compOffDays: applyForm.compOffDays === '' ? undefined : Number(applyForm.compOffDays),
      });
      toast.success('Comp Off request raised — pending approval');
      setApplyModal(false); setApplyForm(EMPTY_APPLY); setPreview(null); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setApplyLoad(false); }
  };

  // ── Toolbar actions ───────────────────────────────────────────────────────
  const [expiryLoad, setExpiryLoad] = useState(false);
  const [exportLoad, setExportLoad] = useState(false);
  const [genModal, setGenModal] = useState(false);
  const [genForm, setGenForm] = useState({ fromDate: '', toDate: '' });
  const [genLoad, setGenLoad] = useState(false);

  const handleExpiry = async () => {
    setExpiryLoad(true);
    try {
      const res = await api.runCompOffExpiry();
      toast.success((res?.data ?? res)?.message || 'Expiry sweep complete');
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setExpiryLoad(false); }
  };

  const handleExport = async () => {
    setExportLoad(true);
    try {
      const res = await api.exportCompOff({ status: fStatus || undefined, fromDate: fFrom || undefined, toDate: fTo || undefined });
      downloadBuffer(res, 'comp_off_requests.xlsx');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setExportLoad(false); }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenLoad(true);
    try {
      const res = await api.generateCompOffDrafts(genForm);
      const d = res?.data ?? res;
      toast.success(`Scanned ${d.scanned} attendance record(s) — ${d.created} draft(s) created`);
      setGenModal(false); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setGenLoad(false); }
  };

  const counts = data?.counts || {};
  const share  = (n) => (counts.total ? Math.round((n / counts.total) * 100) : 0);

  // Ticks are dropped whenever the visible page changes, so a bulk decision can
  // only ever touch rows the admin is actually looking at.
  const selection = useSelection(requests, `${page}|${fStatus}|${fTeacher}|${fCategory}|${fSource}|${fFrom}|${fTo}`);
  const pendingPicked = selection.rows.filter((r) => r.status === 'pending');

  const anyFilter = !!(fStatus || fTeacher || fCategory || fSource || fFrom || fTo);

  if (!loading && !enabled) return <NotConfigured reason={data?.reason} />;

  const SUB_TABS = [
    { value: 'requests', label: 'Requests',       icon: 'fileCheck' },
    { value: 'balances', label: 'Balances',       icon: 'chart' },
    { value: 'ledger',   label: 'Ledger',         icon: 'clipboard' },
    { value: 'reports',  label: 'Reports',        icon: 'files' },
    { value: 'policy',   label: 'Earning Policy', icon: 'users' },
  ];

  return (
    <div className="lvcompoff">
      <SectionHead title="Comp Off"
        subtitle="Manage compensatory off requests, track balances, and configure earning rules.">
        {sub === 'requests' && (
          <>
            <Button variant="secondary" onClick={() => setGenModal(true)}>Generate from Attendance</Button>
            <Button variant="secondary" onClick={handleExpiry} loading={expiryLoad}>Run Expiry</Button>
            <Button variant="secondary" onClick={handleExport} loading={exportLoad}>
              <Icon name="download" size={16} /> Export Excel
            </Button>
            <Button onClick={() => { setApplyForm(EMPTY_APPLY); setApplyModal(true); }}>
              <Icon name="plus" size={16} /> Raise Comp Off
            </Button>
          </>
        )}
      </SectionHead>

      <section className="card lvsubtabcard">
        <SubTabs tabs={SUB_TABS} value={sub} onChange={setSub} />
      </section>

      {/* ── Requests ── */}
      {sub === 'requests' && (
        <>
          <LeaveStats className="lvstats--4">
            <LeaveStat valueFirst icon="users" tone="indigo" value={counts.total ?? 0}
              label="Total Requests"
              delta={counts.monthDeltaPct ?? undefined}
              deltaNote="from last month"
              caption={counts.monthDeltaPct == null ? 'All time' : undefined}
              on={!fStatus} onClick={() => onFilter(setFStatus)('')} />
            <LeaveStat valueFirst icon="checkCircle" tone="green" value={counts.approved ?? 0}
              label="Approved" caption={`${share(counts.approved || 0)}% of total`}
              on={fStatus === 'approved'}
              onClick={() => onFilter(setFStatus)(fStatus === 'approved' ? '' : 'approved')} />
            <LeaveStat valueFirst icon="clock" tone="amber" value={counts.pending ?? 0}
              label="Pending" caption={`${share(counts.pending || 0)}% of total`}
              on={fStatus === 'pending'}
              onClick={() => onFilter(setFStatus)(fStatus === 'pending' ? '' : 'pending')} />
            <LeaveStat valueFirst icon="closeCircle" tone="red" value={counts.rejected ?? 0}
              label="Rejected" caption={`${share(counts.rejected || 0)}% of total`}
              on={fStatus === 'rejected'}
              onClick={() => onFilter(setFStatus)(fStatus === 'rejected' ? '' : 'rejected')} />
          </LeaveStats>

          <section className="card lvcard">
            <FilterRow>
              <FilterSelect label="Filter by status" value={fStatus} all="All Statuses"
                options={['draft', 'pending', 'approved', 'rejected', 'cancelled', 'expired']
                  .map((v) => ({ value: v, label: STATUS[v]?.label || v }))}
                onChange={onFilter(setFStatus)} />
              <FilterSelect label="Filter by employee" value={fTeacher} all="All Employees"
                options={employeeList.map((t) => ({ value: t._id, label: t.name }))}
                onChange={onFilter(setFTeacher)} />
              <FilterSelect label="Filter by work type" value={fCategory} all="All Work Types"
                options={Object.entries(WORK_TYPES).map(([v, l]) => ({ value: v, label: l }))}
                onChange={onFilter(setFCategory)} />
              <FilterSelect label="Filter by source" value={fSource} all="All Sources"
                options={[{ value: 'manual', label: 'Manual' }, { value: 'attendance', label: 'From Attendance' }]}
                onChange={onFilter(setFSource)} />
              <DateRange from={fFrom} to={fTo}
                onFrom={onFilter(setFFrom)} onTo={onFilter(setFTo)} />
              {anyFilter && (
                <Button variant="secondary" onClick={() => { releaseFocus(); clearFilters(); }}>
                  <Icon name="refresh" size={16} /> Reset
                </Button>
              )}
            </FilterRow>

            {/* The request the notification was about is not in this filtered
                set — say so, rather than showing a page that does not hold it. */}
            {focusId && data?.focusFound === false && (
              <div className="lvnotice">
                <Icon name="alert" size={15} />
                That request is not in the current filters.
                <button type="button" onClick={() => { releaseFocus(); clearFilters(); }}>Clear them</button>
              </div>
            )}

            {selection.ids.length > 0 && (
              <div className="lvselbar">
                <Icon name="checkCircle" size={17} />
                {selection.ids.length} selected
                <div className="lvselbar__acts">
                  {pendingPicked.length > 0 ? (
                    <>
                      <Button variant="success" size="sm"
                        onClick={() => { setComment(''); setAction({ type: 'approve', bulk: pendingPicked }); }}>
                        Approve {pendingPicked.length}
                      </Button>
                      <Button variant="danger" size="sm"
                        onClick={() => { setComment(''); setAction({ type: 'reject', bulk: pendingPicked }); }}>
                        Reject {pendingPicked.length}
                      </Button>
                    </>
                  ) : (
                    <span className="lvmuted">None of these are still pending</span>
                  )}
                  <Button variant="secondary" size="sm" onClick={selection.clear}>Clear</Button>
                </div>
              </div>
            )}

            {loading && !data ? (
              <div className="lvtable__state"><Spinner /></div>
            ) : !requests.length ? (
              <div className="lvtable__state">
                <Empty icon="🕓"
                  title={anyFilter ? 'No Comp Off requests match' : 'No Comp Off requests yet'}
                  message={anyFilter
                    ? 'Try another status, employee, work type or date range.'
                    : 'Requests appear here when staff claim a day they worked, or when you generate them from attendance.'}
                  action={anyFilter
                    ? <Button variant="secondary" onClick={() => { releaseFocus(); clearFilters(); }}>Clear filters</Button>
                    : <Button onClick={() => setGenModal(true)}>Generate from Attendance</Button>} />
              </div>
            ) : (
              <div className="lvtable__wrap">
                <table className="lvtable">
                  <thead>
                    <tr>
                      <th className="lvt-tick">
                        <input type="checkbox" checked={selection.allOn}
                          ref={(el) => { if (el) el.indeterminate = selection.some; }}
                          onChange={selection.toggleAll}
                          aria-label="Select every request on this page" />
                      </th>
                      <th>Employee</th>
                      <th className="lvt-dept">Work Date</th>
                      <th className="lvt-dept">Work Type</th>
                      <th className="lvt-total">Hours / Days</th>
                      <th className="lvt-applied">Applied On</th>
                      <th className="lvt-status">Status</th>
                      <th className="lvt-applied">Credited On</th>
                      <th className="lvt-reason">Reason</th>
                      <th className="lvt-acts">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r._id} data-focus-id={r._id}
                        className={selection.has(r._id) ? 'is-picked' : undefined}>
                        <td className="lvt-tick">
                          <input type="checkbox" checked={selection.has(r._id)}
                            onChange={() => selection.toggle(r._id)}
                            aria-label={`Select ${r.teacher?.name || 'this request'}`} />
                        </td>
                        <td>
                          <TeacherCell request={{
                            teacher: { ...r.teacher, employeeId: r.teacher?.designation || r.teacher?.employeeId },
                          }} />
                        </td>
                        <td className="lvt-dept"><WorkDateCell request={r} /></td>
                        <td className="lvt-dept">
                          {WORK_TYPES[r.dayCategory] || r.dayCategory || '—'}
                          {r.source === 'attendance' && (
                            <small className="lvsrc" title="Raised automatically from attendance">auto</small>
                          )}
                        </td>
                        <td className="lvt-total"><EarnedCell request={r} /></td>
                        <td className="lvt-applied">{fmtDate(r.appliedAt)}</td>
                        <td className="lvt-status">
                          <div className="lvstatuscell">
                            <StatusBadge status={r.status} />
                            <SignOffStep request={r} />
                          </div>
                        </td>
                        <td className="lvt-applied">
                          {r.creditedDays > 0
                            ? <span title={`${r.creditedDays} day(s) credited${r.expiresAt ? `, expires ${fmtDate(r.expiresAt)}` : ''}`}>
                                {fmtDate(r.creditedAt || r.approvedAt)}
                              </span>
                            : <span className="lvmuted">—</span>}
                        </td>
                        <td className="lvt-reason">
                          <div className="lvreason" title={r.reason || ''}>
                            <span>{r.reason || '—'}</span>
                          </div>
                        </td>
                        <td className="lvt-acts">
                          <div className="lvrowacts">
                            {r.status === 'pending' && (
                              <div className="lvacts">
                                <button type="button" className="lvbtn lvbtn--approve"
                                  onClick={() => { setComment(''); setAction({ type: 'approve', request: r }); }}>Approve</button>
                                <button type="button" className="lvbtn lvbtn--reject"
                                  onClick={() => { setComment(''); setAction({ type: 'reject', request: r }); }}>Reject</button>
                              </div>
                            )}
                            <RowActions>
                              <IconAction icon="eye" label={`View ${r.teacher?.name || 'this'} request`}
                                onClick={() => setDetail(r)} />
                              <RowMenu>
                                <MenuItem icon="eye" onClick={() => setDetail(r)}>View full request</MenuItem>
                                <MenuItem icon="user"
                                  onClick={() => { releaseFocus(); setFTeacher(r.teacher?._id || ''); setPage(1); }}>
                                  Only this employee
                                </MenuItem>
                                {/* Withdrawing is the only way credited days go
                                    back, and Comp Off refuses while the leave
                                    that spent them is still approved. */}
                                {r.status === 'approved' && (
                                  <>
                                    <MenuSep />
                                    <MenuItem icon="repeat" danger
                                      onClick={() => { setComment(''); setAction({ type: 'cancel', request: r }); }}>
                                      Withdraw approval
                                    </MenuItem>
                                  </>
                                )}
                              </RowMenu>
                            </RowActions>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="lvfoot">
              <ShowingCount page={data?.page || page} limit={20} count={requests.length}
                total={data?.total ?? requests.length} />
              <Pager page={data?.page || page} pages={requests.length ? (data?.pages || 1) : 0} onPage={onPage} />
            </div>
          </section>
        </>
      )}

      {sub === 'balances'  && (
        <CompOffBalances
          onOpenLedger={(id) => { setLedgerTeacher(id || ''); setSub('ledger'); }}
        />
      )}
      {sub === 'ledger'    && (
        <CompOffLedger key={ledgerTeacher} employees={employeeList}
          teacherId={ledgerTeacher} onChanged={refetch} />
      )}
      {sub === 'reports'   && (
        <CompOffReports
          onOpenRequests={(r) => {
            releaseFocus();
            setFTeacher(r?.teacher?._id || '');
            setPage(1);
            setSub('requests');
          }}
        />
      )}
      {sub === 'policy'    && <AdminCompOffPolicy />}

      <CompOffDrawer
        request={detail}
        busy={actLoad}
        onClose={() => setDetail(null)}
        onDecide={(type, r) => { setComment(''); setAction({ type, request: r }); }}
      />

      {/* ── Approve / Reject / Withdraw ── */}
      <Modal open={!!action} onClose={() => setAction(null)}
        title={(() => {
          const many = action?.bulk?.length ? ` ${action.bulk.length}` : '';
          return action?.type === 'approve' ? `Approve${many} Comp Off`
            : action?.type === 'reject'  ? `Reject${many} Comp Off`
            : 'Withdraw approved Comp Off';
        })()}
        footer={<>
          <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          <Button variant={action?.type === 'approve' ? 'success' : 'danger'} onClick={runAction} loading={actLoad}>
            {action?.type === 'approve' ? 'Approve' : action?.type === 'reject' ? 'Reject' : 'Withdraw'}
          </Button>
        </>}>
        {action && (
          <div>
            {/* A batch has no single request behind it, so the summary counts
                the rows instead of describing one. Reading action.request here
                unguarded is what would blank the dialog on a bulk approve. */}
            {action.bulk?.length ? (
              <div style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '10px 14px', fontSize: '.85rem', marginBottom: 12 }}>
                <div><strong>{action.bulk.length} pending requests</strong></div>
                <div>
                  {action.bulk.reduce((n, r) => n + (Number(r.compOffDays) || 0), 0)} day(s) claimed in total
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  Each is decided on its own, so one the rules refuse is reported and the rest still go through.
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '10px 14px', fontSize: '.85rem', marginBottom: 12 }}>
                <div><strong>{action.request.teacher?.name}</strong></div>
                <div>{fmtDate(action.request.workDate)} · {DAY_LABEL[action.request.dayCategory] || action.request.dayCategory}</div>
                <div>{action.request.workedHours ? `${action.request.workedHours} hour(s) worked · ` : ''}{action.request.compOffDays} day(s) claimed</div>
              </div>
            )}
            {action.type === 'approve' && !action.bulk && (
              <div className="alert alert-info" style={{ marginBottom: 12, fontSize: '.82rem' }}>
                {action.request.approvalsRequired > 1 && (action.request.approvalLevel || 0) + 1 < action.request.approvalsRequired
                  ? 'This is the first of two sign-offs — no balance is credited until the second one.'
                  : `Approving credits ${action.request.compOffDays} day(s) to the employee's Comp Off balance.`}
              </div>
            )}
            {action.type === 'cancel' && (
              <div className="alert alert-warning" style={{ marginBottom: 12, fontSize: '.82rem' }}>
                Withdrawing removes the credited days from the balance. It is refused if the days have already been used —
                reverse the leave first.
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Comment</label>
              <textarea className="form-control" rows={3} value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Optional note for the employee" />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Raise on behalf ── */}
      <Modal open={applyModal} onClose={() => setApplyModal(false)} title="Raise Comp Off" maxWidth={620}
        footer={<>
          <Button variant="secondary" onClick={() => setApplyModal(false)}>Cancel</Button>
          <Button form="co-apply-form" type="submit" loading={applyLoad}>Submit</Button>
        </>}>
        <form id="co-apply-form" onSubmit={handleApply}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Employee</label>
              <select className="form-control" required value={applyForm.teacherId}
                onChange={e => setApplyForm(f => ({ ...f, teacherId: e.target.value }))}>
                <option value="">Select employee</option>
                {employeeList.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Work Date</label>
              <input type="date" className="form-control" required max={todayStr()} value={applyForm.workDate}
                onChange={e => setApplyForm(f => ({ ...f, workDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Check In</label>
              <input type="time" className="form-control" value={applyForm.checkIn}
                onChange={e => setApplyForm(f => ({ ...f, checkIn: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Check Out</label>
              <input type="time" className="form-control" value={applyForm.checkOut}
                onChange={e => setApplyForm(f => ({ ...f, checkOut: e.target.value }))} />
            </div>
          </div>

          {preview && (
            <div className={`alert alert-${preview.eligible ? 'success' : 'warning'}`} style={{ fontSize: '.82rem', marginBottom: 12 }}>
              <div><strong>{DAY_LABEL[preview.dayCategory] || preview.dayCategory}</strong>{preview.dayLabel ? ` — ${preview.dayLabel}` : ''}</div>
              {preview.workedHours > 0 && <div>{preview.workedHours} hour(s) → {preview.compOffDays ?? 0} Comp Off day(s)</div>}
              {!preview.eligible && <div style={{ marginTop: 4 }}>{preview.message}</div>}
              {!preview.holidayModule && (
                <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                  Holiday module is off — the day cannot be classified automatically, so this claim is judged manually.
                </div>
              )}
            </div>
          )}

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Comp Off Days</label>
              <input type="number" className="form-control" min={0} step="0.5" value={applyForm.compOffDays}
                placeholder={preview?.compOffDays != null ? String(preview.compOffDays) : 'auto from hours'}
                onChange={e => setApplyForm(f => ({ ...f, compOffDays: e.target.value }))} />
              <div className="form-hint">Leave blank to let the policy decide from the hours worked</div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Reason</label>
            <textarea className="form-control" rows={3} required value={applyForm.reason}
              onChange={e => setApplyForm(f => ({ ...f, reason: e.target.value }))} />
          </div>
          {policy && (
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
              Policy: min {policy.minWorkingHours}h · half day at {policy.halfDayHours}h · full day at {policy.fullDayHours}h ·
              apply within {policy.applyWithinDays || '∞'} day(s) · validity {policy.validityDays || '∞'} day(s)
            </div>
          )}
        </form>
      </Modal>

      {/* ── Generate from attendance ── */}
      <Modal open={genModal} onClose={() => setGenModal(false)} title="Generate Comp Off from Attendance"
        footer={<>
          <Button variant="secondary" onClick={() => setGenModal(false)}>Cancel</Button>
          <Button form="co-gen-form" type="submit" loading={genLoad}>Generate</Button>
        </>}>
        <form id="co-gen-form" onSubmit={handleGenerate}>
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>
            Scans attendance already on record and creates ready-to-apply drafts for eligible days.
            Employees still have to apply, and an approver still has to sign off — nothing is credited here.
          </p>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">From</label>
              <input type="date" className="form-control" required max={todayStr()} value={genForm.fromDate}
                onChange={e => setGenForm(f => ({ ...f, fromDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">To</label>
              <input type="date" className="form-control" required max={todayStr()} value={genForm.toDate}
                onChange={e => setGenForm(f => ({ ...f, toDate: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ── Balances ────────────────────────────────────────────────────────────────
/**
 * Balances — what every employee is holding, and where it came from.
 *
 * Same shape as Leave's Balance Summary: four tiles that describe the school,
 * then one card with the per-employee grid. Paged here rather than on the
 * server, because the endpoint answers with one row per employee and a school
 * has hundreds of employees, not thousands of them.
 */
function CompOffBalances({ onOpenLedger }) {
  const { data, loading } = useFetch(() => api.getCompOffBalances());
  const [detail, setDetail] = useState(null);   // the row the drawer is open on
  // The last few movements behind the figures, fetched when the drawer opens
  // rather than shipped with every row of the table.
  const [moves, setMoves] = useState(null);
  const [movesErr, setMovesErr] = useState('');
  const [movesLoad, setMovesLoad] = useState(false);

  useEffect(() => {
    if (!detail?.teacher?._id) { setMoves(null); setMovesErr(''); return undefined; }
    let alive = true;
    setMoves(null); setMovesErr(''); setMovesLoad(true);
    api.getCompOffLedger({ teacherId: detail.teacher._id, limit: 8, page: 1 })
      .then((res) => { if (alive) setMoves((res?.data ?? res)?.entries || []); })
      .catch((err) => { if (alive) setMovesErr(err?.response?.data?.message || err.message); })
      .finally(() => { if (alive) setMovesLoad(false); });
    return () => { alive = false; };
  }, [detail]);
  const items  = data?.items  || [];
  const totals = data?.totals || {};

  const [search, setSearch] = useState('');
  const [only, setOnly]     = useState('');   // '' | 'holding' | 'expired'
  const [page, setPage]     = useState(1);
  const PAGE = 10;

  if (loading) return <div className="lvtable__state"><Spinner /></div>;
  if (data?.enabled === false) return <NotConfigured reason={data.reason} />;

  const rows = items.filter((r) => {
    if (only === 'holding' && !(r.remaining > 0)) return false;
    if (only === 'expired' && !(r.expired  > 0)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.teacher?.name, r.teacher?.employeeId]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  });
  const pages   = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageNow = Math.min(page, pages);
  const shown   = rows.slice((pageNow - 1) * PAGE, pageNow * PAGE);
  const anyFilter = !!(search.trim() || only);

  return (
    <>
      <LeaveStats className="lvstats--4">
        <LeaveStat valueFirst icon="checkCircle" tone="green" value={totals.remaining ?? 0}
          label="Available" caption="Days left to spend"
          on={only === 'holding'}
          onClick={() => { setOnly((c) => (c === 'holding' ? '' : 'holding')); setPage(1); }} />
        <LeaveStat valueFirst icon="wallet2" tone="indigo" value={totals.earned ?? 0}
          label="Earned" caption="Credited all year" />
        <LeaveStat valueFirst icon="clock" tone="amber" value={totals.used ?? 0}
          label="Used" caption="Already spent as leave" />
        {/* Expiry is the only figure here anyone can still act on, so it is the
            one that filters. */}
        <LeaveStat valueFirst icon="closeCircle" tone="red" value={totals.expired ?? 0}
          label="Expired" caption="Lapsed before being used"
          on={only === 'expired'}
          onClick={() => { setOnly((c) => (c === 'expired' ? '' : 'expired')); setPage(1); }} />
      </LeaveStats>

      <section className="card lvcard">
        <CardHead icon="chart" title="Comp Off Balances"
          subtitle="What each employee has earned, spent and has left.">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search employee..." />
        </CardHead>

        {!shown.length ? (
          <div className="lvtable__state">
            <Empty icon="📊"
              title={anyFilter ? 'No employees match' : 'No Comp Off balances yet'}
              message={anyFilter
                ? 'Try another name, or turn the filter off.'
                : 'A balance appears here the moment a Comp Off request is approved.'}
              action={anyFilter
                ? <Button variant="secondary" onClick={() => { setSearch(''); setOnly(''); setPage(1); }}>Clear filters</Button>
                : null} />
          </div>
        ) : (
          <div className="lvtable__wrap">
            <table className="lvtable">
              <thead>
                <tr>
                  <th className="lvt-num">#</th>
                  <th>Employee</th>
                  <th className="lvt-cell">Earned</th>
                  <th className="lvt-cell">Carried</th>
                  <th className="lvt-cell">Used</th>
                  <th className="lvt-cell">Pending</th>
                  <th className="lvt-cell">Expired</th>
                  <th className="lvt-total">Available</th>
                  <th className="lvt-acts">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.teacher?._id || i} data-focus-id={r.teacher?._id}>
                    <td className="lvt-num">{(pageNow - 1) * PAGE + i + 1}</td>
                    <td><TeacherCell request={r} /></td>
                    <td className="lvt-cell">{r.earned || 0}</td>
                    <td className="lvt-cell">{r.carried || 0}</td>
                    <td className="lvt-cell">{r.used || 0}</td>
                    <td className="lvt-cell">{r.pending || 0}</td>
                    <td className="lvt-cell">
                      {r.expired > 0
                        ? <span className="lvpill lvpill--low" title="Lapsed before being used">{r.expired}</span>
                        : <span className="lvmuted">0</span>}
                    </td>
                    <td className="lvt-total">
                      <span className={`lvpill lvpill--${r.remaining > 0 ? 'green' : 'slate'}`}>{r.remaining || 0}</span>
                    </td>
                    <td className="lvt-acts">
                      <RowActions>
                        <IconAction icon="eye" label={`View ${r.teacher?.name || 'this employee'} balance`}
                          onClick={() => setDetail(r)} />
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="lvfoot">
          <ShowingCount page={pageNow} limit={PAGE} count={shown.length}
            total={rows.length} noun="employee" />
          <Pager page={pageNow} pages={rows.length ? pages : 0} onPage={setPage} />
        </div>
      </section>

      <CompOffBalanceDrawer
        open={!!detail}
        row={detail}
        entries={moves}
        loading={movesLoad}
        error={movesErr}
        onClose={() => setDetail(null)}
        onOpenLedger={onOpenLedger
          ? (id) => { setDetail(null); onOpenLedger(id); }
          : undefined}
      />
    </>
  );
}

// ── Ledger ──────────────────────────────────────────────────────────────────
/**
 * The ledger — every movement of every day, in order.
 *
 * No tiles: this is a log, and a figure summed from whichever page happens to
 * be open would be a number about the pager rather than about the school. The
 * totals live on the Balances tab, where they are computed over everything.
 */
function CompOffLedger({ employees = [], onChanged, teacherId: initialTeacher = '' }) {
  const [teacherId, setTeacherId] = useState(initialTeacher);
  const [detail, setDetail] = useState(null);   // the entry the drawer is open on
  const [entryType, setEntryType] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, refetch } = useFetch(
    () => api.getCompOffLedger({ teacherId: teacherId || undefined, entryType: entryType || undefined, page, limit: 50 }),
    [teacherId, entryType, page],
  );

  const [adjModal, setAdjModal] = useState(false);
  const [adjForm, setAdjForm] = useState({ teacherId: '', days: '', description: '' });
  const [adjLoad, setAdjLoad] = useState(false);

  const submitAdjust = async (e) => {
    e.preventDefault();
    setAdjLoad(true);
    try {
      await api.adjustCompOff({ ...adjForm, days: Number(adjForm.days) });
      toast.success('Adjustment posted');
      setAdjModal(false); setAdjForm({ teacherId: '', days: '', description: '' });
      refetch(); onChanged?.();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setAdjLoad(false); }
  };

  if (data?.enabled === false) return <NotConfigured reason={data.reason} />;

  const entries   = data?.entries || [];
  const anyFilter = !!(teacherId || entryType);

  return (
    <section className="card lvcard">
      <CardHead icon="clipboard" title="Comp Off Ledger"
        subtitle="Every credit, spend, expiry and adjustment, newest first.">
        <FilterSelect label="Filter by employee" value={teacherId} all="All employees"
          options={employees.map((t) => ({ value: t._id, label: t.name }))}
          onChange={(v) => { setTeacherId(v); setPage(1); }} />
        <FilterSelect label="Filter by entry type" value={entryType} all="All entry types"
          options={Object.keys(ENTRY_LABEL).map((v) => ({ value: v, label: ENTRY_LABEL[v] || v }))}
          onChange={(v) => { setEntryType(v); setPage(1); }} />
        <Button variant="secondary" onClick={() => setAdjModal(true)}>
          <Icon name="plus" size={16} /> Adjustment
        </Button>
      </CardHead>

      {loading && !data ? (
        <div className="lvtable__state"><Spinner /></div>
      ) : !entries.length ? (
        <div className="lvtable__state">
          <Empty icon="📒"
            title={anyFilter ? 'No entries match' : 'Nothing in the ledger yet'}
            message={anyFilter
              ? 'Try another employee or entry type.'
              : 'The first entry is written the moment a Comp Off request is approved.'}
            action={anyFilter
              ? <Button variant="secondary" onClick={() => { setTeacherId(''); setEntryType(''); setPage(1); }}>Clear filters</Button>
              : null} />
        </div>
      ) : (
        <div className="lvtable__wrap">
          <table className="lvtable">
            <thead>
              <tr>
                <th className="lvt-num">#</th>
                <th className="lvt-applied">When</th>
                <th>Employee</th>
                <th className="lvt-dept">Entry</th>
                <th className="lvt-cell">Days</th>
                <th className="lvt-total">Balance After</th>
                <th className="lvt-dept">Lot</th>
                <th className="lvt-reason">Description</th>
                <th className="lvt-acts">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((r, i) => (
                <tr key={r._id}>
                  <td className="lvt-num">{((data?.page || page) - 1) * 50 + i + 1}</td>
                  <td className="lvt-applied">{fmtDate(r.createdAt)}</td>
                  <td><TeacherCell request={r} /></td>
                  <td className="lvt-dept">
                    <span className={`lvbadge is-${ENTRY_TONE[r.entryType] || 'cancelled'}`}>
                      {ENTRY_LABEL[r.entryType] || r.entryType}
                    </span>
                  </td>
                  {/* The sign is the whole meaning of a ledger row, so it is
                      never dropped — +2 and −2 are opposite facts. */}
                  <td className="lvt-cell">
                    <strong className={r.delta >= 0 ? 'lvup' : 'lvdown'}>
                      {r.delta >= 0 ? '+' : ''}{r.delta}
                    </strong>
                  </td>
                  <td className="lvt-total">{r.balanceAfter}</td>
                  <td className="lvt-dept">
                    {r.entryType === 'EARNED' || r.remainingDays > 0
                      ? <span className="lvlot">
                          {r.remainingDays}/{r.days} left
                          {r.expiresAt ? <small>expires {fmtDate(r.expiresAt)}</small> : null}
                        </span>
                      : <span className="lvmuted">—</span>}
                  </td>
                  <td className="lvt-reason">
                    <div className="lvreason" title={r.description || ''}>
                      <span>{r.description || '—'}</span>
                    </div>
                  </td>
                  <td className="lvt-acts">
                    <RowActions>
                      <IconAction icon="eye" label={`View this ${(ENTRY_LABEL[r.entryType] || r.entryType).toLowerCase()} entry`}
                        onClick={() => setDetail(r)} />
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="lvfoot">
        <ShowingCount page={data?.page || page} limit={50} count={entries.length}
          total={data?.total ?? entries.length} noun="entry" plural="entries" />
        <Pager page={data?.page || page} pages={entries.length ? (data?.pages || 1) : 0} onPage={setPage} />
      </div>

      <Modal open={adjModal} onClose={() => setAdjModal(false)} title="Manual Comp Off Adjustment"
        footer={<>
          <Button variant="secondary" onClick={() => setAdjModal(false)}>Cancel</Button>
          <Button form="co-adj-form" type="submit" loading={adjLoad}>Post</Button>
        </>}>
        <form id="co-adj-form" onSubmit={submitAdjust}>
          <div className="form-group">
            <label className="form-label required">Employee</label>
            <select className="form-control" required value={adjForm.teacherId}
              onChange={e => setAdjForm(f => ({ ...f, teacherId: e.target.value }))}>
              <option value="">Select employee</option>
              {employees.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Days</label>
            <input type="number" className="form-control" required step="0.5" value={adjForm.days}
              onChange={e => setAdjForm(f => ({ ...f, days: e.target.value }))} placeholder="e.g. 1 or -0.5" />
            <div className="form-hint">Positive credits days, negative deducts them</div>
          </div>
          <div className="form-group">
            <label className="form-label required">Description</label>
            <textarea className="form-control" rows={3} required value={adjForm.description}
              onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Why this correction is being made" />
          </div>
        </form>
      </Modal>

      <LedgerDrawer
        entry={detail}
        labels={ENTRY_LABEL}
        tones={ENTRY_TONE}
        onClose={() => setDetail(null)}
        onOnlyEmployee={(id) => { setDetail(null); setTeacherId(id || ''); setPage(1); }}
      />
    </section>
  );
}

/**
 * Reports — the period's comp off, summed and listed.
 *
 * Built like Leave's Reports tab: tiles for the headline figures, a ring for
 * the split that a table cannot show at a glance, and the requests themselves
 * underneath.
 */
function CompOffReports({ onOpenRequests }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);   // the row the drawer is open on
  const PAGE = 10;

  const { data, loading } = useFetch(
    () => api.getCompOffReports({ fromDate: from || undefined, toDate: to || undefined }),
    [from, to],
  );

  if (loading && !data) return <div className="lvtable__state"><Spinner /></div>;
  if (data?.enabled === false) return <NotConfigured reason={data.reason} />;

  const s = data?.summary || {};
  const rows    = data?.requests || [];
  const pages   = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageNow = Math.min(page, pages);
  const shown   = rows.slice((pageNow - 1) * PAGE, pageNow * PAGE);

  // The day-type split, as a ring. Coloured off a fixed order rather than the
  // leave-type palette — these are kinds of day, not leave types.
  const DAY_TONE = { holiday: 'green', weekly_off: 'blue', sunday: 'amber', working_day: 'fuchsia', unknown: 'slate' };
  const split = Object.entries(s.byCategory || {})
    .map(([k, v]) => ({ _id: k, name: WORK_TYPES[k] || k, days: v }));
  const slices = split
    .filter((x) => x.days > 0)
    .sort((a, b) => b.days - a.days)
    .map((x) => ({ key: x._id, label: x.name, days: x.days, color: TYPE_TONES[DAY_TONE[x._id]] || TYPE_TONES.slate }));

  return (
    <>
      <LeaveStats className="lvstats--4">
        <LeaveStat valueFirst icon="fileCheck" tone="blue" value={s.total ?? 0}
          label="Total Requests" caption={from || to ? 'In this period' : 'All time'} />
        <LeaveStat valueFirst icon="checkCircle" tone="green" value={s.daysEarned ?? 0}
          label="Days Credited" caption="Reached a balance" />
        <LeaveStat valueFirst icon="clock" tone="amber" value={s.byStatus?.pending ?? 0}
          label="Pending" caption="Still waiting on a decision" />
        <LeaveStat valueFirst icon="closeCircle" tone="red" value={s.byStatus?.rejected ?? 0}
          label="Rejected" caption="Turned down" />
      </LeaveStats>

      <div className="lvcharts">
        <ChartCard icon="chart" title="Comp Off by Work Type"
          subtitle="Which kinds of day are earning the time off"
          control={(
            <DateRange from={from} to={to}
              onFrom={(v) => { setFrom(v); setPage(1); }}
              onTo={(v) => { setTo(v); setPage(1); }} />
          )}>
          {/* One ring, not two panels: the split IS the report, and the table
              below is the evidence for it. */}
          <LeaveDonut showPct unit="requests" slices={slices}
            total={slices.reduce((n, x) => n + x.days, 0)} caption="Requests"
            emptyNote="No Comp Off was claimed in this period." />
        </ChartCard>

        <ChartCard icon="checkSquare" tone="violet" title="Where they stand"
          subtitle="Every request in the period, by status">
          <div className="lvstatuslist">
            {['approved', 'pending', 'rejected', 'cancelled', 'expired', 'draft']
              .filter((k) => (s.byStatus?.[k] || 0) > 0)
              .map((k) => (
                <div key={k} className="lvstatusrow">
                  <StatusBadge status={k} />
                  <span className="lvstatusrow__bar">
                    <i style={{ width: `${Math.max(3, ((s.byStatus[k] || 0) / Math.max(1, s.total || 1)) * 100)}%` }} />
                  </span>
                  <b>{s.byStatus[k]}</b>
                </div>
              ))}
            {!Object.values(s.byStatus || {}).some((v) => v > 0) && (
              <p className="lvrail__none">Nothing to count in this period.</p>
            )}
          </div>
        </ChartCard>
      </div>

      <section className="card lvcard">
        <CardHead icon="files" title="Comp Off Requests"
          subtitle="Every claim in the selected period." />

        {!shown.length ? (
          <div className="lvtable__state">
            <Empty icon="📈" title="No Comp Off in this period"
              message="Widen the dates, or clear them to see the whole year."
              action={(from || to)
                ? <Button variant="secondary" onClick={() => { setFrom(''); setTo(''); setPage(1); }}>Clear dates</Button>
                : null} />
          </div>
        ) : (
          <div className="lvtable__wrap">
            <table className="lvtable">
              <thead>
                <tr>
                  <th className="lvt-num">#</th>
                  <th>Employee</th>
                  <th className="lvt-dept">Work Date</th>
                  <th className="lvt-dept">Work Type</th>
                  <th className="lvt-cell">Claimed</th>
                  <th className="lvt-cell">Credited</th>
                  <th className="lvt-status">Status</th>
                  <th className="lvt-acts">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r._id}>
                    <td className="lvt-num">{(pageNow - 1) * PAGE + i + 1}</td>
                    <td><TeacherCell request={r} /></td>
                    <td className="lvt-dept"><WorkDateCell request={r} /></td>
                    <td className="lvt-dept">{WORK_TYPES[r.dayCategory] || r.dayCategory || '—'}</td>
                    <td className="lvt-cell">{r.compOffDays}</td>
                    <td className="lvt-cell">
                      {r.creditedDays > 0 ? r.creditedDays : <span className="lvmuted">0</span>}
                    </td>
                    <td className="lvt-status"><StatusBadge status={r.status} /></td>
                    <td className="lvt-acts">
                      <RowActions>
                        <IconAction icon="eye" label={`View ${r.teacher?.name || 'this'} claim`}
                          onClick={() => setDetail(r)} />
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="lvfoot">
          <ShowingCount page={pageNow} limit={PAGE} count={shown.length} total={rows.length} />
          <Pager page={pageNow} pages={rows.length ? pages : 0} onPage={setPage} />
        </div>
      </section>

      {/* The record, in place. No decide buttons: a report is a record, and the
          queue is where a claim gets acted on — the footer hands over to it. */}
      <CompOffDrawer
        request={detail}
        onClose={() => setDetail(null)}
        onSeeRequests={onOpenRequests
          ? (r) => { setDetail(null); onOpenRequests(r); }
          : undefined}
      />
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Comp Off Policy — every rule the engine reads, nothing hard-coded
// ════════════════════════════════════════════════════════════════════════════

export function AdminCompOffPolicy() {
  const { data, loading, refetch } = useFetch(() => api.getCompOffPolicy());
  const [edits, setEdits] = useState(null);
  const [saving, setSaving] = useState(false);

  // Derived, not synced in an effect — an effect would leave the form blank on
  // the first paint and fill it in on the second. `edits` is only the buffer.
  const form = edits || data?.policy || null;

  const set   = (patch) => setEdits({ ...form, ...patch });
  const setIn = (key, patch) => setEdits({ ...form, [key]: { ...form[key], ...patch } });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateCompOffPolicy(form);
      toast.success('Comp Off policy saved');
      setEdits(null);   // the refetch below is now the truth
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  if (loading || !form) return <div className="lvtable__state"><Spinner /></div>;

  const designations = data?.designations || [];
  const modules = data?.modules || {};
  const num = (k) => ({ value: form[k], onChange: (v) => set({ [k]: v }) });

  return (
    <form className="lvpolmain" onSubmit={save}>
      <PolicyHead
        icon="repeat" tone="pink"
        title="Comp Off Earning Policy"
        subtitle="Every rule the engine reads when it decides what a worked day is worth."
        active={form.isActive}
        onToggleActive={(v) => set({ isActive: v })}
      >
        <Button type="submit" loading={saving}>Save Policy</Button>
      </PolicyHead>

      {!data?.enabled && (
        <div className="lvnotice lvnotice--flat lvnotice--warn">
          <Icon name="alert" size={15} />
          <span><b>Comp Off is not active.</b> {data?.reason}</span>
        </div>
      )}
      {data?.enabled && (
        <div className="lvnotice lvnotice--flat">
          <Icon name="alert" size={15} />
          <span>
            Earning on <b>{data.leaveType?.name} ({data.leaveType?.code})</b>.
            {' '}Holiday module <b>{modules.holiday ? 'on' : 'off'}</b>, attendance module <b>{modules.attendance ? 'on' : 'off'}</b>.
            {!modules.holiday && ' Without Holidays, work dates cannot be classified automatically — claims are judged by hand.'}
            {!modules.attendance && ' Without Attendance, requests must be raised by hand.'}
          </span>
        </div>
      )}

      <div className="lvpolsecs">
        <RuleCard n={1} icon="users" tone="indigo" title="Eligible Employees"
          note="Who can earn Comp Off. Leave the designation list empty to allow everyone.">
          <RuleList label="Eligible designations" options={designations.map((d) => [d, d])}
            selected={form.eligibleDesignations || []}
            onChange={(v) => set({ eligibleDesignations: v })}
            empty="No designations configured" />
          <RuleList label="Eligible roles"
            options={[['teacher', 'Teachers'], ['school_admin', 'School Admins']]}
            selected={form.eligibleRoles || []}
            onChange={(v) => set({ eligibleRoles: v })} />
        </RuleCard>

        <RuleCard n={2} icon="clock" tone="blue" title="Working Hours"
          note="How many hours on the work date turn into how much Comp Off.">
          <div className="lvpolrow lvpolrow--3">
            <RuleNum label="Minimum working hours" step={0.5} {...num('minWorkingHours')}
              hint="Below this, nothing is earned" />
            <RuleNum label="Half-day hours" step={0.5} {...num('halfDayHours')}
              hint="At or above this → 0.5 day" />
            <RuleNum label="Full-day hours" step={0.5} {...num('fullDayHours')}
              hint="At or above this → 1 day" />
          </div>
        </RuleCard>

        <RuleCard n={3} icon="calendarDays" tone="green" title="Eligible Days"
          note="Which kinds of day can earn Comp Off at all.">
          <RuleList label="Days that qualify"
            options={[['holiday', 'Holiday'], ['weeklyOff', 'Weekly Off'], ['sunday', 'Sunday']]}
            selected={Object.entries(form.eligibleDays || {}).filter(([, v]) => v).map(([k]) => k)}
            onChange={(v) => set({
              eligibleDays: {
                holiday:   v.includes('holiday'),
                weeklyOff: v.includes('weeklyOff'),
                sunday:    v.includes('sunday'),
              },
            })} />
          <RuleCheck label="Allow Comp Off for regular working days"
            checked={form.allowWorkingDays} onChange={(v) => set({ allowWorkingDays: v })}
            hint="Off by default — an ordinary working day is just attendance" />
        </RuleCard>

        <RuleCard n={4} icon="fileCheck" tone="amber" title="Window and Limits"
          note="How long a claim stays open, and how much can be earned.">
          <div className="lvpolrow lvpolrow--3">
            <RuleNum label="Apply within (days after working)" {...num('applyWithinDays')} />
            <RuleNum label="Max earned per month" step={0.5} {...num('maxPerMonth')} />
            <RuleNum label="Max earned per year" step={0.5} {...num('maxPerYear')} />
          </div>
          <RuleNum label="Validity / expiry (days)" {...num('validityDays')}
            hint="Credited days lapse this many days after they are earned" />
          <p className="lvpolnote">0 means no limit.</p>
        </RuleCard>

        <RuleCard n={5} icon="wallet2" tone="pink" title="Carry Forward"
          note="What happens to unused days at the end of the year.">
          <RuleCheck label="Carry unused Comp Off into the next academic year"
            checked={form.carryForward?.enabled}
            onChange={(v) => setIn('carryForward', { enabled: v })}>
            <RuleNum label="Max days to carry forward" step={0.5}
              value={form.carryForward?.maxDays ?? 0}
              onChange={(v) => setIn('carryForward', { maxDays: v })}
              hint="0 = carry everything remaining" />
          </RuleCheck>
        </RuleCard>

        <RuleCard n={6} icon="settings" tone="violet" title="Claiming"
          note="Spending Comp Off as leave is configured under Leave → Policies, like every other type.">
          <RuleCheck label="Half-day Comp Off can be earned" checked={form.halfDayAllowed}
            onChange={(v) => set({ halfDayAllowed: v })}
            hint="Whether a part-day of work earns half a day" />
          <RuleCheck label="Advance Comp Off allowed" checked={form.advanceCompOffAllowed}
            onChange={(v) => set({ advanceCompOffAllowed: v })}
            hint="Lets employees claim before the work date has passed" />
        </RuleCard>

        <RuleCard n={7} icon="checkSquare" tone="indigo" title="Approval Workflow"
          note="Who signs a claim off, and how many signatures it takes.">
          <RulePick label="Who approves" value={form.approval?.mode || 'admin'}
            onChange={(v) => setIn('approval', { mode: v })}
            options={[
              ['admin', 'School admins only'],
              ['designation', 'Specific designations only'],
              ['both', 'Admins or specific designations'],
            ]} />
          {form.approval?.mode !== 'admin' && (
            <RuleList label="Approver designations" options={designations.map((d) => [d, d])}
              selected={form.approval?.approverDesignations || []}
              onChange={(v) => setIn('approval', { approverDesignations: v })}
              empty="No designations configured" />
          )}
          <RuleCheck label="Require two sign-offs before crediting"
            checked={form.approval?.twoLevel}
            onChange={(v) => setIn('approval', { twoLevel: v })}
            hint="The second approver must be a different person; nothing is credited until both have signed" />
        </RuleCard>

        <RuleCard n={8} icon="refresh" tone="teal" title="Automation and Notifications"
          note="What the engine does without being asked.">
          <RuleCheck label="Auto-create ready-to-apply Comp Off from approved attendance"
            checked={form.autoGenerateFromAttendance}
            onChange={(v) => set({ autoGenerateFromAttendance: v })}
            hint={modules.attendance
              ? 'When attendance lands on an eligible day, the employee gets a pre-filled draft to review and apply'
              : 'Requires the attendance module — currently off for this school'} />
          <RuleCheck label="Notify employees before their Comp Off expires"
            checked={form.expiryNotification?.enabled}
            onChange={(v) => setIn('expiryNotification', { enabled: v })}>
            <RuleNum label="Days before expiry" value={form.expiryNotification?.daysBefore ?? 7}
              onChange={(v) => setIn('expiryNotification', { daysBefore: v })} />
          </RuleCheck>
        </RuleCard>
      </div>

      <div className="lvpolfoot">
        <span className="lvmuted">
          {/* Suspending is a policy edit like any other, so it only takes effect
              on save — the badge above says which way it is set. */}
          {form.isActive
            ? 'These rules decide what every worked day is worth.'
            : 'Comp Off is suspended — no new claims are accepted until it is switched back on.'}
        </span>
        <Button type="submit" loading={saving}>Save Policy</Button>
      </div>
    </form>
  );
}
