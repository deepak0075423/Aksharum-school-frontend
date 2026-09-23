/**
 * Admin → Attendance → Regularization Requests.
 *
 * Staff asking for a missed punch to be recorded. Each row shows the requested
 * times beside what the day holds now, so the decision can be made from the
 * list; the drawer has the rest. An admin cannot decide their own request — the
 * server refuses it, and the buttons say so before anyone tries.
 */
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import useFocusTarget, { useFocusFilterReset } from '../../../hooks/useFocusTarget';
import { getRegularizationRequests, reviewRegularization } from '../../../api/admin.api';
import { Button, Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Avatar, Drawer, DrawerFoot, IconAction, RowActions, ago } from '../listParts';
import { DialogHead, Pager, ShowingCount } from '../leaveParts';
import {
  Card, DayRange, EmptyNote, ROLE_LABEL, StatusPill, fmtClock, fmtDay, fmtDayShort,
} from '../attendanceParts';
import Tabs from '../../../components/ui/Tabs';

const LIMIT = 10;
const STATUS_TABS = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: '',         label: 'All' },
];
const pillOf = (s) => (s === 'pending' ? 'waiting' : s);
const keyOfDate = (d) => String(d || '').slice(0, 10);

const Times = ({ checkIn, checkOut }) => (
  <span className="atn-times">
    <span>In <b>{checkIn ? fmtClock(checkIn) : '—'}</b></span>
    <span>Out <b>{checkOut ? fmtClock(checkOut) : '—'}</b></span>
  </span>
);

export default function Requests({ onChanged }) {
  const { focusId, release } = useFocusTarget();
  const [status, setStatus] = useState(focusId ? '' : 'pending');
  const [query, setQuery]   = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom]     = useState('');
  const [to, setTo]         = useState('');
  const [page, setPage]     = useState(1);
  const [open, setOpen]     = useState(null);
  const [decide, setDecide] = useState(null);   // { request, kind }

  useEffect(() => {
    const t = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, meta, loading, refetch } = useFetch(
    () => getRegularizationRequests({
      page, limit: LIMIT, status: status || undefined, search: search || undefined,
      from: from || undefined, to: to || undefined, focus: focusId || undefined,
    }),
    [page, status, search, from, to, focusId],
  );
  const rows   = Array.isArray(data) ? data : [];
  const counts = meta?.counts || {};

  // The server answers with the page the focused request sits on.
  useEffect(() => { if (focusId && meta?.page && meta.page !== page) setPage(meta.page); }, [focusId, meta, page]);
  const clearFilters = useCallback(() => { setStatus(''); setQuery(''); setSearch(''); setFrom(''); setTo(''); }, []);
  useFocusFilterReset(meta, focusId, clearFilters);

  const touch = (fn) => (...args) => { release(); setPage(1); fn(...args); };

  return (
    <Card className="atn-reqcard" title="Regularization Requests"
      sub="Staff asking for a missed clock-in or clock-out to be recorded."
      actions={
        <Tabs variant="solid" className="uitabs--sm" label="Request status"
          value={status} onChange={(v) => touch(() => setStatus(v))()}
          items={STATUS_TABS.map((t) => ({
            key: t.value, label: t.label, count: (t.value ? counts[t.value] : counts.all) || undefined,
          }))} />
      }>
      <div className="atn-filters">
        <label className="atn-search atn-search--wide">
          <Icon name="search" size={16} />
          <input value={query} onChange={(e) => { release(); setQuery(e.target.value); }}
            placeholder="Search by staff name or email…" aria-label="Search requests" />
        </label>
        <DayRange from={from} to={to} onFrom={touch(setFrom)} onTo={touch(setTo)} what="Requested days" />
        {(query || from || to) && (
          <button type="button" className="atn-textbtn" onClick={touch(() => { setQuery(''); setFrom(''); setTo(''); })}>Reset</button>
        )}
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyNote icon="checkCircle" title={status === 'pending' && !search && !from && !to ? 'No requests waiting' : 'No requests match'}>
          {status === 'pending' ? 'Every request has been decided.' : 'Try a different status, name or period.'}
        </EmptyNote>
      ) : (
        <div className={`table-wrap${loading ? ' atn-dim' : ''}`}>
          <table className="atn-table">
            <thead>
              <tr>
                <th>Staff</th><th>Day</th><th>Requested</th><th>Recorded now</th><th>Reason</th><th>Status</th>
                <th className="atn-table__act">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} data-focus-id={r._id}>
                  <td>
                    <span className="atn-who">
                      <Avatar name={r.teacher?.name} src={r.teacher?.profileImage} size={34} />
                      <span>
                        <b>{r.teacher?.name || 'Unknown'}</b>
                        <small>{[r.teacher?.designation || ROLE_LABEL[r.teacher?.role], r.teacher?.department].filter(Boolean).join(' · ')}</small>
                      </span>
                    </span>
                  </td>
                  <td><b>{fmtDayShort(keyOfDate(r.date))}</b><small>raised {ago(r.createdAt)}</small></td>
                  <td><Times checkIn={r.checkIn} checkOut={r.checkOut} /></td>
                  <td>{r.recorded ? <Times {...r.recorded} /> : <span className="atn-muted">Nothing</span>}</td>
                  <td className="atn-table__reason" title={r.reason}>{r.reason || <span className="atn-muted">—</span>}</td>
                  <td><StatusPill status={pillOf(r.status)} /></td>
                  <td className="atn-table__act">
                    <RowActions>
                      <IconAction icon="eye" label="View request" onClick={() => setOpen(r)} />
                      {r.status === 'pending' && (
                        <>
                          <button type="button" className="atn-decide atn-decide--ok" disabled={r.own}
                            title={r.own ? 'Another admin must decide your own request' : 'Approve'}
                            onClick={() => setDecide({ request: r, kind: 'approved' })}>Approve</button>
                          <button type="button" className="atn-decide atn-decide--no" disabled={r.own}
                            title={r.own ? 'Another admin must decide your own request' : 'Reject'}
                            onClick={() => setDecide({ request: r, kind: 'rejected' })}>Reject</button>
                        </>
                      )}
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(meta?.total || 0) > 0 && (
        <footer className="atn-foot">
          <ShowingCount page={page} limit={LIMIT} count={rows.length} total={meta.total} noun="request" />
          <Pager page={page} pages={meta.pages} onPage={(p) => { release(); setPage(p); }} />
        </footer>
      )}

      {open && (
        <RequestDrawer request={open} onClose={() => setOpen(null)}
          onDecide={(kind) => { setDecide({ request: open, kind }); setOpen(null); }} />
      )}
      {decide && (
        <DecideDialog {...decide} onClose={() => setDecide(null)}
          onDone={() => { setDecide(null); refetch(); onChanged?.(); }} />
      )}
    </Card>
  );
}

