import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getBooks, createBook, updateBook, deleteBook, importBooks, downloadFile } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner, Pagination, Alert } from '../../../components/ui/index';

const EMPTY = { title: '', authors: '', isbn: '', publisher: '', category: '', language: 'English', description: '' };

export default function LibraryBooks() {
  const { pathname } = useLocation();   // /admin/library/books or /teacher/manage-library/books
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const { data, meta, loading, refetch } = useFetch(() => getBooks({ q: search || undefined, page, limit: 20 }), [search, page]);
  const books = Array.isArray(data) ? data : [];

  const [modal,    setModal]   = useState(false);
  const [editItem, setEditItem]= useState(null);
  const [del,      setDel]     = useState(null);
  const [saving,   setSaving]  = useState(false);
  const [delLoad,  setDL]      = useState(false);
  const [form,     setForm]    = useState(EMPTY);
  const [justCreated, setJustCreated] = useState(null);
  const [duplicate,   setDuplicate]   = useState(null);

  // ── Import / export ──────────────────────────────────────────────────────
  // The bulk-upload endpoint has existed since the module shipped and nothing
  // ever called it, so a catalogue could only be typed in one book at a time.
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing,  setImporting]  = useState(false);
  const [result,     setResult]     = useState(null);

  const openImport = () => { setImportFile(null); setResult(null); setImportOpen(true); };

  const handleImport = async () => {
    if (!importFile) return toast.error('Choose a spreadsheet first');
    setImporting(true);
    try {
      const res = await importBooks(importFile);
      setResult(res);
      if (res?.imported) {
        toast.success(`${res.imported} book(s) imported${res.copiesCreated ? `, ${res.copiesCreated} copies` : ''}`);
        refetch();
      } else {
        toast('Nothing new to import', { icon: 'ℹ️' });
      }
    } catch (err) { toast.error(err?.message || 'Import failed'); }
    finally { setImporting(false); }
  };

  const grab = (path, params, name) =>
    toast.promise(downloadFile(path, params, name), {
      loading: 'Preparing the file…', success: 'Downloaded', error: (e) => e?.message || 'Download failed',
    });

  // Exports what the librarian is looking at; downloadFile drops the search
  // term when it is empty, so an unfiltered list exports the whole catalogue.
  const exportCatalogue = () => grab('/library/books/export', { q: search }, 'library_catalogue.xlsx');
  const downloadTemplate = () => grab('/library/books/bulk-upload/template', {}, 'library_books_template.xlsx');

  const openCreate = () => { setForm(EMPTY); setEditItem(null); setModal(true); };
  const openEdit   = (b) => {
    setForm({ title: b.title, authors: (b.authors||[]).join(', '), isbn: b.isbn||'',
      publisher: b.publisher||'', category: b.category||'', language: b.language||'English', description: b.description||'' });
    setEditItem(b); setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, authors: form.authors.split(',').map(a => a.trim()).filter(Boolean) };
      if (editItem) {
        await updateBook(editItem._id, payload);
        toast.success('Book updated');
      } else {
        const res = await createBook(payload);
        toast.success('Book added — add copies to put it into circulation');
        if (res?.data?._id) setJustCreated(res.data._id);
      }
      setModal(false); refetch();
    } catch (err) {
      // The server refuses a book that already exists and says which one, so
      // the librarian can go add copies to it instead of retyping it.
      if (err?.data?.code === 'DUPLICATE_BOOK') {
        setDuplicate({ message: err.message, ...err.data.data });
        return;
      }
      toast.error(err?.message || 'Could not save the book');
    }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await deleteBook(del._id); toast.success('Book deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setDL(false); }
  };

  const columns = [
    { key: 'title',   label: 'Title',      render: r => <strong>{r.title}</strong> },
    { key: 'authors', label: 'Author(s)',  render: r => (r.authors||[]).join(', ') || '—' },
    { key: 'isbn',    label: 'ISBN',       render: r => r.isbn || '—' },
    { key: 'category',label: 'Category',   render: r => r.category ? <Badge variant="info">{r.category}</Badge> : '—' },
    { key: 'copies',  label: 'Avail/Total', render: r => (
      (r.totalCopies ?? 0) === 0
        ? <Badge variant="warning">No copies</Badge>
        : `${r.availableCopies ?? 0} / ${r.totalCopies ?? 0}`
    )},
    { key: 'actions', label: '', render: r => (
      <div style={{ display:'flex', gap:4 }}>
        <Link className="btn btn-primary btn-sm" to={`${pathname}/${r._id}`}>Copies</Link>
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
        <button className="btn btn-danger btn-sm"    onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Books" subtitle="Library book catalog"
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={openImport}>⬆ Import</Button>
            <Button variant="secondary" onClick={exportCatalogue}>⬇ Export</Button>
            <Button onClick={openCreate}>+ Add Book</Button>
          </div>
        } />
      <div style={{ marginBottom:16 }}>
        <input className="form-control" placeholder="Search by title, ISBN…" style={{ maxWidth:300 }}
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <div className="card">
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={books} emptyIcon="📚" emptyTitle="No books found" />}
        </div>
        {meta?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={meta.pages} total={meta.total} onPage={setPage} /></div>}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'Edit Book' : 'Add Book'}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="book-form" type="submit" loading={saving}>{editItem ? 'Save' : 'Add'}</Button></>}>
        <form id="book-form" onSubmit={handleSave}>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Title</label>
              <input className="form-control" required value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Author(s)</label>
              <input className="form-control" value={form.authors} placeholder="Comma-separated"
                onChange={e => setForm(f=>({...f,authors:e.target.value}))} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">ISBN</label>
              <input className="form-control" value={form.isbn} onChange={e => setForm(f=>({...f,isbn:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Publisher</label>
              <input className="form-control" value={form.publisher} onChange={e => setForm(f=>({...f,publisher:e.target.value}))} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Category</label>
              <input className="form-control" value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Language</label>
              <input className="form-control" value={form.language} onChange={e => setForm(f=>({...f,language:e.target.value}))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Description</label>
            <textarea className="form-control" rows={2} value={form.description}
              onChange={e => setForm(f=>({...f,description:e.target.value}))} /></div>
        </form>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete} loading={delLoad}
        title="Delete Book" message={`Delete "${del?.title}"?`} />

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import books" maxWidth={520}
        footer={<>
          <Button variant="secondary" onClick={() => setImportOpen(false)}>Close</Button>
          <Button onClick={handleImport} loading={importing} disabled={!importFile}>Import</Button>
        </>}>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Upload an Excel sheet of books. Start from the template so the column names match —
          a <code>copies</code> column creates the physical copies at the same time, so the
          imported books can be issued straight away.
        </p>
        <Button variant="secondary" size="sm" onClick={downloadTemplate}>⬇ Download template</Button>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="form-label">Spreadsheet</label>
          <input type="file" className="form-control" accept=".xlsx,.xls"
            onChange={e => { setImportFile(e.target.files?.[0] || null); setResult(null); }} />
          <div className="form-hint">Books already in the catalogue are skipped, not duplicated.</div>
        </div>

        {result && (
          <div style={{ marginTop: 12 }}>
            <Alert variant={result.imported ? 'success' : 'info'}>
              {result.imported} book(s) imported
              {result.copiesCreated ? `, ${result.copiesCreated} copies created` : ''}
              {result.skipped?.length ? `, ${result.skipped.length} row(s) skipped` : ''}.
            </Alert>
            {result.skipped?.length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 180, overflowY: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Row</th><th>Why it was skipped</th></tr></thead>
                  <tbody>
                    {result.skipped.map((r, i) => (
                      <tr key={i}><td>{r.title}</td><td className="text-muted text-sm">{r.reason}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* A second physical book is a copy, not a second catalogue entry — the
          refusal has to lead somewhere useful or it is just an obstacle. */}
      <Modal open={!!duplicate} onClose={() => setDuplicate(null)} title="This book is already listed" maxWidth={460}
        footer={<>
          <Button variant="secondary" onClick={() => setDuplicate(null)}>Back to form</Button>
          <Link className="btn btn-primary" to={`${pathname}/${duplicate?.existingBookId}`}
            onClick={() => { setDuplicate(null); setModal(false); }}>Add copies to it</Link>
        </>}>
        <p style={{ color: 'var(--text-muted)' }}>{duplicate?.message}</p>
      </Modal>

      {/* A catalogue entry with no physical copies can never be issued, so the
          new book leads straight into registering them. */}
      <Modal open={!!justCreated} onClose={() => setJustCreated(null)} title="Add copies?" maxWidth={440}
        footer={<>
          <Button variant="secondary" onClick={() => setJustCreated(null)}>Later</Button>
          <Link className="btn btn-primary" to={`${pathname}/${justCreated}`}>Add Copies</Link>
        </>}>
        <p style={{ color: 'var(--text-muted)' }}>
          The book is in the catalogue, but it has no physical copies yet — it cannot be
          issued or reserved until at least one is registered.
        </p>
      </Modal>
    </div>
  );
}
