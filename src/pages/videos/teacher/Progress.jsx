/**
 * Teacher → Video Learning → Progress.
 *
 * How the teacher's own students are getting on with what has been released
 * to them. Everything is counted from what each student was GIVEN, so "not
 * started" is a real number. The figures, the chapter and book tables and the
 * student list all answer to the same filters, which live in the address —
 * a notification or a link can open the page already filtered.
 */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { teacher as api } from '../../../api/video.api';
import { Button, Empty } from '../../../components/ui/index';
import { ListStats, ListStat, ListTable, ListFooter, SearchField, Stack, Who } from '../../admin/listParts';
import { Head, Panel, Loadable, Meter, StatusBadge, Icon, dayTime, spent, errText, saveBlob, useDebounced } from '../vlParts';

const FILTERS = ['academicYear', 'class', 'section', 'subject', 'book', 'chapter', 'from', 'to'];

export default function TeacherVideoProgress() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) || '']).filter(([, v]) => v));
  const filterKey = JSON.stringify(filters);
  const status = params.get('status') || '';
  const [fresh, setFresh] = useState(0);

  const { data, loading, error, refetch } = useFetch(() => api.analytics({ ...filters, ...(fresh ? { fresh: 1 } : {}) }), [filterKey, fresh]);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  useEffect(() => { setPage(1); }, [filterKey, status, term]);
  const list = useFetch(() => api.students({ ...filters, status: status || undefined, search: term || undefined, page, limit }), [filterKey, status, term, page, limit, fresh]);
  const [exporting, setExporting] = useState('');

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    // A class or book that no longer matches the section chosen above it is dropped.
    if (key === 'class') next.delete('section');
    if (key === 'book') next.delete('chapter');
    setParams(next);
  };
  const clear = () => setParams({});

  const exportAs = async (format) => {
    setExporting(format);
    try { saveBlob(await api.exportClass({ ...filters, format }), `video-progress.${format}`); }
    catch (e) { toast.error(errText(e)); }
    finally { setExporting(''); }
  };

  const o = data?.options;
  const st = data?.students;
  const sections = (o?.sections || []).filter((s) => !filters.class || String(s.class) === filters.class);
  const chapters = (data?.chapters || []).filter((c) => !filters.book || String(c.book) === filters.book);
  const active = Object.keys(filters).length + (status ? 1 : 0);

  const tile = (key) => ({ on: status === key, onClick: () => set('status', status === key ? '' : key) });
  const columns = [
    { key: 'student', label: 'Student', render: (r) => <Who name={r.name} sub={r.rollNumber ? `Roll no ${r.rollNumber}` : r.admissionNumber} to={`/teacher/videos/progress/students/${r._id}`} /> },
    { key: 'section', label: 'Section', render: (r) => `${r.className} ${r.sectionName}` },
    { key: 'videos', label: 'Videos', render: (r) => <Stack main={`${r.completed} of ${r.videos} completed`} sub={`${r.started} started`} /> },
    { key: 'pct', label: 'Progress', render: (r) => <span style={{ display: 'block', minWidth: 130 }}><Meter percent={r.percent} small /></span> },
    { key: 'time', label: 'Watch time', render: (r) => spent(r.watchSeconds) },
    { key: 'last', label: 'Last watched', render: (r) => (r.lastWatchedAt ? dayTime(r.lastWatchedAt) : <span className="vl-muted">Never</span>) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'open', label: '', className: 'ltable__acts', render: (r) => <Link to={`/teacher/videos/progress/students/${r._id}`} className="btn btn-secondary btn-sm">Report</Link> },
  ];

  const select = (label, key, options, all) => (
    <select className={`form-control lsel${filters[key] ? ' lfsel--on' : ''}`} value={filters[key] || ''} onChange={(e) => set(key, e.target.value)} aria-label={label}>
      <option value="">{all}</option>
      {options.map((x) => <option key={x._id} value={x._id}>{x.name || x.title}</option>)}
    </select>
  );

  return (
    <div className="page vl-page">
      <Head title="Progress" subtitle="How your students are getting on with the books, chapters and videos you have released.">
        <Button variant="secondary" onClick={() => { setFresh((n) => n + 1); }}><Icon name="refresh" size={16} /> Refresh</Button>
        <Button variant="secondary" loading={exporting === 'xlsx'} onClick={() => exportAs('xlsx')}><Icon name="fileSheet" size={16} /> Excel</Button>
        <Button variant="secondary" loading={exporting === 'pdf'} onClick={() => exportAs('pdf')}><Icon name="filePdf" size={16} /> PDF</Button>
      </Head>

      <Loadable loading={loading && !data} error={error} onRetry={refetch}>
        {data && !o.sections.length ? (
          <div className="vl-card"><Empty icon="🧑‍🏫" title="No subject is assigned to you yet" message="Progress appears for the sections where you are the subject teacher." /></div>
        ) : data ? (
          <>
            <section className="card">
              <div className="ltools">
                {o.years.length > 1 ? select('Academic year', 'academicYear', o.years, 'All years') : null}
                {select('Class', 'class', o.classes, 'All classes')}
                {select('Section', 'section', sections, 'All sections')}
                {select('Subject', 'subject', o.subjects, 'All subjects')}
                {select('Book', 'book', o.books, 'All books')}
                {filters.book && chapters.length
                  ? select('Chapter', 'chapter', chapters.map((c) => ({ _id: c.chapter, name: `Chapter ${c.chapterNumber}: ${c.title}` })), 'All chapters') : null}
                <label className="vl-row vl-small vl-muted" style={{ gap: 6 }}>Released from
                  <input type="date" className="form-control lsel" value={filters.from || ''} onChange={(e) => set('from', e.target.value)} aria-label="Released from" /></label>
                <label className="vl-row vl-small vl-muted" style={{ gap: 6 }}>to
                  <input type="date" className="form-control lsel" value={filters.to || ''} min={filters.from || undefined} onChange={(e) => set('to', e.target.value)} aria-label="Released to" /></label>
                {active ? <Button variant="secondary" size="sm" onClick={clear}><Icon name="refresh" size={14} /> Reset</Button> : null}
              </div>
            </section>

            <div className="vl-five"><ListStats>
              <ListStat icon="users" tone="indigo" value={data.assignedStudents} label="Assigned students" caption={`${st.studentsWithContent} have released content`} />
              <ListStat icon="film" tone="blue" value={data.content.releasedVideos} label="Released videos" caption={`${data.content.releasedChapters} chapters · ${data.content.books} books`} />
              <ListStat icon="trending" tone="teal" value={st.started} label="Started watching" caption={`${st.inProgress} in progress`} {...tile('in_progress')} />
              <ListStat icon="checkCircle" tone="green" value={st.completed} label="Completed everything" caption="All released videos watched" {...tile('completed')} />
              <ListStat icon="alert" tone="amber" value={st.notStarted} label="Not started" caption="Nothing watched yet" {...tile('not_started')} />
            </ListStats></div>

            <div className="vl-two">
              <Panel title="Chapter-wise completion" flush>
                {chapters.length ? (
                  <div className="table-wrap"><table className="table ltable">
                    <thead><tr><th>Chapter</th><th>Videos</th><th>Students</th><th style={{ minWidth: 160 }}>Completion</th><th /></tr></thead>
                    <tbody>{chapters.map((c) => (
                      <tr key={c.chapter}>
                        <td><Stack main={`Chapter ${c.chapterNumber}: ${c.title}`} sub={c.bookTitle} /></td>
                        <td>{c.videos}</td><td>{c.students}</td>
                        <td><Meter percent={c.total ? (c.completed / c.total) * 100 : 0} small label={`Completion of chapter ${c.chapterNumber}`} /></td>
                        <td className="ltable__acts"><button type="button" className="vl-link" onClick={() => { const n = new URLSearchParams(params); n.set('book', c.book); n.set('chapter', c.chapter); setParams(n); }}>Filter</button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                ) : <Empty icon="📖" title="Nothing released for these filters" message="Chapter figures appear once content is released." />}
              </Panel>
              <Panel title="Book-wise completion" flush>
                {data.books.length ? (
                  <div className="table-wrap"><table className="table ltable">
                    <thead><tr><th>Book</th><th style={{ minWidth: 140 }}>Completion</th></tr></thead>
                    <tbody>{data.books.map((b) => (
                      <tr key={b.book}>
                        <td><Stack main={b.title} sub={`${b.videos} videos · ${b.students} students`} /></td>
                        <td><Meter percent={b.total ? (b.completed / b.total) * 100 : 0} small label={`Completion of ${b.title}`} /></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                ) : <Empty icon="📚" title="No books in view" />}
              </Panel>
            </div>

            <section className="card">
              <div className="ltools">
                <SearchField value={search} onChange={setSearch} placeholder="Search students by name or admission number…" />
                <select className={`form-control lsel${status ? ' lfsel--on' : ''}`} value={status} onChange={(e) => set('status', e.target.value)} aria-label="Status">
                  <option value="">All statuses</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
                </select>
              </div>
              <Loadable error={list.error} onRetry={list.refetch}>
                <ListTable columns={columns} rows={list.data || []} loading={list.loading} startIndex={(page - 1) * limit}
                  emptyIcon="🎓" emptyTitle="No students to show"
                  emptyMessage={active || term ? 'No student matches these filters.' : 'Students appear here once something is released to their section.'} />
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
