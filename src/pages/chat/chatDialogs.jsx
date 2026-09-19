import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../../components/ui/icons';
import * as chatApi from '../../api/chat.api';
import { Avatar, chatAvatarKind } from './chatParts';
import { chatName, isGroup, lastSeen, personLine, ROLE_LABEL } from './chatFormat';

// ─── Dialog frame ─────────────────────────────────────────────────────────────

export function Dialog({ open, onClose, title, subtitle, children, footer, wide }) {
  const card = useRef(null);
  // The chat page re-renders on every socket event; keyed on `open` alone so
  // that never re-runs this and pulls focus back to the first field mid-typing.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    requestAnimationFrame(() => card.current?.querySelector('input, textarea, button:not([data-close])')?.focus());
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="ch-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className={`ch-dialog${wide ? ' ch-dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="ch-dialog__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" data-close className="ch-iconbtn" style={{ width: 34, height: 34 }} onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="ch-dialog__body">{children}</div>
        {footer && <div className="ch-dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

const ROLE_FILTERS = {
  school_admin: [['', 'Everyone'], ['teacher', 'Teachers'], ['student', 'Students'], ['parent', 'Parents'], ['school_admin', 'Admins']],
  teacher:      [['', 'Everyone'], ['teacher', 'Teachers'], ['student', 'Students'], ['parent', 'Parents'], ['school_admin', 'Admins']],
  student:      [['', 'Everyone'], ['teacher', 'Teachers'], ['school_admin', 'Admins']],
  parent:       [['', 'Everyone'], ['teacher', 'Teachers'], ['school_admin', 'Admins']],
};

/** Contacts the caller may reach, searched on the server (debounced). */
function useContacts(open, q, role) {
  const [state, setState] = useState({ rows: [], loading: false });
  useEffect(() => {
    if (!open) return undefined;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const res = await chatApi.getContacts({ q: q.trim() || undefined, role: role || undefined, limit: 80 });
        setState({ rows: Array.isArray(res?.data) ? res.data : [], loading: false });
      } catch (err) {
        setState({ rows: [], loading: false, error: err?.message });
      }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, q, role]);
  return state;
}

const STAFF_FILTERS = [['', 'Everyone'], ['teacher', 'Teachers'], ['school_admin', 'Admins']];
const isStaff = (c) => c.role === 'teacher' || c.role === 'school_admin';

function ContactSearch({ q, setQ, role, setRole, myRole, staffOnly, placeholder = 'Search by name...' }) {
  const filters = staffOnly ? STAFF_FILTERS : (ROLE_FILTERS[myRole] || ROLE_FILTERS.student);
  return (
    <>
      <label className="ch-search" style={{ height: 44 }}>
        <Icon name="search" size={18} />
        <span className="ch-sr">Search people</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      </label>
      <div className="ch-rolechips" role="group" aria-label="Filter by role">
        {filters.map(([k, label]) => (
          <button key={k || 'all'} type="button" className={role === k ? 'is-on' : ''} onClick={() => setRole(k)}>{label}</button>
        ))}
      </div>
    </>
  );
}

function PickRow({ c, on, check, onClick }) {
  return (
    <button type="button" className={`ch-pick${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={check ? on : undefined}>
      {check && <span className="ch-pick__check">{on && <Icon name="check" size={14} strokeWidth={2.4} />}</span>}
      <Avatar name={c.name} size={38} image={c.profileImage} />
      <span className="ch-pick__body">
        <span className="ch-pick__name" style={{ display: 'block' }}>{c.name}</span>
        {c.line && <span className="ch-pick__line" style={{ display: 'block' }}>{c.line}</span>}
      </span>
      <span className="ch-pick__role">{ROLE_LABEL[c.role] || c.role}</span>
    </button>
  );
}

export function NewChatDialog({ open, onClose, myRole, onPick }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const { rows, loading, error } = useContacts(open, q, role);
  useEffect(() => { if (open) { setQ(''); setRole(''); } }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title="New Chat" subtitle="Start a conversation with someone you are allowed to message.">
      <ContactSearch q={q} setQ={setQ} role={role} setRole={setRole} myRole={myRole} />
      <div className="ch-picker" style={{ maxHeight: 380 }}>
        {loading && !rows.length ? (
          <div className="ch-empty-list">Loading people…</div>
        ) : error ? (
          <div className="ch-empty-list">{error}</div>
        ) : !rows.length ? (
          <div className="ch-empty-list"><strong>Nobody found</strong>{q ? `No one matches “${q}”.` : 'There is nobody you can message yet.'}</div>
        ) : rows.map((c) => <PickRow key={c._id} c={c} onClick={() => onPick(c)} />)}
      </div>
      {rows.length >= 80 && <p className="ch-note">Showing the first 80 — search to narrow it down.</p>}
    </Dialog>
  );
}

function MemberPicker({ open, myRole, picked, setPicked, exclude = [], staffOnly = false }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const { rows, loading } = useContacts(open, q, role);
  const excluded = useMemo(() => new Set(exclude.map(String)), [exclude]);
  const list = rows.filter((c) => !excluded.has(String(c._id)) && (!staffOnly || isStaff(c)));
  const toggle = (c) => setPicked((p) => (p.some((x) => x._id === c._id) ? p.filter((x) => x._id !== c._id) : [...p, c]));

  return (
    <>
      <ContactSearch q={q} setQ={setQ} role={role} setRole={setRole} myRole={myRole} staffOnly={staffOnly} placeholder="Search people to add..." />
      {picked.length > 0 && (
        <div className="ch-picked">
          {picked.map((c) => (
            <span key={c._id}>{c.name}
              <button type="button" onClick={() => toggle(c)} aria-label={`Remove ${c.name}`}><Icon name="close" size={13} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="ch-picker">
        {loading && !list.length ? <div className="ch-empty-list">Loading people…</div>
          : !list.length ? <div className="ch-empty-list">{q ? `No one matches “${q}”.` : 'Nobody else to add.'}</div>
            : list.map((c) => <PickRow key={c._id} c={c} check on={picked.some((x) => x._id === c._id)} onClick={() => toggle(c)} />)}
      </div>
    </>
  );
}

/**
 * Create Group. A school admin gets the open form (anyone in the school).
 * A teacher first says what the group is for: the class they run, a subject
 * they teach, or a staff group — students only ever join through the first two,
 * whose membership follows the school's records.
 */
export function CreateGroupDialog({ open, onClose, myRole, onCreated, onOpenExisting }) {
  const teacher = myRole === 'teacher';
  const [step, setStep] = useState(null);
  useEffect(() => { if (open) setStep(teacher ? { kind: 'choose' } : { kind: 'staff' }); }, [open, teacher]);
  if (!open || !step) return null;

  const back = teacher ? () => setStep({ kind: 'choose' }) : null;
  if (step.kind === 'choose') {
    return <GroupKindChooser open onClose={onClose} onChoose={setStep} onOpenExisting={onOpenExisting} />;
  }
  if (step.kind === 'class' || step.kind === 'subject') {
    return <ClassGroupForm open pick={step} onClose={onClose} onBack={back} onCreated={onCreated} onOpenExisting={onOpenExisting} />;
  }
  return <StaffGroupForm open onClose={onClose} onBack={back} myRole={myRole} staffOnly={teacher} onCreated={onCreated} />;
}

function ChoiceRow({ glyph, icon, title, sub, existing, onClick }) {
  const blocked = existing && !existing.isMember;
  return (
    <button type="button" className={`ch-choice${blocked ? ' is-blocked' : ''}`} onClick={blocked ? undefined : onClick} disabled={blocked}>
      <span className={`ch-choice__icon${glyph ? ' is-class' : ''}`}><Icon name={icon} size={22} /></span>
      <span className="ch-choice__body">
        <span className="ch-choice__title">{title}</span>
        <span className="ch-choice__sub">{sub}</span>
      </span>
      {existing
        ? <span className={`ch-choice__tag${existing.isMember ? ' is-open' : ''}`}>{existing.isMember ? 'Open' : 'Already created'}</span>
        : <Icon name="chevronRight" size={18} className="ch-choice__chev" />}
    </button>
  );
}

function GroupKindChooser({ open, onClose, onChoose, onOpenExisting }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    if (!open) return;
    setState({ loading: true, data: null, error: '' });
    chatApi.getClassGroupOptions()
      .then((res) => setState({ loading: false, data: res?.data || { classGroups: [], subjectGroups: [] }, error: '' }))
      .catch((e) => setState({ loading: false, data: { classGroups: [], subjectGroups: [] }, error: e?.message || '' }));
  }, [open]);

  const classGroups = state.data?.classGroups || [];
  const subjectGroups = state.data?.subjectGroups || [];
  const go = (g, kind) => (g.existing ? onOpenExisting(g.existing.chatId) : onChoose({ kind, sectionId: g.sectionId, subjectId: g.subjectId || null }));

  return (
    <Dialog open={open} onClose={onClose} title="Create Group" subtitle="Who is this group for?">
      {state.loading ? <div className="ch-empty-list">Loading your classes…</div> : (
        <>
          {classGroups.length > 0 && <div className="ch-choose__label">Class group</div>}
          {classGroups.map((g) => (
            <ChoiceRow key={g.sectionId} glyph icon="users" existing={g.existing}
              title={`Class ${g.label}`}
              sub={g.existing && !g.existing.isMember ? `“${g.existing.name}” already exists`
                : `${g.as === 'class' ? 'You are the class teacher' : 'You are the vice class teacher'} · ${g.students} student${g.students === 1 ? '' : 's'}`}
              onClick={() => go(g, 'class')} />
          ))}
          {subjectGroups.length > 0 && <div className="ch-choose__label">Subject group</div>}
          {subjectGroups.map((g) => (
            <ChoiceRow key={`${g.sectionId}-${g.subjectId}`} glyph icon="bookOpen" existing={g.existing}
              title={`Class ${g.label} · ${g.subjectName}`}
              sub={g.existing && !g.existing.isMember ? `Already created by another ${g.subjectName} teacher — ask them to add you`
                : `${g.students} student${g.students === 1 ? '' : 's'} · ${g.subjectName} teachers of Class ${g.label}`}
              onClick={() => go(g, 'subject')} />
          ))}
          <div className="ch-choose__label">Other</div>
          <ChoiceRow icon="briefcase" title="Staff group" sub="Teachers and admins only — no students" onClick={() => onChoose({ kind: 'staff' })} />
          {!classGroups.length && !subjectGroups.length && (
            <p className="ch-note">Class and subject groups appear here for the classes you run or teach this year.</p>
          )}
          {state.error && <p className="ch-field__err" style={{ marginTop: 8 }}>{state.error}</p>}
        </>
      )}
    </Dialog>
  );
}

/** A class or subject group: students fixed, teachers limited to who the rules allow. */
function ClassGroupForm({ open, pick, onClose, onBack, onCreated, onOpenExisting }) {
  const [roster, setRoster] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [form, setForm] = useState({ name: '', description: '', readOnly: false });
  const [chosen, setChosen] = useState(new Set());
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setRoster(null); setLoadErr(''); setErr(''); setShowAll(false);
    chatApi.getClassGroupRoster({ kind: pick.kind, sectionId: pick.sectionId, subjectId: pick.subjectId || undefined })
      .then((res) => {
        const r = res?.data;
        setRoster(r);
        setForm({ name: r?.defaultName || '', description: '', readOnly: false });
        setChosen(new Set((r?.teachers || []).map((t) => t._id)));
      })
      .catch((e) => setLoadErr(e?.message || 'Could not load the class'));
  }, [open, pick.kind, pick.sectionId, pick.subjectId]);

  const toggle = (t) => {
    if (t.locked) return;
    setChosen((cur) => { const n = new Set(cur); if (n.has(t._id)) n.delete(t._id); else n.add(t._id); return n; });
  };

  const submit = async () => {
    if (!form.name.trim()) { setErr('Give the group a name'); return; }
    setSaving(true); setErr('');
    try {
      const res = await chatApi.createClassGroup({
        kind: pick.kind, sectionId: pick.sectionId, subjectId: pick.subjectId || undefined,
        name: form.name.trim(), description: form.description.trim(), isReadOnly: form.readOnly,
        teacherIds: (roster?.teachers || []).filter((t) => !t.locked && chosen.has(t._id)).map((t) => t._id),
      });
      toast.success(`${form.name.trim()} created`);
      onCreated(res?.data);
    } catch (e) {
      if (e?.data?.chatId) { toast(e.message); onOpenExisting(e.data.chatId); return; }
      setErr(e?.message || 'Could not create the group');
    } finally { setSaving(false); }
  };

  const students = roster?.students || [];
  const teachers = roster?.teachers || [];
  const people = students.length + teachers.filter((t) => chosen.has(t._id)).length;
  const visible = showAll ? students : students.slice(0, 18);
  const isSubject = pick.kind === 'subject';

  return (
    <Dialog open={open} onClose={onClose} wide
      title={isSubject ? 'Subject group' : 'Class group'}
      subtitle={roster ? (isSubject ? `${roster.subjectName} · ${roster.label}` : roster.label) : ' '}
      footer={<>
        <button type="button" className="ch-btn ch-btn--ghost" onClick={onBack || onClose}>{onBack ? 'Back' : 'Cancel'}</button>
        <button type="button" className="ch-btn ch-btn--primary" onClick={submit} disabled={saving || !roster || !!roster?.existing}>
          {saving ? 'Creating…' : `Create · ${people} people`}
        </button>
      </>}>
      {loadErr ? <div className="ch-empty-list">{loadErr}</div> : !roster ? <div className="ch-empty-list">Loading the class…</div> : (
        <>
          {roster.existing && (
            <div className="ch-callout">
              <Icon name="info" size={18} />
              <span>{roster.label} already has {isSubject ? `a ${roster.subjectName} group` : 'a class group'}: “{roster.existing.name}”.</span>
              <button type="button" onClick={() => onOpenExisting(roster.existing.chatId)}>Open it</button>
            </div>
          )}
          <label className="ch-field">
            <span>Group name</span>
            {/* The roster arrives after the dialog opened; take focus when it does. */}
            <input value={form.name} maxLength={80} autoFocus onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErr(''); }} />
          </label>
          <label className="ch-field">
            <span>Description <em>(optional)</em></span>
            <textarea rows={2} maxLength={300} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={isSubject ? `Homework, notes and doubts for ${roster.subjectName}` : 'Announcements and discussion for the class'} />
          </label>
          <div className="ch-field">
            <span>Who can post</span>
            <div className="ch-seg">
              <button type="button" className={!form.readOnly ? 'is-on' : ''} onClick={() => setForm((f) => ({ ...f, readOnly: false }))}>
                <span><Icon name="chat" size={20} /></span>
                <span><b>Everyone</b><small>Students and teachers can write</small></span>
              </button>
              <button type="button" className={form.readOnly ? 'is-on' : ''} onClick={() => setForm((f) => ({ ...f, readOnly: true }))}>
                <span><Icon name="megaphone" size={20} /></span>
                <span><b>Teachers only</b><small>Students can read</small></span>
              </button>
            </div>
          </div>

          <div className="ch-roster">
            <div className="ch-roster__head">
              <Icon name="lock" size={16} />
              <b>Students · {students.length}</b>
            </div>
            <p className="ch-roster__note">
              {students.length
                ? `Every student of ${roster.label} is in this group, and stays in it as the class changes. Students can’t be removed.`
                : `${roster.label} has no students placed yet — they will join as they are added to the class.`}
            </p>
            {students.length > 0 && (
              <div className="ch-picked ch-picked--plain">
                {visible.map((st) => <span key={st._id}>{st.rollNumber ? `${st.rollNumber}. ` : ''}{st.name}</span>)}
                {students.length > visible.length && (
                  <button type="button" className="ch-roster__more" onClick={() => setShowAll(true)}>+{students.length - visible.length} more</button>
                )}
              </div>
            )}
          </div>

          <div className="ch-field" style={{ marginTop: 16, marginBottom: 0 }}>
            <span>Teachers <em>· {teachers.filter((t) => chosen.has(t._id)).length} in the group</em></span>
            <p className="ch-note" style={{ marginTop: 0 }}>
              {isSubject
                ? `Only teachers who teach ${roster.subjectName} in ${roster.label} can be in this group.`
                : `The class teacher and vice class teacher are always in it. Subject teachers of ${roster.label} can be added.`}
            </p>
            <div className="ch-picker">
              {teachers.map((t) => (
                <button key={t._id} type="button" className={`ch-pick${chosen.has(t._id) ? ' is-on' : ''}${t.locked ? ' is-locked' : ''}`}
                  onClick={() => toggle(t)} aria-pressed={chosen.has(t._id)} disabled={t.locked}>
                  <span className="ch-pick__check">{chosen.has(t._id) && <Icon name="check" size={14} strokeWidth={2.4} />}</span>
                  <Avatar name={t.name} size={38} />
                  <span className="ch-pick__body">
                    <span className="ch-pick__name" style={{ display: 'block' }}>{t.name}{t.you ? ' (you)' : ''}</span>
                    <span className="ch-pick__line" style={{ display: 'block' }}>{t.tag || 'Teacher'}</span>
                  </span>
                  {t.locked ? <span className="ch-pick__role">{t.admin ? 'Manages group' : 'Always in'}</span>
                    : t.admin ? <span className="ch-pick__role">Manages group</span> : null}
                </button>
              ))}
            </div>
          </div>
          {err && <p className="ch-field__err" style={{ marginTop: 10 }}>{err}</p>}
        </>
      )}
    </Dialog>
  );
}

function StaffGroupForm({ open, onClose, onBack, myRole, staffOnly, onCreated }) {
  const [form, setForm] = useState({ name: '', description: '', kind: 'group' });
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setForm({ name: '', description: '', kind: 'group' }); setPicked([]); setErr(''); } }, [open]);

  const submit = async () => {
    if (!form.name.trim()) { setErr('Give the group a name'); return; }
    if (!picked.length) { setErr('Add at least one member'); return; }
    setSaving(true);
    try {
      const res = await chatApi.createGroup({
        name: form.name.trim(), description: form.description.trim(),
        type: form.kind === 'broadcast' ? 'broadcast' : 'group',
        isReadOnly: form.kind === 'broadcast',
        memberIds: picked.map((c) => c._id),
      });
      toast.success(`${form.kind === 'broadcast' ? 'Announcement channel' : 'Group'} created`);
      onCreated(res?.data);
    } catch (e) {
      setErr(e?.message || 'Could not create the group');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} wide title={staffOnly ? 'Staff group' : 'Create Group'}
      subtitle={staffOnly ? 'Teachers and admins. Students join through a class or subject group.' : 'Everyone you add can see the whole conversation.'}
      footer={<>
        <button type="button" className="ch-btn ch-btn--ghost" onClick={onBack || onClose}>{onBack ? 'Back' : 'Cancel'}</button>
        <button type="button" className="ch-btn ch-btn--primary" onClick={submit} disabled={saving}>
          {saving ? 'Creating…' : `Create${picked.length ? ` · ${picked.length + 1} people` : ''}`}
        </button>
      </>}>
      <label className="ch-field">
        <span>Group name</span>
        <input value={form.name} maxLength={80} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErr(''); }}
          placeholder="e.g. Grade 10 Teachers" />
      </label>
      <label className="ch-field">
        <span>Description <em>(optional)</em></span>
        <textarea rows={2} maxLength={300} value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this group for?" />
      </label>
      <div className="ch-field">
        <span>Type</span>
        <div className="ch-seg">
          <button type="button" className={form.kind === 'group' ? 'is-on' : ''} onClick={() => setForm((f) => ({ ...f, kind: 'group' }))}>
            <span><Icon name="chat" size={20} /></span>
            <span><b>Group chat</b><small>Everyone can send messages</small></span>
          </button>
          <button type="button" className={form.kind === 'broadcast' ? 'is-on' : ''} onClick={() => setForm((f) => ({ ...f, kind: 'broadcast' }))}>
            <span><Icon name="megaphone" size={20} /></span>
            <span><b>Announcements</b><small>Only admins &amp; teachers post</small></span>
          </button>
        </div>
      </div>
      <div className="ch-field" style={{ marginBottom: 0 }}>
        <span>Members <em>· {picked.length} selected</em></span>
        <MemberPicker open={open} myRole={myRole} staffOnly={staffOnly} picked={picked} setPicked={(f) => { setPicked(f); setErr(''); }} />
      </div>
      {err && <p className="ch-field__err" style={{ marginTop: 10 }}>{err}</p>}
    </Dialog>
  );
}

export function AddMembersDialog({ open, onClose, myRole, chat, existing, onAdded, classGroup = false, staffOnly = false }) {
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [cands, setCands] = useState({ rows: [], loading: false });
  const [q, setQ] = useState('');
  useEffect(() => { if (open) { setPicked([]); setQ(''); } }, [open]);
  useEffect(() => {
    if (!open || !classGroup) return;
    setCands({ rows: [], loading: true });
    chatApi.getGroupCandidates(chat._id)
      .then((res) => setCands({ rows: Array.isArray(res?.data) ? res.data : [], loading: false }))
      .catch(() => setCands({ rows: [], loading: false }));
  }, [open, classGroup, chat?._id]);

  const submit = async () => {
    if (!picked.length) return;
    setSaving(true);
    try {
      await chatApi.addMembers(chat._id, picked.map((c) => c._id));
      toast.success(`${picked.length} member${picked.length === 1 ? '' : 's'} added`);
      onAdded();
    } catch (e) { toast.error(e?.message || 'Could not add members'); }
    finally { setSaving(false); }
  };

  const toggle = (c) => setPicked((p) => (p.some((x) => x._id === c._id) ? p.filter((x) => x._id !== c._id) : [...p, c]));
  const term = q.trim().toLowerCase();
  const list = cands.rows.filter((c) => !term || c.name.toLowerCase().includes(term));

  return (
    <Dialog open={open} onClose={onClose} wide title="Add members"
      subtitle={classGroup ? (chat.kind === 'subject'
        ? `Only teachers of ${chat.subjectName} in Class ${chat.sectionLabel} can join ${chatName(chat)}`
        : `Teachers of Class ${chat.sectionLabel} who are not in ${chatName(chat)} yet`) : chatName(chat)}
      footer={<>
        <button type="button" className="ch-btn ch-btn--ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="ch-btn ch-btn--primary" onClick={submit} disabled={saving || !picked.length}>
          {saving ? 'Adding…' : `Add${picked.length ? ` ${picked.length}` : ''}`}
        </button>
      </>}>
      {classGroup ? (
        <>
          <label className="ch-search" style={{ height: 44 }}>
            <Icon name="search" size={18} />
            <span className="ch-sr">Search</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." />
          </label>
          <div className="ch-picker">
            {cands.loading ? <div className="ch-empty-list">Loading…</div>
              : !list.length ? <div className="ch-empty-list"><strong>Everyone is already here</strong>No other teacher of this class can be added.</div>
                : list.map((c) => <PickRow key={c._id} c={c} check on={picked.some((x) => x._id === c._id)} onClick={() => toggle(c)} />)}
          </div>
        </>
      ) : (
        <MemberPicker open={open} myRole={myRole} staffOnly={staffOnly} picked={picked} setPicked={setPicked} exclude={existing} />
      )}
    </Dialog>
  );
}

export function EditGroupDialog({ open, onClose, chat, onSaved }) {
  const [form, setForm] = useState({ name: '', description: '', isReadOnly: false });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && chat) setForm({ name: chat.name || '', description: chat.description || '', isReadOnly: !!chat.isReadOnly });
  }, [open, chat]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Group name is required'); return; }
    setSaving(true);
    try {
      await chatApi.updateGroupSettings(chat._id, { name: form.name.trim(), description: form.description.trim(), isReadOnly: form.isReadOnly });
      toast.success('Group updated');
      onSaved({ name: form.name.trim(), displayName: form.name.trim(), description: form.description.trim(), isReadOnly: form.isReadOnly });
    } catch (e) { toast.error(e?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Edit group"
      footer={<>
        <button type="button" className="ch-btn ch-btn--ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="ch-btn ch-btn--primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      <label className="ch-field">
        <span>Group name</span>
        <input value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </label>
      <label className="ch-field">
        <span>Description <em>(optional)</em></span>
        <textarea rows={3} maxLength={300} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </label>
      <label className="ch-switch">
        <Icon name="lock" size={18} />
        <span>Only admins and teachers can post</span>
        <input type="checkbox" checked={form.isReadOnly} onChange={(e) => setForm((f) => ({ ...f, isReadOnly: e.target.checked }))} />
        <span className="ch-switch__track" />
      </label>
    </Dialog>
  );
}

export function ForwardDialog({ msg, chats, onClose, onPick }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (msg) setQ(''); }, [msg]);
  const list = chats.filter((c) => !c.isArchived && (!q.trim() || chatName(c).toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Dialog open={!!msg} onClose={onClose} title="Forward message">
      {msg && (
        <div className="ch-bar" style={{ border: '1px solid var(--ch-line)', borderRadius: 10, marginBottom: 12 }}>
          <div className="ch-bar__body"><b>{msg.sender?.name}</b><span>{msg.content || 'Attachment'}</span></div>
        </div>
      )}
      <label className="ch-search" style={{ height: 44 }}>
        <Icon name="search" size={18} />
        <span className="ch-sr">Search conversations</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations..." />
      </label>
      <div className="ch-picker" style={{ maxHeight: 320 }}>
        {!list.length ? <div className="ch-empty-list">No conversations match.</div> : list.map((c) => (
          <button key={c._id} type="button" className="ch-pick" onClick={() => onPick(c)}>
            <Avatar name={chatName(c)} size={38} group={chatAvatarKind(c)} image={c.displayAvatar} />
            <span className="ch-pick__body"><span className="ch-pick__name" style={{ display: 'block' }}>{chatName(c)}</span>
              <span className="ch-pick__line" style={{ display: 'block' }}>{isGroup(c) ? `${c.memberCount} members` : (ROLE_LABEL[c.otherUser?.role] || '')}</span></span>
            <Icon name="send" size={18} />
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function HistoryDialog({ msg, onClose }) {
  const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  return (
    <Dialog open={!!msg} onClose={onClose} title="Edit history" subtitle={msg ? `Sent by ${msg.sender?.name} · ${when(msg.createdAt)}` : ''}>
      {msg && (
        <>
          {(msg.editHistory || []).map((h, i) => (
            <div key={i} className="ch-history">
              <small>Version {i + 1}{h.editedAt ? ` · replaced ${when(h.editedAt)}` : ''}</small>
              <p>{h.content || '(empty)'}</p>
            </div>
          ))}
          <div className="ch-history is-current">
            <small>Current{msg.editedAt ? ` · edited ${when(msg.editedAt)}` : ''}</small>
            <p>{msg.content}</p>
          </div>
        </>
      )}
    </Dialog>
  );
}

// ─── Info drawer ──────────────────────────────────────────────────────────────

export function InfoDrawer({
  chat, profile, loading, myId, online, observer, onClose,
  onMute, onArchive, onAddMembers, onEditGroup, onRemoveMember, onLeave, onMessage, onSync, syncing,
}) {
  const group = isGroup(chat);
  const person = profile?.person;
  const members = profile?.members || [];
  const iAmAdmin = members.some((m) => m._id === myId && m.memberRole === 'admin');
  // A class or subject group: its membership follows the class, and what this
  // viewer may do in it comes from the server (profile.manage).
  const manage = profile?.manage || null;
  const classKind = profile?.kind || '';
  const canAdd = classKind ? !!manage?.canManage : iAmAdmin;
  const canRemove = (m) => (classKind ? (manage?.removable || []).includes(m._id) : iAmAdmin && m._id !== myId);
  const canLeave = classKind ? !!manage?.canLeave : true;
  const tagOf = (m) => (classKind ? (manage?.tags?.[m._id] || ROLE_LABEL[m.role] || m.role) : (ROLE_LABEL[m.role] || m.role));
  const staff = classKind ? members.filter((m) => m.role !== 'student') : members;
  const students = classKind ? members.filter((m) => m.role === 'student') : [];
  const label = profile?.classSection?.label || chat.sectionLabel || '';

  const memberRow = (m) => (
    <div key={m._id} className="ch-member">
      <Avatar name={m.name} size={38} image={m.profileImage} online={online.has(m._id)} />
      <div className="ch-member__body">
        <div className="ch-member__name">{m.name}{m._id === myId ? ' (you)' : ''}</div>
        <div className="ch-member__role">{tagOf(m)}{m.memberRole === 'admin' ? ' · Manages group' : ''}</div>
      </div>
      {!observer && m._id !== myId && (
        <button type="button" className="ch-member__x" onClick={() => onMessage(m)} title={`Message ${m.name}`} aria-label={`Message ${m.name}`}><Icon name="chat" size={16} /></button>
      )}
      {!observer && canRemove(m) && (
        <button type="button" className="ch-member__x" onClick={() => onRemoveMember(m)} title="Remove from group" aria-label={`Remove ${m.name}`}><Icon name="close" size={16} /></button>
      )}
    </div>
  );
  return (
    <aside className="ch-drawer" aria-label={group ? 'Group info' : 'Contact info'}>
      <div className="ch-drawer__head">
        <h3>{group ? 'Group info' : 'Contact info'}</h3>
        <button type="button" className="ch-iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
      </div>
      <div className="ch-drawer__body">
        <div className="ch-drawer__hero">
          <Avatar name={chatName(chat)} size={84} group={chatAvatarKind(chat)} image={chat.displayAvatar} online={!group && online.has(chat.otherUser?._id)} />
          <h4>{chatName(chat)}</h4>
          <p>
            {group
              ? `${classKind === 'class' ? 'Class group' : classKind === 'subject' ? 'Subject group' : chat.type === 'broadcast' ? 'Announcement channel' : 'Group'} · ${chat.memberCount} member${chat.memberCount === 1 ? '' : 's'}`
              : `${ROLE_LABEL[chat.otherUser?.role] || ''}${chat.otherUser ? ` · ${online.has(chat.otherUser._id) ? 'Online' : lastSeen(chat.otherUser.lastSeenAt)}` : ''}`}
          </p>
        </div>

        {loading && !profile ? <div className="ch-empty-list">Loading…</div> : (
          <>
            {!group && person && (
              <dl className="ch-facts">
                {person.role === 'teacher' && <>
                  {person.subjects?.length > 0 && <div className="ch-fact"><dt>Teaches</dt><dd><div className="ch-chips">{person.subjects.map((s) => <span key={s} className="ch-chip">{s}</span>)}</div></dd></div>}
                  {person.classes?.length > 0 && <div className="ch-fact"><dt>Classes</dt><dd><div className="ch-chips">{person.classes.map((s) => <span key={s} className="ch-chip">{s}</span>)}</div></dd></div>}
                  {person.classTeacherOf?.length > 0 && <div className="ch-fact"><dt>Class teacher of</dt><dd>{person.classTeacherOf.join(', ')}</dd></div>}
                  {(person.designation || person.department) && <div className="ch-fact"><dt>Role</dt><dd>{[person.designation, person.department].filter(Boolean).join(' · ')}</dd></div>}
                </>}
                {person.role === 'student' && <>
                  <div className="ch-fact"><dt>Class</dt><dd>{personLine(person)[0]}</dd></div>
                  {person.rollNumber && <div className="ch-fact"><dt>Roll number</dt><dd>{person.rollNumber}</dd></div>}
                </>}
                {person.role === 'parent' && (
                  <div className="ch-fact"><dt>Children</dt><dd>
                    {(person.children || []).length ? person.children.map((k) => <div key={k._id}>{k.name}{k.className ? ` · Class ${k.className}` : ''}</div>) : 'None linked'}
                  </dd></div>
                )}
                {person.role === 'school_admin' && <div className="ch-fact"><dt>Role</dt><dd>School administrator</dd></div>}
              </dl>
            )}

            {group && (
              <>
                <dl className="ch-facts">
                  {classKind === 'class' && <div className="ch-fact"><dt>Class group · Class {label}</dt>
                    <dd>Every student of Class {label} is in this group, with its class teacher and vice class teacher. Subject teachers of the class can be added.</dd></div>}
                  {classKind === 'subject' && <div className="ch-fact"><dt>{profile?.subject?.name || chat.subjectName} · Class {label}</dt>
                    <dd>Every student of Class {label} is in this group. Only teachers of {profile?.subject?.name || chat.subjectName} in Class {label} can join it.</dd></div>}
                  {chat.description && <div className="ch-fact"><dt>About</dt><dd>{chat.description}</dd></div>}
                  {profile?.createdBy && <div className="ch-fact"><dt>Created by</dt><dd>{profile.createdBy._id === myId ? 'You' : profile.createdBy.name}{profile.createdAt ? ` · ${new Date(profile.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</dd></div>}
                </dl>
                <div className="ch-section-title">
                  <span>{classKind ? `Teachers · ${staff.length}` : `${members.length} member${members.length === 1 ? '' : 's'}`}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {!observer && classKind && manage?.canSync && (
                      <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={onSync} disabled={syncing} title={`Match the group to Class ${label}'s current students and teachers`}>
                        <Icon name="refresh" size={15} /> {syncing ? 'Syncing…' : 'Sync'}
                      </button>
                    )}
                    {!observer && canAdd && (
                      <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={onAddMembers}><Icon name="userPlus" size={16} /> Add</button>
                    )}
                  </span>
                </div>
                {staff.map(memberRow)}
                {classKind && (
                  <>
                    <div className="ch-section-title">
                      <span>Students · {students.length}</span>
                      <span className="ch-member__role" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="lock" size={13} /> Follows Class {label}</span>
                    </div>
                    {!students.length && <p className="ch-note" style={{ marginTop: 0 }}>No students are placed in Class {label} yet.</p>}
                    {students.map(memberRow)}
                  </>
                )}
              </>
            )}

            {!observer && (
              <div className="ch-drawer__actions">
                <label className="ch-switch">
                  <Icon name="bellOff" size={18} />
                  <span>Mute notifications</span>
                  <input type="checkbox" checked={!!chat.isMuted} onChange={onMute} />
                  <span className="ch-switch__track" />
                </label>
                <button type="button" className="ch-btn ch-btn--ghost" onClick={onArchive}>
                  <Icon name="archive" size={18} /> {chat.isArchived ? 'Move back to chats' : 'Archive conversation'}
                </button>
                {group && iAmAdmin && (
                  <button type="button" className="ch-btn ch-btn--ghost" onClick={onEditGroup}><Icon name="pencil" size={18} /> Edit group</button>
                )}
                {group && canLeave && (
                  <button type="button" className="ch-btn ch-btn--danger" onClick={onLeave}><Icon name="logOut" size={18} /> Leave group</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
