/**
 * My Books — every loan this member has had, open and closed.
 *
 * The table stays to the facts of the loan: which book, which copy, out when,
 * back when, and where it stands. What a loan *cost* — the fine charged, paid,
 * waived or still owed, and the receipts behind it — lives in View, because it
 * is the exception rather than the rule and a column of dashes teaches nobody
 * anything. A loan with money still owed says so on the row itself, so nothing
 * that costs the member is hidden behind a click.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getMyBooks, getTeacherMyBooks, renewMyBook, renewTeacherBook,
} from '../../../api/library.api';
import { Spinner, Button, Pagination, Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { saveFile } from '../../../utils/downloadFile';
import { RowMenu, MenuItem, MenuSep } from '../../admin/listParts';
import { Fig, Panel, rupees, shortDate } from './dashboardParts';
import { Cover } from './searchParts';

const PER_PAGE = 10;
const DAY = 86400000;

// LibraryIssuance.status: issued | returned | overdue | lost. 'lost' used to
// fall through the label ladder and come out as "Issued" — somebody who had
// paid for a book they lost was still shown as holding it.
const STATUS = {
  issued:   { label: 'Borrowed', tone: 'blue' },
  overdue:  { label: 'Overdue',  tone: 'red' },
  returned: { label: 'Returned', tone: 'green' },
  lost:     { label: 'Lost',     tone: 'amber' },
};
const OPEN = ['issued', 'overdue'];

const STATUS_FILTERS = [
  ['',         'All Status'],
  ['issued',   'Borrowed'],
  ['overdue',  'Overdue'],
  ['returned', 'Returned'],
  ['lost',     'Lost'],
];

const RANGES = [
  ['',     'All Time'],
  ['year', 'This academic year'],
  ['30',   'Last 30 days'],
  ['180',  'Last 6 months'],
];

const PAYMENT = { pending: 'Unpaid', paid: 'Paid', waived: 'Waived' };

export default function LibraryMyBooks() {
  const { user }  = useAuth();
  const isTeacher = user?.role === 'teacher';

  const { data, meta, loading, refetch } = useFetch(
    isTeacher ? getTeacherMyBooks : getMyBooks, [isTeacher],
  );

  const [q,       setQ]       = useState('');
  const [status,  setStatus]  = useState('');
  const [range,   setRange]   = useState('');
  const [page,    setPage]    = useState(1);
  const [view,    setView]    = useState(null);
  const [renewing, setRenewing] = useState('');

  const year = meta?.academicYear || null;
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const now = Date.now();
  // A loan the sweep has not caught yet is still overdue to the person holding
  // it, so the due date decides the badge for an open loan.
  const stateOf = (r) => (r.status === 'issued' && (r.isOverdue || now > new Date(r.dueDate).getTime())
    ? 'overdue' : r.status);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const since  = range === 'year'
      ? (year?.startDate ? new Date(year.startDate).getTime() : 0)
      : range ? now - Number(range) * DAY : 0;
    return rows.filter((r) => {
      if (status && stateOf(r) !== status) return false;
      if (since && new Date(r.issueDate).getTime() < since) return false;
      if (!needle) return true;
      return [
        r.book?.title, (r.book?.authors || []).join(' '), r.book?.isbn, r.bookCopy?.uniqueCode,
      ].some((v) => String(v || '').toLowerCase().includes(needle));
    });
  }, [rows, q, status, range, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const figures = useMemo(() => {
    const start = year?.startDate ? new Date(year.startDate).getTime() : 0;
    return {
      total:    rows.length,
      open:     rows.filter((r) => OPEN.includes(r.status)).length,
      returned: rows.filter((r) => r.status === 'returned'
        && (!start || new Date(r.returnDate || r.issueDate).getTime() >= start)).length,
    };
  }, [rows, year]);

  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const safe  = Math.min(page, pages);
  const slice = shown.slice((safe - 1) * PER_PAGE, safe * PER_PAGE);
  const from  = shown.length ? (safe - 1) * PER_PAGE + 1 : 0;
  const to    = Math.min(safe * PER_PAGE, shown.length);
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  /** Extending a loan with nobody queued behind it never needed a trip to the desk. */
  const renew = async (id) => {
    setRenewing(id);
    try {
      const res = await (isTeacher ? renewTeacherBook(id) : renewMyBook(id));
      toast.success(res?.message || 'Renewed');
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not renew'); }
    finally { setRenewing(''); }
  };

  /** What is on screen, in the order it is on screen — not the whole history. */
  const exportCsv = () => {
    if (!shown.length) return toast.error('There is nothing to export');
    const head = ['Book', 'Authors', 'ISBN', 'Accession No.', 'Issued', 'Due', 'Returned', 'Status', 'Fine charged', 'Outstanding'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = shown.map((r) => [
      r.book?.title, (r.book?.authors || []).join('; '), r.book?.isbn, r.bookCopy?.uniqueCode,
      shortDate(r.issueDate), shortDate(r.dueDate), r.returnDate ? shortDate(r.returnDate) : '',
      (STATUS[stateOf(r)] || {}).label || r.status,
      r.fineSummary?.charged || 0, r.fineSummary?.outstanding || 0,
    ].map(cell).join(','));
    saveFile([head.map(cell).join(','), ...body].join('\n'), 'my-library-books.csv', 'text/csv;charset=utf-8');
    toast.success(`Exported ${shown.length} row${shown.length === 1 ? '' : 's'}`);
  };

  /** "1 day left" / "4 days overdue" — the number that decides whether to act. */
  const DueNote = ({ row }) => {
    if (!OPEN.includes(row.status) || !row.dueDate) return null;
    const days = Math.ceil((new Date(row.dueDate).getTime() - now) / DAY);
    if (days < 0) return <em className="libmb-due libmb-due--late">({Math.abs(days)} day{Math.abs(days) === 1 ? '' : 's'} overdue)</em>;
    if (days === 0) return <em className="libmb-due libmb-due--late">(due today)</em>;
    return <em className={`libmb-due${days <= 2 ? ' libmb-due--late' : ''}`}>({days} day{days === 1 ? '' : 's'} left)</em>;
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page libmbpg">
      <header className="liblg-hero">
        <span className="liblg-ico liblg-ico--xl liblg-t--indigo"><Icon name="bookOpen" size={28} /></span>
        <div className="liblg-hero__body">
          <h1>Library</h1>
          <p>Explore, borrow and manage books from the school library.</p>
        </div>
        <div className="liblg-hero__art">
          <BookPileArt />
          <blockquote className="liblg-quote">
            &ldquo;Books are the quietest and most constant friends.&rdquo;
          </blockquote>
        </div>
      </header>

      <div className="liblg-figs">
        <Fig icon="bookOpen" tone="violet" label="Total Books" value={figures.total} caption="All time" />
        <Fig icon="book" tone="blue" label="Currently Borrowed" value={figures.open} caption="Not yet returned" />
        <Fig icon="repeat" tone="green" label="Returned" value={figures.returned}
          caption={year?.yearName ? `In ${year.yearName}` : 'All time'} />
        <Fig icon="alert" tone="red" label="Fines"
          value={rupees(meta?.finesOutstanding || 0)} caption="Outstanding" />
      </div>

      <Panel icon="bookOpen" tone="indigo" title="My Books" className="libmb-panel"
        action={(
          <div className="libmb-tools">
            <span className="libsr-input libmb-search">
              <Icon name="search" size={16} />
              <input className="form-control" placeholder="Search by title, author, ISBN or accession number…"
                value={q} onChange={(e) => reset(setQ)(e.target.value)} />
            </span>
            <select className="form-control libmb-select" value={status}
              onChange={(e) => reset(setStatus)(e.target.value)}>
              {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="form-control libmb-select" value={range}
              onChange={(e) => reset(setRange)(e.target.value)}>
              {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <Button variant="secondary" onClick={exportCsv}>
              <Icon name="download" size={16} />Export
            </Button>
          </div>
        )}>

        {!shown.length ? (
          <div className="liblg-empty">
            <span className="liblg-empty__icon"><Icon name="bookOpen" size={26} /></span>
            <div>
              <strong>{rows.length ? 'No loans match those filters' : 'You have not borrowed anything yet'}</strong>
              <p>
                {rows.length
                  ? 'Try a different status or period, or clear the search.'
                  : 'Books you borrow from the library will appear here.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="libsr-tablewrap">
            <table className="libsr-table libmb-table">
              <thead>
                <tr>
                  <th className="libmb-num">#</th>
                  <th>Book details</th>
                  <th>Accession no.</th>
                  <th>Issued date</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th className="libsr-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r, i) => {
                  const st  = STATUS[stateOf(r)] || { label: r.status || '—', tone: 'slate' };
                  const due = r.fineSummary?.outstanding || 0;
                  // data-focus-id is how a notification about one loan finds
                  // its row — see hooks/useFocusHighlight.js.
                  return (
                    <tr key={r._id} data-focus-id={r._id}>
                      <td className="libmb-num">{from + i}</td>
                      <td>
                        <div className="libsr-book">
                          <Cover book={r.book || {}} />
                          <div className="libsr-book__body">
                            <button type="button" className="libsr-title" onClick={() => setView(r)}>
                              {r.book?.title || 'Book'}
                            </button>
                            <span>{(r.book?.authors || []).join(', ') || 'Unknown author'}</span>
                            {r.book?.isbn && <em>ISBN: {r.book.isbn}</em>}
                          </div>
                        </div>
                      </td>
                      <td className="libmb-code">{r.bookCopy?.uniqueCode || '—'}</td>
                      <td>{shortDate(r.issueDate)}</td>
                      {/* The due date is a fact of the loan whatever became of
                          it; a closed loan carries the date it actually came
                          back underneath, rather than a dash. */}
                      <td>
                        {r.dueDate ? shortDate(r.dueDate) : <span className="libsr-dash">—</span>}
                        <DueNote row={r} />
                        {!OPEN.includes(r.status) && r.returnDate && (
                          <em className="libmb-due">Returned {shortDate(r.returnDate)}</em>
                        )}
                      </td>
                      <td>
                        <span className={`libsr-pill libsr-t--${st.tone}`}>{st.label}</span>
                        {due > 0 && <em className="libmb-owed">{rupees(due)} due</em>}
                      </td>
                      <td className="libsr-right">
                        <div className="libsr-actions">
                          <Button size="sm" variant="secondary" onClick={() => setView(r)}>View</Button>
                          <RowMenu>
                            <MenuItem icon="eye" onClick={() => setView(r)}>Loan details</MenuItem>
                            {r.bookCopy?.uniqueCode && (
                              <MenuItem icon="files" onClick={() => {
                                navigator.clipboard?.writeText(r.bookCopy.uniqueCode)
                                  .then(() => toast.success('Accession number copied'))
                                  .catch(() => toast.error('Could not copy'));
                              }}>Copy accession no.</MenuItem>
                            )}
                            {OPEN.includes(r.status) && <MenuSep />}
                            {OPEN.includes(r.status) && (
                              <MenuItem icon="repeat" onClick={() => renew(r._id)}>
                                {renewing === r._id ? 'Renewing…' : 'Renew loan'}
                              </MenuItem>
                            )}
                          </RowMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {shown.length > 0 && (
        <div className="libsr-foot">
          <span>Showing {from} to {to} of {shown.length} book{shown.length === 1 ? '' : 's'}</span>
          {pages > 1 && <Pagination page={safe} pages={pages} total={shown.length} onPage={setPage} />}
        </div>
      )}

      {view && (
        <LoanDetails row={view} state={stateOf(view)} onClose={() => setView(null)}
          onRenew={() => renew(view._id)} renewing={renewing === view._id} />
      )}
    </div>
  );
}

// ── One loan, in full ────────────────────────────────────────────────────────
function LoanDetails({ row, state, onClose, onRenew, renewing }) {
  const st  = STATUS[state] || { label: row.status, tone: 'slate' };
  const f   = row.fineSummary;
  const facts = [
    ['Accession no.', row.bookCopy?.uniqueCode],
    ['ISBN',          row.book?.isbn],
    ['Category',      row.book?.category],
    ['Issued',        shortDate(row.issueDate)],
    ['Due',           shortDate(row.dueDate)],
    ['Returned',      row.returnDate ? shortDate(row.returnDate) : null],
    ['Renewals',      row.renewalCount ? String(row.renewalCount) : null],
  ].filter(([, v]) => v);

  return (
    <Modal open onClose={onClose} title={row.book?.title || 'Loan'} maxWidth={620}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {OPEN.includes(row.status) && (
          <Button loading={renewing} onClick={onRenew}><Icon name="repeat" size={16} />Renew loan</Button>
        )}
      </>}>
      <div className="libsr-detail">
        <Cover book={row.book || {}} size="lg" />
        <div className="libsr-detail__body">
          <div className="libmb-head">
            <span className={`libsr-pill libsr-t--${st.tone}`}>{st.label}</span>
            <span className="libmb-by">{(row.book?.authors || []).join(', ')}</span>
          </div>
          {facts.map(([label, value]) => (
            <div key={label} className="libsr-detail__row"><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
      </div>

      {/* Money only appears when there was money. */}
      {f ? (
        <div className="libmb-fine">
          <h4>Fine on this loan{f.types?.length ? ` · ${f.types.join(', ')}` : ''}</h4>
          <div className="libmb-fine__row"><span>Charged</span><strong>{rupees(f.charged)}</strong></div>
          {f.paid > 0   && <div className="libmb-fine__row"><span>Paid</span><strong>{rupees(f.paid)}</strong></div>}
          {f.waived > 0 && <div className="libmb-fine__row"><span>Waived</span><strong>{rupees(f.waived)}</strong></div>}
          <div className="libmb-fine__row">
            <span>{PAYMENT[f.status] || 'Status'}</span>
            <strong className={f.outstanding > 0 ? 'libmb-owed-strong' : ''}>
              {f.outstanding > 0 ? `${rupees(f.outstanding)} still due` : 'Settled'}
            </strong>
          </div>
          {f.receipts?.length > 0 && (
            <div className="libmb-fine__row"><span>Receipt</span><strong>{f.receipts.join(', ')}</strong></div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

/** A pile of books and a plant. Ornament only — no data, no links. */
const BookPileArt = () => (
  <svg className="libmb-art" viewBox="0 0 232 104" aria-hidden="true" focusable="false">
    <path d="M28 66c-12-2-17-11-15-23 11-1 17 8 15 23Z" fill="#34d399" />
    <path d="M30 66c10-3 14-13 10-24-10 2-14 11-10 24Z" fill="#10b981" />
    <path d="M29 66V48" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M18 68h23l-4 26H22l-4-26Z" fill="#6366f1" />

    <rect x="70" y="74" width="120" height="16" rx="4" fill="#f59e0b" />
    <rect x="76" y="58" width="108" height="16" rx="4" fill="#6366f1" />
    <rect x="84" y="42" width="92"  height="16" rx="4" fill="#60a5fa" />
    <rect x="92" y="26" width="76"  height="16" rx="4" fill="#f472b6" />
    <rect x="82" y="80" width="30" height="4" rx="2" fill="#fff" opacity=".5" />
    <rect x="88" y="64" width="26" height="4" rx="2" fill="#fff" opacity=".5" />
    <path d="M120 26h20v22l-10-7-10 7V26Z" fill="#fbbf24" />

    <path d="M204 68c-11-2-16-10-14-21 10-1 16 7 14 21Z" fill="#34d399" />
    <path d="M206 68c9-3 13-12 9-22-9 2-13 11-9 22Z" fill="#10b981" />
    <path d="M196 70h20l-3 24h-14l-3-24Z" fill="#a5b4fc" />
    <rect x="10" y="94" width="212" height="5" rx="2.5" fill="currentColor" opacity=".12" />
  </svg>
);
