/**
 * The campaign form and its lifecycle guards.
 *
 * Four steps — what it is, what it asks, who it asks, and when — with a summary
 * beside them that says, before anybody presses Activate, exactly how many
 * students will be asked about how many teachers.
 *
 * A campaign always belongs to the CURRENT academic year. There is nothing to
 * choose: assignments are generated from that year's sections, and the server
 * sets the year itself and drops any target that is not of it. So the form
 * shows the year as a fact, loads its classes, sections, subjects and teachers
 * from /feedback/campaign-options (current year only), and never sends a year.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Confirm } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/feedback.api';
import {
  Avatar, ChoiceTile, FbModal, FormField, FormSection, Search as SearchBox, Stepper, Tag, fmtDate, toneAt,
} from './fbUI';
import { categoryIcon, minutesFor } from './feedbackParts';

// ── Dates ────────────────────────────────────────────────────────────────────
// Kept as YYYY-MM-DD strings end to end. "Today" is the LOCAL date — an ISO
// string of now is the UTC date, which in India before 05:30 is yesterday.
const pad = (n) => String(n).padStart(2, '0');
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** A YYYY-MM-DD plus n days, done in UTC so no timezone can move the day. */
export const addDays = (iso, n) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};
export const isoPlus = (days) => addDays(todayIso(), days);
const daysBetween = (a, b) => {
  if (!a || !b) return null;
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
};
const isoOf = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const blankCampaign = (meta, settings) => ({
  _id: null,
  name: '', term: '',
  feedbackType: 'student_teacher', description: '', instructions: '',
  startDate: todayIso(), endDate: isoPlus((settings?.defaultCampaignDays || 14) - 1),
  isAnonymous: settings?.defaultAnonymous !== false,
  minimumResponses: settings?.defaultMinimumResponses ?? 5,
  targetClasses: [], targetSections: [], targetSubjects: [], targetTeachers: [],
  template: meta?.templates?.find((t) => t.isDefault)?._id || '',
  reminderEnabled: true,
  reminderIntervalDays: settings?.reminderIntervalDays ?? 3,
  allowResubmission: false,
});

export const toCampaignForm = (r) => ({
  _id: r._id,
  name: r.name || '',
  term: r.term || '',
  feedbackType: r.feedbackType || 'student_teacher',
  description: r.description || '',
  instructions: r.instructions || '',
  startDate: r.startDate ? isoOf(r.startDate) : todayIso(),
  endDate: r.endDate ? isoOf(r.endDate) : isoPlus(13),
  isAnonymous: !!r.isAnonymous,
  minimumResponses: r.minimumResponses ?? 5,
  targetClasses:  (r.targetClasses  || []).map(String),
  targetSections: (r.targetSections || []).map(String),
  targetSubjects: (r.targetSubjects || []).map(String),
  targetTeachers: (r.targetTeachers || []).map(String),
  // Blank on an edit: the campaign already holds its own copy of the questions.
  template: '',
  questionCount: r.questions?.length ?? r.questionCount ?? null,
  reminderEnabled: r.reminderEnabled !== false,
  reminderIntervalDays: r.reminderIntervalDays ?? 3,
  allowResubmission: !!r.allowResubmission,
  status: r.status,
  yearName: r.academicYear?.yearName || '',
});

// ── Reach ────────────────────────────────────────────────────────────────────

/**
 * The sections a targeting choice actually covers.
 *
 * The server reads `targetSections` in preference to `targetClasses` — so a
 * form that sent classes [1, 2] and sections [1-A] would quietly drop all of
 * Class 2. Here a picked section only narrows its OWN class: a picked class with
 * none of its sections ticked contributes all of them, and that expanded list
 * is what gets sent.
 */
export function sectionsInScope(opt, classes, sections) {
  const all = opt?.sections || [];
  const byClass = classes.length ? all.filter((s) => classes.includes(s.class)) : all;
  if (!sections.length) return byClass;
  const picked = new Set(sections);
  const classesWithPicks = new Set(all.filter((s) => picked.has(s._id)).map((s) => s.class));
  return byClass.filter((s) => picked.has(s._id) || (classes.length > 0 && !classesWithPicks.has(s.class)));
}

/** Exactly what fb.generateAssignments would build, counted instead of written. */
export function computeReach(opt, form) {
  if (!opt?.academicYear) return { sections: 0, students: 0, teachers: 0, evaluations: 0, scope: [] };
  const scope = sectionsInScope(opt, form.targetClasses, form.targetSections);
  const inScope = new Map(scope.map((s) => [s._id, s]));
  const subj = new Set(form.targetSubjects);
  const teach = new Set(form.targetTeachers);
  const links = (opt.links || []).filter((l) => inScope.has(l.section)
    && (!subj.size || subj.has(l.subject)) && (!teach.size || teach.has(l.teacher)));
  const reached = new Set(links.map((l) => l.section));
  return {
    scope,
    sections: reached.size,
    students: [...reached].reduce((n, id) => n + (inScope.get(id)?.students || 0), 0),
    teachers: new Set(links.map((l) => l.teacher)).size,
    evaluations: links.reduce((n, l) => n + (inScope.get(l.section)?.students || 0), 0),
  };
}

