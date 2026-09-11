import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { Button, Modal, Spinner, Empty } from '../../components/ui/index';
import Icon, { LeaveScene } from '../../components/ui/icons';
import { AdminCompOff } from './CompOff';
import AdminLeavePolicies from './LeavePolicies';
import { leaveDateBounds, leaveDateHint } from '../../utils/leaveDates';
import { useSearchParams } from 'react-router-dom';
import useFocusTarget, { useFocusFilterReset } from '../../hooks/useFocusTarget';
// The row menu is the one thing this page borrows from the account-list frame:
// it is portalled, so it is never clipped by the table's scroll box.
import { IconAction, MenuItem, MenuSep, RowActions, RowMenu, useSelection } from './listParts';
// Everything that knows what a leave request is.
import {
  AllocChips, ApprovalStep, CardHead, DateRange, DecisionDialog, FilterRow, FilterSelect,
  HeadField, LeaveHero, LeaveStat, LeaveStats, LeaveTabs, NotesPanel, Pager, PeriodCell,
  QuickLinks, ReasonCell, ReportDrawer, RequestDrawer, STATUS_OPTIONS, SearchBox, SectionHead,
  ShowingCount, SplitButton, StatusBadge, TeacherCell, Toggle, TrendBars, TypeNameCell,
  ChartCard,
  BalanceDrawer, BalancePill, ChoiceCards, DialogHead, DialogNote, DropZone, FormStep,
  HelpPanel, LeaveDonut, SummaryLine, TypeIcon,
  chipTones, dayNum, docUrl, donutSlices, fmtDate,
} from './leaveParts';

const STATUS_VARIANT = {
  pending: 'warning', approved: 'success', rejected: 'danger',
  cancelled: 'muted',
};

// Identity and entitlement only — every rule lives in the type's LeavePolicy
const EMPTY_TYPE = {
  name: '', code: '', description: '', category: 'general', annualAllocation: 12, isActive: true,
};

