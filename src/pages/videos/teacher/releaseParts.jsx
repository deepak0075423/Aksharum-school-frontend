/**
 * Teacher → Video Learning: the release form, and the wording releases share.
 *
 * One dialog for the three things a teacher does with it: release something
 * new (a book, a chapter or one video), edit a release that is scheduled or
 * open, and release again something that has ended.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { teacher as api } from '../../../api/video.api';
import { Modal, Button, Alert, Spinner } from '../../../components/ui/index';
import { Icon, errText, toLocalInput, plural } from '../vlParts';

export const LEVEL_WORD = { book: 'Whole book', chapter: 'Chapter', video: 'Single video' };

/** What a release covers, in a line: "Chapter 3: Sandhi" / "the whole book" / the video's title. */
export const releaseWhat = (r) => (r.level === 'book' ? 'The whole book'
  : r.level === 'chapter' ? `Chapter ${r.chapterNumber}: ${r.chapterTitle}` : `${r.videoTitle} (Chapter ${r.chapterNumber})`);

/**
 * @param {object}  props.target  { book: {_id,title}, level, chapter?: {_id,title,chapterNumber}, video?: {_id (chapterVideo), title} }
 * @param {array}   props.sections [{ section, className, sectionName, studentCount }] the teacher may release this book to
 * @param {string}  props.section  the one preselected
 * @param {object}  props.editing  an existing release, when editing
 * @param {object}  props.again    an ended release, when releasing it again
 */
