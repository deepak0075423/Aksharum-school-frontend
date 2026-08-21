import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner, Pagination } from '../../components/ui/index';
import { AdminCompOff, AdminCompOffPolicy } from './CompOff';
import AdminLeavePolicies from './LeavePolicies';
import { leaveDateBounds, leaveDateHint } from '../../utils/leaveDates';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_VARIANT = {
  pending: 'warning', approved: 'success', rejected: 'danger',
  cancelled: 'muted', modification_requested: 'info',
};

// Identity and entitlement only — every rule lives in the type's LeavePolicy
const EMPTY_TYPE = {
  name: '', code: '', category: 'general', annualAllocation: 12, isActive: true,
};

const EMPTY_APPLY = { teacherId: '', leaveTypeId: '', fromDate: '', toDate: '', leaveMode: 'full_day', reason: '' };
const EMPTY_ALLOC = {
  teacherMode: 'all',        // 'all' | 'select' | 'except'
  checkedTeachers: [],       // 'select': included ids  |  'except': excluded ids
  leaveTypeId: '',
  giveFullAllocation: true,
  useProration: false,
  overrideDays: '',
};

const EMPTY_CLEAR = { teacherMode: 'all', checkedTeachers: [], leaveTypeId: '' };

function computeProration(annualAllocation, activeAY) {
  if (!activeAY?.startDate || !activeAY?.endDate || !annualAllocation) return annualAllocation;
  const now   = new Date();
  const end   = new Date(activeAY.endDate);
  const start = new Date(activeAY.startDate);
  if (now <= start) return annualAllocation;
  if (now >= end)   return 0;
  const totalMs  = end - start;
  const remainMs = end - now;
  return Math.max(1, Math.ceil(annualAllocation * remainMs / totalMs));
}

// Explains, in one line, why the charged day count differs from the number of
// calendar days the admin picked.
function describeDayCount(days) {
  if (days.sandwiched)
    return 'Sandwich rule is on for this type — every calendar day in the range is charged, weekly offs and holidays included.';
  const skipped = [
    // Fractional when the school counts Saturday as a half day — so this is
    // labelled by what it is (time not worked), not as whole days off.
    days.weeklyOffDays > 0 && `${days.weeklyOffDays} non-working day(s) — weekly offs`,
    days.holidayDays   > 0 && `${days.holidayDays} school holiday(s)`,
  ].filter(Boolean);
  return skipped.length
    ? `Not charged: ${skipped.join(', ')}.`
    : 'No weekly offs or holidays fall in this range.';
}

// Carry-forward almost always runs "the year that just ended" into "the year
// now open", so that is what the pickers open on.
function defaultCarryForward(years) {
  if (!years?.length) return { fromYear: '', toYear: '' };
  const activeIdx = years.findIndex(y => y.status === 'active');
  const toIdx     = activeIdx > 0 ? activeIdx : years.length - 1;
  return {
    fromYear: toIdx > 0 ? years[toIdx - 1].label : '',
    toYear:   years[toIdx].label,
  };
}

