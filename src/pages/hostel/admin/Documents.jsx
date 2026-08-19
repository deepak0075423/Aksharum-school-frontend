import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Table, Button, Modal, Badge, Pagination, Confirm } from '../../../components/ui/index';
import { StatusBadge, Filters, label, dd } from '../shared';

const DOC_TYPES = ['admission', 'id_proof', 'medical', 'parent_authorization', 'undertaking',
                   'agreement', 'fee_receipt', 'outpass', 'incident', 'complaint', 'other'];
const UPLOADS = import.meta.env.VITE_UPLOADS_URL || (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '') || '';

export default function Documents() {
  const [rows, setRows] = useState([]);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ hostel: '', docType: '', verificationStatus: '', expiring: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', docType: 'other', hostel: '', student: '', description: '', expiryDate: '' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [verify, setVerify] = useState(null);
  const [verifyForm, setVerifyForm] = useState({ status: 'verified', remark: '' });
  const [del, setDel] = useState(null);
  const [residents, setResidents] = useState([]);
  const fileRef = useRef();

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getDocuments({ page, limit: 20, ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [filters]); // eslint-disable-line

  const open = async () => {
    setForm({ title: '', docType: 'other', hostel: '', student: '', description: '', expiryDate: '' });
    setFile(null); setModal(true);
    try {
      const r = await api.getAllocations({ status: 'active', limit: 300 });
      setResidents((r.data ?? r).data || []);
    } catch { setResidents([]); }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!file) return toast.error('Choose a file to upload');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      await api.uploadDocument(fd);
      toast.success('Document uploaded'); setModal(false); load(1);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const submitVerify = async () => {
    try {
      await api.verifyDocument(verify._id, verifyForm);
      toast.success(`Marked ${verifyForm.status}`); setVerify(null); load(pg.page);
    } catch (err) { toast.error(err.message); }
  };

  const remove = async () => {
    try { await api.deleteDocument(del._id); toast.success('Removed'); setDel(null); load(pg.page); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const expiringSoon = (r) => r.expiryDate && new Date(r.expiryDate) <= new Date(Date.now() + 30 * 864e5);

  const columns = [
    { key: 'title', label: 'Document', render: (r) => (
      <div>
        <a href={`${UPLOADS}${r.url}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
          {r.title}
        </a>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.originalName}</div>
      </div>
    ) },
    { key: 'type', label: 'Type', render: (r) => <Badge variant="muted">{label(r.docType)}</Badge> },
    { key: 'student', label: 'Student', render: (r) => r.student?.name || <span className="text-muted">—</span> },
    { key: 'expiry', label: 'Expiry', render: (r) => !r.expiryDate ? <span className="text-muted">—</span>
      : expiringSoon(r) ? <Badge variant="warning">{dd(r.expiryDate)}</Badge> : dd(r.expiryDate) },
    { key: 'verify', label: 'Verification', render: (r) => <StatusBadge value={r.verificationStatus} /> },
    { key: 'by', label: 'Uploaded', render: (r) => (
      <div style={{ fontSize: '.78rem' }}>{r.uploadedBy?.name}<div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{dd(r.createdAt)}</div></div>
    ) },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <a className="btn btn-secondary btn-sm" href={`${UPLOADS}${r.url}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Preview</a>
        {r.verificationStatus !== 'verified' && (
          <Button size="sm" onClick={() => { setVerify(r); setVerifyForm({ status: 'verified', remark: '' }); }}>Verify</Button>
        )}
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>Remove</Button>
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Hostel Documents" subtitle="Admission paperwork, undertakings, agreements and attachments"
        action={<Button onClick={open}>+ Upload</Button>} />

      <Filters>
        <select className="form-control" style={{ maxWidth: 200 }} value={filters.hostel} onChange={(e) => setFilters((f) => ({ ...f, hostel: e.target.value }))}>
          <option value="">All hostels</option>
          {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 200 }} value={filters.docType} onChange={(e) => setFilters((f) => ({ ...f, docType: e.target.value }))}>
          <option value="">All types</option>
          {DOC_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 180 }} value={filters.verificationStatus} onChange={(e) => setFilters((f) => ({ ...f, verificationStatus: e.target.value }))}>
          <option value="">Any verification</option>
          {['pending', 'verified', 'rejected'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <Button size="sm" variant={filters.expiring === 'true' ? 'primary' : 'secondary'}
          onClick={() => setFilters((f) => ({ ...f, expiring: f.expiring === 'true' ? '' : 'true' }))}>
          ⏳ Expiring in 30 days
        </Button>
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📁" emptyTitle="No documents" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} maxWidth={560} title="Upload Document"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="doc-form" type="submit" loading={saving}>Upload</Button></>}>
        <form id="doc-form" onSubmit={save}>
          <div className="form-group">
            <label className="form-label required">File</label>
            <input ref={fileRef} className="form-control" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" />
            <div className="form-hint">PDF, Office documents or images, up to 5 MB</div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Title</label>
              <input className="form-control" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.docType} onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Student</label>
              <select className="form-control" value={form.student} onChange={(e) => setForm((f) => ({ ...f, student: e.target.value }))}>
                <option value="">Not student specific</option>
                {residents.map((a) => (
                  <option key={a._id} value={a.student?._id || a.student}>{a.student?.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Hostel</label>
              <select className="form-control" value={form.hostel} onChange={(e) => setForm((f) => ({ ...f, hostel: e.target.value }))}>
                <option value="">Not hostel specific</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Expiry date</label>
              <input className="form-control" type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
              <div className="form-hint">Tracked so expiring paperwork can be chased</div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-control" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={!!verify} onClose={() => setVerify(null)} maxWidth={440} title="Verify Document"
        footer={<><Button variant="secondary" onClick={() => setVerify(null)}>Cancel</Button>
          <Button onClick={submitVerify}>Save</Button></>}>
        {verify && <>
          <p style={{ fontSize: '.86rem', marginTop: 0 }}><strong>{verify.title}</strong></p>
          <div className="form-group">
            <label className="form-label">Outcome</label>
            <select className="form-control" value={verifyForm.status} onChange={(e) => setVerifyForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
              <option value="pending">Back to pending</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Remark</label>
            <textarea className="form-control" rows={2} value={verifyForm.remark} onChange={(e) => setVerifyForm((f) => ({ ...f, remark: e.target.value }))} />
          </div>
        </>}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Remove document" message={`Remove "${del?.title}"? The record is kept for history and the file is not destroyed.`} />
    </div>
  );
}
