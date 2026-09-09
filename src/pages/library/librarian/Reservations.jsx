/**
 * Library → Reservations.
 *
 * The queue, and the two things done to it: call a book up onto the hold shelf,
 * and hand it over. Four figures sit above it — two are live counts, two are a
 * month's work against the month before.
 *
 * Every way of narrowing the queue travels with the request. The list is
 * paginated, so filtering in the browser would narrow one page and hide the
 * rest.
 *
 * All five states get a chip. A hold that lapsed on the shelf is not the same
 * as one somebody cancelled, and folding them together would leave those rows
 * unreachable.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import {
  getReservations, createReservation, markReservationReady, cancelReservation,
  issueBook, getBooks, getClassList, downloadFile,
} from '../../../api/library.api';
import { Alert, Button, Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import MemberPicker from '../../../components/library/MemberPicker';
import {
  ListTable, ListFooter, RowActions, IconAction, RowMenu, MenuItem, MenuSep,
} from '../../admin/listParts';
import { Hero, Tile, delta, note, quoteOfTheDay } from './dashParts';
import {
  BookCell, ClassCell, CopyCell, DateRange, ExpiryCell, MemberCell, QueueCell,
  SearchBox, StatusChip, StatusTabs, fmtDate,
} from './reservationParts';

/** The states a reservation is still live in — the only ones that can be acted on. */
const LIVE = ['pending', 'ready'];

