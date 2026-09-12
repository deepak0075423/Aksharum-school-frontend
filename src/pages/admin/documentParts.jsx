/**
 * The pieces the admin Documents landing page is built from.
 *
 * Documents is a list page, but not the one listParts.jsx describes: it leads
 * with a marked header and an action rather than a spot drawing and a quote,
 * its tiles carry a month-on-month change, its rows have no tick column and no
 * row number, and the same shelf can be read as a table or as cards. So the
 * frame is its own — the same convention leaveParts.jsx follows — and it
 * borrows only .card, .btn, .badge and the .tint-* icon tints.
 *
 * Everything here is prefixed `doc` so nothing reaches another page.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Empty, Spinner } from '../../components/ui/index';

// ── What a document can be ───────────────────────────────────────────────────

/**
 * The fixed taxonomy behind the TYPE column and the tabs.
 *
 * Deliberately not the school's own category list: a tab called
 * "Notices/Circulars" has to mean the same thing in every school, and a
 * free-text label one school spells "Notice" and another "Circulars & Notices"
 * cannot carry it. The school's own filing label sits beside this as
 * `category`, and is what the All Categories dropdown filters on.
 */
export const DOC_TYPES = [
  { value: 'notice',         label: 'Notice',         tone: 'indigo' },
  { value: 'circular',       label: 'Circular',       tone: 'blue'   },
  { value: 'study_material', label: 'Study Material', tone: 'purple' },
  { value: 'assignment',     label: 'Assignment',     tone: 'violet' },
  { value: 'other',          label: 'Other',          tone: 'slate'  },
];

export const typeOf = (v) => DOC_TYPES.find((t) => t.value === v) || DOC_TYPES[DOC_TYPES.length - 1];

/** Who a document is shared with, and what the sharing form calls each choice. */
export const TARGET_TYPES = [
  { value: 'whole_school',      label: 'Whole School',      icon: 'school', hint: 'Everyone in the school' },
  { value: 'class',             label: 'By Class',          icon: 'layers', hint: 'Every section of the chosen classes' },
  { value: 'class_sections',    label: 'By Section',        icon: 'layers', hint: 'Only the chosen sections' },
  { value: 'all_teachers',      label: 'All Teachers',      icon: 'users',  hint: 'Every teacher, no students' },
  { value: 'specific_teachers', label: 'Specific Teachers', icon: 'user',   hint: 'Hand-picked teachers' },
];

export const targetLabel = (v) => TARGET_TYPES.find((t) => t.value === v)?.label || v || '—';

/** The tab strip. No counts in the labels — the tiles above already carry the figures. */
export const TABS = [
  { value: 'all',         label: 'All Documents' },
  { value: 'assignments', label: 'Assignments'   },
  { value: 'notices',     label: 'Notices/Circulars' },
  { value: 'study',       label: 'Study Material' },
];

export const SORTS = [
  { value: 'newest',  label: 'Newest first' },
  { value: 'oldest',  label: 'Oldest first' },
  { value: 'title',   label: 'Title (A–Z)' },
  { value: 'title_z', label: 'Title (Z–A)' },
  { value: 'type',    label: 'Type' },
  { value: 'due',     label: 'Due date' },
];

export const TARGET_FILTERS = [
  { value: 'classes',           label: 'Shared with Classes' },
  { value: 'teachers',          label: 'Shared with Teachers' },
  { value: 'whole_school',      label: 'Whole School' },
  { value: 'class',             label: 'By Class' },
  { value: 'class_sections',    label: 'By Section' },
  { value: 'all_teachers',      label: 'All Teachers' },
  { value: 'specific_teachers', label: 'Specific Teachers' },
];

// ── Files ────────────────────────────────────────────────────────────────────

// Uploads are written with an absolute path on the server's own disk, so the
// browser URL is whatever follows `uploads/` hung off the backend root — which
// is NOT under /api. listParts' fileUrl cannot be reused: it assumes a path
// already relative to that root.
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

