import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { toggleTeacher } from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Pagination, PageSize, Spinner } from '../../components/ui/index';
import TeacherForm from './TeacherForm';
import BulkImportOverlay from '../../components/BulkImportOverlay';
import TeacherDependencyDialog from '../../components/TeacherDependencyDialog';
import { saveFile, saveBase64 } from '../../utils/downloadFile';

export default function Teachers() {
  const [page, setPage]         = useState(1);
  // Rows per page is the admin's choice; changing it starts again at page 1.
  const [limit, setLimit] = useState(20);
  // Seeded from ?search= so the header's global search can land on one person:
  // it navigates here with the name prefilled and ?focus=<id>, and the focus
  // highlight can only flag a row that actually rendered — see
  // hooks/useFocusHighlight.js.
  const [params] = useSearchParams();
  const [search, setSearch]     = useState(() => params.get('search') || '');
  // Delete and Deactivate both go through the dependency dialog — it is what
  // shows the admin the classes, subjects, books and periods still attached, and
  // it is the only thing that fires either action.
  const [depTarget, setDepTarget] = useState(null);   // { teacher, action }
  const [modal, setModal]       = useState(false);

  // Bulk import
  const [bulkModal, setBulkModal]   = useState(false);
  const [bulkFile, setBulkFile]     = useState(null);
  const [bulkLoading, setBulkLoad]  = useState(false);
  // { total, current, currentName, created, updated, errorCount, errors, done }
  const [bulkProgress, setBulkProgress] = useState(null);
  const [errorsSaved, setErrorsSaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const bulkFileRef = React.useRef(null);

  const [editUser, setEditUser]   = useState(null);


  // The list does not remount when only the query string changes, so a second
  // search from the header has to be picked up here as well as at mount.
  const urlSearch = params.get('search') || '';
  React.useEffect(() => {
    if (urlSearch) { setSearch(urlSearch); setPage(1); }
  }, [urlSearch]);

  const { data, loading, refetch } = useFetch(
    () => api.getTeachers({ page, search, limit }),
    [page, search, limit],
  );

  // Designation dropdown options. The list itself, and the module access each
  // designation grants, are managed on /admin/designations.
  const { data: desigData } = useFetch(api.getDesignations);
  const designations = Array.isArray(desigData) ? desigData : [];

  const resetBulk = () => {
    setBulkModal(false); setBulkFile(null); setBulkProgress(null);
    setErrorsSaved(false); setConfirmClose(false);
    if (bulkFileRef.current) bulkFileRef.current.value = '';
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

  const handleDownloadTemplate = async () => {
    try {
      saveFile(await api.downloadTeacherTemplate(), 'teacher-template.xlsx');
    } catch { toast.error('Failed to download template'); }
  };

  // The import streams row-by-row over SSE, so this reads the response body
  // itself rather than going through the axios helper, which would only hand
  // back the whole thing once the last teacher had been written.
  const handleBulkImport = async (e) => {
    e.preventDefault();
    if (!bulkFile) { toast.error('Please select an Excel file'); return; }
    setBulkLoad(true);
    setBulkProgress({ total: 0, current: 0, currentName: '', created: 0, updated: 0, errorCount: 0, errors: [], done: false });
    try {
      const fd = new FormData();
      fd.append('excelFile', bulkFile);
      const token = localStorage.getItem('token');
      const baseURL = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${baseURL}/admin/teachers/bulk`, {
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
      let didWrite = false;
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
            if (evt.success) didWrite = true;
            // A row that matched a teacher already on file is an update, not a
            // creation — the admin has to be able to tell the two apart.
            const isUpdate = evt.success && evt.action === 'updated';
            setBulkProgress(p => ({
              ...p,
              created:    evt.success && !isUpdate ? p.created + 1 : p.created,
              updated:    isUpdate ? p.updated + 1 : p.updated,
              errorCount: evt.success ? p.errorCount : p.errorCount + 1,
              errors:     evt.success ? p.errors : [...p.errors, { row: evt.row, name: evt.name, reason: evt.reason }],
            }));
          } else if (evt.type === 'done') {
            // The server's own tally wins over the row-by-row one: if the run
            // stopped early, the difference from `total` is the shortfall.
            const created = evt.created ?? 0;
            const updated = evt.updated ?? 0;
            const failed  = evt.errors?.length ?? 0;
            // The failed rows come back as a ready-to-correct sheet, not just a list.
            setBulkProgress(p => ({
              ...p,
              done: true,
              created,
              updated,
              errorCount: failed,
              errors: evt.errors ?? p.errors,
              total: evt.total ?? p.total,
              errorFile: evt.errorFile ?? null,
            }));
            const touched = created + updated;
            const parts = [];
            if (created) parts.push(`${created} new`);
            if (updated) parts.push(`${updated} updated`);
            if (touched === 0 && failed > 0) toast.error(`Import failed — ${failed} row(s) had errors`);
            else if (failed > 0) toast(`${parts.join(', ')} — ${failed} row(s) failed`, { icon: '⚠️' });
            else if (touched > 0) toast.success(`Imported ${touched} teacher(s) (${parts.join(', ')})`);
            else toast.error('No rows found in the file');
            if (didWrite) refetch();
          } else if (evt.type === 'error') {
            throw new Error(evt.message);
          }
        }
      }
    } catch (err) { toast.error(err.message); setBulkLoad(false); setBulkProgress(null); return; }
    setBulkLoad(false);
  };

  const handleEdit = (r) => setEditUser(r);

  /**
   * Activating is immediate; deactivating is not.
   *
   * Switching an account back on resolves dependencies rather than creating
   * them, so there is nothing to check — but switching it off strands whatever
   * still points at it, which is what the dialog is for.
   */
  const handleToggle = async (r) => {
    if (r.isActive) { setDepTarget({ teacher: r, action: 'deactivate' }); return; }
    toast.loading('Activating…', { id: 'toggle' });
    try {
      await toggleTeacher(r._id);
      toast.success('Teacher activated', { id: 'toggle' });
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
        <button className="btn btn-danger btn-sm" onClick={() => setDepTarget({ teacher: r, action: 'delete' })}>Delete</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Teachers" subtitle={`${data?.total ?? 0} teachers`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/admin/designations" className="btn btn-secondary">🎫 Designations</Link>
            <Button variant="secondary" onClick={() => { setBulkProgress(null); setBulkFile(null); setBulkModal(true); }}>Bulk Import</Button>
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

      {/* Blocking progress panel while the import streams — shared with Students */}
      <BulkImportOverlay open={bulkLoading} title="Importing Teachers…" progress={bulkProgress} />

      {/* ── Bulk Import Modal ─────────────────────────────────────────────────── */}
      <Modal open={bulkModal && !bulkLoading} onClose={closeBulk} title="Bulk Import Teachers" maxWidth={520}
        footer={bulkProgress?.done ? (
          <Button onClick={closeBulk}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={closeBulk}>Cancel</Button>
            <Button form="teacher-bulk-form" type="submit" loading={bulkLoading}>Import</Button>
          </>
        )}>
        {bulkProgress?.done ? (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, background: 'var(--success-light,#f0fdf4)', border: '1px solid var(--success)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--success)' }}>{bulkProgress.created}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Newly Created</div>
              </div>
              <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{bulkProgress.updated ?? 0}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Updated</div>
              </div>
              <div style={{ flex: 1, background: bulkProgress.errorCount > 0 ? 'var(--danger-light,#fef2f2)' : 'var(--bg)', border: `1px solid ${bulkProgress.errorCount > 0 ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: bulkProgress.errorCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{bulkProgress.errorCount}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Errors</div>
              </div>
            </div>
            {(() => {
              const seen = (bulkProgress.created ?? 0) + (bulkProgress.updated ?? 0) + (bulkProgress.errorCount ?? 0);
              const total = bulkProgress.total ?? 0;
              if (!total || seen >= total) return null;
              return (
                <div style={{ background: 'var(--danger-light,#fef2f2)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '.82rem', color: 'var(--danger)' }}>
                  Only {seen} of {total} rows were processed — the import stopped early.
                  Upload the sheet again to continue; teachers already on file are matched by
                  email and updated rather than duplicated.
                </div>
              );
            })()}
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

      {/* ── Create wizard (7 steps) ──────────────────────────────────────────── */}
      {/* One seven-step wizard for both admission and editing, so an edit
          offers every field the record was created with. */}
      <TeacherForm open={modal} onClose={() => setModal(false)}
        onCreated={refetch} designations={designations} />

      <TeacherForm open={!!editUser} teacher={editUser} onClose={() => setEditUser(null)}
        onCreated={refetch} designations={designations} />

      {/* Delete / Deactivate — dependencies first, the action only once clear */}
      <TeacherDependencyDialog
        open={!!depTarget}
        teacher={depTarget?.teacher}
        action={depTarget?.action}
        onClose={() => setDepTarget(null)}
        onDone={refetch}
      />
    </div>
  );
}
