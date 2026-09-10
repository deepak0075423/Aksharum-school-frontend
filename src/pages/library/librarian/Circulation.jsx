/**
 * Library → Circulation.
 *
 * The register of loans, and the three things done at a counter: scan, issue,
 * return. Four figures sit above it, each against the same week before it.
 *
 * Every way of narrowing the register — status, who, class, the date window,
 * the search box — travels with the request. The list is paginated, so
 * filtering in the browser would narrow one page and quietly hide the rest.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import {
  getIssuances, getBook, returnBook, renewBook, bulkRenew, scanCopy, getClassList, downloadFile,
} from '../../../api/library.api';
import { Button, Modal, Spinner, Alert } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  ListTable, ListFooter, RowActions, IconAction, RowMenu, MenuItem, MenuSep,
  SelectionBar, useSelection,
} from '../../admin/listParts';
import { IssueDialog, ReturnDialog } from './counterDialogs';
import { Hero, Tile, delta, note, quoteOfTheDay } from './dashParts';
import {
  BookCell, CopyCell, DateRange, DueCell, FineCell, MemberCell, ROLE_FILTERS,
  SearchBox, STATUS_FILTERS, StatusChip, fmtDate, money,
} from './circulationParts';

/** The states a loan is still open in — the only ones that can be acted on. */
const ACTIVE = ['issued', 'overdue'];

