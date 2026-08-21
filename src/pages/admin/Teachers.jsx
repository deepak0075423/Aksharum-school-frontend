import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { toggleTeacher } from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Pagination, PageSize, Spinner } from '../../components/ui/index';
import TeacherForm from './TeacherForm';

export default function Teachers() {
  const [page, setPage]         = useState(1);
  // Rows per page is the admin's choice; changing it starts again at page 1.
  const [limit, setLimit] = useState(20);
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

  const { data, loading, refetch } = useFetch(
    () => api.getTeachers({ page, search, limit }),
    [page, search, limit],
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
      const updated = res?.updated ?? 0;
      const errors  = res?.errors  ?? [];
      setBulkResult({ created, updated, errors });
      // A sheet re-uploaded after fixing a few rows updates the teachers that
      // already exist — counting only creations would report that as a failure.
      const touched = created + updated;
      if (touched) { toast.success(`${touched} teacher${touched !== 1 ? 's' : ''} imported`); refetch(); }
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

  const handleEdit = (r) => setEditUser(r);

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
        {data && (data.total > 5 || data.pages > 1) && (
          <div className="card-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <PageSize value={limit} total={data.total} onChange={(n) => { setLimit(n); setPage(1); }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} />
            </div>
          </div>
        )}
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
              <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{bulkResult.updated ?? 0}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Updated</div>
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
              The template carries every field of the Add Teacher form — personal, contact, government ID,
              education, experience, bank and school details. Its <em>Reference</em> sheet lists the exact
              values each column accepts, and which ones are required.
              <strong style={{ color: 'var(--text)', display: 'block', marginTop: 6 }}>Note:</strong>
              Only the paperwork itself can’t be imported — Aadhaar and PAN scans, resignation letter,
              experience certificate. Open each teacher in Edit afterwards to attach them.
              Re-uploading a corrected sheet updates the teachers it already created.
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
      {/* One seven-step wizard for both admission and editing, so an edit
          offers every field the record was created with. */}
      <TeacherForm open={modal} onClose={() => setModal(false)}
        onCreated={refetch} designations={designations} />

      <TeacherForm open={!!editUser} teacher={editUser} onClose={() => setEditUser(null)}
        onCreated={refetch} designations={designations} />

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoading} title="Delete Teacher" message={`Delete "${del?.name}"? This cannot be undone.`} />
    </div>
  );
}
