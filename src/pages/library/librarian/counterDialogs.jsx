/**
 * The two things that happen at a library counter.
 *
 * Both are laid out the same way: on the left the physical object — which book,
 * which copy, whose loan — and on the right the decision being recorded. A
 * librarian holding a book works left to right, and the dialog follows.
 *
 * Each owns its own state and reports back through `onDone`, so the circulation
 * register does not carry a hundred lines of form state for two dialogs it only
 * opens.
 *
 * What is *not* here matters as much: there is no cover art, no "short loan"
 * type and no "minor damage" — the module has no cover images, a loan has only
 * a due date, and a copy comes back good, damaged or lost. Every control below
 * writes something the server actually stores.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getBooks, getIssueForm, issueBook, getReturnForm, returnBook, collectFine,
} from '../../../api/library.api';
import { Alert, Button, Modal, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import MemberPicker from '../../../components/library/MemberPicker';
import DropdownPanel, { isInsideDropdown } from '../../../components/ui/DropdownPanel';

// ── Shared pieces ────────────────────────────────────────────────────────────

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const fmtDay = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—');

/** Today, as the librarian's calendar has it — not as UTC has it. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const plusDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + Number(n || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const daysLate = (due) => Math.max(0, Math.ceil((Date.now() - new Date(due).getTime()) / 86400000));

const Title = ({ icon, tone = 'indigo', title, sub }) => (
  <span className="libx-title">
    <span className={`libx-title__icon tint-${tone}`}><Icon name={icon} size={20} /></span>
    <span>
      <b>{title}</b>
      <small>{sub}</small>
    </span>
  </span>
);

const Spine = ({ title }) => (
  <span className="libx-spine" aria-hidden>{String(title || '?').trim().charAt(0).toUpperCase()}</span>
);

const Fact = ({ icon, label, value }) => (
  <div className="libx-fact">
    <Icon name={icon} size={15} />
    <span>{label}</span>
    <b>{value || '—'}</b>
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
//  Issue
// ═════════════════════════════════════════════════════════════════════════════

const EMPTY = { copyId: '', userId: '', dueDate: '', notes: '' };

/**
 * `preset` is how the scanner and a book's own page get here: a book that is
 * already decided, sometimes down to the copy in the librarian's hand.
 */
