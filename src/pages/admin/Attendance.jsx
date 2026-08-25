import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getRegularizationRequests, reviewRegularization,
  getMyAttendance, clockIn, clockOut, submitRegularization, getMyRegularizations,
  regularizeStaffAttendance, regularizeStudentAttendance, searchRegularizePeople,
} from '../../api/admin.api';
import { PageHeader, Table, Badge, Spinner, Button } from '../../components/ui/index';
import SelfAttendance from '../../components/attendance/SelfAttendance';
import { useSearchParams } from 'react-router-dom';
import useFocusTarget from '../../hooks/useFocusTarget';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Small colour-coded pill telling staff apart from students at a glance
const ROLE_META = {
  student:      { label: 'Student', bg: '#dbeafe', fg: '#1e40af' },
  teacher:      { label: 'Teacher', bg: '#dcfce7', fg: '#166534' },
  school_admin: { label: 'Admin',   bg: '#ede9fe', fg: '#5b21b6' },
};
function RoleTag({ role }) {
  const m = ROLE_META[role] || { label: role, bg: 'var(--bg-secondary)', fg: 'var(--text-muted)' };
  return (
    <span style={{ flexShrink: 0, fontSize: '.68rem', fontWeight: 700, letterSpacing: '.02em',
      padding: '2px 8px', borderRadius: 999, background: m.bg, color: m.fg, textTransform: 'uppercase' }}>
      {m.label}
    </span>
  );
}
const personSubtitle = (p) => p.role === 'student'
  ? [ [p.className, p.sectionName].filter(Boolean).join(' — '), p.rollNumber && `Roll ${p.rollNumber}` ].filter(Boolean).join(' · ') || p.email
  : p.email;

