import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Table, Button, Modal, Badge, Pagination, Spinner, Alert, Card,
} from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, label, dd, money } from '../shared';

const STATUSES = ['active', 'pending', 'transferred', 'vacated', 'cancelled'];

export default function Allocations() {
  const [rows, setRows]    = useState([]);
  const [pg, setPg]        = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ status: 'active', hostel: '', room: '', presence: '', search: '' });
  const [modal, setModal]  = useState(null);      // 'allocate' | 'bulk' | 'transfer' | 'release'
  const [target, setTarget] = useState(null);
  const [busy, setBusy]    = useState(false);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState(null);

  const [allocForm, setAllocForm] = useState({ student: '', bed: '', academicYear: '', allocationType: 'permanent', fromDate: '', toDate: '', remarks: '', auto: true });
  const [bulkForm, setBulkForm]   = useState({ students: [], academicYear: '', hostel: '', preferredRoomType: '' });
  const [transferForm, setTransferForm] = useState({ bed: '', reason: '' });
  const [releaseForm, setReleaseForm]   = useState({ reason: '', status: 'vacated' });
  const [freeBeds, setFreeBeds] = useState([]);
  const [students, setStudents] = useState([]);
  const [bulkResult, setBulkResult] = useState(null);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const years = meta?.academicYears || [];
  const activeYear = years.find((y) => y.status === 'active')?._id || years[0]?._id || '';

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const res = await api.getAllocations({ page, limit: 20, ...filters });
      const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [filters.status, filters.hostel, filters.presence]); // eslint-disable-line

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const loadFreeBeds = async (hostelId) => {
    try {
      const r = await api.getBeds({ hostel: hostelId || undefined, status: 'available' });
      setFreeBeds(r.data ?? r);
    } catch { setFreeBeds([]); }
  };
  const loadStudents = async () => {
    try { const r = await api.searchStudents({ onlyUnallocated: 'true' }); setStudents(r.data ?? r); }
    catch { setStudents([]); }
  };

  const openAllocate = async () => {
    setAllocForm({ student: '', bed: '', academicYear: activeYear, allocationType: 'permanent', fromDate: '', toDate: '', remarks: '', auto: true });
    setModal('allocate');
    await Promise.all([loadStudents(), loadFreeBeds()]);
  };
  const openBulk = async () => {
    setBulkForm({ students: [], academicYear: activeYear, hostel: '', preferredRoomType: '' });
    setBulkResult(null);
    setModal('bulk');
    await loadStudents();
  };
  const openTransfer = async (row) => {
    setTarget(row); setTransferForm({ bed: '', reason: '' });
    setModal('transfer');
    await loadFreeBeds();
  };
  const openRelease = (row) => {
    setTarget(row); setReleaseForm({ reason: '', status: 'vacated' });
    setModal('release');
  };

  const doAllocate = async () => {
    setBusy(true);
    try {
      if (allocForm.auto && !allocForm.bed) {
        await api.autoAllocate({
          student: allocForm.student, academicYear: allocForm.academicYear,
          hostel: filters.hostel || null, preferredRoomType: '',
        });
      } else {
        await api.createAllocation({
          student: allocForm.student, bed: allocForm.bed, academicYear: allocForm.academicYear,
          allocationType: allocForm.allocationType,
          fromDate: allocForm.fromDate || undefined, toDate: allocForm.toDate || undefined,
          remarks: allocForm.remarks,
        });
      }
      toast.success('Bed allocated');
      setModal(null); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const doBulk = async () => {
    if (!bulkForm.students.length) return toast.error('Pick at least one student');
    setBusy(true);
    try {
      const r = await api.bulkAllocate(bulkForm);
      const d = r.data ?? r;
      setBulkResult(d);
      toast.success(`${d.allocated.length} allocated, ${d.failed.length} could not be placed`);
      load(1);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const doTransfer = async () => {
    if (!transferForm.bed) return toast.error('Pick a destination bed');
    setBusy(true);
    try {
      await api.transferAllocation(target._id, transferForm);
      toast.success('Student transferred');
      setModal(null); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const doRelease = async () => {
    setBusy(true);
    try {
      const r = await api.releaseAllocation(target._id, releaseForm);
      const d = r.data ?? r;
      toast.success('Allocation closed');
      if (d.outstandingDues > 0) toast(`Outstanding hostel dues: ${money(d.outstandingDues)}`, { icon: '💳', duration: 6000 });
      if (d.unreturnedAssets > 0) toast(`${d.unreturnedAssets} hostel item(s) still on issue`, { icon: '📦', duration: 6000 });
      setModal(null); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const openProfile = async (studentId) => {
    setProfile({ loading: true });
    try { const r = await api.getStudentProfile(studentId); setProfile(r.data ?? r); }
    catch (err) { toast.error(err.message); setProfile(null); }
  };

  const openHistory = async (row) => {
    setHistory({ loading: true });
    try { const r = await api.getAllocationHistory({ student: row.student?._id || row.student }); setHistory(r.data ?? r); }
    catch (err) { toast.error(err.message); setHistory(null); }
  };

  const columns = [
    { key: 'student', label: 'Student', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => openProfile(r.student?._id || r.student)}>
          {r.student?.name || '—'}
        </strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.student?.email}</div>
      </div>
    ) },
    { key: 'place', label: 'Placement', render: (r) => (
      <div style={{ fontSize: '.83rem' }}>
        {r.hostel?.name}
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          {r.building?.name} · {r.floor?.name} · Room {r.room?.roomNumber} · Bed {r.bed?.bedNumber}
        </div>
      </div>
    ) },
    { key: 'type', label: 'Type', render: (r) => <Badge variant="muted">{label(r.allocationType)}</Badge> },
    { key: 'from', label: 'From', render: (r) => dd(r.fromDate) },
    { key: 'presence', label: 'Presence', render: (r) => r.status === 'active'
      ? <Badge variant={r.presence === 'in' ? 'success' : r.presence === 'out' ? 'warning' : 'info'}>{label(r.presence)}</Badge>
      : <span>—</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" onClick={() => openProfile(r.student?._id || r.student)}>Profile</Button>
        <Button size="sm" variant="secondary" onClick={() => openHistory(r)}>History</Button>
        {['active', 'pending'].includes(r.status) && (
          <>
            <Button size="sm" onClick={() => openTransfer(r)}>Transfer</Button>
            <Button size="sm" variant="danger" onClick={() => openRelease(r)}>Release</Button>
          </>
        )}
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Room & Bed Allocation" subtitle="Manual, automatic and bulk placement — every move is transactional and kept in history"
        action={<div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={openBulk}>Bulk allocate</Button>
          <Button onClick={openAllocate}>+ Allocate</Button>
        </div>} />

      <Filters>
        <input className="form-control" style={{ maxWidth: 240 }} placeholder="🔍 Student or room…"
          value={filters.search} onChange={(e) => setFilter('search', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1)} />
        <select className="form-control" style={{ maxWidth: 200 }} value={filters.hostel} onChange={(e) => setFilter('hostel', e.target.value)}>
          <option value="">All hostels</option>
          {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 170 }} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 160 }} value={filters.presence} onChange={(e) => setFilter('presence', e.target.value)}>
          <option value="">Anywhere</option>
          <option value="in">Inside</option>
          <option value="out">Outside</option>
          <option value="on_leave">On leave</option>
        </select>
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🛏" emptyTitle="No allocations" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      {/* ── Allocate ──────────────────────────────────────────────────────── */}
      <Modal open={modal === 'allocate'} onClose={() => setModal(null)} maxWidth={600} title="Allocate a Bed"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button loading={busy} onClick={doAllocate} disabled={!allocForm.student || !allocForm.academicYear}>Allocate</Button>
        </>}>
        <Alert variant="info">
          Gender restriction, room and hostel capacity, hostel status and "one active allocation
          per student" are all checked before the bed is given.
        </Alert>
        <div className="form-row form-row-2" style={{ marginTop: 14 }}>
          <div className="form-group">
            <label className="form-label required">Student</label>
            <select className="form-control" value={allocForm.student} onChange={(e) => setAllocForm((f) => ({ ...f, student: e.target.value }))}>
              <option value="">— select —</option>
              {students.map((s) => (
                <option key={s._id} value={s._id}>{s.name}{s.className ? ` · ${s.className}` : ''}{s.gender ? ` · ${s.gender}` : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Academic Year</label>
            <select className="form-control" value={allocForm.academicYear} onChange={(e) => setAllocForm((f) => ({ ...f, academicYear: e.target.value }))}>
              <option value="">— select —</option>
              {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Bed</label>
          <select className="form-control" value={allocForm.bed}
            onChange={(e) => setAllocForm((f) => ({ ...f, bed: e.target.value, auto: !e.target.value }))}>
            <option value="">Pick the best free bed automatically</option>
            {freeBeds.map((b) => (
              <option key={b._id} value={b._id}>Room {b.room?.roomNumber} · Bed {b.bedNumber} ({label(b.room?.roomType)})</option>
            ))}
          </select>
          <div className="form-hint">Automatic picks a partly-filled room of the preferred type first.</div>
        </div>
        <div className="form-row form-row-3">
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-control" value={allocForm.allocationType} onChange={(e) => setAllocForm((f) => ({ ...f, allocationType: e.target.value }))}>
              <option value="permanent">Permanent</option>
              <option value="temporary">Temporary</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">From</label>
            <input className="form-control" type="date" value={allocForm.fromDate} onChange={(e) => setAllocForm((f) => ({ ...f, fromDate: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">To (temporary)</label>
            <input className="form-control" type="date" value={allocForm.toDate} onChange={(e) => setAllocForm((f) => ({ ...f, toDate: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Remarks</label>
          <input className="form-control" value={allocForm.remarks} onChange={(e) => setAllocForm((f) => ({ ...f, remarks: e.target.value }))} />
        </div>
      </Modal>

      {/* ── Bulk ──────────────────────────────────────────────────────────── */}
      <Modal open={modal === 'bulk'} onClose={() => setModal(null)} maxWidth={680} title="Bulk Allocation"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
          {!bulkResult && <Button loading={busy} onClick={doBulk}>Allocate {bulkForm.students.length || ''}</Button>}
        </>}>
        {bulkResult ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <Alert variant={bulkResult.failed.length ? 'warning' : 'success'}>
              {bulkResult.allocated.length} student(s) placed, {bulkResult.failed.length} could not be.
            </Alert>
            {!!bulkResult.allocated.length && (
              <Card title="Placed">
                {bulkResult.allocated.map((a) => (
                  <div key={a.student} style={{ fontSize: '.83rem', padding: '4px 0' }}>
                    ✅ {a.studentName} → {a.hostel} · Room {a.room} · Bed {a.bed}
                  </div>
                ))}
              </Card>
            )}
            {!!bulkResult.failed.length && (
              <Card title="Not placed">
                {bulkResult.failed.map((f) => (
                  <div key={f.student} style={{ fontSize: '.83rem', padding: '4px 0' }}>
                    ⚠️ {f.studentName} — <span style={{ color: 'var(--text-muted)' }}>{f.reason}</span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        ) : (
          <>
            <Alert variant="info">
              Each student is allocated in its own transaction — one failure never rolls back the rest.
            </Alert>
            <div className="form-row form-row-3" style={{ marginTop: 14 }}>
              <div className="form-group">
                <label className="form-label required">Academic Year</label>
                <select className="form-control" value={bulkForm.academicYear} onChange={(e) => setBulkForm((f) => ({ ...f, academicYear: e.target.value }))}>
                  {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Hostel</label>
                <select className="form-control" value={bulkForm.hostel} onChange={(e) => setBulkForm((f) => ({ ...f, hostel: e.target.value }))}>
                  <option value="">Any suitable hostel</option>
                  {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Preferred Room Type</label>
                <select className="form-control" value={bulkForm.preferredRoomType} onChange={(e) => setBulkForm((f) => ({ ...f, preferredRoomType: e.target.value }))}>
                  <option value="">No preference</option>
                  {['single', 'double', 'triple', 'four_bed', 'dormitory'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Students ({bulkForm.students.length} selected)</label>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                {students.map((s) => (
                  <label key={s._id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 2px', fontSize: '.85rem' }}>
                    <input type="checkbox" checked={bulkForm.students.includes(s._id)}
                      onChange={(e) => setBulkForm((f) => ({
                        ...f,
                        students: e.target.checked ? [...f.students, s._id] : f.students.filter((x) => x !== s._id),
                      }))} />
                    {s.name}
                    <span style={{ color: 'var(--text-muted)', fontSize: '.76rem' }}>
                      {[s.className, s.gender].filter(Boolean).join(' · ')}
                    </span>
                  </label>
                ))}
                {!students.length && <div className="text-muted" style={{ fontSize: '.83rem' }}>Every student already has an allocation.</div>}
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* ── Transfer ──────────────────────────────────────────────────────── */}
      <Modal open={modal === 'transfer'} onClose={() => setModal(null)} maxWidth={560}
        title={target ? `Transfer ${target.student?.name}` : 'Transfer'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button loading={busy} onClick={doTransfer}>Transfer</Button>
        </>}>
        {target && (
          <>
            <p style={{ fontSize: '.86rem', marginTop: 0 }}>
              Currently in <strong>{target.hostel?.name} · Room {target.room?.roomNumber} · Bed {target.bed?.bedNumber}</strong>.
            </p>
            <div className="form-group">
              <label className="form-label required">Destination Bed</label>
              <select className="form-control" value={transferForm.bed} onChange={(e) => setTransferForm((f) => ({ ...f, bed: e.target.value }))}>
                <option value="">— select —</option>
                {freeBeds.map((b) => (
                  <option key={b._id} value={b._id}>Room {b.room?.roomNumber} · Bed {b.bedNumber}</option>
                ))}
              </select>
              <div className="form-hint">Bed, room, floor and hostel transfers are all the same move.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <textarea className="form-control" rows={3} value={transferForm.reason} onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          </>
        )}
      </Modal>

      {/* ── Release ───────────────────────────────────────────────────────── */}
      <Modal open={modal === 'release'} onClose={() => setModal(null)} maxWidth={520}
        title={target ? `Release ${target.student?.name}` : 'Release'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={doRelease}>Release</Button>
        </>}>
        <Alert variant="warning">
          The allocation is closed and the bed freed. The record itself is kept, so occupancy history
          stays intact.
        </Alert>
        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label">Outcome</label>
          <select className="form-control" value={releaseForm.status} onChange={(e) => setReleaseForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="vacated">Vacated (checked out)</option>
            <option value="cancelled">Cancelled (allocation was a mistake)</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Reason</label>
          <textarea className="form-control" rows={3} value={releaseForm.reason} onChange={(e) => setReleaseForm((f) => ({ ...f, reason: e.target.value }))} />
        </div>
      </Modal>

      {/* ── Student hostel profile ────────────────────────────────────────── */}
      <Modal open={!!profile} onClose={() => setProfile(null)} maxWidth={860}
        title={profile?.student?.name ? `${profile.student.name} — Hostel Profile` : 'Hostel Profile'}>
        {profile?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : profile && (
          <div style={{ display: 'grid', gap: 18 }}>
            <FieldGrid>
              <Field label="Hostel status"><Badge variant={profile.hostelStatus === 'resident' ? 'success' : 'muted'}>{label(profile.hostelStatus)}</Badge></Field>
              <Field label="Hostel">{profile.current?.hostel?.name}</Field>
              <Field label="Building">{profile.current?.building?.name}</Field>
              <Field label="Floor">{profile.current?.floor?.name}</Field>
              <Field label="Room">{profile.current?.room?.roomNumber}</Field>
              <Field label="Bed">{profile.current?.bed?.bedNumber}</Field>
              <Field label="Warden">{profile.warden?.name}</Field>
              <Field label="Joined">{dd(profile.current?.fromDate)}</Field>
              <Field label="Blood group">{profile.student?.profile?.bloodGroup}</Field>
              <Field label="Emergency contact">
                {profile.student?.profile?.emergencyContactName}
                {profile.student?.profile?.emergencyContactPhone ? ` · ${profile.student.profile.emergencyContactPhone}` : ''}
              </Field>
            </FieldGrid>

            <div className="stats-grid" style={{ gap: 10 }}>
              {[
                ['Present days', profile.attendanceSummary?.present || 0],
                ['Absent days', profile.attendanceSummary?.absent || 0],
                ['Leaves', profile.leaves?.length || 0],
                ['Outpasses', profile.outpasses?.length || 0],
                ['Complaints', profile.complaints?.length || 0],
                ['Discipline', profile.discipline?.length || 0],
                ['Fees due', money(profile.feeSummary?.outstanding)],
              ].map(([l, v]) => (
                <div key={l} className="card" style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{v}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{l}</div>
                </div>
              ))}
            </div>

            {!!profile.previousAllocations?.length && (
              <Card title="Previous allocations">
                {profile.previousAllocations.map((a) => (
                  <div key={a._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '.83rem', borderBottom: '1px solid var(--border)' }}>
                    <span>{a.hostel?.name} · Room {a.room?.roomNumber} · Bed {a.bed?.bedNumber}</span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{dd(a.fromDate)} – {dd(a.vacatedDate)}</span>
                      <StatusBadge value={a.status} />
                    </span>
                  </div>
                ))}
              </Card>
            )}
            {!!profile.discipline?.length && (
              <Card title="Discipline history">
                {profile.discipline.map((d) => (
                  <div key={d._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '.83rem', borderBottom: '1px solid var(--border)' }}>
                    <span>{d.violation}</span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      {d.isRepeatOffence && <Badge variant="danger">repeat</Badge>}
                      <Badge variant="muted">{label(d.actionType)}</Badge>
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* ── Allocation history ────────────────────────────────────────────── */}
      <Modal open={!!history} onClose={() => setHistory(null)} maxWidth={700} title="Allocation History">
        {history?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : (
          <div>
            {(history || []).map((h) => (
              <div key={h._id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Badge variant={h.action === 'transferred' ? 'info' : h.action === 'allocated' ? 'success' : 'muted'}>{label(h.action)}</Badge>
                  <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{dd(h.effectiveDate)}</span>
                </div>
                <div style={{ fontSize: '.83rem', marginTop: 4 }}>
                  {h.fromLabel && <span>{h.fromLabel}</span>}
                  {h.fromLabel && h.toLabel && <span style={{ color: 'var(--text-muted)' }}> → </span>}
                  {h.toLabel && <span>{h.toLabel}</span>}
                </div>
                {h.reason && <div style={{ fontSize: '.77rem', color: 'var(--text-muted)', marginTop: 2 }}>{h.reason}</div>}
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>by {h.performedByName || h.performedBy?.name || 'System'}</div>
              </div>
            ))}
            {!history?.length && !history?.loading && <div className="text-muted" style={{ fontSize: '.85rem' }}>No history yet.</div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
