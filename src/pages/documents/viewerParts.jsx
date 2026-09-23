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
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/ui/icons';
import { Empty, Spinner } from '../../components/ui/index';
import {
  FileMark, fileUrl, fmtSize, fmtDate, typeOf, DOC_TYPES,
} from '../admin/documentParts';
import Tabs from '../../components/ui/Tabs';

export { FileMark, fileUrl, fmtSize, fmtDate, typeOf, DOC_TYPES };

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
  { value: 'due',    label: 'Due soonest' },
  { value: 'title',  label: 'Title (A–Z)' },
];

/** Where a piece of set work stands. */
export const STATES = {
  pending:   { label: 'To do',       tone: 'warn', icon: 'clock' },
  submitted: { label: 'Submitted',   tone: 'yes',  icon: 'checkCircle' },
  late:      { label: 'Submitted late', tone: 'warn', icon: 'checkCircle' },
  marked:    { label: 'Marked',      tone: 'info', icon: 'star' },
  missed:    { label: 'Missed',      tone: 'bad',  icon: 'alert' },
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

  if (state === 'submitted' || state === 'late' || state === 'marked') {
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
  return (
    <article className={`dvcard${dense ? ' dvcard--dense' : ''}`} data-focus-id={doc._id}>
      <button type="button" className="dvcard__open" onClick={() => onOpen(doc)}
        aria-label={`Open ${doc.title}`}>
        <FileMark file={doc.files?.[0]} size={44} />
        <span className="dvcard__main">
          <span className="dvcard__title">{doc.title}</span>
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
            <a className="dvact" href={fileUrl(doc.files[0].filePath)} target="_blank" rel="noreferrer"
              title="Open the file" aria-label={`Open ${doc.files[0].originalName}`}>
              <Icon name="download" size={15} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export const DocList = ({ docs, loading, empty, ...rest }) => {
  if (loading) return <Loading />;
  if (!docs.length) return empty;
  return <div className="dvlist">{docs.map((d) => <DocCard key={d._id} doc={d} {...rest} />)}</div>;
};

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

export const FileRows = ({ files, empty = 'No files attached' }) => (
  files?.length
    ? (
      <ul className="dvfiles">
        {files.map((f, i) => (
          <li key={`${f.storedName || f.originalName}-${i}`}>
            <FileMark file={f} size={32} />
            <span className="dvfiles__name" title={f.originalName}>{f.originalName}</span>
            <span className="dvfiles__size">{fmtSize(f.fileSize)}</span>
            <a className="dvact" href={fileUrl(f.filePath)} target="_blank" rel="noreferrer"
              title="Open file" aria-label={`Open ${f.originalName}`}><Icon name="download" size={15} /></a>
          </li>
        ))}
      </ul>
    )
    : <p className="dvnone">{empty}</p>
);

/**
 * The document, opened.
 *
 * `extra` is the part that differs per reader: a student's submission box, a
 * parent's per-child strip, a teacher's link into the marking screen.
 */
export function DocDrawer({ doc, onClose, extra, foot }) {
  if (!doc) return null;
  const type = typeOf(doc.docType);
  const due  = doc.isAssignment ? dueLine(doc.dueDate, doc.state) : null;
  return (
    <Drawer open={!!doc} onClose={onClose}>
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
          <FileRows files={doc.files} />
        </section>

        {extra}
      </div>

      {foot ? <div className="dvdrawer__foot">{foot}</div> : null}
    </Drawer>
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
export function FileDrop({ files, onChange, hint, max = 10, id = 'dv-drop' }) {
  const [over, setOver] = useState(false);

  const add = (picked) => {
    const list = [...files];
    for (const f of picked) {
      // Same name and size twice is the same file picked twice, not two files.
      if (!list.some((x) => x.name === f.name && x.size === f.size)) list.push(f);
    }
    onChange(list.slice(0, max));
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
        <input id={id} type="file" multiple
          onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
      </label>

      {files.length > 0 && (
        <>
          <ul className="dvdrop__list">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`}>
                <FileMark file={{ originalName: f.name, mimeType: f.type }} size={30} />
                <span className="dvfiles__name" title={f.name}>{f.name}</span>
                <span className="dvfiles__size">{fmtSize(f.size)}</span>
                <button type="button" className="dvact" title={`Remove ${f.name}`}
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onChange(files.filter((x) => !(x.name === f.name && x.size === f.size)))}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <p className="dvdrop__sum">
            {files.length} file{files.length === 1 ? '' : 's'} · {fmtSize(total)}
            <button type="button" onClick={() => onChange([])}>Remove all</button>
          </p>
        </>
      )}
    </div>
  );
}

// ── Filtering, shared by all three pages ─────────────────────────────────────

const TAB_TYPES = {
  notices: ['notice', 'circular'],
  study:   ['study_material'],
};

/**
 * One filter pass, so the tabs mean the same thing on all three screens.
 *
 * The assignments tab is the flag rather than the type: a piece of work set as
 * "Study Material" that students still hand in is an assignment to the person
 * who has to do it.
 */
export function applyFilters(docs, { tab, category, search, sort, state }) {
  const term = String(search || '').trim().toLowerCase();

  let out = docs.filter((d) => {
    if (tab === 'assignments' && !d.isAssignment) return false;
    if (TAB_TYPES[tab] && !TAB_TYPES[tab].includes(d.docType)) return false;
    if (category && d.category !== category) return false;
    if (state && d.state !== state) return false;
    if (term && !`${d.title} ${d.description} ${d.category} ${d.uploadedBy?.name || ''}`
      .toLowerCase().includes(term)) return false;
    return true;
  });

  const byDate = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  out = [...out].sort((a, b) => {
    switch (sort) {
      case 'oldest': return -byDate(a, b);
      case 'title':  return a.title.localeCompare(b.title);
      // Documents with no due date sort last rather than first — a notice is
      // not "due immediately" just because it has no date.
      case 'due': {
        const av = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return av - bv || byDate(a, b);
      }
      default: return byDate(a, b);
    }
  });
  return out;
}
