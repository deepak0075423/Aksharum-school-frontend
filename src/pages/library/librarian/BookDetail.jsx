/**
 * Library → Books → one book.
 *
 * The catalogue entry, its stock, and what has happened to it: the record on
 * the left in four tabs, and on the right the one thing a librarian standing at
 * the shelf actually wants — is a copy available, and what can I do about it.
 *
 * A catalogue entry is not a book on a shelf. Nothing can be issued until the
 * title has physical copies, so this is where they are registered, each with
 * its own LIB-COPY-xxxxxx code, condition, rack and lifecycle status — and why
 * a title with none of them says so before it says anything else.
 *
 * Two requests, deliberately. The copy list is paged and filtered, so it is
 * re-read whenever the librarian narrows it; the book's history, its queue and
 * its neighbours are read once, because none of that changes when you type a
 * copy code.
 */
import React, { useMemo, useState } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import {
  getBook, getBookActivity, updateBook, deleteBook, addCopies, updateCopy,
  setCopyStatus, deleteCopy, createReservation, labelSheetUrl,
} from '../../../api/library.api';
import { Alert, Button, Confirm, Modal, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import MemberPicker from '../../../components/library/MemberPicker';
import { ListTable, ListFooter, RowActions, IconAction, RowMenu, MenuItem, MenuSep } from '../../admin/listParts';
import { BookFields, bookToForm, formToBook } from './booksParts';
import {
  BookHero, CopyStatus, Facts, LoanStatus, Panel, QuickActions, RelatedBooks,
  StockBar, Tabs, Who, authorsOf, fmtDate, stateOf,
} from './bookParts';

const CONDITIONS = ['new', 'good', 'fair', 'damaged'];
// 'issued' is absent on purpose — circulation owns that transition.
const MANUAL_STATUSES = ['available', 'reserved', 'damaged', 'lost'];
const EMPTY_ADD = { count: 1, condition: 'new', rackLocation: '', acquisitionDate: '', vendor: '', billNumber: '', cost: '' };

export default function LibraryBookDetail() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { pathname } = useLocation();
  // Works under /admin/library/books/:id and /teacher/manage-library/books/:id
  const booksPath = pathname.slice(0, pathname.lastIndexOf('/'));
  const base      = booksPath.replace(/\/books$/, '');

  const [tab,    setTab]    = useState('overview');
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(25);
  const [status, setStatus] = useState('');
  const [code,   setCode]   = useState('');

  const { data: book, meta, loading, error, refetch } = useFetch(
    () => getBook(id, { page, limit, status: status || undefined, code: code.trim() || undefined }),
    [id, page, limit, status, code],
  );
  const { data: activity, loading: loadingActivity, refetch: refetchActivity } = useFetch(
    () => getBookActivity(id),
    [id],
  );

  const copies    = book?.copies || [];
  const breakdown = book?.breakdown || {};
  const stats     = activity?.stats || {};
  const loans     = activity?.loans || [];
  const queue     = activity?.reservations || [];
  const related   = activity?.related || [];
  const copyTotal = meta?.total ?? copies.length;
  const state     = useMemo(() => stateOf(book, stats), [book, stats]);

  const reload = () => { refetch(); refetchActivity(); };

  // ── Copies: add, edit, retire, remove ────────────────────────────────────
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
      setAddOpen(false); setPage(1); setTab('copies'); reload();
    } catch (err) { toast.error(err?.message || 'Could not add copies'); }
    finally { setSaving(false); }
  };

  const openEditCopy = (c) => {
    setEditForm({
      condition: c.condition || 'new', rackLocation: c.rackLocation || '',
      vendor: c.vendor || '', billNumber: c.billNumber || '', cost: c.cost ?? '',
    });
    setEditCopy(c);
  };

  const handleEditCopy = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateCopy(id, editCopy._id, editForm);
      toast.success('Copy updated');
      setEditCopy(null); refetch();
    } catch (err) { toast.error(err?.message || 'Could not update copy'); }
    finally { setSaving(false); }
  };

  // Writing a copy off during a stock check is the moment losses are found, so
  // the librarian is asked whether the last borrower should be charged.
  const [writeOff, setWriteOff] = useState(null);
  const [writeOffPrice, setWriteOffPrice] = useState('');

  const confirmWriteOff = async (charge) => {
    if (charge && writeOffPrice !== '' && Number(writeOffPrice) < 0)
      return toast.error('Enter a charge of zero or more');
    setBusyId(writeOff.copy._id);
    try {
      const res = await setCopyStatus(id, writeOff.copy._id, writeOff.status, charge,
        charge && writeOffPrice !== '' ? Number(writeOffPrice) : undefined);
      toast.success(res?.fine ? `Marked ${writeOff.status} — ₹${res.fine.amount} charged` : `Marked ${writeOff.status}`);
      setWriteOff(null); reload();
    } catch (err) { toast.error(err?.message || 'Could not change the status'); }
    finally { setBusyId(null); }
  };

  const handleStatus = async (copy, next) => {
    if (next === copy.status) return;
    // Lost and damaged take the copy out of the collection and may cost someone.
    if (next === 'lost' || next === 'damaged') { setWriteOffPrice(''); return setWriteOff({ copy, status: next }); }
    setBusyId(copy._id);
    try { await setCopyStatus(id, copy._id, next); toast.success(`Marked ${next}`); reload(); }
    catch (err) { toast.error(err?.message || 'Could not change status'); }
    finally { setBusyId(null); }
  };

  const handleDeleteCopy = async () => {
    setDelLoad(true);
    try { await deleteCopy(id, del._id); toast.success('Copy removed'); setDel(null); reload(); }
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

  // ── The catalogue entry itself ───────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [form,     setForm]     = useState(null);
  const [duplicate, setDuplicate] = useState(null);

  const openEditBook = () => { setForm(bookToForm(book)); setEditOpen(true); };

  const saveBook = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateBook(id, formToBook(form));
      toast.success('Book updated');
      setEditOpen(false); refetch();
    } catch (err) {
      // Renaming a book onto one that already exists is the same mistake as
      // adding it twice, and the refusal has to lead somewhere useful.
      if (err?.data?.code === 'DUPLICATE_BOOK') setDuplicate({ message: err.message, ...err.data.data });
      else toast.error(err?.message || 'Could not save the book');
    } finally { setSaving(false); }
  };

  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing,   setRemoving]   = useState(false);
  const removeBook = async () => {
    setRemoving(true);
    try {
      await deleteBook(id);
      toast.success('Book removed from the catalogue');
      navigate(booksPath);
    } catch (err) { toast.error(err?.message || 'Could not remove the book'); setRemoving(false); }
  };

  // ── Reserving at the desk ────────────────────────────────────────────────
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveFor,  setReserveFor]  = useState('');
  const [reserving,   setReserving]   = useState(false);

  const reserve = async () => {
    if (!reserveFor) return toast.error('Pick the member the copy is for');
    setReserving(true);
    try {
      const res = await createReservation({ bookId: id, userId: reserveFor });
      // A reservation placed while a copy is free comes back already held, not
      // queued — the member is told to come and collect it, so the desk should
      // be told the same thing.
      const made = res?.data;
      toast.success(made?.status === 'ready'
        ? 'Reserved — a copy is free and is being held for them'
        : `Reserved — number ${made?.queuePosition ?? '?'} in the queue`);
      setReserveOpen(false); setReserveFor(''); reload();
    } catch (err) { toast.error(err?.message || 'Could not reserve the book'); }
    finally { setReserving(false); }
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;
  if (error || !book) {
    return (
      <div className="page libdpg libbdpg">
        <Alert variant="danger">{error || 'This book is not in the catalogue.'}</Alert>
        <div><Link className="btn btn-secondary" to={booksPath}>← Back to Books</Link></div>
      </div>
    );
  }

  const copyColumns = [
    {
      key: 'uniqueCode', className: 'libbd-col-code', label: 'Copy code',
      render: (r) => <span className="libbd-code">{r.uniqueCode}</span>,
    },
    { key: 'status', className: 'libbd-col-status', label: 'Status', render: (r) => <CopyStatus status={r.status} /> },
    { key: 'condition', className: 'libbd-col-cond', label: 'Condition', render: (r) => r.condition || '—' },
    { key: 'rack', className: 'libbd-col-rack', label: 'Rack', render: (r) => r.rackLocation || <span className="lnone">Unshelved</span> },
    {
      // Acquired and where it came from are one fact about buying this copy, and
      // splitting them into two columns is what pushed the table off the screen.
      key: 'acquired', className: 'libbd-col-src', label: 'Acquired',
      render: (r) => {
        const source = [r.vendor, r.billNumber, r.cost ? `₹${r.cost}` : ''].filter(Boolean).join(' · ');
        if (!r.acquisitionDate && !source) return <span className="lnone">Not recorded</span>;
        return (
          <span className="libbd-acq">
            <b>{fmtDate(r.acquisitionDate) || '—'}</b>
            {source ? <small>{source}</small> : null}
          </span>
        );
      },
    },
    {
      key: 'actions', className: 'ltable__acts libbd-col-acts', label: '',
      render: (r) => (
        <RowActions>
          <IconAction icon="pencil" label="Edit copy" variant="edit"
            disabled={busyId === r._id} onClick={() => openEditCopy(r)} />
          <RowMenu>
            {/* A copy that is out belongs to the loan, not to this table: the
                server refuses to re-mark or remove it until the return is
                recorded, so the only move offered is going to find it. */}
            {r.status === 'issued' ? (
              <MenuItem icon="repeat" to={`${base}/circulation?q=${encodeURIComponent(r.uniqueCode)}`}>
                Find the loan
              </MenuItem>
            ) : (
              <>
                {/* Marking a copy is a decision, not a dropdown to nudge past —
                    and a select this wide in every row is what stopped the table
                    fitting on one screen. */}
                {MANUAL_STATUSES.filter((st) => st !== r.status).map((st) => (
                  <MenuItem key={st}
                    icon={st === 'available' ? 'checkCircle' : st === 'reserved' ? 'clock' : 'alert'}
                    danger={st === 'lost' || st === 'damaged'}
                    onClick={() => handleStatus(r, st)}>
                    Mark {st}
                  </MenuItem>
                ))}
                <MenuSep />
                <MenuItem icon="repeat" to={`${base}/circulation?q=${encodeURIComponent(r.uniqueCode)}`}>
                  Find in circulation
                </MenuItem>
                <MenuItem icon="trash" danger onClick={() => setDel(r)}>Remove copy</MenuItem>
              </>
            )}
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  const facts = [
    ['ISBN', book.isbn || '', 'idCard'],
    ['Publisher', book.publisher || '', 'building'],
    ['Edition', book.edition || '', 'layers'],
    ['Language', book.language || '', 'compass'],
    ['Category', book.category || '', 'folder'],
    ['Catalogued', book.createdAt
      ? `${fmtDate(book.createdAt)}${book.createdBy?.name ? ` by ${book.createdBy.name}` : ''}`
      : '', 'calendar'],
  ];
  // The sidebar answers a question asked at the shelf, and there is one screen
  // for three cards. Edition and who catalogued it are record-keeping — they
  // stay in the Overview tab's details, where the whole entry is laid out.
  const shelfFacts = facts.filter(([label]) => label !== 'Edition' && label !== 'Catalogued');

  return (
    <div className="page libdpg libbdpg">
      <div className="libbd-top">
        <div className="breadcrumb">
          <Link to={`${base}/dashboard`}>Library</Link>
          <span aria-hidden>›</span>
          <Link to={booksPath}>Books</Link>
          <span aria-hidden>›</span>
          <span>{book.title}</span>
        </div>
        <Button variant="secondary" onClick={() => navigate(booksPath)}>
          <Icon name="chevronLeft" size={16} /> Back to Books
        </Button>
      </div>

      <div className="libbd-body">
        <main className="libbd-main">
          <BookHero book={book} state={state} />

          {/* A catalogue entry with no physical copies can never be issued, and
              that is the first thing to say about it. */}
          {(book.totalCopies ?? 0) === 0 && (
            <Alert variant="warning">
              This title has no physical copies yet, so it cannot be issued or reserved.
              Add copies to put it into circulation.
            </Alert>
          )}

          <Tabs
            active={tab} onPick={setTab}
            tabs={[
              { key: 'overview', label: 'Overview' },
              { key: 'copies', label: 'Copies', count: copyTotal },
              { key: 'circulation', label: 'Circulation', count: activity?.loansTotal ?? 0 },
              { key: 'queue', label: 'Reservations', count: queue.length },
            ]} />

          {tab === 'overview' && (
            <>
              <Panel icon="bookOpen" tone="indigo" title="About this book"
                subtitle="What the catalogue records about the title itself.">
                {book.description
                  ? <p className="libbd-desc">{book.description}</p>
                  : <p className="libbd-none">No description recorded. Edit the book to add one.</p>}
                <Facts rows={[
                  ['Title', book.title, 'book'],
                  ['Author(s)', authorsOf(book) || '', 'user'],
                  ...facts,
                ]} />
              </Panel>

              <Panel icon="layers" tone="blue" title="Where the copies are"
                subtitle={`${book.availableCopies ?? 0} of ${book.totalCopies ?? 0} on the shelf right now`}
                action={<button type="button" className="libbd-link" onClick={() => setTab('copies')}>
                  See every copy <Icon name="chevronRight" size={13} />
                </button>}>
                <StockBar breakdown={breakdown} total={book.totalCopies ?? 0} />
              </Panel>

              <Panel icon="chart" tone="green" title="How this book has worked"
                subtitle="Its whole borrowing record, not just this term.">
                {loadingActivity ? <div className="libbd-loading"><Spinner /></div> : (
                  <div className="libbd-figures">
                    <Figure value={stats.loans ?? 0} label="Times borrowed" />
                    <Figure value={stats.readers ?? 0} label="Different members" />
                    <Figure value={stats.out ?? 0} label="Out right now"
                      tone={stats.overdue ? 'bad' : undefined}
                      caption={stats.overdue ? `${stats.overdue} overdue` : ''} />
                    <Figure value={stats.waiting ?? 0} label="Waiting in the queue" />
                    <Figure value={stats.lastIssued ? fmtDate(stats.lastIssued) : '—'} label="Last borrowed" wide />
                  </div>
                )}
              </Panel>
            </>
          )}

          {tab === 'copies' && (
            <Panel icon="library" tone="indigo" title="Copies"
              subtitle="Every physical copy, where it sits and what state it is in."
              className="libbd-panel--flush"
              action={(
                <div className="libbd-copyacts">
                  <input className="form-control libbd-find" placeholder="Find a copy code…"
                    value={code} onChange={(e) => { setCode(e.target.value); setPage(1); }} />
                  <select className="form-control libbd-filter" value={status}
                    aria-label="Filter copies by status"
                    onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                    <option value="">All statuses</option>
                    {['available', 'issued', 'reserved', 'damaged', 'lost'].map((st) => (
                      <option key={st} value={st}>{st} ({breakdown[st] ?? 0})</option>
                    ))}
                  </select>
                  <Button variant="secondary" size="sm" onClick={printLabels}>
                    <Icon name="files" size={15} /> Labels
                  </Button>
                  <Button size="sm" onClick={openAdd}><Icon name="plus" size={15} /> Add</Button>
                </div>
              )}>
              <ListTable
                columns={copyColumns}
                rows={copies}
                loading={loading}
                startIndex={(Math.min(page, meta?.pages || 1) - 1) * limit}
                emptyIcon={status || code ? '🔍' : '📕'}
                emptyTitle={status || code ? 'No copies match' : 'No copies registered'}
                emptyMessage={status || code
                  ? 'Try another status, or clear the copy code.'
                  : 'Register copies to put this title into circulation.'}
                emptyAction={status || code
                  ? <Button variant="secondary" onClick={() => { setStatus(''); setCode(''); }}>Clear filters</Button>
                  : <Button onClick={openAdd}>+ Add Copies</Button>}
              />
              <ListFooter
                page={Math.min(page, meta?.pages || 1)} pages={meta?.pages || 1} total={copyTotal}
                limit={limit} count={copies.length} noun="copy" plural="copies"
                onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
            </Panel>
          )}

          {tab === 'circulation' && (
            <Panel icon="repeat" tone="green" title="Circulation history"
              subtitle={activity?.loansTotal
                ? `The last ${loans.length} of ${activity.loansTotal} loans`
                : 'Nothing has been borrowed yet'}
              className="libbd-panel--flush"
              action={(
                <Link className="libbd-link" to={`${base}/circulation?q=${encodeURIComponent(book.title)}`}>
                  Full register <Icon name="chevronRight" size={13} />
                </Link>
              )}>
              {loadingActivity ? <div className="libbd-loading"><Spinner /></div> : !loans.length ? (
                <p className="libbd-none">No copy of this book has been issued yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table ltable">
                    <thead>
                      <tr>
                        <th>Member</th><th>Copy</th><th>Issued</th><th>Due</th><th>Returned</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loans.map((l) => (
                        <tr key={l._id}>
                          <td><Who name={l.issuedTo?.name} sub={l.borrowerClass || l.issuedTo?.role} /></td>
                          <td><span className="libbd-code">{l.bookCopy?.uniqueCode || '—'}</span></td>
                          <td>{fmtDate(l.issueDate)}</td>
                          <td>{fmtDate(l.dueDate)}</td>
                          <td>{l.returnDate ? fmtDate(l.returnDate) : <span className="lnone">Still out</span>}</td>
                          <td><LoanStatus status={l.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {tab === 'queue' && (
            <Panel icon="clock" tone="amber" title="Reservations"
              subtitle={queue.length ? 'In the order they will be served' : 'Nobody is waiting'}
              className="libbd-panel--flush"
              action={(
                <Link className="libbd-link" to={`${base}/reservations`}>
                  All reservations <Icon name="chevronRight" size={13} />
                </Link>
              )}>
              {loadingActivity ? <div className="libbd-loading"><Spinner /></div> : !queue.length ? (
                <p className="libbd-none">
                  No one is queued for this title.
                  {(book.availableCopies ?? 0) > 0 ? ' A copy is on the shelf, so there is nothing to wait for.' : ''}
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="table ltable">
                    <thead>
                      <tr><th>#</th><th>Member</th><th>Queued</th><th>Status</th><th>Hold expires</th></tr>
                    </thead>
                    <tbody>
                      {queue.map((r, i) => (
                        <tr key={r._id}>
                          <td className="ltable__num">{r.queuePosition ?? i + 1}</td>
                          <td><Who name={r.reservedBy?.name} sub={r.reservedBy?.role} /></td>
                          <td>{fmtDate(r.reservedAt)}</td>
                          <td><span className={`libbd-tag is-${r.status === 'ready' ? 'ok' : 'info'}`}>{r.status}</span></td>
                          <td>{r.expiresAt ? fmtDate(r.expiresAt) : <span className="lnone">Not held yet</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </main>

        <aside className="libbd-side">
          <div className="libbd-side__acts">
            <Button variant="secondary" onClick={openEditBook}><Icon name="pencil" size={15} /> Edit Book</Button>
            <Button onClick={openAdd}><Icon name="plus" size={15} /> Add Copies</Button>
          </div>

          <section className="card libbd-status">
            <div className={`libbd-status__head is-${state.tone}`}>
              <b>{state.label}</b>
              <span>{state.hint}</span>
            </div>
            <p className="libbd-status__count">
              <strong>{book.availableCopies ?? 0}</strong> of {book.totalCopies ?? 0} copies available
            </p>
            <Facts rows={shelfFacts} />
          </section>

          <Panel icon="sparkle" tone="purple" title="Quick actions">
            <QuickActions items={[
              { icon: 'plus', tone: 'indigo', label: 'Add copies', onClick: openAdd },
              {
                icon: 'clock', tone: 'amber', label: 'Reserve',
                onClick: () => { setReserveFor(''); setReserveOpen(true); },
                disabled: (book.totalCopies ?? 0) === 0,
                why: 'This title has no copies to queue for',
              },
              {
                icon: 'repeat', tone: 'green', label: 'Issue a copy',
                // The counter owns issuing; this opens it with the book already
                // chosen rather than making the librarian search for it again.
                onClick: () => navigate(`${base}/circulation?issue=${id}`),
                disabled: (book.availableCopies ?? 0) === 0,
                why: 'No copy is on the shelf to issue',
              },
              { icon: 'trash', tone: 'danger', label: 'Remove book', onClick: () => setRemoveOpen(true) },
            ]} />
          </Panel>

          <Panel icon="book" tone="blue" title="Related books"
            subtitle="By the same author, or in the same category">
            {loadingActivity
              ? <div className="libbd-loading"><Spinner /></div>
              : <RelatedBooks books={related} to={booksPath} />}
          </Panel>
        </aside>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Book"
        footer={<>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button form="book-edit-form" type="submit" loading={saving}>Save</Button>
        </>}>
        {form && (
          <form id="book-edit-form" onSubmit={saveBook}>
            <BookFields form={form} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
          </form>
        )}
      </Modal>

      <Modal open={!!duplicate} onClose={() => setDuplicate(null)} title="This book is already listed" maxWidth={460}
        footer={<>
          <Button variant="secondary" onClick={() => setDuplicate(null)}>Back to form</Button>
          <Link className="btn btn-primary" to={`${booksPath}/${duplicate?.existingBookId}`}
            onClick={() => { setDuplicate(null); setEditOpen(false); }}>Open that entry</Link>
        </>}>
        <p style={{ color: 'var(--text-muted)' }}>{duplicate?.message}</p>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Copies"
        footer={<>
          <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button form="add-copies-form" type="submit" loading={saving}>Add</Button>
        </>}>
        <form id="add-copies-form" onSubmit={handleAdd}>
          <div className="form-group">
            <label className="form-label required">Number of copies</label>
            <input type="number" className="form-control" min={1} max={100} required value={addForm.count}
              onChange={(e) => setAddForm((f) => ({ ...f, count: e.target.value }))} />
            <div className="form-hint">Each copy is registered with its own code, e.g. LIB-COPY-000042.</div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Condition</label>
              <select className="form-control" value={addForm.condition}
                onChange={(e) => setAddForm((f) => ({ ...f, condition: e.target.value }))}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Rack location</label>
              <input className="form-control" placeholder="e.g. A-01" value={addForm.rackLocation}
                onChange={(e) => setAddForm((f) => ({ ...f, rackLocation: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Acquisition date</label>
            <input type="date" className="form-control" value={addForm.acquisitionDate}
              onChange={(e) => setAddForm((f) => ({ ...f, acquisitionDate: e.target.value }))} />
          </div>

          {/* The accession record — what a stock audit asks for */}
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Vendor</label>
              <input className="form-control" placeholder="Who it was bought from" value={addForm.vendor}
                onChange={(e) => setAddForm((f) => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Bill number</label>
              <input className="form-control" placeholder="Invoice reference" value={addForm.billNumber}
                onChange={(e) => setAddForm((f) => ({ ...f, billNumber: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Cost per copy (₹)</label>
            <input type="number" className="form-control" min={0} step="0.01" value={addForm.cost}
              onChange={(e) => setAddForm((f) => ({ ...f, cost: e.target.value }))} />
            <div className="form-hint">Recorded against every copy in this batch.</div>
          </div>
        </form>
      </Modal>

      <Modal open={!!editCopy} onClose={() => setEditCopy(null)} title={`Edit ${editCopy?.uniqueCode || 'Copy'}`}
        footer={<>
          <Button variant="secondary" onClick={() => setEditCopy(null)}>Cancel</Button>
          <Button form="edit-copy-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="edit-copy-form" onSubmit={handleEditCopy}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Condition</label>
              <select className="form-control" value={editForm.condition}
                onChange={(e) => setEditForm((f) => ({ ...f, condition: e.target.value }))}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Rack location</label>
              <input className="form-control" placeholder="e.g. A-01" value={editForm.rackLocation}
                onChange={(e) => setEditForm((f) => ({ ...f, rackLocation: e.target.value }))} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Vendor</label>
              <input className="form-control" value={editForm.vendor || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Bill number</label>
              <input className="form-control" value={editForm.billNumber || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, billNumber: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Cost (₹)</label>
            <input type="number" className="form-control" min={0} step="0.01" value={editForm.cost ?? ''}
              onChange={(e) => setEditForm((f) => ({ ...f, cost: e.target.value }))} />
          </div>
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
          charge the person who last had it — otherwise record it with no charge.
        </p>
        <div className="form-group" style={{ maxWidth: 220 }}>
          <label className="form-label">Charge (₹)</label>
          <input type="number" className="form-control" min={0} step="0.01" value={writeOffPrice}
            placeholder="Policy rate" onChange={(e) => setWriteOffPrice(e.target.value)} />
          <div className="form-hint">
            Leave blank to use the rate in the library policy, or enter what the book actually cost.
          </div>
        </div>
      </Modal>

      <Modal open={reserveOpen} onClose={() => setReserveOpen(false)} title="Reserve this book" maxWidth={460}
        footer={<>
          <Button variant="secondary" onClick={() => setReserveOpen(false)}>Cancel</Button>
          <Button onClick={reserve} loading={reserving} disabled={!reserveFor}>Reserve</Button>
        </>}>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Queues a member for “{book.title}”. If a copy is free it is held for them; otherwise they
          join the queue and are told when it is their turn.
        </p>
        <MemberPicker value={reserveFor} onChange={(uid) => setReserveFor(uid)} />
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDeleteCopy} loading={delLoad}
        title="Remove copy" confirmLabel="Remove copy"
        message={`Remove copy ${del?.uniqueCode} from the shelf list? This cannot be undone.`} />

      <Confirm open={removeOpen} onClose={() => setRemoveOpen(false)} onConfirm={removeBook} loading={removing}
        title="Remove this book" confirmLabel="Remove book"
        message={`Delete “${book.title}” and its ${book.totalCopies ?? 0} cop${(book.totalCopies ?? 0) === 1 ? 'y' : 'ies'}? A book that is out on loan or queued for cannot be removed.`} />
    </div>
  );
}

const Figure = ({ value, label, caption, tone, wide }) => (
  <div className={`libbd-figure${wide ? ' is-wide' : ''}`}>
    <span className={`libbd-figure__value${tone ? ` is-${tone}` : ''}`}>{value}</span>
    <span className="libbd-figure__label">{label}</span>
    {caption ? <span className="libbd-figure__cap">{caption}</span> : null}
  </div>
);
