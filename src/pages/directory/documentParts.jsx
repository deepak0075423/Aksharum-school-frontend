/**
 * Employee documents — the office's review and reminders (Employee Directory).
 *
 * Each uploaded document is decided on by itself: Verify, or Reject with a
 * reason the employee is shown. A rejected document is uploaded again from the
 * employee's My Documents page, and that new file is back in front of the
 * office as "Re-submitted". Reminders chase what is still owed — a required
 * document never uploaded, or one that was rejected — and a reminder closes on
 * its own once everything it asked for has arrived.
 *
 * Prefixed `edoc`. The state words and colours are shared with the employee's
 * own page (MyDocuments.jsx), so both sides of the conversation say the same.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Button, Modal } from '../../components/ui/index';
import { Avatar, fileUrl, fmtDate } from './parts';

// ── Words ────────────────────────────────────────────────────────────────────

export const DOC_STATE = {
  missing:     { label: 'Not uploaded',    tone: 'slate', icon: 'upload' },
  pending:     { label: 'Awaiting review', tone: 'amber', icon: 'clock' },
  resubmitted: { label: 'Re-submitted',    tone: 'blue',  icon: 'refresh' },
  verified:    { label: 'Verified',        tone: 'green', icon: 'checkCircle' },
  rejected:    { label: 'Rejected',        tone: 'red',   icon: 'alert' },
};

export const DocState = ({ state }) => {
  const s = DOC_STATE[state] || DOC_STATE.pending;
  return <span className={`edoc-pill edoc-pill--${s.tone}`}><Icon name={s.icon} size={12} /> {s.label}</span>;
};

export const REMIND_STATE = {
  not_reminded:  { label: 'Not reminded yet',  tone: 'slate' },
  awaiting:      { label: 'Awaiting upload',   tone: 'amber' },
  follow_up_due: { label: 'Follow-up due',     tone: 'red'   },
  resolved:      { label: 'Resolved',          tone: 'green' },
  clear:         { label: 'Nothing owed',      tone: 'green' },
};

export const RemindState = ({ state }) => {
  const s = REMIND_STATE[state] || REMIND_STATE.clear;
  return <span className={`edoc-pill edoc-pill--${s.tone}`}>{s.label}</span>;
};

const isImage = (u) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u || '');
const isPdf   = (u) => /\.pdf(\?|$)/i.test(u || '');

/** What the shared Lightbox needs to show one document. */
export const lightboxDoc = (d, who) => {
  const url = fileUrl(d.url);
  return { label: who ? `${d.label} — ${who}` : d.label, url, image: isImage(d.url), pdf: isPdf(d.url) };
};

const ago = (d) => {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

// ── Rejecting ────────────────────────────────────────────────────────────────

/**
 * Reject one document — the reason first, then a confirmation of what it does.
 *
 * The reason is mandatory: it is the only thing the employee is told, and
 * "rejected" with no reason sends them back to upload the same file again.
 * The button stays disabled until there is one, and the popup says plainly
 * that the employee will be asked to upload the document again.
 */
export function RejectDialog({ target, busy, onClose, onConfirm }) {
  const [comment, setComment] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (target) { setComment(''); setTried(false); } }, [target]);
  if (!target) return null;
  const short = comment.trim().length < 5;
  return (
    <Modal open onClose={busy ? () => {} : onClose} title="Reject this document?" maxWidth={520}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" loading={busy} disabled={busy}
          onClick={() => { setTried(true); if (!short) onConfirm(comment.trim()); }}>
          <Icon name="close" size={15} /> Reject document
        </Button>
      </>}>
      <div className="edoc-reject">
        <p className="edoc-reject__what">
          <b>{target.label}</b> uploaded by <b>{target.employeeName}</b>
        </p>
        <label className="form-label required" htmlFor="edoc-reason">Reason for rejecting</label>
        <textarea id="edoc-reason" className={`form-control${tried && short ? ' is-bad' : ''}`} rows={3} maxLength={300}
          autoFocus value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="e.g. The image is blurred and the number cannot be read" />
        {tried && short
          ? <p className="edoc-err"><Icon name="alert" size={13} /> Give a reason — the employee is shown it when they upload the document again.</p>
          : <p className="form-hint">{300 - comment.length} characters left · shown to the employee</p>}
        <p className="edoc-reject__warn">
          <Icon name="info" size={14} />
          <span>
            {target.employeeName} will be notified and asked to upload a new copy. The document stays
            rejected until they do, and the new file comes back here as <b>Re-submitted</b>.
          </span>
        </p>
      </div>
    </Modal>
  );
}

