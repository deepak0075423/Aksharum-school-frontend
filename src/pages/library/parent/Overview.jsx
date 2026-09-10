/**
 * The parent's library — what each child has borrowed.
 *
 * Told per child, because a parent with two children has two different shelves
 * and merging them produces a list nobody can act on: a book is due back from a
 * particular child, not from the family.
 *
 * Fines live on their own tab, where paying and receipts are handled by the
 * same component the child sees.
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getParentOverview } from '../../../api/library.api';
import { Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Fig, Panel, rupees, shortDate } from '../student/dashboardParts';
import { Cover } from '../student/searchParts';
import { useChild, ChildSwitch, NoChildren, whereOf } from './parts';

const OPEN = ['issued', 'overdue'];
const DAY  = 86400000;

const STATUS = {
  issued:   { label: 'Borrowed', tone: 'blue' },
  overdue:  { label: 'Overdue',  tone: 'red' },
  returned: { label: 'Returned', tone: 'green' },
  lost:     { label: 'Lost',     tone: 'amber' },
};

/** Books, a parent and a child. Ornament only — no data, no links. */
const FamilyArt = () => (
  <svg className="libpl-art" viewBox="0 0 236 104" aria-hidden="true" focusable="false">
    <rect x="18" y="74" width="96" height="14" rx="3" fill="#6366f1" />
    <rect x="24" y="59" width="84" height="14" rx="3" fill="#fbbf24" />
    <rect x="30" y="44" width="72" height="14" rx="3" fill="#f472b6" />
    <rect x="28" y="80" width="24" height="4" rx="2" fill="#fff" opacity=".5" />
    <rect x="34" y="65" width="20" height="4" rx="2" fill="#fff" opacity=".5" />

    <circle cx="150" cy="34" r="13" fill="#818cf8" />
    <path d="M132 90c0-11 8-19 18-19s18 8 18 19H132Z" fill="#6366f1" />
    <circle cx="190" cy="48" r="10" fill="#34d399" />
    <path d="M176 90c0-8 6-14 14-14s14 6 14 14h-28Z" fill="#10b981" />

    <path d="M206 26h20v22l-10-7-10 7V26Z" fill="#fbbf24" />
    <path d="M120 22l2.5 6.5L129 31l-6.5 2.5L120 40l-2.5-6.5L111 31l6.5-2.5L120 22Z"
      fill="currentColor" opacity=".3" />
    <rect x="10" y="93" width="216" height="5" rx="2.5" fill="currentColor" opacity=".12" />
  </svg>
);

