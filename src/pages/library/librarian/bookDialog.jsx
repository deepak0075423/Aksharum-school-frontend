/**
 * Adding a title to the catalogue, and editing one.
 *
 * One dialog for both, because they are the same record — the only difference
 * is that a new title can bring its copies with it. That is the point of the
 * right-hand column: a catalogue entry with no physical copies cannot be issued
 * or reserved, and asking for them in a second dialog afterwards was a step
 * everybody had to take and half of them forgot.
 *
 * The cover is uploaded after the book exists, because the file needs something
 * to belong to. That is the only reason saving happens in two steps, and a
 * failed upload never loses the record — it says the book was saved and the
 * cover was not.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { createBook, updateBook, uploadBookCover } from '../../../api/library.api';
import { Alert, Button, Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { fileUrl } from '../../admin/listParts';
import { EMPTY_BOOK, bookToForm, formToBook } from './booksParts';

// The languages a school library here actually shelves, plus a way out of the
// list — the column is free text, so the select must never be a cage.
const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Gujarati', 'Bengali', 'Tamil',
  'Telugu', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu', 'Sanskrit', 'French', 'German'];

const CONDITIONS = ['new', 'good', 'fair', 'damaged'];

// What the cover dropzone accepts, matched to what the server's image filter
// lets through. 2MB is a cover; anything bigger is a scan nobody needed.
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const COVER_MAX = 2 * 1024 * 1024;

const EMPTY_COPIES = {
  copies: 1, autoCodes: true, codes: '', detail: false,
  condition: 'new', rackLocation: '', acquisitionDate: '', vendor: '', billNumber: '', cost: '',
};

const EMPTY_EXTRA = { subjects: '', publishedYear: '', pages: '' };

/**
 * `book` decides the mode: absent means a new title, present means editing that
 * one. `categories` are the categories already in use, so the catalogue does
 * not sprout "Fiction", "fiction" and "Ficton" through a free text box.
 */
