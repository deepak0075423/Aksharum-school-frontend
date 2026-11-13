/**
 * Super Admin → Video Library → Requests.
 *
 * Every school's requests for books and chapters the library lacks, oldest
 * open first. Each one moves pending → under review → approved → in progress
 * → completed (or is rejected, with a reason the school is shown); the school
 * is notified at every step. "Schools asking" counts the other schools that
 * want the same thing.
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { central as api } from '../../../api/video.api';
import { Button, Modal, Alert } from '../../../components/ui/index';
import { ListTabs, ListTable, ListFooter, SearchField, Stack, RowActions, IconAction } from '../../admin/listParts';
import { Head, Loadable, StatusBadge, Icon, day, errText, saveBlob, statusWord, useDebounced } from '../vlParts';
import { RequestDrawer, requestTitle } from '../school/Requests';

const TABS = [{ value: 'open', label: 'Open' }, { value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }];
const NEXT = {
  pending: ['under_review', 'approved', 'rejected'], under_review: ['approved', 'rejected'],
  approved: ['in_progress', 'completed', 'rejected'], in_progress: ['completed', 'rejected'], rejected: [], completed: [],
};

function MoveDialog({ state, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [book, setBook] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setNote(''); setBook(''); setError(''); }, [state]);
  if (!state) return null;
  const { request: r, to } = state;
  const save = async () => {
    if (to === 'rejected' && !note.trim()) return setError('Say why — the school is shown this');
    setSaving(true); setError('');
    try { await api.setRequestStatus(r._id, { status: to, note, ...(book ? { resolvedBook: book } : {}) }); toast.success(`Marked ${statusWord(to).toLowerCase()} — the school has been notified`); onDone(); onClose(); }
    catch (e) { setError(errText(e)); }
    finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Mark as ${statusWord(to).toLowerCase()}`} maxWidth={520}
      footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={to === 'rejected' ? 'danger' : 'primary'} loading={saving} onClick={save}>Mark {statusWord(to).toLowerCase()}</Button></>)}>
      <div className="vl-stack">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <p><b>{requestTitle(r)}</b> <span className="vl-muted">— {r.schoolName}</span></p>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className={`form-label${to === 'rejected' ? ' required' : ''}`} htmlFor="rq-note">{to === 'rejected' ? 'Reason' : 'Note to the school (optional)'}</label>
          <textarea id="rq-note" data-text="sentence" className="form-control" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {to === 'completed' && r.type === 'book' ? (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="rq-book">The book in the library (optional)</label>
            <input id="rq-book" className="form-control" value={book} onChange={(e) => setBook(e.target.value.trim())} placeholder="Paste the book's id from its page address" />
            <div className="form-hint">Recorded with the request so the school can find it.</div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export default function CentralVideoRequests() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('status') || 'open';
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const key = `${tab}|${type}|${term}`;
  useEffect(() => { setPage(1); }, [key]);
  const { data, meta, loading, error, refetch } = useFetch(() => api.requests({ status: tab === 'all' ? undefined : tab, type: type || undefined, search: term || undefined, page, limit }), [key, page, limit]);
  const rows = data || [];
  const [viewing, setViewing] = useState(null);
  const [move, setMove] = useState(null);

  useEffect(() => {
    const id = params.get('focus');
    if (id) api.request(id).then((r) => setViewing(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const reload = async () => { refetch(); if (viewing) { try { setViewing((await api.request(viewing._id)).data); } catch { setViewing(null); } } };
  const attachment = async (r) => { try { saveBlob(await api.requestAttachment(r._id), `request-${r._id.slice(0, 8)}`); } catch (e) { toast.error(errText(e)); } };

  const columns = [
    { key: 'what', label: 'Requested', render: (r) => <Stack main={requestTitle(r)} sub={r.type === 'book' ? [r.publisher, r.edition].filter(Boolean).join(' · ') || 'Book' : `in ${r.bookTitle || r.title}`} /> },
    { key: 'school', label: 'School', render: (r) => <Stack main={r.schoolName} sub={r.requestedByName} /> },
    { key: 'for', label: 'For', render: (r) => <Stack main={r.subjectName} sub={[r.boardName, r.classLabel].filter(Boolean).join(' · ')} /> },
    { key: 'asking', label: 'Schools asking', render: (r) => r.schoolsAsking || 1 },
    { key: 'on', label: 'Requested', render: (r) => day(r.createdAt) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'acts', label: '', className: 'ltable__acts', render: (r) => (
      <RowActions>
        <IconAction icon="eye" label="Open" onClick={() => setViewing(r)} />
        {NEXT[r.status][0] && NEXT[r.status][0] !== 'rejected'
          ? <Button size="sm" variant="secondary" onClick={() => setMove({ request: r, to: NEXT[r.status][0] })}>{statusWord(NEXT[r.status][0])}</Button> : null}
      </RowActions>
    ) },
  ];
  const c = meta?.counts;

  return (
    <div className="page vl-page">
      <Head title="Requests" subtitle="Books and chapters schools have asked for." />
      <Loadable error={error} onRetry={refetch}>
        <section className="card">
          <ListTabs tabs={TABS} value={tab} onChange={(v) => setParams(v === 'open' ? {} : { status: v })}
            counts={{ open: c ? c.pending + c.inHand : undefined, pending: c?.pending, completed: c?.completed, rejected: c?.rejected, all: c?.total }} />
          <div className="ltools">
            <SearchField value={search} onChange={setSearch} placeholder="Search by title, chapter, publisher or school…" />
            <select className={`form-control lsel${type ? ' lfsel--on' : ''}`} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
              <option value="">Books and chapters</option><option value="book">Books</option><option value="chapter">Chapters</option>
            </select>
          </div>
          <ListTable columns={columns} rows={rows} loading={loading} startIndex={(page - 1) * limit}
            emptyIcon="📮" emptyTitle="No requests here" emptyMessage="Requests from schools appear here." />
          <ListFooter page={page} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit} count={rows.length} noun="request"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        </section>
      </Loadable>

      <RequestDrawer request={viewing} onClose={() => setViewing(null)} onAttachment={attachment}>
        {viewing ? NEXT[viewing.status].map((to) => (
          <Button key={to} variant={to === 'rejected' ? 'danger' : to === NEXT[viewing.status][0] ? 'primary' : 'secondary'} onClick={() => setMove({ request: viewing, to })}>
            {to === 'rejected' ? <Icon name="closeCircle" size={16} /> : null} {statusWord(to)}
          </Button>
        )) : null}
      </RequestDrawer>
      <MoveDialog state={move} onClose={() => setMove(null)} onDone={reload} />
    </div>
  );
}
