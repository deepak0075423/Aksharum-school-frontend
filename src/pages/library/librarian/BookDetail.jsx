import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getBook, addCopies, updateCopy, setCopyStatus, deleteCopy, labelSheetUrl } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner, Input, Select, Alert, Pagination }
  from '../../../components/ui/index';

// A catalogue entry is not a book on a shelf. Nothing can be issued until the
// title has physical copies, so this is where they are registered — each one
// gets its own LIB-COPY-xxxxxx code, condition, rack and lifecycle status.

const STATUS_VARIANT = {
  available: 'success',
  issued:    'info',
  reserved:  'warning',
  lost:      'danger',
  damaged:   'danger',
};
// 'issued' is absent on purpose — circulation owns that transition.
const MANUAL_STATUSES = ['available', 'reserved', 'damaged', 'lost'];
const CONDITIONS      = ['new', 'good', 'fair', 'damaged'];

const EMPTY_ADD = { count: 1, condition: 'new', rackLocation: '', acquisitionDate: '', vendor: '', billNumber: '', cost: '' };

const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function LibraryBookDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { pathname } = useLocation();
  // Works under /admin/library/books/:id and /teacher/manage-library/books/:id
  const booksPath  = pathname.slice(0, pathname.lastIndexOf('/'));

  // The copy list is paged and filterable — a class-set textbook can carry
  // hundreds of copies, and shipping all of them to render one table was the
  // slowest thing on this screen.
  const [page,   setPage]   = useState(1);
  const [status, setStatus] = useState('');
  const [code,   setCode]   = useState('');
  const { data: book, meta, loading, error, refetch } = useFetch(
    () => getBook(id, { page, limit: 25, status: status || undefined, code: code.trim() || undefined }),
    [id, page, status, code],
  );
  const copies    = book?.copies || [];
  const breakdown = book?.breakdown || {};

  const [addOpen,  setAddOpen]  = useState(false);
  const [addForm,  setAddForm]  = useState(EMPTY_ADD);
  const [saving,   setSaving]   = useState(false);
  const [editCopy, setEditCopy] = useState(null);
  const [editForm, setEditForm] = useState({ condition: 'new', rackLocation: '' });
  const [del,      setDel]      = useState(null);
  const [delLoad,  setDelLoad]  = useState(false);
  const [busyId,   setBusyId]   = useState(null);

  const openAdd = () => { setAddForm(EMPTY_ADD); setAddOpen(true); };

  const handleAdd = async (e) => {
    e.preventDefault();
    const count = Number(addForm.count);
    if (!Number.isInteger(count) || count < 1 || count > 100)
      return toast.error('Enter a number of copies between 1 and 100');
    setSaving(true);
    try {
      const res = await addCopies(id, { ...addForm, count, cost: addForm.cost === '' ? 0 : Number(addForm.cost) });
      toast.success(`${res?.count ?? count} ${count === 1 ? 'copy' : 'copies'} added`);
      setAddOpen(false); setPage(1); refetch();
    } catch (err) { toast.error(err?.message || 'Could not add copies'); }
    finally { setSaving(false); }
  };

  const openEdit = (c) => {
    setEditForm({
      condition: c.condition || 'new', rackLocation: c.rackLocation || '',
      vendor: c.vendor || '', billNumber: c.billNumber || '', cost: c.cost ?? '',
    });
    setEditCopy(c);
  };

  // Writing a copy off during a stock check is the moment losses are found, so
  // the librarian is asked whether the last borrower should be charged.
  const [writeOff, setWriteOff] = useState(null);

  const confirmWriteOff = async (charge) => {
    setBusyId(writeOff.copy._id);
    try {
      const res = await setCopyStatus(id, writeOff.copy._id, writeOff.status, charge);
      toast.success(res?.fine ? `Marked ${writeOff.status} — ₹${res.fine.amount} charged` : `Marked ${writeOff.status}`);
      setWriteOff(null); refetch();
    } catch (err) { toast.error(err?.message || 'Could not change the status'); }
    finally { setBusyId(null); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateCopy(id, editCopy._id, editForm);
      toast.success('Copy updated');
      setEditCopy(null); refetch();
    } catch (err) { toast.error(err?.message || 'Could not update copy'); }
    finally { setSaving(false); }
  };

  const handleStatus = async (copy, status) => {
    if (status === copy.status) return;
    // Lost and damaged take the copy out of the collection and may cost someone.
    if (status === 'lost' || status === 'damaged') return setWriteOff({ copy, status });
    setBusyId(copy._id);
    try { await setCopyStatus(id, copy._id, status); toast.success(`Marked ${status}`); refetch(); }
    catch (err) { toast.error(err?.message || 'Could not change status'); }
    finally { setBusyId(null); }
  };

  const handleDelete = async () => {
    setDelLoad(true);
    try { await deleteCopy(id, del._id); toast.success('Copy removed'); setDel(null); refetch(); }
    catch (err) { toast.error(err?.message || 'Could not remove copy'); }
    finally { setDelLoad(false); }
  };

  // Spine labels open in a new tab as a print-ready sheet. The endpoint is
  // token-authenticated, so the HTML is fetched and handed to the tab directly
  // rather than linked, which would arrive unauthenticated.
  const printLabels = async () => {
    try {
      const url = labelSheetUrl(id, status ? { status } : {});
      const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || 'Nothing to print');
      const html = await res.text();
      const tab = window.open('', '_blank');
      if (!tab) return toast.error('Allow pop-ups to print labels');
      tab.document.write(html);
      tab.document.close();
    } catch (err) { toast.error(err?.message || 'Could not build the label sheet'); }
  };

  const columns = [
    { key: 'uniqueCode', label: 'Copy Code', render: r => <strong>{r.uniqueCode}</strong> },
    { key: 'status',     label: 'Status',
      render: r => <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'condition',  label: 'Condition',    render: r => r.condition || '—' },
    { key: 'rack',       label: 'Rack',         render: r => r.rackLocation || '—' },
    { key: 'acquired',   label: 'Acquired',     render: r => fmtDate(r.acquisitionDate) },
    { key: 'source',     label: 'Source', render: r => (
      r.vendor || r.billNumber || r.cost
        ? <span className="text-sm">{[r.vendor, r.billNumber, r.cost ? `₹${r.cost}` : ''].filter(Boolean).join(' · ')}</span>
        : '—'
    )},
    { key: 'actions',    label: '', render: r => (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <select className="form-control" style={{ width: 130, padding: '4px 8px', fontSize: '0.8rem' }}
          value={MANUAL_STATUSES.includes(r.status) ? r.status : ''}
          disabled={r.status === 'issued' || busyId === r._id}
          onChange={e => handleStatus(r, e.target.value)}>
          {r.status === 'issued' && <option value="">issued</option>}
          {MANUAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
        <button className="btn btn-danger btn-sm" disabled={r.status === 'issued'}
          onClick={() => setDel(r)}>Remove</button>
      </div>
    )},
  ];

  if (loading) return <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>;
  if (error || !book) return <div className="page"><Alert variant="danger">{error || 'Book not found'}</Alert></div>;

  return (
    <div className="page">
      <PageHeader
        title={book.title}
        subtitle={`${(book.authors || []).join(', ') || 'Unknown author'}${book.isbn ? ` · ISBN ${book.isbn}` : ''}`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => navigate(booksPath)}>← Books</Button>
            <Button onClick={openAdd}>+ Add Copies</Button>
          </div>
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            <div><div className="form-label">Publisher</div><div>{book.publisher || '—'}</div></div>
            <div><div className="form-label">Category</div><div>{book.category || '—'}</div></div>
            <div><div className="form-label">Language</div><div>{book.language || '—'}</div></div>
            <div><div className="form-label">Availability</div>
              <div><strong>{book.availableCopies ?? 0}</strong> available of {book.totalCopies ?? 0}</div></div>
          </div>
        </div>
      </div>

      {copies.length === 0 && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="warning">
            This title has no physical copies yet, so it cannot be issued or reserved.
            Add copies to put it into circulation.
          </Alert>
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ marginRight: 'auto' }}>Copies ({meta?.total ?? copies.length})</h2>
          <input className="form-control" style={{ width: 170 }} placeholder="Find a copy code…"
            value={code} onChange={e => { setCode(e.target.value); setPage(1); }} />
          <select className="form-control" style={{ width: 150 }} value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['available', 'issued', 'reserved', 'damaged', 'lost'].map(st => (
              <option key={st} value={st}>{st} ({breakdown[st] ?? 0})</option>
            ))}
          </select>
          <Button variant="secondary" onClick={printLabels}>🏷 Print labels</Button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={copies} emptyIcon="📕" emptyTitle="No copies match" />
        </div>
        {meta?.pages > 1 && (
          <div className="card-footer">
            <Pagination page={page} pages={meta.pages} total={meta.total} onPage={setPage} />
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Copies"
        footer={<>
          <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button form="add-copies-form" type="submit" loading={saving}>Add</Button>
        </>}>
        <form id="add-copies-form" onSubmit={handleAdd}>
          <Input label="Number of copies" type="number" min={1} max={100} required
            value={addForm.count} hint="Each copy is registered with its own code, e.g. LIB-COPY-000042"
            onChange={e => setAddForm(f => ({ ...f, count: e.target.value }))} />
          <div className="form-row form-row-2">
            <Select label="Condition" value={addForm.condition}
              onChange={e => setAddForm(f => ({ ...f, condition: e.target.value }))}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Rack location" placeholder="e.g. A-01" value={addForm.rackLocation}
              onChange={e => setAddForm(f => ({ ...f, rackLocation: e.target.value }))} />
          </div>
          <Input label="Acquisition date" type="date" value={addForm.acquisitionDate}
            onChange={e => setAddForm(f => ({ ...f, acquisitionDate: e.target.value }))} />

          {/* The accession record — what a stock audit asks for */}
          <div className="form-row form-row-2">
            <Input label="Vendor" placeholder="Who it was bought from" value={addForm.vendor}
              onChange={e => setAddForm(f => ({ ...f, vendor: e.target.value }))} />
            <Input label="Bill number" placeholder="Invoice reference" value={addForm.billNumber}
              onChange={e => setAddForm(f => ({ ...f, billNumber: e.target.value }))} />
          </div>
          <Input label="Cost per copy (₹)" type="number" min={0} step="0.01" value={addForm.cost}
            hint="Recorded against every copy in this batch."
            onChange={e => setAddForm(f => ({ ...f, cost: e.target.value }))} />
        </form>
      </Modal>

      <Modal open={!!editCopy} onClose={() => setEditCopy(null)} title={`Edit ${editCopy?.uniqueCode || 'Copy'}`}
        footer={<>
          <Button variant="secondary" onClick={() => setEditCopy(null)}>Cancel</Button>
          <Button form="edit-copy-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="edit-copy-form" onSubmit={handleEdit}>
          <Select label="Condition" value={editForm.condition}
            onChange={e => setEditForm(f => ({ ...f, condition: e.target.value }))}>
            {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label="Rack location" placeholder="e.g. A-01" value={editForm.rackLocation}
            onChange={e => setEditForm(f => ({ ...f, rackLocation: e.target.value }))} />
          <div className="form-row form-row-2">
            <Input label="Vendor" value={editForm.vendor}
              onChange={e => setEditForm(f => ({ ...f, vendor: e.target.value }))} />
            <Input label="Bill number" value={editForm.billNumber}
              onChange={e => setEditForm(f => ({ ...f, billNumber: e.target.value }))} />
          </div>
          <Input label="Cost (₹)" type="number" min={0} step="0.01" value={editForm.cost}
            onChange={e => setEditForm(f => ({ ...f, cost: e.target.value }))} />
        </form>
      </Modal>

      {/* A write-off is where a real loss gets recorded — and charged, or not. */}
      <Modal open={!!writeOff} onClose={() => setWriteOff(null)} maxWidth={460}
        title={`Mark ${writeOff?.copy?.uniqueCode || 'copy'} ${writeOff?.status || ''}`}
        footer={<>
          <Button variant="secondary" onClick={() => setWriteOff(null)}>Cancel</Button>
          <Button variant="secondary" onClick={() => confirmWriteOff(false)}>No charge</Button>
          <Button variant="danger" onClick={() => confirmWriteOff(true)}>Charge last borrower</Button>
        </>}>
        <p style={{ color: 'var(--text-muted)' }}>
          This takes the copy out of the collection. If it went missing on someone's watch you can
          charge the person who last had it, at the rate set in the library policy — otherwise
          record it with no charge.
        </p>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete} loading={delLoad}
        title="Remove Copy" message={`Remove copy ${del?.uniqueCode} from the shelf list? This cannot be undone.`} />
    </div>
  );
}
