/**
 * The pieces that know what a class *is* — everything the list frame in
 * listParts.jsx does not.
 *
 * A class is not really a record, it is a container: sections underneath it,
 * students inside those, a teacher against each one and a subject list on top.
 * So the card is the primary view here and the table is the alternative, rather
 * than the other way round — and both are built from the same four figures the
 * server now counts (see classCounts() in class.controller.js).
 *
 * Same file convention as academicYearParts.jsx and designationParts.jsx.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Alert, Badge, Button, Modal } from '../../components/ui/index';
import { MenuItem, MenuSep, RowMenu } from './listParts';

// ── Reading a class ──────────────────────────────────────────────────────────

/** The grade printed on the card's chip — the number, or the class's initial. */
export const gradeOf = (cls) => {
  const n = Number(cls?.classNumber);
  if (Number.isFinite(n) && n > 0) return String(n);
  const word = String(cls?.className || '').match(/\d+/);
  if (word) return word[0];
  return String(cls?.className || '?').trim().charAt(0).toUpperCase() || '?';
};

/**
 * How full the class is.
 *
 * `seats` is the sum of its sections' capacities, so a class with no sections
 * has nowhere to put anyone — which is a different thing from an empty class
 * with room, and the card says so.
 */
export const fillOf = (cls) => {
  const seats    = cls?.seats || 0;
  const students = cls?.studentCount || 0;
  return {
    seats,
    students,
    free: Math.max(0, seats - students),
    over: students > seats,
    pct:  seats ? Math.min(100, Math.round((students / seats) * 100)) : 0,
  };
};

/**
 * What is missing before the class can actually be taught.
 *
 * Ordered by what stops the most: there is no point assigning subjects to a
 * class with no sections. Each entry is a sentence, because "3 issues" tells an
 * admin nothing they can act on.
 */
export const setupIssues = (cls) => {
  const out = [];
  const sections = cls?.sectionCount || 0;
  if (!sections) {
    out.push({ key: 'sections', text: 'No sections yet — nobody can be placed in this class' });
  } else {
    const uncovered = sections - (cls.classTeacherCount || 0);
    if (uncovered > 0) {
      out.push({
        key: 'teacher',
        text: `${uncovered} of ${sections} section${sections === 1 ? '' : 's'} without a class teacher`,
      });
    }
  }
  if (!cls?.subjectCount) out.push({ key: 'subjects', text: 'No subjects assigned to this class' });
  const fill = fillOf(cls);
  if (fill.over) {
    out.push({ key: 'capacity', text: `${fill.students} students in ${fill.seats} seats — over capacity` });
  }
  return out;
};

export const needsSetup = (cls) => setupIssues(cls).length > 0;

// ── Shared bits ──────────────────────────────────────────────────────────────

/** The grade chip, tinted so a wall of cards is still scannable. */
const TONES = ['indigo', 'blue', 'green', 'amber', 'purple', 'pink', 'teal', 'orange'];
export const toneFor = (cls) => {
  const n = Number(cls?.classNumber);
  const i = Number.isFinite(n) ? n : String(cls?.className || '').length;
  return TONES[Math.abs(i) % TONES.length];
};

export const GradeChip = ({ cls, size = 40 }) => (
  <span className={`clsgrade tint-${toneFor(cls)}`}
    style={{ width: size, height: size, fontSize: size * 0.4 }}>
    {gradeOf(cls)}
  </span>
);

/** students / seats, as a bar. The one number an admin acts on. */
export const SeatBar = ({ cls, showLabel = true }) => {
  const f = fillOf(cls);
  const tone = f.over ? 'over' : f.pct >= 90 ? 'tight' : 'ok';
  return (
    <div className="clsseats">
      <div className={`clsbar clsbar--${tone}`}>
        <span style={{ width: `${f.seats ? Math.min(100, f.pct) : 0}%` }} />
      </div>
      {showLabel && (
        <div className="clsseats__label">
          {f.seats
            ? <><b>{f.students}</b> of {f.seats} seats{f.over ? ' · over capacity' : f.free === 0 ? ' · full' : ` · ${f.free} free`}</>
            : <>No seats yet — add a section</>}
        </div>
      )}
    </div>
  );
};

