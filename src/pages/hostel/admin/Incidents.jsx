import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Table, Button, Modal, Badge, Pagination, Spinner, Alert, Card,
} from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, Attachments, fileUrl, label, dd, dt, today } from '../shared';

const TYPES = ['misconduct', 'fighting', 'theft', 'property_damage', 'security', 'medical_emergency', 'rule_violation', 'other'];
const SEVERITY = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['reported', 'investigating', 'action_taken', 'resolved', 'closed'];
const MEDICAL_CATS = ['first_aid', 'doctor_visit', 'hospital_visit', 'ambulance', 'medication'];
const empty = {
  hostel: '', room: '', student: '', incidentType: 'other', severity: 'low',
  date: today(), time: '', location: '', description: '', witnesses: '',
  assignedOfficer: '', actionTaken: '',
  medicalCategory: '', treatmentGiven: '', hospitalName: '', doctorName: '', transportArranged: false,
  attachments: [],
};

/**
 * Incidents and the medical/emergency log are one screen: a medical emergency
 * IS an incident, and the warden filing it wants one form, not two.
 */
export default function Incidents() {
  const [rows, setRows] = useState([]);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ status: '', incidentType: '', severity: '', medical: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [residents, setResidents] = useState([]);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const rooms = (meta?.rooms || []).filter((r) => !form.hostel || String(r.hostel) === form.hostel);
  const staff = meta?.staff || [];
  const isMedical = form.incidentType === 'medical_emergency';

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getIncidents({ page, limit: 20, ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [filters]); // eslint-disable-line

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'hostel' ? { room: '' } : {}) }));

  const open = async (row) => {
    if (row) {
      setEditId(row._id);
      setForm({
        ...empty, ...row,
        hostel: row.hostel?._id || row.hostel,
        room: row.room?._id || row.room || '',
        student: row.student?._id || row.student || '',
        assignedOfficer: row.assignedOfficer?._id || row.assignedOfficer || '',
        date: row.date ? String(row.date).slice(0, 10) : today(),
        witnesses: (row.witnesses || []).join(', '),
      });
    } else { setEditId(null); setForm(empty); }
    setModal(true);
    try {
      const r = await api.getAllocations({ status: 'active', limit: 300 });
      setResidents((r.data ?? r).data || []);
    } catch { setResidents([]); }
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const p = {
        ...form,
        room: form.room || null, student: form.student || null,
        assignedOfficer: form.assignedOfficer || null,
        witnesses: String(form.witnesses).split(',').map((s) => s.trim()).filter(Boolean),
      };
      if (editId) await api.updateIncident(editId, p); else await api.createIncident(p);
      toast.success(editId ? 'Incident updated' : 'Incident reported'); setModal(false); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true });
    try { const r = await api.getIncident(row._id); setDetail(r.data ?? r); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const setStatus = async (row, status) => {
    try { await api.updateIncident(row._id, { status }); toast.success(`Marked ${label(status)}`); load(pg.page); }
    catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'no', label: 'Incident', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.incidentNumber}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{dd(r.date)}{r.time ? ` · ${r.time}` : ''}</div>
      </div>
    ) },
    { key: 'type', label: 'Type', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Badge variant={r.incidentType === 'medical_emergency' ? 'info' : 'muted'}>{label(r.incidentType)}</Badge>
        <Badge variant={['critical', 'high'].includes(r.severity) ? 'danger' : r.severity === 'medium' ? 'warning' : 'muted'}>{r.severity}</Badge>
      </div>
    ) },
    { key: 'student', label: 'Student', render: (r) => (
      <div style={{ fontSize: '.82rem' }}>
        {r.student?.name || '—'}
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          {r.hostel?.name}{r.room?.roomNumber ? ` · Room ${r.room.roomNumber}` : ''}
        </div>
      </div>
    ) },
    { key: 'desc', label: 'What happened', render: (r) => (
      <span style={{ fontSize: '.8rem', display: 'inline-block', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.description}
      </span>
    ) },
    { key: 'officer', label: 'Officer', render: (r) => r.assignedOfficer?.name || <span className="text-muted">—</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>View</Button>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        {r.status === 'reported' && <Button size="sm" onClick={() => setStatus(r, 'investigating')}>Investigate</Button>}
        {['investigating', 'action_taken'].includes(r.status) && <Button size="sm" onClick={() => setStatus(r, 'resolved')}>Resolve</Button>}
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Incidents, Medical & Emergency" subtitle="One timeline for everything that happens to a resident"
        action={<Button onClick={() => open()}>+ Report Incident</Button>} />

      <Filters>
        <select className="form-control" style={{ maxWidth: 190 }} value={filters.incidentType} onChange={(e) => setFilters((f) => ({ ...f, incidentType: e.target.value, medical: '' }))}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 150 }} value={filters.severity} onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}>
          <option value="">All severities</option>
          {SEVERITY.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 170 }} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <Button size="sm" variant={filters.medical === 'true' ? 'primary' : 'secondary'}
          onClick={() => setFilters((f) => ({ ...f, medical: f.medical === 'true' ? '' : 'true', incidentType: '' }))}>
          🚑 Medical only
        </Button>
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="⚠️" emptyTitle="No incidents reported" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} maxWidth={720}
        title={editId ? 'Edit Incident' : 'Report Incident'}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="in-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="in-form" onSubmit={save}>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label required">Hostel</label>
              <select className="form-control" required value={form.hostel} onChange={(e) => set('hostel', e.target.value)}>
                <option value="">— select —</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Room</label>
              <select className="form-control" value={form.room} onChange={(e) => set('room', e.target.value)}>
                <option value="">— none —</option>
                {rooms.map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Student</label>
              <select className="form-control" value={form.student} onChange={(e) => set('student', e.target.value)}>
                <option value="">— none —</option>
                {residents.map((a) => (
                  <option key={a._id} value={a.student?._id || a.student}>{a.student?.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Incident Type</label>
              <select className="form-control" value={form.incidentType} onChange={(e) => set('incidentType', e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Severity</label>
              <select className="form-control" value={form.severity} onChange={(e) => set('severity', e.target.value)}>
                {SEVERITY.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assigned Officer</label>
              <select className="form-control" value={form.assignedOfficer} onChange={(e) => set('assignedOfficer', e.target.value)}>
                <option value="">— none —</option>
                {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label required">Date</label>
              <input className="form-control" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Time</label>
              <input className="form-control" type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-control" value={form.location} onChange={(e) => set('location', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Description</label>
            <textarea className="form-control" rows={3} required value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Witnesses</label>
            <input className="form-control" value={form.witnesses} onChange={(e) => set('witnesses', e.target.value)} placeholder="Comma separated" />
          </div>
          <Attachments value={form.attachments} onChange={(v) => set('attachments', v)}
            upload={api.uploadAttachment} entityType="HostelIncident" entityId={editId} />

          {isMedical && (
            <>
              <Alert variant="info">
                Blood group, allergies and medical certificates are read from the student's existing
                record — only what happened today is captured here. Parents are emailed immediately.
              </Alert>
              <div className="form-row form-row-3" style={{ marginTop: 14 }}>
                <div className="form-group">
                  <label className="form-label">Care given</label>
                  <select className="form-control" value={form.medicalCategory} onChange={(e) => set('medicalCategory', e.target.value)}>
                    <option value="">— select —</option>
                    {MEDICAL_CATS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Hospital</label>
                  <input className="form-control" value={form.hospitalName} onChange={(e) => set('hospitalName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Doctor</label>
                  <input className="form-control" value={form.doctorName} onChange={(e) => set('doctorName', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Treatment given</label>
                <textarea className="form-control" rows={2} value={form.treatmentGiven} onChange={(e) => set('treatmentGiven', e.target.value)} />
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem' }}>
                <input type="checkbox" checked={form.transportArranged} onChange={(e) => set('transportArranged', e.target.checked)} />
                Emergency transport arranged
              </label>
            </>
          )}
          {editId && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Action taken</label>
              <textarea className="form-control" rows={2} value={form.actionTaken} onChange={(e) => set('actionTaken', e.target.value)} />
            </div>
          )}
        </form>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={760} title={detail?.incidentNumber || 'Incident'}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : detail && (
          <div style={{ display: 'grid', gap: 16 }}>
            <FieldGrid>
              <Field label="Type">{label(detail.incidentType)}</Field>
              <Field label="Severity">{label(detail.severity)}</Field>
              <Field label="Status"><StatusBadge value={detail.status} /></Field>
              <Field label="Date">{dd(detail.date)} {detail.time}</Field>
              <Field label="Location">{detail.location}</Field>
              <Field label="Hostel">{detail.hostel?.name}</Field>
              <Field label="Room">{detail.room?.roomNumber}</Field>
              <Field label="Student">{detail.student?.name}</Field>
              <Field label="Reported by">{detail.reportedByName}</Field>
              <Field label="Officer">{detail.assignedOfficer?.name}</Field>
              <Field label="Parents notified">{dt(detail.parentNotifiedAt)}</Field>
            </FieldGrid>
            <Field label="Description" wide>{detail.description}</Field>
            {!!detail.witnesses?.length && <Field label="Witnesses" wide>{detail.witnesses.join(', ')}</Field>}
            {!!detail.attachments?.length && (
              <div>
                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Attachments</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {detail.attachments.map((f) => (
                    <a key={f} href={fileUrl(f)} target="_blank" rel="noreferrer"
                      style={{ fontSize: '.8rem', color: 'var(--primary)', textDecoration: 'none',
                               border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px' }}>
                      📎 {f.length > 24 ? `${f.slice(0, 24)}…` : f}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {detail.actionTaken && <Field label="Action taken" wide>{detail.actionTaken}</Field>}

            {detail.incidentType === 'medical_emergency' && (
              <Card title="Medical detail">
                <FieldGrid cols={2}>
                  <Field label="Care given">{label(detail.medicalCategory)}</Field>
                  <Field label="Hospital">{detail.hospitalName}</Field>
                  <Field label="Doctor">{detail.doctorName}</Field>
                  <Field label="Transport">{detail.transportArranged ? 'Arranged' : '—'}</Field>
                  <Field label="Treatment" wide>{detail.treatmentGiven}</Field>
                </FieldGrid>
              </Card>
            )}

            {detail.studentDetails?.profile && (
              <Card title="From the student's record">
                <FieldGrid cols={2}>
                  <Field label="Blood group">{detail.studentDetails.profile.bloodGroup}</Field>
                  <Field label="Emergency contact">
                    {detail.studentDetails.profile.emergencyContactName}
                    {detail.studentDetails.profile.emergencyContactPhone ? ` · ${detail.studentDetails.profile.emergencyContactPhone}` : ''}
                  </Field>
                  <Field label="Father">{detail.studentDetails.profile.fatherName} {detail.studentDetails.profile.fatherPhone}</Field>
                  <Field label="Mother">{detail.studentDetails.profile.motherName} {detail.studentDetails.profile.motherPhone}</Field>
                </FieldGrid>
              </Card>
            )}

            {!!detail.discipline?.length && (
              <Card title="Disciplinary actions from this incident">
                {detail.discipline.map((d) => (
                  <div key={d._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '.83rem' }}>
                    <span>{d.actionNumber} · {d.violation}</span><Badge variant="muted">{label(d.actionType)}</Badge>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
