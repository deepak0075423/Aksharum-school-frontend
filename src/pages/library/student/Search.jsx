/**
 * Search Books — the catalogue as a member browses it.
 *
 * The filters are not a fixed list: the server sends back the categories,
 * languages and subjects the collection actually contains, and each dropdown
 * appears only when there is more than one thing to choose between. A school
 * that never fills in a field is never asked to filter by it.
 *
 * Students and teachers reach the same catalogue and the same queue through
 * their own endpoints; only the role decides which pair is used.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { useAuth } from '../../../contexts/AuthContext';
import {
  studentSearch, studentReserve, cancelMyReservation,
  teacherSearch, teacherReserve, cancelTeacherReserv,
} from '../../../api/library.api';
import { Spinner, Pagination, Button } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { RowMenu, MenuItem, MenuSep } from '../../admin/listParts';
import { Fig, Panel } from './dashboardParts';
import { SearchArt, Field, FacetSelect, Cover, AvailPill, HoldPill, BookDetails } from './searchParts';

const SORTS = [
  ['title_asc',  'Title (A–Z)'],
  ['title_desc', 'Title (Z–A)'],
  ['newest',     'Recently added'],
  ['available',  'Most available'],
];

const AVAILABILITY = [
  ['',          'All books'],
  ['available', 'Available now'],
  ['out',       'All copies out'],
];

const BLANK = { q: '', category: '', language: '', subject: '', availability: '' };

export default function LibrarySearch() {
  const { user }  = useAuth();
  const isTeacher = user?.role === 'teacher';
  const base      = isTeacher ? '/teacher/library' : '/student/library';

  // Typed but not yet applied. The selects apply themselves; free text waits
  // for Enter or the Search button, so a half-typed ISBN is never searched for.
  const [draft,   setDraft]   = useState('');
  const [applied, setApplied] = useState(BLANK);
  const [sort,    setSort]    = useState('title_asc');
  const [page,    setPage]    = useState(1);
  const [view,    setView]    = useState('list');
  const [details, setDetails] = useState(null);
  const [busy,    setBusy]    = useState('');

  const search  = isTeacher ? teacherSearch : studentSearch;
  const unqueue = isTeacher ? cancelTeacherReserv : cancelMyReservation;
  const reserve = isTeacher ? teacherReserve : studentReserve;

  const { data, meta, loading, refetch } = useFetch(
    () => search({
      q:            applied.q || undefined,
      category:     applied.category || undefined,
      language:     applied.language || undefined,
      subject:      applied.subject || undefined,
      availability: applied.availability || undefined,
      sort, page, limit: 10,
    }),
    [applied, sort, page, isTeacher],
  );

  const books   = Array.isArray(data) ? data : [];
  const summary = meta?.summary || {};
  const facets  = meta?.facets  || {};
  const total   = meta?.total   || 0;
  const pages   = meta?.pages   || 1;

  const setFilter = (key) => (value) => { setApplied((f) => ({ ...f, [key]: value })); setPage(1); };
  const runSearch = () => { setApplied((f) => ({ ...f, q: draft.trim() })); setPage(1); };
  const clearAll  = () => { setDraft(''); setApplied(BLANK); setPage(1); };
  const dirty     = draft.trim() !== applied.q || Object.values(applied).some(Boolean);

  const from = total ? (page - 1) * 10 + 1 : 0;
  const to   = Math.min(page * 10, total);

  const handleReserve = async (book) => {
    setBusy(book._id);
    try {
      const res = await reserve(book._id);
      const pos = res?.data?.queuePosition;
      toast.success(res?.data?.status === 'ready'
        ? 'Ready to collect — pick it up from the library'
        : `Reserved — you are number ${pos ?? '?'} in the queue`);
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not reserve the book'); }
    finally { setBusy(''); }
  };

  const handleCancel = async (hold) => {
    setBusy(hold._id);
    try { await unqueue(hold._id); toast.success('Reservation cancelled'); refetch(); }
    catch (err) { toast.error(err?.message || 'Could not cancel the reservation'); }
    finally { setBusy(''); }
  };

  /** Reserve, or the queue state when the member is already in it. */
  const ReserveAction = ({ book, block }) => {
    const hold = book.myReservation;
    if (hold) {
      return (
        <div className={`libsr-held${block ? ' libsr-held--block' : ''}`}>
          <HoldPill hold={hold} />
          <button type="button" className="libsr-cancel" disabled={busy === hold._id}
            onClick={() => handleCancel(hold)}>Cancel</button>
        </div>
      );
    }
    return (
      <Button size="sm" variant={book.availableCopies > 0 ? 'primary' : 'secondary'}
        loading={busy === book._id} onClick={() => handleReserve(book)}>
        <Icon name="star" size={15} />
        {book.availableCopies > 0 ? 'Reserve' : 'Join queue'}
      </Button>
    );
  };

  const Kebab = ({ book }) => (
    <RowMenu>
      <MenuItem icon="eye" onClick={() => setDetails(book)}>Book details</MenuItem>
      {book.isbn && (
        <MenuItem icon="files" onClick={() => {
          navigator.clipboard?.writeText(book.isbn)
            .then(() => toast.success('ISBN copied'))
            .catch(() => toast.error('Could not copy the ISBN'));
        }}>Copy ISBN</MenuItem>
      )}
      {book.myReservation && <MenuSep />}
      {book.myReservation && (
        <MenuItem icon="close" danger onClick={() => handleCancel(book.myReservation)}>
          Cancel reservation
        </MenuItem>
      )}
    </RowMenu>
  );

  const filtersOn = useMemo(
    () => Object.entries(applied).filter(([, v]) => v).length,
    [applied],
  );

  return (
    <div className="page libsrpg">
      <header className="liblg-hero">
        <span className="liblg-ico liblg-ico--xl liblg-t--indigo"><Icon name="bookOpen" size={28} /></span>
        <div className="liblg-hero__body">
          <h1>Search Books</h1>
          <p>Find and explore books available in the school library.</p>
        </div>
        <div className="liblg-hero__art">
          <SearchArt />
          <blockquote className="liblg-quote">
            &ldquo;Books open doors to new ideas, new worlds and new possibilities.&rdquo;
          </blockquote>
        </div>
      </header>

      <div className="libsr-body">
        {/* ── Filters ──────────────────────────────────────────────────── */}
        <aside className="libsr-rail">
          <div className="libsr-filters">
            <header>
              <h2><Icon name="filter" size={17} />Filters</h2>
              {filtersOn > 0 && (
                <button type="button" className="libsr-clear" onClick={clearAll}>Clear All</button>
              )}
            </header>

            <Field label="Search">
              <span className="libsr-input">
                <Icon name="search" size={16} />
                <input className="form-control" placeholder="Title, author, ISBN, keyword…"
                  value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }} />
              </span>
            </Field>

            <FacetSelect label="Category" allLabel="All Categories" options={facets.category}
              value={applied.category} onChange={setFilter('category')} />
            <FacetSelect label="Subject" allLabel="All Subjects" options={facets.subject}
              value={applied.subject} onChange={setFilter('subject')} />
            <FacetSelect label="Language" allLabel="All Languages" options={facets.language}
              value={applied.language} onChange={setFilter('language')} min={2} />

            <Field label="Availability">
              <select className="form-control" value={applied.availability}
                onChange={(e) => setFilter('availability')(e.target.value)}>
                {AVAILABILITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>

            <div className="libsr-filters__go">
              <Button onClick={runSearch}><Icon name="search" size={16} />Search</Button>
              <Button variant="secondary" onClick={clearAll} disabled={!dirty}>
                <Icon name="refresh" size={16} />Reset
              </Button>
            </div>
          </div>
        </aside>

        {/* ── Results ──────────────────────────────────────────────────── */}
        <div className="libsr-main">
          <div className="liblg-figs libsr-figs">
            <Fig icon="bookOpen" tone="blue"   label="Total Books"
              value={Number(summary.totalBooks || 0).toLocaleString('en-IN')} caption="In library" />
            <Fig icon="checkCircle" tone="green" label="Available"
              value={Number(summary.availableCopies || 0).toLocaleString('en-IN')} caption="Ready to issue" />
            <Fig icon="clock" tone="amber"     label="Currently Issued"
              value={Number(summary.issuedCopies || 0).toLocaleString('en-IN')} caption="By students & staff" />
            <Fig icon="star" tone="pink"       label="Reserved"
              value={Number(summary.reserved || 0).toLocaleString('en-IN')} caption="By students & staff" />
          </div>

          <Panel icon="bookOpen" tone="indigo" title={`Books (${total.toLocaleString('en-IN')})`}
            action={(
              <div className="libsr-tools">
                <label className="libsr-sort">
                  <span>Sort by:</span>
                  <select className="form-control" value={sort}
                    onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                    {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <div className="libsr-view" role="group" aria-label="Layout">
                  <button type="button" className={view === 'list' ? 'is-on' : ''}
                    aria-pressed={view === 'list'} title="List view" onClick={() => setView('list')}>
                    <Icon name="menu" size={16} />
                  </button>
                  <button type="button" className={view === 'grid' ? 'is-on' : ''}
                    aria-pressed={view === 'grid'} title="Grid view" onClick={() => setView('grid')}>
                    <Icon name="grid" size={16} />
                  </button>
                </div>
              </div>
            )}>

            {loading ? <div className="libsr-loading"><Spinner /></div>
              : !books.length ? (
                <div className="liblg-empty">
                  <span className="liblg-empty__icon"><Icon name="search" size={26} /></span>
                  <div>
                    <strong>{filtersOn || applied.q ? 'No books match those filters' : 'The catalogue is empty'}</strong>
                    <p>
                      {filtersOn || applied.q
                        ? 'Try a broader search, or clear the filters to see everything.'
                        : 'Books appear here as soon as the library adds them.'}
                    </p>
                  </div>
                </div>
              ) : view === 'grid' ? (
                <div className="libsr-grid">
                  {books.map((b) => (
                    <article key={b._id} className="libsr-card">
                      <Cover book={b} size="lg" />
                      <h3 title={b.title}>{b.title}</h3>
                      <p>{(b.authors || []).join(', ') || 'Unknown author'}</p>
                      <div className="libsr-card__tags">
                        {b.category && <span className="libsr-pill libsr-t--indigo">{b.category}</span>}
                        <AvailPill book={b} />
                      </div>
                      <div className="libsr-card__go">
                        <ReserveAction book={b} block />
                        <Kebab book={b} />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="libsr-tablewrap">
                  <table className="libsr-table">
                    <thead>
                      <tr>
                        <th>Book details</th>
                        <th>Category</th>
                        <th>Language</th>
                        <th>Availability</th>
                        <th className="libsr-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {books.map((b) => (
                        <tr key={b._id}>
                          <td>
                            <div className="libsr-book">
                              <Cover book={b} />
                              <div className="libsr-book__body">
                                <button type="button" className="libsr-title" onClick={() => setDetails(b)}>
                                  {b.title}
                                </button>
                                <span>{(b.authors || []).join(', ') || 'Unknown author'}</span>
                                {b.isbn && <em>ISBN: {b.isbn}</em>}
                              </div>
                            </div>
                          </td>
                          <td>{b.category
                            ? <span className="libsr-pill libsr-t--indigo">{b.category}</span>
                            : <span className="libsr-dash">—</span>}</td>
                          <td>{b.language
                            ? <span className="libsr-pill libsr-t--violet">{b.language}</span>
                            : <span className="libsr-dash">—</span>}</td>
                          <td><AvailPill book={b} /></td>
                          <td className="libsr-right">
                            <div className="libsr-actions">
                              <ReserveAction book={b} />
                              <Kebab book={b} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Panel>

          {total > 0 && (
            <div className="libsr-foot">
              <span>Showing {from} to {to} of {total.toLocaleString('en-IN')} books</span>
              {pages > 1 && <Pagination page={page} pages={pages} total={total} onPage={setPage} />}
            </div>
          )}
        </div>
      </div>

      {details && (
        <BookDetails book={details} onClose={() => setDetails(null)}
          action={<>
            <Button variant="secondary" onClick={() => setDetails(null)}>Close</Button>
            <ReserveAction book={details} />
          </>} />
      )}
    </div>
  );
}
