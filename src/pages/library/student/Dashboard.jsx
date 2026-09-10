/**
 * The library landing page for a member — student or teacher.
 *
 * Two faces, one layout. A member sees their own shelf: what they hold, what
 * they owe, what they have reserved. A teacher who runs the library also sees
 * the counter's — books out across the school, who has them, and the fines
 * standing against all readers.
 *
 * The line between the two is drawn by the server, not by this file: the
 * school-wide figures come from GET /library/dashboard, which sits behind the
 * module-admin guard, so a teacher without library access cannot obtain them
 * however the page is rendered. What the catalogue holds and what it is made of
 * is not privileged — Search shows both to anyone who may browse.
 */
import React, { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useModules } from '../../../contexts/ModulesContext';
import useFetch from '../../../hooks/useFetch';
import { teacherLibDashboard, studentDashboard, getDashboard } from '../../../api/library.api';
import { Spinner } from '../../../components/ui/index';
import {
  LibHero, Fig, Panel, ViewAll, Action, LoanTable, Activity, Categories, rupees,
} from './dashboardParts';

// LibraryIssuance.status is issued / overdue / returned / lost. A loan somebody
// still holds is one that has not come back and has not been written off.
const OUT_ON_LOAN = ['issued', 'overdue'];

export default function LibraryMemberDashboard() {
  const { user }      = useAuth();
  const { modules }   = useModules();
  const isTeacher     = user?.role === 'teacher';
  const runsLibrary   = isTeacher && !!modules?.isLibrarian;
  const base          = isTeacher ? '/teacher/library' : '/student/library';

  // The teacher endpoints are a separate mount; hitting the student ones as a
  // teacher 403s, which is what used to leave every tile at zero.
  const { data: mine, loading } = useFetch(
    isTeacher ? teacherLibDashboard : studentDashboard, [isTeacher],
  );
  // Asked for only by somebody who may have it — and refused by the server if
  // this ever becomes untrue.
  const { data: wide } = useFetch(
    () => (runsLibrary ? getDashboard() : Promise.resolve({ data: null })), [runsLibrary],
  );

  const issued   = useMemo(() => (mine?.issuedBooks || []), [mine]);
  const fines    = useMemo(() => (mine?.pendingFines || []), [mine]);
  const holds    = useMemo(() => (mine?.reservations || []), [mine]);
  const cat      = mine?.catalogue || {};

  // What is still owed, not what was charged: a part-waived fine that has been
  // settled is not money anybody has to find.
  const owed = fines.reduce((sum, f) => sum + Math.max(
    0, Number(f.amount || 0) - Number(f.waivedAmount || 0) - Number(f.paidAmount || 0),
  ), 0);

  /* The loans table. School-wide when this teacher runs the library, otherwise
     the reader's own — where an "issued to" column would say "me" every time. */
  const loans = useMemo(() => {
    if (runsLibrary) {
      return (wide?.recent || [])
        .filter((r) => OUT_ON_LOAN.includes(r.status))
        .slice(0, 6)
        .map((r) => ({
          _id: r._id, title: r.book?.title || 'Book',
          borrower: r.issuedTo?.name || 'Reader',
          borrowerClass: r.issuedTo?.className || (r.issuedTo?.role === 'teacher' ? 'Staff' : ''),
          issueDate: r.issueDate, dueDate: r.dueDate, status: r.status,
        }));
    }
    return issued.map((i) => ({
      _id: i._id, title: i.book?.title || 'Book',
      issueDate: i.issueDate, dueDate: i.dueDate, status: i.status,
    }));
  }, [runsLibrary, wide, issued]);

  /* The activity feed, from the same source as the table but read differently:
     the table answers "who has what", this answers "what happened when". */
  const activity = useMemo(() => {
    if (runsLibrary) {
      return (wide?.recent || []).slice(0, 6).map((r) => {
        const back = r.status === 'returned';
        return {
          _id: r._id,
          icon: back ? 'checkCircle' : 'bookOpen',
          tone: back ? 'green' : 'indigo',
          title: `${r.book?.title || 'Book'} ${back ? 'returned' : 'issued'}`,
          sub: `by ${r.issuedTo?.name || 'a reader'}${r.issuedTo?.className ? ` (${r.issuedTo.className})` : ''}`,
          at: back ? (r.returnDate || r.issueDate) : r.issueDate,
        };
      });
    }
    return (mine?.history || []).slice(0, 6).map((h) => {
      const back = h.status === 'returned';
      return {
        _id: h._id,
        icon: back ? 'checkCircle' : h.status === 'overdue' ? 'alert' : 'bookOpen',
        tone: back ? 'green' : h.status === 'overdue' ? 'red' : 'indigo',
        title: `${h.title} ${back ? 'returned' : 'issued to you'}`,
        sub: back ? `Borrowed ${new Date(h.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
          : `Due ${new Date(h.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
        at: back ? (h.returnDate || h.issueDate) : h.issueDate,
      };
    });
  }, [runsLibrary, wide, mine]);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const overdueMine = issued.filter((b) => b.status === 'overdue').length;

  return (
    <div className="page liblgpg">
      <LibHero
        title="Library"
        blurb={runsLibrary
          ? 'Access, manage and explore your school library resources.'
          : isTeacher
            ? 'Browse the catalogue, track what you have borrowed and settle any fines.'
            : 'Find your next book, track what you have borrowed and check your fines.'}
        quote={isTeacher
          ? '“A reader today, a better educator tomorrow.”'
          : '“A reader today, a leader tomorrow.”'} />

      <div className="liblg-figs">
        <Fig icon="bookOpen" tone="blue" label="Total Books"
          value={Number(cat.totalBooks || 0).toLocaleString('en-IN')}
          caption={`${Number(cat.availableCopies || 0).toLocaleString('en-IN')} copies on the shelf`}
          to={`${base}/search`} />

        {runsLibrary ? (
          <Fig icon="checkCircle" tone="green" label="Issued Books"
            value={wide?.issuedCopies ?? 0} caption="Currently issued"
            to="/teacher/manage-library/circulation" />
        ) : (
          <Fig icon="checkCircle" tone="green" label="Issued Books"
            value={issued.length}
            caption={overdueMine ? `${overdueMine} overdue` : 'Currently with you'}
            to={`${base}/my-books`} />
        )}

        {runsLibrary ? (
          <Fig icon="clock" tone="amber" label="Pending Fines"
            value={wide?.pendingFines ?? 0}
            caption={wide?.pendingFineTotal ? `${rupees(wide.pendingFineTotal)} across all readers` : 'Across all readers'}
            to="/teacher/manage-library/fines" />
        ) : (
          <Fig icon="clock" tone="amber" label="Pending Fines"
            value={fines.length}
            caption={owed > 0 ? `${rupees(owed)} outstanding` : 'Nothing outstanding'}
            to={`${base}/my-fines`} />
        )}

        {runsLibrary ? (
          <Fig icon="users" tone="violet" label="Active Readers"
            value={wide?.activeReaders ?? 0}
            caption={`of ${wide?.members ?? 0} students & staff`} />
        ) : (
          <Fig icon="star" tone="violet" label="Reservations"
            value={holds.length}
            caption={holds.length ? 'Waiting for you' : 'Nothing on hold'}
            to={`${base}/search`} />
        )}
      </div>

      <div className="liblg-grid">
        <div className="liblg-col">
          <Panel icon="activity" tone="indigo" title="Quick Actions">
            <div className="liblg-acts-grid">
              <Action to={`${base}/search`} icon="search" tone="blue"
                label="Search Books" sub="Find books in library" />
              <Action to={`${base}/my-books`} icon="bookOpen" tone="green"
                label="My Books" sub="View issued books" />
              <Action to={`${base}/my-fines`} icon="banknote" tone="amber"
                label="My Fines" sub="Check pending fines" />
              {runsLibrary && (
                <Action to="/teacher/manage-library/dashboard" icon="settings" tone="violet"
                  label="Manage Library" sub="Add, update books" />
              )}
            </div>
          </Panel>

          <Panel icon="bookOpen" tone="indigo"
            title={runsLibrary ? 'Currently Issued Books' : 'My Issued Books'}
            action={<ViewAll to={runsLibrary ? '/teacher/manage-library/circulation' : `${base}/my-books`} />}>
            <LoanTable rows={loans} showBorrower={runsLibrary}
              empty={runsLibrary
                ? { title: 'No books are out right now', body: 'Issued books appear here as soon as the counter lends one.' }
                : { title: 'You have no books out', body: 'Search the catalogue and reserve a book to get started.' }} />
          </Panel>
        </div>

        <div className="liblg-col">
          <Panel icon="clock" tone="indigo" title="Recent Activity"
            action={<ViewAll to={runsLibrary ? '/teacher/manage-library/circulation' : `${base}/my-books`} />}>
            <Activity items={activity}
              empty={runsLibrary
                ? { title: 'Nothing at the counter yet', body: 'Issues and returns will show up here.' }
                : { title: 'No library activity yet', body: 'Books you borrow and return will show up here.' }} />
          </Panel>

          <Panel icon="chart" tone="violet" title="Popular Categories"
            action={<ViewAll to={`${base}/search`} label="Browse" />}>
            <Categories categories={mine?.categories}
              empty={{ title: 'No categories yet', body: 'Categories appear once books are catalogued.' }} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
