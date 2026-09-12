/**
 * The pieces of the notifications screen — the one every role shares.
 *
 * The page is a mailbox, not a table of records, so it borrows the app's list
 * frame's card, toolbar, menu and footer (admin/listParts.jsx) but draws its own
 * row: a notification is a headline, a sentence and three facts about where it
 * came from, and squeezing that into columns loses the headline.
 *
 * Everything that knows what a notification *is* lives here; the page keeps the
 * state, the calls and the tabs. Same file convention as holidayParts.jsx.
 */
import React, { useEffect, useState } from 'react';
import Icon from '../../components/ui/icons';
import { Button, Modal } from '../../components/ui/index';
import { RowMenu, MenuItem, MenuSep } from '../admin/listParts';

// ── What a notification looks like ───────────────────────────────────────────

/**
 * Which glyph a module's notifications carry.
 *
 * The mark is one shape per module and one colour for all of them. The glyph
 * is worth having — library and leave are genuinely different things and the
 * eye picks the shape up faster than it reads the module name on the meta line
 * below. The colour is not: fifteen tints down one column reads as a code
 * somebody is supposed to have learnt, and there is nothing to learn. So the
 * tint is always indigo and only the shape carries meaning.
 */
const MODULE_ICON = {
  leave:      'calendar',
  attendance: 'checkSquare',
  fees:       'creditCard',
  payroll:    'wallet',
  library:    'book',
  results:    'trophy',
  timetable:  'clock',
  calendar:   'party',
  inventory:  'package',
  transport:  'bus',
  hostel:     'hotel',
  video:      'video',
  feedback:   'star',
  academics:  'school',
  general:    'megaphone',
};

/** An unknown key falls back to the bell, so a module added on the server never
 *  renders a hole. */
export const moduleIcon = (key) => MODULE_ICON[key] || 'bell';

const RowMark = ({ module: key, size = 20 }) => (
  <span className="nfrow__icon tint-indigo" aria-hidden>
    <Icon name={moduleIcon(key)} size={size} />
  </span>
);

/**
 * The text without the little pictures in it.
 *
 * Notification titles are written with an emoji in front — "🎉 Holiday: …",
 * "📚 Book issued", "✅ Comp Off approved" — which made sense when the row had
 * no mark of its own. It has one now, drawn in the app's own hand at the app's
 * own size, and the two together read as a stutter. The stored text keeps its
 * emoji, because the same title goes out by email and as a push notification
 * where there is no icon beside it; this strips them for the screen only.
 *
 * Deliberately narrow — pictographs and their modifiers, nothing else — so the
 * ₹ signs, em dashes and curly quotes that make up the rest of the non-ASCII in
 * these messages come through untouched.
 */
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

export const plain = (text) => {
  const out = String(text ?? '')
    .replace(PICTOGRAPHS, '')
    // Tidy up only the gap the emoji left behind. Horizontal whitespace only:
    // some bodies are a block of labelled lines — a substitution carries Date,
    // Period, Class, Subject on separate rows and the panel renders them
    // pre-wrap — and collapsing every run of whitespace would fold that into
    // one unreadable line.
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .trim();
  // A title that was nothing but an emoji would come back empty, and an empty
  // headline is worse than a redundant one.
  return out || String(text ?? '');
};

// ── Priority ─────────────────────────────────────────────────────────────────
// Three levels, and the label is always printed — the colour is a second
// channel on top of the word, never the only one.
export const PRIORITIES = [
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
];

export const PriorityPill = ({ level }) => {
  const p = PRIORITIES.find((x) => x.value === level) || PRIORITIES[2];
  return <span className={`nfprio nfprio--${p.value}`}>{p.label}</span>;
};

// What a notification is, as a reader would divide them: something a module
// raised about a record, or something a person announced to an audience.
export const KINDS = [
  { value: 'activity',     label: 'Activity' },
  { value: 'announcement', label: 'Announcements' },
];

export const READ_STATES = [
  { value: 'unread', label: 'Unread' },
  { value: 'read',   label: 'Read' },
];

export const SORTS = [
  { value: 'newest',   label: 'Newest first' },
  { value: 'oldest',   label: 'Oldest first' },
  { value: 'unread',   label: 'Unread first' },
  { value: 'priority', label: 'Priority' },
  { value: 'title',    label: 'Title (A–Z)' },
];