export function IssueDialog({ open, preset, onClose, onDone }) {
  const [book,   setBook]   = useState(null);
  const [copies, setCopies] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [form,   setForm]   = useState(EMPTY);
  const [role,   setRole]   = useState('student');
  const [member, setMember] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingCopies, setLoadingCopies] = useState(false);

  const [query, setQuery] = useState('');
  const [hits,  setHits]  = useState([]);
  const boxRef   = useRef(null);
  const fieldRef = useRef(null);

  // Opening resets everything, then takes whatever the caller already knows.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY); setMember(null); setRole('student');
    setQuery(''); setHits([]); setCopies([]); setPolicy(null);
    setBook(preset?.book || null);
    if (preset?.book) loadCopies(preset.book._id, preset.copyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  const loadCopies = async (bookId, copyId) => {
    setLoadingCopies(true);
    try {
      const res = await getIssueForm({ bookId });
      const list = res?.data?.copies || [];
      const pol  = res?.data?.policy || null;
      setCopies(list);
      setPolicy(pol);
      setForm((f) => ({
        ...f,
        // One copy on the shelf is not a choice worth asking about.
        copyId: copyId || (list.length === 1 ? list[0]._id : ''),
        dueDate: f.dueDate || plusDays(pol?.issueDurationDays ?? 14),
      }));
    } catch (err) {
      toast.error(err?.message || 'Could not load the copies');
      setCopies([]);
    } finally { setLoadingCopies(false); }
  };

  // A request per keystroke is a request per keystroke; wait for a pause.
  useEffect(() => {
    if (book || query.trim().length < 2) { setHits([]); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const res = await getBooks({ q: query.trim(), limit: 8 });
        if (live) setHits(res?.data || []);
      } catch { if (live) setHits([]); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, book]);

  useEffect(() => {
    if (!hits.length) return undefined;
    const away = (e) => { if (!isInsideDropdown(e.target, boxRef.current)) setHits([]); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [hits.length]);

  const pick = (b) => { setBook(b); setHits([]); setQuery(''); loadCopies(b._id); };
  const clearBook = () => { setBook(null); setCopies([]); setForm((f) => ({ ...f, copyId: '' })); };

  const submit = async (e) => {
    e.preventDefault();
    if (!book) return toast.error('Find the book first');
    if (!form.copyId) return toast.error('Pick which copy is going out');
    if (!form.userId) return toast.error('Pick the member it is going to');
    setSaving(true);
    try {
      await issueBook({ ...form, bookId: book._id });
      toast.success(`“${book.title}” issued to ${member?.name || 'the member'}`);
      onDone?.();
      onClose();
    } catch (err) { toast.error(err?.message || 'Could not issue the book'); }
    finally { setSaving(false); }
  };

  const free = copies.length;
  const loan = policy?.issueDurationDays;

  return (
    <Modal open={open} onClose={onClose} maxWidth={900}
      title={<Title icon="bookOpen" title="Issue Book" sub="Issue a book to a member from the library collection" />}
      footer={(
        <>
          <span className="libx-foot__note">
            <Icon name="bell" size={14} /> The member is notified of the due date.
          </span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button form="issue-form" type="submit" loading={saving}>
            <Icon name="bookOpen" size={15} /> Issue Book
          </Button>
        </>
      )}>
      <form id="issue-form" onSubmit={submit} className="libx-grid">
        {/* ── The book ─────────────────────────────────────────────────── */}
        <section className="libx-pane">
          <h4>Selected book</h4>

          {!book ? (
            <div ref={boxRef}>
              <div ref={fieldRef}>
                <input className="form-control" autoFocus placeholder="Search by title or ISBN…"
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (hits.length) pick(hits[0]);
                  }} />
              </div>
              <p className="libx-hint">Or scan a copy’s spine label from the counter.</p>
              <DropdownPanel anchorRef={fieldRef} open={hits.length > 0 && !book}>
                {hits.map((b) => (
                  <button key={b._id} type="button" className="libx-hit" onClick={() => pick(b)}>
                    <Spine title={b.title} />
                    <span>
                      <b>{b.title}</b>
                      <small>{(b.authors || []).join(', ') || 'Author not recorded'}</small>
                    </span>
                    <em className={(b.availableCopies ?? 0) > 0 ? 'is-ok' : 'is-bad'}>
                      {b.availableCopies ?? 0} free
                    </em>
                  </button>
                ))}
              </DropdownPanel>
            </div>
          ) : (
            <>
              <div className="libx-book">
                <Spine title={book.title} />
                <div>
                  <b>{book.title}</b>
                  <small>{(book.authors || []).join(', ') || 'Author not recorded'}</small>
                  <div className="libx-chips">
                    {book.category ? <span>{book.category}</span> : null}
                    {book.language ? <span>{book.language}</span> : null}
                    {book.edition ? <span>{book.edition}</span> : null}
                  </div>
                </div>
                <button type="button" className="libx-x" onClick={clearBook} aria-label="Choose another book">
                  <Icon name="close" size={15} />
                </button>
              </div>

              <div className="libx-facts">
                <Fact icon="idCard" label="ISBN" value={book.isbn} />
                <Fact icon="building" label="Publisher" value={book.publisher} />
                <Fact icon="folder" label="Category" value={book.category} />
              </div>

              <div className={`libx-stock is-${free > 0 ? 'ok' : 'bad'}`}>
                <span className="libx-stock__icon"><Icon name="layers" size={18} /></span>
                <span>
                  <small>On the shelf right now</small>
                  <b>{free} of {book.totalCopies ?? 0}</b>
                </span>
                <em>{free > 0 ? 'In stock' : 'None free'}</em>
              </div>

              <div className="form-group">
                <label className="form-label required">Copy going out</label>
                {loadingCopies ? (
                  <div className="libx-loading"><Spinner /></div>
                ) : free === 0 ? (
                  <Alert variant="warning">No copy of this book is on the shelf right now.</Alert>
                ) : (
                  <select className="form-control" required value={form.copyId}
                    onChange={(e) => setForm((f) => ({ ...f, copyId: e.target.value }))}>
                    <option value="">Pick an available copy…</option>
                    {copies.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.uniqueCode}{c.rackLocation ? ` · ${c.rackLocation}` : ''}{c.condition ? ` · ${c.condition}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}
        </section>

        {/* ── Who it goes to, and on what terms ────────────────────────── */}
        <section className="libx-pane">
          <h4>Member</h4>
          {/* Students and teachers borrow; nobody else does, so there is no
              third tab. The tab drives the search, so a class-list name cannot
              be picked by accident when a teacher was meant. */}
          <div className="libx-seg" role="group" aria-label="Kind of member">
            {[['student', 'Students'], ['teacher', 'Teachers']].map(([k, label]) => (
              <button key={k} type="button" aria-pressed={role === k}
                className={role === k ? 'is-on' : ''}
                onClick={() => { setRole(k); setMember(null); setForm((f) => ({ ...f, userId: '' })); }}>
                {label}
              </button>
            ))}
          </div>

          <MemberPicker
            key={role}
            role={role}
            value={form.userId}
            label="Who is borrowing"
            placeholder={role === 'student' ? 'Search by name or admission number…' : 'Search by name or employee id…'}
            onChange={(uid, m) => { setForm((f) => ({ ...f, userId: uid })); setMember(m || null); }} />

          {/* What would stop this loan, said before the button is pressed. */}
          {member && (member.overdue > 0 || member.finesDue > 0) && (
            <Alert variant="warning">
              {member.name} has
              {member.overdue > 0 ? ` ${member.overdue} overdue book${member.overdue === 1 ? '' : 's'}` : ''}
              {member.overdue > 0 && member.finesDue > 0 ? ' and' : ''}
              {member.finesDue > 0 ? ` ${money(member.finesDue)} in unpaid fines` : ''}.
              {' '}The policy may refuse this loan.
            </Alert>
          )}

          <h4 className="libx-pane__second">Loan details</h4>
          <div className="form-group">
            <label className="form-label required">Due date</label>
            <input type="date" className="form-control" required min={today()}
              value={form.dueDate || plusDays(loan ?? 14)}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            <div className="form-hint">
              {loan ? `The policy loan period is ${loan} day${loan === 1 ? '' : 's'}.` : 'Set by the library policy.'}
              {' '}Change it for a shorter or longer loan.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows={3} value={form.notes} maxLength={500}
              placeholder="Anything the desk should remember about this loan…"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </section>
      </form>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Return
// ═════════════════════════════════════════════════════════════════════════════

const CONDITIONS = [
  { key: 'good',    label: 'Good',    icon: 'checkCircle', tone: 'ok',   hint: 'Normal wear — back on the shelf' },
  { key: 'damaged', label: 'Damaged', icon: 'alert',       tone: 'warn', hint: 'Off the shelf, and charged for' },
  { key: 'lost',    label: 'Lost',    icon: 'close',       tone: 'bad',  hint: 'Never came back' },
];

/**
 * A book arrives at the desk two ways: with the person who borrowed it, or on
 * its own. So the search takes either, and what it finds is a *loan* — the one
 * record a return closes.
 */
export function ReturnDialog({ open, preset, onClose, onDone, base }) {
  const [by,      setBy]      = useState('member');   // 'member' | 'copy'
  const [member,  setMember]  = useState(null);
  const [code,    setCode]    = useState('');
  const [list,    setList]    = useState([]);
  const [policy,  setPolicy]  = useState(null);
  const [loan,    setLoan]    = useState(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const [condition, setCondition] = useState('good');
  const [price,     setPrice]     = useState('');
  const [notes,     setNotes]     = useState('');
  const [collect,   setCollect]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (!open) return;
    setMember(null); setList([]); setLoan(null); setSearched(false);
    setCondition('good'); setPrice(''); setNotes(''); setCollect(true);
    // A row in the register can send its own copy here. The code still goes
    // through the search rather than the row being trusted: between the page
    // loading and this dialog opening somebody else may have taken the return.
    setBy(preset?.copyCode ? 'copy' : 'member');
    setCode(preset?.copyCode || '');
    if (preset?.copyCode) load({ copyCode: preset.copyCode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  const load = async (params) => {
    setLoading(true);
    try {
      const res = await getReturnForm(params);
      const found = res?.data?.issuances || [];
      setList(found);
      setPolicy(res?.data?.policy || null);
      setSearched(true);
      // One book out is not a list to choose from.
      if (found.length === 1) setLoan(found[0]);
    } catch (err) { toast.error(err?.message || 'Could not find the loan'); }
    finally { setLoading(false); }
  };

  const pickMember = (id, m) => {
    setMember(m); setList([]); setLoan(null); setSearched(false);
    if (id) load({ userId: id });
  };

  const findByCode = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoan(null); setList([]); setSearched(false);
    load({ copyCode: code.trim() });
  };

  // ── What this return will cost ───────────────────────────────────────────
  //
  //  The same arithmetic the server does on save (services/libraryRules —
  //  calcFine + the condition penalty), so the figure on screen is the figure
  //  that gets charged rather than a guess at it. The teacher exemption covers
  //  lateness only: a lost or damaged book is compensation for school property
  //  and is charged to everyone.
  const fine = useMemo(() => {
    if (!loan || !policy) return null;
    const rate  = policy.finePerDay || 0;
    const late  = Math.max(0, daysLate(loan.dueDate) - (policy.gracePeriodDays || 0));
    const lateApplies = policy.teacherFinesEnabled || loan.issuedToRole !== 'teacher';
    const lateFine = lateApplies ? late * rate : 0;

    const days = condition === 'lost' ? (policy.lostBookFineDays ?? 30)
      : condition === 'damaged' ? (policy.damagedBookFineDays ?? 10)
        : 0;
    const typed = price !== '' && Number.isFinite(Number(price)) ? Number(price) : null;
    const penalty = condition === 'good' ? 0 : (typed ?? days * rate);

    return {
      late: lateFine, penalty, total: lateFine + penalty,
      lateDays: late, exempt: !lateApplies && daysLate(loan.dueDate) > 0,
    };
  }, [loan, policy, condition, price]);

  const submit = async (e) => {
    e.preventDefault();
    if (!loan) return toast.error('Find the loan being closed first');
    if (condition !== 'good' && price !== '' && Number(price) < 0)
      return toast.error('Enter a charge of zero or more');

    setSaving(true);
    try {
      const res = await returnBook({
        issuanceId: loan._id,
        condition,
        notes: notes.trim() || undefined,
        ...(condition !== 'good' && price !== '' ? { fineAmount: Number(price) } : {}),
      });
      const raised = res?.data?.fine;

      if (raised && collect) {
        // Settling it here is the same call the fines register makes, receipt
        // and all — the return itself is already recorded, so a refusal here
        // leaves the fine standing rather than undoing anything.
        try {
          const paid = await collectFine(raised._id);
          toast.success(`Returned — ${money(raised.amount)} collected, receipt ${paid?.data?.receiptNumber || 'issued'}`);
        } catch (err) {
          toast.error(`Returned, but the fine could not be collected: ${err?.message || 'try the fines register'}`, { duration: 7000 });
        }
      } else if (raised) {
        toast.success(`Returned — ${money(raised.amount)} fine raised, unpaid`);
      } else {
        toast.success('Book returned');
      }

      onDone?.();
      onClose();
    } catch (err) { toast.error(err?.message || 'Could not record the return'); }
    finally { setSaving(false); }
  };

  const late = loan ? daysLate(loan.dueDate) : 0;

  return (
    <Modal open={open} onClose={onClose} maxWidth={900}
      title={<Title icon="repeat" tone="green" title="Return Book" sub="Find the loan, say how the book came back, and close it" />}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button form="return-form" type="submit" loading={saving} disabled={!loan}>
            <Icon name="checkCircle" size={15} /> Return Book
          </Button>
        </>
      )}>
      <form id="return-form" onSubmit={submit} className="libx-grid">
        {/* ── Which loan ───────────────────────────────────────────────── */}
        <section className="libx-pane">
          <h4>The loan</h4>

          {!loan && (
            <>
              <div className="libx-seg" role="group" aria-label="How the book arrived">
                {[['member', 'With the member'], ['copy', 'On its own']].map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={by === k}
                    className={by === k ? 'is-on' : ''}
                    onClick={() => { setBy(k); setList([]); setSearched(false); }}>
                    {label}
                  </button>
                ))}
              </div>

              {by === 'member' ? (
                <MemberPicker value={member?._id || ''} label="Who is returning it"
                  onChange={pickMember} />
              ) : (
                <div className="form-group">
                  <label className="form-label">Copy code</label>
                  <div className="libx-find">
                    <input className="form-control" autoFocus value={code}
                      placeholder="Scan the spine label, or type LIB-COPY-000042"
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') findByCode(e); }} />
                    <Button type="button" onClick={findByCode} loading={loading}>Find</Button>
                  </div>
                  <div className="form-hint">A scanner types the code and submits on its own.</div>
                </div>
              )}

              {loading && <div className="libx-loading"><Spinner /></div>}

              {!loading && list.length > 1 && (
                <>
                  <p className="libx-hint">{list.length} books out — which one came back?</p>
                  <ul className="libx-loans">
                    {list.map((i) => (
                      <li key={i._id}>
                        <button type="button" onClick={() => setLoan(i)}>
                          <Spine title={i.book?.title} />
                          <span>
                            <b>{i.book?.title || 'Untitled'}</b>
                            <small>{i.bookCopy?.uniqueCode} · due {fmtDay(i.dueDate)}</small>
                          </span>
                          {daysLate(i.dueDate) > 0
                            ? <em className="is-bad">{daysLate(i.dueDate)}d late</em>
                            : <Icon name="chevronRight" size={14} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {!loading && searched && list.length === 0 && (
                <Alert variant="info">
                  {by === 'copy'
                    ? `Copy ${code} is not out on loan — nothing to return.`
                    : `${member?.name || 'This member'} has no books out.`}
                </Alert>
              )}
            </>
          )}

          {loan && (
            <>
              <div className="libx-book">
                <Spine title={loan.book?.title} />
                <div>
                  <b>{loan.book?.title || 'Untitled'}</b>
                  <small>{loan.bookCopy?.uniqueCode}</small>
                </div>
                <button type="button" className="libx-x" onClick={() => setLoan(null)} aria-label="Choose another loan">
                  <Icon name="close" size={15} />
                </button>
              </div>

              <div className="libx-facts">
                <Fact icon="idCard" label="ISBN" value={loan.book?.isbn} />
                <Fact icon="user" label="Borrower" value={loan.issuedTo?.name} />
                <Fact icon="calendar" label="Issued" value={fmtDay(loan.issueDate)} />
                <Fact icon="clock" label="Due" value={fmtDay(loan.dueDate)} />
              </div>

              <div className={`libx-when is-${late > 0 ? 'bad' : 'ok'}`}>
                <Icon name={late > 0 ? 'alert' : 'checkCircle'} size={16} />
                {late > 0
                  ? `${late} day${late === 1 ? '' : 's'} overdue`
                  : 'Back on time'}
                <span>Recorded today, {fmtDay(new Date())}</span>
              </div>
            </>
          )}
        </section>

        {/* ── How it came back ─────────────────────────────────────────── */}
        <section className="libx-pane">
          <h4>How it came back</h4>
          {/* Three states, because three is what a copy can be in. "Minor
              damage" would be a fourth chip with no state behind it. */}
          <div className="libx-conds">
            {CONDITIONS.map((c) => (
              <button key={c.key} type="button" disabled={!loan}
                className={`libx-cond is-${c.tone}${condition === c.key ? ' is-on' : ''}`}
                aria-pressed={condition === c.key}
                onClick={() => { setCondition(c.key); setPrice(''); }}>
                <span className="libx-cond__icon"><Icon name={c.icon} size={17} /></span>
                <b>{c.label}</b>
                <small>{c.hint}</small>
              </button>
            ))}
          </div>

          {condition !== 'good' && (
            <div className="form-group">
              <label className="form-label">What the book was worth (₹)</label>
              <input type="number" className="form-control" min={0} step="0.01" value={price}
                placeholder={policy ? `Policy rate — ${money((condition === 'lost'
                  ? (policy.lostBookFineDays ?? 30)
                  : (policy.damagedBookFineDays ?? 10)) * (policy.finePerDay || 0))}` : 'Policy rate'}
                onChange={(e) => setPrice(e.target.value)} />
              <div className="form-hint">
                Leave it blank to charge the policy rate. Any late fine is added on top.
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows={3} maxLength={500} value={notes}
              placeholder="Anything about the state it came back in…"
              onChange={(e) => setNotes(e.target.value)} />
            <div className="form-hint libx-count">{notes.length}/500</div>
          </div>

          {/* What this will cost, worked out the way the server works it out. */}
          {fine && (fine.total > 0 || fine.exempt) && (
            <div className="libx-fine">
              <div className="libx-fine__head">
                <span className="libx-fine__icon"><Icon name="banknote" size={17} /></span>
                <span>
                  <small>{fine.exempt && fine.total === 0 ? 'No fine' : 'Fine on this return'}</small>
                  <b>{money(fine.total)}</b>
                </span>
                {base ? (
                  <Link to={`${base}/fines?q=${encodeURIComponent(loan?.issuedTo?.name || '')}`}
                    className="libx-fine__link">
                    Fine register <Icon name="chevronRight" size={13} />
                  </Link>
                ) : null}
              </div>
              <ul className="libx-fine__lines">
                {fine.exempt ? (
                  <li><span>Late by {daysLate(loan.dueDate)} days</span><b>Teachers are exempt</b></li>
                ) : fine.late > 0 ? (
                  <li><span>{fine.lateDays} day{fine.lateDays === 1 ? '' : 's'} past the grace period</span><b>{money(fine.late)}</b></li>
                ) : null}
                {fine.penalty > 0 ? (
                  <li><span>{condition === 'lost' ? 'Lost book' : 'Damage'}{price === '' ? ' (policy rate)' : ''}</span><b>{money(fine.penalty)}</b></li>
                ) : null}
              </ul>
              {fine.total > 0 && (
                <label className="libx-collect">
                  <input type="checkbox" checked={collect} onChange={(e) => setCollect(e.target.checked)} />
                  <span>
                    <b>Collect it now</b>
                    <small>Writes a receipt at the counter. Unticked, it stays unpaid in the fine register.</small>
                  </span>
                </label>
              )}
            </div>
          )}
        </section>
      </form>
    </Modal>
  );
}
