import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/teacher.api';
import { Spinner, Empty } from '../../components/ui/index';
import { IconAction, RowActions } from '../admin/listParts';
import {
  BalanceFacts, CardHead, DecisionDialog, FilterRow, FilterSelect, Pager, PeriodCell,
  PhoneTable, ReasonCell, RequestDrawer, ShowingCount, StatusBadge, TeacherCell,
  ApprovalStep, dayNum,
} from '../admin/leaveParts';

// Leave sign-off queue for approvers picked by designation (e.g. a Principal)
// and for teachers who administer the leave module. Mounted as a tab of
// pages/teacher/Leave.jsx, only when the server confirms this user approves at
// least one leave type.
//
// The same kit as the office's queue: numbered rows, the requester's balance
// before and after the request on every pending row (the one fact a decision
// needs), the drawer for the whole record, and the shared decision dialog — a
// rejection needs a reason. Your own requests never appear here.

const PAGE = 10;

export default function TeacherLeaveApprovals() {
  const [status, setStatus] = useState('pending');
  const [year,   setYear]   = useState('');          // '' = the active year
  const [page,   setPage]   = useState(1);
  const { data, loading, refetch } = useFetch(
    () => api.getLeaveApprovals({ status: status || undefined, academicYear: year || undefined, page, limit: PAGE }),
    [status, year, page],
  );

  const [detail,   setDetail]   = useState(null);
  const [decision, setDecision] = useState(null);   // { kind, request }
  const [comment,  setComment]  = useState('');
  const [busy,     setBusy]     = useState(false);

  const items = data?.items || [];
  const activeYear = data?.activeAcademicYear || '';
  const otherYears = (data?.academicYears || []).filter((y) => y.label !== activeYear);
  const onFilter = (setter) => (v) => { setPage(1); setter(v); };

  const ask = (kind, request) => { setComment(''); setDecision({ kind, request }); };
  const run = async () => {
    const { kind, request } = decision;
    setBusy(true);
    try {
      if (kind === 'approve') {
        const res = await api.approveLeaveRequest(request._id, { adminComment: comment });
        const left = res?.pendingLevels ?? 0;
        toast.success(left > 0 ? `Approval recorded — ${left} more sign-off needed` : 'Leave approved');
      } else {
        await api.rejectLeaveRequest(request._id, { adminComment: comment });
        toast.success('Leave rejected');
      }
      setDecision(null); setDetail(null); setComment(''); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setBusy(false); }
  };

  if (loading && !data) return <div className="lvtable__state"><Spinner /></div>;

  if (data?.isApprover === false) {
    return (
      <section className="card lvcard">
        <div className="lvtable__state">
          <Empty icon="✅" title="Nothing to approve"
            message="You are not set as an approver for any leave type." />
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="card lvcard">
        <CardHead icon="checkSquare" title="Leave Approvals"
          subtitle={data?.pending
            ? `${data.pending} request${data.pending === 1 ? '' : 's'} waiting for your decision`
            : 'Requests from colleagues for the leave types you approve'} />
        <FilterRow>
          <FilterSelect label="Filter by academic year" value={year}
            all={activeYear ? `${activeYear} (current)` : 'Current year'}
            options={[...otherYears.map((y) => y.label), { value: 'all', label: 'All years' }]}
            onChange={onFilter(setYear)} />
          <FilterSelect label="Filter by status" value={status} all="All statuses"
            options={[
              { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' }, { value: 'cancelled', label: 'Cancelled' },
            ]}
            onChange={onFilter(setStatus)} />
        </FilterRow>

        {!items.length ? (
          <div className="lvtable__state">
            <Empty icon="✅" title={status === 'pending' ? 'Nothing waiting for you' : 'No requests match'}
              message={status === 'pending'
                ? 'New requests for the leave types you approve land here.'
                : 'Try another status or year.'} />
          </div>
        ) : (
          <PhoneTable title="Teacher" side="Status" keep={['Leave Type', 'Period', 'Days', 'Balance']}>
            <table className="lvtable">
              <thead>
                <tr>
                  <th className="lvt-num">#</th>
                  <th>Teacher</th>
                  <th>Leave Type</th>
                  <th>Period</th>
                  <th className="lvt-days">Days</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th className="lvt-acts">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={r._id} data-focus-id={r._id}>
                    <td className="lvt-num">{(page - 1) * PAGE + i + 1}</td>
                    <td><TeacherCell request={r} /></td>
                    <td className="lvt-type">{r.leaveType?.name || '—'}</td>
                    <td><PeriodCell request={r} /></td>
                    <td className="lvt-days">{dayNum(r.totalDays)}</td>
                    <td>{r.status === 'pending' ? <BalanceFacts compact balance={r.balance} /> : <span className="lvmuted">—</span>}</td>
                    <td><StatusBadge status={r.status} /><ApprovalStep request={r} /></td>
                    <td className="lvt-reason"><ReasonCell request={r} /></td>
                    <td className="lvt-acts">
                      <div className="lvrowacts">
                        {r.status === 'pending' && r.canDecide !== false && (
                          <div className="lvacts">
                            <button type="button" className="lvbtn lvbtn--approve" onClick={() => ask('approve', r)}>Approve</button>
                            <button type="button" className="lvbtn lvbtn--reject" onClick={() => ask('reject', r)}>Reject</button>
                          </div>
                        )}
                        <RowActions>
                          <IconAction icon="eye" label="View request" onClick={() => setDetail(r)} />
                        </RowActions>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PhoneTable>
        )}

        <div className="lvfoot">
          <ShowingCount page={data?.page || page} limit={PAGE} count={items.length} total={data?.total ?? items.length} />
          <Pager page={data?.page || page} pages={items.length ? (data?.pages || 1) : 0} onPage={setPage} />
        </div>
      </section>

      {/* Decisions only — reversing or shortening approved leave is the office's. */}
      <RequestDrawer request={detail} onClose={() => setDetail(null)}
        onDecide={(kind, r) => { if (kind === 'approve' || kind === 'reject') ask(kind, r); }}
        busy={busy} />

      <DecisionDialog
        open={!!decision}
        kind={decision?.kind}
        request={decision?.request}
        comment={comment}
        onComment={setComment}
        onClose={() => setDecision(null)}
        onConfirm={run}
        loading={busy}
      />
    </>
  );
}