export default function LibraryReservations() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const base = pathname.replace(/\/reservations$/, '');

  // All by default — the queue is only half the story; expired and collected
  // rows are what a librarian checks when someone asks what happened.
  const [search,  setSearch]  = useState('');
  const [term,    setTerm]    = useState('');
  const [status,  setStatus]  = useState('');
  const [classId, setClassId] = useState('');
  const [range,   setRange]   = useState({ from: '', to: '' });
  const [page,    setPage]    = useState(1);
  const [limit,   setLimit]   = useState(10);

  // A request per keystroke is a request per keystroke; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // The server resolves the term against the book and the person waiting for
  // it; the export carries whatever is in force here.
  const query = useMemo(() => ({
    q:       term    || undefined,
    status:  status  || undefined,
    classId: classId || undefined,
    from:    range.from || undefined,
    to:      range.to   || undefined,
  }), [term, status, classId, range]);
  const queryKey = JSON.stringify(query);

  const { data, meta, loading, refetch } = useFetch(
    () => getReservations({ ...query, page, limit }),
    [queryKey, page, limit],
  );
  const rows   = Array.isArray(data) ? data : [];
  const stats  = meta?.stats || {};
  const pages  = meta?.pages || 1;
  const total  = meta?.total ?? rows.length;
  const start  = (Math.min(page, pages) - 1) * limit;
  const anyFilter = !!(term || status || classId || range.from || range.to);
  const heroQuote = useMemo(() => quoteOfTheDay(4), []);

  const [classes, setClasses] = useState([]);
  useEffect(() => {
    getClassList().then((res) => setClasses(res?.data || [])).catch(() => setClasses([]));
  }, []);

  const resetAll = () => {
    setSearch(''); setTerm(''); setStatus(''); setClassId('');
    setRange({ from: '', to: '' }); setPage(1);
  };

  // ── Call a book up onto the hold shelf ─────────────────────────────────────
  const [readyBusy, setReadyBusy] = useState(null);
  const handleReady = async (id) => {
    setReadyBusy(id);
    try { await markReservationReady(id); toast.success('On the hold shelf — the member has been told'); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setReadyBusy(null); }
  };

  // ── Hand it over ──────────────────────────────────────────────────────────
  // The whole point of the queue, and it used to mean going to Circulation and
  // re-finding the same book and the same person. The row already knows both,
  // and the server names the copy to give out.
  const [issueItem, setIssueItem] = useState(null);
  const [issueLoad, setIssueLoad] = useState(false);
  const handIt = async () => {
    setIssueLoad(true);
    try {
      await issueBook({
        bookId: issueItem.book?._id || issueItem.book,
        copyId: issueItem.availableCopy._id,
        userId: issueItem.reservedBy?._id || issueItem.reservedBy,
      });
      toast.success(`${issueItem.availableCopy.uniqueCode} issued to ${issueItem.reservedBy?.name}`);
      setIssueItem(null);
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not issue the book'); }
    finally { setIssueLoad(false); }
  };

  // ── Cancel ────────────────────────────────────────────────────────────────
  // The member is told their reservation was cancelled, so the reason is worth
  // collecting — it is the difference between a useful notice and a bare one.
  const [cancelItem,   setCancelItem]   = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoad,   setCancelLoad]   = useState(false);
  const handleCancel = async () => {
    setCancelLoad(true);
    try {
      await cancelReservation(cancelItem._id, cancelReason.trim() || undefined);
      toast.success('Cancelled — the member has been notified');
      setCancelItem(null); setCancelReason(''); refetch();
    } catch (err) { toast.error(err?.message || 'Could not cancel the reservation'); }
    finally { setCancelLoad(false); }
  };

  // ── Queue somebody at the desk ────────────────────────────────────────────
  const [newOpen, setNewOpen]   = useState(false);
  const [newBook, setNewBook]   = useState(null);
  const [newUser, setNewUser]   = useState('');
  const [bookQ,   setBookQ]     = useState('');
  const [bookHits, setBookHits] = useState([]);
  const [newBusy, setNewBusy]   = useState(false);

  // A keystroke is not a search; wait for a pause.
  useEffect(() => {
    if (!newOpen || newBook || bookQ.trim().length < 2) { setBookHits([]); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      getBooks({ q: bookQ.trim(), limit: 8 })
        .then((res) => { if (live) setBookHits(res?.data || []); })
        .catch(() => { if (live) setBookHits([]); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [bookQ, newBook, newOpen]);

  const openNew = () => { setNewBook(null); setNewUser(''); setBookQ(''); setBookHits([]); setNewOpen(true); };
  const saveNew = async () => {
    if (!newBook || !newUser) return toast.error('Choose a book and a member');
    setNewBusy(true);
    try {
      const res = await createReservation({ bookId: newBook._id, userId: newUser });
      toast.success(res?.data?.status === 'ready'
        ? 'A copy is free — it is on the hold shelf'
        : `Queued at position ${res?.data?.queuePosition ?? '—'}`);
      setNewOpen(false);
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not place the reservation'); }
    finally { setNewBusy(false); }
  };

  const exportList = () => toast.promise(
    downloadFile('/library/reservations', { ...query, format: 'xlsx' }, 'library_reservations.xlsx'),
    { loading: 'Preparing the file…', success: 'Downloaded', error: (e) => e?.message || 'Download failed' },
  );

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = [
    { key: 'book',    className: 'libr-col-book',   label: 'Book',        render: (r) => <BookCell row={r} /> },
    { key: 'member',  className: 'libr-col-member', label: 'Reserved by', render: (r) => <MemberCell row={r} /> },
    { key: 'class',   className: 'libr-col-class',  label: 'Class / role', render: (r) => <ClassCell row={r} /> },
    { key: 'on',      className: 'libr-col-date',   label: 'Reserved on', render: (r) => fmtDate(r.reservedAt || r.createdAt) || '—' },
    { key: 'ready',   className: 'libr-col-date',   label: 'Ready on',    render: (r) => fmtDate(r.readyAt) || <span className="lnone">—</span> },
    { key: 'expires', className: 'libr-col-date',   label: 'Expires on',  render: (r) => <ExpiryCell row={r} /> },
    // This is where a held book is handed over, so the row names the copy.
    { key: 'copy',    className: 'libr-col-copy',   label: 'Copy to give', render: (r) => <CopyCell row={r} /> },
    { key: 'status',  className: 'libr-col-status', label: 'Status',      render: (r) => <StatusChip status={r.status} /> },
    { key: 'queue',   className: 'libr-col-queue',  label: 'Queue #',     render: (r) => <QueueCell row={r} /> },
    {
      key: 'actions',
      className: 'ltable__acts',
      label: 'Actions',
      render: (r) => (
        <RowActions>
          {LIVE.includes(r.status) && r.availableCopy && (
            <Button size="sm" onClick={() => setIssueItem(r)}>Hand over</Button>
          )}
          <IconAction icon="eye" label="Open this book"
            onClick={() => navigate(`${base}/books/${r.book?._id || ''}`)}
            disabled={!r.book?._id} />
          <RowMenu>
            {/* There is no edit endpoint for a reservation — it is a queue
                position, not a record to amend — so the menu offers the two
                things that can actually be done to one. */}
            {r.status === 'pending' && (
              <MenuItem icon="checkCircle" onClick={() => handleReady(r._id)}>
                {readyBusy === r._id ? 'Calling up…' : 'Call up to the hold shelf'}
              </MenuItem>
            )}
            <MenuItem icon="book" to={`${base}/books/${r.book?._id || ''}`}>Book and copies</MenuItem>
            {LIVE.includes(r.status) && (
              <>
                <MenuSep />
                <MenuItem icon="close" danger onClick={() => setCancelItem(r)}>Cancel reservation</MenuItem>
              </>
            )}
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="page libdpg librpg">
      <Hero
        icon="clock" title="Reservations"
        tagline="Queue · Hold · Hand over"
        subtitle="Who is waiting for what, what is on the hold shelf, and what is about to lapse."
        quote={heroQuote} />

      <div className="libd-tiles">
        <Tile icon="checkCircle" tone="green" to={`${pathname}`}
          value={stats.ready ?? 0} label="On the hold shelf" caption="Called up and waiting to be collected"
          trend={stats.expiringSoon
            ? { dir: 'down', text: `${stats.expiringSoon} lapse within 2 days` }
            : note('None about to lapse')} />

        <Tile icon="clock" tone="amber" to={`${pathname}`}
          value={stats.waiting ?? 0} label="Waiting in queue" caption="Queued behind a loan"
          trend={stats.longestWaitDays
            ? note(`Longest wait ${stats.longestWaitDays} day${stats.longestWaitDays === 1 ? '' : 's'}`)
            : note('Nobody waiting')} />

        <Tile icon="repeat" tone="blue" to={`${pathname}`}
          value={stats.collectedThisMonth ?? 0} label="Collected this month" caption="Holds that were picked up"
          trend={delta(stats.collectedThisMonth || 0, stats.collectedLastMonth || 0, 'last month')} />

        <Tile icon="close" tone="pink" to={`${pathname}`}
          value={stats.closedThisMonth ?? 0} label="Came to nothing" caption="Cancelled or lapsed this month"
          trend={delta(stats.closedThisMonth || 0, stats.closedLastMonth || 0, 'last month')} />
      </div>

      <section className="card libr-card">
        <div className="libc-filters">
          <SearchBox value={search} onChange={setSearch} />

          <select className="form-control libc-sel" value={classId} aria-label="Filter by class"
            onChange={(e) => { setClassId(e.target.value); setPage(1); }}>
            <option value="">All classes</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>

          <DateRange from={range.from} to={range.to} onChange={(r) => { setRange(r); setPage(1); }} />

          {anyFilter && (
            <Button variant="secondary" onClick={resetAll}>
              <Icon name="refresh" size={15} /> Reset
            </Button>
          )}
        </div>

        <div className="libr-bar">
          <StatusTabs value={status} counts={stats} onPick={(v) => { setStatus(v); setPage(1); }} />
          <div className="libr-bar__acts">
            <Button variant="secondary" onClick={exportList}>
              <Icon name="download" size={16} /> Export
            </Button>
            <Button onClick={openNew}><Icon name="plus" size={16} /> New reservation</Button>
          </div>
        </div>

        <ListTable
          columns={columns}
          rows={rows}
          loading={loading}
          startIndex={start}
          emptyIcon={anyFilter ? '🔍' : '🔖'}
          emptyTitle={anyFilter ? 'No reservations match this' : 'Nobody is waiting for anything'}
          emptyMessage={anyFilter
            ? 'Try another search term, another status, or a wider date window.'
            : 'When a book is out and somebody wants it, queue them here and they are told the moment it is free.'}
          emptyAction={anyFilter
            ? <Button variant="secondary" onClick={resetAll}>Clear filters</Button>
            : <Button onClick={openNew}>+ New reservation</Button>}
        />

        <ListFooter
          page={Math.min(page, pages)} pages={pages} total={total}
          limit={limit} count={rows.length} noun="reservation"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      {/* ── Overlays ────────────────────────────────────────────────────────── */}
      <Modal open={!!issueItem} onClose={() => setIssueItem(null)} maxWidth={460} title="Hand over the book"
        footer={<>
          <Button variant="secondary" onClick={() => setIssueItem(null)}>Cancel</Button>
          <Button onClick={handIt} loading={issueLoad}>Issue it</Button>
        </>}>
        <p style={{ color: 'var(--text-muted)' }}>
          Give <strong>{issueItem?.availableCopy?.uniqueCode}</strong>
          {issueItem?.availableCopy?.rackLocation ? ` (${issueItem.availableCopy.rackLocation})` : ''} of
          {' '}<strong>{issueItem?.book?.title}</strong> to <strong>{issueItem?.reservedBy?.name}</strong>.
        </p>
        {issueItem?.status === 'pending' && (
          <Alert variant="warning">
            This reservation was still queued rather than called up. Issuing it now serves them
            ahead of anyone marked ready before them.
          </Alert>
        )}
        <p className="text-muted text-sm" style={{ marginTop: 10 }}>
          The loan period comes from the library policy, and the reservation closes as collected.
        </p>
      </Modal>

      <Modal open={!!cancelItem} onClose={() => { setCancelItem(null); setCancelReason(''); }} maxWidth={460}
        title="Cancel reservation"
        footer={<>
          <Button variant="secondary" onClick={() => { setCancelItem(null); setCancelReason(''); }}>Keep it</Button>
          <Button variant="danger" onClick={handleCancel} loading={cancelLoad}>Cancel reservation</Button>
        </>}>
        <p style={{ color: 'var(--text-muted)' }}>
          Cancel <strong>{cancelItem?.reservedBy?.name}</strong>&rsquo;s reservation for
          {' '}<strong>{cancelItem?.book?.title}</strong>?
        </p>
        <div className="form-group">
          <label className="form-label">Reason (optional)</label>
          <input className="form-control" value={cancelReason} placeholder="e.g. copy withdrawn for rebinding"
            onChange={(e) => setCancelReason(e.target.value)} />
          <div className="form-hint">Included in the notification the member receives.</div>
        </div>
      </Modal>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} maxWidth={520} title="New reservation"
        footer={<>
          <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button>
          <Button onClick={saveNew} loading={newBusy} disabled={!newBook || !newUser}>Place it</Button>
        </>}>
        <p className="text-muted text-sm" style={{ marginTop: 0 }}>
          For somebody standing at the desk. It goes through the same rules a member&rsquo;s own
          reservation does — the per-member limit, unpaid fines, and not queueing for a book
          they already have.
        </p>

        <div className="form-group">
          <label className="form-label required">Book</label>
          {newBook ? (
            <div className="libr-picked">
              <div>
                <strong>{newBook.title}</strong>
                <div className="text-muted text-sm">
                  {(newBook.authors || []).join(', ') || 'Unknown author'}
                  {newBook.isbn ? ` · ${newBook.isbn}` : ''}
                  {' · '}{newBook.availableCopies ?? 0} of {newBook.totalCopies ?? 0} free
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => { setNewBook(null); setBookQ(''); }}>Change</Button>
            </div>
          ) : (
            <>
              <input className="form-control" autoFocus placeholder="Search by title or ISBN…"
                value={bookQ} onChange={(e) => setBookQ(e.target.value)} />
              {bookHits.length > 0 && (
                <ul className="libr-hits">
                  {bookHits.map((b) => (
                    <li key={b._id}>
                      <button type="button" onClick={() => { setNewBook(b); setBookHits([]); }}>
                        <b>{b.title}</b>
                        <small>{(b.authors || []).join(', ') || 'Unknown author'} · {b.availableCopies ?? 0} free</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="form-group">
          <label className="form-label required">Member</label>
          <MemberPicker placeholder="Search students and staff…" value={newUser} onChange={setNewUser} />
          <div className="form-hint">
            If a copy is free it goes straight onto the hold shelf; otherwise they join the queue.
          </div>
        </div>
      </Modal>
    </div>
  );
}
