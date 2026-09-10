/**
 * The My Section page's own panels.
 *
 * A teacher's attachment to a section comes in three flavours — class teacher,
 * vice class teacher, subject teacher — and the page says all three the same
 * way: a coloured chip, a name, a line of facts, a way in. These parts are the
 * shapes that repeat; the page itself only decides what goes in them.
 */
import React, { useEffect, useState } from 'react';
import Icon from '../../components/ui/icons';
import { Modal, Spinner } from '../../components/ui/index';
import { getTeacherSection } from '../../api/teacher.api';

/** "Class 7" → "C7". The chip is an identifier, not a label — keep it short. */
export function chipFor(row) {
  if (row?.classNumber != null) return `C${row.classNumber}`;
  const digits = String(row?.className || '').match(/\d+/);
  if (digits) return `C${digits[0]}`;
  const word = String(row?.className || row?.sectionName || '?').trim();
  return word.slice(0, 2).toUpperCase();
}

/**
 * What to call a class. `className` is the name the school typed, but a class
 * row can be missing (deleted, or another school's) and the section still has
 * to be nameable — so fall back to the number, then to the section letter.
 */
export const classLabel = (row) =>
  row?.className
  || (row?.classNumber != null ? `Class ${row.classNumber}` : '')
  || (row?.sectionName ? `Section ${row.sectionName}` : 'My class');

/** "Class 4 (Section A)" — the way a section is named out loud. */
export const secLabel = (row) => {
  const cls = row?.className || (row?.classNumber != null ? `Class ${row.classNumber}` : '');
  if (!cls) return row?.sectionName ? `Section ${row.sectionName}` : 'Section';
  return row?.sectionName ? `${cls} (Section ${row.sectionName})` : cls;
};

/** "1 Class" / "2 Classes" — the irregular plural has to be passed in. */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;

/** A year chip, and only when the row is not this year's work. */
export const YearTag = ({ row }) =>
  row && !row.isCurrentYear && row.yearName
    ? <span className="tsec-year" title="Another academic year">{row.yearName}</span>
    : null;

// ── The three headline tiles ─────────────────────────────────────────────────
export function Tile({ tone = 'indigo', icon, label, value, sub, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`tsec-tile tsec-t--${tone}${onClick ? ' tsec-tile--go' : ''}`}>
      <span className="tsec-ico tsec-ico--lg"><Icon name={icon} size={24} /></span>
      <span className="tsec-tile__body">
        <span className="tsec-tile__label">{label}</span>
        <span className="tsec-tile__value">{value}</span>
        <span className="tsec-tile__sub">{sub}</span>
      </span>
      {onClick && <Icon name="chevronRight" size={18} />}
    </Tag>
  );
}

// ── A card with a heading and an optional link on the right ──────────────────
export function Panel({ title, count, link, children, id }) {
  return (
    <section className="tsec-card" id={id}>
      <header className="tsec-card__head">
        <h2>{title}{count != null && ` (${count})`}</h2>
        {link && (
          <button type="button" className="tsec-more" onClick={link.onClick}>
            {link.label}<Icon name="arrowRight" size={15} />
          </button>
        )}
      </header>
      <div className="tsec-card__body">{children}</div>
    </section>
  );
}

/** One fact with its icon — "Section A", "32 Students", "Academic Year 2026-27". */
export const Fact = ({ icon, children }) => (
  <span className="tsec-fact"><Icon name={icon} size={15} />{children}</span>
);

// ── A section as a row: chip, name, facts, badge, chevron ────────────────────
export function SectionRow({ row, tone = 'indigo', chip, title, facts, badge, right, onOpen }) {
  return (
    <button type="button" className={`tsec-row tsec-t--${tone}`} onClick={onOpen}>
      <span className="tsec-chip">{chip ?? chipFor(row)}</span>
      <span className="tsec-row__body">
        <span className="tsec-row__title">{title}<YearTag row={row} /></span>
        <span className="tsec-row__facts">{facts}</span>
      </span>
      {right}
      {badge && <span className="tsec-badge">{badge}</span>}
      <Icon name="chevronRight" size={16} className="tsec-row__chev" />
    </button>
  );
}

/** A responsibility: what the role is, and where it applies. */
export function RoleRow({ tone = 'indigo', icon, label, sub, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`tsec-role tsec-t--${tone}${onClick ? ' tsec-role--go' : ''}`}>
      <span className="tsec-ico"><Icon name={icon} size={20} /></span>
      <span className="tsec-role__body">
        <span className="tsec-role__label">{label}</span>
        <span className="tsec-role__sub">{sub}</span>
      </span>
      {onClick && <Icon name="chevronRight" size={16} className="tsec-row__chev" />}
    </Tag>
  );
}

