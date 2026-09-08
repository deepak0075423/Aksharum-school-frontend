/**
 * Library → Dashboard.
 *
 * The counter in one screen, laid out as the module's design has it: five
 * figures across the top, then circulation beside the collection and the
 * counter's own shortcuts, then what was issued and what is late.
 *
 * One request builds all of it. The tiles, the category split and the twelve
 * weeks of circulation are cached per school for a minute (they barely move);
 * the two lists underneath are read live on every load, because "what is
 * overdue right now" is the question this page exists to answer.
 *
 * The same page serves school admins at /admin/library and teachers with the
 * Librarian designation at /teacher/manage-library — every link below is built
 * off whichever of those the reader came in through.
 */
import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getDashboard } from '../../../api/library.api';
import { Alert, Spinner } from '../../../components/ui/index';
import {
  Actions, CategoryDonut, Hero, InspirationCard, OverdueList, Panel, RecentTable,
  Tile, WeekBars, delta, fmtMoney, note, quoteOfTheDay,
} from './dashParts';

const RANGES = [
  { weeks: 4,  label: 'Last 4 weeks' },
  { weeks: 8,  label: 'Last 8 weeks' },
  { weeks: 12, label: 'Last 12 weeks' },
];

export default function LibraryDashboard() {
  const { data, loading, error } = useFetch(getDashboard);
  const base = useLocation().pathname.startsWith('/teacher') ? '/teacher/manage-library' : '/admin/library';
  const [weeks, setWeeks] = useState(8);

  const d = data || {};
  // The server always sends twelve weeks, so the range picker is a slice rather
  // than another round trip.
  const series = useMemo(() => (d.circulation || []).slice(-weeks), [d.circulation, weeks]);
  const heroQuote = useMemo(() => quoteOfTheDay(0), []);
  const readQuote = useMemo(() => quoteOfTheDay(1), []);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page libdpg">
      <Hero
        tagline="Discover · Learn · Grow"
        subtitle="What the collection holds, what is out on loan, and what needs chasing today."
        quote={heroQuote} />

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="libd-tiles">
        <Tile icon="book" tone="indigo" to={`${base}/books`}
          value={d.totalBooks ?? 0} label="Total books" caption="Titles catalogued"
          trend={d.booksThisMonth ? note(`${d.booksThisMonth} this month`) : note('None added this month')} />

        <Tile icon="library" tone="blue" to={`${base}/books`}
          value={d.totalCopies ?? 0} label="Total copies" caption={`${d.availableCopies ?? 0} on the shelf`}
          trend={d.copiesThisMonth ? note(`${d.copiesThisMonth} this month`) : note('None added this month')} />

        <Tile icon="repeat" tone="green" to={`${base}/circulation`}
          value={d.issuedCopies ?? 0} label="Issued out" caption={`${d.issuedThisMonth ?? 0} issued this month`}
          trend={delta(d.issuedThisMonth || 0, d.issuedLastMonth || 0, 'last month')} />

        <Tile icon="alert" tone={d.overdue ? 'pink' : 'green'} to={`${base}/circulation?status=overdue`}
          value={d.overdue ?? 0} label="Overdue" caption={d.overdue ? 'Past the due date' : 'All within loan'}
          trend={delta(d.overdue || 0, d.overdueLastWeek || 0, 'last week')} />

        <Tile icon="clock" tone="amber" to={`${base}/reservations`}
          value={d.reservations ?? 0} label="Reservations" caption="Queued and held"
          trend={delta(d.reservations || 0, d.reservationsLastWeek || 0, 'last week')} />
      </div>

      <div className="libd-row">
        <Panel icon="chart" tone="indigo" title="Circulation overview"
          subtitle="Books issued against books returned, by week"
          to={`${base}/circulation`} linkLabel="Circulation">
          <div className="libd-range">
            {RANGES.map((r) => (
              <button key={r.weeks} type="button" aria-pressed={weeks === r.weeks}
                className={`libd-range__btn${weeks === r.weeks ? ' is-on' : ''}`}
                onClick={() => setWeeks(r.weeks)}>{r.label}</button>
            ))}
          </div>
          <WeekBars weeks={series} />
        </Panel>

        <Panel icon="layers" tone="blue" title="Book categories"
          subtitle={d.categories?.length
            ? `${d.categories.length} categor${d.categories.length === 1 ? 'y' : 'ies'}`
            : 'Nothing catalogued yet'}
          to={`${base}/books`} linkLabel="View all">
          <CategoryDonut categories={d.categories} total={d.totalBooks} to={`${base}/books`} />
        </Panel>

        <Panel icon="sparkle" tone="purple" title="Quick actions">
          <Actions items={[
            { icon: 'repeat',   tone: 'indigo', label: 'Issue / return book', sub: 'At the counter',            to: `${base}/circulation` },
            { icon: 'plus',     tone: 'blue',   label: 'Add new book',        sub: 'Catalogue a title',         to: `${base}/books` },
            { icon: 'clock',    tone: 'amber',  label: 'Manage reservations', sub: 'Queue and holds',           to: `${base}/reservations` },
            // The fine total has no tile of its own, so it rides here where it
            // is actually acted on.
            { icon: 'banknote', tone: 'green',  label: 'Collect fine',
              sub: d.pendingFines
                ? `${d.pendingFines} unpaid · ${fmtMoney(d.pendingFineTotal)}`
                : 'Nothing owed',                                                                              to: `${base}/fines` },
            { icon: 'chart',    tone: 'purple', label: 'View reports',        sub: 'Overdue, popular, stock',   to: `${base}/reports` },
          ]} />
        </Panel>
      </div>

      <div className="libd-row libd-row--bottom">
        <Panel icon="repeat" tone="green" title="Recent issuances"
          subtitle="The last ten across the counter"
          to={`${base}/circulation`}>
          <RecentTable rows={d.recent} />
        </Panel>

        <div className="libd-col">
          <Panel icon="alert" tone={d.overdue ? 'pink' : 'green'} title="Overdue books"
            subtitle={d.overdue ? 'Longest overdue first' : 'Nothing to chase'}
            to={`${base}/reports`} linkLabel="Register">
            <OverdueList rows={d.overdueList} />
          </Panel>

          <InspirationCard quote={readQuote} />
        </div>
      </div>
    </div>
  );
}
