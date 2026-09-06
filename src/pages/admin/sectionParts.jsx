/**
 * The pieces that know what a section *is* — everything the list frame in
 * listParts.jsx does not.
 *
 * A section is where the school actually happens: it has seats, one class
 * teacher, a subject list that someone has to be assigned to, and the students
 * who sit in it. So every card here answers the same three questions — how full
 * is it, who is in front of it, and how much of its teaching is still unstaffed.
 *
 * Same file convention as classParts.jsx and academicYearParts.jsx.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Alert, Badge, Button, Modal } from '../../components/ui/index';
import { fmtDate, MenuItem, MenuSep, RowMenu } from './listParts';

// ── Reading a section ────────────────────────────────────────────────────────

export const seatsOf   = (sec) => sec?.maxStudents ?? sec?.capacity ?? 0;
export const countOf   = (sec) => sec?.studentCount ?? (sec?.enrolledStudents || []).length ?? 0;

/** How full it is. `over` matters most — it is the one state nothing else fixes. */
export const fillOf = (sec) => {
  const seats    = seatsOf(sec);
  const students = countOf(sec);
  return {
    seats,
    students,
    free: Math.max(0, seats - students),
    over: students > seats,
    pct:  seats ? Math.min(100, Math.round((students / seats) * 100)) : 0,
  };
};

/**
 * What is missing before this section can be taught.
 *
 * `classSubjects` is how many subjects the CLASS carries — a section with two
 * of six subjects staffed is not finished, and the section row alone cannot
 * know that. Ordered by what blocks the most.
 */
export const setupIssues = (sec, classSubjects = 0) => {
  const out = [];
  if (!sec?.classTeacher) out.push({ key: 'teacher', text: 'No class teacher assigned' });
  const uncovered = classSubjects - (sec?.subjectsTaught || 0);
  if (classSubjects > 0 && uncovered > 0) {
    out.push({ key: 'subjects', text: `${uncovered} of ${classSubjects} subjects without a teacher` });
  }
  const fill = fillOf(sec);
  if (fill.over) out.push({ key: 'capacity', text: `${fill.students} students in ${fill.seats} seats — over capacity` });
  if (countOf(sec) > 0 && !sec?.rollNumbersAssignedAt) {
    out.push({ key: 'roll', text: 'Roll numbers not assigned yet' });
  }
  return out;
};

export const needsSetup = (sec, classSubjects) => setupIssues(sec, classSubjects).length > 0;

// ── Shared bits ──────────────────────────────────────────────────────────────

const TONES = ['indigo', 'blue', 'green', 'amber', 'purple', 'pink', 'teal', 'orange'];

