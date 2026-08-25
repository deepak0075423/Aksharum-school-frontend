import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import useFocusTarget, { useFocusFilterReset } from '../../hooks/useFocusTarget';
import { Table, Badge, Button, Modal, Spinner, Pagination, Empty } from '../../components/ui/index';

// Comp Off lives inside Leave Management — these two panels are mounted as
// tabs by pages/admin/Leave.jsx rather than being routed on their own.

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const todayStr = () => new Date().toISOString().slice(0, 10);

const STATUS_VARIANT = {
  draft: 'info', pending: 'warning', approved: 'success',
  rejected: 'danger', cancelled: 'muted', expired: 'muted',
};

const DAY_LABEL = {
  holiday: '🎉 Holiday', weekly_off: '🗓️ Weekly Off', sunday: '☀️ Sunday',
  working_day: '💼 Working Day', unknown: '❔ Unclassified',
};

const ENTRY_VARIANT = {
  EARNED: 'success', REVERSED: 'success', USED: 'info',
  EXPIRED: 'muted', CANCELLED: 'danger', ADJUSTMENT: 'warning',
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
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  // Following a notification: the server is told which request to show and
  // answers with the page holding it, instead of page 1 where it rarely is.
  const { focusId, release: releaseFocus } = useFocusTarget();
  const { data, loading, refetch } = useFetch(
    () => api.getCompOffRequests({
      page, limit: 20,
      status:      fStatus   || undefined,
      dayCategory: fCategory || undefined,
      source:      fSource   || undefined,
      fromDate:    fFrom     || undefined,
      toDate:      fTo       || undefined,
      focus:       focusId   || undefined,
    }),
    [page, fStatus, fCategory, fSource, fFrom, fTo, focusId],
  );

  const clearFilters = useCallback(() => {
    setFStatus(''); setFCategory(''); setFSource(''); setFFrom(''); setFTo(''); setPage(1);
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
  const [action, setAction] = useState(null);   // { type, request }
  const [comment, setComment] = useState('');
  const [actLoad, setActLoad] = useState(false);

  const runAction = async () => {
    setActLoad(true);
    try {
      const { type, request } = action;
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
      setAction(null); setComment(''); refetch();
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

  const columns = [
    { key: 'employee', label: 'Employee', render: r => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.teacher?.name || '—'}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.teacher?.email || ''}</div>
      </div>
    )},
    { key: 'workDate', label: 'Work Date', render: r => (
      <div>
        <div>{fmtDate(r.workDate)}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
          {DAY_LABEL[r.dayCategory] || r.dayCategory}{r.dayLabel ? ` · ${r.dayLabel}` : ''}
        </div>
      </div>
    )},
    { key: 'hours', label: 'Worked', render: r => (
      <div>
        <div>{r.workedHours ? `${r.workedHours} h` : '—'}</div>
        {(r.checkIn || r.checkOut) && (
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.checkIn || '—'} → {r.checkOut || '—'}</div>
        )}
      </div>
    )},
    { key: 'days', label: 'Comp Off', render: r => (
      <div>
        <strong>{r.compOffDays}</strong> day(s)
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
          {r.source === 'attendance' ? 'from attendance' : 'manual'}
        </div>
      </div>
    )},
    { key: 'status', label: 'Status', render: r => (
      <div>
        <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status === 'draft' ? 'ready to apply' : r.status}</Badge>
        {r.approvalsRequired > 1 && r.status === 'pending' && (
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            sign-off {r.approvalLevel || 0}/{r.approvalsRequired}
          </div>
        )}
      </div>
    )},
    { key: 'credit', label: 'Credited', render: r => (
      r.creditedDays > 0
        ? <div>
            <strong style={{ color: 'var(--success)' }}>{r.creditedDays}</strong>
            {r.expiresAt && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>expires {fmtDate(r.expiresAt)}</div>}
          </div>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>
    )},
    { key: 'reason', label: 'Reason', render: r => <span style={{ fontSize: '.82rem' }}>{r.reason || '—'}</span> },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 4 }}>
        {r.status === 'pending' && <>
          <button className="btn btn-success btn-sm" onClick={() => { setComment(''); setAction({ type: 'approve', request: r }); }}>Approve</button>
          <button className="btn btn-danger btn-sm"  onClick={() => { setComment(''); setAction({ type: 'reject',  request: r }); }}>Reject</button>
        </>}
        {r.status === 'approved' && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setComment(''); setAction({ type: 'cancel', request: r }); }}>Withdraw</button>
        )}
      </div>
    )},
  ];

  if (!loading && !enabled) return <NotConfigured reason={data?.reason} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div className="tabs" style={{ margin: 0 }}>
          {[['requests', 'Requests'], ['balances', 'Balances'], ['ledger', 'Ledger'], ['reports', 'Reports'], ['policy', 'Earning Policy']].map(([k, l]) => (
            <button key={k} className={`tab${sub === k ? ' active' : ''}`} onClick={() => setSub(k)}>{l}</button>
          ))}
        </div>
        {sub === 'requests' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setGenModal(true)}>Generate from Attendance</Button>
            <Button variant="secondary" onClick={handleExpiry} loading={expiryLoad}>Run Expiry</Button>
            <Button variant="secondary" onClick={handleExport} loading={exportLoad}>Export Excel</Button>
            <Button onClick={() => { setApplyForm(EMPTY_APPLY); setApplyModal(true); }}>+ Raise Comp Off</Button>
          </div>
        )}
      </div>

      {/* ── Requests ── */}
      {sub === 'requests' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ width: 150 }} value={fStatus} onChange={e => onFilter(setFStatus)(e.target.value)}>
              <option value="">All Statuses</option>
              {['draft', 'pending', 'approved', 'rejected', 'cancelled', 'expired'].map(s => (
                <option key={s} value={s}>{s === 'draft' ? 'ready to apply' : s}</option>
              ))}
            </select>
            <select className="form-control" style={{ width: 160 }} value={fCategory} onChange={e => onFilter(setFCategory)(e.target.value)}>
              <option value="">All Day Types</option>
              {Object.entries(DAY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="form-control" style={{ width: 150 }} value={fSource} onChange={e => onFilter(setFSource)(e.target.value)}>
              <option value="">All Sources</option>
              <option value="manual">Manual</option>
              <option value="attendance">From Attendance</option>
            </select>
            <input type="date" className="form-control" style={{ width: 160 }} value={fFrom} onChange={e => onFilter(setFFrom)(e.target.value)} />
            <input type="date" className="form-control" style={{ width: 160 }} value={fTo}   onChange={e => onFilter(setFTo)(e.target.value)} />
            {(fStatus || fCategory || fSource || fFrom || fTo) && (
              <button className="btn btn-secondary btn-sm" onClick={() => { releaseFocus(); clearFilters(); }}>Clear</button>
            )}
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <Table columns={columns} data={requests} loading={loading} emptyIcon="🕓" emptyTitle="No Comp Off requests" />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <Pagination page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} onPage={onPage} />
          </div>
        </div>
      )}

      {sub === 'balances'  && <CompOffBalances />}
      {sub === 'ledger'    && <CompOffLedger employees={employeeList} onChanged={refetch} />}
      {sub === 'reports'   && <CompOffReports />}
      {sub === 'policy'    && <AdminCompOffPolicy />}

      {/* ── Approve / Reject / Withdraw ── */}
      <Modal open={!!action} onClose={() => setAction(null)}
        title={action?.type === 'approve' ? 'Approve Comp Off'
             : action?.type === 'reject'  ? 'Reject Comp Off'
             : 'Withdraw approved Comp Off'}
        footer={<>
          <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          <Button variant={action?.type === 'approve' ? 'success' : 'danger'} onClick={runAction} loading={actLoad}>
            {action?.type === 'approve' ? 'Approve' : action?.type === 'reject' ? 'Reject' : 'Withdraw'}
          </Button>
        </>}>
        {action && (
          <div>
            <div style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '10px 14px', fontSize: '.85rem', marginBottom: 12 }}>
              <div><strong>{action.request.teacher?.name}</strong></div>
              <div>{fmtDate(action.request.workDate)} · {DAY_LABEL[action.request.dayCategory] || action.request.dayCategory}</div>
              <div>{action.request.workedHours ? `${action.request.workedHours} hour(s) worked · ` : ''}{action.request.compOffDays} day(s) claimed</div>
            </div>
            {action.type === 'approve' && (
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
function CompOffBalances() {
  const { data, loading } = useFetch(() => api.getCompOffBalances());
  const items  = data?.items  || [];
  const totals = data?.totals || {};

  const columns = [
    { key: 'employee', label: 'Employee', render: r => <strong>{r.teacher?.name || '—'}</strong> },
    { key: 'earned',   label: 'Earned',    render: r => r.earned },
    { key: 'carried',  label: 'Carried',   render: r => r.carried },
    { key: 'used',     label: 'Used',      render: r => r.used },
    { key: 'pending',  label: 'Pending',   render: r => r.pending },
    { key: 'expired',  label: 'Expired',   render: r => <span style={{ color: r.expired ? 'var(--danger)' : 'inherit' }}>{r.expired}</span> },
    { key: 'remaining',label: 'Remaining', render: r => <strong style={{ color: r.remaining > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{r.remaining}</strong> },
  ];

  if (loading) return <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (data?.enabled === false) return <NotConfigured reason={data.reason} />;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[['Earned', totals.earned, 'var(--primary)'], ['Used', totals.used, 'var(--text)'],
          ['Pending', totals.pending, 'var(--warning)'], ['Expired', totals.expired, 'var(--danger)'],
          ['Remaining', totals.remaining, 'var(--success)']].map(([label, val, color]) => (
          <div key={label} className="card"><div className="card-body" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{val ?? 0}</div>
            <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>{label}</div>
          </div></div>
        ))}
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={items} emptyIcon="📊" emptyTitle="No Comp Off balances yet" />
      </div></div>
    </div>
  );
}

// ── Ledger ──────────────────────────────────────────────────────────────────
function CompOffLedger({ employees = [], onChanged }) {
  const [teacherId, setTeacherId] = useState('');
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

  const columns = [
    { key: 'when', label: 'When', render: r => fmtDate(r.createdAt) },
    { key: 'employee', label: 'Employee', render: r => r.teacher?.name || '—' },
    { key: 'type', label: 'Entry', render: r => <Badge variant={ENTRY_VARIANT[r.entryType] || 'muted'}>{r.entryType}</Badge> },
    { key: 'delta', label: 'Days', render: r => (
      <strong style={{ color: r.delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
        {r.delta >= 0 ? '+' : ''}{r.delta}
      </strong>
    )},
    { key: 'balance', label: 'Balance After', render: r => r.balanceAfter },
    { key: 'lot', label: 'Lot', render: r => r.entryType === 'EARNED' || r.remainingDays > 0
      ? <span style={{ fontSize: '.78rem' }}>{r.remainingDays}/{r.days} left{r.expiresAt ? ` · exp ${fmtDate(r.expiresAt)}` : ''}</span>
      : '—' },
    { key: 'desc', label: 'Description', render: r => <span style={{ fontSize: '.82rem' }}>{r.description || '—'}</span> },
  ];

  if (data?.enabled === false) return <NotConfigured reason={data.reason} />;

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="form-control" style={{ width: 200 }} value={teacherId} onChange={e => { setTeacherId(e.target.value); setPage(1); }}>
          <option value="">All employees</option>
          {employees.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <select className="form-control" style={{ width: 160 }} value={entryType} onChange={e => { setEntryType(e.target.value); setPage(1); }}>
          <option value="">All entry types</option>
          {['EARNED', 'USED', 'EXPIRED', 'CANCELLED', 'REVERSED', 'ADJUSTMENT'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ marginLeft: 'auto' }}>
          <Button variant="secondary" onClick={() => setAdjModal(true)}>+ Adjustment</Button>
        </div>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={data?.entries || []} loading={loading} emptyIcon="📒" emptyTitle="No ledger entries" />
      </div>
      <div style={{ padding: '0 16px 16px' }}>
        <Pagination page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} onPage={onPage} />
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
    </div>
  );
}

// ── Reports ─────────────────────────────────────────────────────────────────
function CompOffReports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, loading } = useFetch(
    () => api.getCompOffReports({ fromDate: from || undefined, toDate: to || undefined }),
    [from, to],
  );

  if (loading) return <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (data?.enabled === false) return <NotConfigured reason={data.reason} />;

  const s = data?.summary || {};
  const columns = [
    { key: 'employee', label: 'Employee', render: r => r.teacher?.name || '—' },
    { key: 'workDate', label: 'Work Date', render: r => fmtDate(r.workDate) },
    { key: 'day', label: 'Day Type', render: r => DAY_LABEL[r.dayCategory] || r.dayCategory },
    { key: 'days', label: 'Claimed', render: r => r.compOffDays },
    { key: 'credited', label: 'Credited', render: r => r.creditedDays || 0 },
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status}</Badge> },
  ];

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" className="form-control" style={{ width: 160 }} value={from} onChange={e => setFrom(e.target.value)} />
          <input type="date" className="form-control" style={{ width: 160 }} value={to}   onChange={e => setTo(e.target.value)} />
          {(from || to) && <button className="btn btn-secondary btn-sm" onClick={() => { setFrom(''); setTo(''); }}>Clear</button>}
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{s.total || 0}</div><div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>Total requests</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{s.daysEarned || 0}</div><div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>Days credited</div></div>
            {Object.entries(s.byStatus || {}).map(([k, v]) => (
              <div key={k}><div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{v}</div><div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>{k}</div></div>
            ))}
          </div>
          {Object.keys(s.byCategory || {}).length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.85rem' }}>
              {Object.entries(s.byCategory).map(([k, v]) => (
                <span key={k}>{DAY_LABEL[k] || k}: <strong>{v}</strong></span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={data?.requests || []} emptyIcon="📈" emptyTitle="No Comp Off in this period" />
      </div></div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Comp Off Policy — every rule the engine reads, nothing hard-coded
// ════════════════════════════════════════════════════════════════════════════

// Defined at module scope on purpose: a component declared inside the policy
// render would be a new type on every keystroke, so React would remount the
// input and the field would lose focus after each character.
const PolicyNum = ({ label, value, onChange, hint, step = 1 }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
    <input type="number" className="form-control" min={0} step={step} value={value ?? 0}
      onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    {hint && <div className="form-hint">{hint}</div>}
  </div>
);

const PolicyToggle = ({ label, checked, onChange, hint }) => (
  <div className="form-group">
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
    {hint && <div className="form-hint" style={{ marginLeft: 24 }}>{hint}</div>}
  </div>
);

const PolicySection = ({ title, note, children }) => (
  <div className="card" style={{ marginBottom: 16 }}>
    <div className="card-header"><h2 style={{ fontSize: '.95rem' }}>{title}</h2></div>
    <div className="card-body">
      {note && <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', marginTop: 0 }}>{note}</p>}
      {children}
    </div>
  </div>
);

export function AdminCompOffPolicy() {
  const { data, loading, refetch } = useFetch(() => api.getCompOffPolicy());
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data?.policy) setForm(data.policy); }, [data]);

  const set   = useCallback((patch) => setForm(f => ({ ...f, ...patch })), []);
  const setIn = useCallback((key, patch) => setForm(f => ({ ...f, [key]: { ...f[key], ...patch } })), []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateCompOffPolicy(form);
      toast.success('Comp Off policy saved');
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  if (loading || !form) return <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;

  const designations = data?.designations || [];
  const modules = data?.modules || {};

  // Plain references, not freshly-declared components — the element type has to
  // stay stable across renders or every field would remount as you type.
  const Toggle  = PolicyToggle;
  const Section = PolicySection;
  const numProps = (k) => ({ value: form[k], onChange: (v) => set({ [k]: v }) });

  return (
    <form onSubmit={save}>
      {!data?.enabled && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <strong>Comp Off is not active.</strong> {data?.reason}
        </div>
      )}
      {data?.enabled && (
        <div className="alert alert-info" style={{ marginBottom: 16, fontSize: '.85rem' }}>
          Active Comp Off leave type: <strong>{data.leaveType?.name} ({data.leaveType?.code})</strong>.
          Holiday module {modules.holiday ? 'ON' : 'OFF'} · Attendance module {modules.attendance ? 'ON' : 'OFF'}.
          {!modules.holiday && ' Without the holiday module, work dates cannot be classified automatically — claims are judged manually.'}
          {!modules.attendance && ' Without the attendance module, Comp Off requests must be raised by hand.'}
        </div>
      )}

      <Section title="Eligible employees" note="Leave the designation list empty to allow everyone.">
        <div className="form-group">
          <label className="form-label">Eligible designations</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {designations.map(d => (
              <label key={d} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={(form.eligibleDesignations || []).includes(d)}
                  onChange={e => set({
                    eligibleDesignations: e.target.checked
                      ? [...(form.eligibleDesignations || []), d]
                      : (form.eligibleDesignations || []).filter(x => x !== d),
                  })} />
                {d}
              </label>
            ))}
            {!designations.length && <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>No designations configured</span>}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Eligible roles</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[['teacher', 'Teachers'], ['school_admin', 'School Admins']].map(([k, l]) => (
              <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={(form.eligibleRoles || []).includes(k)}
                  onChange={e => set({
                    eligibleRoles: e.target.checked
                      ? [...(form.eligibleRoles || []), k]
                      : (form.eligibleRoles || []).filter(x => x !== k),
                  })} />
                {l}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Working hours" note="How many hours on the work date turn into how much Comp Off.">
        <div className="form-row form-row-3">
          <PolicyNum label="Minimum working hours" {...numProps('minWorkingHours')} step={0.5} hint="Below this, nothing is earned" />
          <PolicyNum label="Half-day hours"        {...numProps('halfDayHours')}    step={0.5} hint="At or above this → 0.5 day" />
          <PolicyNum label="Full-day hours"        {...numProps('fullDayHours')}    step={0.5} hint="At or above this → 1 day" />
        </div>
      </Section>

      <Section title="Eligible days">
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {[['holiday', 'Holiday'], ['weeklyOff', 'Weekly Off'], ['sunday', 'Sunday']].map(([k, l]) => (
            <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.eligibleDays?.[k]}
                onChange={e => setIn('eligibleDays', { [k]: e.target.checked })} />
              {l}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Toggle label="Allow Comp Off for regular working days" checked={form.allowWorkingDays}
            onChange={v => set({ allowWorkingDays: v })}
            hint="Off by default — an ordinary working day is just attendance" />
        </div>
      </Section>

      <Section title="Application window and limits" note="0 means no limit.">
        <div className="form-row form-row-3">
          <PolicyNum label="Apply within (days after working)" {...numProps('applyWithinDays')} />
          <PolicyNum label="Max Comp Off earned per month"     {...numProps('maxPerMonth')} step={0.5} />
          <PolicyNum label="Max Comp Off earned per year"      {...numProps('maxPerYear')} step={0.5} />
        </div>
        <div className="form-row form-row-3">
          <PolicyNum label="Validity / expiry (days)" {...numProps('validityDays')} hint="Credited days lapse after this many days" />
        </div>
      </Section>

      <Section title="Carry forward">
        <Toggle label="Carry unused Comp Off into the next academic year"
          checked={form.carryForward?.enabled} onChange={v => setIn('carryForward', { enabled: v })} />
        {form.carryForward?.enabled && (
          <div className="form-group" style={{ maxWidth: 240 }}>
            <label className="form-label">Max days to carry forward</label>
            <input type="number" className="form-control" min={0} step="0.5" value={form.carryForward?.maxDays ?? 0}
              onChange={e => setIn('carryForward', { maxDays: Number(e.target.value) })} />
            <div className="form-hint">0 = carry everything remaining</div>
          </div>
        )}
      </Section>

      <Section title="Claiming" note="Spending comp off as leave is configured under Leave → Policies, like every other leave type.">
        <Toggle label="Half-day Comp Off can be earned" checked={form.halfDayAllowed} onChange={v => set({ halfDayAllowed: v })}
          hint="Whether a part-day of work earns half a day" />
        <Toggle label="Advance Comp Off allowed" checked={form.advanceCompOffAllowed} onChange={v => set({ advanceCompOffAllowed: v })}
          hint="Lets employees claim before the work date has passed" />
      </Section>

      <Section title="Approval workflow">
        <div className="form-group" style={{ maxWidth: 280 }}>
          <label className="form-label">Who approves</label>
          <select className="form-control" value={form.approval?.mode || 'admin'}
            onChange={e => setIn('approval', { mode: e.target.value })}>
            <option value="admin">School admins only</option>
            <option value="designation">Specific designations only</option>
            <option value="both">Admins or specific designations</option>
          </select>
        </div>
        {form.approval?.mode !== 'admin' && (
          <div className="form-group">
            <label className="form-label">Approver designations</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {designations.map(d => (
                <label key={d} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={(form.approval?.approverDesignations || []).includes(d)}
                    onChange={e => setIn('approval', {
                      approverDesignations: e.target.checked
                        ? [...(form.approval?.approverDesignations || []), d]
                        : (form.approval?.approverDesignations || []).filter(x => x !== d),
                    })} />
                  {d}
                </label>
              ))}
            </div>
          </div>
        )}
        <Toggle label="Require two sign-offs before crediting" checked={form.approval?.twoLevel}
          onChange={v => setIn('approval', { twoLevel: v })}
          hint="The second approver must be a different person; nothing is credited until both have signed" />
      </Section>

      <Section title="Automation and notifications">
        <Toggle label="Auto-create ready-to-apply Comp Off from approved attendance"
          checked={form.autoGenerateFromAttendance} onChange={v => set({ autoGenerateFromAttendance: v })}
          hint={modules.attendance
            ? 'When attendance lands on an eligible day, the employee gets a pre-filled draft to review and apply'
            : 'Requires the attendance module — currently off for this school'} />
        <Toggle label="Notify employees before their Comp Off expires"
          checked={form.expiryNotification?.enabled} onChange={v => setIn('expiryNotification', { enabled: v })} />
        {form.expiryNotification?.enabled && (
          <div className="form-group" style={{ maxWidth: 240 }}>
            <label className="form-label">Days before expiry</label>
            <input type="number" className="form-control" min={0} value={form.expiryNotification?.daysBefore ?? 7}
              onChange={e => setIn('expiryNotification', { daysBefore: Number(e.target.value) })} />
          </div>
        )}
        <Toggle label="Comp Off is active" checked={form.isActive} onChange={v => set({ isActive: v })}
          hint="Turning this off suspends Comp Off without deleting the leave type or any history" />
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button type="submit" loading={saving}>Save Policy</Button>
      </div>
    </form>
  );
}