export default function LibraryCirculation() {
  // Everything, unfiltered, is the honest default — a librarian opening this
  // page is as likely to be chasing a return as looking at what is out. The
  // exception is arriving from the dashboard's Overdue tile, which asks for a
  // status in the URL: reading "2 overdue" and landing on all two hundred
  // issuances is not an answer.
  // The status lives in the URL, not in state. It used to be read once into
  // `useState` at mount, so arriving from the dashboard's Overdue tile worked
  // but clicking a tile on THIS page changed the address bar and nothing else —
  // the filter never moved. Reading it every render is what makes those tiles,
  // the browser's Back button and a pasted link all do the same thing.
  const [params, setParams] = useSearchParams();
  const statusFilter = params.get('status') || '';
  const setStatusFilter = (value) => {
    setParams((p) => { if (value) p.set('status', value); else p.delete('status'); return p; },
      { replace: true });
    setPage(1);
  };
  const [roleFilter,   setRoleFilter]   = useState('');
  const [classFilter,  setClassFilter]  = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [range,  setRange]  = useState({ from: '', to: '' });
  // A link in from the overdue register carries what to look at — a copy code,
  // a member's name — so "open in circulation" lands on the loan rather than on
  // the whole desk.
  const [search, setSearch] = useState(params.get('q') || '');
  const [term,   setTerm]   = useState(params.get('q') || '');
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(10);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const base = pathname.replace(/\/circulation$/, '');

  // A request per keystroke is a request per keystroke; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(() => ({
    status:    statusFilter  || undefined,
    role:      roleFilter    || undefined,
    classId:   classFilter   || undefined,
    sectionId: sectionFilter || undefined,
    from:      range.from    || undefined,
    to:        range.to      || undefined,
    q:         term          || undefined,
    // The endpoint also takes `userId`; the search box finds one person's loans
    // by name, which is how the question arrives at the desk.
  }), [statusFilter, roleFilter, classFilter, sectionFilter, range, term]);
  const filterKey = JSON.stringify(filters);

  const { data, meta, loading, refetch } = useFetch(
    () => getIssuances({ ...filters, page, limit }),
    [filterKey, page, limit],
  );
  const issuances = Array.isArray(data) ? data : [];
  const stats = meta?.stats || {};
  const pages = meta?.pages || 1;
  const total = meta?.total ?? issuances.length;
  const start = (Math.min(page, pages) - 1) * limit;
  const selection = useSelection(issuances, `${filterKey}|${page}|${limit}`);
  const heroQuote = useMemo(() => quoteOfTheDay(3), []);

  // Renewing several at once still runs every loan through the renewal cap and
  // the reservation queue — the reply says which were refused and why.
  const [renewing, setRenewing] = useState(false);
  const renewSelected = async () => {
    setRenewing(true);
    try {
      const res = await bulkRenew(selection.ids);
      if (res?.renewed) toast.success(`${res.renewed} loan${res.renewed === 1 ? '' : 's'} renewed`);
      (res?.skipped || []).forEach((sk) => toast.error(sk.reason, { duration: 6000 }));
      if (!res?.renewed && !res?.skipped?.length) toast('Nothing was renewed', { icon: 'ℹ️' });
      selection.clear(); refetch();
    } catch (err) { toast.error(err?.message || 'Could not renew'); }
    finally { setRenewing(false); }
  };

  // Class and section only narrow students, so they appear with that role.
  const [classes, setClasses] = useState([]);
  useEffect(() => {
    getClassList().then(res => setClasses(res?.data || [])).catch(() => setClasses([]));
  }, []);
  const sections = classes.find(c => c._id === classFilter)?.sections || [];

  const resetAll = () => {
    setStatusFilter(''); setRoleFilter(''); setClassFilter(''); setSectionFilter('');
    setRange({ from: '', to: '' }); setSearch(''); setTerm(''); setPage(1);
  };

  const filtersOn = !!(statusFilter || roleFilter || classFilter || sectionFilter
    || range.from || range.to || term);

  // format=xlsx is what makes this endpoint return a spreadsheet rather than the
  // JSON the table on screen uses; without it the browser saved JSON as .xlsx.
  const exportList = () =>
    toast.promise(downloadFile('/library/issuances', { ...filters, format: 'xlsx' }, 'library_circulation.xlsx'), {
      loading: 'Preparing the file…', success: 'Downloaded', error: (e) => e?.message || 'Export failed',
    });

  // ── The counter's two dialogs ────────────────────────────────────────────
  // Both own their own forms (counterDialogs.jsx); this page only says when
  // they are open and what they already know. `issuePreset` is how the scanner
  // and a book's own page hand over a book that is already decided.
  const [issueOpen,   setIssueOpen]   = useState(false);
  const [issuePreset, setIssuePreset] = useState(null);
  const [returnOpen,  setReturnOpen]  = useState(false);
  const [returnPreset, setReturnPreset] = useState(null);

  const openIssue  = () => { setIssuePreset(null); setIssueOpen(true); };
  const openReturn = (copyCode) => {
    setReturnPreset(copyCode ? { copyCode } : null);
    setReturnOpen(true);
  };

  // A book's page sends the librarian here with the title already decided
  // (?issue=<bookId>), so the counter opens on the copy rather than on a search
  // box for a book they were just looking at. The parameter is consumed on
  // arrival, or Back would re-open the dialog over a register they wanted to read.
  useEffect(() => {
    const wanted = params.get('issue');
    if (!wanted) return;
    setParams((q) => { q.delete('issue'); return q; }, { replace: true });
    (async () => {
      try {
        const res = await getBook(wanted);
        if (!res?.data) throw new Error('That book is no longer in the catalogue');
        setIssuePreset({ book: res.data });
        setIssueOpen(true);
      } catch (err) { toast.error(err?.message || 'Could not open the issue counter for that book'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scanner ──────────────────────────────────────────────────────────────────
  // A USB or Bluetooth scanner types the copy code and presses Enter, so this is
  // just a text field that acts on submit. One scan decides the next move.
  const [scanModal, setScanModal] = useState(false);
  const [scanCode,  setScanCode]  = useState('');
  const [scanned,   setScanned]   = useState(null);
  const [scanBusy,  setScanBusy]  = useState(false);

  const openScan = () => { setScanned(null); setScanCode(''); setScanModal(true); };

  const handleScan = async (e) => {
    e.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    setScanBusy(true);
    try {
      const res = await scanCopy(code);
      setScanned(res?.data || null);
      setScanCode('');
    } catch (err) { setScanned(null); toast.error(err?.message || 'Copy not found'); }
    finally { setScanBusy(false); }
  };

  // Scanned a book somebody has out — the desk's next move is a return.
  const scanReturn = async (condition) => {
    setScanBusy(true);
    try {
      const res = await returnBook({ issuanceId: scanned.issuance._id, condition });
      const fine = res?.data?.fine;
      toast.success(fine ? `Returned — ₹${fine.amount} fine raised` : 'Book returned');
      setScanned(null); setScanCode(''); refetch();
    } catch (err) { toast.error(err?.message || 'Could not record the return'); }
    finally { setScanBusy(false); }
  };

  // Scanned a shelf copy — carry it straight into the issue dialog, book and
  // copy already chosen.
  const scanIssue = () => {
    setIssuePreset({ book: scanned.book, copyId: scanned.copy._id });
    setScanModal(false);
    setIssueOpen(true);
  };

  const columns = [
    { key: 'book',   className: 'libc-col-book',   label: 'Book',      render: (r) => <BookCell row={r} /> },
    { key: 'member', className: 'libc-col-member', label: 'Member',    render: (r) => <MemberCell row={r} /> },
    // Not "Issue / Return": a row here is a loan, and its state is already in
    // Status. The copy code is what tells two copies of one title apart.
    { key: 'copy',   className: 'libc-col-copy',   label: 'Copy',      render: (r) => <CopyCell row={r} /> },
    { key: 'issued', className: 'libc-col-date',   label: 'Issued on', render: (r) => fmtDate(r.issueDate) || '—' },
    { key: 'due',    className: 'libc-col-date',   label: 'Due date',  render: (r) => <DueCell row={r} /> },
    { key: 'status', className: 'libc-col-status', label: 'Status',    render: (r) => <StatusChip status={r.status} /> },
    { key: 'fine',   className: 'libc-col-fine',   label: 'Fine',      render: (r) => <FineCell row={r} /> },
    {
      key: 'actions',
      className: 'ltable__acts',
      label: 'Actions',
      render: (r) => (
        <RowActions>
          {/* There is no page for one loan, so the eye opens the book it is a
              loan of — its copies, and everything else out on it. */}
          <IconAction icon="eye" label="Open this book"
            onClick={() => navigate(`${base}/books/${r.book?._id || ''}`)}
            disabled={!r.book?._id} />
          <RowMenu>
            {/* A closed loan cannot be renewed or taken back, and MenuItem has
                no disabled state — so those are simply not offered on one. */}
            {ACTIVE.includes(r.status) && (
              <>
                <MenuItem icon="repeat" onClick={() => handleRenew(r._id)}>Renew loan</MenuItem>
                <MenuItem icon="checkCircle" onClick={() => openReturn(r.bookCopy?.uniqueCode)}>Take it back</MenuItem>
                <MenuSep />
              </>
            )}
            <MenuItem icon="book" to={`${base}/books/${r.book?._id || ''}`}>Book and copies</MenuItem>
            {r.fineSummary?.outstanding > 0 && (
              <MenuItem icon="banknote" to={`${base}/fines`}>Collect {money(r.fineSummary.outstanding)}</MenuItem>
            )}
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="page libdpg libcpg">
      <Hero
        icon="repeat" title="Circulation"
        tagline="Scan · Issue · Return"
        subtitle="Issue and take back books, and see everything the school is holding."
        quote={heroQuote} />

      <div className="libd-tiles">
        <Tile icon="repeat" tone="green" to={pathname}
          value={stats.issued ?? 0} label="Issued this week" caption="Loans made since Monday"
          trend={delta(stats.issued || 0, stats.issuedPrev || 0, 'last week')} />

        <Tile icon="checkCircle" tone="blue" to={`${pathname}?status=returned`}
          value={stats.returned ?? 0} label="Returned this week" caption="Books back on the shelf"
          trend={delta(stats.returned || 0, stats.returnedPrev || 0, 'last week')} />

        <Tile icon="alert" tone={stats.overdue ? 'pink' : 'green'} to={`${pathname}?status=overdue`}
          value={stats.overdue ?? 0} label="Overdue" caption={stats.overdue ? 'Out past the due date' : 'Nothing late'}
          trend={delta(stats.overdue || 0, stats.overduePrev || 0, 'last week')} />

        <Tile icon="banknote" tone="amber" to={`${base}/fines`}
          value={money(stats.collected)} label="Fines collected" caption={stats.outstanding
            ? `${money(stats.outstanding)} still outstanding` : 'Nothing outstanding'}
          trend={delta(stats.collected || 0, stats.collectedPrev || 0, 'last week')} />
      </div>

      <section className="card libc-card">
        <header className="libc-head">
          <div>
            <h2>Circulation register</h2>
            <p>Every loan the library has made, newest first.</p>
          </div>
          <div className="libc-acts">
            <Button variant="secondary" onClick={openScan}><Icon name="search" size={16} /> Scan</Button>
            <Button variant="secondary" onClick={() => openReturn()}><Icon name="checkCircle" size={16} /> Return book</Button>
            <Button onClick={openIssue}><Icon name="plus" size={16} /> Issue book</Button>
          </div>
        </header>

        <div className="libc-filters">
          <select className="form-control libc-sel" value={statusFilter} aria-label="Filter by status"
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            {STATUS_FILTERS.map(([v, l]) => <option key={v || 'any'} value={v}>{l}</option>)}
          </select>

          <select className="form-control libc-sel" value={roleFilter} aria-label="Filter by who borrowed"
            onChange={(e) => {
              setRoleFilter(e.target.value);
              // Class and section describe students only.
              if (e.target.value !== 'student') { setClassFilter(''); setSectionFilter(''); }
              setPage(1);
            }}>
            {ROLE_FILTERS.map(([v, l]) => <option key={v || 'any'} value={v}>{l}</option>)}
          </select>

          {roleFilter !== 'teacher' && (
            <>
              <select className="form-control libc-sel" value={classFilter} aria-label="Filter by class"
                onChange={(e) => { setClassFilter(e.target.value); setSectionFilter(''); setPage(1); }}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>

              <select className="form-control libc-sel" value={sectionFilter} aria-label="Filter by section"
                disabled={!classFilter}
                onChange={(e) => { setSectionFilter(e.target.value); setPage(1); }}>
                <option value="">{classFilter ? 'All sections' : 'Pick a class first'}</option>
                {sections.map((sec) => <option key={sec._id} value={sec._id}>{sec.name}</option>)}
              </select>
            </>
          )}

          <DateRange from={range.from} to={range.to}
            onChange={(r) => { setRange(r); setPage(1); }} />

          <SearchBox value={search} onChange={setSearch} />

          <Button variant="secondary" onClick={exportList}
            title="Export what is filtered here, not just this page">
            <Icon name="download" size={16} /> Export
          </Button>

          {filtersOn && (
            <Button variant="secondary" onClick={resetAll}>
              <Icon name="refresh" size={15} /> Reset
            </Button>
          )}
        </div>

        <SelectionBar count={selection.ids.length} noun="loan" onClear={selection.clear}>
          <Button variant="secondary" size="sm" loading={renewing} onClick={renewSelected}>
            <Icon name="repeat" size={15} /> Renew
          </Button>
        </SelectionBar>

        <ListTable
          columns={columns}
          rows={issuances}
          loading={loading}
          selection={selection}
          startIndex={start}
          emptyIcon={filtersOn ? '🔍' : '📖'}
          emptyTitle={filtersOn ? 'No loans match this' : 'Nothing has been issued yet'}
          emptyMessage={filtersOn
            ? 'Try another status, a wider date window, or clear the search.'
            : 'Issue a book and it appears here, with its due date and anything owed on it.'}
          emptyAction={filtersOn
            ? <Button variant="secondary" onClick={resetAll}>Clear filters</Button>
            : <Button onClick={openIssue}>Issue a book</Button>}
        />

        <ListFooter
          page={Math.min(page, pages)} pages={pages} total={total}
          limit={limit} count={issuances.length} noun="loan"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      {/* Issue Modal */}
      <IssueDialog
        open={issueOpen} preset={issuePreset}
        onClose={() => { setIssueOpen(false); setIssuePreset(null); }}
        onDone={refetch} />

      <ReturnDialog
        open={returnOpen} preset={returnPreset} base={base}
        onClose={() => { setReturnOpen(false); setReturnPreset(null); }}
        onDone={refetch} />

      {/* Scanner — a handheld scanner types the code and submits, so the field
          just needs to stay focused and act on Enter. */}
      <Modal open={scanModal} onClose={() => setScanModal(false)} title="Scan a copy"
        footer={<Button variant="secondary" onClick={() => setScanModal(false)}>Close</Button>}>
        <form onSubmit={handleScan}>
          <div className="form-group">
            <label className="form-label">Copy code</label>
            <input className="form-control" autoFocus value={scanCode}
              placeholder="Scan the spine label, or type LIB-COPY-000042"
              onChange={e => setScanCode(e.target.value)} />
            <div className="form-hint">The scanner submits on its own — no need to press anything.</div>
          </div>
        </form>

        {scanBusy && <div style={{ padding:16, display:'flex', justifyContent:'center' }}><Spinner /></div>}

        {scanned && !scanBusy && (
          <div style={{ marginTop:8, paddingTop:14, borderTop:'1px solid var(--border)' }}>
            <strong style={{ fontSize:'1.02rem' }}>{scanned.book?.title}</strong>
            <div className="text-muted text-sm" style={{ marginBottom:12 }}>
              {scanned.copy?.uniqueCode}
              {scanned.copy?.rackLocation ? ` · ${scanned.copy.rackLocation}` : ''}
              {' · '}{scanned.copy?.status}
            </div>

            {scanned.action === 'return' && (
              <>
                <Alert variant="info">
                  Out with <strong>{scanned.issuance?.issuedTo?.name || 'a member'}</strong>,
                  due {fmtDate(scanned.issuance?.dueDate)}.
                </Alert>
                <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
                  <Button onClick={() => scanReturn('good')}>Return</Button>
                  <Button variant="secondary" onClick={() => scanReturn('damaged')}>Return damaged</Button>
                  <Button variant="danger" onClick={() => scanReturn('lost')}>Mark lost</Button>
                </div>
              </>
            )}

            {scanned.action === 'issue' && (
              <>
                <Alert variant="success">On the shelf and free to issue.</Alert>
                <div style={{ marginTop:12 }}><Button onClick={scanIssue}>Issue this copy</Button></div>
              </>
            )}

            {scanned.action === 'blocked' && (
              <Alert variant="warning">
                This copy is marked <strong>{scanned.copy?.status}</strong>, so it cannot be issued.
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
