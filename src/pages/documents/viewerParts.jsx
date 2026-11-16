/**
 * The shelf, for everyone who does not administer it.
 *
 * Students, parents and teachers are all *reading* the same documents, so they
 * share one kit: a marked header, a few figures, the tab strip, a filter row
 * and a list of cards. Cards rather than the admin's table — a student is
 * looking for one notice, not auditing a register, and a card can carry the
 * thing that actually matters to them (when it is due, whether they have handed
 * it in) without a column for it.
 *
 * The three pages differ only in what they hang off the card: a student's own
 * submission, each child's for a parent, the submission count for a teacher's
 * own assignments.
 *
 * Prefixed `dv` (document viewer) so nothing here reaches another page. The
 * file marks and type registry come from the admin list so a PDF looks the same
 * to a parent as it does to the office.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import Icon from '../../components/ui/icons';
import { Empty, Spinner } from '../../components/ui/index';
import {
  FileMark, fileUrl, downloadUrl, fmtSize, fmtDate, typeOf, DOC_TYPES, UPLOAD_TYPES, UPLOAD_MAX_BYTES,
} from '../admin/documentParts';
import Tabs from '../../components/ui/Tabs';
import { useFileViewer } from './FileViewer';

export { FileMark, fileUrl, downloadUrl, fmtSize, fmtDate, typeOf, DOC_TYPES };

// ── Words ────────────────────────────────────────────────────────────────────

export const TABS = [
  { value: 'all',         label: 'All' },
  { value: 'assignments', label: 'Assignments' },
  { value: 'notices',     label: 'Notices & Circulars' },
  { value: 'study',       label: 'Study Material' },
];

export const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  // Only assignments have a due date, so only the Assignments tab offers this.
  { value: 'due',    label: 'Due soonest', only: 'assignments' },
  { value: 'title',  label: 'Title (A–Z)' },
];

/** The sort choices one tab offers. */
export const sortsFor = (tab) => SORTS.filter((s) => !s.only || s.only === tab);

/** The sort to use on a tab: what was picked, unless that tab does not offer it. */
export const sortOn = (tab, sort) => (sortsFor(tab).some((s) => s.value === sort) ? sort : 'newest');

/** Where a piece of set work stands. */
export const STATES = {
  pending:   { label: 'To do',       tone: 'warn', icon: 'clock' },
  submitted: { label: 'Submitted',   tone: 'yes',  icon: 'checkCircle' },
  late:      { label: 'Submitted late', tone: 'warn', icon: 'checkCircle' },
  marked:    { label: 'Marked',      tone: 'info', icon: 'star' },
  missed:    { label: 'Missed',      tone: 'bad',  icon: 'alert' },
  // Nothing handed in and submissions are shut: not something still to do.
  closed:    { label: 'Closed',      tone: 'slate', icon: 'clock' },
};

export const StatePill = ({ state, compact }) => {
  const s = STATES[state];
  if (!s) return null;
  return (
    <span className={`dvpill dvpill--${s.tone}`}>
      <Icon name={s.icon} size={12} />{compact ? '' : ` ${s.label}`}
    </span>
  );
};

/** "Due in 3 days" / "Overdue by 2 days" — the sentence a student actually reads. */
export function dueLine(dueISO, state) {
  if (!dueISO) return null;
  const due = new Date(dueISO);
  if (Number.isNaN(due.getTime())) return null;
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(due) - midnight(new Date())) / 86400000);

  if (state === 'submitted' || state === 'late' || state === 'marked' || state === 'closed') {
    return { text: `Due ${fmtDate(dueISO)}`, tone: 'calm' };
  }
  if (days < 0)  return { text: `Overdue by ${-days} day${days === -1 ? '' : 's'}`, tone: 'bad' };
  if (days === 0) return { text: 'Due today', tone: 'bad' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'warn' };
  if (days <= 7)  return { text: `Due in ${days} days`, tone: 'warn' };
  return { text: `Due ${fmtDate(dueISO)}`, tone: 'calm' };
}

// ── Frame ────────────────────────────────────────────────────────────────────

export const ViewerHero = ({ title, subtitle, icon = 'files', right }) => (
  <header className="dvhero">
    <span className="dvhero__mark"><Icon name={icon} size={28} /></span>
    <div className="dvhero__text">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    {right ? <div className="dvhero__right">{right}</div> : null}
  </header>
);

export const ViewerStats = ({ children }) => <div className="dvstats">{children}</div>;

