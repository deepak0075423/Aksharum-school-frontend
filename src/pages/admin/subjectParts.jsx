/**
 * The pieces that know what a subject *is* — everything the list frame in
 * listParts.jsx does not.
 *
 * A subject is a catalogue entry that only means something once it is used:
 * set against a class, and taught by somebody in a section. So the row leads
 * with the name and ends with where it is actually used this year, and "not
 * used yet" is a state the page states plainly rather than leaving blank.
 *
 * Same file convention as sectionParts.jsx and classParts.jsx.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Alert, Badge, Button, Modal, Spinner } from '../../components/ui/index';

export const TYPES = [
  { value: 'theory',    label: 'Theory',    tone: 'indigo', icon: 'book' },
  { value: 'practical', label: 'Practical', tone: 'green',  icon: 'sliders' },
  { value: 'elective',  label: 'Elective',  tone: 'amber',  icon: 'star' },
];

export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));
const TYPE_BY = Object.fromEntries(TYPES.map((t) => [t.value, t]));
const typeOf = (subject) => TYPE_BY[subject?.type] || TYPE_BY.theory;

/** Every teacher named against any subject, counted once. */
export const teacherCount = (subjects = []) => new Set(
  subjects.flatMap((s) => (s.teachers || []).map((t) => String(t._id || t))),
).size;

// ── Cells ────────────────────────────────────────────────────────────────────

/** The subject's identity: a mark coloured by type, its name and its note. */
export const SubjectCell = ({ subject }) => {
  const t = typeOf(subject);
  return (
    <div className="subwho">
      <span className={`submark tint-${t.tone}`}><Icon name={t.icon} size={18} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="subwho__name">{subject.subjectName}</div>
        <div className="subwho__sub">
          {subject.description
            ? subject.description
            : subject.subjectCode
              ? `Code ${subject.subjectCode}`
              : 'No code set'}
        </div>
      </div>
    </div>
  );
};

export const TypeBadge = ({ type }) => {
  const t = TYPE_BY[type] || TYPE_BY.theory;
  return <span className={`subtype subtype--${t.tone}`}>{t.label}</span>;
};

/**
 * Who can teach it.
 *
 * These are the teachers attached to the subject in the catalogue — the pool
 * the section picker draws from — not who teaches it in any particular section.
 * Past `max` the rest collapse into a +N so one popular subject cannot stretch
 * every row on the page.
 */
export const TeacherChips = ({ teachers = [], max = 2 }) => {
  if (!teachers.length) return <span className="lnone">Nobody yet</span>;
  const shown = teachers.slice(0, max);
  const rest  = teachers.length - shown.length;
  return (
    <div className="lchips" title={teachers.map((t) => t.name || t).join(', ')}>
      {shown.map((t) => (
        <span key={t._id || t} className="lchip"
          title={[t.name, t.email, t.department, t.designation].filter(Boolean).join(' · ') || undefined}>
          {t.name || t}
        </span>
      ))}
      {rest > 0 && <span className="lchip lchip--more">+{rest}</span>}
    </div>
  );
};

/**
 * Where the subject is used this year.
 *
 * "In use" is the whole point of the year picker above the table: the catalogue
 * belongs to the year, but a subject nobody teaches is a subject that has not
 * been set up yet, and this is the cell that says which one this is.
 */
export const UsageCell = ({ subject, yearName }) => {
  const u = subject.usage;
  if (!u) return <span className="lnone">—</span>;
  if (!u.inUse) {
    return <span className="subusage__none">Not used in {yearName}</span>;
  }
  return (
    <div className="subusage">
      <div className="subusage__counts">
        <span><b>{u.classCount}</b> {u.classCount === 1 ? 'class' : 'classes'}</span>
        <span><b>{u.sectionCount}</b> {u.sectionCount === 1 ? 'section' : 'sections'}</span>
        <span><b>{u.teacherCount}</b> {u.teacherCount === 1 ? 'teacher' : 'teachers'}</span>
      </div>
      {u.classes.length > 0 && (
        <div className="subusage__where" title={u.classes.join(', ')}>
          {u.classes.slice(0, 3).join(', ')}
          {u.classes.length > 3 ? ` +${u.classes.length - 3} more` : ''}
        </div>
      )}
    </div>
  );
};