function RequestDrawer({ request: r, onClose, onDecide }) {
  const day = keyOfDate(r.date);
  return (
    <Drawer open onClose={onClose}>
      <div className="ldrawer__head">
        <Avatar name={r.teacher?.name} src={r.teacher?.profileImage} size={52} />
        <div className="ldrawer__id">
          <h3>{r.teacher?.name}</h3>
          <p>{[r.teacher?.designation || ROLE_LABEL[r.teacher?.role], r.teacher?.department, r.teacher?.employeeId].filter(Boolean).join(' · ')}</p>
          <div className="ldrawer__tags"><StatusPill status={pillOf(r.status)} /></div>
        </div>
        <button type="button" className="lact" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
      </div>
      <div className="ldrawer__body">
        <section className="ldrawer__sec">
          <h4>{fmtDay(day)} · {r.requestType || 'Missed punch'}</h4>
          <div className="atn-compare">
            <div><span>Requested</span><Times checkIn={r.checkIn} checkOut={r.checkOut} /></div>
            <Icon name="arrowLeft" size={16} />
            <div><span>Recorded now</span>{r.recorded ? <Times {...r.recorded} /> : <b className="atn-muted">Nothing recorded</b>}</div>
          </div>
          <p className="atn-drawer__note">Approving writes only the times requested — a punch already on record is never blanked.</p>
        </section>
        <section className="ldrawer__sec">
          <h4>Reason</h4>
          <p className="atn-quote">{r.reason || '—'}</p>
          <p className="atn-muted">Raised {new Date(r.createdAt).toLocaleString('en-IN')}</p>
        </section>
        {r.status !== 'pending' && (
          <section className="ldrawer__sec">
            <h4>Decision</h4>
            <p>{r.status === 'approved' ? 'Approved' : 'Rejected'}{r.reviewedBy?.name ? ` by ${r.reviewedBy.name}` : ''}{r.reviewedAt ? `, ${new Date(r.reviewedAt).toLocaleString('en-IN')}` : ''}</p>
            {r.adminRemarks ? <p className="atn-quote">{r.adminRemarks}</p> : null}
          </section>
        )}
      </div>
      {r.status === 'pending' && (
        <DrawerFoot>
          {r.own
            ? <span className="atn-muted">Your own request — another admin decides it.</span>
            : (
              <>
                <Button variant="secondary" onClick={() => onDecide('rejected')}>Reject</Button>
                <Button onClick={() => onDecide('approved')}><Icon name="check" size={15} /> Approve</Button>
              </>
            )}
        </DrawerFoot>
      )}
    </Drawer>
  );
}

function DecideDialog({ request: r, kind, onClose, onDone }) {
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const approve = kind === 'approved';

  const submit = async () => {
    setBusy(true);
    try {
      await reviewRegularization({ id: r._id, status: kind, remarks: remarks.trim() });
      toast.success(approve ? 'Approved — the day now shows as present' : 'Rejected');
      onDone();
    } catch (e) { toast.error(e?.message || 'Could not record the decision'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} maxWidth={500}
      title={<DialogHead icon={approve ? 'checkCircle' : 'closeCircle'}
        title={approve ? 'Approve request' : 'Reject request'}
        subtitle={`${r.teacher?.name} · ${fmtDay(keyOfDate(r.date))}`} />}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={approve ? 'primary' : 'danger'} loading={busy} onClick={submit}>
          {approve ? 'Approve' : 'Reject'}
        </Button>
      </>}>
      <p className="atn-dlgtext">
        {approve
          ? <>Records {[r.checkIn && `a clock-in at ${fmtClock(r.checkIn)}`, r.checkOut && `a clock-out at ${fmtClock(r.checkOut)}`].filter(Boolean).join(' and ')}. {r.teacher?.name} is notified.</>
          : <>Nothing on the record changes. {r.teacher?.name} is told, with your remarks.</>}
      </p>
      <div className="form-group">
        <label className="form-label" htmlFor="atn-decide-remarks">Remarks</label>
        <textarea id="atn-decide-remarks" className="form-control" rows={3} maxLength={300} value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder={approve ? 'Optional' : 'Optional — e.g. No record of you on campus that morning'} />
      </div>
    </Modal>
  );
}
