/**
 * Share a document — the teacher's upload form.
 *
 * Rebuilt from a stack of labelled inputs into four questions asked in the
 * order a teacher actually answers them: what is it, who gets it, how is it
 * filed, and what is attached. The kind of document leads because it decides
 * the rest of the form — picking "Assignment" is what makes a due date and a
 * mark out of appear, so it should be the first thing on screen, not a
 * checkbox two thirds of the way down.
 *
 * Three things the old form could not do:
 *   • share with more than one section at once, so a teacher who takes 9-A and
 *     9-B set the same homework twice and then had two piles to mark;
 *   • show what had been attached, or take an attachment back out;
 *   • say what was wrong with a field, rather than a toast naming one problem
 *     at a time.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/ui/icons';
import { Button, Modal } from '../../components/ui/index';
import { FileDrop, FileMark, fmtSize, DOC_TYPES } from '../documents/viewerParts';

const TYPE_ICON = {
  notice: 'megaphone', circular: 'files', study_material: 'bookOpen',
  assignment: 'clipboard', other: 'folder',
};

const TYPE_HINT = {
  notice:         'Something to read',
  circular:       'Goes on the record',
  study_material: 'To learn from',
  assignment:     'Work to hand in',
  other:          'Anything else',
};

export const EMPTY = {
  title: '', description: '', docType: 'notice', category: '', subject: '',
  sectionIds: [], isAssignment: false, allowSubmission: true,
  dueDate: '', totalMarks: '',
};

/** The form's own state, prefilled from a document when one is being edited. */
export function formFor(doc, sections) {
  if (!doc) return { ...EMPTY, sectionIds: sections.length === 1 ? [sections[0]._id] : [] };
  return {
    title: doc.title || '',
    description: doc.description || '',
    docType: doc.docType || 'notice',
    category: doc.category || '',
    subject: doc.subject || '',
    // The document stores whichever sections it went to; only the ones this
    // teacher still teaches are theirs to change, so the rest are left alone by
    // not offering them.
    sectionIds: (doc.targetSections || [])
      .map((s) => String(s._id || s))
      .filter((id) => sections.some((x) => String(x._id) === id)),
    isAssignment: !!doc.isAssignment,
    allowSubmission: doc.allowSubmission !== false,
    dueDate: doc.dueDate ? String(doc.dueDate).slice(0, 10) : '',
    totalMarks: doc.totalMarks == null ? '' : String(doc.totalMarks),
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
  open, editing, sections, categories, saving, onClose, onSave,
}) {
  const [form,  setForm]  = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [tried, setTried] = useState(false);

  // Reset every time it opens, so yesterday's half-finished notice never
  // reappears over today's.
  useEffect(() => {
    if (!open) return;
    setForm(formFor(editing, sections));
    setFiles([]);
    setTried(false);
  }, [open, editing?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const toggleSection = (id) => set({
    sectionIds: form.sectionIds.includes(id)
      ? form.sectionIds.filter((x) => x !== id)
      : [...form.sectionIds, id],
  });

  /** Everything wrong at once, not one toast at a time. */
  const errors = useMemo(() => {
    const e = {};
    if (!form.title.trim())       e.title = 'Give it a title';
    if (!form.category)           e.category = 'Pick a category';
    if (!form.sectionIds.length)  e.sections = 'Choose at least one section';
    if (form.isAssignment && form.totalMarks && Number(form.totalMarks) <= 0) {
      e.totalMarks = 'Marks must be more than zero';
    }
    if (form.isAssignment && form.dueDate && new Date(form.dueDate) < new Date(new Date().toDateString())) {
      e.dueDate = 'That date has already passed';
    }
    return e;
  }, [form]);

  const bad = Object.keys(errors).length > 0;

  const submit = () => {
    setTried(true);
    if (bad) return;
    onSave(form, files);
  };

  const show = (k) => (tried ? errors[k] : null);

  const chosen = sections.filter((s) => form.sectionIds.includes(s._id));
  const kind   = DOC_TYPES.find((t) => t.value === form.docType);

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={720}
      title={editing ? 'Edit document' : 'Share a document'}
      footer={<>
        {/* The one-line answer to "what will this do", right where the button
            is, so it is read at the moment of pressing rather than never. */}
        <span className="shsummary">
          {chosen.length
            ? <><Icon name="checkCircle" size={14} /> {kind?.label} for {chosen.length === 1
              ? chosen[0].label
              : `${chosen.length} sections`}</>
            : <><Icon name="info" size={14} /> Nobody selected yet</>}
        </span>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving}>
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
                  // The type and the flag say the same thing, so they move
                  // together — you cannot end up with an assignment nobody can
                  // hand anything in to.
                  isAssignment: t.value === 'assignment' ? true : form.isAssignment && t.value !== 'notice' && t.value !== 'circular',
                })}>
                <span className={`shtype__icon tint-${t.tone}`}><Icon name={TYPE_ICON[t.value]} size={18} /></span>
                <b>{t.label}</b>
                <small>{TYPE_HINT[t.value]}</small>
              </button>
            ))}
          </div>

          <div className="form-group">
            <label className="form-label required" htmlFor="sh-title">Title</label>
            <input id="sh-title" className={`form-control${show('title') ? ' is-bad' : ''}`}
              autoFocus maxLength={160} value={form.title}
              placeholder="e.g. Chapter 5 — practice questions"
              onChange={(e) => set({ title: e.target.value })} />
            <Err>{show('title')}</Err>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="sh-desc">Description</label>
            <textarea id="sh-desc" className="form-control" rows={2} maxLength={300}
              value={form.description} placeholder="One line about what this is and what to do with it"
              onChange={(e) => set({ description: e.target.value })} />
            <div className="form-hint">{300 - form.description.length} characters left</div>
          </div>
        </Block>

        <Block step="2" title="Who gets it?"
          hint={sections.length > 1
            ? 'Pick as many of your sections as it applies to — one document, marked in one place.'
            : 'Everyone in your section will see it.'}>
          {sections.length ? (
            <>
              <div className={`shsections${show('sections') ? ' is-bad' : ''}`}>
                {sections.map((s) => {
                  const on = form.sectionIds.includes(s._id);
                  return (
                    <button key={s._id} type="button" aria-pressed={on}
                      className={`shchip${on ? ' is-on' : ''}`} onClick={() => toggleSection(s._id)}>
                      <Icon name={on ? 'checkCircle' : 'layers'} size={15} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {sections.length > 2 && (
                <button type="button" className="shlink"
                  onClick={() => set({
                    sectionIds: form.sectionIds.length === sections.length ? [] : sections.map((s) => s._id),
                  })}>
                  {form.sectionIds.length === sections.length ? 'Clear all' : 'Select all my sections'}
                </button>
              )}
              <Err>{show('sections')}</Err>
            </>
          ) : (
            <p className="shnone">
              You are not assigned to a section yet, so there is nowhere to share to.
            </p>
          )}
        </Block>

        <Block step="3" title="How should it be filed?"
          hint="The category is your school's own label; the subject is optional.">
          <div className="shrow">
            <div className="form-group">
              <label className="form-label required" htmlFor="sh-cat">Category</label>
              <select id="sh-cat" className={`form-control${show('category') ? ' is-bad' : ''}`}
                value={form.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">— Select —</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Err>{show('category')}</Err>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sh-subject">Subject</label>
              <input id="sh-subject" className="form-control" maxLength={60} value={form.subject}
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
              <small>Turns it into an assignment you can mark.</small>
            </span>
          </label>

          {form.isAssignment && (
            <div className="shassign">
              <div className="shrow">
                <div className="form-group">
                  <label className="form-label" htmlFor="sh-due">Due date</label>
                  <input id="sh-due" type="date" className={`form-control${show('dueDate') ? ' is-bad' : ''}`}
                    value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
                  <Err>{show('dueDate')}</Err>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="sh-marks">Out of</label>
                  <input id="sh-marks" type="number" min="1"
                    className={`form-control${show('totalMarks') ? ' is-bad' : ''}`}
                    value={form.totalMarks} placeholder="e.g. 50"
                    onChange={(e) => set({ totalMarks: e.target.value })} />
                  <Err>{show('totalMarks')}</Err>
                </div>
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
          hint={editing ? 'Adding files here replaces the ones already on it.' : 'Optional — a notice can be all text.'}>
          <FileDrop id="sh-files" files={files} onChange={setFiles}
            hint="PDFs, documents, images — up to 10" />

          {editing?.files?.length > 0 && files.length === 0 && (
            <div className="shkept">
              <p><Icon name="files" size={14} /> Already attached — left alone unless you add new files</p>
              <ul>
                {editing.files.map((f, i) => (
                  <li key={`${f.storedName || f.originalName}-${i}`}>
                    <FileMark file={f} size={28} />
                    <span className="dvfiles__name" title={f.originalName}>{f.originalName}</span>
                    <span className="dvfiles__size">{fmtSize(f.fileSize)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Block>
      </div>
    </Modal>
  );
}
