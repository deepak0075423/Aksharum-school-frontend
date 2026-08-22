import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { toggleStudent } from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Pagination, PageSize, Spinner } from '../../components/ui/index';
import StudentForm from './StudentForm';
import { saveFile, saveBase64 } from '../../utils/downloadFile';

export default function Students() {
  const [page, setPage]     = useState(1);
  // Rows per page is the admin's choice; changing it starts again at page 1.
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [del, setDel]       = useState(null);
  const [delLoad, setDL]    = useState(false);

  // One wizard drives both admission and editing — `editing` null means "add"
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState(null);

  // ── Bulk import ───────────────────────────────────────────────────────────
  const [bulkModal, setBulkModal]   = useState(false);
  const [bulkFile, setBulkFile]     = useState(null);
  const [bulkLoading, setBulkLoad]  = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [errorsSaved, setErrorsSaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // { total, current, currentName, created, errorCount, errors, done }
  const bulkFileRef = useRef(null);

  const { data, loading, refetch } = useFetch(
    () => api.getStudents({ page, search, limit }),
    [page, search, limit],
  );

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit   = (r) => { setEditing(r);   setFormOpen(true); };

  const resetBulk = () => {
    setBulkModal(false); setBulkProgress(null); setBulkFile(null);
    setErrorsSaved(false); setConfirmClose(false);
  };
  // The failed-row sheet is built once, inside the import response, and is not
  // stored anywhere — so closing without saving it silently throws away the only
  // record of what went wrong. Warn before that happens.
  const closeBulk = () => {
    if (bulkProgress?.errorFile && !errorsSaved) { setConfirmClose(true); return; }
    resetBulk();
  };
  const saveErrorSheet = () => {
    saveBase64(bulkProgress.errorFile.base64, bulkProgress.errorFile.filename);
    setErrorsSaved(true);
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    if (!bulkFile) { toast.error('Please select an Excel file'); return; }
    setBulkLoad(true);
    setBulkProgress({ total: 0, current: 0, currentName: '', created: 0, errorCount: 0, errors: [], done: false });
    try {
      const fd = new FormData();
      fd.append('excelFile', bulkFile);
      const token = localStorage.getItem('token');
      const baseURL = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${baseURL}/admin/students/bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.message || 'Import failed');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let didCreate = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop();
        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue;
          const evt = JSON.parse(chunk.slice(6));
          if (evt.type === 'total') {
            setBulkProgress(p => ({ ...p, total: evt.total }));
          } else if (evt.type === 'processing') {
            setBulkProgress(p => ({ ...p, current: evt.current, currentName: evt.name }));
          } else if (evt.type === 'row_done') {
            if (evt.success) didCreate = true;
            setBulkProgress(p => ({
              ...p,
              created:    evt.success ? p.created + 1    : p.created,
              errorCount: evt.success ? p.errorCount     : p.errorCount + 1,
              errors:     evt.success ? p.errors : [...p.errors, { row: evt.row, name: evt.name, reason: evt.reason }],
            }));
          } else if (evt.type === 'done') {
            // The failed rows come back as a ready-to-correct sheet, not just a list.
            setBulkProgress(p => ({ ...p, done: true, errorFile: evt.errorFile ?? null }));
            // A re-uploaded sheet updates the students it already created, so
            // both counts are "imported" as far as the admin is concerned.
            const created = (evt.created ?? 0) + (evt.updated ?? 0);
            const failed  = evt.errors?.length ?? 0;
            if (created === 0 && failed > 0) toast.error(`Import failed — ${failed} row(s) had errors`);
            else if (failed > 0) toast(`Imported ${created} student(s), ${failed} row(s) failed`, { icon: '⚠️' });
            else if (created > 0) toast.success(`Imported ${created} student(s)`);
            else toast.error('No rows found in the file');
            if (didCreate) refetch();
          } else if (evt.type === 'error') {
            throw new Error(evt.message);
          }
        }
      }
    } catch (err) { toast.error(err.message); setBulkLoad(false); setBulkProgress(null); return; }
    setBulkLoad(false);
  };

  const handleDownloadTemplate = async () => {
    try {
      saveFile(await api.downloadStudentTemplate(), 'student-template.xlsx');
    } catch { toast.error('Failed to download template'); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteStudent(del._id); toast.success('Student deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const handleToggle = async (r) => {
    toast.loading(r.isActive ? 'Deactivating…' : 'Activating…', { id: 'tog' });
    try {
      await toggleStudent(r._id);
      toast.success(r.isActive ? 'Student deactivated' : 'Student activated', { id: 'tog' });
      refetch();
    } catch (err) { toast.error(err.message, { id: 'tog' }); }
  };

  const columns = [
    { key: 'name', label: 'Student', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="avatar avatar-sm" style={{ background: 'var(--success)' }}>{r.name?.[0]}</div>
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{r.email}</div>
        </div>
      </div>
    )},
    { key: 'rollNumber', label: 'Roll No', render: r => r.rollNumber || '—' },
    { key: 'class', label: 'Class / Section', render: r =>
      r.className ? `${r.className}${r.sectionName ? ` – ${r.sectionName}` : ''}` : '—' },
    { key: 'gender',     label: 'Gender',  render: r => r.gender || '—' },
    { key: 'status',     label: 'Status',  render: r =>
      <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', label: 'Actions', render: r => (
      <div className="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
        <button className="btn btn-warning btn-sm"   onClick={() => handleToggle(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>
        <button className="btn btn-danger btn-sm"    onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Students" subtitle={`${data?.total ?? 0} students`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" type="button" onClick={() => { resetBulk(); setBulkModal(true); }}>Bulk Import</Button>
            <Button type="button" onClick={openCreate}>+ Add Student</Button>
          </div>
        } />

      <div className="card">
        <div className="card-header">
          <input className="form-control" style={{ maxWidth: 280 }} placeholder="🔍 Search students…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.data} emptyIcon="👨‍🎓" emptyTitle="No students found" />}
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

      <StudentForm
        open={formOpen}
        student={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={refetch}
      />

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Student" message={`Delete "${del?.name}"? This cannot be undone.`} />

      {/* ══ Fullscreen blocking overlay while import runs ═══════════════════ */}
      {bulkLoading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'all',
        }}>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: '32px 36px', width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,.3)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1.05rem' }}>Importing Students…</h3>

            {/* Progress bar */}
            {bulkProgress && bulkProgress.total > 0 && (
              <>
                <div style={{ background: 'var(--border)', borderRadius: 99, height: 8, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99, background: 'var(--primary)',
                    width: `${Math.round((bulkProgress.current / bulkProgress.total) * 100)}%`,
                    transition: 'width .2s',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                  <span>Processing {bulkProgress.current} of {bulkProgress.total}</span>
                  <span>{Math.round((bulkProgress.current / bulkProgress.total) * 100)}%</span>
                </div>
              </>
            )}

            {/* Currently processing */}
            {bulkProgress?.currentName && (
              <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Creating account for <strong style={{ color: 'var(--text)' }}>{bulkProgress.currentName}</strong>…
              </div>
            )}

            {/* Live counters */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, background: 'var(--success-light,#f0fdf4)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{bulkProgress?.created ?? 0}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Created</div>
              </div>
              <div style={{ flex: 1, background: (bulkProgress?.errorCount ?? 0) > 0 ? 'var(--danger-light,#fef2f2)' : 'var(--bg)', border: `1px solid ${(bulkProgress?.errorCount ?? 0) > 0 ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: (bulkProgress?.errorCount ?? 0) > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{bulkProgress?.errorCount ?? 0}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Errors</div>
              </div>
              <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{bulkProgress?.total ?? 0}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Total</div>
              </div>
            </div>

            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 18, marginBottom: 0, textAlign: 'center' }}>
              Please wait — do not close or refresh this page.
            </p>
          </div>
        </div>
      )}

      {/* ══ Bulk Import Modal ════════════════════════════════════════════════ */}
      <Modal open={bulkModal && !bulkLoading} onClose={closeBulk} title="Bulk Import Students" maxWidth={520}
        footer={
          bulkProgress?.done ? (
            <Button onClick={closeBulk}>Close</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={closeBulk}>Cancel</Button>
              <Button form="bulk-import-form" type="submit" loading={bulkLoading}>Import</Button>
            </>
          )
        }>
        {bulkProgress?.done ? (
          /* ── Results ── */
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, background: 'var(--success-light,#f0fdf4)', border: '1px solid var(--success)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--success)' }}>{bulkProgress.created}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Students Created</div>
              </div>
              <div style={{ flex: 1, background: bulkProgress.errorCount > 0 ? 'var(--danger-light,#fef2f2)' : 'var(--bg)', border: `1px solid ${bulkProgress.errorCount > 0 ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: bulkProgress.errorCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{bulkProgress.errorCount}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Errors</div>
              </div>
            </div>
            {bulkProgress.errors.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                {bulkProgress.errors.map((e, i) => (
                  <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                    <span style={{ fontWeight: 600 }}>Row {e.row}{e.name ? ` — ${e.name}` : ''}: </span>
                    <span style={{ color: 'var(--danger)' }}>{e.reason}</span>
                  </div>
                ))}
              </div>
            )}
            {bulkProgress.errorFile && (
              <div style={{ marginTop: 12 }}>
                <Button variant="secondary" style={{ width: '100%' }}
                  onClick={saveErrorSheet}>
                  Download the {bulkProgress.errorFile.rows} failed row{bulkProgress.errorFile.rows !== 1 ? 's' : ''} (.xlsx)
                </Button>
                <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 6, marginBottom: 0, lineHeight: 1.6 }}>
                  That file is your own sheet with just these rows and an <strong>Error</strong> column saying
                  what stopped each one. Fix them there and upload the same file again — the rows that
                  already imported are not in it.
                  {bulkProgress.errorFile.total > bulkProgress.errorFile.rows
                    && ` Showing the first ${bulkProgress.errorFile.rows} of ${bulkProgress.errorFile.total} failures.`}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* ── File picker ── */
          <form id="bulk-import-form" onSubmit={handleBulkImport}>
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
              Upload an Excel file (.xlsx). Parent accounts are created automatically, or mapped to an existing account if the email already exists.
            </p>
            <div style={{ marginBottom: 14 }}>
              <Button type="button" variant="secondary" onClick={handleDownloadTemplate} style={{ width: '100%' }}>
                Download Template (.xlsx)
              </Button>
            </div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>Columns:</strong>
              The template carries every field of the Add Student wizard — personal, address, Aadhaar,
              previous school, enrolment and the full father / mother / guardian records. Its
              <em> Reference</em> sheet lists the exact values each column accepts, which ones are
              required, and this school’s own classes and sections.
              <strong style={{ color: 'var(--text)', display: 'block', marginTop: 6 }}>Note:</strong>
              Only the certificates themselves can’t be imported — photo, Aadhaar scans, birth
              certificate, TC. Open each student in Edit afterwards to attach them.
              Re-uploading a corrected sheet updates the students it already created.
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label required">Excel File</label>
              <input ref={bulkFileRef} type="file" className="form-control" accept=".xlsx,.xls"
                onChange={e => setBulkFile(e.target.files[0] || null)} />
            </div>
          </form>
        )}
      </Modal>

      {/* Rendered after the import modal on purpose: both portal to <body>, so
          the later one stacks on top of it. */}
      <Modal open={confirmClose} onClose={() => setConfirmClose(false)}
        title="Download the failed rows first?" maxWidth={440}
        footer={
          <>
            <Button variant="secondary" onClick={resetBulk}>Close anyway</Button>
            <Button onClick={() => { saveErrorSheet(); resetBulk(); }}>Download &amp; Close</Button>
          </>
        }>
        <p style={{ color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>
            {bulkProgress?.errorFile?.rows} row{bulkProgress?.errorFile?.rows !== 1 ? 's' : ''} did not import.
          </strong>{' '}
          The sheet listing them — with the reason against each row — has not been downloaded, and
          the server does not keep a copy. Close now and the only way to see those rows again is to
          run the whole import a second time.
        </p>
      </Modal>
    </div>
  );
}
