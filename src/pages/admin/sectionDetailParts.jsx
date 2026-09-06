/**
 * The panels of one section's page — everything that is display rather than
 * state. The modals stay in SectionDetail.jsx, because each one is wired to a
 * fetch and a mutation; what lives here is what the page *shows*.
 *
 * Reads the section shape from sectionParts.jsx (chip, seat bar, fill), so the
 * list of sections and the section itself can never disagree about how full it
 * is or what it is missing.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Badge, Button, Empty, Spinner } from '../../components/ui/index';
import { fmtDate } from './listParts';
import { fillOf } from './sectionParts';

export const TYPE_ORDER = ['theory', 'practical', 'elective'];
export const TYPE_LABEL = { theory: 'Theory', practical: 'Practical', elective: 'Elective' };
const TYPE_TONE = { theory: 'indigo', practical: 'green', elective: 'amber' };

// ── People ───────────────────────────────────────────────────────────────────

const initials = (name) => String(name || '?')
  .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('')
  .toUpperCase() || '?';

/**
 * One teaching post: who holds it, or the fact that nobody does.
 *
 * An empty post is the more important state — a section without a class teacher
 * is the single most common thing wrong with a section — so it is drawn as an
 * invitation rather than as a blank line.
 */
export const TeacherSlot = ({ label, hint, teacher, tone = 'indigo', onAssign }) => (
  <div className={`sdslot${teacher ? '' : ' sdslot--empty'}`}>
    <span className={`sdslot__avatar${teacher ? ` tint-${tone}` : ''}`}>
      {teacher ? initials(teacher.name) : <Icon name="userPlus" size={18} />}
    </span>
    <div className="sdslot__body">
      <div className="sdslot__label">{label}</div>
      {teacher
        ? (
          <>
            <div className="sdslot__name">{teacher.name}</div>
            {teacher.email ? <div className="sdslot__sub">{teacher.email}</div> : null}
          </>
        )
        : <div className="sdslot__sub">{hint}</div>}
    </div>
    <button type="button" className="btn btn-secondary btn-sm" onClick={onAssign}>
      {teacher ? 'Change' : 'Assign'}
    </button>
  </div>
);

// ── Subjects ─────────────────────────────────────────────────────────────────

/**
 * Every subject taught in this section and who takes it.
 *
 * Grouped by type because that is how a timetable is built — theory first, then
 * practicals, then electives — and a subject with nobody against it is shown
 * rather than hidden, since that is the gap worth filling.
 */