export const StatusCell = ({ subject }) => (
  <Badge variant={subject.usage?.inUse ? 'success' : 'muted'}>
    {subject.usage?.inUse ? 'In use' : 'Not used'}
  </Badge>
);

// ── The form ─────────────────────────────────────────────────────────────────

const BLANK = { name: '', code: '', type: 'theory', description: '', teachers: [] };

/**
 * Add or edit a subject, and choose who can teach it.
 *
 * The teacher list is the part that matters: a name and an email are not enough
 * to pick the right person — two schools out of three have a second "Priya
 * Sharma" — so the picker shows department and designation, which is what
 * actually separates them.
 */
export function SubjectForm({
  open, subject, yearName, teachers, teachersLoading, saving, error, onClose, onSave,
}) {
  const [form, setForm]   = useState(BLANK);
  const [query, setQuery] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setTouched(false);
    setForm(subject
      ? {
        name: subject.subjectName || '',
        code: subject.subjectCode || '',
        type: subject.type || 'theory',
        description: subject.description || '',
        teachers: (subject.teachers || []).map((t) => t._id || t),
      }
      : BLANK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject?._id]);

  const toggle = (teacherId) => setForm((f) => ({
    ...f,
    teachers: f.teachers.includes(teacherId)
      ? f.teachers.filter((t) => t !== teacherId)
      : [...f.teachers, teacherId],
  }));

  // Filtering on the same fields the row shows, so anything a reader can see
  // they can also type. A ticked teacher always stays visible — filtering one
  // out would hide a choice the admin has already made.
  const needle = query.trim().toLowerCase();
  const shown  = !needle ? teachers : teachers.filter((t) => form.teachers.includes(t._id)
    || [t.name, t.email, t.department, t.designation, t.employeeId]
      .some((v) => String(v || '').toLowerCase().includes(needle)));

  const problem = !form.name.trim() ? 'Give the subject a name.' : '';

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    onSave({
      name: form.name.trim(),
      code: form.code.trim(),
      type: form.type,
      description: form.description.trim(),
      teachers: form.teachers,
    });
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={620}
      title={subject ? `Edit ${subject.subjectName}` : `Add a subject to ${yearName || 'this year'}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button form="subject-form" type="submit" loading={saving}>
          {subject ? 'Save changes' : 'Create subject'}
        </Button>
      </>}>
      <form id="subject-form" onSubmit={submit} noValidate>
        {error && <div style={{ marginBottom: 14 }}><Alert variant="danger">{error}</Alert></div>}

        <div className="form-group">
          <label className="form-label required">Subject name</label>
          <input className="form-control" autoFocus maxLength={80} placeholder="Mathematics"
            value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>

        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Code</label>
            <input className="form-control" maxLength={20} placeholder="MATH"
              value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            <div className="form-hint">Stored in capitals, and unique within the year.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-control" value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="form-hint">Groups the subject on a section&rsquo;s page and in the timetable.</div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-control" maxLength={160} placeholder="What this subject covers"
            value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Teachers who can take it</label>
          <div className="form-hint" style={{ marginBottom: 8 }}>
            The pool a section picks from when assigning this subject. It does not put anyone in front
            of a class on its own.
          </div>

          {teachersLoading
            ? <div style={{ padding: '12px 0' }}><Spinner size="sm" /></div>
            : !teachers.length
              ? <Alert variant="info">No active teachers yet — add them under Teachers first.</Alert>
              : (
                <>
                  <input className="form-control" style={{ marginBottom: 8 }}
                    placeholder="Filter by name, email, department or designation…"
                    value={query} onChange={(e) => setQuery(e.target.value)} />
                  <div className="subpool">
                    {shown.length === 0
                      ? <p className="subpool__empty">No teacher matches “{query}”.</p>
                      : shown.map((t) => {
                        const on = form.teachers.includes(t._id);
                        return (
                          <label key={t._id} className={`subpool__row${on ? ' is-picked' : ''}`}>
                            <input type="checkbox" checked={on} onChange={() => toggle(t._id)} />
                            <div style={{ minWidth: 0 }}>
                              <div className="subpool__name">
                                {t.name}
                                {t.employeeId ? <span>{t.employeeId}</span> : null}
                              </div>
                              <div className="subpool__mail">{t.email}</div>
                              {(t.department || t.designation) && (
                                <div className="subpool__tags">
                                  {t.department  && <Badge variant="info">{t.department}</Badge>}
                                  {t.designation && <Badge variant="muted">{t.designation}</Badge>}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                  </div>
                  {form.teachers.length > 0 && (
                    <div className="form-hint" style={{ color: 'var(--primary)', marginTop: 6 }}>
                      {form.teachers.length} teacher{form.teachers.length === 1 ? '' : 's'} selected
                    </div>
                  )}
                </>
              )}
        </div>

        {problem && touched && <div style={{ marginTop: 14 }}><Alert variant="warning">{problem}</Alert></div>}
      </form>
    </Modal>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

/**
 * Why a delete was refused.
 *
 * Nothing cascades from a subject, so one that classes still carry cannot be
 * removed without leaving those links pointing at nothing. The dialog names the
 * classes rather than just counting them — that is where the work is.
 */
export const InUseDialog = ({ state, onClose }) => (
  <Modal open={!!state} onClose={onClose} title="This subject is still in use" maxWidth={480}
    footer={<>
      <Button variant="secondary" onClick={onClose}>Close</Button>
      <Link to="/admin/classes" className="btn btn-primary" onClick={onClose}>Open Classes</Link>
    </>}>
    <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.6 }}>{state?.message}</p>
    {state?.counts && (
      <div className="lblock">
        {[
          ['classes carry it', state.counts.classCount, 'grid'],
          ['sections teach it', state.counts.sectionCount, 'layers'],
          ['teacher assignments', state.counts.teacherCount, 'teacher'],
        ].filter(([, n]) => n > 0).map(([label, n, icon]) => (
          <div key={label} className="lblock__row">
            <Icon name={icon} size={16} /> <b>{n}</b> {label}
          </div>
        ))}
      </div>
    )}
    {state?.classes?.length > 0 && (
      <div className="form-hint" style={{ marginTop: 12 }}>
        In {state.classes.slice(0, 6).join(', ')}
        {state.classes.length > 6 ? ` and ${state.classes.length - 6} more` : ''}.
      </div>
    )}
  </Modal>
);

/** Deleting a subject nobody uses still takes it out of this year's catalogue. */
export const DeleteDialog = ({ subject, yearName, deleting, onClose, onConfirm }) => (
  <Modal open={!!subject} onClose={onClose} title="Delete Subject" maxWidth={440}
    footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant="danger" onClick={onConfirm} loading={deleting}>Delete subject</Button>
    </>}>
    <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.6 }}>
      Remove <b style={{ color: 'var(--text)' }}>{subject?.subjectName}</b> from
      the {yearName || 'current'} catalogue? Other years keep their own copy of it.
    </p>
    {(subject?.teachers || []).length > 0 && (
      <div style={{ marginTop: 14 }}>
        <Alert variant="info">
          The {subject.teachers.length} teacher{subject.teachers.length === 1 ? '' : 's'} listed against
          it are not affected — this only removes the subject.
        </Alert>
      </div>
    )}
  </Modal>
);

// ── Closing panels ───────────────────────────────────────────────────────────

/**
 * What a subject needs before it counts as set up, in the order it happens.
 * Each line goes somewhere real.
 */
export const NextStepsPanel = ({ unused, yearName }) => (
  <section className="lpanel lhelp">
    <span className="lhelp__mark"><Icon name="arrowRight" size={22} /></span>
    <div className="lhelp__body">
      <h2>Putting subjects to work</h2>
      <p>
        {unused > 0
          ? <>{unused} subject{unused === 1 ? ' is' : 's are'} in the {yearName} catalogue but not taught
            anywhere yet. A subject counts as in use once a class carries it and a section has a teacher
            for it.</>
          : <>Every subject in {yearName} is carried by a class and taught in a section.</>}
      </p>
      <div className="subnext">
        <Link to="/admin/classes"><Icon name="grid" size={15} /> Assign subjects to classes <Icon name="chevronRight" size={14} /></Link>
        <Link to="/admin/classes"><Icon name="teacher" size={15} /> Assign subject teachers in a section <Icon name="chevronRight" size={14} /></Link>
        <Link to="/admin/timetable"><Icon name="clock" size={15} /> Build the timetable <Icon name="chevronRight" size={14} /></Link>
      </div>
    </div>
  </section>
);