export function fileUrl(filePath) {
  if (!filePath) return '';
  if (/^https?:/.test(filePath)) return filePath;
  const p   = filePath.replace(/\\/g, '/');
  const idx = p.indexOf('uploads/');
  return idx !== -1 ? `${API_BASE}/${p.slice(idx)}` : `${API_BASE}/${p.replace(/^\//, '')}`;
}

/**
 * What a file is, from its own name and type.
 *
 * Read off the extension first and the MIME type second: the extension is what
 * the person who uploaded it sees, and a browser that guessed
 * `application/octet-stream` at upload time should not turn their .pdf into a
 * grey square.
 */
const FILE_LOOKS = [
  { exts: ['pdf'],                             mime: /pdf/,                            ext: 'PDF',  icon: 'filePdf',    tone: 'red'    },
  { exts: ['doc', 'docx', 'odt', 'rtf', 'txt'], mime: /word|wordprocessing|text\/plain/, ext: 'DOC',  icon: 'fileDoc',    tone: 'blue'   },
  { exts: ['xls', 'xlsx', 'csv', 'ods'],       mime: /excel|spreadsheet|csv/,          ext: 'XLS',  icon: 'fileSheet',  tone: 'green'  },
  { exts: ['ppt', 'pptx', 'odp'],              mime: /powerpoint|presentation/,        ext: 'PPT',  icon: 'fileSlides', tone: 'orange' },
  { exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'], mime: /^image\//, ext: 'IMG', icon: 'fileImage', tone: 'purple' },
  { exts: ['zip', 'rar', '7z', 'tar', 'gz'],   mime: /zip|compressed|x-tar/,           ext: 'ZIP',  icon: 'files',      tone: 'slate'  },
  { exts: ['mp4', 'mov', 'avi', 'mkv', 'webm'], mime: /^video\//,                      ext: 'VID',  icon: 'film',       tone: 'pink'   },
];

export function fileLook(file) {
  // Tested separately, NOT against one concatenated string: an extension is
  // anchored to the end of the NAME, and gluing the MIME type on after it moves
  // that end. A .docx with no MIME recorded came out as a generic purple square.
  const name = String(file?.originalName || '').toLowerCase();
  const mime = String(file?.mimeType || '').toLowerCase();
  const ext  = name.includes('.') ? name.split('.').pop() : '';

  const hit = FILE_LOOKS.find((f) => (ext && f.exts.includes(ext)) || (mime && f.mime.test(mime)));
  if (hit) return hit;
  return {
    ext: ext && ext.length <= 4 ? ext.toUpperCase() : 'FILE',
    icon: 'fileDoc',
    tone: 'purple',
  };
}

export function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

// Spelled out rather than left to Intl: current ICU renders September as
// "Sept", which is a character wider than every other month and leaves the
// Uploaded On column visibly ragged.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
};

/** The coloured square that leads every row — the file's kind, before its name. */
export const FileMark = ({ file, size = 44 }) => {
  const look = fileLook(file || {});
  return (
    <span className={`docmark tint-${look.tone}`}
      style={{ width: size, height: size }}
      title={file?.originalName ? `${look.ext} — ${file.originalName}` : look.ext}>
      <Icon name={look.icon} size={Math.round(size * 0.46)} />
    </span>
  );
};

// ── Page frame ───────────────────────────────────────────────────────────────

export const Crumbs = ({ here }) => (
  <div className="breadcrumb">
    <Link to="/admin/dashboard">Dashboard</Link>
    <span aria-hidden>›</span>
    <span>{here}</span>
  </div>
);

/** The header: a mark, what the page is, the line under it, and the one action. */
export const DocHero = ({ title, subtitle, action }) => (
  <header className="dochero">
    <span className="dochero__mark"><Icon name="files" size={30} /></span>
    <div className="dochero__text">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    {action ? <div className="dochero__act">{action}</div> : null}
  </header>
);

export const DocStats = ({ children }) => <div className="docstats">{children}</div>;

/**
 * One figure over the shelf, and how it moved.
 *
 * `change` is a percentage against the same total as it stood at the end of
 * last month — the quantity printed beside it, not a different one. It is null
 * when there was nothing to compare against, and the tile then says what was
 * added instead of inventing a percentage off zero.
 */
export const DocStat = ({ icon, tone, value, label, change, added, onClick, on }) => {
  const dir = change == null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const body = (
    <>
      <span className={`docstat__icon tint-${tone}`}><Icon name={icon} size={22} /></span>
      <span className="docstat__body">
        <span className="docstat__value">{value ?? 0}</span>
        <span className="docstat__label">{label}</span>
      </span>
      <span className="docstat__trend">
        {dir
          ? (
            <>
              <span className={`docstat__delta is-${dir}`}>
                <Icon name={change < 0 ? 'arrowDown' : 'arrowUp'} size={13} />
                {Math.abs(change)}%
              </span>
              <small>vs last month</small>
            </>
          )
          : (
            <>
              <span className="docstat__delta is-new">
                {added > 0 ? `+${added}` : '—'}
              </span>
              <small>{added > 0 ? 'this month' : 'no history'}</small>
            </>
          )}
      </span>
    </>
  );
  if (!onClick) return <div className="docstat">{body}</div>;
  return (
    <button type="button" className={`docstat${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      {body}
    </button>
  );
};

export const DocTabs = ({ tabs, value, onChange }) => (
  <div className="doctabs" role="tablist">
    {tabs.map((t) => (
      <button key={t.value} type="button" role="tab" aria-selected={value === t.value}
        className={`doctab${value === t.value ? ' is-on' : ''}`}
        onClick={() => onChange(t.value)}>
        {t.label}
      </button>
    ))}
  </div>
);

// ── Toolbar ──────────────────────────────────────────────────────────────────

export const DocTools = ({ children }) => <div className="doctools">{children}</div>;

export const SearchField = ({ value, onChange, placeholder }) => (
  <div className="docsearch">
    <Icon name="search" size={17} />
    <input className="form-control" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    {value && (
      <button type="button" className="docsearch__clear" onClick={() => onChange('')} aria-label="Clear search">
        <Icon name="close" size={15} />
      </button>
    )}
  </div>
);

/** One inline dropdown. `all` is the everything option, so an unset filter still reads as a sentence. */
export const Picker = ({ value, onChange, all, options, label }) => (
  <select className={`form-control docsel${value ? ' is-on' : ''}`} value={value}
    onChange={(e) => onChange(e.target.value)} aria-label={label}>
    <option value="">{all}</option>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}{o.count != null ? ` (${o.count})` : ''}
      </option>
    ))}
  </select>
);

/**
 * Sort, as a button rather than a bare select.
 *
 * The native select is still the control — it is laid transparently over the
 * face, so the keyboard, the screen reader and a phone's picker all behave
 * exactly as they do everywhere else in the app. Only the painting is ours.
 * At its default it reads "Sort by"; once changed it says what it is sorted by,
 * because a control that hides its own state is a control you check twice.
 */
export const SortMenu = ({ value, onChange, options, defaultValue = 'newest' }) => {
  const set = value !== defaultValue;
  return (
    <div className={`docsort${set ? ' is-on' : ''}`}>
      <Icon name="sliders" size={16} />
      <span>{set ? options.find((o) => o.value === value)?.label : 'Sort by'}</span>
      <Icon name="chevronDown" size={15} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Sort documents">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
};

/** Table or cards. Held here rather than in a filter panel: it changes nothing about the data. */
export const ViewSwitch = ({ value, onChange }) => (
  <div className="docview" role="group" aria-label="View">
    {[['list', 'list', 'List view'], ['grid', 'grid', 'Card view']].map(([v, icon, label]) => (
      <button key={v} type="button" className={`docview__btn${value === v ? ' is-on' : ''}`}
        onClick={() => onChange(v)} title={label} aria-label={label} aria-pressed={value === v}>
        <Icon name={icon} size={17} />
      </button>
    ))}
  </div>
);

// ── Row cells ────────────────────────────────────────────────────────────────

export const TypePill = ({ type }) => {
  const t = typeOf(type);
  return <span className={`docpill docpill--${t.tone}`}>{t.label}</span>;
};

export const AssignPill = ({ on }) => (
  <span className={`docpill docpill--${on ? 'yes' : 'no'}`}>{on ? 'Yes' : 'No'}</span>
);

/**
 * Who the document reached.
 *
 * The label the server resolved, plus a +N when it went to more than one class
 * or section — the full list is in the title, and in the drawer.
 */
export const SharedWith = ({ shared }) => {
  if (!shared) return <span className="docnone">—</span>;
  const all = shared.items?.length ? shared.items.join(', ') : shared.label;
  return (
    <span className="docshared" title={all}>
      <Icon name={shared.icon || 'files'} size={16} />
      <span className="docshared__label">{shared.label}</span>
      {shared.extra > 0 && <span className="docshared__more">+{shared.extra}</span>}
    </span>
  );
};

const AVATAR_TONES = ['#4f46e5', '#059669', '#d97706', '#7c3aed', '#db2777', '#0d9488'];

/** Initials over a stable colour, or the account photo when there is one. */
export const Avatar = ({ name, src, size = 30 }) => {
  // A photo that 404s falls back to the initials. Hiding the broken <img>
  // instead — which is what this used to do — leaves a person-shaped hole in
  // the row, and an account whose upload has gone missing looks like an account
  // with no name.
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);

  const text = String(name || '?');
  const initials = text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  // Same name, same colour, every render and every page.
  const tone = AVATAR_TONES[[...text].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  const style = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.38, fontWeight: 700, color: '#fff',
    background: tone, objectFit: 'cover', overflow: 'hidden',
  };
  if (src && !broken) {
    return <img src={fileUrl(src)} alt="" style={style} loading="lazy" decoding="async"
      onError={() => setBroken(true)} />;
  }
  return <span style={style} aria-hidden>{initials || '?'}</span>;
};

export const Uploader = ({ user }) => (
  user
    ? (
      <span className="docwho">
        <Avatar name={user.name} src={user.photo} />
        <span className="docwho__name">{user.name}</span>
      </span>
    )
    : <span className="docnone">—</span>
);

// ── Row actions ──────────────────────────────────────────────────────────────

export const RowActions = ({ children }) => <div className="docacts">{children}</div>;

export const IconAction = ({ icon, label, onClick, variant = '', disabled }) => (
  <button type="button" className={`docact${variant ? ` docact--${variant}` : ''}`}
    onClick={onClick} title={label} aria-label={label} disabled={disabled}>
    <Icon name={icon} size={16} />
  </button>
);

/**
 * The overflow menu on a row.
 *
 * Portalled and positioned from the button's own rect: rendered in place it
 * would be clipped by the table's horizontal scroll box, and the last row's
 * menu would open below the fold.
 */
export function RowMenu({ children, label = 'More actions' }) {
  const btnRef = useRef(null);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!rect) return undefined;
    const close = () => setRect(null);
    const away  = (e) => {
      if (!e.target.closest?.('[data-doc-menu]') && !btnRef.current?.contains(e.target)) setRect(null);
    };
    const esc = (e) => { if (e.key === 'Escape') setRect(null); };
    // Capture phase, so scrolling any ancestor closes it rather than leaving
    // the panel floating where the row used to be.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [rect]);

  const WIDTH = 210;
  const style = rect && (() => {
    const below = window.innerHeight - rect.bottom;
    const up    = below < 230 && rect.top > below;
    return {
      left: Math.max(8, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - 8)),
      ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    };
  })();

  return (
    <>
      <button ref={btnRef} type="button" className={`docact${rect ? ' is-on' : ''}`}
        onClick={() => setRect(rect ? null : btnRef.current.getBoundingClientRect())}
        title={label} aria-label={label} aria-expanded={!!rect}>
        <Icon name="dots" size={16} />
      </button>
      {rect && createPortal(
        <div className="docmenu" data-doc-menu style={style} onClick={() => setRect(null)}>{children}</div>,
        document.body,
      )}
    </>
  );
}

export const MenuItem = ({ icon, children, onClick, href, danger }) => {
  const cls = `docmenu__item${danger ? ' docmenu__item--danger' : ''}`;
  const body = <><Icon name={icon} size={16} />{children}</>;
  return href
    ? <a className={cls} href={href} target="_blank" rel="noreferrer">{body}</a>
    : <button type="button" className={cls} onClick={onClick}>{body}</button>;
};

export const MenuSep = () => <div className="docmenu__sep" />;

// ── The list ─────────────────────────────────────────────────────────────────

const COLUMNS = ['Title', 'Type', 'Shared With', 'Assignment', 'Uploaded On', 'Uploaded By', 'Actions'];

/**
 * The shelf as a table.
 *
 * Written out rather than driven by a column config: there are seven columns,
 * they are the same seven every time, and each one is a different shape. Rows
 * carry `data-focus-id` so a notification can flag the document it was about —
 * see hooks/useFocusHighlight.js.
 */
export function DocTable({ rows, loading, empty, onOpen, onView, onEdit, menu }) {
  if (loading) return <div className="docloading"><Spinner /></div>;
  if (!rows.length) return empty;

  return (
    <div className="table-wrap">
      <table className="table doctable">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} className={c === 'Actions' ? 'doctable__acts' : undefined}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} data-focus-id={r._id}>
              <td className="doctable__title">
                <button type="button" className="doctitle" onClick={() => onOpen(r)}>
                  <FileMark file={r.files?.[0]} />
                  <span className="doctitle__text">
                    <span className="doctitle__name">{r.title}</span>
                    {r.description
                      ? <span className="doctitle__sub" title={r.description}>{r.description}</span>
                      : null}
                  </span>
                </button>
              </td>
              <td><TypePill type={r.docType} /></td>
              <td><SharedWith shared={r.sharedWith} /></td>
              <td><AssignPill on={r.isAssignment} /></td>
              <td className="docdate">{fmtDate(r.createdAt)}</td>
              <td><Uploader user={r.uploadedBy} /></td>
              <td className="doctable__acts">
                <RowActions>
                  <IconAction icon="eye" label="Quick preview" onClick={() => onView(r)} />
                  <IconAction icon="pencil" label="Edit document" variant="edit" onClick={() => onEdit(r)} />
                  <RowMenu>{menu(r)}</RowMenu>
                </RowActions>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The same shelf as cards — the second half of the view switch. */
export function DocGrid({ rows, loading, empty, onOpen, onView, onEdit, menu }) {
  if (loading) return <div className="docloading"><Spinner /></div>;
  if (!rows.length) return empty;

  return (
    <div className="docgrid">
      {rows.map((r) => (
        <article key={r._id} className="doccard" data-focus-id={r._id}>
          <header className="doccard__head">
            <FileMark file={r.files?.[0]} size={40} />
            <TypePill type={r.docType} />
            <RowMenu>{menu(r)}</RowMenu>
          </header>
          <button type="button" className="doccard__title" onClick={() => onOpen(r)}>{r.title}</button>
          {r.description ? <p className="doccard__sub">{r.description}</p> : null}
          <dl className="doccard__meta">
            <div><dt>Shared with</dt><dd><SharedWith shared={r.sharedWith} /></dd></div>
            <div><dt>Uploaded</dt><dd>{fmtDate(r.createdAt)}</dd></div>
            <div><dt>Assignment</dt><dd><AssignPill on={r.isAssignment} /></dd></div>
            <div>
              <dt>Files</dt>
              <dd>{r.fileCount || 0}{r.fileCount ? ` · ${fmtSize(r.fileSize)}` : ''}</dd>
            </div>
          </dl>
          <footer className="doccard__foot">
            <Uploader user={r.uploadedBy} />
            <RowActions>
              <IconAction icon="eye" label="Quick preview" onClick={() => onView(r)} />
              <IconAction icon="pencil" label="Edit document" variant="edit" onClick={() => onEdit(r)} />
            </RowActions>
          </footer>
        </article>
      ))}
    </div>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

export const Pager = ({ page, pages, onPage }) => {
  if (!pages || pages < 1) return null;
  const span = 5;
  let first  = Math.max(1, page - Math.floor(span / 2));
  const last = Math.min(pages, first + span - 1);
  first = Math.max(1, last - span + 1);
  const nums = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  return (
    <nav className="docpager" aria-label="Pages of documents">
      <button type="button" className="docpage" disabled={page <= 1}
        onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
      {first > 1 && <span className="docpager__gap" aria-hidden>…</span>}
      {nums.map((n) => (
        <button key={n} type="button" className={`docpage${n === page ? ' is-on' : ''}`}
          aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
      ))}
      {last < pages && <span className="docpager__gap" aria-hidden>…</span>}
      <button type="button" className="docpage" disabled={page >= pages}
        onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
    </nav>
  );
};

/**
 * "Showing 1 to 7 of 24 documents", and the pager.
 *
 * Rendered even for a single page: the count sentence is the answer to "did my
 * filter do anything", and it must not vanish once the list is short.
 */
export const DocFoot = ({ page, pages, total, limit, count, onPage }) => {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = (page - 1) * limit + count;
  return (
    <div className="docfoot">
      <span className="docfoot__count">
        {total === 0
          ? 'No documents to show'
          : `Showing ${from} to ${to} of ${total} document${total === 1 ? '' : 's'}`}
      </span>
      <Pager page={page} pages={pages} onPage={onPage} />
    </div>
  );
};

// ── Detail drawer ────────────────────────────────────────────────────────────

/**
 * The whole record, beside the list.
 *
 * A slide-over rather than a route: the admin filtered their way to this row,
 * and navigating away would throw that away to show them one document.
 */
export function Drawer({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="docdrawer__scrim" onClick={onClose} />
      <aside className="docdrawer" role="dialog" aria-modal="true">{children}</aside>
    </>,
    document.body,
  );
}

const Field = ({ label, children }) => (
  <div className="docfield"><dt>{label}</dt><dd>{children}</dd></div>
);

export function DocumentDrawer({ doc, onClose, onOpen, onEdit, onArchive, onDelete }) {
  if (!doc) return null;
  const t = typeOf(doc.docType);
  return (
    <Drawer open={!!doc} onClose={onClose}>
      <div className="docdrawer__head">
        <FileMark file={doc.files?.[0]} size={48} />
        <div className="docdrawer__id">
          <h3>{doc.title}</h3>
          <div className="docdrawer__tags">
            <span className={`docpill docpill--${t.tone}`}>{t.label}</span>
            {doc.category ? <span className="docpill docpill--slate">{doc.category}</span> : null}
            {doc.isArchived ? <span className="docpill docpill--no">Archived</span> : null}
          </div>
        </div>
        <button type="button" className="docact" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="docdrawer__body">
        {doc.description ? <p className="docdrawer__desc">{doc.description}</p> : null}

        <section className="docdrawer__sec">
          <h4>Sharing</h4>
          <dl>
            <Field label="Target">{targetLabel(doc.targetType)}</Field>
            <Field label="Shared with">
              {doc.sharedWith?.items?.length
                ? doc.sharedWith.items.join(', ')
                : doc.sharedWith?.label || '—'}
            </Field>
            <Field label="Academic year">{doc.academicYearName || <span className="docnone">Unfiled</span>}</Field>
          </dl>
        </section>

        <section className="docdrawer__sec">
          <h4>Record</h4>
          <dl>
            <Field label="Uploaded by">{doc.uploadedBy?.name || '—'}</Field>
            <Field label="Uploaded on">{fmtDate(doc.createdAt)}</Field>
            <Field label="Last changed">{fmtDate(doc.updatedAt)}</Field>
            <Field label="Version">v{doc.currentVersion || 1}</Field>
            {doc.tags?.length ? <Field label="Tags">{doc.tags.join(', ')}</Field> : null}
          </dl>
        </section>

        {doc.isAssignment && (
          <section className="docdrawer__sec">
            <h4>Assignment</h4>
            <dl>
              <Field label="Due date">{doc.dueDate ? fmtDate(doc.dueDate) : <span className="docnone">No due date</span>}</Field>
              <Field label="Submissions">{doc.allowSubmission ? 'Open' : 'Closed'}</Field>
              {doc.marksEnabled ? <Field label="Total marks">{doc.totalMarks ?? '—'}</Field> : null}
            </dl>
          </section>
        )}

        <section className="docdrawer__sec">
          <h4>Files ({doc.files?.length || 0})</h4>
          {doc.files?.length
            ? (
              <ul className="docfiles">
                {doc.files.map((f, i) => (
                  <li key={`${f.storedName || f.originalName}-${i}`}>
                    <FileMark file={f} size={34} />
                    <span className="docfiles__name" title={f.originalName}>{f.originalName}</span>
                    <span className="docfiles__size">{fmtSize(f.fileSize)}</span>
                    <a className="docact" href={fileUrl(f.filePath)} target="_blank" rel="noreferrer"
                      title="Open file" aria-label={`Open ${f.originalName}`}>
                      <Icon name="download" size={16} />
                    </a>
                  </li>
                ))}
              </ul>
            )
            : <p className="docnone">No files attached.</p>}
        </section>
      </div>

      <div className="docdrawer__foot">
        {onOpen && (
          <button type="button" className="btn btn-secondary docdrawer__open" onClick={() => onOpen(doc)}>
            <Icon name="arrowRight" size={15} /> Open full page
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => onArchive(doc)}>
          <Icon name={doc.isArchived ? 'refresh' : 'package'} size={15} />
          {doc.isArchived ? 'Restore' : 'Archive'}
        </button>
        <button type="button" className="btn btn-danger" onClick={() => onDelete(doc)}>
          <Icon name="trash" size={15} /> Delete
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onEdit(doc)}>
          <Icon name="pencil" size={15} /> Edit
        </button>
      </div>
    </Drawer>
  );
}

// ── Upload / edit form ───────────────────────────────────────────────────────

/** Multi-select for whichever of classes or sections the chosen target needs. */
function TargetPicker({ targetType, classes, selClasses, selSections, onToggleClass, onToggleSection }) {
  if (targetType === 'class') {
    return (
      <div className="form-group">
        <label className="form-label required">Classes</label>
        <div className="docpick">
          {classes.length === 0
            ? <span className="docnone">No classes found</span>
            : classes.map((c) => (
              <label key={c._id} className="docpick__row">
                <input type="checkbox" checked={selClasses.includes(c._id)} onChange={() => onToggleClass(c._id)} />
                <span>{c.className || `Class ${c.classNumber}`}</span>
              </label>
            ))}
        </div>
        {selClasses.length > 0 && <div className="form-hint">{selClasses.length} class(es) selected</div>}
      </div>
    );
  }

  if (targetType === 'class_sections') {
    return (
      <div className="form-group">
        <label className="form-label required">Sections</label>
        <div className="docpick">
          {classes.length === 0
            ? <span className="docnone">No sections found</span>
            : classes.filter((c) => c.sections?.length).map((c) => (
              <div key={c._id} className="docpick__group">
                <div className="docpick__head">{c.className || `Class ${c.classNumber}`}</div>
                {c.sections.map((s) => (
                  <label key={s._id} className="docpick__row docpick__row--in">
                    <input type="checkbox" checked={selSections.includes(s._id)} onChange={() => onToggleSection(s._id)} />
                    <span>Section {s.sectionName}</span>
                  </label>
                ))}
              </div>
            ))}
        </div>
        {selSections.length > 0 && <div className="form-hint">{selSections.length} section(s) selected</div>}
      </div>
    );
  }

  return null;
}

/**
 * The fields behind Upload and Edit.
 *
 * One component for both, because they are the same document either way — the
 * only difference is whether replacing the files is optional, and what the
 * button at the bottom says.
 *
 * Declared at module scope, NOT inside the page. A component defined during
 * render is a new type on every keystroke, so React unmounts and remounts the
 * whole subtree — which is how a form loses focus after each character typed.
 */
export function DocumentFields({
  form, setForm, categories, classes,
  selClasses, setSelClasses, selSections, setSelSections,
  files, setFiles, existing, onManageCategories,
}) {
  const toggle = (id, list, set) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <>
      <div className="form-group">
        <label className="form-label required">Title</label>
        <input className="form-control" autoFocus value={form.title} maxLength={160}
          placeholder="e.g. Holiday Circular – Gandhi Jayanti"
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </div>

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-control" rows={2} value={form.description} maxLength={300}
          placeholder="One line about what this is"
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>

      <div className="docform__row">
        <div className="form-group">
          <label className="form-label required">Type</label>
          <select className="form-control" value={form.docType}
            onChange={(e) => setForm((f) => ({
              ...f,
              docType: e.target.value,
              // The two say the same thing; keeping them in step here means the
              // tab a document lands on always matches the flag on its row.
              isAssignment: e.target.value === 'assignment' ? true : f.isAssignment,
            }))}>
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div className="form-hint">Drives the tabs and the Type column.</div>
        </div>

        <div className="form-group">
          <label className="form-label required">Category</label>
          <select className="form-control" value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            <option value="">— Select —</option>
            {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <div className="form-hint">
            Your school&rsquo;s own filing label.{' '}
            <button type="button" className="doclink" onClick={onManageCategories}>Manage categories</button>
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label required">Share with</label>
        <select className="form-control" value={form.targetType}
          onChange={(e) => { setForm((f) => ({ ...f, targetType: e.target.value })); setSelClasses([]); setSelSections([]); }}>
          {TARGET_TYPES.filter((t) => t.value !== 'specific_teachers')
            .map((t) => <option key={t.value} value={t.value}>{t.label} — {t.hint}</option>)}
        </select>
      </div>

      <TargetPicker
        targetType={form.targetType} classes={classes}
        selClasses={selClasses} selSections={selSections}
        onToggleClass={(id) => toggle(id, selClasses, setSelClasses)}
        onToggleSection={(id) => toggle(id, selSections, setSelSections)}
      />

      <label className="doccheck">
        <input type="checkbox" checked={form.isAssignment}
          onChange={(e) => setForm((f) => ({
            ...f,
            isAssignment: e.target.checked,
            docType: e.target.checked ? 'assignment' : (f.docType === 'assignment' ? 'other' : f.docType),
          }))} />
        <span>Students can submit work against this</span>
      </label>

      {form.isAssignment && (
        <div className="form-group">
          <label className="form-label">Due date</label>
          <input type="date" className="form-control" value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
        </div>
      )}

      <div className="form-group">
        <label className="form-label">{existing ? 'Replace files' : 'Files'}</label>
        <input type="file" className="form-control" multiple
          onChange={(e) => setFiles(Array.from(e.target.files))} />
        {files.length > 0
          ? <div className="form-hint">{files.length} file(s) selected</div>
          : existing?.files?.length
            ? <div className="form-hint">Leave empty to keep the {existing.files.length} file(s) already attached.</div>
            : null}
      </div>

      {existing?.files?.length > 0 && files.length === 0 && (
        <ul className="docfiles docfiles--compact">
          {existing.files.map((f, i) => (
            <li key={`${f.storedName || f.originalName}-${i}`}>
              <FileMark file={f} size={30} />
              <span className="docfiles__name" title={f.originalName}>{f.originalName}</span>
              <span className="docfiles__size">{fmtSize(f.fileSize)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ── Empty states ─────────────────────────────────────────────────────────────

export const DocEmpty = ({ filtered, onClear, onUpload }) => (
  <Empty
    icon={filtered ? '🔍' : '📁'}
    title={filtered ? 'No documents match these filters' : 'Nothing on the shelf yet'}
    message={filtered
      ? 'Try another tab, category or search term.'
      : 'Upload a notice, a circular or study material and choose who it goes to.'}
    action={filtered
      ? <button type="button" className="btn btn-secondary" onClick={onClear}>Clear filters</button>
      : <button type="button" className="btn btn-primary" onClick={onUpload}>
          <Icon name="upload" size={16} /> Upload Document
        </button>}
  />
);