export const SubjectBoard = ({ groups, loading, onAssign, onUnassign }) => {
  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>;
  }
  if (!groups.length) {
    return (
      <Empty icon="📘" title="No subjects assigned"
        message="Assign the class's subjects to this section to record who teaches what."
        action={<Button onClick={onAssign}><Icon name="plus" size={15} /> Assign Subject</Button>} />
    );
  }
  return (
    <div className="sdsubjects">
      {groups.map(({ type, rows }) => (
        <section key={type} className="sdsubjects__group">
          <h4 className={`sdtype sdtype--${TYPE_TONE[type] || 'indigo'}`}>
            {TYPE_LABEL[type] || type} <span>{rows.length}</span>
          </h4>
          {rows.map((row) => (
            <div className="sdsubject" key={row.subject?._id}>
              <div className="sdsubject__id">
                <div className="sdsubject__name">{row.subject?.subjectName || '—'}</div>
                {row.subject?.subjectCode ? <div className="sdsubject__code">{row.subject.subjectCode}</div> : null}
              </div>
              <div className="sdsubject__teachers">
                {row.teachers.length
                  ? row.teachers.map((t) => (
                    <span key={t._id} className="sdteacher">
                      {t.name}
                      <button type="button" onClick={() => onUnassign(row.subject, t)}
                        title={`Unassign ${t.name}`} aria-label={`Unassign ${t.name}`}>
                        <Icon name="close" size={12} />
                      </button>
                    </span>
                  ))
                  : <span className="sdteacher sdteacher--none"><Icon name="alert" size={12} /> No teacher</span>}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
};

// ── Group chat ───────────────────────────────────────────────────────────────

/**
 * The section's teacher group, kept in step with its line-up.
 *
 * It is created automatically as teachers are assigned; the button is here for
 * the section that predates the feature, or whose members have drifted.
 */
export const ChatPanel = ({ group, syncing, onSync }) => (
  <section className="lpanel sdchat">
    <div className="sdchat__head">
      <span className="lhelp__mark"><Icon name="chat" size={20} /></span>
      <div>
        <h2>Teacher group chat</h2>
        <p>
          {group
            ? 'The class teacher, the vice class teacher and every subject teacher of this section.'
            : 'Created automatically as teachers are assigned. Nothing exists for this section yet.'}
        </p>
      </div>
      <Button variant="secondary" onClick={onSync} loading={syncing}>
        {group ? 'Sync members' : 'Create group'}
      </Button>
    </div>
    {group && (
      <div className="sdchat__members">
        {(group.members || []).map((m) => (
          <span key={m._id} className="lchip">
            {m.name}{m.memberRole === 'admin' ? ' · owner' : ''}
          </span>
        ))}
      </div>
    )}
  </section>
);

// ── Students ─────────────────────────────────────────────────────────────────

/** The roll number, which is also the way to change it. */
export const RollButton = ({ student, onEdit }) => (
  <button type="button" className={`sdroll${student.rollNumber ? ' sdroll--set' : ''}`}
    onClick={() => onEdit(student)} title="Edit roll number">
    {student.rollNumber || 'Set'}
  </button>
);

export const StudentIdentity = ({ student }) => (
  <div className="sdwho">
    <span className="sdwho__avatar tint-green">{initials(student.name)}</span>
    <div style={{ minWidth: 0 }}>
      <div className="sdwho__name">{student.name}</div>
      {student.email ? <div className="sdwho__sub" title={student.email}>{student.email}</div> : null}
    </div>
  </div>
);

/** An em dash, so an empty cell reads as "nothing recorded" rather than a gap. */
export const Blank = () => <span className="lnone">—</span>;

// ── Closing panel ────────────────────────────────────────────────────────────

/**
 * What this section still needs, in the order it should be done: somebody in
 * front of it, then its subjects covered, then roll numbers once the students
 * are in. Each line is a button, because each one has somewhere to go.
 */
export const SectionSetupPanel = ({ section, subjectsTaught, onAssignTeacher, onAssignSubject, onAssignRolls }) => {
  const classSubjects = section?.classSubjectCount || 0;
  const students = (section?.enrolledStudents || []).length;
  const todo = [];

  if (!section?.classTeacher) {
    todo.push({ key: 'teacher', icon: 'teacher', text: 'No class teacher yet', action: 'Assign one', run: onAssignTeacher });
  }
  if (classSubjects > subjectsTaught) {
    todo.push({
      key: 'subjects',
      icon: 'book',
      text: classSubjects
        ? `${classSubjects - subjectsTaught} of ${classSubjects} subjects have no teacher here`
        : 'The class has no subjects yet',
      action: 'Assign a subject',
      run: onAssignSubject,
    });
  }
  if (students > 0 && !section?.rollNumbersAssignedAt) {
    todo.push({ key: 'rolls', icon: 'idCard', text: 'Roll numbers have not been given out', action: 'Assign them', run: onAssignRolls });
  }

  const fill = fillOf({ ...section, studentCount: students });
  if (fill.over) {
    todo.push({ key: 'over', icon: 'alert', text: `${fill.students} students in ${fill.seats} seats`, action: null });
  }

  return (
    <section className="lpanel sdtodo">
      <span className="lhelp__mark"><Icon name={todo.length ? 'alert' : 'checkCircle'} size={22} /></span>
      <div className="lhelp__body">
        <h2>{todo.length ? 'Before this section can be taught' : 'This section is ready'}</h2>
        {todo.length
          ? (
            <ul className="sdtodo__list">
              {todo.map((t) => (
                <li key={t.key}>
                  <Icon name={t.icon} size={15} />
                  <span>{t.text}</span>
                  {t.action && (
                    <button type="button" onClick={t.run}>{t.action}</button>
                  )}
                </li>
              ))}
            </ul>
          )
          : (
            <p>
              A class teacher is in place, every subject on the class has a teacher here, and
              {section?.rollNumbersAssignedAt
                ? ` roll numbers were given out on ${fmtDate(section.rollNumbersAssignedAt)}.`
                : ' there is nobody waiting on a roll number.'}
            </p>
          )}
      </div>
    </section>
  );
};

/** Class · year · status, under the section's name. */
export const SectionMeta = ({ section }) => (
  <div className="sdmeta">
    {section?.className && (
      <Link to={`/admin/classes/${section.class}`} className="sdmeta__link">{section.className}</Link>
    )}
    {section?.academicYearName && <><span aria-hidden>·</span><span>{section.academicYearName}</span></>}
    <span aria-hidden>·</span>
    <span>{(section?.enrolledStudents || []).length} of {section?.maxStudents ?? 0} seats filled</span>
    {section?.status && section.status !== 'active' && (
      <Badge variant="warning">{section.status}</Badge>
    )}
  </div>
);
