import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { updateTeacher, toggleTeacher } from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Pagination, Spinner } from '../../components/ui/index';
import TeacherForm from './TeacherForm';

export default function Teachers() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [del, setDel]           = useState(null);
  const [delLoading, setDL]     = useState(false);
  const [modal, setModal]       = useState(false);

  // Bulk import
  const [bulkModal, setBulkModal]   = useState(false);
  const [bulkFile, setBulkFile]     = useState(null);
  const [bulkLoading, setBulkLoad]  = useState(false);
  const [bulkResult, setBulkResult] = useState(null);   // { created, errors[] }
  const bulkFileRef = React.useRef(null);

  const [editUser, setEditUser]   = useState(null);
  const [editForm, setEditForm]   = useState({ name: '', phone: '', designation: '', password: '' });
  const [editSaving, setEditSave] = useState(false);
  const [editErr, setEditErr]     = useState({});

  const { data, loading, refetch } = useFetch(
    () => api.getTeachers({ page, search, limit: 20 }),
    [page, search],
  );

  // Designation dropdown options. The list itself, and the module access each
  // designation grants, are managed on /admin/designations.
  const { data: desigData } = useFetch(api.getDesignations);
  const designations = Array.isArray(desigData) ? desigData : [];

  const closeBulk = () => { setBulkModal(false); setBulkFile(null); setBulkResult(null); if (bulkFileRef.current) bulkFileRef.current.value = ''; };

  const handleDownloadTemplate = async () => {
    try {
      const buffer = await api.downloadTeacherTemplate();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = 'teacher-template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download template'); }
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    if (!bulkFile) return toast.error('Please select an Excel file');
    setBulkLoad(true);
    try {
      const fd = new FormData();
      fd.append('excelFile', bulkFile);
      const res = await api.bulkImportTeachers(fd);
      const created = res?.created ?? 0;
      const errors  = res?.errors  ?? [];
      setBulkResult({ created, errors });
      if (created) { toast.success(`${created} teacher${created !== 1 ? 's' : ''} imported`); refetch(); }
      else toast.error('No teachers were imported');
    } catch (err) { toast.error(err.message); }
    finally { setBulkLoad(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteTeacher(del._id); toast.success('Teacher deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const handleEdit = (r) => {
    setEditUser(r);
    setEditForm({ name: r.name || '', phone: r.phone || '', designation: r.designation || '', password: '' });
    setEditErr({});
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim()) { toast.error('Name is required'); return; }
    if (editForm.phone && !/^[+\d\s\-]{7,15}$/.test(editForm.phone)) { toast.error('Invalid phone number'); return; }
    if (editForm.password && editForm.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setEditSave(true);
    try {
      const payload = { name: editForm.name, phone: editForm.phone, designation: editForm.designation };
      if (editForm.password) payload.password = editForm.password;
      await updateTeacher(editUser._id, payload);
      toast.success('Teacher updated');
      setEditUser(null);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setEditSave(false); }
  };

  const handleToggle = async (r) => {
    toast.loading(r.isActive ? 'Deactivating…' : 'Activating…', { id: 'toggle' });
    try {
      await toggleTeacher(r._id);
      toast.success(r.isActive ? 'Teacher deactivated' : 'Teacher activated', { id: 'toggle' });
      refetch();
    } catch (err) { toast.error(err.message, { id: 'toggle' }); }
  };

  const columns = [
    { key: 'name', label: 'Name', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="avatar avatar-sm">{r.name?.[0]}</div>
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{r.email}</div>
        </div>
      </div>
    )},
    { key: 'designation', label: 'Designation', render: r => r.designation || <span style={{ color: 'var(--text-muted)' }}>—</span> },
    { key: 'phone',       label: 'Phone',       render: r => r.phone       || <span style={{ color: 'var(--text-muted)' }}>—</span> },
    { key: 'status', label: 'Status', render: r =>
      <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', label: 'Actions', render: r => (
      <div className="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(r)}>Edit</button>
        <button className="btn btn-warning btn-sm" onClick={() => handleToggle(r)}>
          {r.isActive ? 'Deactivate' : 'Activate'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Teachers" subtitle={`${data?.total ?? 0} teachers`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/admin/designations" className="btn btn-secondary">🎫 Designations</Link>
            <Button variant="secondary" onClick={() => { setBulkResult(null); setBulkFile(null); setBulkModal(true); }}>Bulk Import</Button>
            <Button onClick={() => setModal(true)}>+ Add Teacher</Button>
          </div>
        } />

      <div className="card">
        <div className="card-header">
          <input className="form-control" style={{ maxWidth: 280 }} placeholder="🔍 Search teachers…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.data} emptyIcon="👨‍🏫" emptyTitle="No teachers found" />}
        </div>
        {data && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>

      {/* ── Bulk Import Modal ─────────────────────────────────────────────────── */}
      <Modal open={bulkModal} onClose={closeBulk} title="Bulk Import Teachers" maxWidth={520}
        footer={bulkResult ? (
          <Button onClick={closeBulk}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={closeBulk}>Cancel</Button>
            <Button form="teacher-bulk-form" type="submit" loading={bulkLoading}>Import</Button>
          </>
        )}>
        {bulkResult ? (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, background: '#f0fdf4', border: '1px solid var(--success)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--success)' }}>{bulkResult.created}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Teachers Created</div>
              </div>
              <div style={{ flex: 1, background: bulkResult.errors.length ? '#fef2f2' : 'var(--bg)', border: `1px solid ${bulkResult.errors.length ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: bulkResult.errors.length ? 'var(--danger)' : 'var(--text-muted)' }}>{bulkResult.errors.length}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Errors</div>
              </div>
            </div>
            {bulkResult.errors.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                {bulkResult.errors.map((e, i) => (
                  <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                    <span style={{ fontWeight: 600 }}>Row {e.row}{e.name ? ` — ${e.name}` : ''}: </span>
                    <span style={{ color: 'var(--danger)' }}>{e.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form id="teacher-bulk-form" onSubmit={handleBulkImport}>
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
              Upload an Excel file (.xlsx). Each teacher is emailed a one-time password and must set their own on first login.
            </p>
            <div style={{ marginBottom: 14 }}>
              <Button type="button" variant="secondary" onClick={handleDownloadTemplate} style={{ width: '100%' }}>
                Download Template (.xlsx)
              </Button>
            </div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>Columns:</strong>
              Full Name*, Email Address*, Phone Number, Designation
            </div>
            <div className="form-group">
              <label className="form-label required">Excel File</label>
              <input ref={bulkFileRef} type="file" className="form-control" accept=".xlsx,.xls"
                onChange={e => setBulkFile(e.target.files?.[0] || null)} />
            </div>
          </form>
        )}
      </Modal>

      {/* ── Create wizard (7 steps) ──────────────────────────────────────────── */}
      <TeacherForm open={modal} onClose={() => setModal(false)}
        onCreated={refetch} designations={designations} />

      {/* ── Edit Modal ────────────────────────────────────────────────────────── */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit Teacher"
        footer={<>
          <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
          <Button form="teacher-edit-form" type="submit" loading={editSaving}>Save Changes</Button>
        </>}>
        <form id="teacher-edit-form" onSubmit={handleUpdate} noValidate>
          <div className="form-group">
            <label className="form-label required">Full Name</label>
            <input className="form-control" required value={editForm.name}
              onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input type="tel" className="form-control" pattern="[+\d\s\-]{7,15}"
                value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Designation</label>
              <select className="form-control" value={editForm.designation}
                onChange={e => setEditForm(p => ({ ...p, designation: e.target.value }))}>
                <option value="">— Select —</option>
                {editForm.designation && !designations.includes(editForm.designation) && (
                  <option value={editForm.designation}>{editForm.designation}</option>
                )}
                {designations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">New Password</label>
              <input type="password" className="form-control" minLength={6} placeholder="Leave blank to keep current"
                value={editForm.password} onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoading} title="Delete Teacher" message={`Delete "${del?.name}"? This cannot be undone.`} />
    </div>
  );
}
