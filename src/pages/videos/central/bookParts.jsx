/**
 * Super Admin → Video Library: the book form, shared by the Books list (add)
 * and a book's own page (edit, new edition).
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { central as api } from '../../../api/video.api';
import { Button, Modal, Alert } from '../../../components/ui/index';
import { levelOf } from '../../../utils/classLevels';
import { ImageField, errText } from '../vlParts';

const BLANK = { title: '', board: '', classLevel: '', subject: '', publisher: '', author: '', isbn: '', edition: '', publicationYear: '', language: '', description: '', coverUrl: '', displayOrder: 0, status: 'active' };

/**
 * @param {object} props.book     the book being edited, or the one a new edition is made from
 * @param {'add'|'edit'|'edition'} props.mode
 * @param {array}  props.boards   active boards, each with classLevels
 * @param {array}  props.subjects every subject, each with mappings [{ board, classLevels }]
 */
export function BookForm({ open, mode = 'add', book, boards = [], subjects = [], preset, onClose, onSaved }) {
  const [f, setF] = useState(BLANK);
  const [copy, setCopy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError(''); setCopy(true);
    if (book) {
      setF({ ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, book[k] ?? BLANK[k]])), classLevel: String(book.classLevel),
        publicationYear: mode === 'edition' ? '' : (book.publicationYear ?? ''), edition: mode === 'edition' ? '' : (book.edition || '') });
    } else setF({ ...BLANK, ...(preset || {}) });
  }, [open, book, mode, preset]);

  const board = boards.find((b) => String(b._id) === String(f.board));
  const levels = useMemo(() => [...(board?.classLevels || [])].sort((a, b) => a - b), [board]);
  // Only the subjects mapped to this board and class can have a book there.
  const offered = useMemo(() => subjects.filter((s) => s.status === 'active' || String(s._id) === String(f.subject))
    .filter((s) => (s.mappings || []).some((m) => String(m.board) === String(f.board) && m.classLevels.includes(Number(f.classLevel)))), [subjects, f.board, f.classLevel, f.subject]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const locked = mode === 'edition';

  const save = async () => {
    if (f.title.trim().length < 2) return setError('Enter the book\'s title');
    if (!f.board || f.classLevel === '' || !f.subject) return setError('Choose the board, the class and the subject');
    if (f.isbn && !/^(\d{9}[\dXx]|\d{13})$/.test(f.isbn.replace(/[\s-]/g, ''))) return setError('ISBN is 10 or 13 digits');
    if (f.publicationYear && !/^\d{4}$/.test(String(f.publicationYear))) return setError('Publication year is four digits');
    if (mode === 'edition' && !f.edition.trim()) return setError('Say which edition this is');
    const body = { ...f, classLevel: Number(f.classLevel), publicationYear: f.publicationYear || null, displayOrder: Number(f.displayOrder) || 0 };
    setError(''); setSaving(true);
    try {
      const res = mode === 'edit' ? await api.updateBook(book._id, body)
        : mode === 'edition' ? await api.newEdition(book._id, { ...body, copyChapters: copy, copyVideos: copy })
          : await api.createBook(body);
      toast.success(mode === 'edit' ? 'Book saved' : mode === 'edition' ? 'New edition created — activate it when it is ready' : 'Book added');
      onSaved(res.data); onClose();
    } catch (e) { setError(errText(e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === 'edit' ? 'Edit book' : mode === 'edition' ? `New edition of ${book?.title || ''}` : 'Add a book'} maxWidth={720}
      footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>{mode === 'edit' ? 'Save' : mode === 'edition' ? 'Create edition' : 'Add book'}</Button></>)}>
      <div className="vl-stack">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="vl-form-grid">
          <div className="form-group"><label className="form-label required" htmlFor="bk-board">Board</label>
            <select id="bk-board" className="form-control" value={f.board} disabled={locked} onChange={(e) => setF({ ...f, board: e.target.value, classLevel: '', subject: '' })}>
              <option value="">Choose…</option>{boards.map((b) => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
            </select></div>
          <div className="form-group"><label className="form-label required" htmlFor="bk-class">Class</label>
            <select id="bk-class" className="form-control" value={f.classLevel} disabled={locked || !f.board} onChange={(e) => setF({ ...f, classLevel: e.target.value, subject: '' })}>
              <option value="">Choose…</option>{levels.map((n) => <option key={n} value={n}>{levelOf(n)?.label || `Class ${n}`}</option>)}
            </select></div>
          <div className="form-group vl-span"><label className="form-label required" htmlFor="bk-subject">Subject</label>
            <select id="bk-subject" className="form-control" value={f.subject} disabled={locked || f.classLevel === ''} onChange={set('subject')}>
              <option value="">Choose…</option>{offered.map((s) => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
            </select>
            {f.classLevel !== '' && !offered.length ? <div className="form-hint">No subject is mapped to this board and class yet. Map one under Subjects first.</div> : null}</div>
          <div className="form-group vl-span"><label className="form-label required" htmlFor="bk-title">Book title</label>
            <input id="bk-title" data-text="title" className="form-control" maxLength={200} value={f.title} onChange={set('title')} /></div>
          <div className="form-group"><label className="form-label" htmlFor="bk-pub">Publisher</label><input id="bk-pub" data-text="title" className="form-control" maxLength={150} value={f.publisher} onChange={set('publisher')} /></div>
          <div className="form-group"><label className="form-label" htmlFor="bk-author">Author</label><input id="bk-author" data-text="title" className="form-control" maxLength={200} value={f.author} onChange={set('author')} /></div>
          <div className="form-group"><label className={`form-label${mode === 'edition' ? ' required' : ''}`} htmlFor="bk-ed">Edition</label><input id="bk-ed" data-text="title" className="form-control" maxLength={60} value={f.edition} onChange={set('edition')} placeholder="2nd edition" /></div>
          <div className="form-group"><label className="form-label" htmlFor="bk-year">Publication year</label><input id="bk-year" inputMode="numeric" className="form-control" maxLength={4} value={f.publicationYear} onChange={(e) => setF({ ...f, publicationYear: e.target.value.replace(/\D/g, '') })} placeholder="2026" /></div>
          <div className="form-group"><label className="form-label" htmlFor="bk-isbn">ISBN (optional)</label><input id="bk-isbn" data-text="code" className="form-control" maxLength={20} value={f.isbn} onChange={set('isbn')} /></div>
          <div className="form-group"><label className="form-label" htmlFor="bk-lang">Language</label><input id="bk-lang" data-text="title" className="form-control" maxLength={40} value={f.language} onChange={set('language')} placeholder="Taken from the subject when left empty" /></div>
          <div className="form-group"><label className="form-label" htmlFor="bk-order">Display order</label><input id="bk-order" type="number" min="0" max="9999" step="1" className="form-control" value={f.displayOrder} onChange={set('displayOrder')} />
            <div className="form-hint">Lower numbers are listed first among a subject's books.</div></div>
          {mode === 'add' ? (
            <div className="form-group"><label className="form-label" htmlFor="bk-status">Status</label>
              <select id="bk-status" className="form-control" value={f.status} onChange={set('status')}><option value="active">Active — offered to schools</option><option value="inactive">Inactive — hidden until it is ready</option></select></div>
          ) : <div />}
          <div className="vl-span"><ImageField label="Book cover" value={f.coverUrl} onChange={(url) => setF((p) => ({ ...p, coverUrl: url }))} upload={api.uploadImage} hint="JPG, PNG or WebP, up to 5 MB" /></div>
          <div className="form-group vl-span"><label className="form-label" htmlFor="bk-desc">Description</label>
            <textarea id="bk-desc" data-text="sentence" className="form-control" rows={3} maxLength={3000} value={f.description} onChange={set('description')} /></div>
        </div>
        {mode === 'edition' ? (
          <label className={`vl-check${copy ? ' is-on' : ''}`} style={{ alignSelf: 'flex-start' }}>
            <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Copy the chapters and their video mappings (the videos themselves are shared, not copied)
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
