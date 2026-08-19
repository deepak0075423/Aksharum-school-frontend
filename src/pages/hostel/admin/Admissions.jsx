import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Table, Button, Modal, Badge, Pagination, Spinner, Alert,
} from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, label, dd, di } from '../shared';

const empty = {
  student: '', hostel: '', academicYear: '', preferredRoomType: '',
  joiningDate: '', expectedLeavingDate: '', reason: '',
  guardianName: '', guardianPhone: '', guardianRelation: '',
  emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
  medicalInfo: '', specialRequirements: '', remarks: '',
};
const STATUSES = ['draft', 'applied', 'pending_approval', 'approved', 'rejected', 'waitlisted', 'cancelled', 'completed'];
const ROOM_TYPES = ['single', 'double', 'triple', 'four_bed', 'dormitory'];

export default function Admissions() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows]     = useState([]);
  const [pg, setPg]         = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad]  = useState(true);
  const [status, setStatus] = useState(params.get('status') || '');
  const [year, setYear]     = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [decide, setDecide] = useState(null);   // { row, action }
  const [decideForm, setDecideForm] = useState({ remark: '', allocate: true, bed: '' });
  const [deciding, setDeciding] = useState(false);
  const [freeBeds, setFreeBeds] = useState([]);
  const [students, setStudents] = useState([]);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const years = meta?.academicYears || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const res = await api.getAdmissions({ page, limit: 20, status, academicYear: year, search });
      const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [status, year, search]);
  useEffect(() => { load(1); }, [status, year]); // eslint-disable-line

  const setStatusFilter = (v) => {
    setStatus(v);
    if (v) setParams({ status: v }); else setParams({});
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const open = async () => {
    setForm({ ...empty, academicYear: years.find((y) => y.status === 'active')?._id || years[0]?._id || '' });
    setModal(true);
    try {
      const r = await api.searchStudents({ onlyUnallocated: 'true' });
      setStudents(r.data ?? r);
    } catch { /* the picker just stays empty */ }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createAdmission(form);
      toast.success('Application filed');
      setModal(false); load(1);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true });
    try { const r = await api.getAdmission(row._id); setDetail(r.data ?? r); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const openDecide = async (row, action) => {
    setDecide({ row, action });
    setDecideForm({ remark: '', allocate: action === 'approve', bed: '' });
    if (action === 'approve') {
      try {
        const r = await api.getBeds({ hostel: row.hostel?._id || row.hostel, status: 'available' });
        setFreeBeds(r.data ?? r);
      } catch { setFreeBeds([]); }
    }
  };

  const submitDecision = async () => {
    setDeciding(true);
    try {
      const r = await api.decideAdmission(decide.row._id, {
        action: decide.action,
        remark: decideForm.remark,
        allocate: decideForm.allocate,
        bed: decideForm.bed || null,
      });
      const d = r.data ?? r;
      if (d.allocationError) toast(`Approved, but allocation failed: ${d.allocationError}`, { icon: '⚠️', duration: 6000 });
      else if (d.allocation) toast.success('Approved and a bed was allocated');
      else toast.success(`Application ${decide.action}d`);
      setDecide(null); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setDeciding(false); }
  };

  const columns = [
    { key: 'app', label: 'Application', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.applicationNumber}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{dd(r.appliedAt)}</div>
      </div>
    ) },
    { key: 'student', label: 'Student', render: (r) => r.student?.name || '—' },
    { key: 'hostel', label: 'Hostel', render: (r) => (
      <div>
        {r.hostel?.name || '—'}
        {r.preferredRoomType && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>prefers {label(r.preferredRoomType)}</div>}
      </div>
    ) },
    { key: 'year', label: 'Year', render: (r) => r.academicYear?.yearName || '—' },
    { key: 'joining', label: 'Joining', render: (r) => dd(r.joiningDate) },
    { key: 'status', label: 'Status', render: (r) => (
      <div>
        <StatusBadge value={r.status} />
        {r.status === 'waitlisted' && r.waitlistPosition > 0 && (
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>position {r.waitlistPosition}</div>
        )}
      </div>
    ) },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>View</Button>
        {['applied', 'pending_approval', 'waitlisted'].includes(r.status) && (
          <>
            <Button size="sm" onClick={() => openDecide(r, 'approve')}>Approve</Button>
            <Button size="sm" variant="danger" onClick={() => openDecide(r, 'reject')}>Reject</Button>
          </>
        )}
        {['applied', 'pending_approval'].includes(r.status) && (
          <Button size="sm" variant="secondary" onClick={() => openDecide(r, 'waitlist')}>Waitlist</Button>
        )}
        {r.status === 'approved' && !r.allocation && (
          <Button size="sm" onClick={() => openDecide(r, 'approve')}>Allocate bed</Button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Hostel Admissions" subtitle="Applications, approvals and the waitlist"
        action={<Button onClick={open}>+ New Application</Button>} />

      <Filters>
        <input className="form-control" style={{ maxWidth: 260 }} placeholder="🔍 Student or application no…"
          value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} />
        <select className="form-control" style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 190 }} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All years</option>
          {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
        </select>
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📝" emptyTitle="No applications yet" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      {/* ── New application ───────────────────────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)} maxWidth={780} title="New Hostel Application"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="adm-form" type="submit" loading={saving}>File Application</Button>
        </>}>
        <form id="adm-form" onSubmit={save}>
          <Alert variant="info">
            Guardian and emergency contacts are pre-filled from the student's existing record and
            snapshotted onto this application.
          </Alert>
          <div className="form-row form-row-2" style={{ marginTop: 14 }}>
            <div className="form-group">
              <label className="form-label required">Student</label>
              <select className="form-control" required value={form.student} onChange={(e) => set('student', e.target.value)}>
                <option value="">— select —</option>
                {students.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}{s.className ? ` · ${s.className}` : ''}{s.gender ? ` · ${s.gender}` : ''}
                  </option>
                ))}
              </select>
              <div className="form-hint">Only students without an active allocation are listed</div>
            </div>
            <div className="form-group">
              <label className="form-label required">Academic Year</label>
              <select className="form-control" required value={form.academicYear} onChange={(e) => set('academicYear', e.target.value)}>
                <option value="">— select —</option>
                {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Hostel</label>
              <select className="form-control" required value={form.hostel} onChange={(e) => set('hostel', e.target.value)}>
                <option value="">— select —</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name} ({label(h.gender)})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Preferred Room Type</label>
              <select className="form-control" value={form.preferredRoomType} onChange={(e) => set('preferredRoomType', e.target.value)}>
                <option value="">No preference</option>
                {ROOM_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Joining Date</label>
              <input className="form-control" type="date" value={form.joiningDate} onChange={(e) => set('joiningDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Expected Leaving Date</label>
              <input className="form-control" type="date" value={form.expectedLeavingDate} onChange={(e) => set('expectedLeavingDate', e.target.value)} />
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Guardian Name</label>
              <input className="form-control" value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} placeholder="from student record" />
            </div>
            <div className="form-group">
              <label className="form-label">Guardian Phone</label>
              <input className="form-control" value={form.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Relation</label>
              <input className="form-control" value={form.guardianRelation} onChange={(e) => set('guardianRelation', e.target.value)} />
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Emergency Contact</label>
              <input className="form-control" value={form.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Emergency Phone</label>
              <input className="form-control" value={form.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Relation</label>
              <input className="form-control" value={form.emergencyContactRelation} onChange={(e) => set('emergencyContactRelation', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Medical Information</label>
            <textarea className="form-control" rows={2} value={form.medicalInfo} onChange={(e) => set('medicalInfo', e.target.value)}
              placeholder="Anything the warden should know day to day" />
          </div>
          <div className="form-group">
            <label className="form-label">Special Requirements</label>
            <textarea className="form-control" rows={2} value={form.specialRequirements} onChange={(e) => set('specialRequirements', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Reason / Remarks</label>
            <input className="form-control" value={form.reason} onChange={(e) => set('reason', e.target.value)} />
          </div>
        </form>
      </Modal>

      {/* ── Decision ──────────────────────────────────────────────────────── */}
      <Modal open={!!decide} onClose={() => setDecide(null)} maxWidth={560}
        title={decide ? `${label(decide.action)} — ${decide.row.applicationNumber}` : ''}
        footer={<>
          <Button variant="secondary" onClick={() => setDecide(null)}>Cancel</Button>
          <Button loading={deciding} variant={decide?.action === 'reject' ? 'danger' : 'primary'} onClick={submitDecision}>
            Confirm
          </Button>
        </>}>
        {decide && (
          <div>
            <p style={{ fontSize: '.87rem', marginTop: 0 }}>
              <strong>{decide.row.student?.name}</strong> · {decide.row.hostel?.name}
            </p>
            {decide.action === 'approve' && (
              <>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.86rem', marginBottom: 12 }}>
                  <input type="checkbox" checked={decideForm.allocate}
                    onChange={(e) => setDecideForm((f) => ({ ...f, allocate: e.target.checked }))} />
                  Allocate a bed now
                </label>
                {decideForm.allocate && (
                  <div className="form-group">
                    <label className="form-label">Bed</label>
                    <select className="form-control" value={decideForm.bed}
                      onChange={(e) => setDecideForm((f) => ({ ...f, bed: e.target.value }))}>
                      <option value="">Pick the best free bed automatically</option>
                      {freeBeds.map((b) => (
                        <option key={b._id} value={b._id}>
                          Room {b.room?.roomNumber} · Bed {b.bedNumber}
                        </option>
                      ))}
                    </select>
                    <div className="form-hint">
                      Gender, capacity and hostel-status rules are checked before the bed is given.
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="form-group">
              <label className="form-label">{decide.action === 'reject' ? 'Reason' : 'Remark'}</label>
              <textarea className="form-control" rows={3} value={decideForm.remark}
                onChange={(e) => setDecideForm((f) => ({ ...f, remark: e.target.value }))} />
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
              The student and their parents are notified of this decision.
            </div>
          </div>
        )}
      </Modal>

      {/* ── Detail ────────────────────────────────────────────────────────── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={760}
        title={detail?.applicationNumber || 'Application'}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : detail && (
          <div style={{ display: 'grid', gap: 18 }}>
            <FieldGrid>
              <Field label="Student">{detail.student?.name}</Field>
              <Field label="Status"><StatusBadge value={detail.status} /></Field>
              <Field label="Hostel">{detail.hostel?.name}</Field>
              <Field label="Academic Year">{detail.academicYear?.yearName}</Field>
              <Field label="Preferred Room">{label(detail.preferredRoomType) || 'No preference'}</Field>
              <Field label="Applied">{dd(detail.appliedAt)}</Field>
              <Field label="Joining">{dd(detail.joiningDate)}</Field>
              <Field label="Expected Leaving">{dd(detail.expectedLeavingDate)}</Field>
              <Field label="Reviewed by">{detail.reviewedBy?.name}</Field>
            </FieldGrid>
            <FieldGrid>
              <Field label="Guardian">{detail.guardianName} {detail.guardianRelation ? `(${detail.guardianRelation})` : ''}</Field>
              <Field label="Guardian Phone">{detail.guardianPhone}</Field>
              <Field label="Emergency Contact">{detail.emergencyContactName}</Field>
              <Field label="Emergency Phone">{detail.emergencyContactPhone}</Field>
            </FieldGrid>
            {detail.studentDetails?.profile && (
              <FieldGrid>
                <Field label="Blood Group">{detail.studentDetails.profile.bloodGroup}</Field>
                <Field label="Gender">{detail.studentDetails.profile.gender}</Field>
                <Field label="Class">{detail.studentDetails.profile.currentClass?.className}</Field>
                <Field label="Admission No.">{detail.studentDetails.profile.admissionNumber}</Field>
              </FieldGrid>
            )}
            {detail.medicalInfo && <Field label="Medical Information" wide>{detail.medicalInfo}</Field>}
            {detail.specialRequirements && <Field label="Special Requirements" wide>{detail.specialRequirements}</Field>}
            {detail.decisionRemark && <Field label="Decision Remark" wide>{detail.decisionRemark}</Field>}
            {detail.allocation && (
              <div>
                <Badge variant="success">Allocated</Badge>
                <span style={{ fontSize: '.83rem', marginLeft: 8 }}>
                  from {dd(detail.allocation.fromDate)}
                </span>
              </div>
            )}
            {!!detail.documents?.length && (
              <div>
                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Documents</div>
                {detail.documents.map((d) => (
                  <div key={d._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '.83rem' }}>
                    <span>{d.title}</span><StatusBadge value={d.verificationStatus} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