function downloadBuffer(data, filename) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminLeave() {
  const [tab, setTab] = useState('requests');

  // ── Requests ─────────────────────────────────────────────────────────────────
  const [reqPage,      setReqPage]      = useState(1);
  const [reqStatus,    setReqStatus]    = useState('');
  const [reqTeacher,   setReqTeacher]   = useState('');
  const [reqLeaveType, setReqLeaveType] = useState('');
  const [reqFromDate,  setReqFromDate]  = useState('');
  const [reqToDate,    setReqToDate]    = useState('');
  const [actionModal, setActionModal] = useState(null); // { type, request }
  const [comment,   setComment]   = useState('');
  const [actLoad,   setActLoad]   = useState(false);

  const { data: reqData, loading: reqLoading, refetch: refetchReq } = useFetch(
    () => api.getLeaveRequests({
      page: reqPage, limit: 20,
      status:    reqStatus    || undefined,
      teacherId: reqTeacher   || undefined,
      leaveType: reqLeaveType || undefined,
      fromDate:  reqFromDate  || undefined,
      toDate:    reqToDate    || undefined,
    }),
    [reqPage, reqStatus, reqTeacher, reqLeaveType, reqFromDate, reqToDate],
  );

  const { data: teachers } = useFetch(() => api.getTeachers({ limit: 500 }));
  const teacherList = teachers?.data || [];

  const handleAction = async () => {
    if (!actionModal) return;
    setActLoad(true);
    try {
      const { type, request } = actionModal;
      if (type === 'approve')   await api.approveLeave(request._id, { adminComment: comment });
      else if (type === 'reject')  await api.rejectLeave(request._id, { adminComment: comment });
      else if (type === 'modify')  await api.requestLeaveModification(request._id, { adminComment: comment });
      else if (type === 'reverse') await api.reverseApprovedLeave(request._id, { adminComment: comment });
      toast.success(type === 'approve' ? 'Leave approved'
        : type === 'reject'  ? 'Leave rejected'
        : type === 'reverse' ? `Leave reversed — ${request.totalDays} day(s) restored`
        : 'Modification requested');
      setActionModal(null); setComment('');
      refetchReq();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setActLoad(false); }
  };

  // ── Apply leave (admin on behalf of teacher) ──────────────────────────────────
  const [applyModal, setApplyModal] = useState(false);
  const [applyForm,  setApplyForm]  = useState(EMPTY_APPLY);
  const [applyLoad,  setApplyLoad]  = useState(false);
  const applyDocRef = useRef();

  // Live answer to "how many days does this teacher have left of this type, and
  // what will these dates cost?" — computed server-side by the same helpers the
  // submit uses, so the figure shown is the figure that gets charged.
  const [preview,     setPreview]     = useState(null);
  const [previewLoad, setPreviewLoad] = useState(false);

  useEffect(() => {
    if (!applyModal || !applyForm.teacherId || !applyForm.leaveTypeId) { setPreview(null); return; }
    // Guard against a slow early request landing after a faster later one and
    // painting a stale balance over the current selection.
    let live = true;
    setPreviewLoad(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.getLeaveApplyPreview({
          teacherId:   applyForm.teacherId,
          leaveTypeId: applyForm.leaveTypeId,
          fromDate:    applyForm.fromDate || undefined,
          toDate:      applyForm.toDate   || undefined,
          leaveMode:   applyForm.leaveMode,
        });
        if (live) setPreview(res?.data ?? res);
      } catch { if (live) setPreview(null); }
      finally { if (live) setPreviewLoad(false); }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [applyModal, applyForm.teacherId, applyForm.leaveTypeId, applyForm.fromDate, applyForm.toDate, applyForm.leaveMode]);

  const closeApply = () => {
    setApplyModal(false); setApplyForm(EMPTY_APPLY); setPreview(null);
    if (applyDocRef.current) applyDocRef.current.value = '';
  };

  const handleApply = async (e) => {
    e.preventDefault();
    setApplyLoad(true);
    try {
      const fd = new FormData();
      fd.append('teacherId',   applyForm.teacherId);
      fd.append('leaveTypeId', applyForm.leaveTypeId);
      fd.append('fromDate',    applyForm.fromDate);
      fd.append('toDate',      applyForm.toDate);
      fd.append('leaveMode',   applyForm.leaveMode);
      fd.append('reason',      applyForm.reason);
      if (applyDocRef.current?.files?.[0]) fd.append('document', applyDocRef.current.files[0]);
      await api.adminApplyLeave(fd);
      toast.success('Leave applied');
      closeApply();
      refetchReq();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setApplyLoad(false); }
  };

  const reqColumns = [
    { key: 'teacher',  label: 'Teacher',  render: r => <div><div style={{ fontWeight: 600 }}>{r.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.teacher?.employeeId || ''}</div></div> },
    { key: 'type',     label: 'Type',     render: r => r.leaveType?.name || '—' },
    { key: 'dates',    label: 'Period',   render: r => <div><div>{fmtDate(r.fromDate)} – {fmtDate(r.toDate)}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.totalDays} day(s) · {r.leaveMode?.replace('_', ' ')}</div></div> },
    { key: 'status',   label: 'Status',   render: r => <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status?.replace('_', ' ')}</Badge> },
    { key: 'reason',   label: 'Reason',   render: r => <span style={{ fontSize: '.82rem' }}>{r.reason || '—'}</span> },
    { key: 'doc',      label: 'Doc',      render: r => r.document ? <a href={`/uploads/leave-docs/${r.document}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>📎 View</a> : '—' },
    { key: 'actions',  label: '',         render: r => {
      if (r.status === 'pending' || r.status === 'modification_requested') return (
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-success btn-sm" onClick={() => { setComment(''); setActionModal({ type: 'approve', request: r }); }}>Approve</button>
          <button className="btn btn-danger btn-sm"  onClick={() => { setComment(''); setActionModal({ type: 'reject',  request: r }); }}>Reject</button>
          {r.status === 'pending' && <button className="btn btn-secondary btn-sm" onClick={() => { setComment(''); setActionModal({ type: 'modify', request: r }); }}>Modify</button>}
        </div>
      );
      // Undoing an approval is the only way to hand the days back — and the
      // Comp Off screen refuses to withdraw a credit until the leave that spent
      // it has been reversed here.
      if (r.status === 'approved') return (
        <button className="btn btn-secondary btn-sm" onClick={() => { setComment(''); setActionModal({ type: 'reverse', request: r }); }}>Reverse</button>
      );
      return null;
    }},
  ];

  // ── Leave Types ───────────────────────────────────────────────────────────────
  const [typeModal, setTypeModal] = useState(false);
  const [editType,  setEditType]  = useState(null);
  const [typeForm,  setTypeForm]  = useState(EMPTY_TYPE);
  const [typeLoad,  setTypeLoad]  = useState(false);
  const [delType,   setDelType]   = useState(null);
  const [delLoad,   setDelLoad]   = useState(false);
  const [delImpact, setDelImpact] = useState(null);   // what the delete would wipe
  const [impactLoad, setImpactLoad] = useState(false);
  const { data: typesData, refetch: refetchTypes } = useFetch(api.getLeaveTypes);
  const leaveTypes = typesData || [];

  // Refetch fresh data whenever the user switches to a tab.
  //
  // `leaveTypes` carries each type's *effective* policy — accrual, carry forward
  // and the back-dating rules are merged into it server-side — so it goes stale
  // the moment a policy is saved on the Policies tab. Every tab that reads a
  // rule from it therefore refetches it, not just the Leave Types tab; without
  // that, the Allocate and Apply forms kept showing the pre-save rules until a
  // full page reload.
  useEffect(() => {
    if (tab === 'types')       refetchTypes();
    if (tab === 'requests')  { refetchReq();   refetchTypes(); }
    if (tab === 'allocations') { refetchAlloc(); refetchTypes(); }
    if (tab === 'balance')   { refetchAlloc(); refetchTypes(); }
  }, [tab]);

  const openCreateType = () => { setTypeForm(EMPTY_TYPE); setEditType(null); setTypeModal(true); };
  const openEditType   = (t) => {
    setTypeForm({
      name: t.name, code: t.code, category: t.category || 'general',
      annualAllocation: t.annualAllocation,
      isActive: t.isActive !== false,
    });
    setEditType(t); setTypeModal(true);
  };

  const handleSaveType = async (e) => {
    e.preventDefault();
    setTypeLoad(true);
    try {
      if (editType) await api.updateLeaveType(editType._id, typeForm);
      else          await api.createLeaveType(typeForm);
      toast.success(editType ? 'Leave type updated' : 'Leave type saved');
      setTypeModal(false); refetchTypes();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
    finally { setTypeLoad(false); }
  };

  // Deleting a type wipes every teacher's allocation of it, so the popup asks
  // the server what would go first and lists it before anything is removed.
  const openDeleteType = async (t) => {
    setDelType(t); setDelImpact(null); setImpactLoad(true);
    try {
      const res = await api.getLeaveTypeImpact(t._id);
      setDelImpact(res?.data ?? res);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
      setDelType(null);
    } finally { setImpactLoad(false); }
  };

  const handleDeleteType = async () => {
    setDelLoad(true);
    try {
      const res = await api.deleteLeaveType(delType._id);
      const wiped = res?.deleted?.allocations || 0;
      toast.success(wiped
        ? `Leave type deleted — ${wiped} allocation(s) removed`
        : 'Leave type deleted');
      setDelType(null); setDelImpact(null); refetchTypes(); refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setDelLoad(false); }
  };

  const typeColumns = [
    { key: 'name',  label: 'Leave Type', render: t => (
      <div>
        <strong>{t.name}</strong>
        {t.category === 'compoff' && <Badge variant="info">Comp Off</Badge>}
      </div>
    )},
    { key: 'code',  label: 'Code',       render: t => <code style={{ background: 'var(--bg-muted)', padding: '2px 6px', borderRadius: 4 }}>{t.code}</code> },
    { key: 'alloc', label: 'Annual',     render: t => t.category === 'compoff' ? 'earned on approval' : `${t.annualAllocation} days` },
    { key: 'status',label: 'Status',     render: t => <Badge variant={t.isActive ? 'success' : 'muted'}>{t.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', label: '', render: t => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => openEditType(t)}>Edit</button>
        <button className="btn btn-danger btn-sm"    onClick={() => openDeleteType(t)}>Delete</button>
      </div>
    )},
  ];

  // ── Allocations ───────────────────────────────────────────────────────────────
  const [allocModal,  setAllocModal]  = useState(false);
  const [allocForm,   setAllocForm]   = useState(EMPTY_ALLOC);
  const [allocLoad,   setAllocLoad]   = useState(false);
  const [accrualLoad, setAccrualLoad] = useState(false);
  const [cfModal,     setCfModal]     = useState(false);
  const [cfForm,      setCfForm]      = useState({ fromYear: '', toYear: '' });
  const [cfLoad,      setCfLoad]      = useState(false);
  const [importLoad,      setImportLoad]      = useState(false);
  const [allocImportModal, setAllocImportModal] = useState(false);
  const allocFileRef  = useRef();
  const { data: allocData, meta: allocMeta, refetch: refetchAlloc } = useFetch(api.getLeaveAllocations);
  const allocations = allocData || [];

  // Academic years ride along with the allocations payload — that endpoint is
  // behind the leave guard, while /admin/academic-years needs full admin, so a
  // designation-based leave admin would otherwise see empty year pickers.
  const academicYears = allocMeta?.academicYears || [];
  const activeAY = academicYears.find(ay => ay.status === 'active');

  const handleAllocate = async (e) => {
    e.preventDefault();
    if (allocForm.teacherMode === 'select' && !allocForm.checkedTeachers.length) {
      toast.error('Select at least one teacher'); return;
    }
    setAllocLoad(true);
    try {
      const payload = {
        teacherIds:          allocForm.teacherMode === 'select' ? allocForm.checkedTeachers : 'all',
        excludeIds:          allocForm.teacherMode === 'except' ? allocForm.checkedTeachers : [],
        leaveTypeId:         allocForm.leaveTypeId,
        giveFullAllocation:  allocForm.giveFullAllocation,
        useProration:        allocForm.useProration,
        overrideDays:        allocForm.overrideDays !== '' ? Number(allocForm.overrideDays) : undefined,
      };
      const res = await api.allocateLeave(payload);
      toast.success(res?.message || 'Leave allocated');
      setAllocModal(false); setAllocForm(EMPTY_ALLOC); refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setAllocLoad(false); }
  };

  // ── Clear allocation ──────────────────────────────────────────────────────────
  // Zeroes the allocation without erasing history: used and pending stay put,
  // so leave already taken still reconciles.
  const [clearModal, setClearModal] = useState(false);
  const [clearForm,  setClearForm]  = useState(EMPTY_CLEAR);
  const [clearLoad,  setClearLoad]  = useState(false);

  const handleClearAllocations = async () => {
    setClearLoad(true);
    try {
      const res = await api.clearLeaveAllocations({
        teacherIds: clearForm.teacherMode === 'select' ? clearForm.checkedTeachers : 'all',
        excludeIds: clearForm.teacherMode === 'except' ? clearForm.checkedTeachers : [],
        leaveTypeId: clearForm.leaveTypeId,
      });
      toast.success(res?.message || 'Allocation cleared');
      setClearModal(false); setClearForm(EMPTY_CLEAR); refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setClearLoad(false); }
  };

  const handleRunAccrual = async () => {
    setAccrualLoad(true);
    try {
      const res = await api.runLeaveAccrual();
      toast.success(res?.message || `Accrual complete — ${res?.credited || 0} updated`);
      refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setAccrualLoad(false); }
  };

  const handleCarryForward = async (e) => {
    e.preventDefault();
    setCfLoad(true);
    try {
      const res = await api.runCarryForward(cfForm);
      toast.success(`Carry-forward complete. ${res?.data?.processed || 0} balances updated`);
      setCfModal(false); setCfForm({ fromYear: '', toYear: '' }); refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setCfLoad(false); }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.downloadAllocationTemplate();
      downloadBuffer(res?.data ?? res, 'leave_allocation_template.xlsx');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const handleBulkImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImportLoad(true);
    try {
      const fd = new FormData(); fd.append('excelFile', file);
      const res = await api.bulkAllocateLeaveExcel(fd);
      toast.success(`Imported. Updated: ${res?.updated ?? 0}${res?.errors?.length ? `, Errors: ${res.errors.length}` : ''}`);
      setAllocImportModal(false);
      refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setImportLoad(false); e.target.value = ''; }
  };


  // ── Detail popups & filters ───────────────────────────────────────────────────
  const [detailModal,    setDetailModal]    = useState(null); // { teacher, ay, balances }
  const [repDetailModal, setRepDetailModal] = useState(null); // { teacher, apps }
  const [allocFilter,    setAllocFilter]    = useState({ teacher: '', leaveType: '' });

  // ── Reports ───────────────────────────────────────────────────────────────────
  const [repStatus, setRepStatus] = useState('');
  const [exportLoad,      setExportLoad]      = useState(false);
  const [reqExportLoad,   setReqExportLoad]   = useState(false);
  const [allocExportLoad, setAllocExportLoad] = useState(false);
  const { data: repData, loading: repLoading } = useFetch(
    () => api.getLeaveReports({ status: repStatus || undefined }),
    [repStatus],
  );

  const handleExport = async () => {
    setExportLoad(true);
    try {
      const res = await api.exportLeaveReports({ status: repStatus || undefined });
      downloadBuffer(res?.data ?? res, 'leave_report.xlsx');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setExportLoad(false); }
  };

  const handleExportRequests = async () => {
    setReqExportLoad(true);
    try {
      const res = await api.exportLeaveRequests({
        status:    reqStatus    || undefined,
        teacherId: reqTeacher   || undefined,
        leaveType: reqLeaveType || undefined,
        fromDate:  reqFromDate  || undefined,
        toDate:    reqToDate    || undefined,
      });
      downloadBuffer(res?.data ?? res, 'leave_requests.xlsx');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setReqExportLoad(false); }
  };

  const handleExportAllocations = async () => {
    setAllocExportLoad(true);
    try {
      const res = await api.exportLeaveAllocations();
      downloadBuffer(res?.data ?? res, 'leave_allocations.xlsx');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setAllocExportLoad(false); }
  };


  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <PageHeader title="Leave Management" subtitle="Manage leave types, requests, and allocations"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'requests' && <>
              <Button variant="secondary" onClick={handleExportRequests} loading={reqExportLoad}>Export Excel</Button>
              <Button onClick={() => { setApplyForm(EMPTY_APPLY); setPreview(null); setApplyModal(true); }}>+ Apply Leave</Button>
            </>}
            {tab === 'types'    && <Button onClick={openCreateType}>+ Add Type</Button>}
            {tab === 'allocations' && (
              <>
                <Button variant="secondary" onClick={() => setAllocImportModal(true)}>Import Excel</Button>
                <Button variant="secondary" onClick={() => { setCfForm(defaultCarryForward(academicYears)); setCfModal(true); }}>Carry Forward</Button>
                <Button variant="secondary" onClick={handleExportAllocations} loading={allocExportLoad}>Export Excel</Button>
                <Button variant="secondary" onClick={handleRunAccrual} loading={accrualLoad}>Run Accrual</Button>
                <Button variant="danger" onClick={() => { setClearForm(EMPTY_CLEAR); setClearModal(true); }}>Clear Allocation</Button>
                <Button onClick={() => { setAllocForm(EMPTY_ALLOC); setAllocModal(true); }}>+ Allocate</Button>
              </>
            )}
            {tab === 'balance' && (
              <Button variant="secondary" onClick={handleExportAllocations} loading={allocExportLoad}>Export Excel</Button>
            )}
            {tab === 'reports' && <Button onClick={handleExport} loading={exportLoad}>Export Excel</Button>}
          </div>
        }
      />

      <div className="tabs">
        {[['requests','Requests'],['types','Leave Types'],['policies','Policies'],['allocations','Allocations'],
          ['balance','Balance Summary'],['compoff','Comp Off'],['reports','Reports']].map(([key, label]) => (
          <button key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* ── Comp Off (requests · balances · ledger · reports) ── */}
      {tab === 'compoff'  && <AdminCompOff />}

      {/* ── Policies — one configurable rule set per leave type ── */}
      {/* A saved policy changes the rules the other tabs render from, so the
          merged type list is pulled again the moment it is written. */}
      {tab === 'policies' && <AdminLeavePolicies onSaved={() => { refetchTypes(); refetchAlloc(); }} />}

      {/* ── Requests ── */}
      {tab === 'requests' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ width: 150 }} value={reqStatus} onChange={e => { setReqStatus(e.target.value); setReqPage(1); }}>
              <option value="">All Statuses</option>
              {['pending','approved','rejected','cancelled','modification_requested'].map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            <select className="form-control" style={{ width: 160 }} value={reqTeacher} onChange={e => { setReqTeacher(e.target.value); setReqPage(1); }}>
              <option value="">All Teachers</option>
              {teacherList.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
            <select className="form-control" style={{ width: 150 }} value={reqLeaveType} onChange={e => { setReqLeaveType(e.target.value); setReqPage(1); }}>
              <option value="">All Types</option>
              {leaveTypes.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
            <input type="date" className="form-control" style={{ width: 140 }} value={reqFromDate}
              onChange={e => { setReqFromDate(e.target.value); setReqPage(1); }} title="From date" />
            <input type="date" className="form-control" style={{ width: 140 }} value={reqToDate}
              onChange={e => { setReqToDate(e.target.value); setReqPage(1); }} title="To date" />
            {(reqStatus || reqTeacher || reqLeaveType || reqFromDate || reqToDate) && (
              <button className="btn btn-secondary btn-sm" onClick={() => {
                setReqStatus(''); setReqTeacher(''); setReqLeaveType('');
                setReqFromDate(''); setReqToDate(''); setReqPage(1);
              }}>Clear</button>
            )}
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {reqLoading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={reqColumns} data={reqData || []} emptyIcon="🏖️" emptyTitle="No leave requests" />}
          </div>
          {reqData?.pages > 1 && (
            <div className="card-footer">
              <Pagination page={reqPage} pages={reqData.pages} total={reqData.total} onPage={setReqPage} />
            </div>
          )}
        </div>
      )}

      {/* ── Leave Types ── */}
      {tab === 'types' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <Table columns={typeColumns} data={leaveTypes} emptyIcon="📋" emptyTitle="No leave types yet" />
          </div>
        </div>
      )}

      {/* ── Allocations (one row per teacher, inline leave types) ── */}
      {tab === 'allocations' && (() => {
        const filtered = (allocations || []).filter(a => {
          if (allocFilter.teacher   && a.teacher?._id?.toString()   !== allocFilter.teacher)   return false;
          if (allocFilter.leaveType && a.leaveType?._id?.toString() !== allocFilter.leaveType) return false;
          return true;
        });
        const tmap = {}; const torder = [];
        filtered.forEach(a => {
          const tid = a.teacher?._id?.toString() || 'unknown';
          if (!tmap[tid]) { tmap[tid] = { teacher: a.teacher, ay: a.academicYear, balances: [] }; torder.push(tid); }
          tmap[tid].balances.push(a);
        });
        const groups = torder.map(tid => tmap[tid]);

        const inlineNums = (balances, field) => (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {balances.map(b => (
              <span key={b.leaveType?._id} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>
                <strong>{b.leaveType?.code}</strong>: {b[field] || 0}
              </span>
            ))}
          </div>
        );

        const cols = [
          { key: 'teacher',   label: 'Teacher',    render: g => <div><div style={{ fontWeight: 600 }}>{g.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{g.teacher?.employeeId || ''}</div></div> },
          { key: 'allocated', label: 'Allocated',  render: g => inlineNums(g.balances, 'totalAllocated') },
          { key: 'cf',        label: 'Carry Fwd',  render: g => inlineNums(g.balances, 'carriedForward') },
          { key: 'used',      label: 'Used',       render: g => inlineNums(g.balances, 'used') },
          { key: 'remaining', label: 'Remaining',  render: g => (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {g.balances.map(b => {
                const rem = Math.max(0, (b.totalAllocated||0)+(b.carriedForward||0)-(b.used||0)-(b.pending||0));
                return (
                  <span key={b.leaveType?._id} style={{ fontSize: '.82rem', fontWeight: 600, whiteSpace: 'nowrap', color: rem > 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {b.leaveType?.code}: {rem}
                  </span>
                );
              })}
            </div>
          )},
          { key: 'ay',      label: 'Year',    render: g => g.ay || '—' },
          { key: 'actions', label: '',        render: g => <button className="btn btn-secondary btn-sm" onClick={() => setDetailModal(g)}>Details</button> },
        ];

        return (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="form-control" style={{ width: 180 }} value={allocFilter.teacher} onChange={e => setAllocFilter(f => ({ ...f, teacher: e.target.value }))}>
                <option value="">All Teachers</option>
                {teacherList.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              <select className="form-control" style={{ width: 160 }} value={allocFilter.leaveType} onChange={e => setAllocFilter(f => ({ ...f, leaveType: e.target.value }))}>
                <option value="">All Leave Types</option>
                {leaveTypes.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              {(allocFilter.teacher || allocFilter.leaveType) && (
                <button className="btn btn-secondary btn-sm" onClick={() => setAllocFilter({ teacher: '', leaveType: '' })}>Clear</button>
              )}
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <Table columns={cols} data={groups} emptyIcon="📊" emptyTitle="No allocations found" />
            </div>
          </div>
        );
      })()}

      {/* ── Balance Summary (one row per teacher, inline remaining) ── */}
      {tab === 'balance' && (() => {
        const filtered = (allocations || []).filter(a => {
          if (allocFilter.teacher   && a.teacher?._id?.toString()   !== allocFilter.teacher)   return false;
          if (allocFilter.leaveType && a.leaveType?._id?.toString() !== allocFilter.leaveType) return false;
          return true;
        });
        const tmap = {}; const torder = [];
        filtered.forEach(a => {
          const tid = a.teacher?._id?.toString() || 'unknown';
          if (!tmap[tid]) { tmap[tid] = { teacher: a.teacher, ay: a.academicYear, balances: [] }; torder.push(tid); }
          tmap[tid].balances.push(a);
        });
        const groups = torder.map(tid => tmap[tid]);

        const balCols = [
          { key: 'teacher', label: 'Teacher', render: g => <div><div style={{ fontWeight: 600 }}>{g.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{g.teacher?.employeeId || ''}</div></div> },
          { key: 'balance', label: 'Remaining / Allocated', render: g => (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {g.balances.map(b => {
                const rem   = Math.max(0, (b.totalAllocated||0)+(b.carriedForward||0)-(b.used||0)-(b.pending||0));
                const total = (b.totalAllocated||0) + (b.carriedForward||0);
                return (
                  <span key={b.leaveType?._id} style={{
                    padding: '2px 10px', borderRadius: 12, fontSize: '.78rem', fontWeight: 600, whiteSpace: 'nowrap',
                    border: `1px solid ${rem > 0 ? 'var(--success)' : 'var(--danger)'}`,
                    color: rem > 0 ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {b.leaveType?.code}: {rem}/{total}
                  </span>
                );
              })}
            </div>
          )},
          { key: 'used',    label: 'Used',    render: g => (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {g.balances.map(b => <span key={b.leaveType?._id} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}><strong>{b.leaveType?.code}</strong>: {b.used||0}</span>)}
            </div>
          )},
          { key: 'pending', label: 'Pending', render: g => (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {g.balances.map(b => <span key={b.leaveType?._id} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}><strong>{b.leaveType?.code}</strong>: {b.pending||0}</span>)}
            </div>
          )},
          { key: 'ay',      label: 'Year',    render: g => g.ay || '—' },
          { key: 'actions', label: '',        render: g => <button className="btn btn-secondary btn-sm" onClick={() => setDetailModal(g)}>Details</button> },
        ];

        return (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="form-control" style={{ width: 180 }} value={allocFilter.teacher} onChange={e => setAllocFilter(f => ({ ...f, teacher: e.target.value }))}>
                <option value="">All Teachers</option>
                {teacherList.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              <select className="form-control" style={{ width: 160 }} value={allocFilter.leaveType} onChange={e => setAllocFilter(f => ({ ...f, leaveType: e.target.value }))}>
                <option value="">All Leave Types</option>
                {leaveTypes.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              {(allocFilter.teacher || allocFilter.leaveType) && (
                <button className="btn btn-secondary btn-sm" onClick={() => setAllocFilter({ teacher: '', leaveType: '' })}>Clear</button>
              )}
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <Table columns={balCols} data={groups} emptyIcon="📊" emptyTitle="No balance data. Allocate leaves first." />
            </div>
          </div>
        );
      })()}

      {/* ── Reports (one row per teacher from applications) ── */}
      {tab === 'reports' && (() => {
        const apps = repData?.applications || [];
        const tmap = {}; const torder = [];
        apps.forEach(a => {
          const tid = a.teacher?._id?.toString() || 'unknown';
          if (!tmap[tid]) { tmap[tid] = { teacher: a.teacher, apps: [] }; torder.push(tid); }
          tmap[tid].apps.push(a);
        });
        const repGroups = torder.map(tid => tmap[tid]);

        const repGroupCols = [
          { key: 'teacher', label: 'Teacher', render: g => <div><div style={{ fontWeight: 600 }}>{g.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{g.teacher?.employeeId || ''}</div></div> },
          { key: 'summary', label: 'Applications (days per type)', render: g => {
            const byType = {};
            g.apps.forEach(a => { const c = a.leaveType?.code || '?'; byType[c] = (byType[c] || 0) + (a.totalDays || 0); });
            return (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(byType).map(([code, days]) => (
                  <span key={code} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}><strong>{code}</strong>: {days}d</span>
                ))}
              </div>
            );
          }},
          { key: 'count',   label: 'Count',   render: g => `${g.apps.length} application(s)` },
          { key: 'actions', label: '',         render: g => <button className="btn btn-secondary btn-sm" onClick={() => setRepDetailModal(g)}>View All</button> },
        ];

        return (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="form-control" style={{ width: 160 }} value={repStatus} onChange={e => setRepStatus(e.target.value)}>
                <option value="">All Statuses</option>
                {['pending','approved','rejected','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {repLoading
                ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
                : <Table columns={repGroupCols} data={repGroups} emptyIcon="📄" emptyTitle="No applications" />
              }
            </div>
          </div>
        );
      })()}

      {/* ── Action Modal (Approve / Reject / Modify / Reverse) ── */}
      <Modal open={!!actionModal} onClose={() => { setActionModal(null); setComment(''); }}
        title={actionModal?.type === 'approve' ? 'Approve Leave'
             : actionModal?.type === 'reject'  ? 'Reject Leave'
             : actionModal?.type === 'reverse' ? 'Reverse Approved Leave'
             : 'Request Modification'}
        footer={<>
          <Button variant="secondary" onClick={() => { setActionModal(null); setComment(''); }}>Cancel</Button>
          <Button variant={actionModal?.type === 'approve' ? 'primary' : 'danger'} onClick={handleAction} loading={actLoad}>Confirm</Button>
        </>}>
        {actionModal && (
          <div>
            <p style={{ marginBottom: 12 }}>
              <strong>{actionModal.request.teacher?.name}</strong> — {actionModal.request.leaveType?.name}<br />
              <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{fmtDate(actionModal.request.fromDate)} – {fmtDate(actionModal.request.toDate)} ({actionModal.request.totalDays} day(s))</span>
            </p>
            {actionModal.type === 'reverse' && (
              <div className="alert alert-warning" style={{ marginBottom: 12, fontSize: '.82rem' }}>
                This undoes the approval and returns {actionModal.request.totalDays} day(s) to the teacher's balance.
                {actionModal.request.leaveType?.category === 'compoff' && ' The Comp Off days go back into the lots they were spent from.'}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Comment (optional)</label>
              <textarea className="form-control" rows={3} value={comment}
                onChange={e => setComment(e.target.value)} placeholder="Add a comment..." />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Admin Apply Modal ── */}
      <Modal open={applyModal} onClose={closeApply} title="Apply Leave for Teacher" maxWidth={620}
        footer={<>
          <Button variant="secondary" onClick={closeApply}>Cancel</Button>
          {/* Every `warning` the preview returns is a rule the POST would reject
              outright (overlap, back-dating, eligibility), so submitting into a
              guaranteed failure is not offered. */}
          <Button form="admin-apply-form" type="submit" loading={applyLoad}
            disabled={!!preview?.days?.error || preview?.sufficient === false || !!preview?.warning}>Apply</Button>
        </>}>
        {(() => {
        const applyLT     = leaveTypes.find(t => t._id === applyForm.leaveTypeId);
        const applyBounds = leaveDateBounds(applyLT, { onBehalf: true });
        const applyHint   = leaveDateHint(applyLT, { onBehalf: true });
        return (
        <form id="admin-apply-form" onSubmit={handleApply}>
          <div className="form-group">
            <label className="form-label required">Teacher</label>
            <select className="form-control" required value={applyForm.teacherId}
              onChange={e => setApplyForm(f => ({ ...f, teacherId: e.target.value }))}>
              <option value="">Select teacher…</option>
              {teacherList.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Leave Type</label>
            <select className="form-control" required value={applyForm.leaveTypeId}
              onChange={e => setApplyForm(f => ({ ...f, leaveTypeId: e.target.value }))}>
              <option value="">Select type…</option>
              {leaveTypes.filter(t => t.isActive).map(t => <option key={t._id} value={t._id}>{t.name} ({t.code})</option>)}
            </select>
            {!applyForm.teacherId && applyForm.leaveTypeId &&
              <div className="form-hint">Pick a teacher to see their balance for this type.</div>}
          </div>

          {/* Balance for the picked teacher + type. Appears as soon as both are
              chosen, so the admin knows what is available before picking dates. */}
          {(previewLoad || preview) && (
            <div style={{
              background: 'var(--bg-muted, #f8fafc)', border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: '.85rem',
            }}>
              {previewLoad && !preview ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
                  <Spinner size="sm" /> Checking balance…
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <strong>{preview.leaveType?.name} balance</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>{preview.balance?.academicYear || '—'}</span>
                  </div>
                  {preview.balance?.allocated ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                      {[
                        ['Allocated', (preview.balance.totalAllocated || 0) + (preview.balance.carriedForward || 0)],
                        ['Used',      preview.balance.used],
                        ['Pending',   preview.balance.pending],
                        ['Available', preview.balance.remaining],
                      ].map(([label, value], i) => (
                        <div key={label}>
                          <div style={{
                            fontSize: '1.15rem', fontWeight: 700,
                            color: i === 3 ? (value > 0 ? 'var(--success, #059669)' : 'var(--danger, #dc2626)') : 'inherit',
                          }}>{value}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>
                      No allocation for this teacher this year — <strong>0 day(s) available</strong>.
                      {preview.leaveType?.category === 'compoff'
                        ? ' Comp Off days are credited only when a Comp Off request is approved.'
                        : ' Allocate this leave type first under the Allocations tab.'}
                    </div>
                  )}
                  {/* Overdraft is a policy setting — say so rather than let the
                      admin wonder why more days than "Available" go through. */}
                  {preview.balance?.allocated && preview.balance.spendable > preview.balance.remaining && (
                    <div style={{ marginTop: 6, fontSize: '.78rem', color: 'var(--text-muted)' }}>
                      Policy allows applying up to {preview.balance.spendable} day(s) (negative balance permitted).
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">From</label>
              <input type="date" className="form-control" required value={applyForm.fromDate}
                min={applyBounds.minFrom || undefined}
                onChange={e => {
                  const fromDate = e.target.value;
                  // A To date now earlier than From can only confuse — carry it
                  // forward rather than leave an impossible range on screen.
                  setApplyForm(f => ({ ...f, fromDate, toDate: f.toDate && f.toDate < fromDate ? fromDate : f.toDate }));
                }} />
            </div>
            <div className="form-group">
              <label className="form-label required">To</label>
              <input type="date" className="form-control" required value={applyForm.toDate}
                min={applyForm.fromDate || applyBounds.minFrom || undefined}
                onChange={e => setApplyForm(f => ({ ...f, toDate: e.target.value }))} />
            </div>
          </div>
          {applyHint && <div className="form-hint" style={{ marginTop: -6, marginBottom: 12 }}>{applyHint}</div>}
          <div className="form-group">
            <label className="form-label">Leave Mode</label>
            <select className="form-control" value={applyForm.leaveMode}
              onChange={e => setApplyForm(f => ({ ...f, leaveMode: e.target.value }))}>
              <option value="full_day">Full Day</option>
              <option value="half_day">Half Day</option>
            </select>
          </div>

          {/* What the picked dates actually cost. Weekends, school holidays and
              the type's sandwich rule all change the answer, so it comes from
              the server rather than being guessed in the browser. */}
          {preview?.days && (
            <div style={{ opacity: previewLoad ? 0.5 : 1, transition: 'opacity .15s' }}>
            {preview.days.error ? (
              <div className="alert alert-danger" style={{ fontSize: '.85rem' }}>{preview.days.error}</div>
            ) : (
              <div className={`alert ${preview.sufficient === false ? 'alert-danger' : 'alert-info'}`} style={{ fontSize: '.85rem' }}>
                <div>
                  Applying for <strong>{preview.days.totalDays} {preview.days.leaveMode === 'half_day' ? 'day (half day)' : 'working day(s)'}</strong>
                  {' '}out of {preview.days.calendarDays} calendar day(s).
                </div>
                <div style={{ marginTop: 4, fontSize: '.78rem' }}>
                  {describeDayCount(preview.days)}
                </div>
                {preview.sufficient === false && (
                  <div style={{ marginTop: 6, fontWeight: 600 }}>
                    Insufficient balance — {preview.days.totalDays} day(s) needed, {preview.balance?.spendable} available.
                  </div>
                )}
              </div>
            )}
            </div>
          )}
          {preview?.warning && !preview?.days?.error && (
            <div className="alert alert-warning" style={{ fontSize: '.85rem' }}>{preview.warning}</div>
          )}

          <div className="form-group">
            <label className="form-label required">Reason</label>
            <textarea className="form-control" rows={3} required value={applyForm.reason}
              onChange={e => setApplyForm(f => ({ ...f, reason: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Supporting Document <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>(optional)</span></label>
            <input ref={applyDocRef} type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>PDF, Word, or image — max 5 MB</span>
          </div>
        </form>
        ); })()}
      </Modal>

      {/* ── Leave Type Modal ── */}
      <Modal open={typeModal} onClose={() => setTypeModal(false)} title={editType ? 'Edit Leave Type' : 'New Leave Type'}
        footer={<>
          <Button variant="secondary" onClick={() => setTypeModal(false)}>Cancel</Button>
          <Button form="type-form" type="submit" loading={typeLoad}>Save</Button>
        </>}>
        <form id="type-form" onSubmit={handleSaveType}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Name</label>
              <input type="text" className="form-control" required value={typeForm.name}
                onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">Code</label>
              <input type="text" className="form-control" required value={typeForm.code}
                onChange={e => setTypeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. CL, SL" />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={typeForm.category || 'general'}
                onChange={e => setTypeForm(f => ({ ...f, category: e.target.value }))}>
                <option value="general">General leave</option>
                <option value="compoff">Comp Off (compensatory)</option>
              </select>
              <div className="form-hint">
                {typeForm.category === 'compoff'
                  ? 'Balance is credited only when a Comp Off request is approved — it cannot be allocated or accrued.'
                  : 'Standard leave — allocated annually or accrued monthly.'}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Annual Allocation (days)</label>
              <input type="number" className="form-control" min={0} value={typeForm.annualAllocation}
                disabled={typeForm.category === 'compoff'}
                onChange={e => setTypeForm(f => ({ ...f, annualAllocation: +e.target.value }))} />
              {typeForm.category === 'compoff' && <div className="form-hint">Not applicable — Comp Off days are earned</div>}
            </div>
          </div>
          {/* Every rule for this type — accrual, carry forward, encashment,
              day limits, documents, approvals — lives in Leave → Policies, so
              there is one place to look and nothing silently overrides. */}
          <div className="alert alert-info" style={{ fontSize: '.82rem' }}>
            Monthly accrual, carry forward, encashment, day limits, document rules and the
            approval workflow are configured per leave type under the <strong>Policies</strong> tab.
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={typeForm.isActive !== false}
                onChange={e => setTypeForm(f => ({ ...f, isActive: e.target.checked }))} />
              Active
            </label>
          </div>
        </form>
      </Modal>

      {/* ── Delete Type Confirm — shows exactly what goes with it ── */}
      <Modal open={!!delType} onClose={() => { setDelType(null); setDelImpact(null); }}
        title="Delete Leave Type" maxWidth={720}
        footer={<>
          <Button variant="secondary" onClick={() => { setDelType(null); setDelImpact(null); }}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteType} loading={delLoad}
            disabled={impactLoad || !delImpact?.canDelete}>
            {delImpact?.allocations?.length
              ? `Delete type & ${delImpact.allocations.length} allocation(s)`
              : 'Delete'}
          </Button>
        </>}>
        {impactLoad ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
        ) : !delImpact ? null : (
          <>
            <p style={{ marginTop: 0 }}>
              Delete <strong>{delImpact.leaveType?.name}</strong> ({delImpact.leaveType?.code})?
            </p>

            {/* The two things that stop a delete outright */}
            {!delImpact.canDelete && (
              <div className="alert alert-danger" style={{ fontSize: '.85rem' }}>
                This leave type cannot be deleted — it already has history:
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {delImpact.blockers?.applications > 0 &&
                    <li>{delImpact.blockers.applications} leave application(s)</li>}
                  {delImpact.blockers?.compOffRequests > 0 &&
                    <li>{delImpact.blockers.compOffRequests} comp off request(s)</li>}
                </ul>
                <div style={{ marginTop: 6 }}>
                  Mark it <strong>Inactive</strong> instead — it stops accepting new applications
                  and the records stay intact.
                </div>
              </div>
            )}

            {delImpact.allocations?.length > 0 ? (
              <>
                <div className="alert alert-warning" style={{ fontSize: '.85rem' }}>
                  <strong>{delImpact.teacherCount} teacher(s)</strong> currently hold days of this
                  leave type — <strong>{delImpact.totals?.remaining} day(s)</strong> still
                  available out of {delImpact.totals?.allocated} allocated.
                  Deleting the type <strong>permanently removes these allocations</strong>.
                </div>
                <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Teacher</th><th>Year</th><th>Allocated</th>
                        <th>Used</th><th>Pending</th><th>Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delImpact.allocations.map(a => (
                        <tr key={a._id}>
                          <td>
                            {a.teacher?.name || <em style={{ color: 'var(--text-muted)' }}>Removed employee</em>}
                            {a.teacher?.employeeId &&
                              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{a.teacher.employeeId}</div>}
                          </td>
                          <td>{a.academicYear}</td>
                          <td>{a.totalAllocated + a.carriedForward}</td>
                          <td>{a.used}</td>
                          <td>{a.pending}</td>
                          <td><strong>{a.remaining}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 600 }}>
                        <td colSpan={2}>Total</td>
                        <td>{delImpact.totals?.allocated}</td>
                        <td>{delImpact.totals?.used}</td>
                        <td>{delImpact.totals?.pending}</td>
                        <td>{delImpact.totals?.remaining}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : (
              <div className="alert alert-info" style={{ fontSize: '.85rem' }}>
                No teacher holds an allocation for this leave type.
              </div>
            )}

            {delImpact.canDelete && (
              <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', marginBottom: 0 }}>
                Also removed: this type&rsquo;s policy rules
                {delImpact.ledgerEntries > 0 && ` and ${delImpact.ledgerEntries} ledger entr${delImpact.ledgerEntries === 1 ? 'y' : 'ies'}`}.
                This cannot be undone.
              </p>
            )}
          </>
        )}
      </Modal>

      {/* ── Allocate Modal ── */}
      {allocModal && (() => {
        const selLT       = leaveTypes.find(t => t._id === allocForm.leaveTypeId);
        const isMonthly   = !!selLT?.monthlyAccrual?.enabled;
        const proratedDays = computeProration(selLT?.annualAllocation || 0, activeAY);
        const isMidYear   = proratedDays !== selLT?.annualAllocation && proratedDays !== 0;
        // Mirrors the server's precedence in adminAllocate — if these two ever
        // disagree the preview lies about what is about to be written.
        const computedDays = allocForm.overrideDays !== ''
          ? Number(allocForm.overrideDays)
          : isMonthly && !allocForm.giveFullAllocation
            ? 0
            : allocForm.useProration
              ? proratedDays
              : (selLT?.annualAllocation || 0);
        const teacherCount = allocForm.teacherMode === 'all'
          ? teacherList.length
          : allocForm.teacherMode === 'except'
            ? teacherList.length - allocForm.checkedTeachers.length
            : allocForm.checkedTeachers.length;

        return (
          <Modal open={allocModal} onClose={() => setAllocModal(false)} title="Allocate Leave" maxWidth={600}
            footer={<>
              <Button variant="secondary" onClick={() => setAllocModal(false)}>Cancel</Button>
              <Button form="alloc-form" type="submit" loading={allocLoad}>Allocate</Button>
            </>}>
            <form id="alloc-form" onSubmit={handleAllocate}>

              {/* Leave Type */}
              <div className="form-group">
                <label className="form-label required">Leave Type</label>
                <select className="form-control" required value={allocForm.leaveTypeId}
                  onChange={e => {
                    const next = leaveTypes.find(t => t._id === e.target.value);
                    setAllocForm(f => ({
                      ...f, leaveTypeId: e.target.value,
                      // An accruing type defaults to the accrual path, which is
                      // the whole point of marking it as accruing.
                      giveFullAllocation: !next?.monthlyAccrual?.enabled,
                      useProration: false, overrideDays: '',
                    }));
                  }}>
                  <option value="">Select type…</option>
                  {leaveTypes.filter(t => t.isActive).map(t => (
                    <option key={t._id} value={t._id}>{t.name} ({t.code}) — {t.annualAllocation} days/yr{t.monthlyAccrual?.enabled ? ' · monthly' : ''}</option>
                  ))}
                </select>
              </div>

              {/* Teacher Selection */}
              <div className="form-group">
                <label className="form-label">Teachers</label>

                {/* 3 mode radios */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                  {[
                    ['all',    'All Teachers'],
                    ['select', 'Select Specific'],
                    ['except', 'Except Specific'],
                  ].map(([val, label]) => (
                    <label key={val} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" name="teacherMode" value={val}
                        checked={allocForm.teacherMode === val}
                        onChange={() => setAllocForm(f => ({ ...f, teacherMode: val, checkedTeachers: [] }))} />
                      {label}
                    </label>
                  ))}
                </div>

                {/* All Teachers — no list, just a count badge */}
                {allocForm.teacherMode === 'all' && (
                  <div style={{ padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 6, fontSize: '.85rem', color: 'var(--text-muted)' }}>
                    All <strong style={{ color: 'var(--text)' }}>{teacherList.length}</strong> active teacher(s) will be allocated.
                  </div>
                )}

                {/* Select Specific / Except Specific — same checklist UI, different semantics */}
                {(allocForm.teacherMode === 'select' || allocForm.teacherMode === 'except') && (
                  <div>
                    <div style={{ marginBottom: 6 }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: '.82rem' }}>
                        <input type="checkbox"
                          checked={allocForm.checkedTeachers.length === teacherList.length && teacherList.length > 0}
                          onChange={e => setAllocForm(f => ({ ...f, checkedTeachers: e.target.checked ? teacherList.map(t => t._id) : [] }))} />
                        <strong>
                          {allocForm.teacherMode === 'select' ? `Select All (${teacherList.length})` : `Exclude All (${teacherList.length})`}
                        </strong>
                        {allocForm.checkedTeachers.length > 0 && (
                          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                            — {allocForm.checkedTeachers.length} selected
                          </span>
                        )}
                      </label>
                    </div>
                    <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 0' }}>
                      {teacherList.map(t => (
                        <label key={t._id} style={{ display: 'flex', gap: 8, padding: '5px 10px', cursor: 'pointer', alignItems: 'center' }}>
                          <input type="checkbox" checked={allocForm.checkedTeachers.includes(t._id)}
                            onChange={e => {
                              const ids = e.target.checked
                                ? [...allocForm.checkedTeachers, t._id]
                                : allocForm.checkedTeachers.filter(id => id !== t._id);
                              setAllocForm(f => ({ ...f, checkedTeachers: ids }));
                            }} />
                          <span>{t.name}</span>
                          {t.employeeId && <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>({t.employeeId})</span>}
                        </label>
                      ))}
                    </div>
                    {allocForm.teacherMode === 'except' && allocForm.checkedTeachers.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: '.8rem', color: 'var(--text-muted)' }}>
                        {teacherList.length - allocForm.checkedTeachers.length} teacher(s) will be allocated (excluding {allocForm.checkedTeachers.length}).
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Allocation Amount */}
              {selLT && (
                <div className="form-group">
                  <label className="form-label">Allocation</label>
                  <div style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '8px 12px', fontSize: '.82rem', marginBottom: 10 }}>
                    <strong>{selLT.name}</strong> — {selLT.annualAllocation} days/year
                    {isMonthly && <span style={{ color: 'var(--primary)', marginLeft: 8 }}>
                      Monthly accrual ({selLT.monthlyAccrual.daysPerMonth}/month)
                    </span>}
                  </div>

                  <div style={{ display: 'flex', gap: 20, marginBottom: 8, flexWrap: 'wrap' }}>
                    {/* An accruing type is allocated once — the row opens at 0
                        and the monthly sweep tops it up from there. */}
                    {isMonthly && (
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="radio" checked={!allocForm.giveFullAllocation && allocForm.overrideDays === ''}
                          onChange={() => setAllocForm(f => ({ ...f, giveFullAllocation: false, useProration: false, overrideDays: '' }))} />
                        <span>Start at 0 <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>(auto-credit {selLT.monthlyAccrual.daysPerMonth}/month)</span></span>
                      </label>
                    )}
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio"
                        checked={(!isMonthly || allocForm.giveFullAllocation) && !allocForm.useProration && allocForm.overrideDays === ''}
                        onChange={() => setAllocForm(f => ({ ...f, giveFullAllocation: true, useProration: false, overrideDays: '' }))} />
                      <span>{isMonthly ? `Give all ${selLT.annualAllocation} days now` : `Full (${selLT.annualAllocation} days)`}</span>
                    </label>
                    {/* Proration applies to accruing types too — it is the
                        opening figure for someone starting mid-year. */}
                    {isMidYear && (
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="radio" checked={allocForm.useProration && allocForm.overrideDays === ''}
                          onChange={() => setAllocForm(f => ({ ...f, giveFullAllocation: true, useProration: true, overrideDays: '' }))} />
                        <span>Prorated ({proratedDays} days <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>based on remaining months</span>)</span>
                      </label>
                    )}
                  </div>
                  {isMonthly && !allocForm.giveFullAllocation && allocForm.overrideDays === '' && (
                    <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                      Allocate once — {selLT.monthlyAccrual.daysPerMonth} day(s) are credited automatically
                      at the start of each month, up to {selLT.annualAllocation} for the year.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Custom override:</span>
                    <input type="number" className="form-control" style={{ width: 110 }} min="0"
                      value={allocForm.overrideDays}
                      placeholder={String(computedDays)}
                      onChange={e => setAllocForm(f => ({ ...f, overrideDays: e.target.value, useProration: false, giveFullAllocation: true }))} />
                    {allocForm.overrideDays !== '' && (
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => setAllocForm(f => ({ ...f, overrideDays: '' }))}>Clear</button>
                    )}
                  </div>

                  <div style={{ marginTop: 12, padding: '8px 14px', background: 'var(--primary)', color: '#fff', borderRadius: 4, fontSize: '.85rem' }}>
                    {isMonthly && computedDays === 0
                      ? <>Will enrol <strong>{teacherCount}</strong> teacher(s) at <strong>0</strong> days, then credit <strong>{selLT.monthlyAccrual.daysPerMonth}</strong> day(s) each month</>
                      : <>Will allocate <strong>{computedDays}</strong> day(s) to <strong>{teacherCount}</strong> teacher(s){allocForm.useProration && allocForm.overrideDays === '' ? <> (prorated from {selLT.annualAllocation})</> : null}</>}
                  </div>
                </div>
              )}

            </form>
          </Modal>
        );
      })()}

      {/* ── Clear Allocation ── */}
      {clearModal && (() => {
        const selLT = leaveTypes.find(t => t._id === clearForm.leaveTypeId);
        // The Allocations tab already holds every balance for the active year,
        // so the exact rows about to be zeroed are known here — no need to ask
        // the server what a clear would touch.
        const targetIds = clearForm.teacherMode === 'all'
          ? teacherList.map(t => t._id)
          : clearForm.teacherMode === 'except'
            ? teacherList.filter(t => !clearForm.checkedTeachers.includes(t._id)).map(t => t._id)
            : clearForm.checkedTeachers;
        const targetSet = new Set(targetIds.map(String));
        const affected = (allocations || []).filter(a =>
          String(a.leaveType?._id) === String(clearForm.leaveTypeId)
          && targetSet.has(String(a.teacher?._id))
          && ((a.totalAllocated || 0) + (a.carriedForward || 0)) > 0);
        const daysRemoved  = affected.reduce((n, a) => n + (a.totalAllocated || 0) + (a.carriedForward || 0), 0);
        const stillPending = affected.reduce((n, a) => n + (a.pending || 0), 0);

        return (
          <Modal open={clearModal} onClose={() => setClearModal(false)} title="Clear Allocation" maxWidth={640}
            footer={<>
              <Button variant="secondary" onClick={() => setClearModal(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleClearAllocations} loading={clearLoad}
                disabled={!clearForm.leaveTypeId || affected.length === 0}>
                {affected.length ? `Clear ${affected.length} allocation(s)` : 'Clear'}
              </Button>
            </>}>
            <div className="form-group">
              <label className="form-label required">Leave Type</label>
              <select className="form-control" required value={clearForm.leaveTypeId}
                onChange={e => setClearForm(f => ({ ...f, leaveTypeId: e.target.value }))}>
                <option value="">Select type…</option>
                {leaveTypes.map(t => <option key={t._id} value={t._id}>{t.name} ({t.code})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Teachers</label>
              <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                {[['all', 'All Teachers'], ['select', 'Select Specific'], ['except', 'Except Specific']].map(([val, label]) => (
                  <label key={val} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" name="clearTeacherMode" value={val}
                      checked={clearForm.teacherMode === val}
                      onChange={() => setClearForm(f => ({ ...f, teacherMode: val, checkedTeachers: [] }))} />
                    {label}
                  </label>
                ))}
              </div>
              {(clearForm.teacherMode === 'select' || clearForm.teacherMode === 'except') && (
                <div style={{ maxHeight: 170, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 0' }}>
                  {teacherList.map(t => (
                    <label key={t._id} style={{ display: 'flex', gap: 8, padding: '5px 10px', cursor: 'pointer', alignItems: 'center' }}>
                      <input type="checkbox" checked={clearForm.checkedTeachers.includes(t._id)}
                        onChange={e => setClearForm(f => ({
                          ...f,
                          checkedTeachers: e.target.checked
                            ? [...f.checkedTeachers, t._id]
                            : f.checkedTeachers.filter(id => id !== t._id),
                        }))} />
                      <span>{t.name}</span>
                      {t.employeeId && <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>({t.employeeId})</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {clearForm.leaveTypeId && (affected.length === 0 ? (
              <div className="alert alert-info" style={{ fontSize: '.85rem' }}>
                None of the selected teachers hold any {selLT?.name} days to clear.
              </div>
            ) : (
              <>
                <div className="alert alert-warning" style={{ fontSize: '.85rem' }}>
                  <strong>{daysRemoved} day(s)</strong> will be removed from <strong>{affected.length} teacher(s)</strong>.
                  Days already <strong>used</strong> stay on the record — only the allocated and
                  carried-forward figures go to 0.
                  {selLT?.monthlyAccrual?.enabled &&
                    ` Monthly accrual restarts from today at ${selLT.monthlyAccrual.daysPerMonth} day(s)/month.`}
                </div>
                {/* Pending applications were filed against days that are about to
                    disappear — the admin should see that before confirming. */}
                {stillPending > 0 && (
                  <div className="alert alert-danger" style={{ fontSize: '.85rem' }}>
                    {stillPending} day(s) are awaiting approval against this allocation. Clearing it
                    leaves those requests with no balance behind them — approve or reject them first.
                  </div>
                )}
                <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr><th>Teacher</th><th>Allocated</th><th>Used</th><th>Pending</th><th>After clear</th></tr>
                    </thead>
                    <tbody>
                      {affected.map(a => (
                        <tr key={a._id}>
                          <td>{a.teacher?.name || '—'}</td>
                          <td>{(a.totalAllocated || 0) + (a.carriedForward || 0)}</td>
                          <td>{a.used || 0}</td>
                          <td>{a.pending || 0}</td>
                          <td><strong>0</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ))}
          </Modal>
        );
      })()}

      {/* ── Allocation Import Modal ── */}
      <Modal open={allocImportModal} onClose={() => setAllocImportModal(false)} title="Import Leave Allocations"
        footer={<Button variant="secondary" onClick={() => setAllocImportModal(false)}>Close</Button>}>
        <input ref={allocFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleBulkImport} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: '.88rem', color: 'var(--text-muted)' }}>
            Download the template, fill in allocations per teacher and leave type, then upload the completed file.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '1.4rem' }}>📄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>Allocation Template</div>
              <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Excel with all teachers × leave types pre-filled</div>
            </div>
            <Button variant="secondary" onClick={handleDownloadTemplate}>⬇ Download</Button>
          </div>
          <div
            onClick={() => !importLoad && allocFileRef.current?.click()}
            style={{
              border: '2px dashed var(--border)', borderRadius: 8, padding: '28px 20px',
              textAlign: 'center', cursor: importLoad ? 'default' : 'pointer',
              background: 'var(--bg-muted)', transition: 'border-color .15s',
            }}
            onMouseEnter={e => { if (!importLoad) e.currentTarget.style.borderColor = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⬆️</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {importLoad ? 'Importing…' : 'Click to upload .xlsx file'}
            </div>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Supports .xlsx, .xls</div>
            {importLoad && <div style={{ marginTop: 10 }}><Spinner /></div>}
          </div>
        </div>
      </Modal>

      {/* ── Allocation / Balance Detail Modal ── */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)}
        title={`Leave Details — ${detailModal?.teacher?.name || ''}`} maxWidth={720}
        footer={<Button variant="secondary" onClick={() => setDetailModal(null)}>Close</Button>}>
        {detailModal && (
          <div>
            <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 6 }}>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>{detailModal.teacher?.name}</div>
              <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {detailModal.teacher?.email}
                {detailModal.teacher?.employeeId && ` · ID: ${detailModal.teacher.employeeId}`}
                {detailModal.ay && ` · Year: ${detailModal.ay}`}
              </div>
            </div>
            <Table
              columns={[
                { key: 'type',      label: 'Leave Type', render: b => <strong>{b.leaveType?.name || '—'}</strong> },
                { key: 'code',      label: 'Code',       render: b => <code style={{ background: 'var(--bg-muted)', padding: '2px 6px', borderRadius: 4 }}>{b.leaveType?.code}</code> },
                { key: 'allocated', label: 'Allocated',  render: b => b.totalAllocated || 0 },
                { key: 'cf',        label: 'Carry Fwd',  render: b => b.carriedForward || 0 },
                { key: 'used',      label: 'Used',       render: b => b.used || 0 },
                { key: 'pending',   label: 'Pending',    render: b => b.pending || 0 },
                { key: 'remaining', label: 'Remaining',  render: b => {
                  const rem = Math.max(0, (b.totalAllocated||0)+(b.carriedForward||0)-(b.used||0)-(b.pending||0));
                  return <strong style={{ color: rem > 0 ? 'var(--success)' : 'var(--danger)' }}>{rem}</strong>;
                }},
              ]}
              data={detailModal.balances}
            />
          </div>
        )}
      </Modal>

      {/* ── Report Applications Detail Modal ── */}
      <Modal open={!!repDetailModal} onClose={() => setRepDetailModal(null)}
        title={`Applications — ${repDetailModal?.teacher?.name || ''}`} maxWidth={820}
        footer={<Button variant="secondary" onClick={() => setRepDetailModal(null)}>Close</Button>}>
        {repDetailModal && (
          <Table
            columns={[
              { key: 'type',    label: 'Type',       render: r => r.leaveType?.name || '—' },
              { key: 'dates',   label: 'Period',     render: r => `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}` },
              { key: 'days',    label: 'Days',       render: r => r.totalDays },
              { key: 'mode',    label: 'Mode',       render: r => r.leaveMode?.replace('_', ' ') },
              { key: 'status',  label: 'Status',     render: r => <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status?.replace('_', ' ')}</Badge> },
              { key: 'reason',  label: 'Reason',     render: r => <span style={{ fontSize: '.82rem' }}>{r.reason || '—'}</span> },
              { key: 'comment', label: 'Admin Note', render: r => r.adminComment ? <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{r.adminComment}</span> : '—' },
              { key: 'applied', label: 'Applied On', render: r => fmtDate(r.appliedAt) },
              { key: 'doc',     label: 'Doc',        render: r => r.document ? <a href={`/uploads/leave-docs/${r.document}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>📎 View</a> : '—' },
            ]}
            data={repDetailModal.apps}
          />
        )}
      </Modal>

      {/* ── Carry Forward Modal ── */}
      {cfModal && (() => {
        const startOf = (label) => academicYears.find(y => y.label === label)?.startDate;
        // A year can only receive from one that starts before it, so the two lists
        // constrain each other rather than allowing an impossible pair. The list
        // is sorted ascending, so the last year has nothing after it to feed.
        const fromOptions = academicYears.slice(0, -1);
        const toOptions   = cfForm.fromYear
          ? academicYears.filter(y => new Date(y.startDate) > new Date(startOf(cfForm.fromYear)))
          : academicYears;
        const valid = !!cfForm.fromYear && !!cfForm.toYear
          && new Date(startOf(cfForm.fromYear)) < new Date(startOf(cfForm.toYear));

        return (
          <Modal open={cfModal} onClose={() => setCfModal(false)} title="Run Carry-Forward"
            footer={<>
              <Button variant="secondary" onClick={() => setCfModal(false)}>Cancel</Button>
              <Button form="cf-form" type="submit" loading={cfLoad} disabled={!valid}>Run</Button>
            </>}>
            <form id="cf-form" onSubmit={handleCarryForward}>
              <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
                Carry forward unused leave from one academic year to the next (for eligible leave types).
              </p>
              {academicYears.length < 2 ? (
                <div className="alert alert-warning" style={{ fontSize: '.85rem' }}>
                  Carry-forward needs at least two academic years — this school has
                  {academicYears.length === 1 ? ' only one' : ' none'}. Add the next year first.
                </div>
              ) : (
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label className="form-label required">From Year</label>
                    <select className="form-control" required value={cfForm.fromYear}
                      onChange={e => {
                        const fromYear = e.target.value;
                        // Drop a To year that is no longer later than From.
                        setCfForm(f => ({
                          ...f, fromYear,
                          toYear: f.toYear && new Date(startOf(f.toYear)) > new Date(startOf(fromYear)) ? f.toYear : '',
                        }));
                      }}>
                      <option value="">Select year…</option>
                      {fromOptions.map(y => (
                        <option key={y.label} value={y.label}>{y.label}{y.status === 'active' ? ' (active)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label required">To Year</label>
                    <select className="form-control" required value={cfForm.toYear}
                      disabled={!cfForm.fromYear}
                      onChange={e => setCfForm(f => ({ ...f, toYear: e.target.value }))}>
                      <option value="">{cfForm.fromYear ? 'Select year…' : 'Pick a From year first'}</option>
                      {toOptions.map(y => (
                        <option key={y.label} value={y.label}>{y.label}{y.status === 'active' ? ' (active)' : ''}</option>
                      ))}
                    </select>
                    {cfForm.fromYear && toOptions.length === 0 && (
                      <div className="form-error">No academic year starts after {cfForm.fromYear}.</div>
                    )}
                  </div>
                </div>
              )}
            </form>
          </Modal>
        );
      })()}
    </div>
  );
}
