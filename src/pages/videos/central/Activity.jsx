/**
 * Super Admin → Video Library → Activity.
 * The library's audit history: every change to boards, subjects, books,
 * chapters, videos, mappings, providers and settings, and who made it.
 */
import React, { useEffect, useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import { central as api } from '../../../api/video.api';
import { ListTable, ListFooter, SearchField, Stack } from '../../admin/listParts';
import { Head, Loadable, dayTime, useDebounced } from '../vlParts';

const TYPES = ['board', 'subject', 'book', 'chapter', 'video', 'provider', 'settings'];

export default function CentralVideoActivity() {
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  useEffect(() => { setPage(1); }, [term, type]);
  const { data, meta, loading, error, refetch } = useFetch(() => api.audit({ search: term || undefined, entityType: type || undefined, page, limit }), [term, type, page, limit]);
  const rows = data || [];
  const columns = [
    { key: 'when', label: 'When', render: (r) => dayTime(r.createdAt) },
    { key: 'what', label: 'What happened', render: (r) => <Stack main={r.summary || r.action} sub={r.action} /> },
    { key: 'type', label: 'About', render: (r) => <span style={{ textTransform: 'capitalize' }}>{r.entityType}</span> },
    { key: 'who', label: 'By', render: (r) => r.actorName || 'System' },
  ];
  return (
    <div className="page vl-page">
      <Head title="Activity" subtitle="Every change made to the central library, newest first." />
      <Loadable error={error} onRetry={refetch}>
        <section className="card">
          <div className="ltools">
            <SearchField value={search} onChange={setSearch} placeholder="Search the history…" />
            <select className={`form-control lsel${type ? ' lfsel--on' : ''}`} value={type} onChange={(e) => setType(e.target.value)} aria-label="About">
              <option value="">Everything</option>
              {TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}s</option>)}
            </select>
          </div>
          <ListTable columns={columns} rows={rows} loading={loading} startIndex={(page - 1) * limit} emptyIcon="🧾" emptyTitle="No activity to show" />
          <ListFooter page={page} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit} count={rows.length} noun="entry" plural="entries"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        </section>
      </Loadable>
    </div>
  );
}
