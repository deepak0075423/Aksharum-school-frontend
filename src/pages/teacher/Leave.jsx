import React, { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getMyLeaves, getLeaveBalance, applyLeave, cancelLeave, getHolidays, getModules } from '../../api/teacher.api';
import { Button, Modal, Confirm, Spinner, Empty } from '../../components/ui/index';
import Icon, { LeaveScene } from '../../components/ui/icons';
// The leave module's shared kit. It lives beside the admin screens because that
// is where it was first needed; pages/teacher/Holidays.jsx reaches across the
// same way for holidayParts.
import { IconAction, RowActions } from '../admin/listParts';
import {
  BalanceCard, CardHead, ChoiceCards, DateRange, DialogHead, DropZone, FactRow,
  FilterRow, FilterSelect, FormStep, LeaveHero, LeaveStat, MiniRing,
  LeaveStats, LeaveTypeCell, MyBalanceDrawer, Pager, PeriodCell, RequestDrawer,
  STATUS_OPTIONS, ShowingCount, StatusBadge, SubTabs, SummaryRow,
  chipTones, dayNum, docUrl, fmtDate,
} from '../admin/leaveParts';
import TeacherCompOff, { TeacherCompOffApprovals } from './CompOff';
import TeacherLeaveApprovals from './LeaveApprovals';
import { getMyCompOff, getLeaveTypePolicies, getLeaveApprovals } from '../../api/teacher.api';
import { leaveDateBounds, leaveDateHint } from '../../utils/leaveDates';
import { useSearchParams } from 'react-router-dom';

const STATUS_VARIANT = {
  pending: 'warning', approved: 'success', rejected: 'danger',
  cancelled: 'muted',
};

const EMPTY_FORM = { leaveTypeId: '', fromDate: '', toDate: '', leaveMode: 'full_day', halfDaySession: 'first', reason: '' };

// ── Day counting helpers ──────────────────────────────────────────────────────

function getNthSaturdayOfMonth(date) {
  return Math.ceil(date.getDate() / 7);
}

function isSaturdayWorking(date, leaveSettings = {}) {
  const { saturdayWorking = true, saturdayMode = 'all' } = leaveSettings;
  if (!saturdayWorking) return false;
  if (saturdayMode === 'all') return true;
  const nth = getNthSaturdayOfMonth(date);
  if (saturdayMode === '1_3_5') return nth % 2 === 1;
  if (saturdayMode === '2_4')   return nth % 2 === 0;
  return true;
}

