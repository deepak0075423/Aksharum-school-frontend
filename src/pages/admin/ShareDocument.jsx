/**
 * Share a document — the office's upload form.
 *
 * The same four questions the teacher's form asks (what is it / who gets it /
 * how is it filed / what is attached) so the two read as one product, but the
 * second question is a different job: a teacher picks from the two or three
 * sections they stand in front of, an administrator is aiming at a whole
 * school. So the audience is chosen in two steps — how wide, then which — and
 * the form says out loud how far the choice reaches before it is sent.
 *
 * It also carries the two things the office can set and a teacher cannot: the
 * kind of assignment, and the question breakdown a mark is made of. Nothing
 * else could write `questions`, which is why the analytics tab has been telling
 * people to "add questions to the assignment" with nowhere to do it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/ui/icons';
import { Button, Modal } from '../../components/ui/index';
import { Avatar, FileDrop, KeptFiles } from '../documents/viewerParts';
import { DOC_TYPES } from './documentParts';
import { ASSIGNMENT_TYPES } from './assignmentParts';

const TYPE_ICON = {
  notice: 'megaphone', circular: 'files', study_material: 'bookOpen',
  assignment: 'clipboard', other: 'folder',
};
const TYPE_HINT = {
  notice: 'Something to read',   circular: 'Goes on the record',
  study_material: 'To learn from', assignment: 'Work to hand in',
  other: 'Anything else',
};

/** How wide it goes. The picker under it depends entirely on this. */
const AUDIENCES = [
  { value: 'whole_school', icon: 'school', label: 'Whole school',
    hint: 'Every student, parent and teacher' },
  { value: 'class',        icon: 'layers', label: 'Whole classes',
    hint: 'Every section of the classes you pick' },
  { value: 'class_sections', icon: 'grid', label: 'Specific sections',
    hint: 'Only the sections you pick' },
  { value: 'all_teachers', icon: 'users',  label: 'All teachers',
    hint: 'Staff only — no students' },
  { value: 'specific_teachers', icon: 'user', label: 'Specific teachers',
    hint: 'By department, subject or designation' },
];

/** What a file-less assignment is told, in the form and by the server alike. */
const NEEDS_FILE = 'Attach the assignment or its instructions — students need a file to work from';

/** The distinct values of one field across the staff, A–Z, for a filter dropdown. */
const optionsOf = (teachers, pick) => [...new Set(teachers.flatMap(pick).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b));

export const EMPTY = {
  title: '', description: '', docType: 'notice', category: '', subject: '',
  targetType: 'whole_school', classIds: [], sectionIds: [], teacherIds: [],
  isAssignment: false, allowSubmission: true, assignmentType: 'homework',
  dueDate: '', totalMarks: '', questions: [],
};

/** The form's own state, prefilled from a document when one is being edited. */
export function formFor(doc) {
  if (!doc) return { ...EMPTY };
  return {
    title: doc.title || '',
    description: doc.description || '',
    docType: doc.docType || 'notice',
    category: doc.category || '',
    subject: doc.subject || '',
    targetType: doc.targetType || 'whole_school',
    classIds:   (doc.targetClasses  || []).map((c) => String(c._id || c)),
    sectionIds: (doc.targetSections || []).map((s) => String(s._id || s)),
    teacherIds: (doc.targetUsers    || []).map((u) => String(u._id || u)),
    isAssignment: !!doc.isAssignment,
    allowSubmission: doc.allowSubmission !== false,
    assignmentType: doc.assignmentType || 'homework',
    dueDate: doc.dueDate ? String(doc.dueDate).slice(0, 10) : '',
    totalMarks: doc.totalMarks == null ? '' : String(doc.totalMarks),
    questions: (doc.questions || []).map((q) => ({
      label: q.label, maxMarks: q.maxMarks == null ? '' : String(q.maxMarks),
    })),
  };
}

const Block = ({ step, title, hint, children }) => (
  <section className="shblock">
    <header>
      <span className="shblock__step">{step}</span>
      <div>
        <h4>{title}</h4>
        {hint ? <p>{hint}</p> : null}
      </div>
    </header>
    <div className="shblock__body">{children}</div>
  </section>
);

