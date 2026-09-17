/**
 * Take — or correct — one section's register for one day.
 *
 * Opens on today with nothing picked, or on a given section and date when it is
 * reached from a row or the activity feed. Only marks that differ from what is
 * saved are sent, so correcting one student does not re-announce the rest.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getAttendanceRegister, getAttendanceToday, markStudentAttendance } from '../../../api/admin.api';
import { Button, Modal, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Avatar } from '../listParts';
import { DialogHead } from '../leaveParts';
import { EmptyNote, STATUS, fmtDay, fmtTime, plural, todayKey } from '../attendanceParts';

const MARKS = ['present', 'absent', 'late', 'half-day'];
const SHORT = { present: 'P', absent: 'A', late: 'L', 'half-day': 'H' };

export default function MarkAttendanceDialog({ open, initial, onClose, onSaved }) {
  const [date, setDate]       = useState(initial?.date || todayKey());
  const [cls, setCls]         = useState('');
  const [section, setSection] = useState(initial?.section || '');
  // Subject-wise schools keep a register per subject; the server picks the
  // first subject when none is asked for and says which it opened.
  const [subject, setSubject] = useState('');
  const [marks, setMarks]     = useState({});   // studentId → status, edits only
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(initial?.date || todayKey());
    setSection(initial?.section || '');
    setSubject('');
    setCls('');
    setMarks({});
  }, [open, initial]);

  // Class options belong to the academic year holding the chosen date.
  const { meta: optMeta } = useFetch(
    () => (open ? getAttendanceToday({ date, limit: 1 }) : Promise.resolve(null)), [open, date]);
  const classes = optMeta?.classes || [];

  // A section handed in from outside names no class — find it, so both
  // dropdowns show where the register belongs.
  useEffect(() => {
    if (!section || cls || !classes.length) return;
    const owner = classes.find((c) => c.sections.some((s) => s._id === section));
    if (owner) setCls(owner._id);
  }, [section, cls, classes]);

  const { data: reg, loading, error } = useFetch(
    () => (open && section ? getAttendanceRegister({ section, date, subject: subject || undefined }) : Promise.resolve(null)), [open, section, date, subject]);
  useEffect(() => { setMarks({}); }, [section, date, subject]);
  useEffect(() => { if (reg?.subject?._id && reg.subject._id !== subject) setSubject(reg.subject._id); }, [reg]); // eslint-disable-line react-hooks/exhaustive-deps

  const students = reg?.students || [];
  const current = (s) => marks[s._id] ?? s.status ?? null;
  const changes = useMemo(
    () => students.filter((s) => marks[s._id] && marks[s._id] !== s.status),
    [students, marks]);
  const tally = useMemo(() => {
    const t = { present: 0, absent: 0, late: 0, 'half-day': 0, unmarked: 0 };
    students.forEach((s) => { t[current(s) || 'unmarked'] += 1; });
    return t;
  }, [students, marks]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAll = (mark, onlyUnmarked) => setMarks((m) => {
    const next = { ...m };
    students.forEach((s) => { if (!onlyUnmarked || !current(s)) next[s._id] = mark; });
    return next;
  });

  const save = async () => {
    if (!changes.length) return;
    setSaving(true);
    try {
      await markStudentAttendance({
        date,
        subject: reg?.subject?._id || undefined,
        records: changes.map((s) => ({ studentId: s._id, section, status: marks[s._id] })),
      });
      toast.success(`${plural(changes.length, 'mark')} saved for ${reg.section.className} ${reg.section.sectionName}${reg?.subject ? ` · ${reg.subject.name}` : ''}`);
      onSaved?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'Could not save the register'); }
    finally { setSaving(false); }
  };

  const sections = classes.find((c) => c._id === cls)?.sections || [];

  return (
    <Modal open={open} onClose={onClose} maxWidth={760}
      title={<DialogHead icon="checkSquare" title="Mark Attendance" subtitle="Take or correct a section's register for a day." />}
      footer={<>
        <span className="atn-dlgfoot__note">
          {changes.length ? `${plural(changes.length, 'change')} to save` : section ? 'No changes yet' : ''}
        </span>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={saving} disabled={!changes.length} onClick={save}>Save register</Button>
      </>}>
      <div className="atn-regpick">
        <div className="form-group">
          <label className="form-label required" htmlFor="atn-reg-date">Date</label>
          <input id="atn-reg-date" type="date" className="form-control" max={todayKey()} value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label required" htmlFor="atn-reg-class">Class</label>
          <select id="atn-reg-class" className="form-control" value={cls}
            onChange={(e) => { setCls(e.target.value); setSection(''); }}>
            <option value="">Choose a class</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label required" htmlFor="atn-reg-section">Section</label>
          <select id="atn-reg-section" className="form-control" value={section} disabled={!cls}
            onChange={(e) => { setSection(e.target.value); setSubject(''); }}>
            <option value="">Choose a section</option>
            {sections.map((s) => <option key={s._id} value={s._id}>Section {s.sectionName}</option>)}
          </select>
        </div>
      </div>

      {reg?.mode === 'subject' && section && (
        <div className="form-group atn-regsubject">
          <label className="form-label required" htmlFor="atn-reg-subject">Subject register</label>
          <select id="atn-reg-subject" className="form-control" value={reg?.subject?._id || ''}
            onChange={(e) => setSubject(e.target.value)} disabled={!reg?.subjects?.length}>
            {!reg?.subjects?.length && <option value="">No subjects linked to this section</option>}
            {(reg?.subjects || []).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
          </select>
        </div>
      )}
      {!section ? (
        <EmptyNote icon="clipboard" title="Pick a class and section">The register for that day opens here.</EmptyNote>
      ) : loading ? (
        <div className="atn-center"><Spinner /></div>
      ) : error ? (
        <EmptyNote icon="alert" title="The register could not be opened">{error}</EmptyNote>
      ) : (
        <>
          {(reg?.holiday || reg?.sunday) && (
            <div className="atn-callout atn-callout--warn">
              <Icon name="alert" size={17} />
              <span>{fmtDay(date)} is {reg.holiday ? <>a holiday — <b>{reg.holiday}</b></> : 'a Sunday'}. Registers are not usually taken.</span>
            </div>
          )}
          <div className="atn-reghead">
            <span className="atn-reghead__who">
              <b>{reg?.section?.className} {reg?.section?.sectionName}</b>
              <small>
                {reg?.section?.classTeacher ? `Class teacher ${reg.section.classTeacher} · ` : ''}
                {reg?.session
                  ? `Register opened ${fmtTime(reg.session.createdAt)}${reg.session.createdBy ? ` by ${reg.session.createdBy}` : ''}`
                  : 'No register taken yet'}
              </small>
            </span>
            <span className="atn-reghead__tally">
              {MARKS.map((m) => <span key={m} className={`atn-pill atn-pill--${STATUS[m].tone}`}>{tally[m]} {STATUS[m].label}</span>)}
              {tally.unmarked ? <span className="atn-pill atn-pill--muted">{tally.unmarked} not marked</span> : null}
            </span>
          </div>
          {students.length > 0 && (
            <div className="atn-regbulk">
              <button type="button" className="atn-textbtn" onClick={() => setAll('present', true)} disabled={!tally.unmarked}>
                Mark the rest present
              </button>
              <button type="button" className="atn-textbtn" onClick={() => setAll('present', false)}>Everyone present</button>
              {changes.length > 0 && <button type="button" className="atn-textbtn" onClick={() => setMarks({})}>Undo changes</button>}
            </div>
          )}
          {students.length === 0 ? (
            <EmptyNote icon="users" title="No students in this section">Place students in the section first.</EmptyNote>
          ) : (
            <ul className="atn-reglist">
              {students.map((s) => {
                const now = current(s);
                const edited = marks[s._id] && marks[s._id] !== s.status;
                return (
                  <li key={s._id} className={edited ? 'is-edited' : ''}>
                    <span className="atn-reglist__roll">{s.rollNumber || '—'}</span>
                    <Avatar name={s.name} src={s.photo} size={32} />
                    <span className="atn-reglist__name">
                      <b>{s.name}</b>
                      {edited ? <small>was {s.status ? STATUS[s.status].label.toLowerCase() : 'not marked'}</small> : null}
                    </span>
                    <span className="atn-pm" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                      {MARKS.map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={now === m} title={STATUS[m].label}
                          className={`atn-pm__btn atn-pm__btn--${STATUS[m].tone}${now === m ? ' is-on' : ''}`}
                          onClick={() => setMarks((x) => ({ ...x, [s._id]: m }))}>
                          {SHORT[m]}<span className="sr-only"> {STATUS[m].label}</span>
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
