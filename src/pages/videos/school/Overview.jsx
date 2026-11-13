/**
 * Admin → Video Learning → Overview.
 *
 * Where the school stands: what it has set up, what teachers have released,
 * and how students are getting on — section by section and book by book.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { school as api } from '../../../api/video.api';
import { Button, Empty, Alert } from '../../../components/ui/index';
import { ListStats, ListStat, ListTable, ListFooter, SearchField, Stack, Who } from '../../admin/listParts';
import { Head, Panel, Loadable, Meter, StatusBadge, Icon, dayTime, spent, useDebounced } from '../vlParts';

export default function SchoolVideoOverview() {
  const [fresh, setFresh] = useState(0);
  const [section, setSection] = useState('');
  const { data, loading, error, refetch } = useFetch(() => api.analytics({ ...(section ? { section } : {}), ...(fresh ? { fresh: 1 } : {}) }), [section, fresh]);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  useEffect(() => { setPage(1); }, [section, status, term]);
  const list = useFetch(() => api.students({ section: section || undefined, status: status || undefined, search: term || undefined, page, limit }), [section, status, term, page, limit, fresh]);

  const st = data?.students; const setup = data?.setup;
  const columns = [
    { key: 'student', label: 'Student', render: (r) => <Who name={r.name} sub={r.rollNumber ? `Roll no ${r.rollNumber}` : r.admissionNumber} /> },
    { key: 'section', label: 'Section', render: (r) => `${r.className} ${r.sectionName}` },
    { key: 'videos', label: 'Videos', render: (r) => <Stack main={`${r.completed} of ${r.videos} completed`} sub={`${r.started} started`} /> },
    { key: 'pct', label: 'Progress', render: (r) => <span style={{ display: 'block', minWidth: 130 }}><Meter percent={r.percent} small /></span> },
    { key: 'time', label: 'Watch time', render: (r) => spent(r.watchSeconds) },
    { key: 'last', label: 'Last watched', render: (r) => (r.lastWatchedAt ? dayTime(r.lastWatchedAt) : <span className="vl-muted">Never</span>) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="page vl-page">
      <Head title="Video Learning" subtitle="What the school follows, what teachers have released, and how students are getting on.">
        <Button variant="secondary" onClick={() => setFresh((n) => n + 1)}><Icon name="refresh" size={16} /> Refresh</Button>
        <Link to="/admin/videos/setup" className="btn btn-primary"><Icon name="settings" size={16} /> Setup</Link>
      </Head>

      <Loadable loading={loading && !data} error={error} onRetry={refetch}>
        {data ? (
          <>
            {!setup.booksFollowed ? (
              <Alert variant="warning">
                No books are assigned yet, so teachers have nothing to release. <Link to="/admin/videos/setup">Choose your board, subjects and books</Link> to get started.
              </Alert>
            ) : null}

            <div className="vl-five"><ListStats>
              <ListStat icon="bookOpen" tone="indigo" value={setup.booksFollowed} label="Books followed" caption={`${setup.subjectsSelected} subject selections · ${setup.classesConfigured} classes`} to="/admin/videos/setup" />
              <ListStat icon="send" tone="blue" value={setup.liveReleases} label="Live releases" caption={`${data.content.releasedVideos} videos open to students`} />
              <ListStat icon="trending" tone="teal" value={st.started} label="Students watching" caption={`${st.notStarted} have not started`} />
              <ListStat icon="checkCircle" tone="green" value={st.completed} label="Completed everything" caption={`${spent(st.watchSeconds)} watched in all`} />
              <ListStat icon="mail" tone="amber" value={setup.openRequests} label="Open requests" caption="Books and chapters asked for" to="/admin/videos/requests" />
            </ListStats></div>

            <div className="vl-two">
              <Panel title="Section by section" subtitle="Students who have been given something to watch" flush>
                {data.sections.length ? (
                  <div className="table-wrap"><table className="table ltable">
                    <thead><tr><th>Section</th><th>Students</th><th>Started</th><th>Completed</th><th style={{ minWidth: 140 }}>Average progress</th><th /></tr></thead>
                    <tbody>{data.sections.map((s) => (
                      <tr key={s.section} className={section === s.section ? 'is-picked' : undefined}>
                        <td><b>{s.className} {s.sectionName}</b></td><td>{s.students}</td><td>{s.started}</td><td>{s.completed}</td>
                        <td><Meter percent={s.percent} small label={`Average progress in ${s.className} ${s.sectionName}`} /></td>
                        <td className="ltable__acts"><button type="button" className="vl-link" onClick={() => setSection(section === s.section ? '' : s.section)}>{section === s.section ? 'Show all' : 'Filter'}</button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                ) : <Empty icon="📤" title="Nothing has been released yet" message="Figures appear once teachers release books, chapters or videos to their sections." />}
              </Panel>
              <Panel title="Book by book" flush>
                {data.books.length ? (
                  <div className="table-wrap"><table className="table ltable">
                    <thead><tr><th>Book</th><th style={{ minWidth: 130 }}>Completion</th></tr></thead>
                    <tbody>{data.books.map((b) => (
                      <tr key={b.book}><td><Stack main={b.title} sub={`${b.videos} videos · ${b.students} students`} /></td>
                        <td><Meter percent={b.total ? (b.completed / b.total) * 100 : 0} small label={`Completion of ${b.title}`} /></td></tr>
                    ))}</tbody>
                  </table></div>
                ) : <Empty icon="📚" title="No books in view" />}
              </Panel>
            </div>

            <section className="card">
              <div className="ltools">
                <SearchField value={search} onChange={setSearch} placeholder="Search students by name or admission number…" />
                <select className={`form-control lsel${section ? ' lfsel--on' : ''}`} value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section">
                  <option value="">All sections</option>
                  {data.sections.map((s) => <option key={s.section} value={s.section}>{s.className} {s.sectionName}</option>)}
                </select>
                <select className={`form-control lsel${status ? ' lfsel--on' : ''}`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                  <option value="">All statuses</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
                </select>
              </div>
              <Loadable error={list.error} onRetry={list.refetch}>
                <ListTable columns={columns} rows={list.data || []} loading={list.loading} startIndex={(page - 1) * limit}
                  emptyIcon="🎓" emptyTitle="No students to show" emptyMessage="Students appear here once something is released to their section." />
                <ListFooter page={page} pages={list.meta?.pages || 1} total={list.meta?.total || 0} limit={limit} count={(list.data || []).length} noun="student"
                  onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
              </Loadable>
            </section>
          </>
        ) : null}
      </Loadable>
    </div>
  );
}
