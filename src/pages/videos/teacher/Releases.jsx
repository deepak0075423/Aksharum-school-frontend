/**
 * Teacher → Video Learning → Releases.
 *
 * Everything this teacher has released, in three piles: open now, scheduled,
 * and history (expired, taken down, revoked). From here a release is edited,
 * taken down, put back, revoked or released again — and each of those is kept
 * in the release's own history. None of them removes what a student watched.
 */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { teacher as api } from '../../../api/video.api';
import { Button, Modal, Confirm, Alert, Spinner } from '../../../components/ui/index';
import { ListTabs, ListTable, ListFooter, Stack, RowActions, IconAction, RowMenu, MenuItem, MenuSep, Drawer, DrawerHead, DrawerSection } from '../../admin/listParts';
import { Head, Loadable, StatusBadge, Icon, dayTime, errText } from '../vlParts';
import { ReleaseDialog, releaseWhat, LEVEL_WORD } from './releaseParts';

const TABS = [{ value: 'active', label: 'Open now' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'history', label: 'History' }];

export default function TeacherVideoReleases() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'active';
  const book = params.get('book') || '';
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { data, meta, loading, error, refetch } = useFetch(() => api.releases({ tab, book: book || undefined, page, limit }), [tab, book, page, limit]);
  const rows = data || [];

  const [editing, setEditing] = useState(null);
  const [again, setAgain] = useState(null);
  const [confirm, setConfirm] = useState(null);     // { kind: 'unpublish'|'publish', row }
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const pick = (key, value) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); setPage(1); };

  const act = async (fn, done) => {
    setBusy(true);
    try { await fn(); toast.success(done); setConfirm(null); setRevoking(null); setReason(''); refetch(); }
    catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  const openDetail = async (row) => {
    setDetail(row); setDetailLoading(true);
    try { const res = await api.release(row._id); setDetail(res.data); }
    catch (e) { toast.error(errText(e)); }
    finally { setDetailLoading(false); }
  };

  const columns = [
    { key: 'what', label: 'Released', render: (r) => <Stack main={releaseWhat(r)} sub={r.bookTitle} /> },
    { key: 'level', label: 'Level', render: (r) => LEVEL_WORD[r.level] },
    { key: 'to', label: 'To', render: (r) => <Stack main={`${r.className} ${r.sectionName}`} sub={r.audience === 'all' ? 'Whole section' : `${r.selectedCount} selected student${r.selectedCount === 1 ? '' : 's'}`} /> },
    { key: 'from', label: tab === 'scheduled' ? 'Opens' : 'Opened', render: (r) => dayTime(r.releaseAt) },
    { key: 'until', label: 'Closes', render: (r) => (r.expiresAt ? dayTime(r.expiresAt) : <span className="vl-muted">No end date</span>) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.shownStatus} /> },
    { key: 'acts', label: '', className: 'ltable__acts', render: (r) => {
      const live = r.shownStatus === 'active' || r.shownStatus === 'scheduled';
      return (
        <RowActions>
          <IconAction icon="eye" label="Details and history" onClick={() => openDetail(r)} />
          {live ? <IconAction icon="pencil" label="Edit" onClick={() => setEditing(r)} /> : null}
          <RowMenu>
            {live ? <MenuItem icon="eyeOff" onClick={() => setConfirm({ kind: 'unpublish', row: r })}>Unpublish</MenuItem> : null}
            {r.status === 'unpublished' ? <MenuItem icon="send" onClick={() => setConfirm({ kind: 'publish', row: r })}>Publish again</MenuItem> : null}
            {!live ? <MenuItem icon="repeat" onClick={() => setAgain(r)}>Release again…</MenuItem> : null}
            {r.status !== 'revoked' && r.shownStatus !== 'expired' ? (<><MenuSep /><MenuItem icon="closeCircle" danger onClick={() => { setReason(''); setRevoking(r); }}>Revoke access…</MenuItem></>) : null}
          </RowMenu>
        </RowActions>
      );
    } },
  ];

  return (
    <div className="page vl-page">
      <Head title="Releases" subtitle="What you have opened to your students, what is scheduled, and what has ended." />
      {book ? (
        <Alert variant="info">Showing the releases of one book. <button type="button" className="vl-link" onClick={() => pick('book', '')}>Show all books</button></Alert>
      ) : null}
      <Loadable error={error} onRetry={refetch}>
        <section className="card">
          <ListTabs tabs={TABS} value={tab} onChange={(v) => pick('tab', v === 'active' ? '' : v)}
            counts={{ active: meta?.counts?.active, scheduled: meta?.counts?.scheduled, history: meta?.counts?.history }} />
          <ListTable columns={columns} rows={rows} loading={loading} startIndex={(page - 1) * limit}
            emptyIcon={tab === 'history' ? '🗂️' : '📤'}
            emptyTitle={tab === 'active' ? 'Nothing is released right now' : tab === 'scheduled' ? 'Nothing is scheduled' : 'No past releases'}
            emptyMessage={tab === 'history' ? 'Releases that expire, are taken down or are revoked are kept here.' : 'Open one of your books to release a chapter, a video or the whole book.'} />
          <ListFooter page={page} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit} count={rows.length} noun="release"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        </section>
      </Loadable>

      <ReleaseDialog open={!!editing} editing={editing} onClose={() => setEditing(null)} onDone={refetch} />
      <ReleaseDialog open={!!again} again={again} onClose={() => setAgain(null)} onDone={() => { pick('tab', ''); refetch(); }} />

      <Confirm open={!!confirm} loading={busy} onClose={() => setConfirm(null)}
        title={confirm?.kind === 'publish' ? 'Publish again?' : 'Unpublish this release?'}
        confirmLabel={confirm?.kind === 'publish' ? 'Publish' : 'Unpublish'}
        message={confirm?.kind === 'publish'
          ? `${confirm ? releaseWhat(confirm.row) : ''} will open to ${confirm?.row.className} ${confirm?.row.sectionName} again.`
          : `${confirm ? releaseWhat(confirm.row) : ''} will close for ${confirm?.row.className} ${confirm?.row.sectionName} straight away, including for anyone watching now. Their watch progress is kept, and you can publish it again later.`}
        onConfirm={() => act(() => (confirm.kind === 'publish' ? api.publish(confirm.row._id) : api.unpublish(confirm.row._id)), confirm.kind === 'publish' ? 'Published again' : 'Unpublished')} />

      <Modal open={!!revoking} onClose={() => setRevoking(null)} title="Revoke access?" maxWidth={480}
        footer={(<><Button variant="secondary" onClick={() => setRevoking(null)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={() => act(() => api.revoke(revoking._id, reason), 'Access revoked')}>Revoke access</Button></>)}>
        <div className="vl-stack">
          <p className="vl-muted">
            {revoking ? releaseWhat(revoking) : ''} will close for {revoking?.className} {revoking?.sectionName} for good — a revoked release cannot be published again, only released afresh.
            Students keep the record of what they have watched.
          </p>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="vl-revoke-reason">Reason (optional, kept in the history)</label>
            <input id="vl-revoke-reason" data-text="sentence" className="form-control" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      </Modal>

      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Release details">
        {detail ? (
          <>
            <DrawerHead name={releaseWhat(detail)} sub={detail.bookTitle} tags={<StatusBadge status={detail.shownStatus} />} onClose={() => setDetail(null)} />
            <div className="ldrawer__body">
              <DrawerSection title="Release" fields={[
                ['Level', LEVEL_WORD[detail.level]], ['Section', `${detail.className} ${detail.sectionName}`], ['Subject', detail.subjectName],
                ['Opens', dayTime(detail.releaseAt)], ['Closes', detail.expiresAt ? dayTime(detail.expiresAt) : 'No end date'],
                ['Released by', detail.createdByName], ['Note', detail.note], ['Revoke reason', detail.revokeReason],
              ].filter(([, v]) => v)} />
              {detail.audience === 'selected' ? (
                <DrawerSection title={`Selected students (${detail.selectedCount})`} fields={(detail.selectedStudents || []).map((s, i) => [`Student ${i + 1}`, s.name])} />
              ) : null}
              <div className="ldrawer__sec">
                <h4>History</h4>
                {detailLoading ? <Spinner size="sm" /> : (
                  <ul className="vl-timeline">
                    {(detail.history || []).map((h, i) => (
                      <li key={i}><div><b>{h.summary || h.action}</b><time>{dayTime(h.createdAt)}{h.actorName ? ` · ${h.actorName}` : ''}</time></div></li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