/** Verify / Reject for one document, or what was decided. */
export const DocActions = ({ doc, busyKey, onVerify, onReject, compact }) => {
  const k = `${doc.employee}:${doc.key}`;
  if (!doc.fileName) return null;
  if (doc.state === 'verified') return <span className="edoc-done"><Icon name="checkCircle" size={14} /> Accepted</span>;
  if (doc.state === 'rejected') return <span className="edoc-wait"><Icon name="clock" size={14} /> Waiting for a new upload</span>;
  return (
    <div className="edoc-acts">
      <Button size="sm" variant="success" loading={busyKey === `${k}:verified`} disabled={!!busyKey}
        onClick={() => onVerify(doc)}>
        <Icon name="check" size={14} /> {compact ? 'Verify' : 'Verify'}
      </Button>
      <Button size="sm" variant="danger" disabled={!!busyKey} onClick={() => onReject(doc)}>
        <Icon name="close" size={14} /> Reject
      </Button>
    </div>
  );
};

// ── The documents tab ────────────────────────────────────────────────────────

const REVIEW_FILTERS = [
  { value: 'todo',        label: 'Awaiting review' },
  { value: 'resubmitted', label: 'Re-submitted' },
  { value: 'rejected',    label: 'Rejected' },
  { value: 'verified',    label: 'Verified' },
  { value: 'all',         label: 'All uploaded' },
];

/**
 * Every uploaded document in the school, one row each — the queue for working
 * through paperwork rather than through people. Re-submitted files lead: an
 * employee has already been waiting on those once.
 */
