/**
 * Super Admin → Video Library → Books → one book.
 *
 * The book's chapters, in order, and the videos mapped to each. Videos are
 * never stored on a book: they are picked from the asset library, and the
 * same video can sit in any number of chapters of any number of books.
 * Also here: the book's editions and the schools that follow it.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { central as api } from '../../../api/video.api';
import { Button, Modal, Confirm, Alert, Empty, Spinner } from '../../../components/ui/index';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { SearchField, ListFooter } from '../../admin/listParts';
import { Head, Panel, Loadable, Cover, Thumb, StatusBadge, Icon, ImageField, clock, errText, plural, useDebounced } from '../vlParts';
import { BookForm } from './bookParts';

const CH_BLANK = { title: '', chapterNumber: '', description: '', thumbnailUrl: '', estimatedMinutes: '', status: 'active' };

function ChapterForm({ open, bookId, chapter, nextNumber, onClose, onSaved }) {
  const [f, setF] = useState(CH_BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setF(chapter ? { title: chapter.title, chapterNumber: String(chapter.chapterNumber), description: chapter.description || '', thumbnailUrl: chapter.thumbnailUrl || '',
      estimatedMinutes: chapter.estimatedMinutes ? String(chapter.estimatedMinutes) : '', status: chapter.status } : { ...CH_BLANK, chapterNumber: String(nextNumber) });
  }, [open, chapter, nextNumber]);
  const save = async () => {
    if (f.title.trim().length < 2) return setError('Enter the chapter\'s title');
    if (!/^\d{1,3}$/.test(f.chapterNumber) || Number(f.chapterNumber) < 1) return setError('Chapter number is a whole number from 1');
    const body = { ...f, chapterNumber: Number(f.chapterNumber), estimatedMinutes: Number(f.estimatedMinutes) || 0 };
    setError(''); setSaving(true);
    try { if (chapter) await api.updateChapter(chapter._id, body); else await api.createChapter(bookId, body); toast.success(chapter ? 'Chapter saved' : 'Chapter added'); onSaved(); onClose(); }
    catch (e) { setError(errText(e)); }
    finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={chapter ? 'Edit chapter' : 'Add a chapter'} maxWidth={600}
      footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>{chapter ? 'Save' : 'Add chapter'}</Button></>)}>
      <div className="vl-stack">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="vl-form-grid">
          <div className="form-group"><label className="form-label required" htmlFor="ch-no">Chapter number</label>
            <input id="ch-no" inputMode="numeric" className="form-control" maxLength={3} value={f.chapterNumber} onChange={(e) => setF({ ...f, chapterNumber: e.target.value.replace(/\D/g, '') })} /></div>
          <div className="form-group"><label className="form-label" htmlFor="ch-min">Estimated duration (minutes)</label>
            <input id="ch-min" inputMode="numeric" className="form-control" maxLength={4} value={f.estimatedMinutes} onChange={(e) => setF({ ...f, estimatedMinutes: e.target.value.replace(/\D/g, '') })} /></div>
          <div className="form-group vl-span"><label className="form-label required" htmlFor="ch-title">Chapter title</label>
            <input id="ch-title" data-text="title" className="form-control" maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="form-group vl-span"><label className="form-label" htmlFor="ch-desc">Description</label>
            <textarea id="ch-desc" data-text="sentence" className="form-control" rows={3} maxLength={3000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="vl-span"><ImageField label="Chapter thumbnail" shape="thumb" value={f.thumbnailUrl} onChange={(url) => setF((p) => ({ ...p, thumbnailUrl: url }))} upload={api.uploadImage} /></div>
        </div>
      </div>
    </Modal>
  );
}

/** Pick ready videos from the asset library to map to a chapter. Searched and paged on the server. */
function VideoPicker({ chapter, onClose, onDone }) {
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const chapterId = chapter?._id;
  useEffect(() => { setPage(1); }, [term]);
  useEffect(() => { setPicked([]); setSearch(''); }, [chapterId]);
  const { data, meta, loading, error } = useFetch(
    () => (chapterId ? api.videos({ mappable: 'true', notInChapter: chapterId, search: term || undefined, page, limit: 8 }) : Promise.resolve({ data: [] })),
    [chapterId, term, page],
  );
  if (!chapter) return null;
  const rows = data || [];
  const save = async () => {
    setSaving(true);
    try { const r = await api.mapVideos(chapterId, picked); toast.success(`${plural(r.data.added, 'video')} mapped to Chapter ${chapter.chapterNumber}`); onDone(); onClose(); }
    catch (e) { toast.error(errText(e)); }
    finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Map videos to Chapter ${chapter.chapterNumber}: ${chapter.title}`} maxWidth={720}
      footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} disabled={!picked.length}>Map {picked.length || ''} {picked.length === 1 ? 'video' : 'videos'}</Button></>)}>
      <div className="vl-stack">
        <SearchField value={search} onChange={setSearch} placeholder="Search the video library by title or tag…" />
        {error ? <Alert variant="danger">{error}</Alert> : null}
        {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : rows.length ? (
          <div className="vl-stack" style={{ gap: 8 }}>
            {rows.map((v) => {
              const on = picked.includes(v._id);
              return (
                <label key={v._id} className="vl-vrow" style={{ cursor: 'pointer', borderColor: on ? 'var(--primary)' : undefined }}>
                  <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== v._id) : [...picked, v._id])} />
                  <Thumb src={v.thumbnailUrl} durationSec={v.durationSec} size="sm" />
                  <span className="vl-grow"><span className="vl-vrow__title">{v.title}</span>
                    <span className="vl-small vl-muted" style={{ display: 'block' }}>{[v.subjectName, v.language, v.provider, v.mappingCount ? `in ${plural(v.mappingCount, 'chapter')}` : 'not mapped yet'].filter(Boolean).join(' · ')}</span></span>
                </label>
              );
            })}
            <ListFooter page={page} pages={meta?.pages || 1} total={meta?.total || 0} limit={8} count={rows.length} noun="video" onPage={setPage} onLimit={() => {}} />
          </div>
        ) : (
          <Empty icon="🎬" title={term ? 'No ready video matches' : 'No ready video to map'}
            message="Only videos that have finished processing and are active can be mapped. Add or upload videos under Video Assets."
            action={<Link to="/super-admin/videos/assets" className="btn btn-secondary">Open Video Assets</Link>} />
        )}
      </div>
    </Modal>
  );
}

const move = (list, from, to) => { const next = [...list]; const [x] = next.splice(from, 1); next.splice(to, 0, x); return next; };

export default function CentralVideoBookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: book, loading, error, refetch } = useFetch(() => api.book(id), [id]);
  const boards = useFetch(() => api.boards());
  const subjects = useFetch(() => api.subjects());
  usePageCrumbs([book?._id ? { label: book.title } : null]);

  const [formMode, setFormMode] = useState(null);     // 'edit' | 'edition'
  const [chapterForm, setChapterForm] = useState(null);
  const [picker, setPicker] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});

  const act = async (fn, done, after) => {
    setBusy(true);
    try { const r = await fn(); toast.success(typeof done === 'function' ? done(r) : done); setConfirm(null); if (after) after(); else refetch(); }
    catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };
  const reorderChapters = (from, to) => act(() => api.reorderChapters(book._id, move(book.chapters.map((c) => c._id), from, to)), 'Chapter order saved');
  const reorderVideos = (ch, from, to) => act(() => api.reorderChapterVideos(ch._id, move(ch.videos.map((v) => v._id), from, to)), 'Video order saved');

  const CONFIRMS = {
    active: () => ['Activate this book?', 'Activate', `${book.title} will be offered to schools on ${book.boardName}.`, () => api.setBookStatus(book._id, 'active'), 'Book activated'],
    inactive: () => ['Deactivate this book?', 'Deactivate', `${book.title} will be hidden from schools and students until it is activated again.`, () => api.setBookStatus(book._id, 'inactive'), 'Book deactivated'],
    archived: () => ['Archive this book?', 'Archive', `${book.title} will no longer be offered to schools. Sections already following it keep it.`, () => api.setBookStatus(book._id, 'archived'), 'Book archived'],
    deleteBook: () => ['Delete this book?', 'Delete', `${book.title} and its chapters will be removed for good. A book in use cannot be deleted — archive it instead.`, () => api.removeBook(book._id), 'Book deleted', () => navigate('/super-admin/videos/books')],
    deleteChapter: (c) => ['Delete this chapter?', 'Delete', `Chapter ${c.chapterNumber}: ${c.title} will be removed. A chapter that has been released or watched cannot be deleted — deactivate it instead.`, () => api.removeChapter(c._id), 'Chapter deleted'],
    toggleChapter: (c) => [c.status === 'active' ? 'Deactivate this chapter?' : 'Activate this chapter?', c.status === 'active' ? 'Deactivate' : 'Activate',
      c.status === 'active' ? `Chapter ${c.chapterNumber} will be hidden from teachers and students. What students have watched is kept.` : `Chapter ${c.chapterNumber} will be available again.`,
      () => api.updateChapter(c._id, { status: c.status === 'active' ? 'inactive' : 'active' }), 'Chapter updated'],
    unmap: (v) => ['Remove this video from the chapter?', 'Remove', `"${v.title}" will be taken out of this chapter. The video stays in the library and in any other chapter it is mapped to. If students have already watched it here, it is switched off in the chapter instead, so their record is kept.`,
      () => api.unmapVideo(v._id), (r) => (r.data.deactivated ? 'Switched off in this chapter (it has watch records)' : 'Video removed from the chapter')],
  };
  const conf = confirm ? CONFIRMS[confirm.kind](confirm.item) : null;

  return (
    <div className="page vl-page">
      <Loadable loading={loading && !book} error={error} onRetry={refetch}>
        {book?._id ? (
          <>
            <Head title={book.title} subtitle={`${book.boardName} · ${book.classLabel} · ${book.subjectName}`}>
              <Link to="/super-admin/videos/books" className="btn btn-secondary"><Icon name="arrowLeft" size={16} /> Books</Link>
              <Button variant="secondary" onClick={() => setFormMode('edit')}><Icon name="pencil" size={16} /> Edit</Button>
              <Button variant="secondary" onClick={() => setFormMode('edition')}><Icon name="copy" size={16} /> New edition</Button>
              {book.status !== 'active' ? <Button onClick={() => setConfirm({ kind: 'active' })}>Activate</Button> : <Button variant="secondary" onClick={() => setConfirm({ kind: 'inactive' })}>Deactivate</Button>}
            </Head>

            <div className="vl-two">
              <div className="vl-stack">
                <div className="vl-card vl-card__body vl-row" style={{ gap: 18, alignItems: 'flex-start' }}>
                  <Cover src={book.coverUrl} title={book.title} size="lg" />
                  <div className="vl-grow vl-stack" style={{ gap: 10 }}>
                    <div className="vl-row"><StatusBadge status={book.status} />
                      <span className="vl-chip"><Icon name="layers" size={13} /> {plural(book.chapterCount, 'chapter')}</span>
                      <span className="vl-chip"><Icon name="film" size={13} /> {plural(book.videoCount, 'video')}</span>
                      <span className="vl-chip"><Icon name="school" size={13} /> {plural(book.schoolCount, 'school')}</span></div>
                    <dl className="vl-kv">
                      {[['Publisher', book.publisher], ['Author', book.author], ['Edition', book.edition], ['Publication year', book.publicationYear], ['ISBN', book.isbn], ['Language', book.language]]
                        .filter(([, v]) => v).map(([k, v]) => (<React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>))}
                    </dl>
                    {book.description ? <p className="vl-muted">{book.description}</p> : null}
                  </div>
                </div>

                <Panel title="Chapters" subtitle="A chapter can wait without videos; map them when they are ready." flush
                  action={<Button size="sm" onClick={() => setChapterForm('new')}><Icon name="plus" size={14} /> Add chapter</Button>}>
                  {book.chapters.length ? (
                    <div className="vl-chapters">
                      {book.chapters.map((c, i) => {
                        const isOpen = open[c._id] ?? true;
                        return (
                          <div key={c._id} className={`vl-chapter${c.status !== 'active' ? ' is-locked' : ''}`}>
                            <div className="vl-chapter__head">
                              <span className="vl-grip">
                                <button type="button" disabled={i === 0 || busy} onClick={() => reorderChapters(i, i - 1)} aria-label="Move chapter up"><Icon name="arrowUp" size={13} /></button>
                                <button type="button" disabled={i === book.chapters.length - 1 || busy} onClick={() => reorderChapters(i, i + 1)} aria-label="Move chapter down"><Icon name="arrowDown" size={13} /></button>
                              </span>
                              <span className="vl-chapter__num tint-indigo">{c.chapterNumber}</span>
                              <button type="button" className="vl-grow" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => setOpen({ ...open, [c._id]: !isOpen })} aria-expanded={isOpen}>
                                <span className="vl-chapter__title">Chapter {c.chapterNumber}: {c.title}</span>
                                <span className="vl-small vl-muted" style={{ display: 'block' }}>
                                  {c.videos.length ? plural(c.videos.length, 'video') : 'No videos yet'}{c.estimatedMinutes ? ` · about ${c.estimatedMinutes} min` : ''}
                                </span>
                              </button>
                              {c.status !== 'active' ? <StatusBadge status="inactive" /> : null}
                              <Button size="sm" variant="secondary" onClick={() => setPicker(c)}><Icon name="plus" size={14} /> Map videos</Button>
                              <button type="button" className="btn-icon" onClick={() => setChapterForm(c)} aria-label="Edit chapter" title="Edit chapter"><Icon name="pencil" size={16} /></button>
                              <button type="button" className="btn-icon" onClick={() => setConfirm({ kind: 'toggleChapter', item: c })} aria-label={c.status === 'active' ? 'Deactivate chapter' : 'Activate chapter'} title={c.status === 'active' ? 'Deactivate chapter' : 'Activate chapter'}><Icon name={c.status === 'active' ? 'eyeOff' : 'eye'} size={16} /></button>
                              <button type="button" className="btn-icon" onClick={() => setConfirm({ kind: 'deleteChapter', item: c })} aria-label="Delete chapter" title="Delete chapter" style={{ color: 'var(--danger)' }}><Icon name="trash" size={16} /></button>
                            </div>
                            {isOpen && c.videos.length ? (
                              <div className="vl-chapter__videos">
                                {c.videos.map((v, j) => (
                                  <div key={v._id} className="vl-vrow" style={!v.isActive ? { opacity: 0.6 } : undefined}>
                                    <span className="vl-grip">
                                      <button type="button" disabled={j === 0 || busy} onClick={() => reorderVideos(c, j, j - 1)} aria-label="Move video up"><Icon name="arrowUp" size={13} /></button>
                                      <button type="button" disabled={j === c.videos.length - 1 || busy} onClick={() => reorderVideos(c, j, j + 1)} aria-label="Move video down"><Icon name="arrowDown" size={13} /></button>
                                    </span>
                                    <Thumb src={v.thumbnailUrl} durationSec={v.durationSec} size="sm" />
                                    <span className="vl-grow">
                                      <Link to={`/super-admin/videos/assets?open=${v.video}`} className="vl-vrow__title">{v.title}</Link>
                                      <span className="vl-small vl-muted" style={{ display: 'block' }}>{clock(v.durationSec)} · {v.language} · {v.provider}</span>
                                    </span>
                                    <span className="vl-vrow__acts">
                                      {!v.isActive ? <span className="vl-chip">Switched off here</span> : null}
                                      {!v.videoActive ? <span className="vl-chip">Video deactivated</span> : null}
                                      {v.processingStatus !== 'ready' ? <StatusBadge status={v.processingStatus} /> : null}
                                      {!v.isActive
                                        ? <Button size="sm" variant="secondary" onClick={() => act(() => api.mapVideos(c._id, [v.video]), 'Switched back on in this chapter')}>Switch on</Button>
                                        : <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: 'unmap', item: v })}>Remove</Button>}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : <Empty icon="📖" title="No chapters yet" message="Add the book's chapters, then map videos to each." action={<Button onClick={() => setChapterForm('new')}>Add chapter</Button>} />}
                </Panel>
              </div>

              <div className="vl-stack">
                <Panel title="Editions">
                  <div className="vl-stack" style={{ gap: 8 }}>
                    {book.editions.map((e) => (
                      <div key={e._id} className="vl-row">
                        {e._id === book._id ? <b className="vl-grow">{e.edition || 'This edition'}{e.publicationYear ? ` · ${e.publicationYear}` : ''} (this one)</b>
                          : <Link className="vl-grow" to={`/super-admin/videos/books/${e._id}`}>{e.edition || e.title}{e.publicationYear ? ` · ${e.publicationYear}` : ''}</Link>}
                        <StatusBadge status={e.status} />
                      </div>
                    ))}
                    <Button size="sm" variant="secondary" onClick={() => setFormMode('edition')}><Icon name="copy" size={14} /> New edition</Button>
                  </div>
                </Panel>
                <Panel title="Schools using this book">
                  {book.schools.length ? (
                    <div className="vl-stack" style={{ gap: 8 }}>
                      {book.schools.map((s) => (
                        <div key={s._id}><b>{s.name}</b>
                          <div className="vl-small vl-muted">{s.classAssignments ? 'Whole class' : ''}{s.classAssignments && s.sectionAssignments ? ' · ' : ''}{s.sectionAssignments ? plural(s.sectionAssignments, 'section') : ''}</div></div>
                      ))}
                    </div>
                  ) : <p className="vl-muted vl-small">No school follows this book yet.</p>}
                </Panel>
                <Panel title="Archive or delete">
                  <div className="vl-stack" style={{ gap: 10 }}>
                    <p className="vl-small vl-muted">Archiving stops new schools selecting the book; schools already using it keep it. Only a book nobody has used can be deleted.</p>
                    <div className="vl-row">
                      {book.status !== 'archived' ? <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: 'archived' })}><Icon name="archive" size={14} /> Archive</Button> : null}
                      <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: 'deleteBook' })}><Icon name="trash" size={14} /> Delete</Button>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>

            <BookForm open={!!formMode} mode={formMode || 'edit'} book={book} boards={(boards.data || []).filter((b) => b.isActive || b._id === book.board)} subjects={subjects.data || []}
              onClose={() => setFormMode(null)} onSaved={(saved) => { if (formMode === 'edition' && saved?._id) navigate(`/super-admin/videos/books/${saved._id}`); else refetch(); }} />
            <ChapterForm open={!!chapterForm} bookId={book._id} chapter={chapterForm === 'new' ? null : chapterForm}
              nextNumber={Math.max(0, ...book.chapters.map((c) => c.chapterNumber)) + 1} onClose={() => setChapterForm(null)} onSaved={refetch} />
            <VideoPicker chapter={picker} onClose={() => setPicker(null)} onDone={refetch} />
            <Confirm open={!!conf} loading={busy} onClose={() => setConfirm(null)} title={conf?.[0]} confirmLabel={conf?.[1]} message={conf?.[2]}
              onConfirm={() => act(conf[3], conf[4], conf[5])} />
          </>
        ) : null}
      </Loadable>
    </div>
  );
}