function estimateDays(fromDate, toDate, leaveMode, leaveSettings = {}, holidaySet = new Set()) {
  if (leaveMode === 'half_day') return 0.5;
  if (!fromDate || !toDate) return 0;
  const from = new Date(fromDate);
  const to   = new Date(toDate);
  if (to < from) return 0;
  const { saturdayHalfDay = false } = leaveSettings;
  let days = 0;
  const cur = new Date(from);
  while (cur <= to) {
    const dow     = cur.getDay();
    const dateStr = cur.toISOString().slice(0, 10);
    if (holidaySet.has(dateStr)) {
      // skip — holiday
    } else if (dow === 6) {
      if (isSaturdayWorking(cur, leaveSettings)) days += saturdayHalfDay ? 0.5 : 1;
    } else if (dow !== 0) {
      days += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TeacherLeave() {
  // Notifications link straight at a tab (?tab=…), so the page opens where the
  // notification was about rather than on its default.
  const [searchParams] = useSearchParams();
  const wantedTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    ['my-leaves', 'balance', 'compoff', 'approvals', 'compoff-approvals'].includes(wantedTab) ? wantedTab : 'my-leaves');

  // Approvers are picked by designation (the Principal pattern), so a teacher
  // may or may not have an approvals queue — ask the server once for each.
  const [isCompOffApprover, setIsCompOffApprover] = useState(false);
  const [isLeaveApprover,   setIsLeaveApprover]   = useState(false);
  /**
   * Whether this school runs Comp Off at all.
   *
   * `null` until the server answers, and the tab is only drawn on `true`: a tab
   * that appears a moment after the page does is a smaller surprise than one
   * that vanishes under the pointer.
   *
   * The same reply already carries `enabled` — the server's single "is comp off
   * available here?" check, which is false when the school never created a Comp
   * Off leave type, when the type is inactive, or when the policy is switched
   * off. All three mean the same thing to a teacher: there is nothing to do
   * behind that tab, and it used to open on "Comp Off is not available".
   */
  const [compOffOn, setCompOffOn] = useState(null);
  useEffect(() => {
    getMyCompOff()
      .then((res) => {
        const d = res?.data ?? res;
        setCompOffOn(!!d?.enabled);
        setIsCompOffApprover(!!d?.isApprover);
      })
      .catch(() => { setCompOffOn(false); setIsCompOffApprover(false); });
    getLeaveApprovals()
      .then(res => setIsLeaveApprover(!!(res?.data ?? res)?.isApprover))
      .catch(() => setIsLeaveApprover(false));
  }, []);

  // A notification or a bookmark pointing at a Comp Off tab this school does
  // not run lands on the applications list instead.
  useEffect(() => {
    if (compOffOn === false && tab.startsWith('compoff')) setTab('my-leaves');
  }, [compOffOn, tab]);

  // Per-leave-type rules: which types this employee qualifies for and why not
  const { data: policyData } = useFetch(getLeaveTypePolicies);
  const policyList = policyData || [];
  const policyMap  = useMemo(
    () => Object.fromEntries(policyList.map(p => [String(p.leaveType?._id), p])),
    [policyList],
  );

  // ── My Leaves ─────────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType,   setFilterType]   = useState('');
  const [filterMode,   setFilterMode]   = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');
  const [leavePage,    setLeavePage]    = useState(1);
  const [detail,       setDetail]       = useState(null);   // the row in the drawer
  const LEAVE_PAGE = 5;

  const { data: leavesData, meta: leavesMeta, loading: leavesLoading, refetch } = useFetch(
    () => getMyLeaves({
      status:    filterStatus || undefined,
      leaveType: filterType   || undefined,
      mode:      filterMode   || undefined,
      fromDate:  filterFrom   || undefined,
      toDate:    filterTo     || undefined,
      page: leavePage, limit: LEAVE_PAGE,
    }),
    [filterStatus, filterType, filterMode, filterFrom, filterTo, leavePage],
  );
  const leaves = leavesData?.data || leavesData || [];
  // These describe the whole history, not the filtered page — see the endpoint.
  const leaveCounts = leavesMeta?.counts || {};
  const leaveShare  = (n) => (leaveCounts.total ? Math.round((n / leaveCounts.total) * 100) : 0);

  const anyLeaveFilter = !!(filterStatus || filterType || filterMode || filterFrom || filterTo);
  const clearLeaveFilters = () => {
    setFilterStatus(''); setFilterType(''); setFilterMode('');
    setFilterFrom(''); setFilterTo(''); setLeavePage(1);
  };
  const onLeaveFilter = (setter) => (v) => { setLeavePage(1); setter(v); };

  // ── Balance ───────────────────────────────────────────────────────────────────
  const { data: balData, loading: balLoading, refetch: refetchBal } = useFetch(getLeaveBalance);
  // axios interceptor unwraps res.data, so useFetch receives { items, leaveSettings, academicYear }
  const balances      = balData?.items ?? [];
  const leaveSettings = balData?.leaveSettings || {};
  const [balDetail, setBalDetail] = useState(null);   // the type in the drawer

  // One colour per leave type, the same one it wears everywhere else.
  const balTones = useMemo(
    () => chipTones(balances.map((b) => b.leaveType).filter(Boolean)),
    [balances],
  );

  const balTotals = useMemo(() => balances.reduce((t, b) => {
    const allocated = (b.totalAllocated || 0) + (b.carriedForward || 0);
    return {
      types:     t.types + 1,
      allocated: t.allocated + allocated,
      used:      t.used + (b.used || 0),
      pending:   t.pending + (b.pending || 0),
      remaining: t.remaining + (b.remaining ?? Math.max(0, allocated - (b.used || 0) - (b.pending || 0))),
    };
  }, { types: 0, allocated: 0, used: 0, pending: 0, remaining: 0 }), [balances]);

  // The activity panel is deliberately its own call: it shows the last few
  // applications whatever the Applications tab is filtered to, so the two
  // cannot disagree about what "recent" means.
  const { data: recentData } = useFetch(() => getMyLeaves({ page: 1, limit: 5 }), []);
  const recent = recentData?.data || recentData || [];

  // Fetch holidays only if holiday module is enabled for this school
  const [holidays, setHolidays] = useState([]);
  useEffect(() => {
    getModules()
      .then(res => {
        const mods = res?.data ?? res;
        if (!mods?.holiday) return null;
        return getHolidays();
      })
      .then(res => {
        if (!res) return;
        const d = res?.data ?? res;
        setHolidays(Array.isArray(d) ? d : []);
      })
      .catch(() => {});
  }, []);

  // Build a Set of YYYY-MM-DD strings covering every holiday date range
  const holidaySet = useMemo(() => {
    const set = new Set();
    holidays.forEach(h => {
      const cur = new Date(h.startDate);
      const end = new Date(h.endDate || h.startDate);
      while (cur <= end) {
        set.add(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
    });
    return set;
  }, [holidays]);

  // keyed by leaveType._id for O(1) lookup
  const balanceMap = Object.fromEntries(
    balances.map(b => [b.leaveType?._id?.toString() || b.leaveType?.toString(), b])
  );

  const leaveTypes = balances.map(b => b.leaveType).filter(Boolean);

  useEffect(() => {
    if (tab === 'balance')   refetchBal();
    if (tab === 'my-leaves') refetch();
  }, [tab]);

  // ── Apply Leave ───────────────────────────────────────────────────────────────
  const [modal,  setModal]  = useState(false);
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const docRef = useRef();

  const selLT      = leaveTypes.find(t => String(t._id) === form.leaveTypeId);
  const selBal     = balanceMap[form.leaveTypeId] ?? null;
  const selPolicy  = policyMap[form.leaveTypeId] ?? null;
  const remaining  = selBal ? (selBal.remaining ?? Math.max(0, (selBal.totalAllocated || 0) + (selBal.carriedForward || 0) - (selBal.used || 0) - (selBal.pending || 0))) : null;
  const estDays    = estimateDays(form.fromDate, form.toDate, form.leaveMode, leaveSettings, holidaySet);
  const noWorkDays = form.leaveMode !== 'half_day' && form.fromDate && form.toDate && form.fromDate <= form.toDate && estDays === 0;
  // The calendar's bounds come from the policy, not from a hardcoded "today" —
  // a type that permits back-dating within N days must actually offer those days.
  const dateBounds  = leaveDateBounds(selPolicy);
  const dateHint    = leaveDateHint(selPolicy);
  const overBalance = remaining !== null && estDays > 0 && estDays > remaining;
  const overConsec  = selLT?.maxConsecutiveDays > 0 && estDays > selLT.maxConsecutiveDays && form.leaveMode !== 'half_day';

  // The one figure this dialog exists to answer: what you would be left with.
  const afterBalance = remaining === null ? null : remaining - (estDays || 0);
  // The file input is uncontrolled, so its name is tracked for the drop zone.
  const [docName, setDocName] = useState('');

  const docRequired = !!selLT?.requiresDocument && (
    selLT.documentRequiredAfterDays > 0
      ? estDays >= selLT.documentRequiredAfterDays
      : true
  );

  // Auto-sync toDate for half-day and keep toDate >= fromDate
  const setField = (key, val) => {
    setForm(f => {
      const next = { ...f, [key]: val };
      // half-day: lock toDate to fromDate
      if (next.leaveMode === 'half_day') next.toDate = next.fromDate;
      // if fromDate moved past toDate, reset toDate
      if (key === 'fromDate' && next.toDate && next.toDate < val) next.toDate = val;
      return next;
    });
    setErrors(e => ({ ...e, [key]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.leaveTypeId)          e.leaveTypeId = 'Please select a leave type.';
    if (!form.fromDate)             e.fromDate    = 'From date is required.';
    if (!form.toDate)               e.toDate      = 'To date is required.';
    if (form.fromDate && form.toDate && form.toDate < form.fromDate)
                                    e.toDate      = 'To date must be on or after From date.';
    if (form.fromDate && dateBounds.minFrom && form.fromDate < dateBounds.minFrom)
                                    e.fromDate    = selPolicy?.allowBackdated
                                      ? `Back-dated applications are allowed only within ${selPolicy.backdatedWithinDays} day(s).`
                                      : selPolicy?.advanceNoticeDays > 0
                                        ? `This leave type needs ${selPolicy.advanceNoticeDays} day(s) advance notice.`
                                        : 'Cannot apply leave for a past date.';
    if (form.leaveMode === 'half_day' && form.fromDate && form.toDate && form.fromDate !== form.toDate)
                                    e.toDate      = 'Half-day leave must start and end on the same date.';
    if (noWorkDays)                 e.toDate      = 'The selected range has no working days (weekends / holidays only).';
    if (overBalance)                e.leaveTypeId = `Insufficient balance — you have ${remaining} day(s) remaining but are applying for ${estDays}.`;
    if (overConsec)                 e.toDate      = `This leave type allows a maximum of ${selLT.maxConsecutiveDays} consecutive day(s).`;
    if (!form.reason.trim())        e.reason      = 'Reason is required.';
    else if (form.reason.trim().length < 10)
                                    e.reason      = 'Reason must be at least 10 characters.';
    if (docRequired && !docRef.current?.files?.[0])
                                    e.document    = 'Supporting document is required for this leave.';
    return e;
  };

  const openModal = () => { setForm(EMPTY_FORM); setErrors({}); setDocName(''); setModal(true); };

  const handleApply = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('leaveTypeId', form.leaveTypeId);
      fd.append('fromDate',    form.fromDate);
      fd.append('toDate',      form.toDate);
      fd.append('leaveMode',   form.leaveMode);
      if (form.leaveMode === 'half_day') fd.append('halfDaySession', form.halfDaySession);
      fd.append('reason',      form.reason);
      if (docRef.current?.files?.[0]) fd.append('document', docRef.current.files[0]);
      await applyLeave(fd);
      toast.success('Leave application submitted');
      setModal(false); setForm(EMPTY_FORM); setErrors({});
      if (docRef.current) docRef.current.value = '';
      refetch(); refetchBal();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to submit');
    } finally { setSaving(false); }
  };

  // ── Cancel Leave ──────────────────────────────────────────────────────────────
  const [cancelItem, setCancelItem] = useState(null);
  const [cancLoad,   setCancLoad]   = useState(false);

  const handleCancel = async () => {
    setCancLoad(true);
    try {
      await cancelLeave(cancelItem._id);
      toast.success('Leave cancelled');
      setCancelItem(null); refetch(); refetchBal();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setCancLoad(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="page leavepg">
      <LeaveHero
        icon="umbrella"
        title="My Leave"
        subtitle={compOffOn ? 'Leave applications, balance and Comp Off' : 'Leave applications and balance'}
        quote="Take time to rest, so you can give your best."
        scene={LeaveScene}
      />

      {/* The tabs and the one thing you came to do, on one row. */}
      <div className="lvtabrow">
        <SubTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'my-leaves', label: 'My Applications', icon: 'fileCheck' },
            { value: 'balance',   label: 'Leave Balance',   icon: 'chart' },
            ...(compOffOn ? [{ value: 'compoff', label: 'Comp Off', icon: 'repeat' }] : []),
            ...(isLeaveApprover ? [{ value: 'approvals', label: 'Leave Approvals', icon: 'checkSquare' }] : []),
            ...(compOffOn && isCompOffApprover
              ? [{ value: 'compoff-approvals', label: 'Comp Off Approvals', icon: 'checkSquare' }] : []),
          ]}
        />
        {/* Hidden only on the two approval queues, where you are looking at
            other people's requests rather than filing your own. The Comp Off
            tab keeps it: its own "+ Apply Comp Off" claims a day you worked,
            which is a different act from taking leave. */}
        {tab !== 'approvals' && tab !== 'compoff-approvals' && (
          <Button onClick={openModal}><Icon name="plus" size={16} /> Apply Leave</Button>
        )}
      </div>

      {/* ── Comp Off — only where the school runs it ── */}
      {tab === 'compoff' && compOffOn && <TeacherCompOff />}

      {/* ── Leave approvals — only for designation-based approvers ── */}
      {tab === 'approvals' && <TeacherLeaveApprovals />}

      {/* ── Comp Off approvals — only for designation-based approvers ── */}
      {tab === 'compoff-approvals' && compOffOn && <TeacherCompOffApprovals />}

      {/* ── My Applications ── */}
      {tab === 'my-leaves' && (
        <>
          <LeaveStats className="lvstats--4">
            <LeaveStat valueFirst icon="fileCheck" tone="indigo" value={leaveCounts.total ?? 0}
              label="Total Applications" caption="All time"
              on={!filterStatus} onClick={() => onLeaveFilter(setFilterStatus)('')} />
            <LeaveStat valueFirst icon="checkCircle" tone="green" value={leaveCounts.approved ?? 0}
              label="Approved" caption={`${leaveShare(leaveCounts.approved || 0)}% of total`}
              on={filterStatus === 'approved'}
              onClick={() => onLeaveFilter(setFilterStatus)(filterStatus === 'approved' ? '' : 'approved')} />
            <LeaveStat valueFirst icon="clock" tone="amber" value={leaveCounts.pending ?? 0}
              label="Pending" caption={`${leaveShare(leaveCounts.pending || 0)}% of total`}
              on={filterStatus === 'pending'}
              onClick={() => onLeaveFilter(setFilterStatus)(filterStatus === 'pending' ? '' : 'pending')} />
            <LeaveStat valueFirst icon="closeCircle" tone="red" value={leaveCounts.rejected ?? 0}
              label="Rejected" caption={`${leaveShare(leaveCounts.rejected || 0)}% of total`}
              on={filterStatus === 'rejected'}
              onClick={() => onLeaveFilter(setFilterStatus)(filterStatus === 'rejected' ? '' : 'rejected')} />
          </LeaveStats>

          <section className="card lvcard">
            <FilterRow>
              <FilterSelect label="Filter by status" value={filterStatus} all="All Statuses"
                options={STATUS_OPTIONS} onChange={onLeaveFilter(setFilterStatus)} />
              <FilterSelect label="Filter by leave type" value={filterType} all="All Leave Types"
                options={policyList.map((p) => ({ value: p.leaveType?._id, label: p.leaveType?.name }))}
                onChange={onLeaveFilter(setFilterType)} />
              <DateRange from={filterFrom} to={filterTo}
                onFrom={onLeaveFilter(setFilterFrom)} onTo={onLeaveFilter(setFilterTo)} />
              <FilterSelect label="Filter by duration" value={filterMode} all="Full and half days"
                options={[{ value: 'full_day', label: 'Full days only' }, { value: 'half_day', label: 'Half days only' }]}
                onChange={onLeaveFilter(setFilterMode)} />
              <span className="lvfilters__sep" />
              <Button variant="secondary" onClick={clearLeaveFilters} disabled={!anyLeaveFilter}>
                <Icon name="refresh" size={16} /> Reset
              </Button>
            </FilterRow>

            {leavesLoading && !leavesData ? (
              <div className="lvtable__state"><Spinner /></div>
            ) : !leaves.length ? (
              <div className="lvtable__state">
                <Empty
                  icon={anyLeaveFilter ? '🔍' : '🏖️'}
                  title={anyLeaveFilter ? 'No applications match' : 'No leave applications yet'}
                  message={anyLeaveFilter
                    ? 'Try another status, type or date range.'
                    : 'When you apply for leave it appears here, with whatever the office decides.'}
                  action={anyLeaveFilter
                    ? <Button variant="secondary" onClick={clearLeaveFilters}>Clear filters</Button>
                    : <Button onClick={openModal}>+ Apply Leave</Button>}
                />
              </div>
            ) : (
              <div className="lvtable__wrap">
                <table className="lvtable">
                  <thead>
                    <tr>
                      <th className="lvt-num">#</th>
                      <th>Leave Type</th>
                      <th>Period</th>
                      <th className="lvt-total">Duration</th>
                      <th className="lvt-status">Status</th>
                      <th className="lvt-reason">Reason</th>
                      <th className="lvt-reason">Admin Comment</th>
                      <th className="lvt-cell">Document</th>
                      <th className="lvt-acts">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((r, i) => (
                      <tr key={r._id} data-focus-id={r._id}>
                        <td className="lvt-num">{((leavesMeta?.page || leavePage) - 1) * LEAVE_PAGE + i + 1}</td>
                        <td><LeaveTypeCell request={r} /></td>
                        <td><PeriodCell request={r} /></td>
                        <td className="lvt-total">
                          {dayNum(r.totalDays)} day{Number(r.totalDays) === 1 ? '' : 's'}
                        </td>
                        <td className="lvt-status"><StatusBadge status={r.status} /></td>
                        <td className="lvt-reason">
                          <div className="lvreason" title={r.reason || ''}><span>{r.reason || '—'}</span></div>
                        </td>
                        <td className="lvt-reason">
                          {/* The office's answer, which is the thing you came
                              back to this screen to read. */}
                          {r.adminComment
                            ? <div className="lvreason" title={r.adminComment}><span>{r.adminComment}</span></div>
                            : <span className="lvmuted">—</span>}
                        </td>
                        <td className="lvt-cell">
                          {r.document
                            ? <a href={docUrl(r.document)} target="_blank" rel="noopener noreferrer" className="lvdoc">
                                <Icon name="files" size={13} /> 1
                              </a>
                            : <span className="lvmuted">—</span>}
                        </td>
                        <td className="lvt-acts">
                          <div className="lvrowacts">
                            {/* Withdrawing keeps its word — it is the one action
                                here that cannot be undone. */}
                            {r.status === 'pending' && (
                              <div className="lvacts">
                                <button type="button" className="lvbtn lvbtn--reject"
                                  onClick={() => setCancelItem(r)}>Cancel</button>
                              </div>
                            )}
                            <RowActions>
                              <IconAction icon="eye" label="View this application"
                                onClick={() => setDetail(r)} />
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
              <ShowingCount page={leavesMeta?.page || leavePage} limit={LEAVE_PAGE}
                count={leaves.length} total={leavesMeta?.total ?? leaves.length}
                noun="application" />
              <Pager page={leavesMeta?.page || leavePage}
                pages={leaves.length ? (leavesMeta?.pages || 1) : 0} onPage={setLeavePage} />
            </div>
          </section>

          {/* Your own application, in full. No approve buttons — this is the
              same drawer the office uses, without the decisions. */}
          <RequestDrawer
            request={detail}
            onClose={() => setDetail(null)}
            onCancel={(r) => { setDetail(null); setCancelItem(r); }}
          />
        </>
      )}

      {/* ── Balance ── */}
      {tab === 'balance' && (
        <>
          {balLoading && !balData ? (
            <div className="lvtable__state"><Spinner /></div>
          ) : !balances.length ? (
            <section className="card lvcard">
              <div className="lvtable__state">
                <Empty icon="📊" title="No balance yet"
                  message="Your leave balance appears here once the office allocates it for this year." />
              </div>
            </section>
          ) : (
            <>
              <div className="lvbalcards">
                {balances.map((b) => (
                  <BalanceCard key={b.leaveType?._id || b._id}
                    balance={b}
                    tone={balTones[String(b.leaveType?._id)] || 'indigo'}
                    onView={() => setBalDetail(b)} />
                ))}
              </div>

              <div className="lvbalgrid">
                <section className="card lvcard lvsummary">
                  <CardHead title="Leave Summary" />
                  <div className="lvsumrows">
                    <SummaryRow label="Total Leave Types" value={balTotals.types} />
                    <SummaryRow label="Total Allocated" value={`${dayNum(balTotals.allocated)} days`} />
                    <SummaryRow label="Total Used" value={`${dayNum(balTotals.used)} day${balTotals.used === 1 ? '' : 's'}`} />
                    <SummaryRow label="Total Pending" value={`${dayNum(balTotals.pending)} days`} />
                    <SummaryRow strong label="Total Balance" value={`${dayNum(balTotals.remaining)} days`} />
                  </div>
                  <div className="lvnotice lvnotice--flat lvsummary__note">
                    <Icon name="alert" size={15} />
                    <span>
                      Leave balances are for the academic year {balances[0]?.academicYear || ''} and
                      are updated in real time.
                    </span>
                  </div>
                </section>

                <section className="card lvcard">
                  <CardHead title="Recent Leave Activity"
                    subtitle="Your last few applications, whatever their state.">
                    <Button variant="secondary" onClick={() => { clearLeaveFilters(); setTab('my-leaves'); }}>
                      View All
                    </Button>
                  </CardHead>

                  {!recent.length ? (
                    <div className="lvtable__state">
                      <Empty icon="🏖️" title="Nothing yet"
                        message="Your applications will show up here as you make them."
                        action={<Button onClick={openModal}>+ Apply Leave</Button>} />
                    </div>
                  ) : (
                    <div className="lvtable__wrap">
                      <table className="lvtable">
                        <thead>
                          <tr>
                            <th className="lvt-applied">Date</th>
                            <th className="lvt-dept">Type</th>
                            <th className="lvt-total">Duration</th>
                            <th className="lvt-status">Status</th>
                            <th className="lvt-reason">Reason</th>
                            <th className="lvt-acts">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recent.map((r) => (
                            <tr key={r._id}>
                              <td className="lvt-applied">{fmtDate(r.fromDate)}</td>
                              <td className="lvt-dept">{r.leaveType?.name || '—'}</td>
                              <td className="lvt-total">
                                {dayNum(r.totalDays)} day{Number(r.totalDays) === 1 ? '' : 's'}
                              </td>
                              <td className="lvt-status"><StatusBadge status={r.status} /></td>
                              <td className="lvt-reason">
                                <div className="lvreason" title={r.reason || ''}><span>{r.reason || '—'}</span></div>
                              </td>
                              <td className="lvt-acts">
                                <RowActions>
                                  <IconAction icon="eye" label="View this application"
                                    onClick={() => setDetail(r)} />
                                </RowActions>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {/* One leave type, with the rules that govern it — the half an
              employee cannot read anywhere else. */}
          <MyBalanceDrawer
            balance={balDetail}
            policy={balDetail ? policyMap[String(balDetail.leaveType?._id)] : null}
            onClose={() => setBalDetail(null)}
            onApply={(type) => {
              setBalDetail(null);
              setForm({ ...EMPTY_FORM, leaveTypeId: String(type._id) });
              setErrors({});
              setModal(true);
            }}
          />

          {/* Reached from Recent Leave Activity. */}
          <RequestDrawer
            request={detail}
            onClose={() => setDetail(null)}
            onCancel={(r) => { setDetail(null); setCancelItem(r); }}
          />
        </>
      )}

      {/* ── Apply Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} maxWidth={920}
        title={<DialogHead icon="calendarDays" title="Apply for Leave"
          subtitle="Submit a leave request. It will be sent for approval as per school policy." />}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="leave-form" type="submit" loading={saving} disabled={!leaveTypes.length}>
            <Icon name="arrowRight" size={16} /> Submit Request
          </Button>
        </>}>
        <div className="lvapply">
          <form id="leave-form" className="lvapply__form" onSubmit={handleApply} noValidate>

            <FormStep n={1} title="Leave Details" note="Choose the type and duration of your leave.">
              <label className="lvfield">
                <span className="lvfield__label">Leave Type <i>*</i></span>
                {leaveTypes.length === 0 ? (
                  <span className="lvfield__hint">
                    No leave types available. Please contact your administrator.
                  </span>
                ) : (
                  <select className={`form-control${errors.leaveTypeId ? ' is-error' : ''}`}
                    value={form.leaveTypeId} onChange={(e) => setField('leaveTypeId', e.target.value)}>
                    <option value="">Select type…</option>
                    {leaveTypes.map((t) => {
                      const bal = balanceMap[t._id?.toString()];
                      const rem = bal
                        ? (bal.remaining ?? Math.max(0, (bal.totalAllocated || 0) + (bal.carriedForward || 0) - (bal.used || 0) - (bal.pending || 0)))
                        : (t.annualAllocation || 0);
                      // The type's own policy decides eligibility, and may also
                      // let this employee apply beyond their remaining balance.
                      const pol = policyMap[t._id?.toString()];
                      const noBalance = rem <= 0 && !pol?.allowNegativeBalance;
                      const blocked = pol ? !pol.eligible : false;
                      return (
                        <option key={t._id} value={t._id} disabled={blocked || noBalance}>
                          {t.name} ({t.code}) — {rem} day(s) remaining
                          {blocked ? ` · ${pol.ineligibleReason || 'Not available to you'}` : noBalance ? ' · No balance' : ''}
                        </option>
                      );
                    })}
                  </select>
                )}
                {errors.leaveTypeId && <span className="lvfield__err">{errors.leaveTypeId}</span>}
              </label>

              <div className="lvfield">
                <span className="lvfield__label">Leave Mode <i>*</i></span>
                <ChoiceCards name="leaveMode" value={form.leaveMode}
                  onChange={(v) => setField('leaveMode', v)}
                  options={[
                    { value: 'full_day', label: 'Full Day' },
                    // A type whose policy forbids half days must not offer one.
                    { value: 'half_day', label: 'Half Day',
                      disabled: selPolicy ? selPolicy.halfDayAllowed === false : false,
                      disabledHint: 'This leave type does not allow half days' },
                  ]} />
              </div>

              {/* Which half decides which of your periods need cover. */}
              {form.leaveMode === 'half_day' && (
                <label className="lvfield">
                  <span className="lvfield__label">Which half</span>
                  <select className="form-control" value={form.halfDaySession}
                    onChange={(e) => setField('halfDaySession', e.target.value)}>
                    <option value="first">First half (morning)</option>
                    <option value="second">Second half (afternoon)</option>
                  </select>
                </label>
              )}

              <div className="lvdates">
                <label className="lvfield">
                  <span className="lvfield__label">From Date <i>*</i></span>
                  <input type="date" className={`form-control${errors.fromDate ? ' is-error' : ''}`}
                    min={dateBounds.minFrom || undefined} value={form.fromDate}
                    onChange={(e) => setField('fromDate', e.target.value)} />
                  {errors.fromDate && <span className="lvfield__err">{errors.fromDate}</span>}
                </label>
                <label className="lvfield">
                  <span className="lvfield__label">To Date <i>*</i></span>
                  <input type="date" className={`form-control${errors.toDate ? ' is-error' : ''}`}
                    min={form.fromDate || dateBounds.minFrom || undefined} value={form.toDate}
                    disabled={form.leaveMode === 'half_day'}
                    onChange={(e) => setField('toDate', e.target.value)} />
                  {errors.toDate && <span className="lvfield__err">{errors.toDate}</span>}
                </label>
                {/* What it will actually cost, worked out the same way the
                    server will — weekends and holidays are not charged unless
                    the type's sandwich rule says so. */}
                <div className={`lvduration${noWorkDays ? ' is-bad' : ''}`}>
                  <Icon name="calendar" size={16} />
                  <span>
                    <small>Duration</small>
                    <b>{!form.fromDate || !form.toDate
                      ? '—'
                      : noWorkDays
                        ? 'No working days'
                        : estDays === 0.5 ? 'Half day' : `${estDays} day${estDays === 1 ? '' : 's'}`}</b>
                  </span>
                </div>
              </div>
              {dateHint && <p className="lvfield__hint">{dateHint}</p>}

              {(overBalance || overConsec) && !noWorkDays && (
                <div className="lvnotice lvnotice--warn lvnotice--flat">
                  <Icon name="alert" size={15} />
                  <span>
                    {overBalance && `You have ${remaining} day(s) left but are applying for ${estDays}. `}
                    {overConsec && `This type allows at most ${selLT.maxConsecutiveDays} consecutive day(s).`}
                  </span>
                </div>
              )}
            </FormStep>

            <FormStep n={2} title="Reason" note="Let us know why you are taking leave.">
              <textarea className={`form-control${errors.reason ? ' is-error' : ''}`}
                rows={3} maxLength={500} value={form.reason}
                onChange={(e) => setField('reason', e.target.value)}
                placeholder="Enter reason for leave (minimum 10 characters)…" />
              <div className="lvcount">
                {errors.reason
                  ? <span className="lvfield__err">{errors.reason}</span>
                  : <span className="lvfield__hint">
                      {form.reason.trim().length < 10
                        ? `${10 - form.reason.trim().length} more character(s) needed`
                        : 'Looks good.'}
                    </span>}
                <span>{form.reason.length} / 500</span>
              </div>
              {/* The four reasons people actually give, so the common case is
                  one tap rather than a sentence. */}
              <div className="lvchips">
                {['Personal Work', 'Medical', 'Family Function', 'Other'].map((r) => (
                  <button key={r} type="button" className="lvchip lvchip--pick"
                    onClick={() => setField('reason', r)}>{r}</button>
                ))}
              </div>
            </FormStep>

            <FormStep n={3}
              title={<>Supporting Document {docRequired
                ? <i className="lvreq">(Required)</i>
                : <i className="lvopt">(Optional)</i>}</>}
              note={selLT?.requiresDocument && selLT.documentRequiredAfterDays > 0
                ? `Required once the leave runs past ${selLT.documentRequiredAfterDays} day(s).`
                : selLT?.requiresDocument
                  ? 'This leave type always needs one.'
                  : 'Attach any relevant document, if required.'}>
              <DropZone
                inputRef={docRef}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                hint="PDF, Word, or image (JPG, PNG) — max 5 MB"
                fileName={docName}
                required={docRequired}
                error={errors.document}
                onPick={() => {
                  setDocName(docRef.current?.files?.[0]?.name || '');
                  setErrors((e) => ({ ...e, document: '' }));
                }}
              />
              {errors.document && <span className="lvfield__err">{errors.document}</span>}
            </FormStep>
          </form>

          {/* ── What this leave will do to your balance ── */}
          <aside className="lvapply__side">
            <h4>Leave Balance</h4>
            {selBal ? (
              <>
                <MiniRing
                  value={remaining ?? 0}
                  total={(selBal.totalAllocated || 0) + (selBal.carriedForward || 0)}
                  caption="days remaining"
                  note={`${selLT?.name} (${selLT?.code}) · ${selBal.academicYear || ''}`}
                />

                <h5>After this leave</h5>
                <div className="lvfacts">
                  {/* The figure that changes, first — everything else is the
                      context for it. */}
                  <FactRow icon="calendarDays" label="Remaining balance"
                    tone={afterBalance < 0 ? 'down' : undefined}
                    value={`${dayNum(Math.max(0, afterBalance))} day${afterBalance === 1 ? '' : 's'}`} />
                  <FactRow icon="chart" label="Total allocated"
                    value={`${dayNum((selBal.totalAllocated || 0) + (selBal.carriedForward || 0))} days`} />
                  <FactRow icon="fileCheck" label="Total used"
                    value={`${dayNum(selBal.used || 0)} days`} />
                  <FactRow icon="clock" label="Pending requests"
                    value={`${dayNum(selBal.pending || 0)} day${selBal.pending === 1 ? '' : 's'}`} />
                </div>
              </>
            ) : (
              <p className="lvrail__none">
                Pick a leave type and your balance for it appears here, with what this
                application would leave you.
              </p>
            )}

            <div className="lvnotice lvnotice--flat">
              <Icon name="alert" size={15} />
              <span>
                {selPolicy?.approval?.mode && selPolicy.approval.mode !== 'admin'
                  ? 'Your request goes to the approvers your school has named for this leave type.'
                  : "Your request will be sent to the appropriate approver as per the school's leave policy."}
              </span>
            </div>
          </aside>
        </div>
      </Modal>

      {/* ── Cancel Confirm ── */}
      <Confirm open={!!cancelItem} onClose={() => setCancelItem(null)} onConfirm={handleCancel}
        loading={cancLoad} title="Cancel Leave"
        message="Are you sure you want to cancel this leave application?" />
    </div>
  );
}
