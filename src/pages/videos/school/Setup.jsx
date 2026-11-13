/**
 * Admin → Video Learning → Setup.
 *
 * Where a school says what it follows, in the order the choices depend on
 * each other:
 *
 *   1. the board and the academic year
 *   2. for each class, the subjects — each tied to one of the class's OWN
 *      subjects, which is what puts the right book in front of the right teacher
 *   3. for each subject, the books — for every section, or for chosen ones
 *      (Section A may follow one book while Section B follows another)
 *
 * A school never edits or copies a book: it selects from the library, and
 * asks for what is missing (Requests).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { school as api } from '../../../api/video.api';
import { Button, Modal, Confirm, Alert, Empty, Spinner } from '../../../components/ui/index';
import { Head, Panel, Loadable, Cover, StatusBadge, Icon, errText, plural } from '../vlParts';

/** Step 2 for one class: tick the library subjects it follows, and say which of the class's own subjects each one is. */
function SubjectsEditor({ cls, onSaved }) {
  const initial = useMemo(() => Object.fromEntries(cls.subjects.map((s) => [String(s.lmsSubject), String(s.schoolSubject)])), [cls]);
  const [picked, setPicked] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setPicked(initial); setError(''); }, [initial]);

  // The class's own subject with the same name, when there is one — offered, never assumed silently.
  const guess = (name) => cls.ownSubjects.find((o) => o.subjectName.trim().toLowerCase() === name.trim().toLowerCase())?._id || '';
  const toggle = (s) => {
    const next = { ...picked };
    if (next[s._id] !== undefined) delete next[s._id]; else next[s._id] = guess(s.name);
    setPicked(next);
  };
  const dirty = JSON.stringify(picked) !== JSON.stringify(initial);

  const save = async () => {
    const rows = Object.entries(picked).map(([lmsSubject, schoolSubject]) => ({ lmsSubject, schoolSubject }));
    if (rows.some((r) => !r.schoolSubject)) return setError('Choose which of the class\'s own subjects each selected subject is');
    if (new Set(rows.map((r) => r.schoolSubject)).size !== rows.length) return setError('Each library subject needs its own subject of the class');
    setError(''); setSaving(true);
    try { await api.setClassSubjects(cls._id, rows); toast.success(`Subjects saved for ${cls.className}`); onSaved(); }
    catch (e) { setError(errText(e)); }
    finally { setSaving(false); }
  };

  if (!cls.availableSubjects.length) {
    return <Alert variant="info">The library has no subjects for {cls.className} on your board yet. You can <Link to="/admin/videos/requests">request a book</Link>.</Alert>;
  }
  if (!cls.ownSubjects.length) {
    return <Alert variant="warning">{cls.className} has no subjects of its own yet. Add them under <Link to="/admin/classes">Academics › Classes</Link> first — books reach teachers through the class's subjects.</Alert>;
  }
  return (
    <div className="vl-stack" style={{ gap: 10 }}>
      <div className="form-label" style={{ marginBottom: 0 }}>Subjects {cls.className} follows</div>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {cls.availableSubjects.map((s) => {
        const on = picked[s._id] !== undefined;
        return (
          <div key={s._id} className="vl-assign">
            <label className={`vl-check${on ? ' is-on' : ''}`} style={{ minWidth: 190 }}>
              <input type="checkbox" checked={on} onChange={() => toggle(s)} /> {s.name}
              <span className="vl-muted">· {plural(s.bookCount, 'book')}</span>
            </label>
            {on ? (
              <>
                <span className="vl-small vl-muted">is your subject</span>
                <select className="form-control" style={{ maxWidth: 240 }} value={picked[s._id]} aria-label={`Your subject for ${s.name}`}
                  onChange={(e) => setPicked({ ...picked, [s._id]: e.target.value })}>
                  <option value="">Choose…</option>
                  {cls.ownSubjects.map((o) => <option key={o._id} value={o._id}>{o.subjectName}{o.subjectCode ? ` (${o.subjectCode})` : ''}</option>)}
                </select>
              </>
            ) : null}
          </div>
        );
      })}
      <div className="vl-row">
        <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>Save subjects</Button>
        {dirty ? <button type="button" className="vl-link vl-small" onClick={() => setPicked(initial)}>Undo changes</button> : null}
        <span className="vl-small vl-muted">The teachers of your subject in each section are the ones who can release its books.</span>
      </div>
    </div>
  );
}