// Who a sent notification went to. The server stores the target type; these are
// the same words the composer offers, so Sent reads back what was chosen.
export const TARGET_LABELS = {
  all:              'All Users',
  all_teachers:     'All Teachers',
  all_students:     'All Students',
  all_parents:      'All Parents',
  class_students:   'Class — Students',
  class_parents:    'Class — Parents',
  section_students: 'Section — Students',
  section_parents:  'Section — Parents',
  section_all:      'Section — Everyone',
  all_schools:      'All Schools',
  specific_school:  'Selected Schools',
  individual:       'Raised by a module',
};

export const targetLabel = (t) => TARGET_LABELS[t] || t || '—';

// ── Time ─────────────────────────────────────────────────────────────────────

/** "2 hours ago" for anything recent, a date once it stops being "recent". */
export function when(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days} day${days === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const fullWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

// ── Header ───────────────────────────────────────────────────────────────────

/**
 * The page's header: what this is, a drawing, and the one thing worth knowing
 * about it — that these arrive as they happen rather than on a refresh.
 *
 * `subtitle` and `tip` are the only words that differ between a school admin,
 * a teacher, a student and a parent, so they are the only thing the four roles
 * pass in.
 */
export const NotifHero = ({ unread, subtitle, tip }) => (
  <header className="lhero nfhero">
    <div className="nfhero__lead">
      <span className="nfhero__badge"><Icon name="bell" size={30} /></span>
      <div className="lhero__text">
        <h1>Notifications</h1>
        <p>{subtitle}</p>
      </div>
    </div>

    <div className="lhero__art nfhero__art" aria-hidden>
      <svg viewBox="0 0 150 96" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="24" width="94" height="64" rx="8" />
        <path d="M8 30l45 32 45-32" />
        <path d="M6 86l36-28M100 86L64 58" />
        <path d="M126 44a16 16 0 1 0-32 0c0 13-5 16-5 16h42s-5-3-5-16" />
        <path d="M104.5 66a5.5 5.5 0 0 0 9 0" />
        <path d="M133 20l6-6M137 32h8M129 10l2-8" />
      </svg>
    </div>

    <aside className="nfhero__tip">
      <h2>Never miss what matters</h2>
      <p>
        {unread > 0
          ? `${unread} ${unread === 1 ? 'notification is' : 'notifications are'} still unread. ${tip}`
          : `Everything is read. ${tip}`}
      </p>
      <span className="nfhero__rule" aria-hidden />
    </aside>
  </header>
);

// ── Tabs ─────────────────────────────────────────────────────────────────────

export const TabStrip = ({ tabs, value, onChange, children }) => (
  <div className="nftabs">
    <div className="nftabs__set" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value}
          className={`nftab${value === t.value ? ' is-on' : ''}`} onClick={() => onChange(t.value)}>
          <Icon name={t.icon} size={16} />
          {t.label}
          {t.count > 0 && <span className={`nftab__n${t.accent ? ' nftab__n--accent' : ''}`}>{t.count}</span>}
        </button>
      ))}
    </div>
    <div className="nftabs__acts">{children}</div>
  </div>
);

// ── One notification ─────────────────────────────────────────────────────────

/**
 * A row in the mailbox.
 *
 * The whole row opens it — the trailing button is the *other* action, which is
 * why it reads "Open" while a notification is unread and "Mark as Unread" once
 * it is not: by then opening is already a click anywhere on the row, and the
 * useful thing left is putting it back.
 */
