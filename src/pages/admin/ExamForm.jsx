/**
 * Create / edit an aptitude exam — the admin's and the teacher's.
 *
 * One exam can be set for several classes and sections at once. Sections are
 * picked by class — tick the class for all of its sections, or pick them one
 * by one — and the dialog says how many students that reaches before saving.
 *
 * When the server sends a restricted scope (`meta.restricted`, a teacher), the
 * subject is chosen FIRST and the picker only offers the sections where that
 * teacher may set that subject: any subject in a section they are class teacher
 * or vice class teacher of, and only their own subjects elsewhere. The server
 * applies the same rule again on save (services/examPermissions.js).
 *
 * An exam is always saved as a draft; questions and publishing come after.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';

const BLANK = {
  title: '', subjectId: '', sectionIds: [], examDate: '', startTime: '10:00',
  duration: 60, totalQuestions: 10, totalMarks: 10, maxViolations: 3,
};

const toForm = (exam) => (exam ? {
  title: exam.title || '',
  subjectId: exam.subject?._id || exam.subject || '',
  sectionIds: (exam.sections || []).map((s) => String(s._id || s)),
  examDate: exam.examDate ? new Date(exam.examDate).toISOString().slice(0, 10) : '',
  startTime: exam.startTime || '10:00',
  duration: exam.duration ?? 60,
  totalQuestions: exam.totalQuestions ?? 10,
  totalMarks: exam.totalMarks ?? 10,
  maxViolations: exam.maxViolations ?? 3,
} : BLANK);

/** Today in the browser's calendar, as the date input spells it. */
const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function ExamForm({ open, editing, meta, metaLoading, saving, onClose, onSave }) {
  const [form, setForm] = useState(BLANK);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setForm(toForm(editing)); setTouched(false); }
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const classes = meta?.classes || [];
  const chosen = useMemo(() => new Set(form.sectionIds), [form.sectionIds]);

  // ── What this person may set, section by section ─────────────────────────
  const restricted = !!meta?.restricted;
  const allows = (s) => !restricted || (form.subjectId ? (s.subjectIds || []).includes(form.subjectId) : !!s.general);
  const whyNot = (s, cls) => {
    if (!restricted || allows(s)) return null;
    const subjectName = (meta?.subjects || []).find((x) => x._id === form.subjectId)?.subjectName;
    return form.subjectId
      ? `You can't set ${subjectName || 'this subject'} in ${cls.className} – ${s.sectionName}${s.role === 'subject_teacher' ? ` — you teach ${(s.teaches || []).map((id) => (meta.subjects.find((x) => x._id === id) || {}).subjectName).filter(Boolean).join(', ')} there` : ''}`
      : `A General Aptitude exam can only be set for a section you are class teacher or vice class teacher of — you are a subject teacher in ${cls.className} – ${s.sectionName}`;
  };
  // Only a class or vice class teacher can set an exam with no subject.
  const canGeneral = !restricted || classes.some((c) => c.sections.some((x) => x.general));

  // Changing the subject drops the sections that subject can no longer go to.
  useEffect(() => {
    if (!restricted || !open) return;
    const keep = classes.flatMap((c) => c.sections.filter(allows).map((s) => String(s._id)));
    setForm((f) => (f.sectionIds.every((id) => keep.includes(id)) ? f : { ...f, sectionIds: f.sectionIds.filter((id) => keep.includes(id)) }));
  }, [form.subjectId, restricted, open, classes]); // eslint-disable-line react-hooks/exhaustive-deps

  // A subject teacher has no General option, so start them on their first subject.
  useEffect(() => {
    if (open && restricted && !canGeneral && !form.subjectId && meta?.subjects?.length) {
      setForm((f) => ({ ...f, subjectId: meta.subjects[0]._id }));
    }
  }, [open, restricted, canGeneral, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = (id) => setForm((f) => ({
    ...f,
    sectionIds: chosen.has(id) ? f.sectionIds.filter((x) => x !== id) : [...f.sectionIds, id],
  }));

  const toggleClass = (cls) => {
    const ids = cls.sections.filter(allows).map((s) => String(s._id));
    if (!ids.length) return;
    const all = ids.every((id) => chosen.has(id));
    setForm((f) => ({
      ...f,
      sectionIds: all ? f.sectionIds.filter((x) => !ids.includes(x)) : [...new Set([...f.sectionIds, ...ids])],
    }));
  };

  // Sections carried by an exam from another year are not in this year's
  // picker. Say so rather than silently dropping them on save.
  const known = useMemo(() => new Set(classes.flatMap((c) => c.sections.map((s) => String(s._id)))), [classes]);
  const stray = form.sectionIds.filter((id) => !known.has(id));

  const reach = useMemo(() => {
    let sections = 0; let students = 0;
    for (const c of classes) for (const s of c.sections) {
      if (chosen.has(String(s._id))) { sections += 1; students += s.students || 0; }
    }
    return { sections, students };
  }, [classes, chosen]);

  const problems = [];
  if (!form.title.trim()) problems.push('Give the exam a title');
  if (!form.sectionIds.length || stray.length === form.sectionIds.length) problems.push('Choose at least one section');
  if (restricted && !form.subjectId && !canGeneral) problems.push('Choose a subject — you can only set General Aptitude exams for a class you are class teacher of');
  if (!form.examDate) problems.push('Pick the exam date');
  if (!form.startTime) problems.push('Pick the start time');
  if (!(Number(form.duration) >= 1)) problems.push('Duration must be at least 1 minute');
  if (!(Number(form.totalQuestions) >= 1)) problems.push('Total questions must be at least 1');
  if (!(Number(form.totalMarks) >= 1)) problems.push('Total marks must be at least 1');

  // Same rule the server enforces: the slot must still be ahead.
  const past = form.examDate && form.startTime
    && new Date(`${form.examDate}T${form.startTime}:00`).getTime() + Number(form.duration || 0) * 60000 <= Date.now();
  if (past) problems.push('That date and time have already passed');

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (problems.length) return;
    onSave({
      title: form.title.trim(),
      subjectId: form.subjectId || null,
      sectionIds: form.sectionIds.filter((id) => known.has(id)),
      examDate: form.examDate,
      startTime: form.startTime,
      duration: Number(form.duration),
      totalQuestions: Number(form.totalQuestions),
      totalMarks: Number(form.totalMarks),
      maxViolations: Number(form.maxViolations) || 3,
    });
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={780}
      title={
        <span className="apxdlg__head">
          <span className="apxdlg__mark"><Icon name={editing ? 'pencil' : 'plus'} size={20} /></span>
          <span>
            {editing ? 'Edit Exam' : 'Create Exam'}
            <small>{editing ? 'Changes apply to this draft only.' : 'Saved as a draft — add questions, then publish.'}</small>
          </span>
        </span>
      }
      footer={
        <>
          {touched && problems.length > 0 && <span className="apxdlg__err">{problems[0]}</span>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button form="apx-exam-form" type="submit" loading={saving}>
            {editing ? 'Save changes' : 'Create draft'}
          </Button>
        </>
      }>
      <form id="apx-exam-form" className="apxform" onSubmit={submit} noValidate>
        <section className="apxform__step">
          <h4><span>1</span> Exam details</h4>
          <div className="form-group">
            <label className="form-label required" htmlFor="apx-title">Title</label>
            <input id="apx-title" className="form-control" maxLength={200} value={form.title} onChange={set('title')}
              placeholder="e.g. Logical Reasoning Assessment" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="apx-subject">Subject</label>
            <select id="apx-subject" className="form-control" value={form.subjectId} onChange={set('subjectId')}>
              {canGeneral && <option value="">General Aptitude (no subject)</option>}
              {(meta?.subjects || []).map((s) => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
            </select>
            {restricted && (
              <p className="apxform__hint">
                {canGeneral
                  ? 'Any subject in a class you are class teacher or vice class teacher of; elsewhere, only the subjects you teach.'
                  : 'You can set exams for the subjects you are assigned to teach.'}
              </p>
            )}
          </div>
        </section>

        <section className="apxform__step">
          <h4>
            <span>2</span> Who sits it
            <small className="apxform__reach">
              {reach.sections
                ? `${reach.sections} section${reach.sections === 1 ? '' : 's'} · ${reach.students} student${reach.students === 1 ? '' : 's'}`
                : 'No sections chosen'}
            </small>
          </h4>
          {metaLoading
            ? <div className="apxloading apxloading--sm"><Spinner /></div>
            : classes.length === 0
              ? (
                <p className="apxnone">
                  {restricted
                    ? `You are not a class teacher, vice class teacher or subject teacher of any section in ${meta?.academicYear?.name || 'this academic year'}, so you cannot set exams. Ask your school admin to assign you.`
                    : `No classes with sections in ${meta?.academicYear?.name || 'the active academic year'}.`}
                </p>
              )
              : (
                <div className="apxpick">
                  {classes.map((c) => {
                    const open_ = c.sections.filter(allows).map((s) => String(s._id));
                    const n = open_.filter((id) => chosen.has(id)).length;
                    return (
                      <div key={c._id} className={`apxpick__row${n ? ' is-on' : ''}${open_.length ? '' : ' is-off'}`}>
                        <label className="apxpick__class">
                          <input type="checkbox" checked={open_.length > 0 && n === open_.length} disabled={!open_.length}
                            ref={(el) => { if (el) el.indeterminate = n > 0 && n < open_.length; }}
                            onChange={() => toggleClass(c)} />
                          <span>{c.className}</span>
                        </label>
                        <div className="apxpick__secs">
                          {c.sections.map((s) => {
                            const on = chosen.has(String(s._id));
                            const blocked = whyNot(s, c);
                            return (
                              <button key={s._id} type="button" className={`apxpick__sec${on ? ' is-on' : ''}`}
                                aria-pressed={on} disabled={!!blocked} onClick={() => toggleSection(String(s._id))}
                                title={blocked || `${c.className} – ${s.sectionName}: ${s.students} student${s.students === 1 ? '' : 's'}${s.roleLabel ? ` · ${s.roleLabel}` : ''}`}>
                                {on && <Icon name="checkCircle" size={13} />}
                                {s.sectionName}
                                <small>{s.students}</small>
                                {s.role && s.role !== 'subject_teacher' && <em className="apxpick__role">{s.role === 'class_teacher' ? 'CT' : 'VCT'}</em>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          {stray.length > 0 && (
            <p className="apxwarn">
              <Icon name="alert" size={15} />
              {stray.length} section{stray.length === 1 ? ' is' : 's are'} from another academic year and will be removed on save.
            </p>
          )}
        </section>

        <section className="apxform__step">
          <h4><span>3</span> Schedule</h4>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label required" htmlFor="apx-date">Date</label>
              <input id="apx-date" type="date" className="form-control" min={todayInput()} value={form.examDate} onChange={set('examDate')} />
            </div>
            <div className="form-group">
              <label className="form-label required" htmlFor="apx-time">Start time</label>
              <input id="apx-time" type="time" className="form-control" value={form.startTime} onChange={set('startTime')} />
            </div>
            <div className="form-group">
              <label className="form-label required" htmlFor="apx-dur">Duration (minutes)</label>
              <input id="apx-dur" type="number" min="1" max="600" step="1" className="form-control" value={form.duration} onChange={set('duration')} />
            </div>
          </div>
        </section>

        <section className="apxform__step">
          <h4><span>4</span> Paper</h4>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label required" htmlFor="apx-q">Total questions</label>
              <input id="apx-q" type="number" min="1" max="500" step="1" className="form-control" value={form.totalQuestions} onChange={set('totalQuestions')} />
            </div>
            <div className="form-group">
              <label className="form-label required" htmlFor="apx-m">Total marks</label>
              <input id="apx-m" type="number" min="1" step="1" className="form-control" value={form.totalMarks} onChange={set('totalMarks')} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="apx-v">Allowed tab switches</label>
              <input id="apx-v" type="number" min="1" max="20" step="1" className="form-control" value={form.maxViolations} onChange={set('maxViolations')} />
            </div>
          </div>
          <p className="apxform__hint">
            To publish, the exam needs exactly {Number(form.totalQuestions) || 0} questions whose marks add up
            to {Number(form.totalMarks) || 0}. A student is auto-submitted once they leave the exam window that
            many times.
          </p>
        </section>
      </form>
    </Modal>
  );
}