/** One figure with its label, three to a row on the card. */
const Metric = ({ icon, value, label, to }) => {
  const body = (
    <>
      <Icon name={icon} size={15} />
      <span className="clsmetric__v">{value}</span>
      <span className="clsmetric__l">{label}</span>
    </>
  );
  return to
    ? <Link className="clsmetric clsmetric--link" to={to}>{body}</Link>
    : <div className="clsmetric">{body}</div>;
};

export const StatusBadge = ({ status }) => (
  <Badge variant={status === 'active' ? 'success' : status === 'archived' ? 'muted' : 'warning'}>
    {status === 'active' ? 'Active' : status === 'archived' ? 'Archived' : 'Inactive'}
  </Badge>
);

/** The first thing that is missing, as a warning strip. */
export const SetupNote = ({ cls }) => {
  const issues = setupIssues(cls);
  if (!issues.length) return null;
  return (
    <div className="clsnote" title={issues.map((i) => i.text).join(' · ')}>
      <Icon name="alert" size={14} />
      <span>{issues[0].text}</span>
      {issues.length > 1 && <b>+{issues.length - 1}</b>}
    </div>
  );
};

// ── The card ─────────────────────────────────────────────────────────────────

/**
 * A class, as a card.
 *
 * Everything on it is a fact the admin acts on: how full it is, how much of it
 * is still unstaffed, and the one link that leads to the sections where all of
 * that is actually fixed.
 */
export const ClassCard = ({ cls, onEdit, onDelete, onToggle, onSections }) => (
  <article className={`clscard${cls.status !== 'active' ? ' clscard--off' : ''}`}>
    <header className="clscard__head">
      <GradeChip cls={cls} />
      <div className="clscard__id">
        <h3>{cls.className}</h3>
        <p>{cls.academicYear?.yearName || ''}</p>
      </div>
      <StatusBadge status={cls.status} />
    </header>

    <SeatBar cls={cls} />

    <div className="clsmetrics">
      <Metric icon="layers"  value={cls.sectionCount || 0} label={cls.sectionCount === 1 ? 'Section' : 'Sections'}
        to={`/admin/classes/${cls._id}`} />
      <Metric icon="student" value={cls.studentCount || 0} label={cls.studentCount === 1 ? 'Student' : 'Students'} />
      <Metric icon="teacher" value={cls.teacherCount || 0} label={cls.teacherCount === 1 ? 'Teacher' : 'Teachers'} />
    </div>

    <SetupNote cls={cls} />

    <footer className="clscard__foot">
      <Link to={`/admin/classes/${cls._id}`} className="btn btn-primary btn-sm">
        View Sections <Icon name="arrowRight" size={14} />
      </Link>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(cls)}>Edit</button>
      <span className="clscard__gap" />
      <CardMenu cls={cls} onToggle={onToggle} onDelete={onDelete} onSections={onSections} />
    </footer>
  </article>
);

/**
 * The card's overflow menu — the same actions the table row offers, opened from
 * the same portalled RowMenu.
 *
 * It has to be portalled. A `.card` clips its own content so its corners stay
 * round, so a panel positioned inside the grid was cut off at the card's bottom
 * edge — which is every card on the last row, and the menu is taller than the
 * gap under it. RowMenu positions from the button's own rect outside the card
 * and flips above the button when the space below is tight.
 */
function CardMenu({ cls, onToggle, onDelete, onSections }) {
  return (
    <RowMenu>
      <MenuItem icon="plus" onClick={() => onSections(cls)}>Add sections</MenuItem>
      <MenuItem icon="layers" to={`/admin/classes/${cls._id}`}>Manage sections</MenuItem>
      <MenuItem icon="book" to="/admin/subjects">Assign subjects</MenuItem>
      <MenuSep />
      <MenuItem icon="power" onClick={() => onToggle(cls)}>
        {cls.status === 'active' ? 'Deactivate class' : 'Activate class'}
      </MenuItem>
      <MenuSep />
      <MenuItem icon="trash" danger onClick={() => onDelete(cls)}>Delete class</MenuItem>
    </RowMenu>
  );
}

