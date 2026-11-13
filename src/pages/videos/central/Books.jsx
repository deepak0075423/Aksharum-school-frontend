/**
 * Super Admin → Video Library → Books.
 *
 * Every book of the library, filed under Board → Class → Subject. One subject
 * has as many books as there are publishers. A book opens to its own page:
 * chapters, the videos mapped to each, its editions and the schools using it.
 */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { central as api } from '../../../api/video.api';
import { Button, Confirm } from '../../../components/ui/index';
import { ListTabs, ListTable, ListFooter, SearchField, Stack, RowActions, IconAction, RowMenu, MenuItem, MenuSep } from '../../admin/listParts';
import { levelOf } from '../../../utils/classLevels';
import { Head, Loadable, Cover, StatusBadge, Icon, errText, useDebounced } from '../vlParts';
import { BookForm } from './bookParts';

const TABS = [{ value: 'live', label: 'Active and inactive' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'archived', label: 'Archived' }];

export default function CentralVideoBooks() {
  const [params, setParams] = useSearchParams();
  const q = (k) => params.get(k) || '';
  const put = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); if (k === 'board') n.delete('classLevel'); setParams(n); };
  const tab = q('status') || 'live';
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const filterKey = `${q('board')}|${q('classLevel')}|${q('subject')}|${tab}|${term}`;
  useEffect(() => { setPage(1); }, [filterKey]);
  const { data, meta, loading, error, refetch } = useFetch(() => api.books({
    board: q('board') || undefined, classLevel: q('classLevel') || undefined, subject: q('subject') || undefined,
    status: tab === 'live' ? undefined : tab, search: term || undefined, page, limit,
  }), [filterKey, page, limit]);
  const boards = useFetch(() => api.boards());
  const subjects = useFetch(() => api.subjects());
  const rows = data || [];
  const board = (boards.data || []).find((b) => b._id === q('board'));

  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'delete') await api.removeBook(confirm.row._id); else await api.setBookStatus(confirm.row._id, confirm.kind);
      toast.success(confirm.kind === 'delete' ? 'Book deleted' : `Book is now ${confirm.kind}`); setConfirm(null); refetch();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };
  const WORDS = {
    active: ['Activate this book?', 'Activate', (r) => `${r.title} will be offered to schools on its board. Their admins are told the first time a book goes live.`],
    inactive: ['Deactivate this book?', 'Deactivate', (r) => `${r.title} will be hidden from schools and from students until it is activated again.${r.schoolCount ? ` ${r.schoolCount} school(s) follow it now.` : ''}`],
    archived: ['Archive this book?', 'Archive', (r) => `${r.title} will no longer be offered to schools. Sections already following it keep it, with everything their students have watched.`],
    delete: ['Delete this book?', 'Delete', (r) => `${r.title} and its chapters will be removed for good. A book that a school follows, or that has been released or watched, cannot be deleted — archive it instead.`],
  };

  const columns = [
    { key: 'book', label: 'Book', render: (r) => (
      <Link to={`/super-admin/videos/books/${r._id}`} className="vl-row" style={{ color: 'inherit', flexWrap: 'nowrap' }}>
        <Cover src={r.coverUrl} title={r.title} />
        <span style={{ minWidth: 0 }}><span className="lstack__main" style={{ color: 'var(--primary)' }}>{r.title}</span>
          <span className="lstack__sub" style={{ display: 'block' }}>{[r.publisher, r.edition, r.publicationYear].filter(Boolean).join(' · ') || r.language}</span></span>
      </Link>) },
    { key: 'where', label: 'Board · Class', render: (r) => <Stack main={r.boardCode} sub={levelOf(r.classLevel)?.label || `Class ${r.classLevel}`} /> },
    { key: 'subject', label: 'Subject', render: (r) => r.subjectName },
    { key: 'content', label: 'Content', render: (r) => <Stack main={`${r.chapterCount} chapters`} sub={`${r.videoCount} videos`} /> },
    { key: 'schools', label: 'Schools', render: (r) => r.schoolCount },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'acts', label: '', className: 'ltable__acts', render: (r) => (
      <RowActions>
        <Link to={`/super-admin/videos/books/${r._id}`} className="btn btn-secondary btn-sm">Open</Link>
        <RowMenu>
          {r.status !== 'active' ? <MenuItem icon="checkCircle" onClick={() => setConfirm({ kind: 'active', row: r })}>Activate</MenuItem> : null}
          {r.status === 'active' ? <MenuItem icon="eyeOff" onClick={() => setConfirm({ kind: 'inactive', row: r })}>Deactivate</MenuItem> : null}
          {r.status !== 'archived' ? <MenuItem icon="archive" onClick={() => setConfirm({ kind: 'archived', row: r })}>Archive</MenuItem> : null}
          <MenuSep /><MenuItem icon="trash" danger onClick={() => setConfirm({ kind: 'delete', row: r })}>Delete</MenuItem>
        </RowMenu>
      </RowActions>
    ) },
  ];
  const c = meta?.counts;
  const anyFilter = q('board') || q('classLevel') || q('subject') || term;

  return (
    <div className="page vl-page">
      <Head title="Books" subtitle="Board → Class → Subject → Book. One subject can have many books.">
        <Button onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add book</Button>
      </Head>
      <Loadable error={error} onRetry={refetch}>
        <section className="card">
          <ListTabs tabs={TABS} value={tab} onChange={(v) => put('status', v === 'live' ? '' : v)}
            counts={{ live: c ? c.active + c.inactive : undefined, active: c?.active, inactive: c?.inactive, archived: c?.archived }} />
          <div className="ltools">
            <SearchField value={search} onChange={setSearch} placeholder="Search by title, publisher, author or ISBN…" />
            <select className={`form-control lsel${q('board') ? ' lfsel--on' : ''}`} value={q('board')} onChange={(e) => put('board', e.target.value)} aria-label="Board">
              <option value="">All boards</option>{(boards.data || []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
            <select className={`form-control lsel${q('classLevel') ? ' lfsel--on' : ''}`} value={q('classLevel')} onChange={(e) => put('classLevel', e.target.value)} aria-label="Class" disabled={!board}>
              <option value="">{board ? 'All classes' : 'Choose a board first'}</option>
              {[...(board?.classLevels || [])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{levelOf(n)?.label || `Class ${n}`}</option>)}
            </select>
            <select className={`form-control lsel${q('subject') ? ' lfsel--on' : ''}`} value={q('subject')} onChange={(e) => put('subject', e.target.value)} aria-label="Subject">
              <option value="">All subjects</option>{(subjects.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            {anyFilter ? <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setParams(tab === 'live' ? {} : { status: tab }); }}><Icon name="refresh" size={14} /> Reset</Button> : null}
          </div>
          <ListTable columns={columns} rows={rows} loading={loading} startIndex={(page - 1) * limit}
            emptyIcon="📚" emptyTitle={anyFilter || tab !== 'live' ? 'No books match' : 'No books yet'}
            emptyMessage={anyFilter || tab !== 'live' ? 'Try another filter or search.' : 'Add the first book. It needs a board, a class and a subject mapped to them.'}
            emptyAction={!anyFilter && tab === 'live' ? <Button onClick={() => setAdding(true)}>Add book</Button> : null} />
          <ListFooter page={page} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit} count={rows.length} noun="book"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        </section>
      </Loadable>

      <BookForm open={adding} mode="add" boards={(boards.data || []).filter((b) => b.isActive)} subjects={subjects.data || []}
        preset={{ board: q('board'), classLevel: q('classLevel'), subject: q('subject') }} onClose={() => setAdding(false)} onSaved={refetch} />
      <Confirm open={!!confirm} loading={busy} onClose={() => setConfirm(null)} onConfirm={run}
        title={confirm ? WORDS[confirm.kind][0] : ''} confirmLabel={confirm ? WORDS[confirm.kind][1] : ''} message={confirm ? WORDS[confirm.kind][2](confirm.row) : ''} />
    </div>
  );
}
