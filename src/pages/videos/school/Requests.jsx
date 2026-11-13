/**
 * Admin → Video Learning → Requests.
 *
 * What the school has asked the library for: a book that is not there, or a
 * chapter / topic missing from one that is. Each request shows where it has
 * got to; the school is notified at every step. The same thing cannot be
 * asked for twice while the first request is still open.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { school as api } from '../../../api/video.api';
import { Button, Modal, Confirm, Alert } from '../../../components/ui/index';
import { ListTabs, ListTable, ListFooter, Stack, RowActions, IconAction, Drawer, DrawerHead, DrawerSection, DrawerFoot } from '../../admin/listParts';
import { CLASS_LEVELS } from '../../../utils/classLevels';
import { Head, Loadable, StatusBadge, Icon, day, dayTime, errText, saveBlob, statusWord } from '../vlParts';

const TABS = [{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'completed', label: 'Completed' }, { value: 'rejected', label: 'Rejected' }];
const BLANK = { type: 'book', board: '', boardName: '', classLevel: '', subject: '', subjectName: '', title: '', publisher: '', author: '', edition: '', publicationYear: '',
  book: '', chapterNumber: '', chapterName: '', topic: '', comments: '' };

export const requestTitle = (r) => (r.type === 'book' ? r.title : `Chapter ${r.chapterNumber ?? ''}${r.chapterName ? `: ${r.chapterName}` : ''}`.trim());

/** The request form: a book the library lacks, or a chapter / topic missing from a book the school follows. */
function RequestForm({ open, type, setup, onClose, onDone }) {
  const [f, setF] = useState(BLANK);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  useEffect(() => { if (open) { setF({ ...BLANK, type, board: setup?.config?.board || '' }); setFile(null); setError(''); } }, [open, type, setup]);

  // What the school already has to hand: the board's subjects, and the books it follows.
  const subjects = useMemo(() => [...new Map((setup?.classes || []).flatMap((c) => c.availableSubjects).map((s) => [String(s._id), s])).values()], [setup]);
  const books = useMemo(() => [...new Map((setup?.classes || []).flatMap((c) => c.subjects.flatMap((s) => s.books.map((b) => [String(b.book), { ...b, className: c.className, subjectName: s.name }])))).values()], [setup]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    setError('');
    const body = { type: f.type, comments: f.comments };
    if (f.type === 'book') {
      if (!f.board && !f.boardName.trim()) return setError('Choose the board, or type its name');
      if (f.classLevel === '') return setError('Choose the class');
      if (!f.subject && !f.subjectName.trim()) return setError('Choose the subject, or type its name');
      if (f.title.trim().length < 2) return setError('Enter the book\'s title');
      if (f.publicationYear && !/^\d{4}$/.test(f.publicationYear)) return setError('Publication year is four digits');
      Object.assign(body, { board: f.board, boardName: f.board ? '' : f.boardName, classLevel: f.classLevel, subject: f.subject, subjectName: f.subject ? '' : f.subjectName,
        title: f.title, publisher: f.publisher, author: f.author, edition: f.edition, publicationYear: f.publicationYear });
    } else {
      if (!f.book) return setError('Choose the book');
      if (!f.chapterName.trim() && !f.topic.trim()) return setError('Say which chapter or topic is missing');
      if (f.chapterNumber && !/^\d{1,3}$/.test(f.chapterNumber)) return setError('Chapter number is a whole number');
      Object.assign(body, { book: f.book, chapterNumber: f.chapterNumber, chapterName: f.chapterName, topic: f.topic });
    }
    setSaving(true);
    try { await api.createRequest(body, file); toast.success('Request sent to Aksharum'); onDone(); onClose(); }
    catch (e) { setError(errText(e)); }
    finally { setSaving(false); }
  };

  const pickFile = (e) => {
    const x = e.target.files?.[0]; e.target.value = '';
    if (!x) return;
    if (!/\.(pdf|jpe?g|png|webp)$/i.test(x.name)) return setError('Attach a PDF or a photo (JPG, PNG, WebP)');
    if (x.size > 10 * 1024 * 1024) return setError('The attachment must be 10 MB or smaller');
    setError(''); setFile(x);
  };

  return (
    <Modal open={open} onClose={onClose} title={type === 'book' ? 'Request a book' : 'Request a missing chapter'} maxWidth={640}
      footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Send request</Button></>)}>
      <div className="vl-stack">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        {f.type === 'book' ? (
          <div className="vl-form-grid">
            <div className="form-group">
              <label className="form-label required" htmlFor="rq-board">Board</label>
              <select id="rq-board" className="form-control" value={f.board} onChange={set('board')}>
                <option value="">Another board…</option>
                {(setup?.boards || []).map((b) => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
              </select>
              {!f.board ? <input data-text="title" className="form-control" style={{ marginTop: 8 }} placeholder="Board name" maxLength={120} value={f.boardName} onChange={set('boardName')} aria-label="Board name" /> : null}
            </div>
            <div className="form-group">
              <label className="form-label required" htmlFor="rq-class">Class</label>
              <select id="rq-class" className="form-control" value={f.classLevel} onChange={set('classLevel')}>
                <option value="">Choose…</option>
                {CLASS_LEVELS.map((l) => <option key={l.number} value={l.number}>{l.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required" htmlFor="rq-subject">Subject</label>
              <select id="rq-subject" className="form-control" value={f.subject} onChange={set('subject')}>
                <option value="">Another subject…</option>
                {subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              {!f.subject ? <input data-text="title" className="form-control" style={{ marginTop: 8 }} placeholder="Subject name" maxLength={120} value={f.subjectName} onChange={set('subjectName')} aria-label="Subject name" /> : null}
            </div>
            <div className="form-group">
              <label className="form-label required" htmlFor="rq-title">Book title</label>
              <input id="rq-title" data-text="title" className="form-control" maxLength={200} value={f.title} onChange={set('title')} />
            </div>
            <div className="form-group"><label className="form-label" htmlFor="rq-pub">Publisher</label><input id="rq-pub" data-text="title" className="form-control" maxLength={150} value={f.publisher} onChange={set('publisher')} /></div>
            <div className="form-group"><label className="form-label" htmlFor="rq-author">Author</label><input id="rq-author" data-text="title" className="form-control" maxLength={200} value={f.author} onChange={set('author')} /></div>
            <div className="form-group"><label className="form-label" htmlFor="rq-ed">Edition</label><input id="rq-ed" data-text="title" className="form-control" maxLength={60} value={f.edition} onChange={set('edition')} placeholder="For example: 2nd edition" /></div>
            <div className="form-group"><label className="form-label" htmlFor="rq-year">Publication year</label><input id="rq-year" inputMode="numeric" className="form-control" maxLength={4} value={f.publicationYear} onChange={(e) => setF((p) => ({ ...p, publicationYear: e.target.value.replace(/\D/g, '') }))} placeholder="2026" /></div>
            <div className="form-group vl-span">
              <label className="form-label">Book cover or reference document</label>
              <div className="vl-row">
                <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={pickFile} />
                <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} /> {file ? 'Replace file' : 'Attach a file'}</Button>
                {file ? <><span className="vl-small">{file.name}</span><button type="button" className="vl-link vl-small" onClick={() => setFile(null)}>Remove</button></> : <span className="vl-small vl-muted">PDF or photo, up to 10 MB</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="vl-form-grid">
            <div className="form-group vl-span">
              <label className="form-label required" htmlFor="rq-book">Book</label>
              <select id="rq-book" className="form-control" value={f.book} onChange={set('book')}>
                <option value="">Choose one of the books you follow…</option>
                {books.map((b) => <option key={b.book} value={b.book}>{b.title} — {b.subjectName}, {b.className}</option>)}
              </select>
              {!books.length ? <div className="form-hint">Your school follows no books yet. Assign one under Setup first.</div> : null}
            </div>
            <div className="form-group"><label className="form-label" htmlFor="rq-chno">Chapter number</label><input id="rq-chno" inputMode="numeric" className="form-control" maxLength={3} value={f.chapterNumber} onChange={(e) => setF((p) => ({ ...p, chapterNumber: e.target.value.replace(/\D/g, '') }))} /></div>
            <div className="form-group"><label className="form-label" htmlFor="rq-chname">Chapter name</label><input id="rq-chname" data-text="title" className="form-control" maxLength={200} value={f.chapterName} onChange={set('chapterName')} /></div>
            <div className="form-group vl-span"><label className="form-label" htmlFor="rq-topic">Content or topic needed</label><textarea id="rq-topic" data-text="sentence" className="form-control" rows={3} maxLength={1000} value={f.topic} onChange={set('topic')} placeholder="For example: the videos for this chapter are missing, or a topic inside it is not covered" /></div>
          </div>
        )}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="rq-comments">Additional comments</label>
          <textarea id="rq-comments" data-text="sentence" className="form-control" rows={3} maxLength={2000} value={f.comments} onChange={set('comments')} />
        </div>
      </div>
    </Modal>
  );
}

/** One request, opened: what was asked, where it has got to, and every step so far. Shared with the Super Admin's screen. */
export function RequestDrawer({ request, onClose, onAttachment, children }) {
  if (!request) return <Drawer open={false} onClose={onClose} />;
  const r = request;
  return (
    <Drawer open onClose={onClose} label="Request details">
      <DrawerHead name={requestTitle(r)} sub={r.type === 'book' ? 'Book request' : `Chapter request · ${r.bookTitle || r.title}`} tags={<StatusBadge status={r.status} />} onClose={onClose} />
      <div className="ldrawer__body">
        <DrawerSection title="Request" fields={[
          ['School', r.schoolName], ['Board', r.boardName], ['Class', r.classLabel], ['Subject', r.subjectName],
          ...(r.type === 'book' ? [['Title', r.title], ['Publisher', r.publisher], ['Author', r.author], ['Edition', r.edition], ['Publication year', r.publicationYear]]
            : [['Book', r.bookTitle || r.title], ['Chapter number', r.chapterNumber], ['Chapter name', r.chapterName], ['Topic needed', r.topic]]),
          ['Comments', r.comments], ['Requested by', r.requestedByName], ['Requested on', dayTime(r.createdAt)],
          ['Schools asking for this', r.schoolsAsking > 1 ? `${r.schoolsAsking} schools` : ''],
        ]} />
        {r.reviewNote ? <DrawerSection title="Note from Aksharum" fields={[['Note', r.reviewNote], ['By', r.reviewedByName]]} /> : null}
        {r.hasAttachment ? (
          <div className="ldrawer__sec"><h4>Attachment</h4>
            <Button variant="secondary" size="sm" onClick={() => onAttachment(r)}><Icon name="download" size={14} /> Download the attached file</Button></div>
        ) : null}
        <div className="ldrawer__sec"><h4>Progress</h4>
          <ul className="vl-timeline">
            {(r.history || []).map((h, i) => (<li key={i}><div><b>{statusWord(h.status)}</b>{h.note ? <span> — {h.note}</span> : null}<time>{dayTime(h.at)}</time></div></li>))}
          </ul>
        </div>
      </div>
      {children ? <DrawerFoot>{children}</DrawerFoot> : null}
    </Drawer>
  );
}

export default function SchoolVideoRequests() {
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { data, meta, loading, error, refetch } = useFetch(() => api.requests({ status: tab === 'all' ? undefined : tab, page, limit }), [tab, page, limit]);
  const setup = useFetch(api.setup);
  const [form, setForm] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [withdrawing, setWithdrawing] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = data || [];
  const c = meta?.counts;

  // A notification about a request opens that request.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('focus');
    if (id) api.request(id).then((r) => setViewing(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachment = async (r) => {
    try { saveBlob(await api.requestAttachment(r._id), `request-${r._id.slice(0, 8)}`); }
    catch (e) { toast.error(errText(e)); }
  };
  const withdraw = async () => {
    setBusy(true);
    try { await api.withdrawRequest(withdrawing._id); toast.success('Request withdrawn'); setWithdrawing(null); setViewing(null); refetch(); }
    catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'what', label: 'Requested', render: (r) => <Stack main={requestTitle(r)} sub={r.type === 'book' ? [r.publisher, r.edition].filter(Boolean).join(' · ') || 'Book' : `in ${r.bookTitle || r.title}`} /> },
    { key: 'type', label: 'Type', render: (r) => (r.type === 'book' ? 'Book' : 'Chapter') },
    { key: 'for', label: 'For', render: (r) => <Stack main={r.subjectName} sub={[r.boardName, r.classLabel].filter(Boolean).join(' · ')} /> },
    { key: 'on', label: 'Requested', render: (r) => <Stack main={day(r.createdAt)} sub={r.requestedByName} /> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'acts', label: '', className: 'ltable__acts', render: (r) => (
      <RowActions>
        <IconAction icon="eye" label="Open" onClick={() => setViewing(r)} />
        {r.status === 'pending' ? <IconAction icon="trash" label="Withdraw" variant="danger" onClick={() => setWithdrawing(r)} /> : null}
      </RowActions>
    ) },
  ];

  return (
    <div className="page vl-page">
      <Head title="Requests" subtitle="Ask Aksharum for a book that is not in the library, or for a chapter or topic missing from a book you follow.">
        <Button variant="secondary" onClick={() => setForm('chapter')}><Icon name="plus" size={16} /> Request a chapter</Button>
        <Button onClick={() => setForm('book')}><Icon name="plus" size={16} /> Request a book</Button>
      </Head>
      <Loadable error={error} onRetry={refetch}>
        <section className="card">
          <ListTabs tabs={TABS} value={tab} onChange={(v) => { setTab(v); setPage(1); }}
            counts={{ total: c?.total, open: (c?.pending || 0) + (c?.inHand || 0), completed: c?.completed, rejected: c?.rejected }} />
          <ListTable columns={columns} rows={rows} loading={loading} startIndex={(page - 1) * limit}
            emptyIcon="📮" emptyTitle={tab === 'all' ? 'No requests yet' : 'No requests here'}
            emptyMessage="When a book or chapter you need is missing from the library, request it here."
            emptyAction={tab === 'all' ? <Button onClick={() => setForm('book')}>Request a book</Button> : null} />
          <ListFooter page={page} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit} count={rows.length} noun="request"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        </section>
      </Loadable>

      <RequestForm open={!!form} type={form || 'book'} setup={setup.data} onClose={() => setForm(null)} onDone={refetch} />
      <RequestDrawer request={viewing} onClose={() => setViewing(null)} onAttachment={attachment}>
        {viewing?.status === 'pending' ? <Button variant="danger" onClick={() => setWithdrawing(viewing)}>Withdraw request</Button> : null}
      </RequestDrawer>
      <Confirm open={!!withdrawing} loading={busy} title="Withdraw this request?" confirmLabel="Withdraw"
        message={`"${withdrawing ? requestTitle(withdrawing) : ''}" has not been looked at yet. Withdrawing removes it; you can ask again later.`}
        onClose={() => setWithdrawing(null)} onConfirm={withdraw} />
    </div>
  );
}
