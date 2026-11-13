/**
 * Student → Video Learning → watch history.
 *
 * Every video the student has played, most recent first — kept even after the
 * teacher has taken the content down, in which case it can no longer be opened.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { student as api } from '../../../api/video.api';
import { ListTable, ListFooter, Stack } from '../../admin/listParts';
import { Head, Loadable, Meter, StatusBadge, Icon, dayTime, spent } from '../vlParts';

export default function StudentVideoHistory() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const { data, meta, loading, error, refetch } = useFetch(() => api.history({ page, limit }), [page, limit]);
  const rows = data || [];

  const columns = [
    { key: 'video', label: 'Video', render: (r) => <Stack main={r.title} sub={`Chapter ${r.chapterNumber}: ${r.chapterTitle}`} /> },
    { key: 'book', label: 'Book', render: (r) => <Stack main={r.bookTitle} sub={r.subjectName} /> },
    { key: 'pct', label: 'Watched', render: (r) => <span style={{ display: 'block', minWidth: 130 }}><Meter percent={r.status === 'completed' ? 100 : r.watchedPercent} small /></span> },
    { key: 'time', label: 'Time spent', render: (r) => <Stack main={spent(r.watchedSeconds)} sub={`${r.sessionsCount} sitting${r.sessionsCount === 1 ? '' : 's'}`} /> },
    { key: 'last', label: 'Last watched', render: (r) => dayTime(r.lastWatchedAt) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'open', label: '', render: (r) => (r.stillAvailable
      ? <Link to={`/student/videos/watch/${r.chapterVideo}`} className="btn btn-secondary btn-sm">{r.status === 'completed' ? 'Watch again' : 'Resume'}</Link>
      : <span className="vl-small vl-muted">No longer available</span>) },
  ];

  return (
    <div className="page vl-page">
      <Head title="Watch history" subtitle="Every video you have played, most recent first">
        <Link to="/student/videos" className="btn btn-secondary"><Icon name="arrowLeft" size={16} /> Video Learning</Link>
      </Head>
      <Loadable error={error} onRetry={refetch}>
        <section className="card">
          <ListTable columns={columns} rows={rows} loading={loading} startIndex={(page - 1) * limit}
            emptyIcon="🎬" emptyTitle="Nothing watched yet" emptyMessage="Videos you play will be listed here." />
          <ListFooter page={page} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit} count={rows.length} noun="video"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        </section>
      </Loadable>
    </div>
  );
}