// ── One announcement ─────────────────────────────────────────────────────────
export function AnnouncementRow({ ann, tone, onDelete }) {
  const when = ann.createdAt
    ? new Date(ann.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  return (
    <div className={`tsec-ann tsec-t--${tone}`}>
      <span className="tsec-ico"><Icon name="megaphone" size={19} /></span>
      <span className="tsec-ann__body">
        <span className="tsec-ann__title">{ann.title}</span>
        <span className="tsec-ann__text">{ann.message}</span>
      </span>
      <span className="tsec-ann__date">{when}</span>
      {onDelete && (
        <button type="button" className="tsec-ann__del" title="Delete announcement" onClick={onDelete}>
          <Icon name="trash" size={15} />
        </button>
      )}
    </div>
  );
}

export const NoRows = ({ icon = 'layers', children }) => (
  <div className="tsec-none"><Icon name={icon} size={22} />{children}</div>
);

// ── The section drawer ───────────────────────────────────────────────────────
/**
 * Opened from any row on the page. It reads the section fresh from
 * /teacher/sections/:id, which is access-checked server-side — a teacher only
 * ever sees a section they are actually attached to, so the drawer can be
 * reached from every row without the page having to police it.
 */
export function SectionDrawer({ section, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    getTeacherSection(section._id)
      .then((res) => { if (alive) setData(res?.data ?? res); })
      .catch((e)  => { if (alive) setError(e.message || 'Could not load this section'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [section._id]);

  const sec = data?.section;

  return (
    <Modal open onClose={onClose} maxWidth={760}
      title={secLabel({
        className:   sec?.class?.className || section.className,
        classNumber: sec?.class?.classNumber ?? section.classNumber,
        sectionName: sec?.sectionName || section.sectionName,
      })}>
      {loading ? <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>
        : error ? <div className="alert alert-danger">{error}</div>
          : <SectionDetail section={section} data={data} />}
    </Modal>
  );
}

/** The drawer's contents, given the loaded section — kept pure and separate so
 *  it can be rendered and checked without a browser. */
export function SectionDetail({ section, data }) {
  const sec      = data?.section;
  const students = sec?.enrolledStudents || [];
  const subjects = data?.subjectTeachers || [];

  return (
    <div className="tsec-drawer">
      <div className="tsec-drawer__figs">
        <div><span>{students.length}</span>Students</div>
        <div><span>{sec?.maxStudents ?? '—'}</span>Capacity</div>
        <div><span>{sec?.academicYear?.yearName || section?.yearName || '—'}</span>Academic year</div>
      </div>

      <div className="tsec-drawer__who">
        <div>
          <span className="tsec-drawer__cap">Class teacher</span>
          <strong>{sec?.classTeacher?.name || 'Not assigned'}</strong>
          {sec?.classTeacher?.email && <em>{sec.classTeacher.email}</em>}
        </div>
        <div>
          <span className="tsec-drawer__cap">Vice class teacher</span>
          <strong>{sec?.substituteTeacher?.name || 'Not assigned'}</strong>
          {sec?.substituteTeacher?.email && <em>{sec.substituteTeacher.email}</em>}
        </div>
      </div>

      {subjects.length > 0 && (
        <>
          <h4 className="tsec-drawer__h">Subject teachers</h4>
          <div className="tsec-drawer__subs">
            {subjects.map((s) => (
              <div key={s._id}>
                <strong>{s.subject?.subjectName || 'Subject'}</strong>
                <span>{s.teacher?.name || 'Unassigned'}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h4 className="tsec-drawer__h">Students ({students.length})</h4>
      {students.length ? (
        <div className="tsec-drawer__roster">
          {students.map((s) => (
            <div key={s._id} className="tsec-student">
              <span className="tsec-student__av">{String(s.name || '?')[0].toUpperCase()}</span>
              <span className="tsec-student__body">
                <strong>{s.name}</strong>
                <em>{s.email}</em>
              </span>
              {s.rollNumber ? <span className="tsec-student__roll">Roll {s.rollNumber}</span> : null}
            </div>
          ))}
        </div>
      ) : <NoRows icon="users">No students are enrolled in this section yet.</NoRows>}
    </div>
  );
}

/** The decoration in the page header. Purely ornamental — no data, no links. */
export const HeroArt = () => (
  <svg className="tsec-art" viewBox="0 0 132 78" aria-hidden="true" focusable="false">
    <ellipse cx="66" cy="72" rx="58" ry="6" fill="currentColor" opacity=".08" />
    <rect x="14" y="46" width="52" height="9" rx="2.5" fill="currentColor" opacity=".55" />
    <rect x="18" y="37" width="44" height="9" rx="2.5" fill="currentColor" opacity=".35" />
    <rect x="22" y="28" width="36" height="9" rx="2.5" fill="currentColor" opacity=".2" />
    <rect x="12" y="55" width="56" height="11" rx="3" fill="currentColor" opacity=".7" />
    <path d="M96 66V44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity=".5" />
    <path d="M96 48c-9 0-13-6-12-14 8-1 13 4 12 14Z" fill="currentColor" opacity=".38" />
    <path d="M96 40c8-1 12-7 10-15-8 0-12 6-10 15Z" fill="currentColor" opacity=".28" />
    <path d="M86 66h20l-2 10H88l-2-10Z" fill="currentColor" opacity=".5" />
    <path d="M118 22l6 4-16 26-7 2 1-7 16-25Z" fill="currentColor" opacity=".3" />
  </svg>
);