export const ViewerStat = ({ icon, tone, value, label, caption, on, onClick }) => {
  const body = (
    <>
      <span className={`dvstat__icon tint-${tone}`}><Icon name={icon} size={20} /></span>
      <span className="dvstat__body">
        <span className="dvstat__value">{value ?? 0}</span>
        <span className="dvstat__label">{label}</span>
        {caption ? <span className="dvstat__cap">{caption}</span> : null}
      </span>
    </>
  );
  if (!onClick) return <div className="dvstat">{body}</div>;
  return (
    <button type="button" className={`dvstat${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      {body}
    </button>
  );
};

/**
 * Whose shelf is on screen.
 *
 * Only ever drawn for a parent with more than one child — with one child there
 * is nothing to switch between, and a switch with a single option is a control
 * that asks a question with one answer. "All children" leads, because the first
 * thing a parent wants is everything at once.
 */
export const ChildSwitch = ({ children: kids, value, onChange, countFor, allCount }) => {
  if (!kids?.length || kids.length < 2) return null;
  return (
    <nav className="dvwho" role="tablist" aria-label="Whose documents">
      <button type="button" role="tab" aria-selected={!value}
        className={`dvwho__btn${!value ? ' is-on' : ''}`} onClick={() => onChange('')}>
        <span className="dvwho__all"><Icon name="users" size={15} /></span>
        <span className="dvwho__text"><b>All children</b><small>{kids.length} children</small></span>
        <em>{allCount}</em>
      </button>
      {kids.map((c) => (
        <button key={c._id} type="button" role="tab" aria-selected={value === c._id}
          className={`dvwho__btn${value === c._id ? ' is-on' : ''}`} onClick={() => onChange(c._id)}>
          <Avatar name={c.name} src={c.photo} size={30} />
          <span className="dvwho__text">
            <b>{c.name}</b>
            <small>{c.className || 'No class on record'}</small>
          </span>
          <em>{countFor(c._id)}</em>
        </button>
      ))}
    </nav>
  );
};

export const ViewerTabs = ({ tabs, value, onChange, counts }) => (
  <Tabs
    variant="line"
    label="Document types"
    value={value}
    onChange={onChange}
    items={tabs.map(t => ({ ...t, count: counts?.[t.value] }))}
  />
);

export const ViewerTools = ({ children }) => <div className="dvtools">{children}</div>;

export const SearchField = ({ value, onChange, placeholder = 'Search documents…' }) => (
  <div className="dvsearch">
    <Icon name="search" size={16} />
    <input className="form-control" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    {value && (
      <button type="button" className="dvsearch__clear" onClick={() => onChange('')} aria-label="Clear search">
        <Icon name="close" size={14} />
      </button>
    )}
  </div>
);

export const Picker = ({ value, onChange, all, options, label }) => (
  <select className={`form-control dvsel${value ? ' is-on' : ''}`} value={value}
    onChange={(e) => onChange(e.target.value)} aria-label={label}>
    {all ? <option value="">{all}</option> : null}
    {options.map((o) => (
      <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
    ))}
  </select>
);

// ── People ───────────────────────────────────────────────────────────────────

const TONES = ['#4f46e5', '#059669', '#d97706', '#7c3aed', '#db2777', '#0d9488'];

export const Avatar = ({ name, src, size = 28 }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);

  const text = String(name || '?');
  const initials = text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const tone = TONES[[...text].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];
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

// ── The card ─────────────────────────────────────────────────────────────────

export const Loading = () => <div className="dvloading"><Spinner /></div>;

/**
 * One document, as something to read rather than a row to audit.
 *
 * `badges` and `actions` are what each of the three pages hangs off it — the
 * student's own state, a chip per child for a parent, a submissions count for a
 * teacher. Everything else is the same document to all three.
 */
export function DocCard({ doc, onOpen, badges, actions, dense }) {
  const type = typeOf(doc.docType);
  const due  = doc.isAssignment ? dueLine(doc.dueDate, doc.state) : null;
  // Both slots take a node or a function of the row — a parent's child chips
  // differ per document, a teacher's "mark 3" button does too.
  const slot = (v) => (typeof v === 'function' ? v(doc) : v);
  // `isRead` is only ever false for something shared WITH the reader that they
  // have not opened. Their own uploads, and lists that do not track it, carry
  // no mark at all.
  const unread = doc.isRead === false;
  return (
    <article className={`dvcard${dense ? ' dvcard--dense' : ''}${unread ? ' is-unread' : ''}`} data-focus-id={doc._id}>
      <button type="button" className="dvcard__open" onClick={() => onOpen(doc)}
        aria-label={unread ? `Open ${doc.title} (unread)` : `Open ${doc.title}`}>
        <FileMark file={doc.files?.[0]} size={44} />
        <span className="dvcard__main">
          <span className="dvcard__title">
            {unread ? <span className="dvnew">New</span> : null}
            {doc.title}
            {doc.isDraft ? <span className="dvpill dvpill--amber">Draft</span> : null}
            {doc.isArchived ? <span className="dvpill dvpill--slate">Archived</span> : null}
          </span>
          {doc.description ? <span className="dvcard__sub">{doc.description}</span> : null}
          <span className="dvcard__meta">
            <span className={`dvpill dvpill--${type.tone}`}>{type.label}</span>
            {doc.category ? <span className="dvchip">{doc.category}</span> : null}
            <span className="dvmeta"><Icon name={doc.sharedWith?.icon || 'files'} size={13} />{doc.sharedWith?.label}</span>
            <span className="dvmeta"><Icon name="calendar" size={13} />{fmtDate(doc.createdAt)}</span>
            {doc.fileCount > 0 && (
              <span className="dvmeta"><Icon name="files" size={13} />{doc.fileCount} file{doc.fileCount === 1 ? '' : 's'}</span>
            )}
          </span>
        </span>
      </button>

      <div className="dvcard__end">
        {due && <span className={`dvdue dvdue--${due.tone}`}><Icon name="clock" size={13} />{due.text}</span>}
        {slot(badges)}
        <div className="dvcard__acts">
          {slot(actions)}
          {doc.files?.[0] && (
            <a className="dvact" href={downloadUrl(doc.files[0].filePath)} target="_blank" rel="noreferrer"
              title={`Download ${doc.files[0].originalName}`} aria-label={`Download ${doc.files[0].originalName}`}>
              <Icon name="download" size={15} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * The cards on screen, and the way to the next page of them.
 *
 * `more` is `{ total, loading, onMore }` from useShelf: the server sends a page
 * at a time, and "Show more" asks for the next one.
 */
export const DocList = ({ docs, loading, empty, more, ...rest }) => {
  if (loading) return <Loading />;
  if (!docs.length) return empty;
  const left = (more?.total || 0) - docs.length;
  return (
    <div className="dvlist">
      {docs.map((d) => <DocCard key={d._id} doc={d} {...rest} />)}
      {left > 0 && (
        <button type="button" className="btn btn-secondary dvmore" onClick={more.onMore} disabled={more.loading}>
          {more.loading ? 'Loading…' : <>Show {Math.min(SHELF_PAGE, left)} more <small>({left} not shown)</small></>}
        </button>
      )}
    </div>
  );
};

// ── The shelf, a page at a time ──────────────────────────────────────────────

export const SHELF_PAGE = 30;

/**
 * One reader's shelf, read from the server a page at a time.
 *
 * The tabs, the category, the search, the sort and the tiles' state filter are
 * all `params` — the server narrows and counts, and sends back only the page
 * being shown (it used to send every document of the year, files and all, and
 * this file did the narrowing). `meta` is the whole answer: the figures, the
 * years, the ids still unread under these filters, and `focused` — the one
 * document named by `focusRef`, wherever it is filed.
 *
 * A change of params starts again from the first page; `refetch()` re-reads
 * what is already on screen in place, without blanking it.
 */
export function useShelf(load, params, { focusRef } = {}) {
  // A keystroke is not a search; wait for a pause.
  const [term, setTerm] = useState(params.search || '');
  useEffect(() => {
    const t = setTimeout(() => setTerm(params.search || ''), 250);
    return () => clearTimeout(t);
  }, [params.search]);

  const key = JSON.stringify({ ...params, search: String(term).trim() });
  const query = useMemo(() => {
    const q = JSON.parse(key);
    Object.keys(q).forEach((k) => { if (q[k] === '' || q[k] == null) delete q[k]; });
    return q;
  }, [key]);

  const [box, setBox] = useState({ docs: [], meta: null, loading: true, more: false, error: '' });
  const held = useRef(box);
  held.current = box;
  const turn = useRef(0);

  const ask = useCallback((page, limit) => load({
    ...query, page, limit, ...(focusRef?.current ? { focus: focusRef.current } : {}),
  }), [query, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = useCallback(async (keep) => {
    const mine = ++turn.current;
    if (!keep) setBox((b) => ({ ...b, loading: true, error: '' }));
    try {
      const limit = keep ? Math.min(100, Math.max(SHELF_PAGE, held.current.docs.length)) : SHELF_PAGE;
      const res = await ask(1, limit);
      if (mine !== turn.current) return;      // a newer question has been asked since
      setBox({ docs: res?.data || [], meta: res, loading: false, more: false, error: '' });
    } catch (err) {
      if (mine !== turn.current) return;
      setBox((b) => ({ ...b, loading: false, more: false, error: err?.response?.data?.message || err.message || 'The documents could not be loaded' }));
    }
  }, [ask]);

  useEffect(() => { read(false); }, [read]);

  const loadMore = useCallback(async () => {
    const mine = turn.current;
    setBox((b) => ({ ...b, more: true }));
    try {
      const res = await ask(Math.floor(held.current.docs.length / SHELF_PAGE) + 1, SHELF_PAGE);
      if (mine !== turn.current) return;
      setBox((b) => {
        const have = new Set(b.docs.map((d) => d._id));
        return { ...b, docs: [...b.docs, ...(res?.data || []).filter((d) => !have.has(d._id))], meta: res, more: false };
      });
    } catch (err) {
      setBox((b) => ({ ...b, more: false }));
      toast.error(err?.response?.data?.message || err.message);
    }
  }, [ask]);

  return {
    docs: box.docs, meta: box.meta, loading: box.loading, error: box.error,
    total: box.meta?.total ?? box.docs.length,
    more: { total: box.meta?.total ?? box.docs.length, loading: box.more, onMore: loadMore },
    refetch: () => read(true),
  };
}

export const NothingHere = ({ filtered, onClear, what = 'documents' }) => (
  <Empty
    icon={filtered ? '🔍' : '📭'}
    title={filtered ? `No ${what} match that` : `No ${what} yet`}
    message={filtered
      ? 'Try another tab, category or search term.'
      : 'Anything shared with you will show up here.'}
    action={filtered
      ? <button type="button" className="btn btn-secondary" onClick={onClear}>Clear filters</button>
      : null}
  />
);

// ── The drawer ───────────────────────────────────────────────────────────────

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
  // Portalled to <body>. Rendered in place it sits inside the app's layout
  // grid, whose own stacking context traps it under the sticky header — the
  // drawer's title ended up behind the top bar however high its z-index went.
  return createPortal(
    <>
      <div className="dvscrim" onClick={onClose} />
      <aside className="dvdrawer" role="dialog" aria-modal="true">{children}</aside>
    </>,
    document.body,
  );
}

export const Field = ({ label, children }) => (
  <div className="dvfield"><dt>{label}</dt><dd>{children}</dd></div>
);

/**
 * How a file in the drawer gets opened: `(files, index, caption)`.
 *
 * Context rather than a prop, because the rows that need it are drawn by
 * different hands — the document's own files by the drawer, a student's
 * submission by the student page, a comment's attachments by the thread — and
 * each would otherwise carry its own viewer. Outside a drawer there is none,
 * and a row falls back to a plain link.
 */
const ViewFile = createContext(null);

/**
 * A list of files: each opens on this screen, and can still be downloaded.
 *
 * `compact` swaps the labelled View button for the eye alone — a comment's
 * bubble is too narrow for both the word and the file's name.
 */
export const FileRows = ({ files, empty = 'No files attached', caption, compact }) => {
  const view = useContext(ViewFile);
  if (!files?.length) return <p className="dvnone">{empty}</p>;
  return (
    <ul className="dvfiles">
      {files.map((f, i) => (
        <li key={`${f.storedName || f.originalName}-${i}`}>
          <FileMark file={f} size={32} />
          {view
            ? (
              <button type="button" className="dvfiles__name dvfiles__open" title={`View ${f.originalName}`}
                onClick={() => view(files, i, caption)}>{f.originalName}</button>
            )
            : <span className="dvfiles__name" title={f.originalName}>{f.originalName}</span>}
          <span className="dvfiles__size">{fmtSize(f.fileSize)}</span>
          {view && (compact
            ? (
              <button type="button" className="dvact" onClick={() => view(files, i, caption)}
                title="View file" aria-label={`View ${f.originalName}`}><Icon name="eye" size={15} /></button>
            )
            : (
              <button type="button" className="btn btn-secondary btn-sm dvfiles__view"
                onClick={() => view(files, i, caption)} aria-label={`View ${f.originalName}`}>
                <Icon name="eye" size={14} /> View
              </button>
            ))}
          <a className="dvact" href={downloadUrl(f.filePath)} target="_blank" rel="noreferrer" download={f.originalName}
            title="Download" aria-label={`Download ${f.originalName}`}><Icon name="download" size={15} /></a>
        </li>
      ))}
    </ul>
  );
};

/**
 * The drawer's own "open it" button, for a page's `foot`.
 *
 * It used to be a link that opened the first file in a new tab — or, for
 * anything the browser cannot draw, downloaded it. It opens the viewer now,
 * with the rest of the document's files one arrow away.
 */
export const OpenFile = ({ files, caption }) => {
  const view = useContext(ViewFile);
  if (!files?.length) return null;
  const label = files.length > 1 ? `View files (${files.length})` : 'View the file';
  if (!view) {
    return (
      <a className="btn btn-secondary" href={fileUrl(files[0].filePath)} target="_blank" rel="noreferrer">
        <Icon name="eye" size={15} /> {label}
      </a>
    );
  }
  return (
    <button type="button" className="btn btn-secondary" onClick={() => view(files, 0, caption)}>
      <Icon name="eye" size={15} /> {label}
    </button>
  );
};

/**
 * The document, opened.
 *
 * `extra` is the part that differs per reader: a student's submission box, a
 * parent's per-child strip, a teacher's link into the marking screen.
 */
export function DocDrawer({ doc, onClose, extra, foot }) {
  // Every file in here — the document's, a submission's, a comment's — opens
  // over the drawer instead of in a new tab. Called before the early return:
  // a hook runs on every render, drawer open or not.
  const viewer = useFileViewer();
  if (!doc) return null;
  const type = typeOf(doc.docType);
  const due  = doc.isAssignment ? dueLine(doc.dueDate, doc.state) : null;
  return (
    <>
    <Drawer open={!!doc} onClose={onClose}>
      <ViewFile.Provider value={viewer.open}>
      <header className="dvdrawer__head">
        <FileMark file={doc.files?.[0]} size={46} />
        <div className="dvdrawer__id">
          <h3>{doc.title}</h3>
          <div className="dvdrawer__tags">
            <span className={`dvpill dvpill--${type.tone}`}>{type.label}</span>
            {doc.category ? <span className="dvchip">{doc.category}</span> : null}
            {doc.state ? <StatePill state={doc.state} /> : null}
          </div>
        </div>
        <button type="button" className="dvact" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </header>

      <div className="dvdrawer__body">
        {doc.description ? <p className="dvdrawer__desc">{doc.description}</p> : null}

        {due && (
          <p className={`dvduebar dvduebar--${due.tone}`}>
            <Icon name="clock" size={15} /> {due.text}
            {doc.totalMarks ? <b>Out of {doc.totalMarks}</b> : null}
          </p>
        )}

        <section className="dvdrawer__sec">
          <h4>Details</h4>
          <dl>
            <Field label="Shared with">{doc.sharedWith?.label || '—'}</Field>
            {doc.subject ? <Field label="Subject">{doc.subject}</Field> : null}
            <Field label="Shared by">{doc.uploadedBy?.name || '—'}</Field>
            <Field label="Shared on">{fmtDate(doc.createdAt)}</Field>
            {doc.academicYearName ? <Field label="Academic year">{doc.academicYearName}</Field> : null}
          </dl>
        </section>

        <section className="dvdrawer__sec">
          <h4>Files ({doc.files?.length || 0})</h4>
          <FileRows files={doc.files} caption={doc.title} />
        </section>

        {extra}
      </div>

      {foot ? <div className="dvdrawer__foot">{foot}</div> : null}
      </ViewFile.Provider>
    </Drawer>
    {viewer.node}
    </>
  );
}

/**
 * Choosing files, without a browse dialog being the only way in.
 *
 * A plain `<input type="file">` tells you nothing once you have picked: not
 * what you chose, not how big it is, and there is no way to drop one back out
 * without starting again. This shows the list, sizes it, and lets a file be
 * removed — which matters most on the one screen where the wrong attachment
 * goes to a whole class.
 *
 * Files accumulate rather than replace: picking twice adds to the list, because
 * "choose 3 files" and "choose 1 file, then 2 more" are the same intention and
 * only one of them used to work.
 */

/**
 * The files already on a document that is being edited.
 *
 * Each one stays unless it is taken off here, and whatever is picked in the
 * dropzone is added to them. `onRemove` gets the file's place in the list.
 */
export const KeptFiles = ({ files, onRemove }) => (
  files?.length ? (
    <div className="shkept">
      <p><Icon name="files" size={14} /> Already attached ({files.length}) — kept unless you remove them</p>
      <ul>
        {files.map((f, i) => (
          <li key={`${f.storedName || f.originalName}-${i}`}>
            <FileMark file={f} size={28} />
            <span className="dvfiles__name" title={f.originalName}>{f.originalName}</span>
            <span className="dvfiles__size">{fmtSize(f.fileSize)}</span>
            <button type="button" className="dvact" title={`Remove ${f.originalName}`}
              aria-label={`Remove ${f.originalName}`} onClick={() => onRemove(i)}>
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : null
);
export function FileDrop({ files, onChange, hint, max = 10, id = 'dv-drop' }) {
  const [over, setOver] = useState(false);

  // Said here, before anything is sent: a file the server will not take used
  // to travel all the way up and come back as an error.
  const usable = (picked) => {
    const good = [];
    for (const f of picked) {
      const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
      if (!UPLOAD_TYPES.includes(ext)) {
        toast.error(`${f.name} cannot be attached — use a PDF, a Word, Excel or PowerPoint file, a text file or a photo`);
      } else if (f.size > UPLOAD_MAX_BYTES) {
        toast.error(`${f.name} is ${fmtSize(f.size)} — the limit is 10 MB a file`);
      } else if (!f.size) {
        toast.error(`${f.name} is empty`);
      } else {
        good.push(f);
      }
    }
    return good;
  };

  // Everything picked is added, including a second file with the same name as
  // one already listed. Matching name and size used to be treated as "the same
  // file picked twice" and dropped without a word — which also dropped a real
  // second document that happened to be called the same thing. A file added by
  // mistake has its own × beside it.
  const add = (picked) => {
    const next = [...files, ...usable(picked)];
    if (next.length > max) toast.error(max > 0 ? `Only ${max} file${max === 1 ? '' : 's'} can be attached here` : 'No more files can be attached here');
    onChange(next.slice(0, max));
  };

  const total = files.reduce((n, f) => n + f.size, 0);

  return (
    <div className="dvdrop">
      <label
        className={`dvdrop__zone${over ? ' is-over' : ''}`}
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(Array.from(e.dataTransfer.files || [])); }}
      >
        <span className="dvdrop__icon"><Icon name="upload" size={20} /></span>
        <span className="dvdrop__text">
          <b>Drop files here, or browse</b>
          <small>{hint || `Up to ${max} files`}</small>
        </span>
        <input id={id} type="file" multiple accept={UPLOAD_TYPES.map((t) => `.${t}`).join(',')}
          onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
      </label>

      {files.length > 0 && (
        <>
          <ul className="dvdrop__list">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}-${i}`}>
                <FileMark file={{ originalName: f.name, mimeType: f.type }} size={30} />
                <span className="dvfiles__name" title={f.name}>{f.name}</span>
                <span className="dvfiles__size">{fmtSize(f.size)}</span>
                <button type="button" className="dvact" title={`Remove ${f.name}`}
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onChange(files.filter((_, x) => x !== i))}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
          {/* With one file its own × is the whole job; "Remove all" only
              earns its place once there is more than one to remove. */}
          {files.length > 1 && (
            <p className="dvdrop__sum">
              {files.length} files · {fmtSize(total)}
              <button type="button" onClick={() => onChange([])}>Remove all</button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── The question breakdown ───────────────────────────────────────────────────

/** The marking form's own line for what the named questions leave over. */
const RESERVED_QUESTION = 'other marks';

/** What is wrong with a question list, in words — or nothing. */
export function questionsProblem(questions) {
  const labels = (questions || []).map((q) => String(q.label || '').trim().toLowerCase());
  if (labels.some((l) => !l)) return 'Every question needs a name';
  if (new Set(labels).size !== labels.length) return 'Two questions share a name';
  if (labels.includes(RESERVED_QUESTION)) return '“Other marks” is kept for what the questions leave over — call the question something else';
  return '';
}

/**
 * Break the marks down by question — `[{ label, maxMarks }]`.
 *
 * Optional: without it an assignment is marked as one number, which is most of
 * them; with it, marking asks for a score per question and the analytics can
 * say which question the class lost marks on. The office's form has had this
 * all along; the teacher who actually sets and marks the work did not.
 */
export function QuestionBreakdown({ questions, onChange, outOf, error }) {
  const total = questions.reduce((n, q) => n + (Number(q.maxMarks) || 0), 0);
  const of    = Number(outOf) || 0;
  const set   = (i, part) => onChange(questions.map((q, x) => (x === i ? { ...q, ...part } : q)));
  return (
    <div className="shq">
      <header>
        <div>
          <b>Break the marks down by question</b>
          <small>Optional. Marking then asks for a score per question.</small>
        </div>
        <button type="button" className="btn btn-secondary btn-sm"
          onClick={() => onChange([...questions, { label: `Q${questions.length + 1}`, maxMarks: '' }])}>
          <Icon name="plus" size={14} /> Add question
        </button>
      </header>

      {questions.length > 0 && (
        <>
          <ul className="shq__list">
            {questions.map((q, i) => (
              <li key={i}>
                <input data-text="title" className="form-control" maxLength={20} value={q.label}
                  aria-label={`Question ${i + 1} name`} placeholder={`Q${i + 1}`}
                  onChange={(e) => set(i, { label: e.target.value })} />
                <input step="any" className="form-control" type="number" min="0" value={q.maxMarks}
                  aria-label={`Question ${i + 1} marks`} placeholder="Marks"
                  onChange={(e) => set(i, { maxMarks: e.target.value })} />
                <button type="button" className="dvact" onClick={() => onChange(questions.filter((_, x) => x !== i))}
                  title={`Remove ${q.label || `question ${i + 1}`}`}
                  aria-label={`Remove ${q.label || `question ${i + 1}`}`}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <p className={`shq__sum${of && total !== of ? ' is-off' : ''}`}>
            {total} across {questions.length} question{questions.length === 1 ? '' : 's'}
            {of ? ` · out of ${of}` : ''}
            {/* Said, not enforced: a paper marked out of 50 with 45 in named
                questions and 5 for presentation is a real paper — the 5 are
                given as "Other marks" when it is marked. */}
            {of && total !== of
              ? <em>{total > of ? 'more than the total above' : `${Math.round((of - total) * 100) / 100} left over — given as “Other marks” when marking`}</em>
              : null}
          </p>
        </>
      )}
      {error ? <p className="sherr"><Icon name="alert" size={13} />{error}</p> : null}
    </div>
  );
}

// ── Read and unread ──────────────────────────────────────────────────────────

/**
 * Which documents the reader has opened.
 *
 * The server says what was read before this visit (`isRead`); this keeps what
 * has been opened since, so a card loses its mark the moment it is opened
 * rather than after a reload — and without refetching the whole shelf, which
 * would blank the list under the drawer that just opened.
 */
export function useReadMarks(docs, { one, many }) {
  const [seen, setSeen] = useState(() => new Set());

  const marked = useMemo(
    () => docs.map((d) => (d.isRead === false && seen.has(d._id) ? { ...d, isRead: true } : d)),
    [docs, seen],
  );

  const read = useCallback((doc) => {
    if (!doc || doc.isRead !== false || seen.has(doc._id)) return;
    setSeen((s) => new Set(s).add(doc._id));
    // Quietly: if this fails the card is simply unread again next visit.
    one(doc._id).catch(() => {});
  }, [seen, one]);

  // Ids, or documents: the server names everything unread under the current
  // filters (`meta.unreadIds`), which is more than the page on screen.
  const readAll = useCallback(async (list) => {
    const ids = list.map((d) => (typeof d === 'string' ? d : d.isRead === false ? d._id : null)).filter(Boolean);
    if (!ids.length) return;
    try {
      await many(ids);
      setSeen((s) => new Set([...s, ...ids]));
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  }, [many]);

  // What the server still calls unread, less what has been opened since.
  const stillUnread = useCallback((ids) => (ids || []).filter((id) => !seen.has(id)), [seen]);

  return { docs: marked, read, readAll, stillUnread };
}

/** "3 unread · Mark all as read" — only there while something is unread. */
export const UnreadNote = ({ docs, count, onClear }) => {
  // `count` is the whole shelf's figure from the server; without it, what is loaded.
  const n = count ?? (docs || []).filter((d) => d.isRead === false).length;
  if (!n) return null;
  return (
    <span className="dvunread">
      <span className="dvunread__dot" aria-hidden />
      {n} unread
      <button type="button" onClick={onClear}>Mark all as read</button>
    </span>
  );
};

// ── The discussion, for the people the document was shared with ──────────────

const ROLE_LABEL = { school_admin: 'Admin', teacher: 'Teacher', student: 'Student', parent: 'Parent' };

const fmtWhen = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${fmtDate(d)}, ${x.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()}`;
};

/**
 * One comment in the drawer. The reader's own comments carry Edit and Delete
 * (the server's `canEdit` / `canDelete` — your own words, nobody else's).
 * Delete asks once, in the row itself rather than over the drawer.
 */
const CommentRow = ({ c, onReply, reply, onEdit, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body || '');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (c.deleted) {
    return (
      <li className={`dvcom dvcom--gone${reply ? ' dvcom--reply' : ''}`}>
        <span className="dvcom__goneicon" aria-hidden><Icon name="trash" size={13} /></span>
        <div className="dvcom__body"><p>This comment was deleted.</p></div>
      </li>
    );
  }

  const save = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body && !c.files?.length) return;
    setBusy(true);
    try { await onEdit(c, body); setEditing(false); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await onDelete(c); } finally { setBusy(false); setAsking(false); }
  };
  const canEdit = onEdit && c.canEdit;
  const canDelete = onDelete && c.canDelete;

  return (
    <li className={`dvcom${reply ? ' dvcom--reply' : ''}`}>
      <Avatar name={c.author?.name} src={c.author?.photo} size={reply ? 26 : 30} />
      <div className="dvcom__body">
        <header>
          <b>{c.mine ? 'You' : c.author?.name}</b>
          <span className={`dvcom__role dvcom__role--${c.author?.role}`}>{ROLE_LABEL[c.author?.role] || c.author?.role}</span>
          {c.isPinned ? <span className="dvpill dvpill--indigo"><Icon name="star" size={11} /> Pinned</span> : null}
          {c.isEdited ? <em className="dvcom__edited">edited</em> : null}
          <time>{fmtWhen(c.createdAt)}</time>
        </header>
        {editing ? (
          <form className="dvcom__edit" onSubmit={save}>
            <textarea className="form-control" rows={2} maxLength={2000} value={draft} autoFocus
              aria-label="Edit your comment" onChange={(e) => setDraft(e.target.value)} />
            <div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy || (!draft.trim() && !c.files?.length)}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
                onClick={() => { setEditing(false); setDraft(c.body || ''); }}>Cancel</button>
            </div>
          </form>
        ) : (c.body ? <p>{c.body}</p> : null)}
        {c.files?.length > 0 && <FileRows files={c.files} caption={c.author?.name} compact />}
        {asking ? (
          <div className="dvcom__ask" role="alert">
            <span>Delete your comment?</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
          </div>
        ) : !editing && (onReply || canEdit || canDelete) ? (
          <div className="dvcom__acts">
            {onReply && (
              <button type="button" className="dvcom__reply" onClick={() => onReply(c)}>
                <Icon name="repeat" size={12} /> Reply
              </button>
            )}
            {canEdit && (
              <button type="button" className="dvcom__reply" onClick={() => { setDraft(c.body || ''); setEditing(true); }}>
                <Icon name="pencil" size={12} /> Edit
              </button>
            )}
            {canDelete && (
              <button type="button" className="dvcom__reply dvcom__reply--danger" onClick={() => setAsking(true)}>
                <Icon name="trash" size={12} /> Delete
              </button>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
};

/**
 * The comments under one document, in the drawer.
 *
 * Teachers and the office have been able to write here all along; the people
 * the document was shared with could not see a word of it. They read what was
 * marked for everyone — a staff-only note never leaves the server — and can
 * ask a question back or answer one.
 */
export function DocComments({ docId, load, post, update, remove }) {
  const [threads, setThreads] = useState(null);
  const [failed,  setFailed]  = useState('');
  const [draft,   setDraft]   = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [posting, setPosting] = useState(false);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await load(docId);
      setThreads((res?.data ?? res)?.threads || []);
      setFailed('');
    } catch (err) {
      setFailed(err?.response?.data?.message || err.message || 'The comments could not be loaded');
    }
  }, [docId, load]);

  useEffect(() => {
    setThreads(null); setDraft(''); setReplyTo(null);
    fetchThreads();
  }, [fetchThreads]);

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await post(docId, { body: draft.trim(), parent: replyTo?._id });
      setDraft(''); setReplyTo(null);
      await fetchThreads();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setPosting(false);
    }
  };

  const total = (threads || []).reduce((n, c) => n + (c.deleted ? 0 : 1) + (c.replies?.length || 0), 0);
  const reply = post ? (c) => { setReplyTo(c); document.getElementById('dv-comment')?.focus(); } : null;

  // Your own comments only — the server refuses anything else.
  const onEdit = update ? async (c, body) => {
    try {
      await update(c._id, { body });
      await fetchThreads();
      toast.success('Comment updated');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
      throw err;
    }
  } : null;
  const onDelete = remove ? async (c) => {
    try {
      await remove(c._id);
      if (replyTo && String(replyTo._id) === String(c._id)) setReplyTo(null);
      await fetchThreads();
      toast.success('Comment deleted');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  } : null;

  return (
    <section className="dvdrawer__sec">
      <h4>Comments{threads ? ` (${total})` : ''}</h4>

      {failed ? <p className="dvnone">{failed}</p> : null}
      {!threads && !failed ? <Loading /> : null}
      {threads && !threads.length ? (
        <p className="dvnone">No comments yet{post ? ' — ask a question below if something is unclear.' : '.'}</p>
      ) : null}

      {threads?.length > 0 && (
        <ul className="dvcoms">
          {threads.map((c) => (
            <React.Fragment key={c._id}>
              <CommentRow c={c} onReply={c.deleted ? null : reply} onEdit={onEdit} onDelete={onDelete} />
              {(c.replies || []).map((r) => (
                <CommentRow key={r._id} c={r} reply onReply={reply && (() => reply(c.deleted ? r : c))} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </React.Fragment>
          ))}
        </ul>
      )}

      {post && (
        <form className="dvcomform" onSubmit={send}>
          {replyTo && (
            <p className="dvcomform__to">
              Replying to <b>{replyTo.mine ? 'your comment' : replyTo.author?.name}</b>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                <Icon name="close" size={13} />
              </button>
            </p>
          )}
          <textarea id="dv-comment" className="form-control" rows={2} maxLength={2000} value={draft}
            placeholder="Write a comment or ask a question…" onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={posting || !draft.trim()}>
            {posting ? 'Posting…' : 'Post comment'}
          </button>
        </form>
      )}
    </section>
  );
}