// ── Table cells, for the list view ───────────────────────────────────────────

export const ClassCell = ({ cls }) => (
  <div className="clswho">
    <GradeChip cls={cls} size={36} />
    <div style={{ minWidth: 0 }}>
      <div className="clswho__name">{cls.className}</div>
      <div className="clswho__sub">{cls.academicYear?.yearName || `Grade ${gradeOf(cls)}`}</div>
    </div>
  </div>
);

/** The count, with what it is made of underneath. */
export const CountCell = ({ value, sub, to }) => {
  const body = (
    <>
      <span className={`clscount__n${value ? '' : ' clscount__n--zero'}`}>{value ?? 0}</span>
      {sub ? <span className="clscount__sub">{sub}</span> : null}
    </>
  );
  return to && value
    ? <Link className="clscount clscount--link" to={to}>{body}</Link>
    : <div className="clscount">{body}</div>;
};

export const SeatCell = ({ cls }) => {
  const f = fillOf(cls);
  return (
    <div className="clsseatcell">
      <div className="clsseatcell__n">
        <b>{f.students}</b>
        <span> / {f.seats || '—'}</span>
      </div>
      <SeatBar cls={cls} showLabel={false} />
    </div>
  );
};

// ── The form ─────────────────────────────────────────────────────────────────

const BLANK = { name: '', classNumber: '', academicYear: '', status: 'active' };

/**
 * Add or edit a class.
 *
 * The grade is its own field rather than something guessed from the name. The
 * server derives it from the digits in the name when it is left blank, and then
 * refuses the save if that number is taken — which is a confusing way to find
 * out, so the number is shown and can be set here.
 */
export function ClassForm({ open, cls, years, defaultYear, saving, error, onClose, onSave }) {
  const [form, setForm] = useState(BLANK);

  useEffect(() => {
    if (!open) return;
    setForm(cls
      ? {
        name: cls.className || '',
        classNumber: cls.classNumber ?? '',
        academicYear: cls.academicYear?._id || '',
        status: cls.status || 'active',
      }
      : { ...BLANK, academicYear: defaultYear || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cls?._id]);

  const year = (years || []).find((y) => String(y._id) === String(form.academicYear));
  const derived = String(form.name).match(/\d+/)?.[0] || '';

  const submit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if (cls) {
      // Only the name and the status are editable — a class cannot change grade
      // or year without invalidating everything hanging off it.
      onSave({ name, status: form.status });
    } else {
      onSave({
        name,
        ...(form.classNumber === '' ? {} : { classNumber: Number(form.classNumber) }),
        ...(form.academicYear ? { academicYear: form.academicYear } : {}),
      });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={cls ? `Edit ${cls.className}` : 'Add Class'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button form="class-form" type="submit" loading={saving}>{cls ? 'Save changes' : 'Create class'}</Button>
      </>}>
      <form id="class-form" onSubmit={submit} noValidate>
        {error && <div style={{ marginBottom: 14 }}><Alert variant="danger">{error}</Alert></div>}

        <div className="form-group">
          <label className="form-label required">Class name</label>
          <input className="form-control" autoFocus maxLength={60} placeholder="Class 10" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="form-hint">What staff and parents see everywhere this class appears.</div>
        </div>

        {!cls && (
          <>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Grade / level</label>
                <input type="number" className="form-control" min={0} max={20}
                  placeholder={derived || 'auto'} value={form.classNumber}
                  onChange={(e) => setForm((f) => ({ ...f, classNumber: e.target.value }))} />
                <div className="form-hint">
                  {derived
                    ? `Left blank, ${derived} is taken from the name. Two classes in a year cannot share a grade.`
                    : 'Sorts the class and must be unique within the year. Left blank, the next free number is used.'}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Academic year</label>
                <select className="form-control" value={form.academicYear}
                  onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value }))}>
                  <option value="">Active year</option>
                  {(years || []).map((y) => (
                    <option key={y._id} value={y._id}>
                      {y.yearName}{y.status === 'active' ? ' (active)' : ''}
                    </option>
                  ))}
                </select>
                <div className="form-hint">A class belongs to one year and is copied forward, never moved.</div>
              </div>
            </div>
            {year && year.status !== 'active' && (
              <Alert variant="info">
                This class goes into {year.yearName}, which is not the year the school is working in.
              </Alert>
            )}
          </>
        )}

        {cls && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <select className="form-control" value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="active">Active — in use this year</option>
              <option value="inactive">Inactive — kept, but not running</option>
              <option value="archived">Archived — finished with</option>
            </select>
            <div className="form-hint">
              Nothing is deleted by deactivating a class; its sections and students stay exactly as they are.
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

/**
 * Why a delete was refused.
 *
 * Deleting a class takes its sections with it, and a student's profile still
 * points at the class and section they were in — so a class anyone is still in
 * is refused, and this says where to move them.
 */
export const HasStudentsDialog = ({ state, onClose }) => (
  <Modal open={!!state} onClose={onClose} title="Students are still in this class" maxWidth={480}
    footer={<>
      <Button variant="secondary" onClick={onClose}>Close</Button>
      <Link to="/admin/students" className="btn btn-primary" onClick={onClose}>Open Students</Link>
    </>}>
    <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.6 }}>{state?.message}</p>
    {state?.counts && (
      <div className="lblock">
        {[
          ['students', state.counts.students, 'student'],
          ['sections', state.counts.sectionCount, 'layers'],
          ['subjects', state.counts.subjectCount, 'book'],
        ].filter(([, n]) => n > 0).map(([label, n, icon]) => (
          <div key={label} className="lblock__row">
            <Icon name={icon} size={16} /> <b>{n}</b> {label}
          </div>
        ))}
      </div>
    )}
    <div style={{ marginTop: 14 }}>
      <Alert variant="info">
        Not running this class any more? Deactivate it instead — it keeps its sections, students and
        history, and drops out of the active list.
      </Alert>
    </div>
  </Modal>
);

