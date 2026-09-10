/**
 * The catalogue search screen's own pieces.
 *
 * Filters here are built from what the collection actually holds — the server
 * sends the categories, languages and subjects it can see, and a filter with
 * nothing behind it is not drawn at all. A dropdown that only ever offers
 * "All" is worse than no dropdown: it promises a way to narrow the list and
 * then refuses to.
 */
import React from 'react';
import Icon from '../../../components/ui/icons';
import { Modal } from '../../../components/ui/index';
import { fileUrl } from '../../admin/listParts';

/** Books and a magnifier. Ornament only — no data, no links. */
export const SearchArt = () => (
  <svg className="libsr-art" viewBox="0 0 250 104" aria-hidden="true" focusable="false">
    <rect x="26" y="72" width="128" height="13" rx="3" fill="#fbbf24" />
    <rect x="20" y="58" width="140" height="14" rx="3" fill="#f59e0b" />
    <rect x="32" y="45" width="116" height="13" rx="3" fill="#818cf8" />
    <rect x="38" y="32" width="104" height="13" rx="3" fill="#6366f1" />
    <rect x="46" y="20" width="88" height="12" rx="3" fill="#34d399" />
    <rect x="40" y="63" width="26" height="4" rx="2" fill="#fff" opacity=".5" />
    <rect x="52" y="37" width="24" height="4" rx="2" fill="#fff" opacity=".5" />
    <rect x="18" y="85" width="150" height="5" rx="2.5" fill="currentColor" opacity=".14" />

    <circle cx="176" cy="44" r="27" fill="#fff" fillOpacity=".55" stroke="currentColor" strokeWidth="5" />
    <circle cx="176" cy="44" r="20" fill="currentColor" opacity=".08" />
    <path d="M196 64l22 22" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
    <path d="M232 16l2.5 6.5 6.5 2.5-6.5 2.5L232 34l-2.5-6.5L223 25l6.5-2.5L232 16Z"
      fill="currentColor" opacity=".35" />
  </svg>
);

// ── Filter rail ──────────────────────────────────────────────────────────────
export const Field = ({ label, children }) => (
  <label className="libsr-field">
    <span>{label}</span>
    {children}
  </label>
);

/** A select built from a facet. Renders nothing when there is nothing to pick. */
export function FacetSelect({ label, allLabel, options, value, onChange, min = 1 }) {
  if (!options || options.length < min) return null;
  return (
    <Field label={label}>
      <select className="form-control" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.value} ({o.count})</option>
        ))}
      </select>
    </Field>
  );
}

// ── A book ───────────────────────────────────────────────────────────────────
export const Cover = ({ book, size = 'sm' }) => {
  const src = fileUrl(book.coverImage);
  return src
    ? <img className={`libsr-cover libsr-cover--${size}`} src={src} alt="" loading="lazy" />
    : (
      <span className={`libsr-cover libsr-cover--${size} libsr-cover--none`} aria-hidden="true">
        <Icon name="book" size={size === 'lg' ? 30 : 18} />
      </span>
    );
};

export const AvailPill = ({ book }) => (
  book.availableCopies > 0
    ? <span className="libsr-pill libsr-t--green">{book.availableCopies} available</span>
    : book.totalCopies > 0
      ? <span className="libsr-pill libsr-t--amber">All copies out</span>
      : <span className="libsr-pill libsr-t--slate">No copies yet</span>
);

/** The queue state a member is in for this book, if any. */
export const HoldPill = ({ hold }) => {
  if (!hold) return null;
  return hold.status === 'ready'
    ? <span className="libsr-pill libsr-t--green">Ready to collect</span>
    : (
      <span className="libsr-pill libsr-t--indigo">
        Reserved{hold.queuePosition ? ` · #${hold.queuePosition}` : ''}
      </span>
    );
};

// ── Book details ─────────────────────────────────────────────────────────────
const DETAIL_ROWS = [
  ['Authors',   (b) => (b.authors || []).join(', ')],
  ['ISBN',      (b) => b.isbn],
  ['Category',  (b) => b.category],
  ['Publisher', (b) => b.publisher],
  ['Edition',   (b) => b.edition],
  ['Language',  (b) => b.language],
  ['Published', (b) => b.publishedYear],
  ['Pages',     (b) => b.pages],
  ['Subjects',  (b) => (b.subjects || []).join(', ')],
  ['Copies',    (b) => (b.totalCopies ? `${b.availableCopies ?? 0} of ${b.totalCopies} on the shelf` : '')],
];

export function BookDetails({ book, onClose, action }) {
  const rows = DETAIL_ROWS
    .map(([label, get]) => [label, get(book)])
    .filter(([, v]) => v !== '' && v != null);
  return (
    <Modal open onClose={onClose} title={book.title} maxWidth={620} footer={action}>
      <div className="libsr-detail">
        <Cover book={book} size="lg" />
        <div className="libsr-detail__body">
          {rows.map(([label, value]) => (
            <div key={label} className="libsr-detail__row">
              <span>{label}</span><strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
      {book.description && <p className="libsr-detail__desc">{book.description}</p>}
    </Modal>
  );
}
