/**
 * Library → Books.
 *
 * The catalogue: five figures across the top, then one card holding the search,
 * the filters and the table. Everything that narrows the list travels with the
 * request — the catalogue is paginated, so filtering or sorting in the browser
 * would only ever reorder the page on screen and leave the rest wrong.
 *
 * A book's status (available / all out / overdue / no copies) is computed
 * server-side from its copies and its live loans; see booksParts.jsx for why
 * `availableCopies` alone cannot answer it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import {
  getBooks, deleteBook, bulkDeleteBooks, importBooks, downloadFile,
} from '../../../api/library.api';
import { Badge, Button, Modal, Confirm, Alert } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  ListTable, ListFooter, RowActions, IconAction, RowMenu, MenuItem, MenuSep,
  SelectionBar, FiltersButton, useSelection,
} from '../../admin/listParts';
import { Hero, Tile, note, quoteOfTheDay } from './dashParts';
import BookDialog from './bookDialog';
import {
  AuthorsCell, Chip, CopiesCell, FiltersPanel, SortHead, StatusChip, TitleCell,
} from './booksParts';

/** A share of the catalogue, said as a share — and never divided by zero. */
const share = (n, total) => (total ? `${Math.round((n / total) * 100)}% of the catalogue` : 'Nothing catalogued yet');

