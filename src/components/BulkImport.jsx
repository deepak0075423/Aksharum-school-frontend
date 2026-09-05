import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Modal } from './ui/index';
import BulkImportOverlay from './BulkImportOverlay';
import { saveFile, saveBase64 } from '../utils/downloadFile';

/**
 * The whole "import a spreadsheet of people" flow, for students and teachers.
 *
 * The two used to be a copy of each other — the file picker, the SSE reader,
 * the results panel, the failed-row sheet and the guard against closing before
 * saving it, twice over, drifting apart every time one was touched. Everything
 * that differs is a prop: the endpoint, the noun, the template download and the
 * paragraph explaining what the sheet can and cannot carry.
 *
 * Props:
 *   open, onClose      — the picker modal
 *   endpoint           — path under the API base, e.g. '/admin/students/bulk'
 *   noun               — 'student' | 'teacher', used in every message
 *   template           — { download(), filename } for the starter sheet
 *   intro, columns     — the two blocks of explanatory copy
 *   onImported         — called once, after a run that wrote anything
 */
export default function BulkImport({
  open, onClose, endpoint, noun, template, intro, columns, onImported,
}) {
  const [file, setFile]           = useState(null);
  const [loading, setLoading]     = useState(false);
  // { total, current, currentName, created, updated, errorCount, errors, done }
  const [progress, setProgress]   = useState(null);
  const [errorsSaved, setSaved]   = useState(false);
  const [confirmClose, setGuard]  = useState(false);
  const fileRef = useRef(null);

  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  const reset = () => {
    setProgress(null); setFile(null); setSaved(false); setGuard(false);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  // The failed-row sheet is built once, inside the import response, and is not
  // stored anywhere — so closing without saving it silently throws away the only
  // record of what went wrong. Warn before that happens.
  const close = () => {
    if (progress?.errorFile && !errorsSaved) { setGuard(true); return; }
    reset();
  };

  const saveErrorSheet = () => {
    saveBase64(progress.errorFile.base64, progress.errorFile.filename);
    setSaved(true);
  };

  const downloadTemplate = async () => {
    try { saveFile(await template.download(), template.filename); }
    catch { toast.error('Failed to download template'); }
  };

  /**
   * The import streams row-by-row over SSE, so this reads the response body
   * itself rather than going through the axios helper, which would only hand
   * back the whole thing once the last row had been written.
   */
  const run = async (e) => {
    e.preventDefault();
    if (!file) { toast.error('Please select an Excel file'); return; }
    setLoading(true);
    setProgress({ total: 0, current: 0, currentName: '', created: 0, updated: 0, errorCount: 0, errors: [], done: false });
    try {
      const fd = new FormData();
      fd.append('excelFile', file);
      const baseURL  = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${baseURL}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.message || 'Import failed');
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let didWrite = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop();
        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue;
          const evt = JSON.parse(chunk.slice(6));

          if (evt.type === 'total') {
            setProgress((p) => ({ ...p, total: evt.total }));
          } else if (evt.type === 'processing') {
            setProgress((p) => ({ ...p, current: evt.current, currentName: evt.name }));
          } else if (evt.type === 'row_done') {
            if (evt.success) didWrite = true;
            // A row that matched someone already on file is an update, not a
            // creation — counting the two together made a re-uploaded sheet
            // report every existing record as newly created.
            const isUpdate = evt.success && evt.action === 'updated';
            setProgress((p) => ({
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
            setProgress((p) => ({
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
            else if (touched > 0) toast.success(`Imported ${touched} ${noun}(s) (${parts.join(', ')})`);
            else toast.error('No rows found in the file');
            if (didWrite) onImported?.();
          } else if (evt.type === 'error') {
            throw new Error(evt.message);
          }
        }
      }
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
      setProgress(null);
      return;
    }
    setLoading(false);
  };

  const shortfall = (() => {
    if (!progress?.done) return null;
    const seen  = (progress.created ?? 0) + (progress.updated ?? 0) + (progress.errorCount ?? 0);
    const total = progress.total ?? 0;
    return !total || seen >= total ? null : { seen, total };
  })();

  return (
    <>
      {/* Blocking progress panel while the import streams */}
      <BulkImportOverlay open={loading} title={`Importing ${Noun}s…`} progress={progress} />

      <Modal
        open={open && !loading} onClose={close} maxWidth={520}
        title={`Bulk Import ${Noun}s`}
        footer={progress?.done ? (
          <Button onClick={close}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button form="bulk-import-form" type="submit" loading={loading}>Import</Button>
          </>
        )}
      >
        {progress?.done ? (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, background: 'var(--success-light,#f0fdf4)', border: '1px solid var(--success)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--success)' }}>{progress.created}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Newly Created</div>
              </div>
              <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{progress.updated ?? 0}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Updated</div>
              </div>
              <div style={{ flex: 1, background: progress.errorCount > 0 ? 'var(--danger-light,#fef2f2)' : 'var(--bg)', border: `1px solid ${progress.errorCount > 0 ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: progress.errorCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{progress.errorCount}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Errors</div>
              </div>
            </div>

            {shortfall && (
              <div style={{ background: 'var(--danger-light,#fef2f2)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '.82rem', color: 'var(--danger)' }}>
                Only {shortfall.seen} of {shortfall.total} rows were processed — the import stopped early.
                Upload the sheet again to continue; {noun}s already on file are matched by
                email and updated rather than duplicated.
              </div>
            )}

            {progress.errors.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                {progress.errors.map((e, i) => (
                  <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                    <span style={{ fontWeight: 600 }}>Row {e.row}{e.name ? ` — ${e.name}` : ''}: </span>
                    <span style={{ color: 'var(--danger)' }}>{e.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {progress.errorFile && (
              <div style={{ marginTop: 12 }}>
                <Button variant="secondary" style={{ width: '100%' }} onClick={saveErrorSheet}>
                  Download the {progress.errorFile.rows} failed row{progress.errorFile.rows !== 1 ? 's' : ''} (.xlsx)
                </Button>
                <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 6, marginBottom: 0, lineHeight: 1.6 }}>
                  That file is your own sheet with just these rows and an <strong>Error</strong> column saying
                  what stopped each one. Fix them there and upload the same file again — the rows that
                  already imported are not in it.
                  {progress.errorFile.total > progress.errorFile.rows
                    && ` Showing the first ${progress.errorFile.rows} of ${progress.errorFile.total} failures.`}
                </p>
              </div>
            )}
          </div>
        ) : (
          <form id="bulk-import-form" onSubmit={run}>
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 0 }}>{intro}</p>
            <div style={{ marginBottom: 14 }}>
              <Button type="button" variant="secondary" onClick={downloadTemplate} style={{ width: '100%' }}>
                Download Template (.xlsx)
              </Button>
            </div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {columns}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label required">Excel File</label>
              <input ref={fileRef} type="file" className="form-control" accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
          </form>
        )}
      </Modal>

      {/* Rendered after the import modal on purpose: both portal to <body>, so
          the later one stacks on top of it. */}
      <Modal open={confirmClose} onClose={() => setGuard(false)}
        title="Download the failed rows first?" maxWidth={440}
        footer={
          <>
            <Button variant="secondary" onClick={reset}>Close anyway</Button>
            <Button onClick={() => { saveErrorSheet(); reset(); }}>Download &amp; Close</Button>
          </>
        }>
        <p style={{ color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>
            {progress?.errorFile?.rows} row{progress?.errorFile?.rows !== 1 ? 's' : ''} did not import.
          </strong>{' '}
          The sheet listing them — with the reason against each row — has not been downloaded, and
          the server does not keep a copy. Close now and the only way to see those rows again is to
          run the whole import a second time.
        </p>
      </Modal>
    </>
  );
}