const Err = ({ children }) => (children ? <p className="sherr"><Icon name="alert" size={13} />{children}</p> : null);

export default function ShareDocument({
  open, editing, classes, teachers = [], categories, saving, onClose, onSave, onManageCategories,
}) {
  const [form,  setForm]  = useState(EMPTY);
  const [files, setFiles] = useState([]);
  // The files already on the document being edited that are staying. New
  // ones are added to these; each can be taken off on its own.
  const [kept,  setKept]  = useState([]);
  const [tried, setTried] = useState(false);
  const [find,  setFind]  = useState('');
  // The three things a teacher is picked by. They narrow the list; what is
  // sent is the teachers ticked.
  const [by, setBy] = useState({ department: '', subject: '', designation: '' });

  useEffect(() => {
    if (!open) return;
    setForm(formFor(editing));
    setFiles([]);
    setKept(editing?.files || []);
    setTried(false);
    setFind('');
    setBy({ department: '', subject: '', designation: '' });
  }, [open, editing?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // ── The audience ───────────────────────────────────────────────────────────
  const term = find.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!term) return classes;
    return classes
      .map((c) => ({
        ...c,
        sections: (c.sections || []).filter(
          (s) => `${c.className} ${s.sectionName}`.toLowerCase().includes(term),
        ),
      }))
      .filter((c) => c.className?.toLowerCase().includes(term) || c.sections.length);
  }, [classes, term]);

  // ── Specific teachers ──────────────────────────────────────────────────────
  const departments  = useMemo(() => optionsOf(teachers, (t) => [t.department]),  [teachers]);
  const subjects     = useMemo(() => optionsOf(teachers, (t) => t.subjects || []), [teachers]);
  const designations = useMemo(() => optionsOf(teachers, (t) => [t.designation]), [teachers]);

  const shownTeachers = useMemo(() => teachers.filter((t) => {
    if (by.department  && t.department  !== by.department)  return false;
    if (by.designation && t.designation !== by.designation) return false;
    if (by.subject     && !(t.subjects || []).includes(by.subject)) return false;
    if (term && !`${t.name} ${t.department} ${t.designation} ${(t.subjects || []).join(' ')}`
      .toLowerCase().includes(term)) return false;
    return true;
  }), [teachers, by, term]);

  const narrowed = !!(by.department || by.subject || by.designation || term);
  const shownIds = shownTeachers.map((t) => t._id);
  const allShownOn = shownIds.length > 0 && shownIds.every((id) => form.teacherIds.includes(id));

  /** Everyone the filters leave on screen, on or off together. */
  const toggleShownTeachers = () => set({
    teacherIds: allShownOn
      ? form.teacherIds.filter((id) => !shownIds.includes(id))
      : [...new Set([...form.teacherIds, ...shownIds])],
  });

  const toggle = (key, id) => set({
    [key]: form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id],
  });

  /** Every section of one class, on or off together — the row's own shortcut. */
  const toggleWholeClass = (c) => {
    const mine = (c.sections || []).map((s) => s._id);
    const all  = mine.every((id) => form.sectionIds.includes(id));
    set({
      sectionIds: all
        ? form.sectionIds.filter((id) => !mine.includes(id))
        : [...new Set([...form.sectionIds, ...mine])],
    });
  };

  /** How far this actually reaches, in a sentence. */
  const reach = useMemo(() => {
    if (form.targetType === 'whole_school') return 'Everyone in the school';
    if (form.targetType === 'all_teachers') return 'Every teacher';
    if (form.targetType === 'specific_teachers') {
      const n = form.teacherIds.length;
      return n ? `${n} teacher${n === 1 ? '' : 's'}` : null;
    }
    if (form.targetType === 'class') {
      const n = form.classIds.length;
      const secs = classes
        .filter((c) => form.classIds.includes(c._id))
        .reduce((t, c) => t + (c.sections?.length || 0), 0);
      return n ? `${n} class${n === 1 ? '' : 'es'} · ${secs} section${secs === 1 ? '' : 's'}` : null;
    }
    const n = form.sectionIds.length;
    const inClasses = classes.filter((c) => (c.sections || []).some((s) => form.sectionIds.includes(s._id))).length;
    return n ? `${n} section${n === 1 ? '' : 's'} across ${inClasses} class${inClasses === 1 ? '' : 'es'}` : null;
  }, [form.targetType, form.classIds, form.sectionIds, form.teacherIds, classes]);

  // ── The question breakdown ─────────────────────────────────────────────────
  const qTotal = form.questions.reduce((n, q) => n + (Number(q.maxMarks) || 0), 0);
  const outOf  = Number(form.totalMarks) || 0;

  const addQuestion = () => set({
    questions: [...form.questions, { label: `Q${form.questions.length + 1}`, maxMarks: '' }],
  });
  const setQuestion = (i, patch) => set({
    questions: form.questions.map((q, x) => (x === i ? { ...q, ...patch } : q)),
  });
  const dropQuestion = (i) => set({ questions: form.questions.filter((_, x) => x !== i) });

  // ── Validation ─────────────────────────────────────────────────────────────
  const errors = useMemo(() => {
    const e = {};
    if (!form.title.trim()) e.title = 'Give it a title';
    if (!form.category)     e.category = 'Pick a category';
    if (form.targetType === 'class'          && !form.classIds.length)   e.audience = 'Pick at least one class';
    if (form.targetType === 'class_sections' && !form.sectionIds.length) e.audience = 'Pick at least one section';
    if (form.targetType === 'specific_teachers' && !form.teacherIds.length) e.audience = 'Pick at least one teacher';
    if (form.isAssignment) {
      // Work that is handed in needs the paper it is handed in against. Files
      // already on the document count, for as long as they are not removed.
      if (!files.length && !kept.length) e.files = NEEDS_FILE;
      if (form.totalMarks && Number(form.totalMarks) <= 0) e.totalMarks = 'Marks must be more than zero';
      if (form.dueDate && new Date(form.dueDate) < new Date(new Date().toDateString())) {
        e.dueDate = 'That date has already passed';
      }
      const labels = form.questions.map((q) => q.label.trim().toLowerCase());
      if (form.questions.some((q) => !q.label.trim())) e.questions = 'Every question needs a name';
      else if (new Set(labels).size !== labels.length)  e.questions = 'Two questions share a name';
    }
    return e;
  }, [form, files, kept]);

  const bad  = Object.keys(errors).length > 0;
  const show = (k) => (tried ? errors[k] : null);

  const submit = () => {
    setTried(true);
    if (bad) return;
    onSave(form, files, kept);
  };

  const kind = DOC_TYPES.find((t) => t.value === form.docType);
  const picking = form.targetType === 'class' || form.targetType === 'class_sections';

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={760}
      title={editing ? 'Edit document' : 'Share a document'}
      footer={<>
        <span className="shsummary">
          {reach
            ? <><Icon name="checkCircle" size={14} /> {kind?.label} · {reach}</>
            : <><Icon name="info" size={14} /> Nobody selected yet</>}
        </span>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        {/* A missing file is the one error that holds the button back: the
            others are fixed by typing, this one by going to find something. */}
        <Button onClick={submit} loading={saving} disabled={saving || !!errors.files}
          title={errors.files || undefined}>
          {editing ? 'Save changes' : 'Share it'}
        </Button>
      </>}
    >
      <div className="shform">
        <Block step="1" title="What is it?" hint="This decides what the rest of the form asks for.">
          <div className="shtypes" role="radiogroup" aria-label="Kind of document">
            {DOC_TYPES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={form.docType === t.value}
                className={`shtype${form.docType === t.value ? ' is-on' : ''}`}
                onClick={() => set({
                  docType: t.value,
                  isAssignment: t.value === 'assignment'
                    ? true
                    : form.isAssignment && t.value !== 'notice' && t.value !== 'circular',
                })}>
                <span className={`shtype__icon tint-${t.tone}`}><Icon name={TYPE_ICON[t.value]} size={18} /></span>
                <b>{t.label}</b>
                <small>{TYPE_HINT[t.value]}</small>
              </button>
            ))}
          </div>

          <div className="form-group">
            <label className="form-label required" htmlFor="ad-title">Title</label>
            <input id="ad-title" className={`form-control${show('title') ? ' is-bad' : ''}`}
              autoFocus maxLength={160} value={form.title}
              placeholder="e.g. Holiday Circular — Gandhi Jayanti"
              onChange={(e) => set({ title: e.target.value })} />
            <Err>{show('title')}</Err>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="ad-desc">Description</label>
            <textarea id="ad-desc" className="form-control" rows={2} maxLength={300}
              value={form.description} placeholder="One line about what this is and what to do with it"
              onChange={(e) => set({ description: e.target.value })} />
            <div className="form-hint">{300 - form.description.length} characters left</div>
          </div>
        </Block>

        <Block step="2" title="Who gets it?" hint="How wide first, then exactly which.">
          <div className="shaud" role="radiogroup" aria-label="Audience">
            {AUDIENCES.map((a) => (
              <button key={a.value} type="button" role="radio" aria-checked={form.targetType === a.value}
                className={`shaud__btn${form.targetType === a.value ? ' is-on' : ''}`}
                onClick={() => { set({ targetType: a.value, classIds: [], sectionIds: [], teacherIds: [] }); setFind(''); }}>
                <Icon name={a.icon} size={17} />
                <span><b>{a.label}</b><small>{a.hint}</small></span>
              </button>
            ))}
          </div>

          {picking && (
            <div className={`shpick${show('audience') ? ' is-bad' : ''}`}>
              <div className="shpick__bar">
                <div className="shpick__find">
                  <Icon name="search" size={15} />
                  <input className="form-control" value={find} placeholder="Find a class or section…"
                    onChange={(e) => setFind(e.target.value)} aria-label="Find a class or section" />
                </div>
                <button type="button" className="shlink"
                  onClick={() => {
                    if (form.targetType === 'class') {
                      const all = shown.map((c) => c._id);
                      set({ classIds: form.classIds.length === all.length ? [] : all });
                    } else {
                      const all = shown.flatMap((c) => (c.sections || []).map((s) => s._id));
                      set({ sectionIds: form.sectionIds.length === all.length ? [] : all });
                    }
                  }}>
                  Select all{term ? ' shown' : ''}
                </button>
              </div>

              {!shown.length && <p className="shnone">Nothing matches “{find}”.</p>}

              {form.targetType === 'class' ? (
                <div className="shsections">
                  {shown.map((c) => {
                    const on = form.classIds.includes(c._id);
                    return (
                      <button key={c._id} type="button" aria-pressed={on}
                        className={`shchip${on ? ' is-on' : ''}`} onClick={() => toggle('classIds', c._id)}>
                        <Icon name={on ? 'checkCircle' : 'layers'} size={15} />
                        {c.className}
                        <em>{c.sections?.length || 0}</em>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="shrows">
                  {shown.filter((c) => c.sections?.length).map((c) => {
                    const mine = c.sections.map((s) => s._id);
                    const all  = mine.every((id) => form.sectionIds.includes(id));
                    const some = !all && mine.some((id) => form.sectionIds.includes(id));
                    return (
                      <div className="shrow2" key={c._id}>
                        <button type="button" className={`shrow2__head${all ? ' is-on' : some ? ' is-part' : ''}`}
                          onClick={() => toggleWholeClass(c)} aria-pressed={all}>
                          <Icon name={all ? 'checkCircle' : some ? 'alert' : 'layers'} size={15} />
                          {c.className}
                          <small>{all ? 'all sections' : some ? 'some' : 'none'}</small>
                        </button>
                        <div className="shrow2__secs">
                          {c.sections.map((s) => {
                            const on = form.sectionIds.includes(s._id);
                            return (
                              <button key={s._id} type="button" aria-pressed={on}
                                className={`shchip shchip--sm${on ? ' is-on' : ''}`}
                                onClick={() => toggle('sectionIds', s._id)}>
                                {s.sectionName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {form.targetType === 'specific_teachers' && (
            <div className={`shpick${show('audience') ? ' is-bad' : ''}`}>
              <div className="shfilters">
                {[
                  ['department',  'All departments',  departments],
                  ['subject',     'All subjects',     subjects],
                  ['designation', 'All designations', designations],
                ].map(([key, all, options]) => (
                  <select key={key} className={`form-control${by[key] ? ' is-on' : ''}`} value={by[key]}
                    aria-label={`Filter teachers by ${key}`} disabled={!options.length}
                    onChange={(e) => setBy((v) => ({ ...v, [key]: e.target.value }))}>
                    <option value="">{all}</option>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ))}
              </div>

              <div className="shpick__bar">
                <div className="shpick__find">
                  <Icon name="search" size={15} />
                  <input className="form-control" value={find} placeholder="Find a teacher…"
                    onChange={(e) => setFind(e.target.value)} aria-label="Find a teacher" />
                </div>
                <button type="button" className="shlink" onClick={toggleShownTeachers}
                  disabled={!shownIds.length}>
                  {allShownOn ? 'Clear' : 'Select'} all{narrowed ? ` ${shownIds.length} shown` : ''}
                </button>
              </div>

              {!teachers.length && <p className="shnone">There are no teachers on record yet.</p>}
              {teachers.length > 0 && !shownTeachers.length && (
                <p className="shnone">No teacher matches these filters.</p>
              )}

              <div className="shpeople">
                {shownTeachers.map((t) => {
                  const on = form.teacherIds.includes(t._id);
                  const about = [t.designation, t.department, (t.subjects || []).join(', ')].filter(Boolean).join(' · ');
                  return (
                    <button key={t._id} type="button" aria-pressed={on}
                      className={`shperson${on ? ' is-on' : ''}`} onClick={() => toggle('teacherIds', t._id)}>
                      <Avatar name={t.name} src={t.photo} size={30} />
                      <span className="shperson__text">
                        <b>{t.name}</b>
                        <small>{about || 'No department, subject or designation on record'}</small>
                      </span>
                      <Icon name={on ? 'checkCircle' : 'plus'} size={16} />
                    </button>
                  );
                })}
              </div>

              {/* People ticked under a filter that has since changed are still
                  going to get it — say so, or they are sent to unseen. */}
              {form.teacherIds.some((id) => !shownIds.includes(id)) && (
                <p className="shpick__note">
                  {form.teacherIds.filter((id) => !shownIds.includes(id)).length} selected teacher(s) are hidden by the filters above.
                  <button type="button" className="shlink" onClick={() => set({ teacherIds: [] })}>Clear selection</button>
                </p>
              )}
            </div>
          )}

          <Err>{show('audience')}</Err>

          {reach && (
            <p className="shreach">
              <Icon name="users" size={14} /> Reaches <b>{reach}</b>
            </p>
          )}
        </Block>

        <Block step="3" title="How should it be filed?"
          hint="The category is your school's own label; the subject is optional.">
          <div className="shrow">
            <div className="form-group">
              <label className="form-label required" htmlFor="ad-cat">Category</label>
              <select id="ad-cat" className={`form-control${show('category') ? ' is-bad' : ''}`}
                value={form.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">— Select —</option>
                {categories.map((c) => <option key={c.name ?? c} value={c.name ?? c}>{c.name ?? c}</option>)}
              </select>
              <div className="form-hint">
                <button type="button" className="shlink" onClick={onManageCategories}>Manage categories</button>
              </div>
              <Err>{show('category')}</Err>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ad-subject">Subject</label>
              <input data-text="title" id="ad-subject" className="form-control" maxLength={60} value={form.subject}
                placeholder="e.g. Mathematics" onChange={(e) => set({ subject: e.target.value })} />
            </div>
          </div>

          <label className="shtoggle">
            <input type="checkbox" checked={form.isAssignment}
              onChange={(e) => set({
                isAssignment: e.target.checked,
                docType: e.target.checked
                  ? 'assignment'
                  : (form.docType === 'assignment' ? 'other' : form.docType),
              })} />
            <span>
              <b>Students hand work in against this</b>
              <small>Turns it into an assignment with a submissions list and marking.</small>
            </span>
          </label>

          {form.isAssignment && (
            <div className="shassign">
              <div className="shrow shrow--3">
                <div className="form-group">
                  <label className="form-label" htmlFor="ad-kind">Kind of work</label>
                  <select id="ad-kind" className="form-control" value={form.assignmentType}
                    onChange={(e) => set({ assignmentType: e.target.value })}>
                    {ASSIGNMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="ad-due">Due date</label>
                  <input id="ad-due" type="date" className={`form-control${show('dueDate') ? ' is-bad' : ''}`}
                    value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
                  <Err>{show('dueDate')}</Err>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="ad-marks">Out of</label>
                  <input step="any" id="ad-marks" type="number" min="1"
                    className={`form-control${show('totalMarks') ? ' is-bad' : ''}`}
                    value={form.totalMarks} placeholder="e.g. 50"
                    onChange={(e) => set({ totalMarks: e.target.value })} />
                  <Err>{show('totalMarks')}</Err>
                </div>
              </div>

              {/* Optional, and the only place it can be set. Without questions an
                  assignment is marked as one number, which is most of them; with
                  them, the analytics tab can say which question the class lost
                  marks on. */}
              <div className="shq">
                <header>
                  <div>
                    <b>Break the marks down by question</b>
                    <small>Optional. Marking then asks for a score per question.</small>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addQuestion}>
                    <Icon name="plus" size={14} /> Add question
                  </button>
                </header>

                {form.questions.length > 0 && (
                  <>
                    <ul className="shq__list">
                      {form.questions.map((q, i) => (
                        <li key={i}>
                          <input data-text="title" className="form-control" maxLength={20} value={q.label}
                            aria-label={`Question ${i + 1} name`} placeholder={`Q${i + 1}`}
                            onChange={(e) => setQuestion(i, { label: e.target.value })} />
                          <input step="any" className="form-control" type="number" min="0" value={q.maxMarks}
                            aria-label={`Question ${i + 1} marks`} placeholder="Marks"
                            onChange={(e) => setQuestion(i, { maxMarks: e.target.value })} />
                          <button type="button" className="dvact" onClick={() => dropQuestion(i)}
                            title={`Remove ${q.label || `question ${i + 1}`}`}
                            aria-label={`Remove ${q.label || `question ${i + 1}`}`}>
                            <Icon name="close" size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className={`shq__sum${outOf && qTotal !== outOf ? ' is-off' : ''}`}>
                      {qTotal} across {form.questions.length} question{form.questions.length === 1 ? '' : 's'}
                      {outOf ? ` · out of ${outOf}` : ''}
                      {/* Said, not enforced: a paper marked out of 50 with 45 in
                          named questions and 5 for presentation is a real paper. */}
                      {outOf && qTotal !== outOf
                        ? <em>{qTotal > outOf ? 'more' : 'less'} than the total above</em>
                        : null}
                    </p>
                  </>
                )}
                <Err>{show('questions')}</Err>
              </div>

              <label className="shtoggle shtoggle--sub">
                <input type="checkbox" checked={form.allowSubmission}
                  onChange={(e) => set({ allowSubmission: e.target.checked })} />
                <span>
                  <b>Accept submissions</b>
                  <small>Turn this off to close it without deleting anything already handed in.</small>
                </span>
              </label>
            </div>
          )}
        </Block>

        <Block step="4" title="What is attached?"
          hint={form.isAssignment
            ? 'Required for an assignment — the question paper or the instructions students work from.'
            : editing ? 'Add more files, or remove any that are already attached.' : 'Optional — a notice can be all text.'}>
          <KeptFiles files={kept} onRemove={(i) => setKept(kept.filter((_, x) => x !== i))} />
          <FileDrop id="ad-files" files={files} onChange={setFiles} max={Math.max(0, 10 - kept.length)}
            hint={kept.length ? `Add files — ${10 - kept.length} more can go on this document` : 'PDFs, documents, images — up to 10'} />
          {/* Shown straight away, not after a failed save: it is the reason the
              button is held back. */}
          <Err>{errors.files}</Err>

        </Block>
      </div>
    </Modal>
  );
}