const EMPTY_APPLY = { teacherId: '', leaveTypeId: '', fromDate: '', toDate: '', leaveMode: 'full_day', halfDaySession: 'first', reason: '' };
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
  // Notifications link straight at a tab (?tab=…), so the page opens where the
  // notification was about rather than on its default.
  const [searchParams] = useSearchParams();
  const wantedTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    ['requests', 'types', 'policies', 'allocations', 'balance', 'compoff', 'reports'].includes(wantedTab) ? wantedTab : 'requests');

  // ── The landing figures ──────────────────────────────────────────────────────
  // One call behind the tiles and the rail. Counted in Postgres — the page
  // states five numbers about a table that holds years of applications, and
  // paging that table into the browser to add them up is how the old screen
  // ended up showing none of them.
  const { data: ovData, loading: ovLoading, refetch: refetchOverview } = useFetch(api.getLeaveOverview);
  const ov = ovData || {};

  // ── Requests ─────────────────────────────────────────────────────────────────
  const [reqPage,      setReqPage]      = useState(1);
  // Fixed: this design has no rows-per-page control, so the page size is a
  // constant rather than state nothing can change.
  const reqLimit = 10;
  const [reqSearch,    setReqSearch]    = useState('');
  const [reqTerm,      setReqTerm]      = useState('');
  const [reqStatus,    setReqStatus]    = useState('');
  const [reqTeacher,   setReqTeacher]   = useState('');
  const [reqLeaveType, setReqLeaveType] = useState('');
  const [reqFromDate,  setReqFromDate]  = useState('');
  const [reqToDate,    setReqToDate]    = useState('');
  const [detail,       setDetail]       = useState(null);  // the row in the drawer
  const [decision,  setDecision]  = useState(null); // { kind, request, ids }
  const [comment,   setComment]   = useState('');
  const [actLoad,   setActLoad]   = useState(false);

  // A request per keystroke is a request per keystroke; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setReqTerm(reqSearch.trim()); setReqPage(1); }, 300);
    return () => clearTimeout(t);
  }, [reqSearch]);

  // Following a notification: the server is told which request to show and
  // answers with the page holding it, instead of page 1 where it rarely is.
  const { focusId, release: releaseFocus } = useFocusTarget();
  const { data: reqData, meta: reqMeta, loading: reqLoading, refetch: refetchReq } = useFetch(
    () => api.getLeaveRequests({
      page: reqPage, limit: reqLimit,
      q:         reqTerm      || undefined,
      status:    reqStatus    || undefined,
      teacherId: reqTeacher   || undefined,
      leaveType: reqLeaveType || undefined,
      fromDate:  reqFromDate  || undefined,
      toDate:    reqToDate    || undefined,
      focus:     focusId      || undefined,
    }),
    [reqPage, reqLimit, reqTerm, reqStatus, reqTeacher, reqLeaveType,
     reqFromDate, reqToDate, focusId],
  );
  const requests = reqData || [];

  const anyReqFilter = !!(reqTerm || reqStatus || reqTeacher || reqLeaveType || reqFromDate || reqToDate);

  const clearReqFilters = useCallback(() => {
    setReqStatus(''); setReqTeacher(''); setReqLeaveType('');
    setReqSearch(''); setReqTerm('');
    setReqFromDate(''); setReqToDate(''); setReqPage(1);
  }, []);
  // The request exists but a filter in force hides it — clearing them is what
  // following the notification meant.
  useFocusFilterReset(reqMeta, focusId, clearReqFilters);

  // Every filter and page control releases the notification's hold on the list.
  const onReqFilter = (setter) => (value) => { releaseFocus(); setReqPage(1); setter(value); };
  const onReqPage   = (p) => { releaseFocus(); setReqPage(p); };

  // Not getTeachers(): /admin/teachers is school-admin-only, so a teacher whose
  // designation grants admin on the leave module would find every picker on
  // this screen empty. This list rides the leave module's own guard.
  const { data: teachers } = useFetch(api.getLeaveEmployees);
  const teacherList = teachers || [];

  const askDecision = (kind, request) => { setComment(''); setDecision({ kind, request }); };

  /** Approve, reject or reverse one request. */
  const runDecision = async () => {
    if (!decision) return;
    const { kind, request } = decision;
    const call = kind === 'approve' ? api.approveLeave
      : kind === 'reject' ? api.rejectLeave
      : api.reverseApprovedLeave;

    setActLoad(true);
    try {
      await call(request._id, { adminComment: comment });
      toast.success(kind === 'approve' ? 'Leave approved'
        : kind === 'reject'  ? 'Leave rejected'
        : `Leave reversed — ${request.totalDays} day(s) restored`);
      setDecision(null); setComment(''); setDetail(null);
      refetchReq(); refetchOverview();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setActLoad(false); }
  };

  // ── Apply leave (admin on behalf of teacher) ──────────────────────────────────
  const [applyModal, setApplyModal] = useState(false);
  const [applyForm,  setApplyForm]  = useState(EMPTY_APPLY);
  const [applyLoad,  setApplyLoad]  = useState(false);
  const applyDocRef = useRef();
  // The file input is uncontrolled, so its name is tracked for the drop zone.
  const [applyDocName, setApplyDocName] = useState('');

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
    setApplyModal(false); setApplyForm(EMPTY_APPLY); setPreview(null); setApplyDocName('');
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
      if (applyForm.leaveMode === 'half_day') fd.append('halfDaySession', applyForm.halfDaySession);
      fd.append('reason',      applyForm.reason);
      if (applyDocRef.current?.files?.[0]) fd.append('document', applyDocRef.current.files[0]);
      await api.adminApplyLeave(fd);
      toast.success('Leave applied');
      closeApply();
      refetchReq(); refetchOverview();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setApplyLoad(false); }
  };

  /**
   * The queue itself.
   *
   * Hand-written rather than driven through the shared ListTable: this design
   * wants a numbered row, a days column of its own and labelled decision
   * buttons, none of which that component does.
   */
  const RequestRows = () => {
    if (reqLoading) {
      return (
        <div className="lvtable__state"><Spinner /></div>
      );
    }
    if (!requests.length) {
      return (
        <div className="lvtable__state">
          <Empty
            icon={anyReqFilter ? '🔍' : '🏖️'}
            title={anyReqFilter ? 'No requests match these filters' : 'No leave requests yet'}
            message={anyReqFilter
              ? 'Try a different status, teacher or date range.'
              : 'Requests filed by staff land here for a decision. You can also file one on a teacher\u2019s behalf.'}
            action={anyReqFilter
              ? <Button variant="secondary" onClick={() => { releaseFocus(); clearReqFilters(); }}>Clear filters</Button>
              : <Button onClick={openApply}>+ Apply Leave</Button>}
          />
        </div>
      );
    }
    const start = ((reqMeta?.page || reqPage) - 1) * reqLimit;
    return (
      <div className="lvtable__wrap">
        <table className="lvtable">
          <thead>
            <tr>
              <th className="lvt-num">#</th>
              <th>Teacher</th>
              <th>Leave Type</th>
              <th>Period</th>
              <th className="lvt-days">Days</th>
              <th>Status</th>
              <th>Reason</th>
              <th className="lvt-applied">Applied On</th>
              <th className="lvt-acts">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r, i) => (
              // The row id goes on data-focus-id so a notification or the
              // header's global search can flag the row it was about.
              <tr key={r._id} data-focus-id={r._id}>
                <td className="lvt-num">{start + i + 1}</td>
                <td><TeacherCell request={r} /></td>
                <td className="lvt-type">{r.leaveType?.name || '—'}</td>
                <td><PeriodCell request={r} /></td>
                <td className="lvt-days">{dayNum(r.totalDays)}</td>
                <td>
                  <StatusBadge status={r.status} />
                  <ApprovalStep request={r} />
                </td>
                <td className="lvt-reason"><ReasonCell request={r} /></td>
                <td className="lvt-applied">{fmtDate(r.appliedAt) || '—'}</td>
                <td className="lvt-acts">
                  <div className="lvrowacts">
                    {/* The decision is the work and keeps its words; looking at
                        the record is the same eye it is on every other list. */}
                    {r.status === 'pending' && (
                      <div className="lvacts">
                        <button type="button" className="lvbtn lvbtn--approve"
                          onClick={() => askDecision('approve', r)}>Approve</button>
                        <button type="button" className="lvbtn lvbtn--reject"
                          onClick={() => askDecision('reject', r)}>Reject</button>
                      </div>
                    )}
                    <RowActions>
                      <IconAction icon="eye" label="View request" onClick={() => setDetail(r)} />
                      <RowMenu>
                        <MenuItem icon="eye" onClick={() => setDetail(r)}>View full request</MenuItem>
                      {r.document && (
                        <MenuItem icon="files" onClick={() => window.open(docUrl(r.document), '_blank', 'noopener')}>
                          Open attachment
                        </MenuItem>
                      )}
                      <MenuItem icon="user" onClick={() => { releaseFocus(); setReqTeacher(r.teacher?._id || ''); setReqPage(1); }}>
                        Only this teacher
                      </MenuItem>
                      {/* Undoing an approval is the only way the days go back. */}
                      {r.status === 'approved' && (
                        <>
                          <MenuSep />
                          <MenuItem icon="repeat" danger onClick={() => askDecision('reverse', r)}>
                            Reverse approval
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
    );
  };

  // ── Leave Types ───────────────────────────────────────────────────────────────
  const [typeModal, setTypeModal] = useState(false);
  const [editType,  setEditType]  = useState(null);
  const [typeForm,  setTypeForm]  = useState(EMPTY_TYPE);
  const [typeLoad,  setTypeLoad]  = useState(false);
  const [delType,   setDelType]   = useState(null);
  const [delLoad,   setDelLoad]   = useState(false);
  const [delImpact, setDelImpact] = useState(null);   // what the delete would wipe
  const [impactLoad, setImpactLoad] = useState(false);
  const { data: typesData, loading: typesLoading, refetch: refetchTypes } = useFetch(api.getLeaveTypes);
  const leaveTypes = typesData || [];

  /**
   * Whether this school runs Comp Off at all.
   *
   * The whole feature hangs off one leave type, so a school that has not
   * created one has nothing behind that tab — no requests, no balances, no
   * policy worth configuring. `category` is the contract; the COMPOFF code is
   * honoured too, for types created before that field existed (the same pair
   * compOffService.resolveContext tests).
   *
   * Deliberately not "is it *active*": an inactive type still holds history,
   * and the tab is where an admin would switch it back on.
   */
  const hasCompOff = leaveTypes.some(
    (t) => t.category === 'compoff' || String(t.code || '').toUpperCase() === 'COMPOFF',
  );

  // A deep link to ?tab=compoff at a school with no Comp Off type lands on the
  // queue instead. Held until the types have actually arrived — on the first
  // render nothing has loaded, and bouncing then would fight the link.
  useEffect(() => {
    if (typesData && tab === 'compoff' && !hasCompOff) setTab('requests');
  }, [typesData, hasCompOff, tab]);

  // The type list is a handful of rows that all arrive in one call, so the
  // search, the status filter and the pager are worked out here rather than
  // being a round trip each.
  const [typeSearch, setTypeSearch] = useState('');
  const [typeStatus, setTypeStatus] = useState('');
  const [typePage,   setTypePage]   = useState(1);
  const [toggling,   setToggling]   = useState(null);   // the type mid-switch
  const TYPE_PAGE = 10;

  const typeCounts = {
    total:    leaveTypes.length,
    active:   leaveTypes.filter((t) => t.isActive !== false).length,
    inactive: leaveTypes.filter((t) => t.isActive === false).length,
    // Comp off is earned, never allocated, so counting its zero in the annual
    // total would be counting a figure that does not mean anything.
    allocation: leaveTypes
      .filter((t) => t.isActive !== false && t.category !== 'compoff')
      .reduce((n, t) => n + (Number(t.annualAllocation) || 0), 0),
  };

  const typesFiltered = leaveTypes.filter((t) => {
    if (typeStatus === 'active'   && t.isActive === false) return false;
    if (typeStatus === 'inactive' && t.isActive !== false) return false;
    const q = typeSearch.trim().toLowerCase();
    if (!q) return true;
    return [t.name, t.code, t.description].filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });
  const typePages = Math.max(1, Math.ceil(typesFiltered.length / TYPE_PAGE));
  const typePageNow = Math.min(typePage, typePages);
  const typeRows = typesFiltered.slice((typePageNow - 1) * TYPE_PAGE, typePageNow * TYPE_PAGE);
  const anyTypeFilter = !!(typeSearch.trim() || typeStatus);

  /**
   * Flip a type between active and inactive from the row.
   *
   * The switch is the whole edit, so it writes just `isActive` — sending the
   * rest of the form back would let a stale row overwrite a policy saved on
   * another tab. A refused flip (two live Comp Off types) is reported and the
   * switch springs back, because the list is re-read either way.
   */
  const toggleTypeActive = async (t, next) => {
    setToggling(t._id);
    try {
      await api.updateLeaveType(t._id, { isActive: next });
      toast.success(`${t.name} is now ${next ? 'active' : 'inactive'}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setToggling(null);
      refetchTypes();
    }
  };

  /** The visible list, as a spreadsheet. There is no server export for types. */
  const exportTypes = () => {
    const rows = [
      ['#', 'Leave Type', 'Code', 'Annual Allocation', 'Description', 'Status'],
      ...typesFiltered.map((t, i) => [
        i + 1, t.name, t.code,
        t.category === 'compoff' ? 'Earned on approval' : `${t.annualAllocation || 0} days`,
        t.description || '',
        t.isActive === false ? 'Inactive' : 'Active',
      ]),
    ];
    // Quotes doubled and the whole field wrapped — a description with a comma
    // in it is the common case, not the edge one.
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'leave_types.csv'; a.click();
    URL.revokeObjectURL(url);
  };

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
    // The tiles count approvals and reversals that happened on another tab too,
    // so they come back with the queue.
    if (tab === 'requests')  { refetchReq();   refetchTypes(); refetchOverview(); }
    if (tab === 'allocations') { refetchAlloc(); refetchTypes(); }
    if (tab === 'balance')   { refetchAlloc(); refetchTypes(); }
  }, [tab]);

  const openCreateType = () => { setTypeForm(EMPTY_TYPE); setEditType(null); setTypeModal(true); };
  const openEditType   = (t) => {
    setTypeForm({
      name: t.name, code: t.code, description: t.description || '',
      category: t.category || 'general',
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
  // The year is a filter on the server, not on the rows: balances are stored
  // per academic year, so asking for another year is another request.
  const [allocYear, setAllocYear] = useState('');
  const { data: allocData, meta: allocMeta, loading: allocLoading, refetch: refetchAlloc } = useFetch(
    () => api.getLeaveAllocations(allocYear ? { academicYear: allocYear } : undefined),
    [allocYear],
  );
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
  const [balanceRow,     setBalanceRow]     = useState(null); // the row the balance drawer is open on
  const [allocFilter,    setAllocFilter]    = useState({ teacher: '', leaveType: '' });

  // ── Reports ───────────────────────────────────────────────────────────────────
  const [repStatus, setRepStatus] = useState('');
  const [repYear,   setRepYear]   = useState('');
  const [repDept,   setRepDept]   = useState('');
  const [repType,   setRepType]   = useState('');
  const [repSearch, setRepSearch] = useState('');
  const [repPage,   setRepPage]   = useState(1);
  const [repGrain,  setRepGrain]  = useState('monthly');
  const REP_PAGE = 5;
  const [exportLoad,      setExportLoad]      = useState(false);
  const [reqExportLoad,   setReqExportLoad]   = useState(false);
  const [allocExportLoad, setAllocExportLoad] = useState(false);
  // Every figure on this tab is counted in Postgres — the old screen pulled up
  // to 5000 populated applications into the browser and summed them here.
  const { data: repData, loading: repLoading } = useFetch(
    () => api.getLeaveReports({
      academicYear: repYear   || undefined,
      department:   repDept   || undefined,
      leaveType:    repType   || undefined,
      status:       repStatus || undefined,
    }),
    [repYear, repDept, repType, repStatus],
  );
  const rep = repData || {};

  const handleExport = async () => {
    setExportLoad(true);
    try {
      const res = await api.exportLeaveReports({
        academicYear: repYear   || undefined,
        status:       repStatus || undefined,
      });
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


  // ── The set-up tabs ─────────────────────────────────────────────────────────
  // ── Allocations ─────────────────────────────────────────────────────────────
  const [allocSearch, setAllocSearch] = useState('');
  const [allocDept,   setAllocDept]   = useState('');
  const [allocState,  setAllocState]  = useState('');   // '' | 'allocated' | 'none'
  const [allocPage,   setAllocPage]   = useState(1);
  const ALLOC_PAGE = 10;

  // One chip colour per leave type, fixed by the type's position in the
  // school's own list so a type keeps its colour from row to row and page to
  // page rather than being coloured by where it happens to fall.
  const chipTone = chipTones(allocMeta?.leaveTypes || leaveTypes);

  /**
   * One row per teacher — including the ones holding nothing.
   *
   * Grouping the balance rows alone would drop every unallocated teacher off
   * the screen, which is exactly the set the "Not Allocated" tile is counting
   * and the only set worth acting on. So the staff list leads, and balances are
   * hung off it.
   */
  const allocRows = (() => {
    const byTeacher = new Map();
    teacherList.forEach((t) => byTeacher.set(String(t._id), {
      _id: String(t._id), teacher: t, department: t.department || '', balances: [],
    }));
    allocations.forEach((b) => {
      const id = String(b.teacher?._id || '');
      if (!id) return;
      // A balance for someone no longer on the staff list still has to show,
      // or their days would be invisible and unrecoverable.
      if (!byTeacher.has(id)) {
        byTeacher.set(id, {
          _id: id, teacher: b.teacher, department: b.teacher?.department || '', balances: [],
        });
      }
      const row = byTeacher.get(id);
      row.balances.push(b);
      if (!row.department) row.department = b.teacher?.department || '';
    });
    return [...byTeacher.values()].map((r) => ({
      ...r,
      total: r.balances.reduce((n, b) => n + (b.totalAllocated || 0) + (b.carriedForward || 0), 0),
    }));
  })();

  const allocDepts = [...new Set(allocRows.map((r) => r.department).filter(Boolean))].sort();

  const allocCounts = {
    teachers:  allocRows.length,
    types:     leaveTypes.length,
    allocated: allocRows.filter((r) => r.balances.length).length,
    none:      allocRows.filter((r) => !r.balances.length).length,
  };

  const allocFiltered = allocRows.filter((r) => {
    if (allocDept && r.department !== allocDept) return false;
    if (allocState === 'allocated' && !r.balances.length) return false;
    if (allocState === 'none'      &&  r.balances.length) return false;
    const q = allocSearch.trim().toLowerCase();
    if (!q) return true;
    return [r.teacher?.name, r.teacher?.employeeId, r.department,
            ...r.balances.map((b) => b.leaveType?.name), ...r.balances.map((b) => b.leaveType?.code)]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  });
  const allocPages   = Math.max(1, Math.ceil(allocFiltered.length / ALLOC_PAGE));
  const allocPageNow = Math.min(allocPage, allocPages);
  const allocShown   = allocFiltered.slice((allocPageNow - 1) * ALLOC_PAGE, allocPageNow * ALLOC_PAGE);
  const anyAllocFilter = !!(allocSearch.trim() || allocDept || allocState);

  const allocSelection = useSelection(
    allocShown,
    `${allocPageNow}|${allocSearch}|${allocDept}|${allocState}|${allocYear}`,
  );

  /** Open one teacher's balances in the slide-over. */
  const openBalances = (row) => setBalanceRow(row);

  /** Open the allocate form aimed at a given set of teachers. */
  const openAllocate = (ids) => {
    setAllocForm(ids?.length
      ? { ...EMPTY_ALLOC, teacherMode: 'select', checkedTeachers: ids }
      : EMPTY_ALLOC);
    setAllocModal(true);
  };

  // ── Balance Summary ─────────────────────────────────────────────────────────
  // A balance is "low" at two days or fewer of a type. The tile, the pill and
  // the row status all read that one number, so they can never disagree.
  const LOW_BALANCE = 2;
  const [balSearch, setBalSearch] = useState('');
  const [balDept,   setBalDept]   = useState('');
  const [balLow,    setBalLow]    = useState(false);
  const [balPage,   setBalPage]   = useState(1);
  const BAL_PAGE = 8;

  // The columns of the balance table: the active types, in the school's own
  // order, so every row lines up under the same headings.
  const balTypes = (allocMeta?.leaveTypes || leaveTypes).filter((t) => t.isActive !== false);

  const balRows = allocRows.map((r) => {
    const byType = Object.fromEntries(r.balances.map((b) => [String(b.leaveType?._id), b]));
    const cells = balTypes.map((t) => {
      const b = byType[String(t._id)];
      // What is actually left: allocated plus carried in, less taken and less
      // the days already held by a pending request.
      const left = b
        ? Math.max(0, (b.totalAllocated || 0) + (b.carriedForward || 0) - (b.used || 0) - (b.pending || 0))
        : null;
      return { type: t, left, has: !!b };
    });
    const held = cells.filter((c) => c.has);
    return {
      ...r,
      cells,
      remaining: held.reduce((n, c) => n + c.left, 0),
      low: held.some((c) => c.left <= LOW_BALANCE),
      hasAny: held.length > 0,
    };
  });

  const balCounts = {
    teachers: balRows.length,
    types:    balTypes.length,
    withBal:  balRows.filter((r) => r.hasAny).length,
    low:      balRows.filter((r) => r.low).length,
  };

  // Every type's remaining days across the school — the rail's ring.
  const balTotals = balTypes.map((t) => ({
    _id: String(t._id),
    name: t.name,
    days: balRows.reduce((n, r) => {
      const c = r.cells.find((x) => String(x.type._id) === String(t._id));
      return n + (c?.has ? c.left : 0);
    }, 0),
  }));
  const balTotalDays = balTotals.reduce((n, t) => n + t.days, 0);

  const balFiltered = balRows.filter((r) => {
    if (balDept && r.department !== balDept) return false;
    if (balLow && !r.low) return false;
    const q = balSearch.trim().toLowerCase();
    if (!q) return true;
    return [r.teacher?.name, r.teacher?.employeeId, r.department]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  });
  const balPages   = Math.max(1, Math.ceil(balFiltered.length / BAL_PAGE));
  const balPageNow = Math.min(balPage, balPages);
  const balShown   = balFiltered.slice((balPageNow - 1) * BAL_PAGE, balPageNow * BAL_PAGE);
  const anyBalFilter = !!(balSearch.trim() || balDept || balLow);

  // ── Reports ─────────────────────────────────────────────────────────────────
  // The columns of the teacher table: the types that actually appear in the
  // reported year, so a type nobody has taken does not get a column of zeroes.
  const repTypes = rep.byType || [];
  const repTone  = chipTones(repTypes);

  const repRows = (rep.teachers || []).filter((t) => {
    const q = repSearch.trim().toLowerCase();
    if (!q) return true;
    return [t.name, t.employeeId, t.department]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  });
  const repPages   = Math.max(1, Math.ceil(repRows.length / REP_PAGE));
  const repPageNow = Math.min(repPage, repPages);
  const repShown   = repRows.slice((repPageNow - 1) * REP_PAGE, repPageNow * REP_PAGE);

  /**
   * The trend, at the grain the control asks for.
   *
   * Quarters are rolled up from the same months rather than fetched again —
   * they are a different reading of one series, not a different series, and a
   * round trip to re-add twelve numbers would be a round trip for nothing.
   */
  const repTrend = (() => {
    const months = rep.trend || [];
    if (repGrain !== 'quarterly') return months;
    const out = [];
    for (let i = 0; i < months.length; i += 3) {
      const g = months.slice(i, i + 3);
      if (!g.length) break;
      out.push({
        month: g[0].month,
        // Named by the months it spans, so "Apr–Jun" is not mistaken for a
        // calendar quarter when the academic year does not start in January.
        label: g.length > 1 ? `${g[0].label}–${g[g.length - 1].label}` : g[0].label,
        count: g.reduce((n, m) => n + m.count, 0),
        days:  g.reduce((n, m) => n + m.days, 0),
      });
    }
    return out;
  })();

  // ── The report drawer ───────────────────────────────────────────────────────
  // The row carries the totals already; the applications behind them are
  // fetched when the drawer opens rather than shipped with every row of the
  // table. Same shape as the Subjects screen: pick a row, load its detail.
  const [repRow,     setRepRow]     = useState(null);
  const [repApps,    setRepApps]    = useState(null);
  const [repAppsErr, setRepAppsErr] = useState('');
  const [repAppsLoad, setRepAppsLoad] = useState(false);

  useEffect(() => {
    if (!repRow) { setRepApps(null); setRepAppsErr(''); return undefined; }
    let alive = true;
    setRepApps(null); setRepAppsErr(''); setRepAppsLoad(true);
    api.getLeaveRequests({
      teacherId: repRow._id,
      // The same window the report is about, so the list cannot disagree with
      // the totals sitting above it.
      fromDate: rep.window?.startDate || undefined,
      toDate:   rep.window?.endDate   || undefined,
      status:   repStatus || undefined,
      sort: 'recent', limit: 50, page: 1,
    })
      .then((res) => { if (alive) setRepApps(res?.data ?? res ?? []); })
      .catch((err) => { if (alive) setRepAppsErr(err?.response?.data?.message || err.message); })
      .finally(() => { if (alive) setRepAppsLoad(false); });
    return () => { alive = false; };
  }, [repRow, repStatus, rep.window?.startDate, rep.window?.endDate]);

  // A share of the whole, for the tiles' bars. Guarded: a year with no
  // applications must not put NaN% on the page.
  const repShare = (n) => (rep.totals?.applications ? (n / rep.totals.applications) * 100 : 0);
  const repPct   = (n) => `${Math.round(repShare(n))}% of total`;

  // ── Render ────────────────────────────────────────────────────────────────────

  const openApply = () => { setApplyForm(EMPTY_APPLY); setPreview(null); setApplyDocName(''); setApplyModal(true); };

  // The tiles are also the fastest way to narrow the queue — "Pending: 3" is a
  // question, and pressing it should answer it. Pressing the one already in
  // force clears it again.
  const pickStatus = (value) => {
    releaseFocus();
    setReqStatus((cur) => (cur === value ? '' : value));
    setReqPage(1);
    if (tab !== 'requests') setTab('requests');
  };

  const onFilter = (setter) => (value) => { releaseFocus(); setReqPage(1); setter(value); };

  const isQueue = tab === 'requests';
  const pages = reqMeta?.pages || 1;

  return (
    <div className="page leavepg">
      <LeaveHero
        icon="calendarDays"
        title="Leave Management"
        subtitle="Manage leave requests, types, policies and track teacher availability."
        quote="Well-managed leaves build a healthier and happier team."
        scene={LeaveScene}
      />

      <LeaveTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'requests',    label: 'Requests',        icon: 'fileCheck' },
          { value: 'types',       label: 'Leave Types',     icon: 'clipboard' },
          { value: 'policies',    label: 'Policies',        icon: 'sliders' },
          { value: 'allocations', label: 'Allocations',     icon: 'users' },
          { value: 'balance',     label: 'Balance Summary', icon: 'chart' },
          // Only where the school actually runs Comp Off — see hasCompOff.
          ...(hasCompOff ? [{ value: 'compoff', label: 'Comp Off', icon: 'repeat' }] : []),
          { value: 'reports',     label: 'Reports',         icon: 'files' },
        ]}
      />

      {/* Under the tab row, not above it: the tiles describe the tab you are
          on, so they sit inside its section the way Leave Types' four do.
          These five count requests, so they belong to the queue. */}
      {isQueue && (
      <LeaveStats>
        <LeaveStat icon="fileCheck" tone="blue" label="Total Requests"
          value={ov.counts?.total ?? 0}
          caption={ov.academicYear ? 'This Academic Year' : 'All time'}
          on={!reqStatus} onClick={() => pickStatus('')} />
        <LeaveStat icon="clock" tone="amber" label="Pending"
          value={ov.counts?.pending ?? 0} caption="Awaiting approval"
          on={reqStatus === 'pending'} onClick={() => pickStatus('pending')} />
        <LeaveStat icon="checkCircle" tone="green" label="Approved"
          value={ov.counts?.approved ?? 0} caption="This Year"
          on={reqStatus === 'approved'} onClick={() => pickStatus('approved')} />
        <LeaveStat icon="closeCircle" tone="red" label="Rejected"
          value={ov.counts?.rejected ?? 0} caption="This Year"
          on={reqStatus === 'rejected'} onClick={() => pickStatus('rejected')} />
        {/* Not a filter: who is out today is a different question from which
            requests are in which state, and there is no status that answers it. */}
        <LeaveStat icon="calendar" tone="violet" label="On Leave Today"
          value={ov.onLeaveToday ?? 0} caption="Teachers" />
      </LeaveStats>
      )}

      {/* ── Requests — the queue this page opens on ── */}
      {isQueue && (
        <section className="card lvcard">
          <CardHead title="Leave Requests" subtitle="View and manage all leave requests from teachers.">
            <Button variant="secondary" onClick={handleExportRequests} loading={reqExportLoad}>
              <Icon name="download" size={16} /> Export Excel
            </Button>
            <Button onClick={openApply}>
              <Icon name="plus" size={16} /> Apply Leave
            </Button>
          </CardHead>

          <FilterRow>
            <SearchBox value={reqSearch} onChange={setReqSearch}
              placeholder="Search by teacher name, leave type or reason..." />
            <FilterSelect label="Filter by status" value={reqStatus} all="All Statuses"
              options={STATUS_OPTIONS} onChange={onFilter(setReqStatus)} />
            <FilterSelect label="Filter by teacher" value={reqTeacher} all="All Teachers"
              options={teacherList.map((t) => ({ value: t._id, label: t.name }))}
              onChange={onFilter(setReqTeacher)} />
            <FilterSelect label="Filter by leave type" value={reqLeaveType} all="All Types"
              options={leaveTypes.map((t) => ({ value: t._id, label: t.name }))}
              onChange={onFilter(setReqLeaveType)} />
            <DateRange from={reqFromDate} to={reqToDate}
              onFrom={onFilter(setReqFromDate)} onTo={onFilter(setReqToDate)} />
          </FilterRow>

          {/* The request the notification was about is not in this filtered set —
              say so, rather than showing a page that does not hold it. */}
          {focusId && reqMeta?.focusFound === false && (
            <div className="lvnotice">
              <Icon name="alert" size={15} />
              That request is not in the current filters.
              <button type="button" onClick={() => { releaseFocus(); clearReqFilters(); }}>Clear them</button>
            </div>
          )}

          <RequestRows />

          <div className="lvfoot">
            <ShowingCount page={reqMeta?.page || reqPage} limit={reqLimit}
              count={requests.length} total={reqMeta?.total ?? requests.length} />
            <Pager page={reqMeta?.page || reqPage} pages={requests.length ? pages : 0} onPage={onReqPage} />
          </div>
        </section>
      )}

      {/* ── Leave Types ──
          Its own layout: a section header on the page, four tiles, and the
          table beside a rail of notes and shortcuts. */}
      {tab === 'types' && (
        <div className="lvgrid">
          <div className="lvgrid__main">
            <LeaveStats className="lvstats--4">
              <LeaveStat valueFirst icon="layers" tone="indigo" value={typeCounts.total}
                label="Total Leave Types" caption="Active leave types"
                on={!typeStatus} onClick={() => { setTypeStatus(''); setTypePage(1); }} />
              <LeaveStat valueFirst icon="checkCircle" tone="green" value={typeCounts.active}
                label="Active Types" caption="Available for use"
                on={typeStatus === 'active'}
                onClick={() => { setTypeStatus((c) => (c === 'active' ? '' : 'active')); setTypePage(1); }} />
              <LeaveStat valueFirst icon="closeCircle" tone="red" value={typeCounts.inactive}
                label={`Inactive Type${typeCounts.inactive === 1 ? '' : 's'}`} caption="Not available"
                on={typeStatus === 'inactive'}
                onClick={() => { setTypeStatus((c) => (c === 'inactive' ? '' : 'inactive')); setTypePage(1); }} />
              {/* Not a filter: this is a sum of the column, not a subset of
                  the rows, so there is nothing for a press to narrow to. */}
              <LeaveStat valueFirst icon="users" tone="violet" value={typeCounts.allocation}
                label="Total Allocation (Annual)" caption="Across all active types" />
            </LeaveStats>

            <section className="card lvcard">
              <CardHead title="Leave Types" subtitle="Create and manage different types of leave for staff members.">
                <Button onClick={openCreateType}><Icon name="plus" size={16} /> Add Leave Type</Button>
              </CardHead>

              <FilterRow>
                <SearchBox value={typeSearch}
                  onChange={(v) => { setTypeSearch(v); setTypePage(1); }}
                  placeholder="Search leave type by name or code..." />
                <FilterSelect label="Filter by status" value={typeStatus} all="All Statuses"
                  options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
                  onChange={(v) => { setTypeStatus(v); setTypePage(1); }} />
              </FilterRow>

              {typesLoading && !typesData ? (
                <div className="lvtable__state"><Spinner /></div>
              ) : !typeRows.length ? (
                <div className="lvtable__state">
                  <Empty
                    icon={anyTypeFilter ? '🔍' : '📋'}
                    title={anyTypeFilter ? 'No leave types match' : 'No leave types yet'}
                    message={anyTypeFilter
                      ? 'Try another name, code or status.'
                      : 'Add the kinds of leave your staff can apply for — casual, sick, earned, and any the school runs itself.'}
                    action={anyTypeFilter
                      ? <Button variant="secondary" onClick={() => { setTypeSearch(''); setTypeStatus(''); setTypePage(1); }}>Clear filters</Button>
                      : <Button onClick={openCreateType}>+ Add Leave Type</Button>}
                  />
                </div>
              ) : (
                <div className="lvtable__wrap">
                  <table className="lvtable">
                    <thead>
                      <tr>
                        <th className="lvt-num">#</th>
                        <th>Leave Type</th>
                        <th className="lvt-code">Code</th>
                        <th className="lvt-alloc">Annual Allocation</th>
                        <th>Description</th>
                        <th className="lvt-status">Status</th>
                        <th className="lvt-acts">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {typeRows.map((t, i) => (
                        <tr key={t._id} data-focus-id={t._id}>
                          <td className="lvt-num">{(typePageNow - 1) * TYPE_PAGE + i + 1}</td>
                          <td><TypeNameCell type={t} /></td>
                          <td className="lvt-code">{t.code}</td>
                          <td className="lvt-alloc">
                            {/* Comp off is credited by an approved request, so
                                it has no annual figure to show. */}
                            {t.category === 'compoff'
                              ? <span className="lvmuted">Earned on approval</span>
                              : `${t.annualAllocation || 0} days`}
                          </td>
                          <td className="lvt-desc">
                            {t.description
                              ? <span title={t.description}>{t.description}</span>
                              : <span className="lvmuted">No description</span>}
                          </td>
                          <td className="lvt-status">
                            <div className="lvstatuscell">
                              <span className={`lvbadge is-${t.isActive === false ? 'rejected' : 'approved'}`}>
                                {t.isActive === false ? 'Inactive' : 'Active'}
                              </span>
                              <Toggle on={t.isActive !== false} disabled={toggling === t._id}
                                label={`${t.isActive === false ? 'Activate' : 'Deactivate'} ${t.name}`}
                                onChange={(next) => toggleTypeActive(t, next)} />
                            </div>
                          </td>
                          <td className="lvt-acts">
                            <RowActions>
                              <IconAction icon="pencil" label={`Edit ${t.name}`} variant="edit"
                                onClick={() => openEditType(t)} />
                              <IconAction icon="trash" label={`Delete ${t.name}`} variant="danger"
                                onClick={() => openDeleteType(t)} />
                            </RowActions>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="lvfoot">
                <ShowingCount page={typePageNow} limit={TYPE_PAGE} count={typeRows.length}
                  total={typesFiltered.length} noun="leave type" />
                {/* Nothing to page through when the filter emptied the table. */}
                <Pager page={typePageNow} pages={typesFiltered.length ? typePages : 0} onPage={setTypePage} />
              </div>
            </section>
          </div>

          <aside className="lvgrid__side">
            <NotesPanel title="Important Notes" notes={[
              'Annual allocation is per teacher per academic year.',
              'Inactive leave types will not be available for new requests.',
              'You can customize leave policies for each type.',
              'Changes will apply to future requests only.',
            ]} />
            <QuickLinks title="Quick Actions" items={[
              { icon: 'sliders', tone: 'indigo', label: 'Leave Policies',
                sub: 'Configure leave rules', onClick: () => setTab('policies') },
              { icon: 'checkSquare', tone: 'violet', label: 'Manage Allocations',
                sub: 'Set leave balance', onClick: () => setTab('allocations') },
              { icon: 'download', tone: 'green', label: 'Download Report',
                sub: 'Export leave type list', onClick: exportTypes },
            ]} />
          </aside>
        </div>
      )}

      {/* ── Allocations ──
          Who holds how many days of what, for one academic year. Four tiles,
          then a card whose header carries the year the whole table is about. */}
      {tab === 'allocations' && (
        <>
          <LeaveStats className="lvstats--4">
            <LeaveStat valueFirst icon="users" tone="indigo" value={allocCounts.teachers}
              label="Total Teachers" caption="All departments"
              on={!allocState} onClick={() => { setAllocState(''); setAllocPage(1); }} />
            {/* Not a filter: the types are the columns of this table, not a
                subset of its rows. */}
            <LeaveStat valueFirst icon="fileCheck" tone="blue" value={allocCounts.types}
              label="Leave Types" caption="Configured" />
            <LeaveStat valueFirst icon="checkCircle" tone="green" value={allocCounts.allocated}
              label="Allocated" caption="Teachers have allocation"
              on={allocState === 'allocated'}
              onClick={() => { setAllocState((c) => (c === 'allocated' ? '' : 'allocated')); setAllocPage(1); }} />
            <LeaveStat valueFirst icon="alert" tone="red" value={allocCounts.none}
              label="Not Allocated" caption="Ready to allocate"
              on={allocState === 'none'}
              onClick={() => { setAllocState((c) => (c === 'none' ? '' : 'none')); setAllocPage(1); }} />
          </LeaveStats>

          <section className="card lvcard">
            <CardHead icon="userPlus" title="Leave Type Allocation"
              subtitle="Allocate annual leave balances to teachers for the selected academic year.">
              <HeadField label="Academic Year">
                <select className="form-control lvsel" value={allocYear || allocMeta?.academicYear || ''}
                  onChange={(e) => { setAllocYear(e.target.value); setAllocPage(1); }}>
                  {academicYears.map((y) => <option key={y.label} value={y.label}>{y.label}</option>)}
                </select>
              </HeadField>
              <FilterSelect label="Filter by department" value={allocDept} all="All Departments"
                options={allocDepts} onChange={(v) => { setAllocDept(v); setAllocPage(1); }} />
              <SplitButton
                label="Allocate" icon="plus"
                onClick={() => openAllocate(allocSelection.ids)}
                items={[
                  { icon: 'repeat', label: 'Carry Forward', sub: 'Roll last year’s balances in',
                    onClick: () => { setCfForm(defaultCarryForward(academicYears)); setCfModal(true); } },
                  { icon: 'refresh', label: 'Run Accrual', sub: 'Credit this month’s days',
                    onClick: handleRunAccrual },
                  { icon: 'trash', label: 'Clear Allocation', danger: true, sub: 'Zero the days, keep the history',
                    onClick: () => { setClearForm(EMPTY_CLEAR); setClearModal(true); } },
                ]}
              />
            </CardHead>

            <FilterRow>
              <SearchBox value={allocSearch}
                onChange={(v) => { setAllocSearch(v); setAllocPage(1); }}
                placeholder="Search by teacher name, department or leave type..." />
              {/* Acts on the ticked rows when there are any, and on everyone
                  when there are not — the label says which. */}
              <Button variant="secondary" onClick={() => openAllocate(allocSelection.ids)}>
                <Icon name="layers" size={16} />
                {allocSelection.ids.length ? `Allocate to ${allocSelection.ids.length}` : 'Bulk Allocate'}
              </Button>
              <Button variant="secondary" onClick={() => setAllocImportModal(true)}>
                <Icon name="upload" size={16} /> Import Excel
              </Button>
              <Button variant="secondary" onClick={handleExportAllocations} loading={allocExportLoad}>
                <Icon name="download" size={16} /> Export Excel
              </Button>
            </FilterRow>

            {allocLoading && !allocData ? (
              <div className="lvtable__state"><Spinner /></div>
            ) : !allocShown.length ? (
              <div className="lvtable__state">
                <Empty
                  icon={anyAllocFilter ? '🔍' : '👥'}
                  title={anyAllocFilter ? 'No teachers match' : 'No teachers yet'}
                  message={anyAllocFilter
                    ? 'Try another name, department or allocation state.'
                    : 'Add staff before allocating leave to them.'}
                  action={anyAllocFilter
                    ? <Button variant="secondary" onClick={() => { setAllocSearch(''); setAllocDept(''); setAllocState(''); setAllocPage(1); }}>Clear filters</Button>
                    : null}
                />
              </div>
            ) : (
              <div className="lvtable__wrap">
                <table className="lvtable">
                  <thead>
                    <tr>
                      <th className="lvt-tick">
                        <input type="checkbox" checked={allocSelection.allOn}
                          ref={(el) => { if (el) el.indeterminate = allocSelection.some; }}
                          onChange={allocSelection.toggleAll}
                          aria-label="Select every teacher on this page" />
                      </th>
                      <th className="lvt-num">#</th>
                      <th>Teacher</th>
                      <th className="lvt-dept">Department</th>
                      <th>Leave Allocation</th>
                      <th className="lvt-total">Total Allocated</th>
                      <th className="lvt-status">Status</th>
                      <th className="lvt-acts">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocShown.map((r, i) => (
                      <tr key={r._id} data-focus-id={r._id}
                        className={allocSelection.has(r._id) ? 'is-picked' : undefined}>
                        <td className="lvt-tick">
                          <input type="checkbox" checked={allocSelection.has(r._id)}
                            onChange={() => allocSelection.toggle(r._id)}
                            aria-label={`Select ${r.teacher?.name || 'this teacher'}`} />
                        </td>
                        <td className="lvt-num">{(allocPageNow - 1) * ALLOC_PAGE + i + 1}</td>
                        <td><TeacherCell request={r} /></td>
                        <td className="lvt-dept">
                          {r.department || <span className="lvmuted">No department</span>}
                        </td>
                        <td><AllocChips balances={r.balances} tones={chipTone} /></td>
                        <td className="lvt-total">
                          {r.balances.length ? `${dayNum(r.total)} days` : <span className="lvmuted">—</span>}
                        </td>
                        <td className="lvt-status">
                          <span className={`lvbadge is-${r.balances.length ? 'approved' : 'pending'}`}>
                            {r.balances.length ? 'Allocated' : 'Not allocated'}
                          </span>
                        </td>
                        <td className="lvt-acts">
                          <div className="lvrowacts">
                            <RowActions>
                              <IconAction icon="eye" disabled={!r.balances.length}
                                label={`View ${r.teacher?.name || 'teacher'} balances`}
                                onClick={() => openBalances(r)} />
                              <IconAction icon="pencil" variant="edit"
                                label={`Allocate to ${r.teacher?.name || 'this teacher'}`}
                                onClick={() => openAllocate([r._id])} />
                              <RowMenu>
                              <MenuItem icon="plus" onClick={() => openAllocate([r._id])}>
                                Allocate to this teacher
                              </MenuItem>
                              {r.department && (
                                <MenuItem icon="users" onClick={() => { setAllocDept(r.department); setAllocPage(1); }}>
                                  Only {r.department}
                                </MenuItem>
                              )}
                              {r.balances.length > 0 && (
                                <>
                                  <MenuSep />
                                  <MenuItem icon="trash" danger
                                    onClick={() => { setClearForm({ ...EMPTY_CLEAR, teacherMode: 'select', checkedTeachers: [r._id] }); setClearModal(true); }}>
                                    Clear allocation
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
              <ShowingCount page={allocPageNow} limit={ALLOC_PAGE} count={allocShown.length}
                total={allocFiltered.length} noun="teacher" />
              <Pager page={allocPageNow} pages={allocFiltered.length ? allocPages : 0} onPage={setAllocPage} />
            </div>
          </section>
        </>
      )}

      {/* ── Balance Summary ──
          What is left rather than what was given: four tiles, a grid of every
          teacher against every leave type, and a rail that sums the year. */}
      {tab === 'balance' && (
        <>
          <LeaveStats className="lvstats--4">
            <LeaveStat valueFirst icon="users" tone="indigo" value={balCounts.teachers}
              label="Total Teachers" caption="All departments"
              on={!balLow} onClick={() => { setBalLow(false); setBalPage(1); }} />
            {/* Not a filter: the types are the columns of this table, not a
                subset of its rows. */}
            <LeaveStat valueFirst icon="fileCheck" tone="blue" value={balCounts.types}
              label="Leave Types" caption="Active types" />
            <LeaveStat valueFirst icon="checkCircle" tone="green" value={balCounts.withBal}
              label="Teachers with Balance"
              caption={`For ${allocYear || allocMeta?.academicYear || 'this year'}`} />
            <LeaveStat valueFirst icon="clock" tone="red" value={balCounts.low}
              label="Low Balance" caption={`(≤ ${LOW_BALANCE} days)`}
              on={balLow} onClick={() => { setBalLow((v) => !v); setBalPage(1); }} />
          </LeaveStats>

          <div className="lvgrid">
            <div className="lvgrid__main">
              <section className="card lvcard">
                <CardHead icon="chart" title="Leave Balance Summary"
                  subtitle="View and manage leave balances for all teachers.">
                  <HeadField label="Academic Year">
                    <select className="form-control lvsel" value={allocYear || allocMeta?.academicYear || ''}
                      onChange={(e) => { setAllocYear(e.target.value); setBalPage(1); }}>
                      {academicYears.map((y) => <option key={y.label} value={y.label}>{y.label}</option>)}
                    </select>
                  </HeadField>
                  <HeadField label="Department">
                    <FilterSelect label="Filter by department" value={balDept} all="All Departments"
                      options={allocDepts} onChange={(v) => { setBalDept(v); setBalPage(1); }} />
                  </HeadField>
                  <Button variant="secondary" onClick={handleExportAllocations} loading={allocExportLoad}>
                    <Icon name="download" size={16} /> Export Excel
                  </Button>
                </CardHead>

                {allocLoading && !allocData ? (
                  <div className="lvtable__state"><Spinner /></div>
                ) : !balShown.length ? (
                  <div className="lvtable__state">
                    <Empty
                      icon={anyBalFilter ? '🔍' : '📊'}
                      title={anyBalFilter ? 'No teachers match' : 'No balances yet'}
                      message={anyBalFilter
                        ? 'Try another name, department, or turn the low-balance filter off.'
                        : 'Allocate leave to your staff and their balances appear here.'}
                      action={anyBalFilter
                        ? <Button variant="secondary" onClick={() => { setBalSearch(''); setBalDept(''); setBalLow(false); setBalPage(1); }}>Clear filters</Button>
                        : <Button onClick={() => setTab('allocations')}>Go to Allocations</Button>}
                    />
                  </div>
                ) : (
                  <div className="lvtable__wrap">
                    <table className="lvtable lvtable--grouped">
                      {/* Two header rows: the per-type columns are one group, and
                          saying so once beats repeating "balance" four times. */}
                      <thead>
                        <tr>
                          <th className="lvt-num" rowSpan={2}>#</th>
                          <th rowSpan={2}>Teacher</th>
                          <th className="lvt-dept" rowSpan={2}>Department</th>
                          <th className="lvt-group" colSpan={Math.max(1, balTypes.length)}>Leave Balance</th>
                          <th className="lvt-total" rowSpan={2}>Total</th>
                          <th className="lvt-status" rowSpan={2}>Status</th>
                          <th className="lvt-acts" rowSpan={2}>Actions</th>
                        </tr>
                        <tr>
                          {balTypes.length
                            ? balTypes.map((t) => (
                                <th key={t._id} className="lvt-code lvt-sub" title={t.name}>{t.code}</th>
                              ))
                            : <th className="lvt-sub" />}
                        </tr>
                      </thead>
                      <tbody>
                        {balShown.map((r, i) => (
                          <tr key={r._id} data-focus-id={r._id}>
                            <td className="lvt-num">{(balPageNow - 1) * BAL_PAGE + i + 1}</td>
                            <td><TeacherCell request={r} /></td>
                            <td className="lvt-dept">
                              {r.department || <span className="lvmuted">—</span>}
                            </td>
                            {r.cells.map((c) => (
                              <td key={c.type._id} className="lvt-cell">
                                {c.has
                                  ? <BalancePill days={c.left} tone={chipTone[String(c.type._id)]}
                                      low={c.left <= LOW_BALANCE}
                                      title={`${c.type.name}: ${dayNum(c.left)} day(s) left`} />
                                  : <span className="lvmuted">—</span>}
                              </td>
                            ))}
                            <td className="lvt-total">
                              {r.hasAny ? dayNum(r.remaining) : <span className="lvmuted">—</span>}
                            </td>
                            <td className="lvt-status">
                              <span className={`lvbadge is-${!r.hasAny ? 'cancelled' : r.low ? 'rejected' : 'approved'}`}>
                                {!r.hasAny ? 'No balance' : r.low ? 'Low Balance' : 'Healthy'}
                              </span>
                            </td>
                            <td className="lvt-acts">
                              <div className="lvrowacts">
                                <RowActions>
                                  <IconAction icon="eye" disabled={!r.hasAny}
                                    label={`View ${r.teacher?.name || 'teacher'} balances`}
                                    onClick={() => openBalances(r)} />
                                  <IconAction icon="pencil" variant="edit"
                                    label={`Adjust ${r.teacher?.name || 'this teacher'} allocation`}
                                    onClick={() => openAllocate([r._id])} />
                                  <RowMenu>
                                  {r.department && (
                                    <MenuItem icon="users" onClick={() => { setBalDept(r.department); setBalPage(1); }}>
                                      Only {r.department}
                                    </MenuItem>
                                  )}
                                  <MenuSep />
                                  <MenuItem icon="fileCheck" onClick={() => { releaseFocus(); setReqTeacher(r._id); setReqPage(1); setTab('requests'); }}>
                                    See their requests
                                  </MenuItem>
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
                  <ShowingCount page={balPageNow} limit={BAL_PAGE} count={balShown.length}
                    total={balFiltered.length} noun="teacher" />
                  <Pager page={balPageNow} pages={balFiltered.length ? balPages : 0} onPage={setBalPage} />
                </div>
              </section>
            </div>

            <aside className="lvgrid__side">
              <section className="lvrail">
                <header>
                  <span className="lvrail__mark lvrail__mark--info"><Icon name="chart" size={17} /></span>
                  <h3>Leave Type Totals</h3>
                </header>
                <LeaveDonut
                  slices={donutSlices(balTotals, chipTone)}
                  total={balTotalDays}
                  caption="Total Days"
                  emptyNote="Nothing allocated yet, so there is nothing left to count."
                />
              </section>

              <QuickLinks title="Quick Actions" items={[
                { icon: 'users', tone: 'indigo', label: 'Bulk Allocate',
                  sub: 'Allocate leave to multiple teachers',
                  onClick: () => { setTab('allocations'); openAllocate([]); } },
                { icon: 'sliders', tone: 'violet', label: 'Adjust Balance',
                  sub: 'Manually update teacher balance',
                  onClick: () => { setTab('allocations'); openAllocate([]); } },
                { icon: 'download', tone: 'green', label: 'Download Report',
                  sub: 'Export balance summary', onClick: handleExportAllocations },
              ]} />

              <HelpPanel
                title="Need Help?"
                text="Learn how leave balance allocation works or check the leave policy."
                action={(
                  <Button variant="secondary" onClick={() => setTab('policies')}>
                    <Icon name="fileCheck" size={16} /> View Leave Policy
                  </Button>
                )}
              />
            </aside>
          </div>
        </>
      )}

      {/* ── Reports ──
          What the year came to: a header of its own, four tiles that carry
          their share as well as their count, two charts, and the teacher table
          under them. */}
      {tab === 'reports' && (
        <>
          <SectionHead title="Leave Reports"
            subtitle="Get insights on leave usage, trends, and teacher-wise summary.">
            <HeadField label="Academic Year">
              <select className="form-control lvsel" value={repYear || rep.academicYear || ''}
                onChange={(e) => { setRepYear(e.target.value); setRepPage(1); }}>
                {(rep.academicYears || academicYears).map((y) => (
                  <option key={y.label} value={y.label}>{y.label}</option>
                ))}
              </select>
            </HeadField>
            <FilterSelect label="Filter by department" value={repDept} all="All Departments"
              options={rep.departments || []} onChange={(v) => { setRepDept(v); setRepPage(1); }} />
            <FilterSelect label="Filter by leave type" value={repType} all="All Leave Types"
              options={leaveTypes.map((t) => ({ value: t._id, label: t.name }))}
              onChange={(v) => { setRepType(v); setRepPage(1); }} />
            <Button onClick={handleExport} loading={exportLoad}>
              <Icon name="download" size={16} /> Export Excel
            </Button>
          </SectionHead>

          <LeaveStats className="lvstats--4">
            <LeaveStat icon="fileCheck" tone="blue" label="Total Leave Applications"
              value={rep.totals?.applications ?? 0}
              delta={rep.lastYear?.deltaPct ?? undefined}
              caption={rep.lastYear?.deltaPct == null
                ? (rep.academicYear ? `In ${rep.academicYear}` : 'All time')
                : undefined} />
            <LeaveStat icon="checkCircle" tone="green" label="Approved"
              value={rep.totals?.approved ?? 0}
              caption={repPct(rep.totals?.approved || 0)}
              share={repShare(rep.totals?.approved || 0)} />
            <LeaveStat icon="clock" tone="amber" label="Pending"
              value={rep.totals?.pending ?? 0}
              caption={repPct(rep.totals?.pending || 0)}
              share={repShare(rep.totals?.pending || 0)} />
            <LeaveStat icon="closeCircle" tone="red" label="Rejected"
              value={rep.totals?.rejected ?? 0}
              caption={repPct(rep.totals?.rejected || 0)}
              share={repShare(rep.totals?.rejected || 0)} />
          </LeaveStats>

          <div className="lvcharts">
            <ChartCard icon="chart" title="Leave Applications Trend"
              subtitle={repType
                ? 'Month-wise leave applications (one type)'
                : 'Month-wise leave applications (all types)'}
              control={(
                <select className="form-control lvsel" value={repGrain}
                  onChange={(e) => setRepGrain(e.target.value)} aria-label="Trend grain">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              )}>
              {repLoading && !repData
                ? <div className="lvtable__state"><Spinner /></div>
                : <TrendBars data={repTrend}
                    emptyNote="No leave was applied for in this year yet, so there is no trend to draw." />}
            </ChartCard>

            <ChartCard icon="target" tone="violet" title="Leave Type Distribution"
              subtitle="Share of leave applications by type"
              control={(
                <select className="form-control lvsel" value={repYear || rep.academicYear || ''}
                  onChange={(e) => { setRepYear(e.target.value); setRepPage(1); }}
                  aria-label="Distribution year">
                  {(rep.academicYears || academicYears).map((y) => (
                    <option key={y.label} value={y.label}>{y.label}</option>
                  ))}
                </select>
              )}>
              {repLoading && !repData
                ? <div className="lvtable__state"><Spinner /></div>
                : <LeaveDonut showPct unit="applications"
                    slices={donutSlices(
                      repTypes.map((t) => ({ _id: t._id, name: t.name, days: t.count })),
                      repTone, 4)}
                    total={rep.totals?.applications ?? 0}
                    caption="Applications"
                    emptyNote="Nothing has been applied for in this year yet." />}
            </ChartCard>
          </div>

          <section className="card lvcard">
            <CardHead icon="users" title="Teacher-wise Leave Report"
              subtitle="Detailed leave summary for each teacher.">
              <SearchBox value={repSearch}
                onChange={(v) => { setRepSearch(v); setRepPage(1); }}
                placeholder="Search teacher..." />
              <FilterSelect label="Filter by status" value={repStatus} all="All Statuses"
                options={STATUS_OPTIONS} onChange={(v) => { setRepStatus(v); setRepPage(1); }} />
            </CardHead>

            {repLoading && !repData ? (
              <div className="lvtable__state"><Spinner /></div>
            ) : !repShown.length ? (
              <div className="lvtable__state">
                <Empty
                  icon={repSearch ? '🔍' : '📄'}
                  title={repSearch ? 'No teachers match' : 'Nothing to report yet'}
                  message={repSearch
                    ? 'Try another name, employee ID or department.'
                    : 'Once staff start filing leave, their totals appear here.'}
                  action={repSearch
                    ? <Button variant="secondary" onClick={() => { setRepSearch(''); setRepPage(1); }}>Clear search</Button>
                    : null}
                />
              </div>
            ) : (
              <div className="lvtable__wrap">
                <table className="lvtable">
                  <thead>
                    <tr>
                      <th className="lvt-num">#</th>
                      <th>Teacher</th>
                      <th className="lvt-dept">Department</th>
                      {/* One column per type that actually appears this year —
                          a type nobody took does not earn a column of zeroes. */}
                      {repTypes.map((t) => (
                        <th key={t._id} className="lvt-cell" title={`${t.name} — days taken`}>
                          {t.name.replace(/\s*leave\s*$/i, '')}
                        </th>
                      ))}
                      <th className="lvt-total">Total</th>
                      <th className="lvt-acts">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repShown.map((t, i) => (
                      <tr key={t._id} data-focus-id={t._id}>
                        <td className="lvt-num">{(repPageNow - 1) * REP_PAGE + i + 1}</td>
                        <td><TeacherCell request={{ teacher: t }} /></td>
                        <td className="lvt-dept">{t.department || <span className="lvmuted">—</span>}</td>
                        {repTypes.map((ty) => {
                          const d = t.perType?.[ty._id] || 0;
                          return (
                            <td key={ty._id} className="lvt-cell">
                              {d ? dayNum(d) : <span className="lvmuted">0</span>}
                            </td>
                          );
                        })}
                        <td className="lvt-total">{dayNum(t.days)}</td>
                        <td className="lvt-acts">
                          <RowActions>
                            <IconAction icon="eye" label={`View ${t.name}'s leave`}
                              onClick={() => setRepRow(t)} />
                          </RowActions>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="lvfoot">
              <ShowingCount page={repPageNow} limit={REP_PAGE} count={repShown.length}
                total={repRows.length} noun="teacher" />
              <Pager page={repPageNow} pages={repRows.length ? repPages : 0} onPage={setRepPage} />
            </div>
          </section>
        </>
      )}

      {/* Comp Off and Policies bring tab strips and cards of their own, so they
          sit under the tab row rather than inside a card that would nest. */}
      {tab === 'compoff' && hasCompOff && <AdminCompOff />}

      {/* A saved policy changes the rules the other tabs render from, so the
          merged type list is pulled again the moment it is written. */}
      {tab === 'policies' && (
        <AdminLeavePolicies
          onSaved={() => { refetchTypes(); refetchAlloc(); }}
          // The type dialog lives on this page, so the policy editor's "Add
          // Type" borrows it rather than growing a second one.
          onAddType={openCreateType}
        />
      )}

      <ReportDrawer
        open={!!repRow}
        teacher={repRow}
        academicYear={rep.academicYear}
        types={repTypes}
        tones={repTone}
        applications={repApps}
        loading={repAppsLoad}
        error={repAppsErr}
        onClose={() => setRepRow(null)}
        // Deciding on any of these happens in the queue, so the drawer hands
        // over to it rather than growing its own approve buttons.
        onSeeRequests={() => {
          const id = repRow?._id;
          setRepRow(null);
          releaseFocus(); setReqTeacher(id); setReqPage(1); setTab('requests');
        }}
      />

      <RequestDrawer
        request={detail}
        busy={actLoad}
        onClose={() => setDetail(null)}
        onDecide={(kind, r) => askDecision(kind, r)}
      />

      {/* ── Approve / Reject / Reverse ── */}
      <DecisionDialog
        open={!!decision}
        kind={decision?.kind}
        request={decision?.request}
        comment={comment}
        onComment={setComment}
        loading={actLoad}
        onClose={() => { setDecision(null); setComment(''); }}
        onConfirm={runDecision}
      />

      {/* ── Admin Apply Modal ── */}
      <Modal open={applyModal} onClose={closeApply} maxWidth={980}
        title={<DialogHead icon="userPlus" title="Apply Leave for Teacher"
          subtitle="Create a leave request on behalf of a teacher. It will be processed as per school policy." />}
        footer={<>
          <Button variant="secondary" onClick={closeApply}>Cancel</Button>
          {/* Every `warning` the preview returns is a rule the POST would reject
              outright (overlap, back-dating, eligibility), so submitting into a
              guaranteed failure is not offered. */}
          <Button form="admin-apply-form" type="submit" loading={applyLoad}
            disabled={!!preview?.days?.error || preview?.sufficient === false || !!preview?.warning}>
            <Icon name="arrowRight" size={16} /> Apply Leave
          </Button>
        </>}>
        {(() => {
        const applyLT     = leaveTypes.find((t) => t._id === applyForm.leaveTypeId);
        const applyBounds = leaveDateBounds(applyLT, { onBehalf: true });
        const applyHint   = leaveDateHint(applyLT, { onBehalf: true });
        const who         = teacherList.find((t) => t._id === applyForm.teacherId);
        const rules       = preview?.dateRules;
        return (
        <div className="lvapply">
          <form id="admin-apply-form" className="lvapply__form" onSubmit={handleApply} noValidate>

            <FormStep n={1} title="Select Teacher" note="Choose the teacher for whom you want to apply leave.">
              <label className="lvfield">
                <span className="lvfield__label">Teacher <i>*</i></span>
                <select className="form-control" required value={applyForm.teacherId}
                  onChange={(e) => setApplyForm((f) => ({ ...f, teacherId: e.target.value }))}>
                  <option value="">Select teacher…</option>
                  {teacherList.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}{t.employeeId ? ` · ${t.employeeId}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {/* Enough of the record to be sure it is the right person before
                  filing leave in their name. */}
              {who && (
                <div className="lvwhofacts">
                  <div><small>Department</small><b>{who.department || '—'}</b></div>
                  <div><small>Designation</small><b>{who.designation || '—'}</b></div>
                  <div><small>Join Date</small><b>{who.joiningDate ? fmtDate(who.joiningDate) : '—'}</b></div>
                  <div><small>Employment</small><b>{who.employmentType
                    ? who.employmentType[0].toUpperCase() + who.employmentType.slice(1)
                    : '—'}</b></div>
                </div>
              )}
            </FormStep>

            <FormStep n={2} title="Leave Details" note="Select leave type, dates and mode.">
              <div className="lvpolrow lvpolrow--2">
                <label className="lvfield">
                  <span className="lvfield__label">Leave Type <i>*</i></span>
                  <select className="form-control" required value={applyForm.leaveTypeId}
                    onChange={(e) => setApplyForm((f) => ({ ...f, leaveTypeId: e.target.value }))}>
                    <option value="">Select type…</option>
                    {leaveTypes.filter((t) => t.isActive).map((t) => (
                      <option key={t._id} value={t._id}>{t.name} ({t.code})</option>
                    ))}
                  </select>
                </label>
                <div className="lvfield">
                  <span className="lvfield__label">Leave Mode <i>*</i></span>
                  <ChoiceCards name="adminLeaveMode" value={applyForm.leaveMode}
                    onChange={(v) => setApplyForm((f) => ({ ...f, leaveMode: v }))}
                    options={[
                      { value: 'full_day', label: 'Full Day' },
                      { value: 'half_day', label: 'Half Day',
                        disabled: rules ? rules.halfDayAllowed === false : false,
                        disabledHint: 'This leave type does not allow half days' },
                    ]} />
                </div>
              </div>

              {/* Which half decides which periods need cover, so the substitute
                  engine cannot arrange anything without it. */}
              {applyForm.leaveMode === 'half_day' && (
                <label className="lvfield">
                  <span className="lvfield__label">Which half</span>
                  <select className="form-control" value={applyForm.halfDaySession}
                    onChange={(e) => setApplyForm((f) => ({ ...f, halfDaySession: e.target.value }))}>
                    <option value="first">First half (morning)</option>
                    <option value="second">Second half (afternoon)</option>
                  </select>
                </label>
              )}

              <div className="lvdates">
                <label className="lvfield">
                  <span className="lvfield__label">From Date <i>*</i></span>
                  <input type="date" className="form-control" required value={applyForm.fromDate}
                    min={applyBounds.minFrom || undefined}
                    onChange={(e) => {
                      const fromDate = e.target.value;
                      // A To date now earlier than From can only confuse — carry
                      // it forward rather than leave an impossible range on screen.
                      setApplyForm((f) => ({ ...f, fromDate, toDate: f.toDate && f.toDate < fromDate ? fromDate : f.toDate }));
                    }} />
                </label>
                <label className="lvfield">
                  <span className="lvfield__label">To Date <i>*</i></span>
                  <input type="date" className="form-control" required value={applyForm.toDate}
                    min={applyForm.fromDate || applyBounds.minFrom || undefined}
                    onChange={(e) => setApplyForm((f) => ({ ...f, toDate: e.target.value }))} />
                </label>
                <div className={`lvduration${preview?.days?.error ? ' is-bad' : ''}`}>
                  <Icon name="calendar" size={16} />
                  <span>
                    <small>Total Days</small>
                    <b>{preview?.days && !preview.days.error
                      ? `${preview.days.totalDays} day${preview.days.totalDays === 1 ? '' : 's'}`
                      : '—'}</b>
                  </span>
                </div>
              </div>
              {applyHint && <p className="lvfield__hint">{applyHint}</p>}

              {/* What the picked dates actually cost. Weekends, school holidays
                  and the type's sandwich rule all change the answer, so it comes
                  from the server rather than being guessed in the browser. */}
              {preview?.days && (
                <div style={{ opacity: previewLoad ? 0.5 : 1, transition: 'opacity .15s' }}>
                  {preview.days.error ? (
                    <div className="lvnotice lvnotice--flat lvnotice--bad">
                      <Icon name="alert" size={15} /><span>{preview.days.error}</span>
                    </div>
                  ) : (
                    <div className={`lvnotice lvnotice--flat${preview.sufficient === false ? ' lvnotice--bad' : ''}`}>
                      <Icon name="alert" size={15} />
                      <span>
                        {preview.days.totalDays} {preview.days.leaveMode === 'half_day' ? 'day (half day)' : 'working day(s)'}
                        {' '}out of {preview.days.calendarDays} calendar day(s). {describeDayCount(preview.days)}
                        {preview.days.lopDays > 0 && (
                          <> <b>{preview.days.paidDays} paid · {preview.days.lopDays} loss of pay</b> — payroll deducts the unpaid days.</>
                        )}
                        {preview.sufficient === false && (
                          <> <b>Insufficient balance</b> — {preview.days.totalDays} needed, {preview.balance?.spendable} available.</>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {preview?.warning && !preview?.days?.error && (
                <div className="lvnotice lvnotice--warn lvnotice--flat">
                  <Icon name="alert" size={15} /><span>{preview.warning}</span>
                </div>
              )}
            </FormStep>

            <FormStep n={3} title="Reason" note="Add a reason for the leave request.">
              <textarea className="form-control" rows={3} required maxLength={500}
                value={applyForm.reason}
                onChange={(e) => setApplyForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Enter reason for leave (minimum 10 characters)…" />
              <div className="lvcount">
                <span />
                <span>{applyForm.reason.length} / 500</span>
              </div>
            </FormStep>

            <FormStep n={4} title={<>Supporting Document <i className="lvopt">(Optional)</i></>}
              note="Upload any relevant document (e.g. medical certificate, event invitation).">
              <DropZone
                inputRef={applyDocRef}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                hint="PDF, Word, or image (JPG, PNG) — max 5 MB"
                fileName={applyDocName}
                onPick={() => setApplyDocName(applyDocRef.current?.files?.[0]?.name || '')}
              />
            </FormStep>
          </form>

          <aside className="lvapply__side">
            <div className="lvsidehead">
              <b>Leave Balance <small>(Current Year)</small></b>
              <button type="button" className="lvlink"
                onClick={() => { closeApply(); setTab('balance'); }}>View Full Balance</button>
            </div>

            {previewLoad && !preview ? (
              <div className="lvtable__state"><Spinner /></div>
            ) : !preview ? (
              <p className="lvrail__none">
                Pick a teacher and a leave type, and their balance for it appears here.
              </p>
            ) : preview.balance?.allocated ? (
              <>
                <div className="lvbalbox">
                  <TypeIcon type={preview.leaveType} />
                  <div className="lvbalbox__id">
                    <b>{preview.leaveType?.name} ({preview.leaveType?.code})</b>
                    <small>{preview.balance.academicYear || '—'}</small>
                  </div>
                  <div className="lvbalbox__n">
                    <strong>{dayNum(preview.balance.remaining)}</strong>
                    <small>days remaining</small>
                  </div>
                </div>
                {/* Overdraft is a policy setting — say so rather than let the
                    admin wonder why more days than "remaining" go through. */}
                {preview.balance.spendable > preview.balance.remaining && (
                  <p className="lvfield__hint">
                    Policy allows up to {preview.balance.spendable} day(s) — a negative balance is permitted.
                  </p>
                )}
              </>
            ) : (
              <div className="lvnotice lvnotice--warn lvnotice--flat">
                <Icon name="alert" size={15} />
                <span>
                  No allocation this year — <b>0 days available</b>.
                  {preview.leaveType?.category === 'compoff'
                    ? ' Comp Off is credited only when a Comp Off request is approved.'
                    : ' Allocate this leave type first, under the Allocations tab.'}
                </span>
              </div>
            )}

            <DialogNote>
              The leave balance shown is for the selected teacher for the current academic year.
            </DialogNote>

            {rules && (
              <section className="card lvpolbox">
                <header>
                  <span className="lvsumhead__mark"><Icon name="fileCheck" size={18} /></span>
                  <b>Policy Information</b>
                </header>
                <div className="lvsumlines">
                  <SummaryLine label="Minimum days per application"
                    value={rules.minDaysPerApplication > 0 ? `${dayNum(rules.minDaysPerApplication)} day(s)` : 'None'} />
                  <SummaryLine label="Maximum consecutive days"
                    value={rules.maxConsecutiveDays > 0 ? `${dayNum(rules.maxConsecutiveDays)} days` : 'No limit'} />
                  {/* Waived for an admin filing on someone's behalf — the notice
                      period is the employee's obligation, not the office's. */}
                  <SummaryLine label="Advance notice required"
                    value={rules.advanceNoticeDays > 0 ? `${dayNum(rules.advanceNoticeDays)} days` : 'Not for admins'} />
                  <SummaryLine label="Allows half day" value={rules.halfDayAllowed ? 'Yes' : 'No'} />
                  <SummaryLine label="Requires document"
                    value={!rules.requiresDocument
                      ? 'No'
                      : rules.documentRequiredAfterDays > 0
                        ? `Past ${dayNum(rules.documentRequiredAfterDays)} days`
                        : 'Yes'} />
                </div>
              </section>
            )}

            <div className="lvnotice lvnotice--warn lvnotice--flat">
              <Icon name="alert" size={15} />
              <span>
                This leave request will be submitted on behalf of the teacher and is subject
                to the normal approval workflow.
              </span>
            </div>
          </aside>
        </div>
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
          {/* Shown beside the type wherever it is listed, so "CL" does not have
              to be institutional knowledge. */}
          <div className="form-group">
            <label className="form-label">Description</label>
            <input type="text" className="form-control" value={typeForm.description || ''}
              maxLength={160} placeholder="e.g. For personal work and short leaves."
              onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))} />
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
                        <tr key={a._id} data-focus-id={a._id}>
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
                        <tr key={a._id} data-focus-id={a._id}>
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

      {/* ── One teacher's balances, beside the table ──
          A slide-over rather than a dialog, the same way a subject opens on the
          Subjects screen: a modal would black out the list the admin filtered
          their way to, just to show them one person. */}
      <BalanceDrawer
        open={!!balanceRow}
        teacher={balanceRow?.teacher}
        academicYear={allocYear || allocMeta?.academicYear}
        balances={balanceRow?.balances || []}
        tones={chipTone}
        low={LOW_BALANCE}
        onClose={() => setBalanceRow(null)}
        onAdjust={() => { const id = balanceRow?._id; setBalanceRow(null); openAllocate([id]); }}
      />

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