const STEPS = [
  { key: 'details',   label: 'Details',   hint: 'Name and year' },
  { key: 'questions', label: 'Questions', hint: 'What it asks' },
  { key: 'audience',  label: 'Audience',  hint: 'Who it asks' },
  { key: 'schedule',  label: 'Schedule & privacy', hint: 'When, and how safely' },
];

const TERMS = ['Term 1', 'Term 2', 'Term 3', 'Mid-term', 'Annual'];

// ── The form ─────────────────────────────────────────────────────────────────

export function CampaignForm({ open, form, setForm, saving, error, onClose, onSave }) {
  const [opt, setOpt] = useState(null);
  const [optErr, setOptErr] = useState('');
  const [step, setStep] = useState('details');
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [dropped, setDropped] = useState(0);
  const [attempt, setAttempt] = useState(0);   // bumped by Retry

  // Options load each time the form opens — a class added in another tab since
  // the page loaded should be pickable without a reload.
  useEffect(() => {
    if (!open) return undefined;
    setStep('details'); setErrors({}); setTouched({}); setDropped(0); setAttempt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form?._id]);

  // Separate from the reset above so Retry reloads the options without
  // throwing away anything already typed.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setOpt(null); setOptErr('');
    api.getCampaignOptions()
      .then((r) => { if (alive) setOpt(r.data ?? r); })
      .catch((e) => { if (alive) setOptErr(e.message || 'Request failed'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form?._id, attempt]);

  // Once options arrive: pick the default template for a new campaign, and drop
  // any target that is not of the current year (a draft made last year), saying
  // how many went rather than letting them vanish unexplained.
  useEffect(() => {
    if (!opt || !form) return;
    const keepIn = (list, rows) => {
      const ids = new Set(rows.map((x) => x._id));
      return list.filter((id) => ids.has(id));
    };
    const f = form;
    const next = {
      ...f,
      targetClasses:  keepIn(f.targetClasses,  opt.classes),
      targetSections: keepIn(f.targetSections, opt.sections),
      targetSubjects: keepIn(f.targetSubjects, opt.subjects),
      targetTeachers: keepIn(f.targetTeachers, opt.teachers),
    };
    if (!f._id && !f.template && opt.templates?.length) {
      next.template = (opt.templates.find((t) => t.isDefault) || opt.templates[0])._id;
    }
    setDropped(['targetClasses', 'targetSections', 'targetSubjects', 'targetTeachers']
      .reduce((n, k) => n + f[k].length - next[k].length, 0));
    setForm(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opt]);

  const reach = useMemo(() => computeReach(opt, form || {
    targetClasses: [], targetSections: [], targetSubjects: [], targetTeachers: [],
  }), [opt, form]);

  if (!open || !form) return null;

  const live = ['active', 'scheduled'].includes(form.status);
  const editing = !!form._id;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const year = opt?.academicYear;
  const template = (opt?.templates || []).find((t) => t._id === form.template);
  const days = daysBetween(form.startDate, form.endDate);

  // ── validation, per step ──
  const check = (key) => {
    const e = {};
    if (key === 'details') {
      if (!form.name.trim()) e.name = 'Give the campaign a name students will recognise.';
      if (opt && !year && !editing) e.year = 'No active academic year.';
    }
    if (key === 'questions' && !editing && !form.template) e.template = 'Choose the questions this campaign will ask.';
    if (key === 'schedule') {
      if (!form.startDate) e.startDate = 'Required.';
      if (!form.endDate) e.endDate = 'Required.';
      if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = 'The window cannot close before it opens.';
    }
    return e;
  };
  const stepErrors = Object.fromEntries(STEPS.map((s) => [s.key, check(s.key)]));
  const hasErr = (key) => Object.keys(stepErrors[key]).length > 0;

  const go = (key) => { setTouched((t) => ({ ...t, [step]: true })); setErrors(stepErrors[step]); setStep(key); };
  const idx = STEPS.findIndex((s) => s.key === step);
  const next = () => {
    const e = stepErrors[step];
    setTouched((t) => ({ ...t, [step]: true }));
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep(STEPS[idx + 1].key);
  };

  const submit = () => {
    const firstBad = STEPS.find((s) => hasErr(s.key));
    setTouched({ details: true, questions: true, audience: true, schedule: true });
    if (firstBad) { setErrors(stepErrors[firstBad.key]); setStep(firstBad.key); return; }
    const scopeIds = sectionsInScope(opt, form.targetClasses, form.targetSections).map((s) => s._id);
    onSave({
      ...form,
      // A picked section narrows only its own class — send the expanded list so
      // the server's "sections win over classes" rule cannot drop a class.
      targetSections: form.targetSections.length ? scopeIds : [],
      minimumResponses: Number(form.minimumResponses) || 1,
      reminderIntervalDays: Number(form.reminderIntervalDays) || 1,
    });
  };

  const stepState = (s) => {
    if (!opt) return 'todo';
    if (live && (s.key === 'questions' || s.key === 'audience')) return 'locked';
    if (touched[s.key] && hasErr(s.key)) return 'error';
    if (touched[s.key] && s.key !== step) return 'done';
    return 'todo';
  };

  // ── audience toggles, pruning anything the new scope no longer contains ──
  const retarget = (patch) => setForm((f) => {
    const nf = { ...f, ...patch };
    if (nf.targetClasses.length) {
      const cls = new Set(nf.targetClasses);
      nf.targetSections = nf.targetSections.filter((id) => cls.has(opt.sections.find((s) => s._id === id)?.class));
    }
    const scope = new Set(sectionsInScope(opt, nf.targetClasses, nf.targetSections).map((s) => s._id));
    const links = opt.links.filter((l) => scope.has(l.section));
    const subjects = new Set(links.map((l) => l.subject));
    nf.targetSubjects = nf.targetSubjects.filter((id) => subjects.has(id));
    const subj = new Set(nf.targetSubjects);
    const teachers = new Set(links.filter((l) => !subj.size || subj.has(l.subject)).map((l) => l.teacher));
    nf.targetTeachers = nf.targetTeachers.filter((id) => teachers.has(id));
    return nf;
  });
  const flip = (key, id) => retarget({
    [key]: form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id],
  });

  const footerPrimary = editing
    ? (
      <button type="button" className="fbtb fbtb--primary" onClick={submit} disabled={saving || !opt}>
        <Icon name="checkCircle" size={15} /> {saving ? 'Saving…' : 'Save changes'}
      </button>
    )
    : idx < STEPS.length - 1
      ? (
        <button type="button" className="fbtb fbtb--primary" onClick={next} disabled={!opt}>
          Next: {STEPS[idx + 1].label} <Icon name="arrowRight" size={14} />
        </button>
      )
      : (
        <button type="button" className="fbtb fbtb--primary" onClick={submit} disabled={saving || !opt || !year}>
          <Icon name="checkCircle" size={15} /> {saving ? 'Creating…' : 'Create as draft'}
        </button>
      );

  return (
    <FbModal open onClose={onClose} busy={saving} width={1240} icon="megaphone"
      title={editing ? `Edit “${form.name || 'campaign'}”` : 'New feedback campaign'}
      subtitle={year
        ? `Runs in ${year.yearName}, the current academic year. It is created as a draft — nothing is sent until you start it.`
        : 'A campaign runs in the current academic year and is created as a draft.'}
      steps={STEPS.map((s) => ({ ...s, state: stepState(s) }))} step={step} onStep={opt ? go : undefined}
      aside={<Summary form={form} opt={opt} reach={reach} template={template} days={days} live={live} />}
      footer={(
        <>
          <span className="fbm__note">Step {idx + 1} of {STEPS.length}</span>
          <button type="button" className="fbtb" onClick={onClose} disabled={saving}>Cancel</button>
          {idx > 0 && (
            <button type="button" className="fbtb" onClick={() => setStep(STEPS[idx - 1].key)} disabled={saving}>
              <Icon name="chevronLeft" size={14} /> Back
            </button>
          )}
          {editing && idx < STEPS.length - 1 && (
            <button type="button" className="fbtb" onClick={next}>
              Next <Icon name="arrowRight" size={14} />
            </button>
          )}
          {footerPrimary}
        </>
      )}>
      {error ? <div className="fbformerr"><Icon name="alert" size={15} /> {error}</div> : null}
      {optErr ? (
        <div className="fbloadfail">
          <span className="fbloadfail__icon tint-red"><Icon name="alert" size={22} /></span>
          <div>
            <b>This year’s classes, subjects and templates could not be loaded</b>
            <p>A campaign can only target the current academic year, so the form waits for them. Nothing you typed is lost.</p>
            <small>Server said: {optErr}</small>
          </div>
          <button type="button" className="fbtb fbtb--primary" onClick={() => setAttempt((n) => n + 1)}>
            <Icon name="refresh" size={14} /> Retry
          </button>
        </div>
      ) : null}
      {!opt && !optErr ? <div className="fbloading">Loading this year’s classes, subjects and teachers…</div> : null}

      {opt && step === 'details' && (
        <>
          <YearCard year={year} yearName={form.yearName} editing={editing} />

          {live && (
            <div className="fbinfo">
              <Icon name="key" size={15} />
              <span>This campaign is already {form.status}. Its questions, audience and privacy setting are
                frozen — students have answered against them. Name, description, closing date, response floor
                and reminders can still change.</span>
            </div>
          )}

          <FormSection title="About this campaign">
            <div className="fbfields fbfields--2">
              <FormField label="Campaign name" required error={errors.name} count={`${form.name.length} / 150`}>
                <input className="fbinput" autoFocus maxLength={150} value={form.name}
                  placeholder="e.g. Term 1 Teacher Feedback"
                  onChange={(e) => { set('name', e.target.value); setErrors((x) => ({ ...x, name: '' })); }} />
              </FormField>
              <FormField label="Term" hint="Labels this campaign on every trend chart.">
                <input className="fbinput" maxLength={60} value={form.term} placeholder="e.g. Term 1"
                  onChange={(e) => set('term', e.target.value)} />
                <span className="fbquick">
                  {TERMS.map((t) => (
                    <button key={t} type="button" className={form.term === t ? 'is-on' : ''}
                      onClick={() => set('term', form.term === t ? '' : t)}>{t}</button>
                  ))}
                </span>
              </FormField>
            </div>

            <FormField label="Who gives the feedback">
              <div className="fbtypegrid fbtypegrid--2">
                <ChoiceTile icon="student" title="Students → Teachers" text="Each student rates the teachers who teach them."
                  on={form.feedbackType === 'student_teacher'} disabled={live}
                  onClick={() => set('feedbackType', 'student_teacher')} />
                <ChoiceTile icon="users" title="Parents → Teachers" text="Not available yet." badge="Coming soon"
                  on={false} disabled onClick={() => {}} />
              </div>
            </FormField>

            <FormField label="Description" hint="For your own records — students do not see this.">
              <textarea className="fbinput" rows={2} maxLength={1000} value={form.description}
                placeholder="e.g. End-of-term evaluation for the senior classes"
                onChange={(e) => set('description', e.target.value)} />
            </FormField>
            <FormField label="Instructions shown to students"
              hint={template?.name ? `Leave empty to use the “${template.name}” template’s own instructions.` : null}>
              <textarea className="fbinput" rows={2} maxLength={2000} value={form.instructions}
                placeholder="Your answers are anonymous and help your teachers improve. Please be honest and fair."
                onChange={(e) => set('instructions', e.target.value)} />
            </FormField>
          </FormSection>
        </>
      )}

      {opt && step === 'questions' && (
        <FormSection title="What it asks" locked={editing}
          hint={editing
            ? 'The questionnaire was copied onto this campaign when it was created, and stays fixed for its whole life.'
            : 'The template’s questions are copied onto the campaign now, so later edits to the template never disturb it.'}>
          {editing ? (
            <div className="fbinfo">
              <Icon name="clipboard" size={15} />
              <span>{form.questionCount != null ? `${form.questionCount} questions are` : 'The questions are'} fixed
                on this campaign. Open the campaign’s Questions tab to read them.</span>
            </div>
          ) : (opt.templates || []).length ? (
            <>
              {errors.template ? <div className="fbformerr"><Icon name="alert" size={15} /> {errors.template}</div> : null}
              <div className="fbtplpick">
                {opt.templates.map((t) => (
                  <button key={t._id} type="button" aria-pressed={form.template === t._id}
                    className={`fbtplpick__card${form.template === t._id ? ' is-on' : ''}`}
                    onClick={() => { set('template', t._id); setErrors((x) => ({ ...x, template: '' })); }}>
                    <span className="fbtplpick__top">
                      <span className="fbtplpick__icon tint-purple"><Icon name="clipboard" size={18} /></span>
                      <span className="fbtplpick__name">
                        <b>{t.name}{t.isDefault ? <em>default</em> : null}</b>
                        <small>{t.questionCount} questions · {t.scoredCount} scored · ~{minutesFor(t.questionCount)} min</small>
                      </span>
                      <span className="fbct__radio" aria-hidden />
                    </span>
                    {t.description ? <span className="fbtplpick__desc">{t.description}</span> : null}
                    {t.categories?.length ? (
                      <span className="fbtplpick__cats">
                        {t.categories.slice(0, 5).map((c) => (
                          <span key={c}><Icon name={categoryIcon(c)} size={11} /> {c}</span>
                        ))}
                        {t.categories.length > 5 ? <span>+{t.categories.length - 5}</span> : null}
                      </span>
                    ) : null}
                    {t.sample?.length ? (
                      <ol className="fbtplpick__sample">
                        {t.sample.map((q) => <li key={q}>{q}</li>)}
                        {t.questionCount > t.sample.length ? <li className="is-more">…and {t.questionCount - t.sample.length} more</li> : null}
                      </ol>
                    ) : null}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="fbformerr">
              <Icon name="alert" size={15} /> There are no active templates. Build one under Questions → Templates first —
              a campaign is created from a template.
            </div>
          )}
        </FormSection>
      )}

      {opt && step === 'audience' && (
        <Audience opt={opt} form={form} reach={reach} live={live} dropped={dropped}
          flip={flip} retarget={retarget} />
      )}

      {opt && step === 'schedule' && (
        <>
          <FormSection title="When it runs" hint="Students can submit on every day of the window, both ends included.">
            <div className="fbfields fbfields--2">
              <FormField label="Opens" required error={errors.startDate}
                hint={live ? 'Fixed — the campaign has started.' : form.startDate > todayIso() ? 'Starting it early schedules it for this date.' : null}>
                <input type="date" className="fbinput" value={form.startDate} disabled={live}
                  onChange={(e) => set('startDate', e.target.value)} />
              </FormField>
              <FormField label="Closes" required error={errors.endDate}>
                <input type="date" className="fbinput" value={form.endDate} min={form.startDate}
                  onChange={(e) => set('endDate', e.target.value)} />
              </FormField>
            </div>
            <div className="fbquick fbquick--row">
              <small>Length:</small>
              {[7, 10, 14, 21, 30].map((n) => (
                <button key={n} type="button" className={days === n ? 'is-on' : ''}
                  onClick={() => set('endDate', addDays(form.startDate || todayIso(), n - 1))}>{n} days</button>
              ))}
            </div>
            {days > 0 && (
              <div className="fbinfo">
                <Icon name="calendar" size={15} />
                <span>
                  {fmtDate(form.startDate)} to {fmtDate(form.endDate)} — a <b>{days}-day</b> window.
                  {days < 5 ? ' That is short; response rates climb sharply over the first week.' : ''}
                </span>
              </div>
            )}
            {year && ((year.endDate && form.endDate > isoOf(year.endDate)) || (year.startDate && form.startDate < isoOf(year.startDate))) && (
              <div className="fbwarn">
                <Icon name="alert" size={14} /> This window runs outside {year.yearName} ({fmtDate(year.startDate)} – {fmtDate(year.endDate)}).
                The campaign still belongs to {year.yearName}, but students may have moved on by then.
              </div>
            )}
          </FormSection>

          <FormSection title="Reminders">
            <div className="fbrules2">
              <label className="fbrule">
                <input type="checkbox" checked={form.reminderEnabled}
                  onChange={(e) => set('reminderEnabled', e.target.checked)} />
                <span className="fbtoggle__sw" aria-hidden><i /></span>
                <span><b>Remind students who have not answered</b><small>A notification while the window is open.</small></span>
              </label>
              <div className={`fbrule fbrule--field${form.reminderEnabled ? '' : ' is-off'}`}>
                <span><b>Remind every</b><small>Only students with something outstanding.</small></span>
                <Stepper value={form.reminderIntervalDays} min={1} max={30} disabled={!form.reminderEnabled}
                  suffix="days" onChange={(v) => set('reminderIntervalDays', v)} />
              </div>
            </div>
          </FormSection>

          <FormSection title="Privacy" locked={live}>
            <div className="fbrules2">
              <label className={`fbrule${live ? ' is-off' : ''}`}>
                <input type="checkbox" checked={form.isAnonymous} disabled={live}
                  onChange={(e) => set('isAnonymous', e.target.checked)} />
                <span className="fbtoggle__sw" aria-hidden><i /></span>
                <span>
                  <b>Anonymous</b>
                  <small>No teacher and no admin screen ever pairs a student with what they wrote. Submission is still
                    recorded so nobody answers twice.</small>
                </span>
              </label>
              <div className="fbrule fbrule--field">
                <span>
                  <b>Response floor</b>
                  <small>A teacher’s figures stay hidden until this many students have answered about them.</small>
                </span>
                <Stepper value={form.minimumResponses} min={1} max={50} suffix="responses"
                  onChange={(v) => set('minimumResponses', v)} />
              </div>
              <label className="fbrule">
                <input type="checkbox" checked={form.allowResubmission}
                  onChange={(e) => set('allowResubmission', e.target.checked)} />
                <span className="fbtoggle__sw" aria-hidden><i /></span>
                <span><b>Let an admin reopen a submitted response</b><small>For a student who answered by mistake.</small></span>
              </label>
            </div>
            {Number(form.minimumResponses) < 3 && (
              <div className="fbwarn"><Icon name="alert" size={14} /> A floor under 3 can let a single student’s answers be worked out.</div>
            )}
          </FormSection>
        </>
      )}
    </FbModal>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/** The year, as a fact rather than a field. */
const YearCard = ({ year, yearName, editing }) => (
  year ? (
    <div className="fbyear">
      <span className="fbyear__icon tint-indigo"><Icon name="calendarDays" size={20} /></span>
      <div className="fbyear__text">
        <small>Academic year</small>
        <b>{year.yearName} <em>Current</em></b>
        <span>
          {year.startDate ? `${fmtDate(year.startDate)} – ${fmtDate(year.endDate)} · ` : ''}
          Classes, sections, subjects and teachers are all from this year.
          {editing && yearName && yearName !== year.yearName ? ` This draft was made in ${yearName} and moves to ${year.yearName} when saved.` : ''}
        </span>
      </div>
      <span className="fbyear__lock"><Icon name="key" size={12} /> Set automatically</span>
    </div>
  ) : (
    <div className="fbformerr">
      <Icon name="alert" size={15} />
      There is no active academic year, so a campaign cannot be created. Mark the current year active in Academic
      Years first — a campaign always runs in it.
    </div>
  )
);

/** The live summary beside every step. */
function Summary({ form, opt, reach, template, days, live }) {
  const year = opt?.academicYear;
  const nobody = opt && year && reach.evaluations === 0;
  return (
    <div className="fbprev">
      <div className="fbprev__label"><Icon name="megaphone" size={14} /> Campaign summary</div>
      <div className="fbsum">
        <b className="fbsum__name">{form.name.trim() || 'Untitled campaign'}</b>
        <span className="fbsum__meta">
          {year ? <Tag tone="indigo">{year.yearName}</Tag> : null}
          {form.term ? <Tag tone="slate">{form.term}</Tag> : null}
          <Tag tone={form.isAnonymous ? 'purple' : 'slate'}>{form.isAnonymous ? 'Anonymous' : 'Named'}</Tag>
        </span>
      </div>

      <div className={`fbreach${nobody ? ' is-empty' : ''}`}>
        <div className="fbreach__big">
          <b>{reach.students.toLocaleString('en-IN')}</b>
          <small>students asked</small>
        </div>
        <ul>
          <li><b>{reach.sections}</b> sections</li>
          <li><b>{reach.teachers}</b> teachers</li>
          <li><b>{reach.evaluations.toLocaleString('en-IN')}</b> evaluations</li>
        </ul>
        {nobody && (
          <p><Icon name="alert" size={13} /> Nobody would be asked. Students are matched through the section–subject–teacher
            allocations — this audience has none.</p>
        )}
      </div>

      <dl className="fbsum__list">
        <div>
          <dt><Icon name="clipboard" size={13} /> Questions</dt>
          <dd>{template ? `${template.name} · ${template.questionCount}` : form.questionCount != null ? `${form.questionCount} (fixed)` : '—'}</dd>
        </div>
        <div>
          <dt><Icon name="calendar" size={13} /> Window</dt>
          <dd>{days > 0 ? `${fmtDate(form.startDate)} – ${fmtDate(form.endDate)} (${days}d)` : '—'}</dd>
        </div>
        <div>
          <dt><Icon name="bell" size={13} /> Reminders</dt>
          <dd>{form.reminderEnabled ? `Every ${form.reminderIntervalDays} day(s)` : 'Off'}</dd>
        </div>
        <div>
          <dt><Icon name="key" size={13} /> Response floor</dt>
          <dd>{form.minimumResponses} responses</dd>
        </div>
      </dl>
      <p className="fbprev__foot">
        {live
          ? 'Live campaigns keep their audience; these numbers describe it.'
          : 'Counts are from today’s allocations. Starting the campaign creates the assignments.'}
      </p>
    </div>
  );
}

/**
 * One audience list. Declared at module scope on purpose: a component defined
 * inside Audience would be a new type every render, remounting its search box
 * and dropping focus after each keystroke.
 */
const Group = ({ icon, title, picked, total, noun, onAll, children, searchValue, onSearch }) => (
  <section className="fbaud">
    <header>
      <span className="fbaud__icon tint-purple"><Icon name={icon} size={16} /></span>
      <div className="fbaud__title">
        <b>{title}</b>
        <small>{picked ? `${picked} of ${total} picked` : `All ${total} ${noun}`}</small>
      </div>
      {onSearch ? (
        <div className="fbaud__search">
          <SearchBox value={searchValue} onChange={onSearch} placeholder={`Find ${noun}…`} />
        </div>
      ) : null}
      {picked ? <button type="button" className="fbaud__all" onClick={onAll}>Use all</button> : null}
    </header>
    {children}
  </section>
);

/** Classes → sections → subjects → teachers, each list narrowed by the one above. */
function Audience({ opt, form, reach, live, dropped, flip, retarget }) {
  const [q, setQ] = useState({ classes: '', teachers: '' });
  const year = opt.academicYear;

  const classStats = useMemo(() => {
    const m = new Map();
    for (const s of opt.sections) {
      const cur = m.get(s.class) || { sections: 0, students: 0 };
      m.set(s.class, { sections: cur.sections + 1, students: cur.students + s.students });
    }
    return m;
  }, [opt]);

  const scopeIds = new Set(reach.scope.map((s) => s._id));
  const linksInScope = opt.links.filter((l) => scopeIds.has(l.section));
  const subjectTeachers = new Map();
  for (const l of linksInScope) {
    if (!subjectTeachers.has(l.subject)) subjectTeachers.set(l.subject, new Set());
    subjectTeachers.get(l.subject).add(l.teacher);
  }
  const subjectsShown = opt.subjects.filter((s) => subjectTeachers.has(s._id));
  const unstaffed = opt.subjects.length - subjectsShown.length;

  const subj = new Set(form.targetSubjects);
  const teacherSubjects = new Map();
  for (const l of linksInScope) {
    if (subj.size && !subj.has(l.subject)) continue;
    if (!teacherSubjects.has(l.teacher)) teacherSubjects.set(l.teacher, new Set());
    teacherSubjects.get(l.teacher).add(l.subject);
  }
  const subjectName = new Map(opt.subjects.map((s) => [s._id, s.subjectName]));
  const teachersShown = opt.teachers
    .filter((t) => teacherSubjects.has(t._id))
    .filter((t) => !q.teachers || t.name.toLowerCase().includes(q.teachers.toLowerCase()));

  const classesShown = opt.classes
    .filter((c) => classStats.has(c._id))
    .filter((c) => !q.classes || c.className.toLowerCase().includes(q.classes.toLowerCase()));

  const sectionRows = useMemo(() => {
    const base = form.targetClasses.length ? opt.sections.filter((s) => form.targetClasses.includes(s.class)) : opt.sections;
    const m = new Map();
    for (const s of base) {
      if (!m.has(s.class)) m.set(s.class, { className: s.className, rows: [] });
      m.get(s.class).rows.push(s);
    }
    return [...m.entries()];
  }, [opt, form.targetClasses]);

  if (live) {
    return (
      <FormSection title="Who it asks" locked
        hint="Frozen — changing the audience now would invalidate answers already given. Sync assignments on the campaign page picks up students who joined a targeted section later.">
        <div className="fbinfo">
          <Icon name="users" size={15} />
          <span>{reach.students} students in {reach.sections} sections, about {reach.teachers} teachers.</span>
        </div>
      </FormSection>
    );
  }

  if (!year) {
    return (
      <div className="fbformerr"><Icon name="alert" size={15} /> No active academic year — there is nobody to target.</div>
    );
  }

  return (
    <>
      {dropped > 0 && (
        <div className="fbwarn">
          <Icon name="alert" size={14} /> {dropped} target(s) from another academic year were removed — they do not
          exist in {year.yearName}.
        </div>
      )}
      <div className="fbinfo">
        <Icon name="info" size={15} />
        <span>Leave a list untouched to include everything in it. Each list only offers what the lists above it
          contain, and students are matched to their own teachers automatically — nobody is paired by hand.</span>
      </div>

      <Group icon="grid" title="Classes" picked={form.targetClasses.length} total={classStats.size} noun="classes"
        onAll={() => retarget({ targetClasses: [] })}
        searchValue={q.classes} onSearch={opt.classes.length > 12 ? (v) => setQ((x) => ({ ...x, classes: v })) : null}>
        <div className="fbchips2">
          {classesShown.map((c) => {
            const st = classStats.get(c._id);
            const on = form.targetClasses.includes(c._id);
            return (
              <button key={c._id} type="button" aria-pressed={on} className={`fbchip2${on ? ' is-on' : ''}`}
                onClick={() => flip('targetClasses', c._id)}>
                {on ? <Icon name="checkCircle" size={13} /> : null}
                <b>{c.className}</b>
                <small>{st.sections} sec · {st.students} students</small>
              </button>
            );
          })}
          {!classesShown.length && <span className="fbmuted">No class of {year.yearName} has an active section.</span>}
        </div>
      </Group>

      <Group icon="layers" title="Sections" picked={form.targetSections.length}
        total={form.targetClasses.length ? sectionRows.reduce((n, [, g]) => n + g.rows.length, 0) : opt.sections.length}
        noun="sections" onAll={() => retarget({ targetSections: [] })}>
        <div className="fbsecrows">
          {sectionRows.map(([cid, g]) => (
            <div key={cid} className="fbsecrow">
              <span className="fbsecrow__c">{g.className}</span>
              <span className="fbchips2">
                {g.rows.map((s) => {
                  const on = form.targetSections.includes(s._id);
                  return (
                    <button key={s._id} type="button" aria-pressed={on} className={`fbchip2 fbchip2--sm${on ? ' is-on' : ''}`}
                      onClick={() => flip('targetSections', s._id)}>
                      {on ? <Icon name="checkCircle" size={12} /> : null}
                      <b>{s.sectionName}</b><small>{s.students}</small>
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
        {form.targetSections.length > 0 && form.targetClasses.length > 0 && (
          <p className="fbaud__note">A picked section narrows its own class; a picked class with no section ticked keeps all of them.</p>
        )}
      </Group>

      <Group icon="book" title="Subjects" picked={form.targetSubjects.length} total={subjectsShown.length}
        noun="subjects taught here" onAll={() => retarget({ targetSubjects: [] })}>
        <div className="fbchips2">
          {subjectsShown.map((s) => {
            const on = form.targetSubjects.includes(s._id);
            const n = subjectTeachers.get(s._id).size;
            return (
              <button key={s._id} type="button" aria-pressed={on} className={`fbchip2${on ? ' is-on' : ''}`}
                onClick={() => flip('targetSubjects', s._id)}>
                {on ? <Icon name="checkCircle" size={13} /> : null}
                <b>{s.subjectName}</b><small>{n} teacher{n === 1 ? '' : 's'}</small>
              </button>
            );
          })}
          {!subjectsShown.length && <span className="fbmuted">No subject has a teacher allocated in these sections.</span>}
        </div>
        {unstaffed > 0 && (
          <p className="fbaud__note">{unstaffed} subject(s) of {year.yearName} have no teacher in these sections, so they are not offered.</p>
        )}
      </Group>

      <Group icon="teacher" title="Teachers" picked={form.targetTeachers.length} total={teacherSubjects.size}
        noun="teachers" onAll={() => retarget({ targetTeachers: [] })}
        searchValue={q.teachers} onSearch={teacherSubjects.size > 12 ? (v) => setQ((x) => ({ ...x, teachers: v })) : null}>
        <div className="fbteachpick">
          {teachersShown.map((t, i) => {
            const on = form.targetTeachers.includes(t._id);
            const subs = [...(teacherSubjects.get(t._id) || [])].map((id) => subjectName.get(id)).filter(Boolean);
            return (
              <button key={t._id} type="button" aria-pressed={on} className={`fbteach${on ? ' is-on' : ''}`}
                onClick={() => flip('targetTeachers', t._id)}>
                <Avatar name={t.name} size={32} tone={toneAt(i)} />
                <span className="fbteach__t">
                  <b>{t.name}</b>
                  <small>{subs.join(', ') || t.department || 'Teacher'}</small>
                </span>
                <span className={`fbteach__tick${on ? ' is-on' : ''}`}>{on ? <Icon name="checkCircle" size={16} /> : null}</span>
              </button>
            );
          })}
          {!teachersShown.length && <span className="fbmuted">No teacher teaches in these sections{subj.size ? ' for the picked subjects' : ''}.</span>}
        </div>
      </Group>
    </>
  );
}

// ── Lifecycle guards ─────────────────────────────────────────────────────────

/**
 * Every one of these changes something students can see, so each says what it
 * does to them rather than asking "are you sure".
 */
const ACTION_COPY = {
  activate: {
    title: 'Start this campaign?',
    confirm: 'Start collecting',
    message: 'Assignments are generated for every matching student of the current academic year and they are notified straight away. '
      + 'The questions and the audience are frozen from this point — responses will be answered against them.',
  },
  close: {
    title: 'Close this campaign?',
    confirm: 'Close it',
    message: 'Students can no longer submit, and anything outstanding is marked expired. '
      + 'Nothing is deleted — every response already collected stays available, and the results stay readable.',
  },
  archive: {
    title: 'Archive this campaign?',
    confirm: 'Archive it',
    message: 'It drops out of the default lists and the campaign picker. All its data is kept and it still '
      + 'counts towards trends.',
  },
  delete: {
    title: 'Delete this draft?',
    confirm: 'Delete draft',
    message: 'Only a draft can be deleted, and this one has collected nothing. The draft and any assignments '
      + 'generated for it are removed for good.',
  },
  reminders: {
    title: 'Send a reminder now?',
    confirm: 'Send reminders',
    message: 'Every student who has not yet submitted gets a notification. Students who have already '
      + 'answered are not contacted.',
  },
  sync: {
    title: 'Sync assignments?',
    confirm: 'Sync now',
    message: 'Picks up students who joined a targeted section after this campaign started, and creates their '
      + 'assignments. Nothing already collected is touched.',
  },
};

export const CampaignConfirm = ({ action, campaign, busy, onClose, onConfirm }) => {
  const copy = ACTION_COPY[action];
  return (
    <Confirm
      open={!!action}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={busy}
      title={copy?.title}
      confirmLabel={copy?.confirm}
      message={campaign && copy ? `“${campaign.name}” — ${copy.message}` : copy?.message}
    />
  );
};