export default function LibraryBooks() {
  const { pathname } = useLocation();   // /admin/library/books or /teacher/manage-library/books
  const navigate = useNavigate();
  // ?category= comes from the dashboard's collection panel and ?status= from
  // its tiles. The endpoint has always filtered on category; nothing on this
  // page ever asked.
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const status   = params.get('status') || '';

  const [search, setSearch] = useState('');
  const [term,   setTerm]   = useState('');
  const [sort,   setSort]   = useState({ by: 'title', dir: 'asc' });
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(10);
  const [showFilters, setShowFilters] = useState(false);

  // A request per keystroke is a request per keystroke; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => ({
    q: term || undefined,
    category: category || undefined,
    status: status || undefined,
    sortBy: sort.by, sortDir: sort.dir,
    page, limit,
  }), [term, category, status, sort, page, limit]);
  const queryKey = JSON.stringify(query);

  const { data, meta, loading, refetch } = useFetch(() => getBooks(query), [queryKey]);
  const books = Array.isArray(data) ? data : [];
  const stats = meta?.stats || {};
  const categories = meta?.categories || [];
  const pages = meta?.pages || 1;
  const total = meta?.total ?? books.length;
  const start = (Math.min(page, pages) - 1) * limit;
  const selection = useSelection(books, queryKey);
  const heroQuote = useMemo(() => quoteOfTheDay(2), []);

  const setParam = (key, value) => {
    setParams((p) => { if (value) p.set(key, value); else p.delete(key); return p; }, { replace: true });
    setPage(1);
  };
  const onSort = (by) => {
    setSort((s) => (s.by === by ? { by, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by, dir: 'asc' }));
    setPage(1);
  };
  const anyFilter = !!term || !!category || !!status;
  const clearAll = () => {
    setSearch(''); setTerm('');
    setParams((p) => { p.delete('category'); p.delete('status'); return p; }, { replace: true });
    setPage(1);
  };

  const [bulkDel, setBulkDel] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const removeSelected = async () => {
    setBulkBusy(true);
    try {
      const res = await bulkDeleteBooks(selection.ids);
      if (res?.deleted) toast.success(`${res.deleted} book${res.deleted === 1 ? '' : 's'} deleted`);
      // The server refuses a book that is on loan, queued for, or has a copy
      // still marked issued — and says which, so the librarian can act on it.
      (res?.skipped || []).forEach((sk) => toast.error(`“${sk.title}” kept — ${sk.reason}`, { duration: 6000 }));
      if (!res?.deleted && !res?.skipped?.length) toast('Nothing was deleted', { icon: 'ℹ️' });
      setBulkDel(false); selection.clear(); refetch();
    } catch (err) { toast.error(err?.message || 'Could not delete'); }
    finally { setBulkBusy(false); }
  };

  const [del,     setDel]    = useState(null);
  const [delLoad, setDL]     = useState(false);
  // null = closed, {} = a new title, { book } = editing that one. The dialog
  // owns the form, the copies it arrives with and the duplicate refusal.
  const [dialog,  setDialog] = useState(null);

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

  const openCreate = () => setDialog({});
  const openEdit   = (b) => setDialog({ book: b });

  const handleDelete = async () => {
    setDL(true);
    try { await deleteBook(del._id); toast.success('Book deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setDL(false); }
  };

  const columns = [
    {
      key: 'title',
      className: 'libb-col-title',
      label: <SortHead label="Title" field="title" sort={sort} onSort={onSort} />,
      render: (r) => <TitleCell book={r} />,
    },
    {
      key: 'authors',
      className: 'libb-col-author',
      label: <SortHead label="Author(s)" field="authors" sort={sort} onSort={onSort} />,
      render: (r) => <AuthorsCell book={r} />,
    },
    {
      key: 'isbn',
      className: 'libb-col-isbn',
      label: <SortHead label="ISBN" field="isbn" sort={sort} onSort={onSort} />,
      render: (r) => (r.isbn ? <span className="libb-isbn">{r.isbn}</span> : <span className="lnone">—</span>),
    },
    {
      key: 'category',
      className: 'libb-col-cat',
      label: <SortHead label="Category" field="category" sort={sort} onSort={onSort} />,
      render: (r) => (r.category
        ? <Badge variant="info">{r.category}</Badge>
        : <span className="lnone">Uncategorised</span>),
    },
    {
      key: 'available',
      className: 'libb-col-num',
      label: <SortHead label="Available" field="available" sort={sort} onSort={onSort} align="right" />,
      render: (r) => <CopiesCell value={r.availableCopies ?? 0} of={r.totalCopies ?? 0} />,
    },
    {
      key: 'total',
      className: 'libb-col-num',
      label: <SortHead label="Total" field="total" sort={sort} onSort={onSort} align="right" />,
      render: (r) => ((r.totalCopies ?? 0) === 0
        ? <span className="lnone">None</span>
        : <span className="libb-copies"><b>{r.totalCopies}</b></span>),
    },
    {
      key: 'status',
      className: 'libb-col-status',
      label: <SortHead label="Status" field="status" sort={sort} onSort={onSort} />,
      render: (r) => <StatusChip status={r.status} />,
    },
    {
      key: 'actions',
      className: 'ltable__acts',
      label: 'Actions',
      render: (r) => (
        <RowActions>
          <IconAction icon="eye" label="Copies and history"
            onClick={() => navigate(`${pathname}/${r._id}`)} />
          <IconAction icon="pencil" label="Edit book" variant="edit" onClick={() => openEdit(r)} />
          <IconAction icon="trash" label="Delete book" variant="danger" onClick={() => setDel(r)} />
          <RowMenu>
            <MenuItem icon="layers" to={`${pathname}/${r._id}`}>Manage copies</MenuItem>
            <MenuItem icon="download" onClick={() => grab('/library/books/export', { q: r.title }, `${r.title}.xlsx`)}>
              Export this title
            </MenuItem>
            <MenuSep />
            <MenuItem icon="trash" danger onClick={() => setDel(r)}>Delete book</MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="page libdpg libbpg">
      <Hero
        icon="book" title="Books"
        tagline="Catalogue · Copies · Circulation"
        subtitle="Manage the collection, add titles, register copies and see what is on the shelf."
        quote={heroQuote} />

      <div className="libd-tiles">
        <Tile icon="book" tone="indigo" to={pathname}
          value={stats.total ?? 0} label="Total books" caption="Titles in the catalogue"
          trend={stats.addedThisMonth
            ? { dir: 'up', text: `${stats.addedThisMonth} this month` }
            : note('None added this month')} />

        <Tile icon="checkCircle" tone="green" to={`${pathname}?status=available`}
          value={stats.available ?? 0} label="Available" caption="At least one copy on the shelf"
          trend={note(share(stats.available || 0, stats.total || 0))} />

        <Tile icon="repeat" tone="amber" to={`${pathname}?status=issued_out`}
          value={stats.issuedOut ?? 0} label="All copies out" caption="Nothing left to lend"
          trend={note(share(stats.issuedOut || 0, stats.total || 0))} />

        <Tile icon="alert" tone={stats.overdue ? 'pink' : 'green'} to={`${pathname}?status=overdue`}
          value={stats.overdue ?? 0} label="Overdue" caption="A copy is past its due date"
          trend={stats.overdue
            ? { dir: 'down', text: share(stats.overdue, stats.total || 0) }
            : note('Nothing late')} />

        <Tile icon="clock" tone="purple" to={`${pathname.replace(/\/books$/, '')}/reservations`}
          value={stats.reserved ?? 0} label="Reserved" caption="Titles with somebody waiting"
          trend={note(share(stats.reserved || 0, stats.total || 0))} />
      </div>

      <section className="card libb-card">
        <header className="libb-head">
          <span className="libd-panel__icon tint-indigo"><Icon name="library" size={17} /></span>
          <div>
            <h2>Book catalogue</h2>
            <p>Every title the library holds, with its copies and where they are.</p>
          </div>

          <div className="libb-search">
            <Icon name="search" size={16} />
            <input className="form-control" value={search} placeholder="Search by title, author, ISBN…"
              onChange={(e) => setSearch(e.target.value)} aria-label="Search the catalogue" />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <div className="libb-acts">
            <FiltersButton open={showFilters} count={(category ? 1 : 0) + (status ? 1 : 0)}
              onClick={() => setShowFilters((v) => !v)} />
            <Button variant="secondary" onClick={openImport}><Icon name="upload" size={16} /> Import</Button>
            <Button variant="secondary" onClick={exportCatalogue}><Icon name="download" size={16} /> Export</Button>
            <Button onClick={openCreate}><Icon name="plus" size={16} /> Add Book</Button>
          </div>
        </header>

        {showFilters && (
          <FiltersPanel
            category={category} status={status} categories={categories}
            onCategory={(v) => setParam('category', v)}
            onStatus={(v) => setParam('status', v)}
            onReset={clearAll}
          />
        )}

        {anyFilter && (
          <div className="libb-chips">
            {term && <Chip label={`Search: ${term}`} onClear={() => setSearch('')} />}
            {category && <Chip label={`Category: ${category}`} onClear={() => setParam('category', '')} />}
            {status && <Chip label={`Status: ${status.replace(/_/g, ' ')}`} onClear={() => setParam('status', '')} />}
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearAll}>Clear all</button>
          </div>
        )}

        <SelectionBar count={selection.ids.length} noun="book" onClear={selection.clear}>
          <Button variant="danger" size="sm" onClick={() => setBulkDel(true)}>
            <Icon name="trash" size={15} /> Delete
          </Button>
        </SelectionBar>

        <ListTable
          columns={columns}
          rows={books}
          loading={loading}
          selection={selection}
          startIndex={start}
          emptyIcon={anyFilter ? '🔍' : '📚'}
          emptyTitle={anyFilter ? 'No books match this' : 'The catalogue is empty'}
          emptyMessage={anyFilter
            ? 'Try another search term, category or status.'
            : 'Add a title, or import a whole catalogue from a spreadsheet.'}
          emptyAction={anyFilter
            ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
            : <Button onClick={openCreate}>+ Add Book</Button>}
        />

        <ListFooter
          page={Math.min(page, pages)} pages={pages} total={total}
          limit={limit} count={books.length} noun="book"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      <BookDialog
        open={!!dialog} book={dialog?.book} categories={categories}
        onClose={() => setDialog(null)}
        onSaved={(id, opt) => { refetch(); if (opt?.open && id) navigate(`${pathname}/${id}`); }} />

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete} loading={delLoad}
        title="Delete book" confirmLabel="Delete book"
        message={`Delete “${del?.title}”? Its copies go with it. A book that is out on loan or queued for cannot be deleted.`} />

      <Confirm open={bulkDel} onClose={() => setBulkDel(false)} onConfirm={removeSelected} loading={bulkBusy}
        title="Delete books" confirmLabel="Delete them"
        message={`Delete ${selection.ids.length} book${selection.ids.length === 1 ? '' : 's'} and their copies? Any that are out on loan, queued for, or still marked issued will be kept and named.`} />

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
    </div>
  );
}