export function NotifRow({ row, active, picked, onPick, onOpen, onRead, onUnread, onArchive, onRestore }) {
  const n    = row.notification || {};
  const goes = row.link?.resolved;

  return (
    <article
      className={[
        'nfrow',
        row.isRead ? '' : 'is-unread',
        active ? 'is-active' : '',
        picked ? 'is-picked' : '',
      ].filter(Boolean).join(' ')}
      data-focus-id={row._id}
      aria-current={active ? 'true' : undefined}
    >
      {onPick && (
        <label className="nfrow__tick">
          <input type="checkbox" checked={!!picked} onChange={() => onPick(row)}
            aria-label={`Select "${plain(n.title) || 'this notification'}"`} />
        </label>
      )}

      <button type="button" className="nfrow__open" onClick={() => onOpen(row)}>
        <span className={`nfrow__dot${row.isRead ? '' : ' is-on'}`} aria-hidden />
        <RowMark module={row.module?.key} />

        <span className="nfrow__body">
          <span className="nfrow__title">{plain(n.title) || 'Notification'}</span>
          {n.body ? <span className="nfrow__text">{plain(n.body)}</span> : null}
          <span className="nfrow__meta">
            <b>{row.sender?.name || 'System'}</b>
            <i aria-hidden>•</i>
            <span>{row.module?.label || 'General'}</span>
            <i aria-hidden>•</i>
            <time dateTime={row.createdAt} title={fullWhen(row.createdAt)}>{when(row.createdAt)}</time>
          </span>
        </span>
      </button>

      <div className="nfrow__end">
        <PriorityPill level={row.priority} />

        {row.isCleared ? (
          <button type="button" className="btn btn-secondary btn-sm nfrow__act" onClick={() => onRestore(row)}>
            <Icon name="refresh" size={14} /> Move to Inbox
          </button>
        ) : row.isRead ? (
          <button type="button" className="btn btn-secondary btn-sm nfrow__act" onClick={() => onUnread(row)}>
            Mark as Unread
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm nfrow__act nfrow__act--on" onClick={() => onOpen(row)}>
            Open
          </button>
        )}

        <RowMenu label="More actions">
          <MenuItem icon="eye" onClick={() => onOpen(row)}>
            {goes ? 'Go to what it is about' : 'Read the message'}
          </MenuItem>
          {row.isRead
            ? <MenuItem icon="bell" onClick={() => onUnread(row)}>Mark as unread</MenuItem>
            : <MenuItem icon="checkCircle" onClick={() => onRead(row)}>Mark as read</MenuItem>}
          <MenuSep />
          {row.isCleared
            ? <MenuItem icon="refresh" onClick={() => onRestore(row)}>Move back to Inbox</MenuItem>
            : <MenuItem icon="folder" onClick={() => onArchive(row)}>Archive</MenuItem>}
        </RowMenu>
      </div>
    </article>
  );
}

/**
 * The bar above the list: pick rows, then act on them.
 *
 * One bar rather than two. A select-all tick that only appears once something
 * is already selected is a chicken-and-egg, so the tick is always there and the
 * actions arrive beside it when there is something to act on.
 *
 * "Select all" means all on this page, and says so — a page of ten with a
 * button that silently deletes four hundred is the kind of control people learn
 * not to touch.
 */
export const BulkBar = ({ count, total, allOn, some, onToggleAll, onClear, children }) => (
  <div className={`nfbulk${count ? ' is-on' : ''}`}>
    <label className="nfbulk__tick">
      <input type="checkbox" checked={allOn}
        ref={(el) => { if (el) el.indeterminate = some; }}
        onChange={onToggleAll}
        aria-label="Select every notification on this page" />
      {count
        ? <span><b>{count}</b> selected</span>
        : <span>Select all {total} on this page</span>}
    </label>
    {count > 0 && (
      <div className="nfbulk__acts">
        {children}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>Clear</button>
      </div>
    )}
  </div>
);

// ── The notification, opened ─────────────────────────────────────────────────

/**
 * The whole message, beside the list.
 *
 * A notification that names a destination goes straight there on click and
 * never reaches this panel; what lands here is the kind whose body *is* the
 * point — an announcement somebody typed — so the body gets room to be read.
 */
export function NotifDetail({ row, onClose, onGo, onUnread, onArchive, onRestore }) {
  if (!row) return null;
  const n = row.notification || {};

  return (
    <>
      <div className="ldrawer__head nfdetail__head">
        <RowMark module={row.module?.key} size={22} />
        <div className="ldrawer__id">
          <h3>{plain(n.title)}</h3>
          <p>{row.module?.label || 'General'} · {fullWhen(row.createdAt)}</p>
        </div>
        <button type="button" className="lact" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="nfdetail">
        <div className="nfdetail__tags">
          <PriorityPill level={row.priority} />
          <span className="nfdetail__tag">{row.kind === 'announcement' ? 'Announcement' : 'Activity'}</span>
          <span className="nfdetail__tag">{row.isRead ? 'Read' : 'Unread'}</span>
          {row.isCleared && <span className="nfdetail__tag">Archived</span>}
        </div>

        <p className="nfdetail__body">{plain(n.body)}</p>

        <dl className="nfdetail__facts">
          <div className="lfield"><dt>From</dt><dd>{row.sender?.name || 'System'}</dd></div>
          <div className="lfield"><dt>Module</dt><dd>{row.module?.label || 'General'}</dd></div>
          <div className="lfield"><dt>Received</dt><dd>{fullWhen(row.createdAt)}</dd></div>
          {row.readAt ? <div className="lfield"><dt>Read</dt><dd>{fullWhen(row.readAt)}</dd></div> : null}
        </dl>
      </div>

      <div className="ldrawer__foot">
        {row.link?.resolved && (
          <button type="button" className="btn" onClick={() => onGo(row)}>
            Go to what it is about <Icon name="arrowRight" size={15} />
          </button>
        )}
        {row.isRead && !row.isCleared && (
          <button type="button" className="btn btn-secondary" onClick={() => onUnread(row)}>Mark as Unread</button>
        )}
        {row.isCleared
          ? <button type="button" className="btn btn-secondary" onClick={() => onRestore(row)}>Move to Inbox</button>
          : <button type="button" className="btn btn-secondary" onClick={() => onArchive(row)}>Archive</button>}
      </div>
    </>
  );
}