export default function BookDialog({ open, book, categories = [], onClose, onSaved }) {
  const editing = !!book;

  const [form,  setForm]  = useState(EMPTY_BOOK);
  const [extra, setExtra] = useState(EMPTY_EXTRA);
  const [stock, setStock] = useState(EMPTY_COPIES);
  const [shelved, setShelved] = useState(true);
  const [again,  setAgain]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [dup,    setDup]    = useState(null);
  const [newCat, setNewCat] = useState(false);
  const [newLang, setNewLang] = useState(false);
  const titleRef = useRef(null);

  // The cover: a file waiting to be sent, the path already stored, or neither.
  const [cover, setCover]   = useState(null);     // File
  const [preview, setPreview] = useState('');     // object URL or stored path
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  /**
   * The catalogue's categories, as names.
   *
   * The books endpoint sends them as `{ category, count }` — the filter panel
   * shows the count beside each — so a list of plain strings cannot be assumed.
   * Sorting the objects as if they were strings threw during render, and with
   * no error boundary above it that blanked the whole page.
   */
  const chosenCategories = useMemo(() => {
    const names = (categories || [])
      .map((c) => (typeof c === 'string' ? c : c?.category))
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [categories]);

  useEffect(() => {
    if (!open) return;
    const seed = editing ? bookToForm(book) : EMPTY_BOOK;
    setForm(seed);
    setExtra(editing ? {
      subjects: (book.subjects || []).join(', '),
      publishedYear: book.publishedYear ?? '',
      pages: book.pages ?? '',
    } : EMPTY_EXTRA);
    setStock(EMPTY_COPIES);
    setShelved(true); setAgain(false); setDup(null);
    setCover(null);
    setPreview(editing && book.coverImage ? fileUrl(book.coverImage) : '');
    // A category or language already on the record that is not in the lists has
    // to stay editable, so those open in their free-text state.
    setNewCat(!!seed.category && !chosenCategories.includes(seed.category));
    setNewLang(!!seed.language && !LANGUAGES.includes(seed.language));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, book]);

  // An object URL is a handle on memory; drop it when the preview moves on.
  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setCopy = (key, value) => setStock((s) => ({ ...s, [key]: value }));

  const count = Number(stock.copies);
  const copiesValid = Number.isInteger(count) && count >= 0 && count <= 100;

  // ── The cover ────────────────────────────────────────────────────────────
  const takeCover = (file) => {
    if (!file) return;
    if (!COVER_TYPES.includes(file.type)) return toast.error('Covers must be a JPG, PNG or WebP');
    if (file.size > COVER_MAX) return toast.error('That image is over 2MB — use a smaller one');
    setCover(file);
    setPreview((old) => { if (old.startsWith('blob:')) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
  };

  const dropCover = (e) => {
    e.preventDefault();
    setDragging(false);
    takeCover(e.dataTransfer.files?.[0]);
  };

  const clearCover = () => {
    setCover(null);
    setPreview((old) => { if (old.startsWith('blob:')) URL.revokeObjectURL(old); return ''; });
    if (fileRef.current) fileRef.current.value = '';
  };

  /** Sends the file once the book has an id to hang it on. */
  const sendCover = async (id) => {
    if (!cover || !id) return;
    try { await uploadBookCover(id, cover); }
    catch (err) { toast.error(`Saved, but the cover did not upload: ${err?.message || 'try again from the book’s page'}`, { duration: 7000 }); }
  };

  // ── Saving ───────────────────────────────────────────────────────────────
  const payload = () => ({
    ...formToBook(form),
    subjects: extra.subjects,
    publishedYear: extra.publishedYear === '' ? null : extra.publishedYear,
    pages: extra.pages === '' ? null : extra.pages,
  });

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('A title is required');
    if (!editing && !copiesValid) return toast.error('Copies must be a whole number between 0 and 100');

    const typed = stock.codes.split(/[\n,]/).map((c) => c.trim()).filter(Boolean);
    if (!editing && count > 0 && !stock.autoCodes && typed.length !== count)
      return toast.error(`Enter ${count} copy code${count === 1 ? '' : 's'} — ${typed.length} given`);

    setSaving(true);
    try {
      if (editing) {
        await updateBook(book._id, {
          ...payload(),
          // An empty string clears the stored cover; leaving it out keeps it.
          ...(!preview && book.coverImage ? { coverImage: '' } : {}),
        });
        await sendCover(book._id);
        toast.success('Book updated');
        onSaved?.(book._id);
        onClose();
        return;
      }

      const res = await createBook({
        ...payload(),
        copies: count,
        availability: shelved ? 'available' : 'processing',
        ...(count > 0 && !stock.autoCodes ? { copyCodes: typed } : {}),
        ...(count > 0 && stock.detail ? {
          condition: stock.condition,
          rackLocation: stock.rackLocation,
          acquisitionDate: stock.acquisitionDate || undefined,
          vendor: stock.vendor,
          billNumber: stock.billNumber,
          cost: stock.cost === '' ? undefined : Number(stock.cost),
        } : {}),
      });
      const id = res?.data?._id;
      await sendCover(id);

      toast.success(count > 0
        ? `“${form.title.trim()}” added with ${count} cop${count === 1 ? 'y' : 'ies'}${shelved ? '' : ' — off the shelf until processed'}`
        : `“${form.title.trim()}” catalogued — add copies before it can be issued`);
      onSaved?.(id);

      // Cataloguing a stack of books is one dialog, not twenty.
      if (again) {
        setForm(EMPTY_BOOK);
        setExtra(EMPTY_EXTRA);
        setStock((s) => ({ ...EMPTY_COPIES, copies: s.copies, autoCodes: s.autoCodes }));
        setDup(null); clearCover();
        titleRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      // The server refuses a title that already exists and says which one, so
      // the librarian can go and add copies to it instead of retyping it.
      if (err?.data?.code === 'DUPLICATE_BOOK') setDup({ message: err.message, ...err.data.data });
      else toast.error(err?.message || 'Could not save the book');
    } finally { setSaving(false); }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} maxWidth={960}
        title={(
          <span className="libx-title">
            <span className="libx-title__icon tint-indigo"><Icon name="book" size={20} /></span>
            <span>
              <b>{editing ? 'Edit Book' : 'Add New Book'}</b>
              <small>{editing
                ? 'Change what the catalogue records about this title'
                : 'Add a new book to your library collection'}</small>
            </span>
          </span>
        )}
        footer={(
          <>
            {!editing && (
              <label className="libx-foot__note libx-again">
                <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
                Add another book after saving
              </label>
            )}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button form="book-dialog-form" type="submit" loading={saving}>
              <Icon name={editing ? 'checkCircle' : 'plus'} size={15} />
              {editing ? 'Save changes' : 'Add Book'}
            </Button>
          </>
        )}>
        <form id="book-dialog-form" onSubmit={save} className="libx-grid libbk-grid">
          {/* ── The record ───────────────────────────────────────────────── */}
          <section className="libx-pane">
            <h4>Book information</h4>
            <p className="libx-hint libbk-sub">Enter the essential details about the book</p>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label required">Title</label>
                <input ref={titleRef} className="form-control" required autoFocus maxLength={300}
                  placeholder="Enter book title" value={form.title}
                  onChange={(e) => set('title', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Author(s)</label>
                <input className="form-control" placeholder="e.g. J.K. Rowling, John Smith"
                  value={form.authors} onChange={(e) => set('authors', e.target.value)} />
                <div className="form-hint">Separate several with commas.</div>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">ISBN</label>
                <input className="form-control" placeholder="e.g. 9780141439563"
                  value={form.isbn} onChange={(e) => set('isbn', e.target.value)} />
                <div className="form-hint">10 or 13 digits. Hyphens and spaces are fine.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Publisher</label>
                <input className="form-control" placeholder="e.g. Bloomsbury"
                  value={form.publisher} onChange={(e) => set('publisher', e.target.value)} />
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Category</label>
                {newCat || !chosenCategories.length ? (
                  <input className="form-control" placeholder="e.g. Fiction" value={form.category}
                    onChange={(e) => set('category', e.target.value)} />
                ) : (
                  <select className="form-control" value={form.category}
                    onChange={(e) => {
                      if (e.target.value === '__new') { setNewCat(true); set('category', ''); return; }
                      set('category', e.target.value);
                    }}>
                    <option value="">Select a category</option>
                    {chosenCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value="__new">＋ New category…</option>
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Subjects / Tags</label>
                <input className="form-control" placeholder="e.g. Fantasy, Adventure, Magic"
                  value={extra.subjects}
                  onChange={(e) => setExtra((x) => ({ ...x, subjects: e.target.value }))} />
                <div className="form-hint">Keywords separated by commas — up to 20.</div>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Language</label>
                {newLang ? (
                  <input className="form-control" placeholder="Language" value={form.language}
                    onChange={(e) => set('language', e.target.value)} />
                ) : (
                  <select className="form-control" value={form.language}
                    onChange={(e) => {
                      if (e.target.value === '__new') { setNewLang(true); set('language', ''); return; }
                      set('language', e.target.value);
                    }}>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                    <option value="__new">Another language…</option>
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Edition</label>
                <input className="form-control" placeholder="e.g. 3rd" value={form.edition}
                  onChange={(e) => set('edition', e.target.value)} />
                <div className="form-hint">Two editions of one title are two catalogue entries.</div>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Publication year</label>
                <input type="number" className="form-control" placeholder="e.g. 1998"
                  min={1450} max={new Date().getFullYear() + 1} step={1} value={extra.publishedYear}
                  onChange={(e) => setExtra((x) => ({ ...x, publishedYear: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Number of pages</label>
                <input type="number" className="form-control" placeholder="e.g. 341"
                  min={1} max={20000} step={1} value={extra.pages}
                  onChange={(e) => setExtra((x) => ({ ...x, pages: e.target.value }))} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-control" rows={4} maxLength={1000} value={form.description}
                placeholder="Enter a short description about the book…"
                onChange={(e) => set('description', e.target.value)} />
              <div className="form-hint libx-count">{(form.description || '').length}/1000</div>
            </div>
          </section>

          {/* ── The cover, the copies, and whether they go on the shelf ──── */}
          <section className="libx-pane libbk-side">
            <div className="libbk-card">
              <h4>Book cover</h4>
              <p className="libx-hint libbk-sub">Upload a cover image (optional)</p>

              {preview ? (
                <div className="libbk-cover">
                  <img src={preview} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  <div className="libbk-cover__acts">
                    <button type="button" onClick={() => fileRef.current?.click()}>
                      <Icon name="upload" size={14} /> Replace
                    </button>
                    <button type="button" className="is-danger" onClick={clearCover}>
                      <Icon name="trash" size={14} /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button"
                  className={`libbk-drop${dragging ? ' is-over' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={dropCover}>
                  <span className="libbk-drop__icon"><Icon name="upload" size={22} /></span>
                  <b>Drag and drop an image here</b>
                  <small>or click to browse</small>
                  <em>JPG, PNG or WebP · up to 2MB</em>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
                onChange={(e) => takeCover(e.target.files?.[0])} />
              {!editing && cover && (
                <p className="libx-hint">Uploaded once the book is saved.</p>
              )}
            </div>

            {!editing && (
              <>
                <div className="libbk-card">
                  <h4>Copies</h4>
                  <p className="libx-hint libbk-sub">Add initial copies for this book</p>

                  <div className="form-group">
                    <label className="form-label required">Number of copies</label>
                    <input type="number" className="form-control" min={0} max={100} step={1}
                      value={stock.copies}
                      onChange={(e) => setCopy('copies', e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>

                  {count === 0 ? (
                    <Alert variant="warning">
                      A title with no copies is catalogued but cannot be issued or reserved.
                      Register copies later from the book’s own page.
                    </Alert>
                  ) : (
                    <>
                      <label className="libx-check">
                        <input type="checkbox" checked={stock.autoCodes}
                          onChange={(e) => setCopy('autoCodes', e.target.checked)} />
                        <span>
                          <b>Auto-generate copy codes</b>
                          <small>Codes come from the library’s own sequence — LIB-COPY-000042 and up.</small>
                        </span>
                      </label>

                      {!stock.autoCodes && (
                        <div className="form-group">
                          <label className="form-label required">Copy codes</label>
                          <textarea className="form-control" rows={Math.min(6, Math.max(2, count))}
                            placeholder={'One per line, or comma separated\ne.g. ACC-1024'}
                            value={stock.codes} onChange={(e) => setCopy('codes', e.target.value)} />
                          <div className="form-hint">
                            {count} needed. Use these when the books already carry accession numbers —
                            the library’s own sequence is left untouched.
                          </div>
                        </div>
                      )}

                      <label className="libx-check">
                        <input type="checkbox" checked={stock.detail}
                          onChange={(e) => setCopy('detail', e.target.checked)} />
                        <span>
                          <b>Record where they came from</b>
                          <small>Rack, condition, vendor, bill and cost — what a stock audit asks for.</small>
                        </span>
                      </label>

                      {stock.detail && (
                        <div className="libx-detail">
                          <div className="form-row form-row-2">
                            <div className="form-group">
                              <label className="form-label">Condition</label>
                              <select className="form-control" value={stock.condition}
                                onChange={(e) => setCopy('condition', e.target.value)}>
                                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div className="form-group">
                              <label className="form-label">Rack</label>
                              <input className="form-control" placeholder="e.g. A-01" value={stock.rackLocation}
                                onChange={(e) => setCopy('rackLocation', e.target.value)} />
                            </div>
                          </div>
                          <div className="form-row form-row-2">
                            <div className="form-group">
                              <label className="form-label">Acquired on</label>
                              <input type="date" className="form-control" value={stock.acquisitionDate}
                                onChange={(e) => setCopy('acquisitionDate', e.target.value)} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Cost per copy (₹)</label>
                              <input type="number" className="form-control" min={0} step="0.01" value={stock.cost}
                                onChange={(e) => setCopy('cost', e.target.value)} />
                            </div>
                          </div>
                          <div className="form-row form-row-2">
                            <div className="form-group">
                              <label className="form-label">Vendor</label>
                              <input className="form-control" placeholder="Who it was bought from"
                                value={stock.vendor} onChange={(e) => setCopy('vendor', e.target.value)} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Bill number</label>
                              <input className="form-control" placeholder="Invoice reference"
                                value={stock.billNumber} onChange={(e) => setCopy('billNumber', e.target.value)} />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {count > 0 && (
                  <div className="libbk-card">
                    <h4>Availability</h4>
                    <p className="libx-hint libbk-sub">Where these copies start</p>

                    <label className={`libbk-radio${shelved ? ' is-on' : ''}`}>
                      <input type="radio" name="availability" checked={shelved}
                        onChange={() => setShelved(true)} />
                      <span>
                        <b>Available for issue</b>
                        <small>On the shelf and lendable straight away.</small>
                      </span>
                    </label>
                    <label className={`libbk-radio${!shelved ? ' is-on' : ''}`}>
                      <input type="radio" name="availability" checked={!shelved}
                        onChange={() => setShelved(false)} />
                      <span>
                        <b>Not available yet</b>
                        <small>Owned but out of circulation — covering, labelling, cataloguing.
                          Mark them available from the book’s page when they reach the shelf.</small>
                      </span>
                    </label>
                  </div>
                )}
              </>
            )}
          </section>
        </form>
      </Modal>

      {/* A second physical book is a copy, not a second catalogue entry — the
          refusal has to lead somewhere useful or it is just an obstacle. */}
      <Modal open={!!dup} onClose={() => setDup(null)} title="This book is already listed" maxWidth={460}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDup(null)}>Back to the form</Button>
            <Button onClick={() => { const id = dup.existingBookId; setDup(null); onClose(); onSaved?.(id, { open: true }); }}>
              Open that entry
            </Button>
          </>
        )}>
        <p style={{ color: 'var(--text-muted)' }}>{dup?.message}</p>
      </Modal>
    </>
  );
}
