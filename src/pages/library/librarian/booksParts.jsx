/**
 * The pieces of the library's book catalogue.
 *
 * A book's **status is derived from its copies**, and the order it is derived
 * in is the point: overdue outranks everything, because it is the only state
 * anybody has to act on. `availableCopies` on its own cannot tell a title with
 * four copies out and one of them weeks late from one that is merely popular —
 * so the server computes the status and this file only reads it.
 *
 * Sorting and filtering both run server-side. The list is paginated, so a
 * client-side filter would narrow one page of eleven books and quietly hide the
 * rest — which is exactly the kind of wrong that looks right.
 */
import React from 'react';
import Icon from '../../../components/ui/icons';

// ── Status ───────────────────────────────────────────────────────────────────

export const STATUS = {
  available:  { label: 'Available',  tone: 'ok' },
  issued_out: { label: 'All out',    tone: 'warn' },
  overdue:    { label: 'Overdue',    tone: 'bad' },
  no_copies:  { label: 'No copies',  tone: 'mute' },
};

export const StatusChip = ({ status }) => {
  const s = STATUS[status] || STATUS.no_copies;
  return <span className={`libb-status is-${s.tone}`}>{s.label}</span>;
};

export const STATUS_FILTERS = [
  ['', 'Any status'],
  ['available', 'Available'],
  ['issued_out', 'All copies out'],
  ['overdue', 'Has an overdue copy'],
  ['no_copies', 'No copies registered'],
];

// ── Cells ────────────────────────────────────────────────────────────────────

/**
 * The catalogue holds no cover art, so a book leads with its spine — the
 * initial on a coloured block. A stock image would imply the library has a
 * picture of this book, which it does not.
 */
export const Spine = ({ title }) => (
  <span className="libb-spine" aria-hidden>{(title || '?').charAt(0).toUpperCase()}</span>
);

export const TitleCell = ({ book }) => (
  <span className="libb-title">
    <Spine title={book.title} />
    <span>
      <b>{book.title}</b>
      {book.publisher ? <small>{book.publisher}</small> : null}
    </span>
  </span>
);

export const AuthorsCell = ({ book }) => {
  const list = book.authors || [];
  if (!list.length) return <span className="lnone">Not recorded</span>;
  return <span title={list.join(', ')} className="libb-authors">{list.join(', ')}</span>;
};

/**
 * Copies on the shelf against copies owned.
 *
 * A catalogue entry with no copies can never be issued, so it is called out
 * rather than shown as a bare "0 / 0".
 */
export const CopiesCell = ({ value, total, of }) => {
  if (!of) return <span className="lnone">—</span>;
  return (
    <span className="libb-copies">
      <b className={value === 0 ? 'is-none' : undefined}>{value}</b>
      {total ? <small>of {total}</small> : null}
    </span>
  );
};

// ── Sorting ──────────────────────────────────────────────────────────────────

/**
 * A column heading that sorts.
 *
 * The whole catalogue is paginated server-side, so the sort travels with the
 * request — sorting the twenty rows on screen would put the wrong twenty at the
 * top of the next page.
 */
export const SortHead = ({ label, field, sort, onSort, align }) => {
  const on = sort.by === field;
  return (
    <button type="button" className={`libb-sort${on ? ' is-on' : ''}${align === 'right' ? ' is-right' : ''}`}
      onClick={() => onSort(field)}
      aria-label={`Sort by ${label}${on && sort.dir === 'asc' ? ', currently ascending' : on ? ', currently descending' : ''}`}>
      {label}
      <Icon name={on ? (sort.dir === 'desc' ? 'arrowDown' : 'arrowUp') : 'chevronDown'} size={12} />
    </button>
  );
};

// ── Filters ──────────────────────────────────────────────────────────────────

export const FiltersPanel = ({ category, status, categories, onCategory, onStatus, onReset }) => (
  <div className="libb-filters">
    <label>
      Category
      <select className="form-control" value={category} onChange={(e) => onCategory(e.target.value)}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
        ))}
      </select>
    </label>

    <label>
      Status
      <select className="form-control" value={status} onChange={(e) => onStatus(e.target.value)}>
        {STATUS_FILTERS.map(([v, l]) => <option key={v || 'any'} value={v}>{l}</option>)}
      </select>
    </label>

    <button type="button" className="btn btn-secondary" onClick={onReset}>
      <Icon name="refresh" size={15} /> Reset
    </button>
  </div>
);

/** A filter in force says so, and can be lifted from where it is showing. */
export const Chip = ({ label, onClear }) => (
  <span className="libd-chip">
    {label}
    <button type="button" onClick={onClear} aria-label={`Remove ${label}`}>×</button>
  </span>
);

// ── The catalogue entry form ─────────────────────────────────────────────────

/** What a book record is made of, blank. */
export const EMPTY_BOOK = {
  title: '', authors: '', isbn: '', publisher: '',
  category: '', edition: '', language: 'English', description: '',
};

/** An existing book, in the shape the form edits. */
export const bookToForm = (b) => ({
  title: b?.title || '',
  authors: (b?.authors || []).join(', '),
  isbn: b?.isbn || '',
  publisher: b?.publisher || '',
  category: b?.category || '',
  edition: b?.edition || '',
  language: b?.language || 'English',
  description: b?.description || '',
});

/** The form's fields, in the shape the endpoint takes. */
export const formToBook = (form) => ({
  ...form,
  authors: String(form.authors || '').split(',').map((a) => a.trim()).filter(Boolean),
});

/**
 * The fields of a catalogue entry, shared by the list's Add/Edit dialog and the
 * book's own page. One copy, because two forms for one record drift: `edition`
 * was on the model and in the update endpoint, and neither form ever offered it
 * — which matters, since a title, its ISBN and its edition together are what
 * decide whether a book is a duplicate.
 */
export const BookFields = ({ form, onChange }) => {
  const set = (key) => (e) => onChange(key, e.target.value);
  return (
    <>
      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="form-label required">Title</label>
          <input className="form-control" required value={form.title} onChange={set('title')} />
        </div>
        <div className="form-group">
          <label className="form-label">Author(s)</label>
          <input className="form-control" value={form.authors} placeholder="Comma-separated"
            onChange={set('authors')} />
        </div>
      </div>
      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="form-label">ISBN</label>
          <input className="form-control" value={form.isbn} onChange={set('isbn')} />
          <div className="form-hint">10 or 13 digits. Hyphens and spaces are fine.</div>
        </div>
        <div className="form-group">
          <label className="form-label">Publisher</label>
          <input className="form-control" value={form.publisher} onChange={set('publisher')} />
        </div>
      </div>
      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="form-label">Category</label>
          <input className="form-control" value={form.category} onChange={set('category')} />
        </div>
        <div className="form-group">
          <label className="form-label">Edition</label>
          <input className="form-control" value={form.edition} placeholder="e.g. 3rd" onChange={set('edition')} />
          <div className="form-hint">Two editions of one title are two catalogue entries.</div>
        </div>
      </div>
      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="form-label">Language</label>
          <input className="form-control" value={form.language} onChange={set('language')} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-control" rows={3} value={form.description} onChange={set('description')} />
      </div>
    </>
  );
};