export function ReleaseDialog({ open, target, sections = [], section, editing, again, onClose, onDone }) {
  const source = editing || again;
  const [picked, setPicked] = useState([]);
  const [audience, setAudience] = useState('all');
  const [students, setStudents] = useState([]);
  const [roster, setRoster] = useState(null);
  const [when, setWhen] = useState('now');
  const [releaseAt, setReleaseAt] = useState('');
  const [expires, setExpires] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const live = editing && editing.shownStatus === 'active';     // open already: its start cannot move
  const oneSection = source ? String(source.section) : (picked.length === 1 ? picked[0] : null);

  useEffect(() => {
    if (!open) return;
    setError(''); setSaving(false);
    setPicked(section ? [String(section)] : sections.length === 1 ? [String(sections[0].section)] : []);
    setAudience(source?.audience || 'all');
    setStudents((source?.students || []).map(String));
    const future = editing && new Date(editing.releaseAt) > new Date();
    setWhen(future ? 'later' : 'now');
    setReleaseAt(future ? toLocalInput(editing.releaseAt) : '');
    const keepExpiry = editing?.expiresAt;
    setExpires(!!keepExpiry); setExpiresAt(keepExpiry ? toLocalInput(editing.expiresAt) : '');
    setNote(source?.note || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The students of the section, once "selected students" is chosen for exactly one.
  useEffect(() => {
    if (!open || audience !== 'selected' || !oneSection) { setRoster(null); return undefined; }
    let alive = true;
    setRoster(null);
    api.sectionStudents(oneSection).then((res) => { if (alive) setRoster(res.data || []); }).catch((e) => { if (alive) { setRoster([]); setError(errText(e)); } });
    return () => { alive = false; };
  }, [open, audience, oneSection]);

  const title = editing ? 'Edit release' : again ? 'Release again' : `Release ${target?.level === 'book' ? 'the whole book' : target?.level === 'chapter' ? 'this chapter' : 'this video'}`;
  const what = useMemo(() => {
    if (source) return releaseWhat(source);
    if (!target) return '';
    return target.level === 'book' ? 'Every chapter and every video of the book'
      : target.level === 'chapter' ? `Chapter ${target.chapter.chapterNumber}: ${target.chapter.title} — all its videos`
        : `${target.video.title} — this video only, not the rest of its chapter`;
  }, [source, target]);

  const submit = async () => {
    setError('');
    if (!source && !picked.length) return setError('Choose at least one section');
    if (audience === 'selected' && !students.length) return setError('Choose at least one student, or release to the whole section');
    if (when === 'later' && !releaseAt) return setError('Choose the date and time to release');
    if (expires && !expiresAt) return setError('Choose when the release ends, or untick the expiry');
    const body = {
      audience, students: audience === 'selected' ? students : [],
      expiresAt: expires ? new Date(expiresAt).toISOString() : null, note,
    };
    if (!live) body.releaseAt = when === 'later' ? new Date(releaseAt).toISOString() : null;
    setSaving(true);
    try {
      if (editing) await api.update(editing._id, body);
      else if (again) await api.rerelease(again._id, body);
      else {
        await api.create({ ...body, book: target.book._id, level: target.level, sections: picked,
          chapter: target.chapter?._id, chapterVideo: target.video?._id });
      }
      toast.success(editing ? 'Release updated' : when === 'later' ? 'Release scheduled' : 'Released — your students have been notified');
      onDone?.();
      onClose();
    } catch (e) { setError(errText(e)); }
    finally { setSaving(false); }
  };

  const toggle = (list, set, value) => set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={600}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{editing ? 'Save changes' : when === 'later' ? 'Schedule' : 'Release now'}</Button>
        </>
      )}>
      <div className="vl-stack">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div>
          <div className="form-label">What is released</div>
          <p><b>{(source?.bookTitle) || target?.book?.title}</b></p>
          <p className="vl-muted vl-small">{what}</p>
        </div>

        {source ? (
          <div>
            <div className="form-label">Section</div>
            <p>{source.className} {source.sectionName}</p>
          </div>
        ) : (
          <div>
            <div className="form-label required">Sections</div>
            <div className="vl-checks">
              {sections.map((s) => {
                const on = picked.includes(String(s.section));
                return (
                  <label key={s.section} className={`vl-check${on ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(picked, setPicked, String(s.section))} />
                    {s.className} {s.sectionName} <span className="vl-muted">· {plural(s.studentCount, 'student')}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="form-label">Who can watch</div>
          <div className="vl-checks">
            <label className={`vl-check${audience === 'all' ? ' is-on' : ''}`}>
              <input type="radio" name="vl-audience" checked={audience === 'all'} onChange={() => setAudience('all')} /> Everyone in the section
            </label>
            <label className={`vl-check${audience === 'selected' ? ' is-on' : ''}${!oneSection ? ' is-off' : ''}`}
              title={!oneSection ? 'Choose exactly one section to pick students from it' : undefined}>
              <input type="radio" name="vl-audience" checked={audience === 'selected'} disabled={!oneSection} onChange={() => setAudience('selected')} /> Selected students
            </label>
          </div>
          {audience === 'selected' && oneSection ? (
            <div style={{ marginTop: 10 }}>
              {roster === null ? <Spinner size="sm" /> : roster.length ? (
                <>
                  <div className="vl-row vl-small" style={{ marginBottom: 6 }}>
                    <span className="vl-muted">{students.length} of {roster.length} selected</span>
                    <button type="button" className="vl-link" onClick={() => setStudents(roster.map((r) => String(r._id)))}>Select all</button>
                    <button type="button" className="vl-link" onClick={() => setStudents([])}>Clear</button>
                  </div>
                  <div className="vl-checks" style={{ maxHeight: 180, overflowY: 'auto' }}>
                    {roster.map((r) => {
                      const on = students.includes(String(r._id));
                      return (
                        <label key={r._id} className={`vl-check${on ? ' is-on' : ''}`}>
                          <input type="checkbox" checked={on} onChange={() => toggle(students, setStudents, String(r._id))} />
                          {r.rollNumber ? `${r.rollNumber}. ` : ''}{r.name}
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : <p className="vl-muted vl-small">This section has no students yet.</p>}
            </div>
          ) : null}
        </div>

        {!live ? (
          <div>
            <div className="form-label">When</div>
            <div className="vl-checks">
              <label className={`vl-check${when === 'now' ? ' is-on' : ''}`}>
                <input type="radio" name="vl-when" checked={when === 'now'} onChange={() => setWhen('now')} /> Now
              </label>
              <label className={`vl-check${when === 'later' ? ' is-on' : ''}`}>
                <input type="radio" name="vl-when" checked={when === 'later'} onChange={() => setWhen('later')} /> On a date and time
              </label>
            </div>
            {when === 'later' ? (
              <input type="datetime-local" className="form-control" style={{ marginTop: 10, maxWidth: 260 }} value={releaseAt}
                min={toLocalInput(new Date())} onChange={(e) => setReleaseAt(e.target.value)} aria-label="Release date and time" />
            ) : null}
          </div>
        ) : (
          <Alert variant="info">This release is already open, so its start cannot change. You can still set when it ends and who it is for.</Alert>
        )}

        <div>
          <label className={`vl-check${expires ? ' is-on' : ''}`}>
            <input type="checkbox" checked={expires} onChange={(e) => setExpires(e.target.checked)} /> Close it again on a date
          </label>
          {expires ? (
            <input type="datetime-local" className="form-control" style={{ marginTop: 10, maxWidth: 260 }} value={expiresAt}
              min={toLocalInput(when === 'later' && releaseAt ? releaseAt : new Date())} onChange={(e) => setExpiresAt(e.target.value)} aria-label="Expiry date and time" />
          ) : <div className="form-hint">Left unticked, it stays open until you take it down.</div>}
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="vl-release-note">Note to yourself (optional)</label>
          <input id="vl-release-note" data-text="sentence" className="form-control" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="For example: before the unit test" />
        </div>
      </div>
    </Modal>
  );
}

export const ReleasedTag = ({ status, via, level }) => {
  if (!status) return <span className="vl-chip">Not released</span>;
  const how = via && via !== level ? ` with the ${via}` : '';
  return (
    <span className="vl-chip" style={status === 'active' ? { background: '#d1fae5', borderColor: '#6ee7b7', color: '#065f46' } : { background: '#dbeafe', borderColor: '#93c5fd', color: '#1e40af' }}>
      <Icon name={status === 'active' ? 'checkCircle' : 'clock'} size={13} /> {status === 'active' ? 'Released' : 'Scheduled'}{how}
    </span>
  );
};