// ── Sent ─────────────────────────────────────────────────────────────────────

/** The headline and the first line of a sent notification, in one cell. */
export const SentCell = ({ n }) => (
  <div className="nfsent__what">
    <b>{plain(n.title)}</b>
    <small title={plain(n.body)}>{plain(n.body)}</small>
  </div>
);

/** Which channels it went out on. Both are real deliveries, so both are named. */
export const Channels = ({ channels }) => {
  const on = [
    channels?.inApp !== false ? 'In-App' : null,
    channels?.email ? 'Email' : null,
  ].filter(Boolean);
  return (
    <div className="lchips">
      {on.length ? on.map((c) => <span key={c} className="lchip">{c}</span>) : <span className="lnone">—</span>}
    </div>
  );
};

/**
 * How much of the audience has actually opened it.
 *
 * The figure the sender needs and the list alone cannot give: "sent to 340" is
 * not delivery. An email-only notification writes no receipts, so it reports
 * that rather than a misleading 0%.
 */
export const ReadThrough = ({ delivered, opened }) => {
  if (!delivered) return <span className="lnone">Email only</span>;
  const pct = Math.round((opened / delivered) * 100);
  return (
    <div className="nfread">
      <div className="nfread__bar"><span style={{ width: `${pct}%` }} /></div>
      <span className="nfread__n">{opened} of {delivered} · {pct}%</span>
    </div>
  );
};

// ── The composer ─────────────────────────────────────────────────────────────

/**
 * Who a notification can be addressed to, per role.
 *
 * A school admin reaches the whole school and narrows by class or section; a
 * teacher reaches the sections they actually teach and nothing else. The two
 * lists are what the server enforces as well — see the teacher check in
 * notification.controller's send() — so a target missing here is a target the
 * endpoint refuses, not merely one the form declines to draw.
 */
export const ADMIN_AUDIENCES = [
  { value: 'all',              label: 'All Users (Teachers + Students + Parents)' },
  { value: 'all_teachers',     label: 'All Teachers' },
  { value: 'all_students',     label: 'All Students' },
  { value: 'all_parents',      label: 'All Parents' },
  { group: 'By Class' },
  { value: 'class_students',   label: 'Students in a Specific Class', needsClass: true },
  { value: 'class_parents',    label: 'Parents of Students in a Specific Class', needsClass: true },
  { group: 'By Section' },
  { value: 'section_students', label: 'Students in a Specific Section', needsClass: true, needsSection: true },
  { value: 'section_parents',  label: 'Parents of Students in a Specific Section', needsClass: true, needsSection: true },
  { value: 'section_all',      label: 'Everyone in a Section (Students + Parents)', needsClass: true, needsSection: true },
];

export const TEACHER_AUDIENCES = [
  { value: 'section_students', label: 'Students in a section I teach', needsSection: true },
  { value: 'section_parents',  label: 'Parents of students in a section I teach', needsSection: true },
  { value: 'section_all',      label: 'Everyone in a section I teach (students + parents)', needsSection: true },
];

const blankForm = (audiences) => ({
  title: '', body: '',
  channels: { inApp: true, email: false },
  targetType: audiences.find((a) => a.value)?.value || 'all',
  priority: 'medium',
  classId: '', sectionId: '',
});

/**
 * Writing one.
 *
 * Two shapes behind one form. Given `classes` it cascades class → section,
 * which is how an admin picks any section in the school; given `sections` it
 * offers that flat list instead, which is how a teacher picks between the
 * sections they teach. Nothing else about writing a notification differs
 * between the two, so nothing else is duplicated.
 */