/** Step 3 for one book: every section, chosen sections, or none. */
function AssignDialog({ state, onClose, onSaved }) {
  const { cls, book, current } = state || {};
  const [scope, setScope] = useState('all');
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!state) return;
    setError('');
    setScope(current ? (current.allSections ? 'all' : 'sections') : 'all');
    setSections(current && !current.allSections ? current.sections.map(String) : []);
  }, [state, current]);
  if (!state) return null;

  const save = async () => {
    if (scope === 'sections' && !sections.length) return setError('Choose at least one section');
    setError(''); setSaving(true);
    try {
      const r = await api.assignBook({ class: cls._id, book: book.book || book._id, sections: scope === 'all' ? 'all' : scope === 'none' ? 'none' : sections });
      toast.success(scope === 'none' ? `${cls.className} no longer follows this book` : 'Book assignment saved');
      onSaved(r.data); onClose();
    } catch (e) { setError(errText(e)); }
    finally { setSaving(false); }
  };
  const narrowing = current && (scope === 'none' || (scope === 'sections' && (current.allSections || current.sections.some((s) => !sections.includes(String(s))))));

  return (
    <Modal open onClose={onClose} title={current ? 'Change who follows this book' : 'Assign this book'} maxWidth={520}
      footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={scope === 'none' ? 'danger' : 'primary'} onClick={save} loading={saving}>{scope === 'none' ? 'Stop following' : 'Save'}</Button></>)}>
      <div className="vl-stack">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="vl-row">
          <Cover src={book.coverUrl} title={book.title} />
          <div><b>{book.title}</b><div className="vl-small vl-muted">{[book.publisher, book.edition].filter(Boolean).join(' · ')} · {cls.className}</div></div>
        </div>
        <div className="vl-checks" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <label className={`vl-check${scope === 'all' ? ' is-on' : ''}`}>
            <input type="radio" name="vl-scope" checked={scope === 'all'} onChange={() => setScope('all')} /> Every section of {cls.className}
          </label>
          <label className={`vl-check${scope === 'sections' ? ' is-on' : ''}`}>
            <input type="radio" name="vl-scope" checked={scope === 'sections'} onChange={() => setScope('sections')} /> Selected sections
          </label>
          {scope === 'sections' ? (
            <div className="vl-checks" style={{ paddingLeft: 26 }}>
              {cls.sections.map((s) => {
                const on = sections.includes(String(s._id));
                return (
                  <label key={s._id} className={`vl-check${on ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => setSections(on ? sections.filter((x) => x !== String(s._id)) : [...sections, String(s._id)])} /> Section {s.sectionName}
                  </label>
                );
              })}
              {!cls.sections.length ? <span className="vl-muted vl-small">This class has no sections yet.</span> : null}
            </div>
          ) : null}
          {current ? (
            <label className={`vl-check${scope === 'none' ? ' is-on' : ''}`}>
              <input type="radio" name="vl-scope" checked={scope === 'none'} onChange={() => setScope('none')} /> No section — stop following this book
            </label>
          ) : null}
        </div>
        {narrowing ? (
          <Alert variant="warning">
            Sections that stop following this book lose access to whatever their teachers have released from it, straight away. Students keep the record of what they watched, and the assignment stays in the history.
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

/** The library's books for one subject of one class, to choose from. */
function BookPicker({ state, onClose, onPick }) {
  const { cls, subject } = state || {};
  const [books, setBooks] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!state) return undefined;
    let alive = true;
    setBooks(null); setError('');
    api.availableBooks(cls._id, subject.lmsSubject).then((r) => { if (alive) setBooks(r.data || []); }).catch((e) => { if (alive) { setBooks([]); setError(errText(e)); } });
    return () => { alive = false; };
  }, [state, cls, subject]);
  if (!state) return null;
  const taken = new Set(subject.books.map((b) => String(b.book)));
  return (
    <Modal open onClose={onClose} title={`${subject.name} books for ${cls.className}`} maxWidth={640}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {books === null ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : books.length ? (
        <div className="vl-stack" style={{ gap: 10 }}>
          {books.map((b) => (
            <div key={b._id} className="vl-vrow">
              <Cover src={b.coverUrl} title={b.title} />
              <span className="vl-grow">
                <span className="vl-vrow__title">{b.title}</span>
                <span className="vl-small vl-muted" style={{ display: 'block' }}>
                  {[b.publisher, b.author, b.edition, b.publicationYear].filter(Boolean).join(' · ') || b.language}
                </span>
                <span className="vl-small vl-muted">{plural(b.chapterCount, 'chapter')} · {plural(b.videoCount, 'video')}</span>
              </span>
              {taken.has(String(b._id))
                ? <span className="vl-chip"><Icon name="check" size={13} /> Already followed</span>
                : <Button size="sm" onClick={() => onPick(b)}>Assign</Button>}
            </div>
          ))}
          <p className="vl-small vl-muted">Is the book you use not here? <Link to="/admin/videos/requests">Request it</Link>.</p>
        </div>
      ) : (
        <Empty icon="📚" title="No books for this subject yet" message="The library has no book for this subject and class on your board."
          action={<Link to="/admin/videos/requests" className="btn btn-primary">Request a book</Link>} />
      )}
    </Modal>
  );
}

export default function SchoolVideoSetup() {
  const [year, setYear] = useState('');
  const { data, loading, error, refetch } = useFetch(() => api.setup(year ? { academicYear: year } : undefined), [year]);
  const [board, setBoard] = useState('');
  const [savingBoard, setSavingBoard] = useState(false);
  const [confirmBoard, setConfirmBoard] = useState(null);
  const [open, setOpen] = useState(null);
  const [picker, setPicker] = useState(null);
  const [assign, setAssign] = useState(null);

  useEffect(() => { if (data) setBoard(data.config?.board || ''); }, [data]);
  const yearId = data?.year?._id;
  const classes = data?.classes || [];

  const saveBoard = async (confirm = false) => {
    setSavingBoard(true);
    try {
      await api.setBoard({ academicYear: yearId, board, confirm });
      toast.success('Board saved'); setConfirmBoard(null); refetch();
    } catch (e) {
      if (e?.data?.code === 'CONFIRM_BOARD_CHANGE') setConfirmBoard(e.message);
      else toast.error(errText(e));
    } finally { setSavingBoard(false); }
  };

  const sectionNames = (cls, ids) => ids.map((sid) => cls.sections.find((s) => String(s._id) === String(sid))?.sectionName).filter(Boolean).sort().join(', ');

  return (
    <div className="page vl-page">
      <Head title="Setup" subtitle="Choose the board your school follows, the subjects of each class, and the books each section uses.">
        <Link to="/admin/videos/requests" className="btn btn-secondary"><Icon name="mail" size={16} /> Request a book</Link>
      </Head>

      <Loadable loading={loading && !data} error={error} onRetry={refetch}>
        {data && !data.years.length ? (
          <div className="vl-card"><Empty icon="📅" title="No academic year yet" message="Add an academic year first — what the school follows is set year by year."
            action={<Link to="/admin/academic-years" className="btn btn-primary">Academic Years</Link>} /></div>
        ) : data ? (
          <>
            <Panel title="1. Board and academic year" subtitle="Everything below comes from this board's part of the library.">
              <div className="vl-row" style={{ alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
                  <label className="form-label" htmlFor="vl-year">Academic year</label>
                  <select id="vl-year" className="form-control" value={yearId || ''} onChange={(e) => { setYear(e.target.value); setOpen(null); }}>
                    {data.years.map((y) => <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (active)' : ''}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 260 }}>
                  <label className="form-label required" htmlFor="vl-board">Education board</label>
                  <select id="vl-board" className="form-control" value={board} onChange={(e) => setBoard(e.target.value)}>
                    <option value="">Choose a board…</option>
                    {data.boards.map((b) => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
                    {data.config && !data.boards.some((b) => b._id === data.config.board) ? <option value={data.config.board}>{data.config.boardName} (no longer offered)</option> : null}
                  </select>
                </div>
                <Button onClick={() => saveBoard(false)} loading={savingBoard} disabled={!board || board === (data.config?.board || '')}>
                  {data.config ? 'Change board' : 'Save board'}
                </Button>
              </div>
              {!data.boards.length ? <Alert variant="warning">The library has no boards yet. Aksharum adds them; once one is there you can select it here.</Alert> : null}
            </Panel>

            {!data.config ? (
              <div className="vl-card"><Empty icon="🏫" title="Choose your board to continue" message="Subjects and books are offered once the school's board for this year is saved." /></div>
            ) : (
              <Panel title="2. Subjects and books for each class" subtitle={`${data.config.boardName} · ${data.year.yearName}`}>
                {classes.length ? (
                  <div className="vl-stack">
                    {classes.map((cls) => {
                      const isOpen = open === cls._id;
                      const bookCount = cls.subjects.reduce((n, s) => n + s.books.length, 0);
                      return (
                        <div key={cls._id} className="vl-class">
                          <button type="button" className="vl-class__head" onClick={() => setOpen(isOpen ? null : cls._id)} aria-expanded={isOpen}>
                            <span className="vl-chapter__num tint-indigo"><Icon name="building" size={18} /></span>
                            <span className="vl-grow">
                              <h3>{cls.className}</h3>
                              <span className="vl-small vl-muted">
                                {plural(cls.sections.length, 'section')}{cls.sections.length ? ` (${cls.sections.map((s) => s.sectionName).join(', ')})` : ''}
                              </span>
                            </span>
                            {!cls.inBoard
                              ? <span className="vl-chip">Not offered by this board</span>
                              : <span className="vl-chip">{plural(cls.subjects.length, 'subject')} · {plural(bookCount, 'book')}</span>}
                            <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={18} />
                          </button>
                          {isOpen ? (
                            <div className="vl-class__body">
                              {!cls.inBoard ? (
                                <Alert variant="info">{data.config.boardName} has no content for {cls.className} in the library.</Alert>
                              ) : (
                                <>
                                  <SubjectsEditor cls={cls} onSaved={refetch} />
                                  {cls.subjects.map((s) => (
                                    <div key={s._id} className="vl-subject">
                                      <div className="vl-subject__head">
                                        <b>{s.name}</b>
                                        <span className="vl-small vl-muted">your subject: {s.schoolSubjectName || '—'}</span>
                                        <span className="vl-right" />
                                        <Button size="sm" variant="secondary" onClick={() => setPicker({ cls, subject: s })}><Icon name="plus" size={14} /> Add a book</Button>
                                      </div>
                                      <div className="vl-subject__body">
                                        {s.books.length ? s.books.map((b) => (
                                          <div key={b.book} className="vl-assign">
                                            <Cover src={b.coverUrl} title={b.title} />
                                            <span className="vl-grow">
                                              <b>{b.title}</b>{b.bookStatus !== 'active' ? <> <StatusBadge status={b.bookStatus} /></> : null}
                                              <span className="vl-small vl-muted" style={{ display: 'block' }}>
                                                {[b.publisher, b.edition].filter(Boolean).join(' · ')}{b.publisher || b.edition ? ' · ' : ''}{plural(b.chapterCount, 'chapter')} · {plural(b.videoCount, 'video')}
                                              </span>
                                            </span>
                                            <span className="vl-chip"><Icon name="users" size={13} /> {b.allSections ? 'All sections' : `Section ${sectionNames(cls, b.sections)}`}</span>
                                            <Button size="sm" variant="secondary" onClick={() => setAssign({ cls, book: b, current: b })}>Change</Button>
                                          </div>
                                        )) : <span className="vl-small vl-muted">No book chosen yet for {s.name}.</span>}
                                      </div>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : <Empty icon="🏫" title="No classes in this year" message="Add classes under Academics › Classes first." />}
              </Panel>
            )}
          </>
        ) : null}
      </Loadable>

      <BookPicker state={picker} onClose={() => setPicker(null)} onPick={(b) => { setAssign({ cls: picker.cls, book: b, current: null }); setPicker(null); }} />
      <AssignDialog state={assign} onClose={() => setAssign(null)} onSaved={refetch} />
      <Confirm open={!!confirmBoard} loading={savingBoard} title="Change the board?" confirmLabel="Change board"
        message={confirmBoard} onClose={() => setConfirmBoard(null)} onConfirm={() => saveBoard(true)} />
    </div>
  );
}