export default function ParentLibraryOverview() {
  const { data, loading } = useFetch(getParentOverview);
  const children = useMemo(() => data?.children || [], [data]);
  const { child, pick } = useChild(children);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const year  = data?.academicYear?.yearName || '';
  const loans = child?.loans || [];
  const holds = child?.reservations || [];
  const s     = child?.stats || {};
  const now   = Date.now();

  /** "2 days left" / "5 days overdue" — the number that decides whether to act. */
  const DueNote = ({ row }) => {
    if (!OPEN.includes(row.status) || !row.dueDate) return null;
    const days = Math.ceil((new Date(row.dueDate).getTime() - now) / DAY);
    if (days < 0)  return <em className="libmb-due libmb-due--late">({Math.abs(days)} day{Math.abs(days) === 1 ? '' : 's'} overdue)</em>;
    if (days === 0) return <em className="libmb-due libmb-due--late">(due today)</em>;
    return <em className={`libmb-due${days <= 2 ? ' libmb-due--late' : ''}`}>({days} day{days === 1 ? '' : 's'} left)</em>;
  };

  return (
    <div className="page libplpg">
      <header className="liblg-hero">
        <span className="liblg-ico liblg-ico--xl liblg-t--indigo"><Icon name="bookOpen" size={28} /></span>
        <div className="liblg-hero__body">
          <h1>Library</h1>
          <p>See what each of your children has borrowed, what is due back, and settle any fines.</p>
        </div>
        <div className="liblg-hero__art">
          <FamilyArt />
          <blockquote className="liblg-quote">
            &ldquo;A child who reads will be an adult who thinks.&rdquo;
          </blockquote>
        </div>
      </header>

      {!children.length ? <NoChildren /> : (
        <>
          <ChildSwitch children={children} child={child} onPick={pick} />

          <div className="liblg-figs">
            <Fig icon="bookOpen" tone="blue" label="Currently Borrowed" value={s.borrowed || 0}
              caption={s.borrowed ? 'Not yet returned' : 'Nothing out right now'} />
            <Fig icon="alert" tone="red" label="Overdue" value={s.overdue || 0}
              caption={s.overdue ? 'Past the due date' : 'Nothing late'} />
            <Fig icon="repeat" tone="green" label="Returned" value={s.returned || 0}
              caption={year ? `In ${year}` : 'All time'} />
            <Fig icon="star" tone="violet" label="Reserved" value={s.reserved || 0}
              caption={s.reserved ? 'Waiting in the queue' : 'Nothing on hold'} />
          </div>

          {/* Money owed is the one thing a parent has to act on, so it is said
              here rather than left for them to find on the other tab. */}
          {s.finesOutstanding > 0 && (
            <Link className="libpl-owedbar" to={`/parent/library/fines?child=${child._id}`}>
              <Icon name="alert" size={18} />
              <span>
                <strong>{rupees(s.finesOutstanding)} outstanding</strong>
                {child.name} has a library fine to settle.
              </span>
              <Icon name="chevronRight" size={16} />
            </Link>
          )}

          <Panel icon="bookOpen" tone="indigo" title={`Books — ${child.name}`}>
            {!loans.length ? (
              <div className="liblg-empty">
                <span className="liblg-empty__icon"><Icon name="bookOpen" size={26} /></span>
                <div>
                  <strong>{child.name} has not borrowed anything yet</strong>
                  <p>Books borrowed from the school library will appear here.</p>
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
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((l, i) => {
                      const st  = STATUS[l.isOverdue && l.status === 'issued' ? 'overdue' : l.status]
                        || { label: l.status, tone: 'slate' };
                      const due = l.fineSummary?.outstanding || 0;
                      return (
                        <tr key={l._id}>
                          <td className="libmb-num">{i + 1}</td>
                          <td>
                            <div className="libsr-book">
                              <Cover book={l.book || {}} />
                              <div className="libsr-book__body">
                                <strong className="libfn-booktitle">{l.book?.title || 'Book'}</strong>
                                <span>{(l.book?.authors || []).join(', ') || 'Unknown author'}</span>
                                {l.book?.isbn && <em>ISBN: {l.book.isbn}</em>}
                              </div>
                            </div>
                          </td>
                          <td className="libmb-code">{l.bookCopy?.uniqueCode || '—'}</td>
                          <td>{shortDate(l.issueDate)}</td>
                          <td>
                            {l.dueDate ? shortDate(l.dueDate) : <span className="libsr-dash">—</span>}
                            <DueNote row={l} />
                            {!OPEN.includes(l.status) && l.returnDate && (
                              <em className="libmb-due">Returned {shortDate(l.returnDate)}</em>
                            )}
                          </td>
                          <td>
                            <span className={`libsr-pill libsr-t--${st.tone}`}>{st.label}</span>
                            {due > 0 && <em className="libmb-owed">{rupees(due)} due</em>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {holds.length > 0 && (
            <Panel icon="star" tone="violet" title={`Reservations — ${child.name}`}>
              <div className="libpl-holds">
                {holds.map((h) => (
                  <div key={h._id} className="libpl-hold">
                    <Cover book={h.book || {}} />
                    <div className="libpl-hold__body">
                      <strong>{h.book?.title || 'Book'}</strong>
                      <span>{(h.book?.authors || []).join(', ') || 'Unknown author'}</span>
                    </div>
                    {h.status === 'ready'
                      ? <span className="libsr-pill libsr-t--green">Ready to collect</span>
                      : (
                        <span className="libsr-pill libsr-t--indigo">
                          In queue{h.queuePosition ? ` · #${h.queuePosition}` : ''}
                        </span>
                      )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <p className="libpl-note">
            <Icon name="user" size={15} />
            Showing {child.name} · {whereOf(child)}
            {children.length > 1 && ' — use the switch above for your other child.'}
          </p>
        </>
      )}
    </div>
  );
}