/** Deleting an empty class still takes its sections and subject links with it. */
export const DeleteClassDialog = ({ cls, deleting, onClose, onConfirm }) => (
  <Modal open={!!cls} onClose={onClose} title="Delete Class" maxWidth={460}
    footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant="danger" onClick={onConfirm} loading={deleting}>Delete class</Button>
    </>}>
    <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.6 }}>
      Delete <b style={{ color: 'var(--text)' }}>{cls?.className}</b> from {cls?.academicYear?.yearName || 'this year'}?
    </p>
    {(cls?.sectionCount > 0 || cls?.subjectCount > 0) && (
      <div style={{ marginTop: 14 }}>
        <Alert variant="warning">
          Its {cls.sectionCount > 0 && `${cls.sectionCount} section${cls.sectionCount === 1 ? '' : 's'}`}
          {cls.sectionCount > 0 && cls.subjectCount > 0 && ' and '}
          {cls.subjectCount > 0 && `${cls.subjectCount} subject link${cls.subjectCount === 1 ? '' : 's'}`}
          {' '}go with it, along with every subject-teacher assignment made inside them. This cannot be undone.
        </Alert>
      </div>
    )}
  </Modal>
);

/**
 * The panel closing the page: what a class needs before it can be taught, and
 * the fastest way to build a whole school's worth of them.
 */
export const SetupPanel = ({ total, needing, onBulk }) => (
  <section className="lpanel lhelp">
    <span className="lhelp__mark"><Icon name="layers" size={22} /></span>
    <div className="lhelp__body">
      <h2>Setting up classes</h2>
      <p>
        {needing > 0
          ? <>{needing} of {total} class{total === 1 ? '' : 'es'} {needing === 1 ? 'is' : 'are'} not ready to
            teach yet — missing sections, a class teacher on every section, or a subject list. </>
          : <>Every class here has sections, a class teacher on each of them and a subject list. </>}
        Bulk create builds a whole grade range with its sections in one go, and only ever adds what is
        missing — running it twice changes nothing.
      </p>
      <Button variant="secondary" onClick={onBulk}>
        <Icon name="grid" size={15} /> Bulk create classes &amp; sections
      </Button>
    </div>
  </section>
);
