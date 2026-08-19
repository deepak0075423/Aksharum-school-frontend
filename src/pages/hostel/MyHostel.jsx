import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as hostelApi from '../../api/hostel.api';
import { useAuth } from '../../contexts/AuthContext';
import {
  PageHeader, Card, Button, Modal, Badge, Spinner, Empty, Alert, StatCard, Table,
} from '../../components/ui/index';
import { StatusBadge, Field, FieldGrid, PassQr, Attachments, label, dd, dt, money, today } from './shared';

const LEAVE_TYPES = ['home', 'weekend', 'short', 'medical', 'emergency', 'holiday', 'other'];
const OUTPASS_TYPES = ['day', 'night', 'medical', 'emergency', 'academic', 'market', 'other'];
const COMPLAINT_CATS = ['room', 'mess', 'cleaning', 'security', 'maintenance', 'food', 'facilities', 'internet', 'other'];

/**
 * The resident's own hostel screen, shared by the student and parent portals.
 * `role` decides which API surface is used; everything a parent sees is scoped
 * server-side to the children on their profile.
 */
export default function MyHostel({ role = 'student' }) {
  const api = role === 'parent' ? hostelApi.parent : hostelApi.student;
  const { user } = useAuth();

  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoad] = useState(true);
  const [children, setChildren] = useState([]);
  const [child, setChild] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lists, setLists] = useState({});
  const [available, setAvailable] = useState([]);
  const [years, setYears] = useState([]);
  const [pass, setPass] = useState(null);

  const [leaveForm, setLeaveForm] = useState({ leaveType: 'home', fromDate: '', toDate: '', reason: '', destination: '', guardianName: '', guardianPhone: '' });
  const [outForm, setOutForm] = useState({ outpassType: 'day', purpose: '', destination: '', departureDate: today(), expectedDepartureTime: '', expectedReturnTime: '', guardianName: '', guardianPhone: '' });
  const [visitorForm, setVisitorForm] = useState({ visitorName: '', mobile: '', relationship: '', purpose: '', scheduledAt: '' });
  const [complaintForm, setComplaintForm] = useState({ category: 'room', priority: 'medium', subject: '', description: '', attachments: [] });
  const [applyForm, setApplyForm] = useState({ hostel: '', academicYear: '', preferredRoomType: '', reason: '', medicalInfo: '' });

  // Parents pick which child they are looking at.
  useEffect(() => {
    if (role !== 'parent') return;
    hostelApi.parent.children()
      .then((r) => {
        const list = r.data ?? r;
        setChildren(list);
        if (list.length && !child) setChild(list[0]._id);
      })
      .catch(() => setChildren([]));
  }, [role]); // eslint-disable-line

  const q = role === 'parent' && child ? { student: child } : undefined;

  const load = useCallback(async () => {
    if (role === 'parent' && !child) return;
    setLoad(true);
    try {
      const r = await api.myHostel(q);
      setData(r.data ?? r);
    } catch (err) {
      if (err.status !== 404) toast.error(err.message);
      setData(null);
    } finally { setLoad(false); }
  }, [role, child]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  // Each tab pulls only what it needs.
  const loadTab = useCallback(async (t) => {
    const fetchers = {
      attendance: () => api.attendance(q),
      leave: () => api.leaves(q),
      outpass: () => api.outpasses(q),
      visitors: () => api.visitors(q),
      fees: () => api.fees(q),
      complaints: () => api.complaints(q),
      mess: () => api.mess(q),
      record: () => api.record(q),
    };
    if (!fetchers[t]) return;
    try {
      const r = await fetchers[t]();
      setLists((l) => ({ ...l, [t]: r.data ?? r }));
    } catch (err) { toast.error(err.message); }
  }, [api, child]); // eslint-disable-line
  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  const openApply = async () => {
    setModal('apply');
    try {
      const r = await api.hostels(q);
      const d = r.data ?? r;
      setAvailable(d.hostels || []);
      setYears(d.academicYears || []);
      setApplyForm((f) => ({
        ...f,
        academicYear: (d.academicYears || []).find((y) => y.status === 'active')?._id
          || d.academicYears?.[0]?._id || '',
      }));
    } catch { setAvailable([]); setYears([]); }
  };

  const submit = async (kind) => {
    setSaving(true);
    try {
      if (kind === 'leave') { await api.applyLeave({ ...leaveForm, ...(q || {}) }); toast.success('Leave requested'); loadTab('leave'); }
      if (kind === 'outpass') { await api.applyOutpass({ ...outForm, ...(q || {}) }); toast.success('Outpass requested'); loadTab('outpass'); }
      if (kind === 'visitor') { await api.requestVisitor({ ...visitorForm, ...(q || {}) }); toast.success('Visitor pre-registered'); loadTab('visitors'); }
      if (kind === 'complaint') { await api.raiseComplaint({ ...complaintForm, ...(q || {}) }); toast.success('Complaint raised'); loadTab('complaints'); }
      if (kind === 'apply') { await api.apply({ ...applyForm, ...(q || {}) }); toast.success('Application filed'); load(); }
      setModal(null);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const cancelLeave = async (id) => {
    try { await api.actOnLeave(id, { action: 'cancel' }); toast.success('Cancelled'); loadTab('leave'); }
    catch (err) { toast.error(err.message); }
  };
  const consent = async (id, approve) => {
    try {
      await api.actOnLeave(id, { action: approve ? 'parent_approve' : 'parent_reject' });
      toast.success(approve ? 'Consent recorded' : 'Declined');
      loadTab('leave');
    } catch (err) { toast.error(err.message); }
  };
  const cancelOutpass = async (id) => {
    try { await api.cancelOutpass(id); toast.success('Cancelled'); loadTab('outpass'); }
    catch (err) { toast.error(err.message); }
  };
  const showPass = async (id) => {
    try { const r = await hostelApi.student.outpassPass(id); setPass(r.data ?? r); }
    catch (err) { toast.error(err.message); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>;

  const who = role === 'parent' ? (children.find((c) => c._id === child)?.name || 'your child') : 'you';

  // ── Not a resident ─────────────────────────────────────────────────────────
  if (!data?.resident) {
    const pending = (data?.admissions || []).find((a) => ['applied', 'pending_approval', 'waitlisted'].includes(a.status));
    return (
      <div className="page">
        <PageHeader title="Hostel" subtitle={role === 'parent' ? `Hostel accommodation for ${who}` : 'Your hostel accommodation'} />
        {role === 'parent' && children.length > 1 && (
          <select className="form-control" style={{ maxWidth: 260, marginBottom: 16 }} value={child} onChange={(e) => setChild(e.target.value)}>
            {children.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        )}
        {pending ? (
          <Card title="Application in progress">
            <FieldGrid>
              <Field label="Application">{pending.applicationNumber}</Field>
              <Field label="Hostel">{pending.hostel?.name}</Field>
              <Field label="Status"><StatusBadge value={pending.status} /></Field>
              <Field label="Applied">{dd(pending.appliedAt)}</Field>
              {pending.status === 'waitlisted' && <Field label="Waitlist position">{pending.waitlistPosition}</Field>}
            </FieldGrid>
          </Card>
        ) : (
          <Empty icon="🏨" title="Not a hostel resident"
            message={data?.canApply ? 'Apply for hostel accommodation below.' : 'Contact the hostel office to apply for accommodation.'}
            action={data?.canApply ? <Button onClick={openApply}>Apply for hostel</Button> : null} />
        )}
        {!!data?.admissions?.length && (
          <Card title="Application history">
            {data.admissions.map((a) => (
              <div key={a._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}>
                <span>{a.applicationNumber} · {a.hostel?.name} · {a.academicYear?.yearName}</span>
                <StatusBadge value={a.status} />
              </div>
            ))}
          </Card>
        )}

        <Modal open={modal === 'apply'} onClose={() => setModal(null)} maxWidth={600} title="Apply for Hostel"
          footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => submit('apply')}>Apply</Button></>}>
          <div className="form-group">
            <label className="form-label required">Hostel</label>
            <select className="form-control" value={applyForm.hostel} onChange={(e) => setApplyForm((f) => ({ ...f, hostel: e.target.value }))}>
              <option value="">— select —</option>
              {available.map((h) => (
                <option key={h._id} value={h._id}>{h.name} — {h.availableBeds} bed(s) free</option>
              ))}
            </select>
            <div className="form-hint">Only hostels you are eligible for are listed.</div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Academic Year</label>
              <select className="form-control" value={applyForm.academicYear} onChange={(e) => setApplyForm((f) => ({ ...f, academicYear: e.target.value }))}>
                <option value="">— select —</option>
                {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Preferred Room Type</label>
              <select className="form-control" value={applyForm.preferredRoomType} onChange={(e) => setApplyForm((f) => ({ ...f, preferredRoomType: e.target.value }))}>
                <option value="">No preference</option>
                {['single', 'double', 'triple', 'four_bed', 'dormitory'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <textarea className="form-control" rows={2} value={applyForm.reason} onChange={(e) => setApplyForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Medical information the warden should know</label>
            <textarea className="form-control" rows={2} value={applyForm.medicalInfo} onChange={(e) => setApplyForm((f) => ({ ...f, medicalInfo: e.target.value }))} />
          </div>
        </Modal>
      </div>
    );
  }

  // ── Resident ───────────────────────────────────────────────────────────────
  const c = data.current;
  const TABS = ['overview', 'attendance', 'leave', 'outpass', 'visitors', 'mess', 'fees', 'complaints', 'record'];

  return (
    <div className="page">
      <PageHeader
        title={role === 'parent' ? `${who} — Hostel` : 'My Hostel'}
        subtitle={`${c.hostel?.name} · ${c.building?.name} · ${c.floor?.name} · Room ${c.room?.roomNumber} · Bed ${c.bed?.bedNumber}`}
        action={role === 'parent' && children.length > 1 ? (
          <select className="form-control" style={{ maxWidth: 220 }} value={child} onChange={(e) => setChild(e.target.value)}>
            {children.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
          </select>
        ) : null} />

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label(t)}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="stats-grid">
            <StatCard icon="🏨" color="purple" label="Hostel" value={c.hostel?.name} />
            <StatCard icon="🚪" color="blue"   label="Room"   value={c.room?.roomNumber} />
            <StatCard icon="🛏"  color="teal"   label="Bed"    value={c.bed?.bedNumber} />
            <StatCard icon="✅" color="green"  label="Present days" value={data.attendanceSummary?.present || 0} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <Card title="Your warden">
              {data.warden ? (
                <FieldGrid cols={2}>
                  <Field label="Name">{data.warden.name}</Field>
                  <Field label="Phone">{data.warden.phone}</Field>
                  <Field label="Email">{data.warden.email}</Field>
                  <Field label="Hostel contact">{c.hostel?.contactNumber}</Field>
                </FieldGrid>
              ) : <span className="text-muted" style={{ fontSize: '.85rem' }}>No warden assigned yet.</span>}
            </Card>

            <Card title="Timings">
              <FieldGrid cols={2}>
                <Field label="Entry">{data.rules?.entryTime}</Field>
                <Field label="Exit">{data.rules?.exitTime}</Field>
                <Field label="Curfew">{data.rules?.curfewTime}</Field>
                <Field label="Visitors">{data.rules?.visitorFrom} – {data.rules?.visitorTo}</Field>
                <Field label="Visiting days" wide>{(data.rules?.visitorDays || []).join(', ') || 'Any day'}</Field>
              </FieldGrid>
            </Card>

            <Card title={`Roommates (${data.roommates?.length || 0})`}>
              {data.roommates?.length ? data.roommates.map((r) => (
                <div key={r._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}>
                  <span>{r.student?.name}</span>
                  <span className="text-muted">Bed {r.bed?.bedNumber}</span>
                </div>
              )) : <span className="text-muted" style={{ fontSize: '.85rem' }}>You have the room to yourself.</span>}
            </Card>

            {!!data.assets?.length && (
              <Card title="Items issued to you">
                {data.assets.map((a) => (
                  <div key={a._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}>
                    <span>{a.name} × {a.quantity}</span>
                    <span className="text-muted">{dd(a.issuedAt)}</span>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {!!data.rules?.hostelRules?.length && (
            <Card title="Hostel rules">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '.86rem', lineHeight: 1.7 }}>
                {data.rules.hostelRules.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Card>
          )}
          {!!data.rules?.facilities?.length && (
            <Card title="Facilities">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {data.rules.facilities.map((f) => <Badge key={f} variant="muted">{f}</Badge>)}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="stats-grid">
            <StatCard icon="✅" color="green"  label="Present" value={lists.attendance?.summary?.present || 0} />
            <StatCard icon="❌" color="red"    label="Absent"  value={lists.attendance?.summary?.absent || 0} />
            <StatCard icon="⏰" color="orange" label="Late"    value={lists.attendance?.summary?.late || 0} />
            <StatCard icon="📊" color="blue"   label="Present %" value={`${lists.attendance?.summary?.presentPercent || 0}%`} />
          </div>
          <div className="card"><div className="card-body" style={{ padding: 0 }}>
            <Table
              columns={[
                { key: 'date', label: 'Date', render: (r) => dd(r.date) },
                { key: 'session', label: 'Session', render: (r) => label(r.session) },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
                { key: 'remarks', label: 'Remarks', render: (r) => r.remarks || '—' },
              ]}
              data={lists.attendance?.rows || []} emptyIcon="✅" emptyTitle="No attendance yet" />
          </div></div>
        </div>
      )}

      {tab === 'leave' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div><Button onClick={() => setModal('leave')}>+ Request leave</Button></div>
          <div className="card"><div className="card-body" style={{ padding: 0 }}>
            <Table
              columns={[
                { key: 'no', label: 'Leave', render: (r) => <div><strong>{r.leaveNumber}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label(r.leaveType)}</div></div> },
                { key: 'dates', label: 'Dates', render: (r) => `${dd(r.fromDate)} – ${dd(r.toDate)}` },
                { key: 'days', label: 'Days', render: (r) => r.totalDays },
                { key: 'reason', label: 'Reason', render: (r) => r.reason },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
                { key: 'a', label: '', render: (r) => (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {role === 'parent' && r.status === 'pending' && <>
                      <Button size="sm" onClick={() => consent(r._id, true)}>Consent</Button>
                      <Button size="sm" variant="danger" onClick={() => consent(r._id, false)}>Decline</Button>
                    </>}
                    {['pending', 'parent_approved', 'approved'].includes(r.status) && (
                      <Button size="sm" variant="secondary" onClick={() => cancelLeave(r._id)}>Cancel</Button>
                    )}
                  </div>
                ) },
              ]}
              data={lists.leave || []} emptyIcon="🏖" emptyTitle="No leave requests" />
          </div></div>
        </div>
      )}

      {tab === 'outpass' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div><Button onClick={() => setModal('outpass')}>+ Request outpass</Button></div>
          <div className="card"><div className="card-body" style={{ padding: 0 }}>
            <Table
              columns={[
                { key: 'no', label: 'Outpass', render: (r) => <div><strong>{r.outpassNumber}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label(r.outpassType)}</div></div> },
                { key: 'purpose', label: 'Purpose', render: (r) => r.purpose },
                { key: 'when', label: 'When', render: (r) => <div style={{ fontSize: '.8rem' }}>{dd(r.departureDate)}<div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.expectedDepartureTime} → {r.expectedReturnTime}</div></div> },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
                { key: 'a', label: '', render: (r) => (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {role === 'student' && ['approved', 'active'].includes(r.status) && (
                      <Button size="sm" onClick={() => showPass(r._id)}>Show pass</Button>
                    )}
                    {['pending', 'approved'].includes(r.status) && (
                      <Button size="sm" variant="secondary" onClick={() => cancelOutpass(r._id)}>Cancel</Button>
                    )}
                  </div>
                ) },
              ]}
              data={lists.outpass || []} emptyIcon="🎫" emptyTitle="No outpasses" />
          </div></div>
        </div>
      )}

      {tab === 'visitors' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div><Button onClick={() => setModal('visitor')}>+ Pre-register a visitor</Button></div>
          {!!lists.visitors?.restricted?.length && (
            <Alert variant="warning">
              Restricted visitors: {lists.visitors.restricted.map((v) => v.visitorName).join(', ')}
            </Alert>
          )}
          <div className="card"><div className="card-body" style={{ padding: 0 }}>
            <Table
              columns={[
                { key: 'name', label: 'Visitor', render: (r) => <div><strong>{r.visitorName}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{[r.relationship, r.mobile].filter(Boolean).join(' · ')}</div></div> },
                { key: 'purpose', label: 'Purpose', render: (r) => r.purpose || '—' },
                { key: 'entry', label: 'Entry', render: (r) => dt(r.entryTime) },
                { key: 'exit', label: 'Exit', render: (r) => dt(r.exitTime) },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
              ]}
              data={lists.visitors?.visits || []} emptyIcon="👋" emptyTitle="No visitors yet" />
          </div></div>
        </div>
      )}

      {tab === 'mess' && (
        lists.mess?.member ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <Card title={lists.mess.member.mess?.name || 'Mess'}>
              <FieldGrid>
                <Field label="Food preference">{label(lists.mess.member.foodPreference)}</Field>
                <Field label="Meal plan">{label(lists.mess.member.mealPlan)}</Field>
                <Field label="Allergies">{(lists.mess.member.allergies || []).join(', ') || 'none'}</Field>
                <Field label="Since">{dd(lists.mess.member.fromDate)}</Field>
              </FieldGrid>
            </Card>
            <Card title="This week's menu">
              {lists.mess.menu?.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Date</th><th>Meal</th><th>Items</th></tr></thead>
                    <tbody>
                      {lists.mess.menu.map((m) => (
                        <tr key={m._id}>
                          <td style={{ fontSize: '.82rem' }}>{dd(m.date)}</td>
                          <td style={{ fontSize: '.82rem', textTransform: 'capitalize' }}>{m.meal}</td>
                          <td style={{ fontSize: '.82rem' }}>{(m.items || []).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <span className="text-muted" style={{ fontSize: '.85rem' }}>No menu published for this week yet.</span>}
            </Card>
          </div>
        ) : <Empty icon="🍽" title="Not enrolled in a mess" message="Speak to the hostel office to join the mess." />
      )}

      {tab === 'fees' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="stats-grid">
            <StatCard icon="🧾" color="blue"   label="Billed"      value={money(lists.fees?.summary?.billed)} />
            <StatCard icon="✅" color="green"  label="Paid"        value={money(lists.fees?.summary?.paid)} />
            <StatCard icon="⏳" color="orange" label="Outstanding" value={money(lists.fees?.summary?.outstanding)} />
            <StatCard icon="⚠️" color="red"    label="Overdue"     value={lists.fees?.summary?.overdue || 0} />
          </div>
          <div className="card"><div className="card-body" style={{ padding: 0 }}>
            <Table
              columns={[
                { key: 'no', label: 'Invoice', render: (r) => <div><strong>{r.invoiceNumber}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label(r.feeType)}{r.period?.label ? ` · ${r.period.label}` : ''}</div></div> },
                { key: 'net', label: 'Amount', render: (r) => money(r.netAmount) },
                { key: 'paid', label: 'Paid', render: (r) => money(r.paidAmount) },
                { key: 'due', label: 'Due', render: (r) => dd(r.dueDate) },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
              ]}
              data={lists.fees?.invoices || []} emptyIcon="💳" emptyTitle="No hostel fees raised" />
          </div></div>
        </div>
      )}

      {tab === 'complaints' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div><Button onClick={() => setModal('complaint')}>+ Raise a complaint</Button></div>
          <div className="card"><div className="card-body" style={{ padding: 0 }}>
            <Table
              columns={[
                { key: 'no', label: 'Ticket', render: (r) => <div><strong>{r.ticketNumber}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label(r.category)}</div></div> },
                { key: 'desc', label: 'Complaint', render: (r) => <span style={{ fontSize: '.82rem' }}>{r.subject || r.description}</span> },
                { key: 'raised', label: 'Raised', render: (r) => dd(r.createdAt) },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
                { key: 'a', label: '', render: (r) => ['resolved', 'closed'].includes(r.status) && (
                  <Button size="sm" variant="secondary"
                    onClick={() => api.actOnComplaint(r._id, { action: 'reopen', comment: 'Reopened by resident' })
                      .then(() => { toast.success('Reopened'); loadTab('complaints'); })
                      .catch((e) => toast.error(e.message))}>
                    Reopen
                  </Button>
                ) },
              ]}
              data={lists.complaints || []} emptyIcon="📣" emptyTitle="No complaints raised" />
          </div></div>
        </div>
      )}

      {tab === 'record' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <Card title="Discipline">
            {lists.record?.discipline?.length ? lists.record.discipline.map((d) => (
              <div key={d._id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ fontSize: '.85rem' }}>{d.violation}</strong>
                  <span style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>{dd(d.date)}</span>
                </div>
                <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                  <Badge variant="primary">{label(d.actionType)}</Badge>
                  {d.fineAmount > 0 && <Badge variant="warning">{money(d.fineAmount)}</Badge>}
                </div>
              </div>
            )) : <span className="text-muted" style={{ fontSize: '.85rem' }}>Clean record.</span>}
          </Card>
          <Card title="Recent gate movement">
            {lists.record?.movements?.length ? lists.record.movements.slice(0, 15).map((m) => (
              <div key={m._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '.83rem' }}>
                <span><Badge variant={m.direction === 'out' ? 'warning' : 'success'}>{m.direction === 'out' ? 'Out' : 'In'}</Badge> {label(m.movementType)}</span>
                <span className="text-muted">{dt(m.at)}</span>
              </div>
            )) : <span className="text-muted" style={{ fontSize: '.85rem' }}>No movement recorded.</span>}
          </Card>
          {!!lists.record?.documents?.length && (
            <Card title="Your hostel documents">
              {lists.record.documents.map((d) => (
                <div key={d._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.84rem' }}>
                  <span>{d.title}</span><StatusBadge value={d.verificationStatus} />
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ── Request forms ─────────────────────────────────────────────────── */}
      <Modal open={modal === 'leave'} onClose={() => setModal(null)} maxWidth={560} title="Request Leave"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button loading={saving} onClick={() => submit('leave')}>Request</Button></>}>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-control" value={leaveForm.leaveType} onChange={(e) => setLeaveForm((f) => ({ ...f, leaveType: e.target.value }))}>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Destination</label>
            <input className="form-control" value={leaveForm.destination} onChange={(e) => setLeaveForm((f) => ({ ...f, destination: e.target.value }))} />
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label required">From</label>
            <input className="form-control" type="date" value={leaveForm.fromDate} onChange={(e) => setLeaveForm((f) => ({ ...f, fromDate: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label required">To</label>
            <input className="form-control" type="date" value={leaveForm.toDate} onChange={(e) => setLeaveForm((f) => ({ ...f, toDate: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label required">Reason</label>
          <textarea className="form-control" rows={3} value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} />
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Guardian</label>
            <input className="form-control" value={leaveForm.guardianName} onChange={(e) => setLeaveForm((f) => ({ ...f, guardianName: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Guardian Phone</label>
            <input className="form-control" value={leaveForm.guardianPhone} onChange={(e) => setLeaveForm((f) => ({ ...f, guardianPhone: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'outpass'} onClose={() => setModal(null)} maxWidth={560} title="Request Outpass"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button loading={saving} onClick={() => submit('outpass')}>Request</Button></>}>
        <Alert variant="info">
          Allowed between {data.rules?.outpassFrom} and {data.rules?.outpassTo}, for at most {data.rules?.maxOutpassHours} hours.
        </Alert>
        <div className="form-row form-row-2" style={{ marginTop: 14 }}>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-control" value={outForm.outpassType} onChange={(e) => setOutForm((f) => ({ ...f, outpassType: e.target.value }))}>
              {OUTPASS_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Departure Date</label>
            <input className="form-control" type="date" value={outForm.departureDate} onChange={(e) => setOutForm((f) => ({ ...f, departureDate: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label required">Purpose</label>
          <input className="form-control" value={outForm.purpose} onChange={(e) => setOutForm((f) => ({ ...f, purpose: e.target.value }))} />
        </div>
        <div className="form-row form-row-3">
          <div className="form-group">
            <label className="form-label">Destination</label>
            <input className="form-control" value={outForm.destination} onChange={(e) => setOutForm((f) => ({ ...f, destination: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Leaving at</label>
            <input className="form-control" type="time" value={outForm.expectedDepartureTime} onChange={(e) => setOutForm((f) => ({ ...f, expectedDepartureTime: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Back by</label>
            <input className="form-control" type="time" value={outForm.expectedReturnTime} onChange={(e) => setOutForm((f) => ({ ...f, expectedReturnTime: e.target.value }))} />
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Guardian</label>
            <input className="form-control" value={outForm.guardianName} onChange={(e) => setOutForm((f) => ({ ...f, guardianName: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Guardian Phone</label>
            <input className="form-control" value={outForm.guardianPhone} onChange={(e) => setOutForm((f) => ({ ...f, guardianPhone: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'visitor'} onClose={() => setModal(null)} maxWidth={520} title="Pre-register a Visitor"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button loading={saving} onClick={() => submit('visitor')}>Register</Button></>}>
        <Alert variant="info">
          Visitors are received {(data.rules?.visitorDays || []).join(', ') || 'any day'} between{' '}
          {data.rules?.visitorFrom} and {data.rules?.visitorTo}. The warden still approves each visit.
        </Alert>
        <div className="form-row form-row-2" style={{ marginTop: 14 }}>
          <div className="form-group">
            <label className="form-label required">Visitor Name</label>
            <input className="form-control" value={visitorForm.visitorName} onChange={(e) => setVisitorForm((f) => ({ ...f, visitorName: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Mobile</label>
            <input className="form-control" value={visitorForm.mobile} onChange={(e) => setVisitorForm((f) => ({ ...f, mobile: e.target.value }))} />
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Relationship</label>
            <input className="form-control" value={visitorForm.relationship} onChange={(e) => setVisitorForm((f) => ({ ...f, relationship: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Expected at</label>
            <input className="form-control" type="datetime-local" value={visitorForm.scheduledAt} onChange={(e) => setVisitorForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Purpose</label>
          <input className="form-control" value={visitorForm.purpose} onChange={(e) => setVisitorForm((f) => ({ ...f, purpose: e.target.value }))} />
        </div>
      </Modal>

      <Modal open={modal === 'complaint'} onClose={() => setModal(null)} maxWidth={520} title="Raise a Complaint"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button loading={saving} onClick={() => submit('complaint')}>Raise</Button></>}>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-control" value={complaintForm.category} onChange={(e) => setComplaintForm((f) => ({ ...f, category: e.target.value }))}>
              {COMPLAINT_CATS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Priority</label>
            <select className="form-control" value={complaintForm.priority} onChange={(e) => setComplaintForm((f) => ({ ...f, priority: e.target.value }))}>
              {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{label(p)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Subject</label>
          <input className="form-control" value={complaintForm.subject} onChange={(e) => setComplaintForm((f) => ({ ...f, subject: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label required">Description</label>
          <textarea className="form-control" rows={4} value={complaintForm.description} onChange={(e) => setComplaintForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <Attachments value={complaintForm.attachments}
          onChange={(v) => setComplaintForm((f) => ({ ...f, attachments: v }))}
          upload={api.uploadAttachment} />
      </Modal>

      {/* ── The gate pass ─────────────────────────────────────────────────── */}
      <Modal open={!!pass} onClose={() => setPass(null)} maxWidth={420} title="Outpass">
        {pass && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{pass.outpassNumber}</div>
            <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              {pass.student?.name} · Room {pass.room}
            </div>
            <PassQr image={pass.qrImage} token={pass.qrToken} size={240} />
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 12 }}>
              Show this code at the gate. Back by <strong>{dt(pass.expectedReturnAt)}</strong>.
            </div>
            <div style={{ marginTop: 10 }}><StatusBadge value={pass.status} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