// ── Admin: directly regularise anyone's attendance (staff or student) ──────────
function RegulariseAttendance() {
  const today = new Date().toISOString().split('T')[0];
  const [q, setQ]             = useState('');
  const [people, setPeople]   = useState([]);
  const [sel, setSel]         = useState(null); // selected person {_id,name,role,...}
  const [form, setForm]       = useState({ date: today, checkIn: '', checkOut: '', status: 'present', remarks: '' });
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (sel) return;
    const t = setTimeout(async () => {
      try {
        const res = await searchRegularizePeople({ search: q || undefined });
        setPeople(Array.isArray(res?.data) ? res.data : (res?.data?.data || []));
      } catch { /* silent */ }
    }, 300);
    return () => clearTimeout(t);
  }, [q, sel]);

  const isStudent = sel?.role === 'student';

  const handleApply = async (e) => {
    e.preventDefault();
    if (!sel) return toast.error('Select a person');
    setSaving(true);
    try {
      if (isStudent) {
        await regularizeStudentAttendance({ studentId: sel._id, date: form.date, status: form.status, remarks: form.remarks });
      } else {
        if (!form.checkIn && !form.checkOut) { setSaving(false); return toast.error('Enter clock-in and/or clock-out time'); }
        await regularizeStaffAttendance({ teacherId: sel._id, date: form.date, checkIn: form.checkIn, checkOut: form.checkOut, remarks: form.remarks });
      }
      toast.success(`Attendance regularised for ${sel.name}`);
      setSel(null); setQ('');
      setForm({ date: today, checkIn: '', checkOut: '', status: 'present', remarks: '' });
    } catch (err) { toast.error(err?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="card-body">
        <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
          Set or correct anyone's attendance for a past date directly — no approval needed. Staff use clock-in/out times; students use a status.
        </p>
        <form onSubmit={handleApply}>
          <div className="form-group">
            <label className="form-label required">Person</label>
            {sel ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <RoleTag role={sel.role} />
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{sel.name}</strong>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{personSubtitle(sel)}</span>
                  </div>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSel(null)}>Change</button>
              </div>
            ) : (
              <>
                <input className="form-control" placeholder="Search staff or student by name / email…" value={q} onChange={e => setQ(e.target.value)} />
                {people.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
                    {people.map(p => (
                      <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                        onClick={() => setSel(p)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <RoleTag role={p.role} />
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ fontSize: '.88rem' }}>{p.name}</strong>
                          <div style={{ fontSize: '.74rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{personSubtitle(p)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Date</label>
              <input type="date" className="form-control" required max={today} value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group" />
          </div>

          {isStudent ? (
            <div className="form-group">
              <label className="form-label required">Attendance Status</label>
              <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
              </select>
            </div>
          ) : (
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Clock-In Time</label>
                <input type="time" className="form-control" value={form.checkIn}
                  onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Clock-Out Time</label>
                <input type="time" className="form-control" value={form.checkOut}
                  onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Remarks</label>
            <input className="form-control" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
          </div>
          <Button type="submit" loading={saving}>Apply Regularisation</Button>
        </form>
      </div>
    </div>
  );
}

// ── Tab 2: Teacher regularization requests ────────────────────────────────────
function RegularizationRequests() {
  const [status, setStatus] = useState('pending');
  // Following a notification about a request that has since been decided: this
  // list shows pending only, so the request would be filtered out of the very
  // page the notification sent you to.
  const { focusId, release: releaseFocus } = useFocusTarget();

  const { data, loading, refetch } = useFetch(
    () => getRegularizationRequests({ page: 1, limit: 100, status: status || undefined }),
    [status],
  );
  const requests = Array.isArray(data) ? data : [];

  useEffect(() => {
    if (!focusId || loading || !status) return;
    if (!requests.some(r => String(r._id) === focusId)) setStatus('');
  }, [focusId, loading, status, requests]);

  const handleReview = async (id, st) => {
    try {
      await reviewRegularization({ id, status: st });
      toast.success(st === 'approved' ? 'Approved — attendance record updated' : 'Rejected');
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const columns = [
    { key: 'teacher',  label: 'Staff',
      render: r => <div><div style={{ fontWeight: 600 }}>{r.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.teacher?.email || ''}</div></div> },
    { key: 'date',     label: 'Date',      render: r => fmtDate(r.date) },
    { key: 'times',    label: 'Requested Times', render: r => (r.checkIn || r.checkOut)
      ? <span style={{ fontSize: '.85rem' }}>
          {r.checkIn  && <>in <strong>{r.checkIn}</strong></>}
          {r.checkIn && r.checkOut && ' · '}
          {r.checkOut && <>out <strong>{r.checkOut}</strong></>}
        </span>
      : <span style={{ textTransform: 'capitalize' }}>{(r.requestedStatus || '—').toLowerCase()}</span> },
    { key: 'reason',   label: 'Reason',    render: r => <span style={{ fontSize: '.85rem' }}>{r.reason || '—'}</span> },
    { key: 'status',   label: 'Status',
      render: r => <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge> },
    { key: 'actions',  label: '',
      render: r => r.status === 'pending' && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-success btn-sm" onClick={() => handleReview(r._id, 'approved')}>Approve</button>
          <button className="btn btn-danger btn-sm"  onClick={() => handleReview(r._id, 'rejected')}>Reject</button>
        </div>
      )},
  ];

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select className="form-control" style={{ width: 160 }} value={status}
          onChange={e => { releaseFocus(); setStatus(e.target.value); }}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        {loading && <Spinner />}
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={requests} emptyIcon="✅" emptyTitle="No requests found" />
      </div>
    </div>
  );
}

export default function AdminAttendance() {
  // Notifications link straight at a tab (?tab=…), so the page opens where the
  // notification was about rather than on its default.
  const [searchParams] = useSearchParams();
  const wantedTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    ['my-attendance', 'regularise', 'requests'].includes(wantedTab) ? wantedTab : 'my-attendance');

  return (
    <div className="page">
      <PageHeader title="Attendance" subtitle="Clock your day and review staff regularization requests" />

      <div className="tabs">
        {[['my-attendance', 'My Attendance'], ['regularise', 'Regularise Attendance'], ['requests', 'Regularization Requests']].map(([k, l]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'my-attendance' && (
        <SelfAttendance
          api={{ getMyAttendance, clockIn, clockOut }}
          regularization={{ submit: submitRegularization, list: getMyRegularizations }}
        />
      )}
      {tab === 'regularise' && <RegulariseAttendance />}
      {tab === 'requests' && <RegularizationRequests />}
    </div>
  );
}