export function Composer({ open, onClose, onSend, saving, audiences, classes, sections, note }) {
  const [form, setForm] = useState(() => blankForm(audiences));
  useEffect(() => { if (open) setForm(blankForm(audiences)); }, [open, audiences]);

  const chosen      = audiences.find((a) => a.value === form.targetType) || {};
  const byClass     = !!classes;
  const classList   = classes || [];
  const sectionList = byClass
    ? (classList.find((c) => c._id === form.classId)?.sections || [])
    : (sections || []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e) => {
    e.preventDefault();
    onSend({
      title:      form.title.trim(),
      body:       form.body.trim(),
      channels:   form.channels,
      targetType: form.targetType,
      priority:   form.priority,
      classId:    chosen.needsClass   ? form.classId   : undefined,
      sectionId:  chosen.needsSection ? form.sectionId : undefined,
    }, chosen);
  };

  return (
    <Modal open={open} onClose={onClose} title="Send Notification"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button form="notif-form" type="submit" loading={saving}>Send</Button>
      </>}>
      <form id="notif-form" onSubmit={submit}>
        {note ? <p className="nfnote"><Icon name="info" size={14} /> {note}</p> : null}

        <div className="form-group">
          <label className="form-label required">Subject / Title</label>
          <input className="form-control" required autoFocus value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="e.g. Parent–teacher meeting on Saturday" />
        </div>

        <div className="form-group">
          <label className="form-label required">Message Body</label>
          <textarea className="form-control" rows={4} required value={form.body}
            onChange={(e) => set({ body: e.target.value })}
            placeholder="Write your message here…" />
        </div>

        <div className="form-group">
          <label className="form-label required">Send To</label>
          <select className="form-control" value={form.targetType}
            onChange={(e) => set({ targetType: e.target.value, classId: '', sectionId: '' })}>
            {audiences.map((a) => (a.group
              ? <option key={a.group} disabled>{`── ${a.group} ${'─'.repeat(Math.max(0, 26 - a.group.length))}`}</option>
              : <option key={a.value} value={a.value}>{a.label}</option>))}
          </select>
        </div>

        {byClass && chosen.needsClass && (
          <div className="form-group">
            <label className="form-label required">Class</label>
            <select className="form-control" value={form.classId}
              onChange={(e) => set({ classId: e.target.value, sectionId: '' })}>
              <option value="">Select Class</option>
              {classList.map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
            </select>
          </div>
        )}

        {chosen.needsSection && (
          <div className="form-group">
            <label className="form-label required">Section</label>
            <select className="form-control" value={form.sectionId}
              onChange={(e) => set({ sectionId: e.target.value })}
              disabled={byClass && !form.classId}>
              <option value="">Select Section</option>
              {sectionList.map((s) => (
                <option key={s._id} value={s._id}>
                  {/* A teacher's list spans classes, so the section name alone
                      would read as three identical "A"s. */}
                  {byClass ? s.sectionName : `${s.className || 'Class'} — ${s.sectionName}`}
                </option>
              ))}
            </select>
            {!byClass && !sectionList.length && (
              <p className="nfnote nfnote--warn">
                <Icon name="alert" size={14} /> You are not attached to any section yet, so there is nobody to send to.
              </p>
            )}
          </div>
        )}

        {/* A module's notification takes its priority from what it is about; a
            message someone typed has nothing to derive it from, so it asks. */}
        <div className="form-group">
          <label className="form-label">Priority</label>
          <div className="nfpick">
            {PRIORITIES.map((p) => (
              <label key={p.value} className={`nfpick__opt${form.priority === p.value ? ' is-on' : ''}`}>
                <input type="radio" name="priority" value={p.value}
                  checked={form.priority === p.value} onChange={() => set({ priority: p.value })} />
                {p.label}
              </label>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Notification Channels</label>
          <div className="nfpick">
            <label className={`nfpick__opt${form.channels.inApp ? ' is-on' : ''}`}>
              <input type="checkbox" checked={form.channels.inApp}
                onChange={(e) => set({ channels: { ...form.channels, inApp: e.target.checked } })} />
              In-App
            </label>
            <label className={`nfpick__opt${form.channels.email ? ' is-on' : ''}`}>
              <input type="checkbox" checked={form.channels.email}
                onChange={(e) => set({ channels: { ...form.channels, email: e.target.checked } })} />
              Email
            </label>
          </div>
        </div>
      </form>
    </Modal>
  );
}