/** The section letter, tinted so A, B, C and D are told apart at a glance. */
export const SectionChip = ({ sec, size = 40 }) => {
  const name = String(sec?.sectionName || '?');
  const tone = TONES[(name.charCodeAt(0) || 0) % TONES.length];
  return (
    <span className={`secchip tint-${tone}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {name.slice(0, 2)}
    </span>
  );
};

/** students / seats, as a bar. */
export const SeatBar = ({ sec, showLabel = true }) => {
  const f = fillOf(sec);
  const tone = f.over ? 'over' : f.pct >= 90 ? 'tight' : 'ok';
  return (
    <div className="secseats">
      <div className={`secbar secbar--${tone}`}>
        <span style={{ width: `${f.seats ? f.pct : 0}%` }} />
      </div>
      {showLabel && (
        <div className="secseats__label">
          {f.seats
            ? <><b>{f.students}</b> of {f.seats} seats{f.over ? ' · over capacity' : f.free === 0 ? ' · full' : ` · ${f.free} free`}</>
            : <>No capacity set</>}
        </div>
      )}
    </div>
  );
};

/** Who is in front of the section — the fact the old page never showed. */
export const TeacherLine = ({ sec, to }) => {
  if (!sec?.classTeacher) {
    return (
      <Link className="secteacher secteacher--none" to={to}>
        <Icon name="userPlus" size={15} />
        <span>Assign a class teacher</span>
      </Link>
    );
  }
  return (
    <div className="secteacher" title={sec.substituteTeacher ? `Vice: ${sec.substituteTeacher.name}` : undefined}>
      <Icon name="teacher" size={15} />
      <span className="secteacher__name">{sec.classTeacher.name}</span>
      {sec.substituteTeacher && <span className="secteacher__vice">+ vice</span>}
    </div>
  );
};

export const StatusBadge = ({ status }) => (
  <Badge variant={status === 'active' ? 'success' : status === 'archived' ? 'muted' : 'warning'}>
    {status === 'active' ? 'Active' : status === 'archived' ? 'Archived' : 'Inactive'}
  </Badge>
);

/** The first thing that is missing, with the rest on the tooltip. */
export const SetupNote = ({ sec, classSubjects }) => {
  const issues = setupIssues(sec, classSubjects);
  if (!issues.length) return null;
  return (
    <div className="secnote" title={issues.map((i) => i.text).join(' · ')}>
      <Icon name="alert" size={14} />
      <span>{issues[0].text}</span>
      {issues.length > 1 && <b>+{issues.length - 1}</b>}
    </div>
  );
};

// ── The card ─────────────────────────────────────────────────────────────────

const Metric = ({ icon, value, label }) => (
  <div className="secmetric">
    <Icon name={icon} size={15} />
    <span className="secmetric__v">{value}</span>
    <span className="secmetric__l">{label}</span>
  </div>
);

export const SectionCard = ({ sec, classSubjects, onCapacity, onDelete, classId }) => (
  <article className={`seccard${sec.status !== 'active' ? ' seccard--off' : ''}`}>
    <header className="seccard__head">
      <SectionChip sec={sec} />
      <div className="seccard__id">
        <h3>Section {sec.sectionName}</h3>
        <TeacherLine sec={sec} to={`/admin/sections/${sec._id}`} />
      </div>
      <StatusBadge status={sec.status} />
    </header>

    <SeatBar sec={sec} />

    <div className="secmetrics">
      <Metric icon="student" value={countOf(sec)} label={countOf(sec) === 1 ? 'Student' : 'Students'} />
      <Metric icon="book"    value={sec.subjectsTaught || 0} label="Subjects" />
      <Metric icon="users"   value={sec.subjectTeacherCount || 0} label={sec.subjectTeacherCount === 1 ? 'Teacher' : 'Teachers'} />
    </div>

    <SetupNote sec={sec} classSubjects={classSubjects} />

    <footer className="seccard__foot">
      <Link to={`/admin/sections/${sec._id}`} className="btn btn-primary btn-sm">
        Manage <Icon name="arrowRight" size={14} />
      </Link>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCapacity(sec)}>Capacity</button>
      <span className="seccard__gap" />
      <CardMenu sec={sec} classId={classId} onCapacity={onCapacity} onDelete={onDelete} />
    </footer>
  </article>
);

/**
 * The card's overflow menu, opened from the shared portalled RowMenu.
 *
 * It has to be portalled. A `.card` clips its own content so its corners stay
 * round, so a panel positioned inside the grid was cut off at the card's bottom
 * edge — which is every card on the last row, and the menu is taller than the
 * gap under it. RowMenu positions from the button's own rect outside the card
 * and flips above the button when the space below is tight.
 */
function CardMenu({ sec, classId, onCapacity, onDelete }) {
  return (
    <RowMenu>
      <MenuItem icon="users" to={`/admin/sections/${sec._id}`}>Students &amp; teachers</MenuItem>
      <MenuItem icon="sliders" onClick={() => onCapacity(sec)}>Set capacity</MenuItem>
      <MenuItem icon="student" to={`/admin/students?classId=${classId}&sectionId=${sec._id}`}>
        Open in Students
      </MenuItem>
      <MenuSep />
      <MenuItem icon="trash" danger onClick={() => onDelete(sec)}>Delete section</MenuItem>
    </RowMenu>
  );
}

// ── Table cells, for the list view ───────────────────────────────────────────

export const SectionCell = ({ sec }) => (
  <div className="secwho">
    <SectionChip sec={sec} size={34} />
    <div style={{ minWidth: 0 }}>
      <div className="secwho__name">Section {sec.sectionName}</div>
      <div className="secwho__sub">
        {sec.rollNumbersAssignedAt ? `Roll numbers set ${fmtDate(sec.rollNumbersAssignedAt)}` : 'Roll numbers not set'}
      </div>
    </div>
  </div>
);

export const SeatCell = ({ sec }) => {
  const f = fillOf(sec);
  return (
    <div className="secseatcell">
      <div className="secseatcell__n"><b>{f.students}</b><span> / {f.seats || '—'}</span></div>
      <SeatBar sec={sec} showLabel={false} />
    </div>
  );
};

export const CountCell = ({ value, sub }) => (
  <div className="seccount">
    <span className={`seccount__n${value ? '' : ' seccount__n--zero'}`}>{value ?? 0}</span>
    {sub ? <span className="seccount__sub">{sub}</span> : null}
  </div>
);

// ── The form ─────────────────────────────────────────────────────────────────

/**
 * One new section.
 *
 * Names are single letters by convention and the server uppercases them, so the
 * next free letter is offered rather than left to be guessed. Several at once is
 * a different dialog — AddSectionsModal, which previews the whole run.
 */
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

export const nextLetter = (sections = []) => {
  const used = new Set(sections.map((s) => String(s.sectionName || '').trim().toUpperCase()));
  return LETTERS.find((l) => !used.has(l)) || '';
};

export function SectionForm({ open, sections, className, saving, error, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', capacity: 40 });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    // Capacity follows what the class already uses, so sections stay even
    // without anyone having to remember the number.
    const seats = sections?.length
      ? Math.round(sections.reduce((n, s) => n + seatsOf(s), 0) / sections.length)
      : 40;
    setForm({ name: nextLetter(sections), capacity: seats || 40 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const name  = form.name.trim().toUpperCase();
  const taken = (sections || []).some((s) => String(s.sectionName || '').trim().toUpperCase() === name);
  const problem = !name ? 'Give the section a name — A, B, C.'
    : taken ? `Section ${name} already exists in ${className || 'this class'}.`
      : !form.capacity || Number(form.capacity) < 1 ? 'Capacity must be at least one seat.'
        : '';

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    onSave({ name, capacity: Number(form.capacity) });
  };

  return (
    <Modal open={open} onClose={onClose} title={`Add a section to ${className || 'this class'}`} maxWidth={480}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button form="section-form" type="submit" loading={saving}>Create section</Button>
      </>}>
      <form id="section-form" onSubmit={submit} noValidate>
        {error && <div style={{ marginBottom: 14 }}><Alert variant="danger">{error}</Alert></div>}
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label required">Section name</label>
            <input className="form-control" autoFocus maxLength={12} placeholder="A" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <div className="form-hint">Stored in capitals — “a” and “A” are the same section.</div>
          </div>
          <div className="form-group">
            <label className="form-label required">Capacity</label>
            <input type="number" className="form-control" min={1} value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
            <div className="form-hint">Seats. It can be changed at any time.</div>
          </div>
        </div>
        {problem && touched
          ? <Alert variant="warning">{problem}</Alert>
          : (
            <div className="secpreview">
              <Icon name="layers" size={18} />
              <div>
                <b>{className} — {name || '?'}</b> will hold {form.capacity || 0} students.
                {' '}Assign its class teacher from the section page once it exists.
              </div>
            </div>
          )}
      </form>
    </Modal>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

/** Deleting a section takes its subject-teacher assignments with it. */
export const DeleteSectionDialog = ({ sec, className, deleting, onClose, onConfirm }) => (
  <Modal open={!!sec} onClose={onClose} title="Delete Section" maxWidth={460}
    footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant="danger" onClick={onConfirm} loading={deleting}>Delete section</Button>
    </>}>
    <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.6 }}>
      Delete <b style={{ color: 'var(--text)' }}>{className} — {sec?.sectionName}</b>?
    </p>
    {sec?.subjectTeacherCount > 0 && (
      <div style={{ marginTop: 14 }}>
        <Alert variant="warning">
          Its {sec.subjectTeacherCount} subject-teacher assignment{sec.subjectTeacherCount === 1 ? '' : 's'} go with
          it. The teachers themselves are untouched. This cannot be undone.
        </Alert>
      </div>
    )}
  </Modal>
);

/** Why a delete was refused — students are still sitting in it. */
export const HasStudentsDialog = ({ state, classId, onClose }) => (
  <Modal open={!!state} onClose={onClose} title="Students are still in this section" maxWidth={460}
    footer={<>
      <Button variant="secondary" onClick={onClose}>Close</Button>
      <Link to={`/admin/students?classId=${classId}`} className="btn btn-primary" onClick={onClose}>Open Students</Link>
    </>}>
    <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.6 }}>{state?.message}</p>
    <div style={{ marginTop: 14 }}>
      <Alert variant="info">
        Students are moved one at a time from the section page, or all at once by shuffling the class —
        a section has to be empty before it can go.
      </Alert>
    </div>
  </Modal>
);

/**
 * The shuffle state of the class, as a strip above the list.
 *
 * The rule is easy to get wrong from the buttons alone: shuffle as often as you
 * like, then lock it for the year — and locking cannot be undone.
 */
export const ShuffleBanner = ({ shuffle }) => {
  if (!shuffle?.lockedAt && !shuffle?.shuffledAt) return null;
  const locked = !!shuffle.lockedAt;
  return (
    <div className={`secshuffle${locked ? ' secshuffle--locked' : ''}`}>
      <Icon name={locked ? 'key' : 'repeat'} size={16} />
      <span>
        {locked
          ? <>Sections were locked on {fmtDate(shuffle.lockedAt)}. This class cannot be reshuffled for
            this academic year — individual students can still be moved from a section page.</>
          : <>Last shuffled {fmtDate(shuffle.shuffledAt)}. Reshuffle as often as you need, then lock it to
            freeze the allocation for the year.</>}
      </span>
    </div>
  );
};

/** The panel closing the page: what a section needs before it can be taught. */
export const SectionSetupPanel = ({ total, needing, classSubjects, onAdd }) => (
  <section className="lpanel lhelp">
    <span className="lhelp__mark"><Icon name="layers" size={22} /></span>
    <div className="lhelp__body">
      <h2>Getting sections ready</h2>
      <p>
        {needing > 0
          ? <>{needing} of {total} section{total === 1 ? '' : 's'} {needing === 1 ? 'is' : 'are'} not ready — a class
            teacher, a teacher against each of the class&rsquo;s {classSubjects || 0} subjects, and roll numbers once
            the students are in. </>
          : <>Every section here has a class teacher and its subjects covered. </>}
        Capacity is what the shuffle divides students between, so set it before moving anyone.
      </p>
      <Button variant="secondary" onClick={onAdd}>
        <Icon name="plus" size={15} /> Add another section
      </Button>
    </div>
  </section>
);