export function DocumentQueue({ employees, focus, filter, onFilter, search, busyKey, onOpen, onVerify, onReject, base }) {
  const rows = useMemo(() => employees.flatMap((e) => e.documents
    .filter((d) => d.fileName || d.state === 'rejected')
    .map((d) => ({ ...d, employee: e._id, employeeName: e.name, photo: e.profileImage, sub: [e.employeeId, e.designation].filter(Boolean).join(' · ') }))), [employees]);

  const counts = useMemo(() => ({
    todo: rows.filter((r) => r.state === 'pending' || r.state === 'resubmitted').length,
    resubmitted: rows.filter((r) => r.state === 'resubmitted').length,
    rejected: rows.filter((r) => r.state === 'rejected').length,
    verified: rows.filter((r) => r.state === 'verified').length,
    all: rows.length,
  }), [rows]);

  const term = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => {
      if (focus && r.employee !== focus) return false;
      if (filter === 'todo' && !(r.state === 'pending' || r.state === 'resubmitted')) return false;
      if (['resubmitted', 'rejected', 'verified'].includes(filter) && r.state !== filter) return false;
      if (term && !`${r.employeeName} ${r.label} ${r.sub}`.toLowerCase().includes(term)) return false;
      return true;
    })
    .sort((a, b) => (b.state === 'resubmitted') - (a.state === 'resubmitted')
      || new Date(b.resubmittedAt || 0) - new Date(a.resubmittedAt || 0)
      || a.employeeName.localeCompare(b.employeeName) || a.label.localeCompare(b.label));

  return (
    <div className="edoc-queue">
      <div className="edoc-filters" role="tablist" aria-label="Which documents">
        {REVIEW_FILTERS.map((f) => (
          <button key={f.value} type="button" role="tab" aria-selected={filter === f.value}
            className={`edoc-filter${filter === f.value ? ' is-on' : ''}`} onClick={() => onFilter(f.value)}>
            {f.label} <em>{counts[f.value]}</em>
          </button>
        ))}
      </div>

      {!shown.length ? (
        <div className="verempty">
          <Icon name="checkCircle" size={26} />
          <p>{filter === 'todo' ? 'Nothing is waiting for review.' : 'No documents here.'}</p>
          <span>{filter === 'todo' ? 'New uploads and re-submitted documents appear here.' : 'Try another filter.'}</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table edl-table edoc-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Document</th>
                <th>Status</th>
                <th>Notes</th>
                <th className="edl-table__acts">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.employee}:${r.key}`} data-focus-id={r.employee}>
                  <td>
                    <Link to={`${base}/employees/${r.employee}`} className="edoc-who">
                      <Avatar name={r.employeeName} src={r.photo} size={32} />
                      <span><b>{r.employeeName}</b><small>{r.sub || 'Staff'}</small></span>
                    </Link>
                  </td>
                  <td>
                    {r.fileName
                      ? (
                        <button type="button" className="edoc-file" onClick={() => onOpen(lightboxDoc(r, r.employeeName))}
                          title="Open the document">
                          <Icon name="eye" size={14} /> {r.label}
                        </button>
                      )
                      : <span className="edoc-file is-none">{r.label}</span>}
                    {r.required ? null : <small className="edoc-opt">Optional</small>}
                  </td>
                  <td><DocState state={r.state} /></td>
                  <td className="edoc-notes">
                    {r.state === 'resubmitted' && (
                      <span>New file {ago(r.resubmittedAt)}. Rejected before: <i>&ldquo;{r.comment}&rdquo;</i></span>
                    )}
                    {r.state === 'rejected' && <span><i>&ldquo;{r.comment}&rdquo;</i> · {fmtDate(r.reviewedAt)}</span>}
                    {r.state === 'verified' && <span>{r.reviewedAt ? `Verified ${fmtDate(r.reviewedAt)}` : 'Verified with its section'}</span>}
                    {r.state === 'pending' && <span>Not reviewed yet</span>}
                  </td>
                  <td className="edl-table__acts">
                    <DocActions doc={r} busyKey={busyKey} onVerify={onVerify} onReject={onReject} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Reminders ────────────────────────────────────────────────────────────────

const REMIND_FILTERS = [
  { value: 'owing',         label: 'Owing documents' },
  { value: 'not_reminded',  label: 'Not reminded yet' },
  { value: 'follow_up_due', label: 'Follow-up due' },
  { value: 'awaiting',      label: 'Awaiting upload' },
  { value: 'resolved',      label: 'Resolved' },
];

const OwedChips = ({ items }) => (
  <div className="edoc-owed">
    {items.map((o) => (
      <span key={o.key} className={`edoc-chip edoc-chip--${o.reason}`}
        title={o.reason === 'rejected' && o.comment ? `Rejected: ${o.comment}` : undefined}>
        {o.reason === 'rejected' ? 'Re-upload' : 'Missing'} · {o.label}
      </span>
    ))}
  </div>
);

/**
 * Who still owes documents, what the office has done about it, and the next
 * step for each: a first reminder, a follow-up once one has gone unanswered
 * for a few days, or nothing — it was answered.
 */
export function ReminderBoard({ employees, followUpAfterDays, filter, onFilter, search, base, onRemind }) {
  const [picked, setPicked] = useState(() => new Set());
  const [open, setOpen] = useState('');

  const counts = useMemo(() => ({
    owing: employees.filter((e) => e.outstanding.length).length,
    not_reminded: employees.filter((e) => e.reminders.state === 'not_reminded').length,
    follow_up_due: employees.filter((e) => e.reminders.state === 'follow_up_due').length,
    awaiting: employees.filter((e) => e.reminders.state === 'awaiting').length,
    resolved: employees.filter((e) => e.reminders.state === 'resolved').length,
  }), [employees]);

  const term = search.trim().toLowerCase();
  const shown = employees.filter((e) => {
    if (filter === 'owing' ? !e.outstanding.length : e.reminders.state !== filter) return false;
    if (term && !`${e.name} ${e.employeeId} ${e.designation} ${e.department}`.toLowerCase().includes(term)) return false;
    return true;
  });
  const owingShown = shown.filter((e) => e.outstanding.length);
  const due = employees.filter((e) => ['not_reminded', 'follow_up_due'].includes(e.reminders.state));
  const chosen = owingShown.filter((e) => picked.has(e._id));
  const allPicked = owingShown.length > 0 && owingShown.every((e) => picked.has(e._id));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="edoc-remind">
      <div className="edoc-remind__bar">
        <div className="edoc-filters" role="tablist" aria-label="Which employees">
          {REMIND_FILTERS.map((f) => (
            <button key={f.value} type="button" role="tab" aria-selected={filter === f.value}
              className={`edoc-filter${filter === f.value ? ' is-on' : ''}${f.value === 'follow_up_due' && counts.follow_up_due ? ' is-alert' : ''}`}
              onClick={() => { onFilter(f.value); setPicked(new Set()); }}>
              {f.label} <em>{counts[f.value]}</em>
            </button>
          ))}
        </div>
        <div className="edoc-remind__acts">
          {chosen.length > 0 && (
            <Button size="sm" onClick={() => onRemind(chosen)}>
              <Icon name="bell" size={14} /> Remind selected ({chosen.length})
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={!due.length} onClick={() => onRemind(due)}
            title={due.length ? 'Everyone never reminded, and everyone whose reminder has gone unanswered' : 'Nobody is due a reminder'}>
            <Icon name="bell" size={14} /> Remind everyone due ({due.length})
          </Button>
        </div>
      </div>
      <p className="edoc-remind__hint">
        <Icon name="info" size={13} /> A reminder unanswered for {followUpAfterDays} days is due a follow-up. Reminders close by
        themselves once everything they asked for has been uploaded.
      </p>

      {!shown.length ? (
        <div className="verempty">
          <Icon name="checkCircle" size={26} />
          <p>{filter === 'owing' ? 'Nobody owes any documents.' : 'Nobody here.'}</p>
          <span>{filter === 'owing' ? 'Every required document is on file and none is rejected.' : 'Try another filter.'}</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table edl-table edoc-table">
            <thead>
              <tr>
                <th className="edoc-tick">
                  {owingShown.length > 0 && (
                    <input type="checkbox" aria-label="Select everyone shown" checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(owingShown.map((e) => e._id)))} />
                  )}
                </th>
                <th>Employee</th>
                <th>Still owed</th>
                <th>Last reminder</th>
                <th>Status</th>
                <th className="edl-table__acts">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const last = e.reminders.last;
                const st = e.reminders.state;
                return (
                  <React.Fragment key={e._id}>
                    <tr className={open === e._id ? 'is-open' : undefined}>
                      <td className="edoc-tick">
                        {e.outstanding.length > 0 && (
                          <input type="checkbox" aria-label={`Select ${e.name}`} checked={picked.has(e._id)} onChange={() => toggle(e._id)} />
                        )}
                      </td>
                      <td>
                        <Link to={`${base}/employees/${e._id}`} className="edoc-who">
                          <Avatar name={e.name} src={e.profileImage} size={32} />
                          <span><b>{e.name}</b><small>{[e.employeeId, e.designation].filter(Boolean).join(' · ') || 'Staff'}</small></span>
                        </Link>
                      </td>
                      <td>{e.outstanding.length ? <OwedChips items={e.outstanding} /> : <span className="edoc-muted">Nothing — all on file</span>}</td>
                      <td>
                        {last
                          ? <span className="edoc-last"><b>{fmtDate(last.sentAt)}</b><small>{last.sequence > 1 ? `Follow-up ${last.sequence - 1}` : 'First reminder'}{last.sentByName ? ` · ${last.sentByName}` : ''}</small></span>
                          : <span className="edoc-muted">Never</span>}
                      </td>
                      <td><RemindState state={st} /></td>
                      <td className="edl-table__acts">
                        <div className="edoc-acts">
                          {e.outstanding.length > 0 && (
                            <Button size="sm" variant={st === 'follow_up_due' ? 'primary' : 'secondary'} onClick={() => onRemind([e])}>
                              <Icon name="bell" size={14} /> {st === 'awaiting' || st === 'follow_up_due' ? 'Follow up' : 'Remind'}
                            </Button>
                          )}
                          {e.reminders.total > 0 && (
                            <button type="button" className="edoc-link" onClick={() => setOpen(open === e._id ? '' : e._id)}>
                              {open === e._id ? 'Hide history' : `History (${e.reminders.total})`}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open === e._id && (
                      <tr className="edoc-history-row">
                        <td colSpan={6}>
                          <ol className="edoc-history">
                            {e.reminders.history.map((h) => (
                              <li key={h._id} className={h.open ? 'is-open' : ''}>
                                <span className="edoc-history__when">{fmtDate(h.sentAt)}</span>
                                <span className="edoc-history__what">
                                  <b>{h.sequence > 1 ? `Follow-up ${h.sequence - 1}` : 'Reminder'}</b>
                                  {h.sentByName ? ` by ${h.sentByName}` : ''}{h.email ? ' · also emailed' : ''}
                                  <small>
                                    {h.documents.map((d) => `${d.label}${d.stillOwed ? '' : ' ✓'}`).join(', ')}
                                    {h.message ? ` — “${h.message}”` : ''}
                                  </small>
                                </span>
                                <span className={`edoc-pill edoc-pill--${h.open ? 'amber' : 'green'}`}>{h.open ? 'Open' : 'Answered'}</span>
                              </li>
                            ))}
                          </ol>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * What a reminder will say, before it is sent: per person, what they owe —
 * which is what the reminder asks for — plus an optional note for everyone.
 */
export function ReminderDialog({ employees, busy, onClose, onSend }) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(false);
  useEffect(() => { if (employees) { setMessage(''); setEmail(false); } }, [employees]);
  if (!employees) return null;
  const owing = employees.filter((e) => e.outstanding.length);
  const followUps = owing.filter((e) => ['awaiting', 'follow_up_due'].includes(e.reminders.state)).length;
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={600}
      title={owing.length === 1 ? `Remind ${owing[0].name}` : `Remind ${owing.length} employees`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button loading={busy} disabled={busy || !owing.length} onClick={() => onSend({ message: message.trim(), email })}>
          <Icon name="bell" size={15} /> Send {owing.length === 1 ? 'reminder' : `${owing.length} reminders`}
        </Button>
      </>}>
      <div className="edoc-rdlg">
        <p className="edoc-rdlg__lead">
          Each person is asked for exactly what they still owe.
          {followUps ? ` ${followUps === owing.length ? 'All of these are' : `${followUps} of these are`} follow-ups to a reminder that has not been answered.` : ''}
        </p>
        <ul className="edoc-rdlg__list">
          {owing.map((e) => (
            <li key={e._id}>
              <Avatar name={e.name} src={e.profileImage} size={28} />
              <div>
                <b>{e.name}</b>
                <OwedChips items={e.outstanding} />
              </div>
            </li>
          ))}
        </ul>
        <label className="form-label" htmlFor="edoc-msg">Add a note (optional)</label>
        <textarea id="edoc-msg" className="form-control" rows={2} maxLength={500} value={message}
          onChange={(ev) => setMessage(ev.target.value)} placeholder="e.g. Please upload these by Friday so payroll can be set up." />
        <label className="edoc-check">
          <input type="checkbox" checked={email} onChange={(ev) => setEmail(ev.target.checked)} />
          <span>Also send it by email <small>An in-app and phone notification is always sent.</small></span>
        </label>
      </div>
    </Modal>
  );
}
