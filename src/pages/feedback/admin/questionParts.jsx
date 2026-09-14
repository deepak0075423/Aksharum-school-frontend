/**
 * The three forms behind Teacher Feedback → Questions, and their delete guards.
 *
 * Each form shows the admin what they are building while they build it: a
 * question renders exactly as a student will see it, a category shows where it
 * will sit in every results screen, and a template shows its question list in
 * the order students will answer it. Writing a questionnaire blind and finding
 * out on the student form is the mistake all three exist to prevent.
 */
import React, { useMemo, useState } from 'react';
import { Confirm } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { OptionChips, RatingInput } from '../shared/kit';
import {
  ChoiceTile, FbModal, FormField, FormSection, Segmented, Stepper, Tag, toneAt,
} from './fbUI';
import { QUESTION_TYPES, categoryIcon, isScorable, minutesFor, typeShort } from './feedbackParts';

const NEEDS_OPTIONS = ['multiple_choice', 'checkbox'];

const TYPE_LOOK = {
  rating_5:        { icon: 'star',        text: 'Poor to Excellent, counts towards the rating' },
  emoji_5:         { icon: 'sun',         text: 'The same 1–5 scale, shown with faces' },
  yes_no:          { icon: 'checkCircle', text: 'A single yes or no' },
  multiple_choice: { icon: 'list',        text: 'Choose one option from a list' },
  checkbox:        { icon: 'checkSquare', text: 'Tick any number of options' },
  text:            { icon: 'pencil',      text: 'Free words, never averaged' },
};

export const blankQuestion = () => ({
  _id: null, questionText: '', category: '', questionType: 'rating_5',
  isRequired: true, includeInScore: true, helpText: '', maxLength: 1000,
  displayOrder: 0, status: 'active', options: [], answered: false,
});

export const toQuestionForm = (r) => ({
  _id: r._id,
  questionText: r.questionText || '',
  category: r.category || '',
  questionType: r.questionType,
  isRequired: !!r.isRequired,
  includeInScore: !!r.includeInScore,
  helpText: r.helpText || '',
  maxLength: r.maxLength || 1000,
  displayOrder: r.displayOrder || 0,
  status: r.status,
  options: (r.options || []).map((o) => ({ optionText: o.optionText, allowsFreeText: !!o.allowsFreeText })),
  // Set by the server: once anybody has answered, the type, options and scoring
  // are frozen — changing them would reinterpret answers already stored.
  answered: !!r.answered,
});

// ── Question ─────────────────────────────────────────────────────────────────

export function QuestionForm({ open, form, setForm, categories, saving, error, onClose, onSave }) {
  const [errors, setErrors] = useState({});
  // The preview is interactive, so the admin can feel the control — but what
  // they click there is theirs alone and never saved.
  const [tryValue, setTryValue] = useState({});

  if (!open || !form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const frozen = !!form.answered;
  const needsOptions = NEEDS_OPTIONS.includes(form.questionType);
  const scorable = isScorable(form.questionType);
  const category = (categories || []).find((c) => String(c._id) === String(form.category));

  const setType = (t) => {
    if (frozen) return;
    setForm((f) => ({
      ...f,
      questionType: t,
      includeInScore: isScorable(t),
      options: NEEDS_OPTIONS.includes(t) && !f.options.length ? [{ optionText: '' }, { optionText: '' }] : f.options,
    }));
    setTryValue({});
  };
  const setOption = (i, patch) => setForm((f) => ({
    ...f, options: f.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
  }));
  const moveOption = (i, dir) => setForm((f) => {
    const next = [...f.options];
    const j = i + dir;
    if (j < 0 || j >= next.length) return f;
    [next[i], next[j]] = [next[j], next[i]];
    return { ...f, options: next };
  });

  const submit = () => {
    const e = {};
    if (!form.questionText.trim()) e.questionText = 'Write the question the student will read.';
    if (needsOptions && form.options.filter((o) => o.optionText.trim()).length < 2) {
      e.options = 'A choice question needs at least two options.';
    }
    const texts = form.options.map((o) => o.optionText.trim().toLowerCase()).filter(Boolean);
    if (needsOptions && new Set(texts).size !== texts.length) e.options = 'Two options have the same words.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ ...form, options: form.options.filter((o) => o.optionText.trim()) });
  };

  const previewOptions = form.options
    .filter((o) => o.optionText.trim())
    .map((o, i) => ({ _id: `p${i}`, optionText: o.optionText, allowsFreeText: o.allowsFreeText }));

  return (
    <FbModal open onClose={onClose} busy={saving} width={1020} icon="checkSquare"
      title={form._id ? 'Edit question' : 'New question'}
      subtitle="Write it once, reuse it in every campaign. The preview is exactly what a student sees."
      aside={(
        <div className="fbprev">
          <div className="fbprev__label"><Icon name="eye" size={14} /> Student preview</div>
          <div className="fbprev__card">
            {category ? (
              <span className="fbprev__cat">
                <Icon name={categoryIcon(category.name)} size={13} /> {category.name}
              </span>
            ) : null}
            <div className="fbprev__q">
              {form.questionText.trim() || <span className="fbprev__ph">Your question appears here</span>}
              {form.isRequired ? <em>{'\u00a0'}*</em> : null}
            </div>
            {form.helpText.trim() ? <div className="fbprev__help">{form.helpText}</div> : null}

            <div className="fbprev__ctl">
              {['rating_5', 'emoji_5'].includes(form.questionType) && (
                <RatingInput name="preview" value={tryValue.rating ?? null}
                  onChange={(v) => setTryValue({ rating: v })} />
              )}
              {form.questionType === 'yes_no' && (
                <div className="fbprev__yn">
                  {['Yes', 'No'].map((v) => (
                    <button key={v} type="button" className={tryValue.yn === v ? 'is-on' : ''}
                      onClick={() => setTryValue({ yn: tryValue.yn === v ? '' : v })}>{v}</button>
                  ))}
                </div>
              )}
              {needsOptions && (previewOptions.length
                ? (
                  <OptionChips options={previewOptions} selected={tryValue.opts || []}
                    single={form.questionType === 'multiple_choice'}
                    onToggle={(id, single) => setTryValue((t) => {
                      const cur = t.opts || [];
                      if (single) return { opts: cur.includes(id) ? [] : [id] };
                      return { opts: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
                    })} />
                )
                : <span className="fbprev__ph">Add options to see them here</span>)}
              {form.questionType === 'text' && (
                <>
                  <textarea className="form-control" rows={4} maxLength={Number(form.maxLength) || 1000}
                    placeholder="Optional — share anything else you would like your teacher to know"
                    value={tryValue.text || ''} onChange={(e) => setTryValue({ text: e.target.value })} />
                  <div className="fbprev__count">{(tryValue.text || '').length} / {form.maxLength || 1000}</div>
                </>
              )}
            </div>
          </div>

          <ul className="fbprev__facts">
            <li className={form.includeInScore && scorable ? 'is-yes' : ''}>
              <Icon name={form.includeInScore && scorable ? 'checkCircle' : 'closeCircle'} size={14} />
              {form.includeInScore && scorable ? 'Counts towards the teacher’s rating' : 'Collected, never averaged'}
            </li>
            <li className={form.isRequired ? 'is-yes' : ''}>
              <Icon name={form.isRequired ? 'checkCircle' : 'closeCircle'} size={14} />
              {form.isRequired ? 'Students must answer' : 'Students may skip it'}
            </li>
            <li className="is-yes">
              <Icon name="key" size={14} /> Anonymous in every result
            </li>
          </ul>
        </div>
      )}
      footer={(
        <>
          <span className="fbm__note">
            {frozen
              ? <><Icon name="key" size={13} /> Answered before — wording, category and status can change; the answer type cannot.</>
              : 'Editing a question never changes a campaign that already copied it.'}
          </span>
          <button type="button" className="fbtb" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="fbtb fbtb--primary" onClick={submit} disabled={saving}>
            <Icon name="checkCircle" size={15} /> {saving ? 'Saving…' : form._id ? 'Save changes' : 'Add question'}
          </button>
        </>
      )}>
      {error ? <div className="fbformerr"><Icon name="alert" size={15} /> {error}</div> : null}

      <FormSection title="The question">
        <FormField label="Question" required error={errors.questionText}
          count={`${form.questionText.length} / 500`}>
          <textarea className="fbinput" rows={2} maxLength={500} autoFocus value={form.questionText}
            placeholder="e.g. Explains concepts clearly"
            onChange={(e) => { set('questionText', e.target.value); setErrors((x) => ({ ...x, questionText: '' })); }} />
        </FormField>
        <div className="fbfields fbfields--2">
          <FormField label="Category" hint="Results are reported per category.">
            <select className="fbinput" value={form.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">No category</option>
              {(categories || []).filter((c) => c.status !== 'archived' || String(c._id) === String(form.category))
                .map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Help text" hint="An optional line under the question.">
            <input className="fbinput" maxLength={300} value={form.helpText}
              placeholder="e.g. Think about the last few weeks"
              onChange={(e) => set('helpText', e.target.value)} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="How students answer" locked={frozen}
        hint={frozen ? 'Frozen: students have already answered this question in this form.' : null}>
        <div className="fbtypegrid">
          {QUESTION_TYPES.map((t) => (
            <ChoiceTile key={t.value} icon={TYPE_LOOK[t.value]?.icon} title={t.short}
              text={TYPE_LOOK[t.value]?.text} on={form.questionType === t.value}
              disabled={frozen && form.questionType !== t.value}
              onClick={() => setType(t.value)} />
          ))}
        </div>

        {needsOptions && (
          <FormField label="Options" required error={errors.options}
            hint="The order here is the order students see.">
            <ol className="fbopted">
              {form.options.map((o, i) => (
                // Options have no id until they are saved and can be reordered,
                // so their position is the only stable handle.
                // eslint-disable-next-line
                <li key={i}>
                  <span className="fbopted__n">{i + 1}</span>
                  <input className="fbinput" value={o.optionText} maxLength={200} placeholder={`Option ${i + 1}`}
                    disabled={frozen} onChange={(e) => setOption(i, { optionText: e.target.value })} />
                  <label className="fbopted__free" title="Lets the student add their own words after picking it">
                    <input type="checkbox" checked={!!o.allowsFreeText} disabled={frozen}
                      onChange={(e) => setOption(i, { allowsFreeText: e.target.checked })} /> Free text
                  </label>
                  <span className="fbopted__acts">
                    <button type="button" onClick={() => moveOption(i, -1)} disabled={frozen || i === 0} aria-label="Move up">
                      <Icon name="arrowUp" size={13} />
                    </button>
                    <button type="button" onClick={() => moveOption(i, 1)} disabled={frozen || i === form.options.length - 1} aria-label="Move down">
                      <Icon name="arrowDown" size={13} />
                    </button>
                    <button type="button" className="is-danger" disabled={frozen || form.options.length <= 2}
                      onClick={() => set('options', form.options.filter((_, idx) => idx !== i))} aria-label="Remove option">
                      <Icon name="trash" size={13} />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            {!frozen && (
              <button type="button" className="fbadd" onClick={() => set('options', [...form.options, { optionText: '' }])}>
                <Icon name="plus" size={14} /> Add option
              </button>
            )}
          </FormField>
        )}

        {form.questionType === 'text' && (
          <FormField label="Longest answer allowed" hint="Most comments fit well under 500 characters.">
            <Stepper value={form.maxLength} min={50} max={2000} disabled={frozen} suffix="characters"
              onChange={(v) => set('maxLength', v)} />
          </FormField>
        )}
      </FormSection>

      <FormSection title="Rules">
        <div className="fbrules2">
          <label className="fbrule">
            <input type="checkbox" checked={form.isRequired} onChange={(e) => set('isRequired', e.target.checked)} />
            <span className="fbtoggle__sw" aria-hidden><i /></span>
            <span><b>Required</b><small>The student cannot submit without answering.</small></span>
          </label>
          <label className={`fbrule${!scorable || frozen ? ' is-off' : ''}`}>
            <input type="checkbox" checked={form.includeInScore && scorable} disabled={!scorable || frozen}
              onChange={(e) => set('includeInScore', e.target.checked)} />
            <span className="fbtoggle__sw" aria-hidden><i /></span>
            <span>
              <b>Counts towards the rating</b>
              <small>{scorable
                ? 'Included in the teacher’s average out of 5.'
                : 'A written or pick-list answer has nothing to average.'}</small>
            </span>
          </label>
        </div>
        {form._id && (
          <FormField label="Status" hint="An inactive question stays in the bank but is not offered to new templates.">
            <Segmented value={form.status} onChange={(v) => set('status', v)}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'archived', label: 'Archived' },
              ]} />
          </FormField>
        )}
      </FormSection>
    </FbModal>
  );
}

// ── Category ─────────────────────────────────────────────────────────────────

export function CategoryForm({ open, form, setForm, categories = [], saving, error, onClose, onSave }) {
  const [err, setErr] = useState('');

  // Where the category will sit in every results screen, with this one slotted
  // in at the order being typed — so "order 3" means something.
  const ordered = useMemo(() => {
    if (!form) return [];
    const others = categories.filter((c) => String(c._id) !== String(form._id) && c.status !== 'archived');
    const mine = { _id: '__me', name: form.name.trim() || 'New category', displayOrder: Number(form.displayOrder) || 0, me: true };
    return [...others, mine].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)
      || (a.me ? 1 : b.me ? -1 : 0));
  }, [categories, form]);

  if (!open || !form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const taken = !!form.name.trim() && categories.some((c) => String(c._id) !== String(form._id)
    && c.name.trim().toLowerCase() === form.name.trim().toLowerCase());

  const submit = () => {
    if (!form.name.trim()) { setErr('A category needs a name.'); return; }
    if (taken) { setErr('Another category already has this name.'); return; }
    setErr('');
    onSave(form);
  };

  return (
    <FbModal open onClose={onClose} busy={saving} width={900} icon="layers"
      title={form._id ? 'Edit category' : 'New category'}
      subtitle="A category groups questions so results read by theme — “Communication 4.2” rather than fourteen numbers."
      aside={(
        <div className="fbprev">
          <div className="fbprev__label"><Icon name="chart" size={14} /> Where it appears in results</div>
          <ol className="fbcatprev">
            {ordered.map((c, i) => (
              <li key={c._id} className={c.me ? 'is-me' : ''}>
                <span className={`fbcatcell__i tint-${toneAt(i)}`}><Icon name={categoryIcon(c.name)} size={14} /></span>
                <span className="fbcatprev__n">{c.name}</span>
                <b>{c.me ? 'this one' : `#${i + 1}`}</b>
              </li>
            ))}
          </ol>
          <p className="fbprev__foot">
            Every results screen lists categories in this order, each with its average out of 5.
          </p>
        </div>
      )}
      footer={(
        <>
          <span className="fbm__note">Renaming a category relabels its past results too.</span>
          <button type="button" className="fbtb" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="fbtb fbtb--primary" onClick={submit} disabled={saving}>
            <Icon name="checkCircle" size={15} /> {saving ? 'Saving…' : form._id ? 'Save changes' : 'Add category'}
          </button>
        </>
      )}>
      {error || err ? <div className="fbformerr"><Icon name="alert" size={15} /> {err || error}</div> : null}

      <FormSection title="Details">
        <FormField label="Name" required error={taken ? 'Another category already has this name.' : null}
          count={`${form.name.length} / 120`}>
          <div className="fbnamein">
            <span className="fbcatcell__i tint-purple"><Icon name={categoryIcon(form.name)} size={16} /></span>
            <input className="fbinput" autoFocus maxLength={120} value={form.name}
              placeholder="e.g. Classroom Management"
              onChange={(e) => { set('name', e.target.value); setErr(''); }} />
          </div>
        </FormField>
        <FormField label="What it is about" hint="Shown to admins beside the category. Students never see it."
          count={`${(form.description || '').length} / 500`}>
          <textarea className="fbinput" rows={3} maxLength={500} value={form.description || ''}
            placeholder="e.g. Discipline, fairness and class atmosphere"
            onChange={(e) => set('description', e.target.value)} />
        </FormField>
      </FormSection>

      <FormSection title="Placement">
        <div className="fbfields fbfields--2">
          <FormField label="Display order" hint="Lower numbers come first in every report.">
            <Stepper value={form.displayOrder ?? 0} min={0} max={999}
              onChange={(v) => set('displayOrder', v)} />
          </FormField>
          {form._id ? (
            <FormField label="Status" hint="Inactive categories keep their past results.">
              <Segmented value={form.status === 'inactive' ? 'inactive' : 'active'} onChange={(v) => set('status', v)}
                options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
            </FormField>
          ) : <div />}
        </div>
      </FormSection>
    </FbModal>
  );
}

// ── Template ─────────────────────────────────────────────────────────────────

/**
 * A template is an ordered question list. Creating a campaign from it COPIES
 * the questions in this order, so editing a template never disturbs a campaign
 * already running — and the order chosen here is the order students answer.
 */
export function TemplateForm({ open, form, setForm, questions, categories, saving, error, onClose, onSave }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [err, setErr] = useState('');

  const byId = useMemo(() => new Map((questions || []).map((q) => [String(q._id), q])), [questions]);
  const catName = useMemo(() => new Map((categories || []).map((c) => [String(c._id), c.name])), [categories]);

  const picked = useMemo(() => (form?.questions || []).map(String), [form]);
  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (questions || []).filter((q) => {
      if (picked.includes(String(q._id))) return false;
      if (cat && String(q.category || '') !== cat) return false;
      if (term && !q.questionText.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [questions, picked, search, cat]);

  // Grouped by category so the admin builds by theme, the way results read.
  const groups = useMemo(() => {
    const m = new Map();
    for (const q of available) {
      const k = catName.get(String(q.category)) || 'Uncategorised';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(q);
    }
    return [...m.entries()];
  }, [available, catName]);

  if (!open || !form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const add = (ids) => set('questions', [...picked, ...ids.map(String).filter((id) => !picked.includes(id))]);
  const remove = (id) => set('questions', picked.filter((x) => x !== id));
  const move = (i, dir) => {
    const next = [...picked];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set('questions', next);
  };

  const pickedRows = picked.map((id) => byId.get(id)).filter(Boolean);
  const missing = picked.length - pickedRows.length;
  const scored = pickedRows.filter((q) => q.includeInScore).length;
  const covered = [...new Set(pickedRows.map((q) => catName.get(String(q.category))).filter(Boolean))];
  const allCats = [...new Set((questions || []).map((q) => catName.get(String(q.category))).filter(Boolean))];

  const submit = () => {
    if (!form.name.trim()) { setErr('A template needs a name.'); return; }
    if (!pickedRows.length) { setErr('Pick at least one question.'); return; }
    setErr('');
    onSave({ ...form, questions: pickedRows.map((q) => String(q._id)) });
  };

  return (
    <FbModal open onClose={onClose} busy={saving} width={1180} icon="clipboard"
      title={form._id ? 'Edit template' : 'New template'}
      subtitle="Pick questions from the bank and put them in the order students should answer."
      aside={(
        <div className="fbprev">
          <div className="fbprev__label"><Icon name="clipboard" size={14} /> This template</div>
          <div className="fbtplsum">
            <div><b>{pickedRows.length}</b><small>questions</small></div>
            <div><b>{scored}</b><small>scored</small></div>
            <div><b>~{minutesFor(pickedRows.length)}</b><small>minutes</small></div>
          </div>
          <div className="fbprev__sub">Categories covered</div>
          <div className="fbtplcats">
            {allCats.length ? allCats.map((c) => (
              <span key={c} className={covered.includes(c) ? 'is-on' : ''}>
                <Icon name={covered.includes(c) ? 'checkCircle' : 'closeCircle'} size={12} /> {c}
              </span>
            )) : <span>No categories yet</span>}
          </div>
          {pickedRows.length > 0 && scored === 0 && (
            <div className="fbwarn"><Icon name="alert" size={14} /> No scored question — campaigns from this template collect opinions but produce no rating.</div>
          )}
          {pickedRows.length > 25 && (
            <div className="fbwarn"><Icon name="alert" size={14} /> Long forms get rushed answers. Most schools stay under 20.</div>
          )}
          {missing > 0 && (
            <div className="fbwarn"><Icon name="alert" size={14} /> {missing} question(s) are inactive or archived and will be left out on save.</div>
          )}
        </div>
      )}
      footer={(
        <>
          <span className="fbm__note">Campaigns already created from this template keep their own copy.</span>
          <button type="button" className="fbtb" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="fbtb fbtb--primary" onClick={submit} disabled={saving}>
            <Icon name="checkCircle" size={15} /> {saving ? 'Saving…' : form._id ? 'Save changes' : 'Create template'}
          </button>
        </>
      )}>
      {error || err ? <div className="fbformerr"><Icon name="alert" size={15} /> {err || error}</div> : null}

      <FormSection title="Details">
        <div className="fbfields fbfields--2">
          <FormField label="Name" required count={`${form.name.length} / 150`}>
            <input className="fbinput" autoFocus maxLength={150} value={form.name}
              placeholder="e.g. Standard Teacher Evaluation"
              onChange={(e) => { set('name', e.target.value); setErr(''); }} />
          </FormField>
          <FormField label="Description" hint="For admins choosing a template.">
            <input className="fbinput" maxLength={500} value={form.description}
              placeholder="e.g. The two-minute end-of-term evaluation"
              onChange={(e) => set('description', e.target.value)} />
          </FormField>
        </div>
        <FormField label="Instructions shown to students" hint="Copied onto a campaign unless the campaign sets its own.">
          <textarea className="fbinput" rows={2} maxLength={1000} value={form.instructions}
            placeholder="Your answers are anonymous and help your teachers improve. Please be honest and fair."
            onChange={(e) => set('instructions', e.target.value)} />
        </FormField>
      </FormSection>

      <FormSection title="Questions" hint="Add from the bank on the left; reorder on the right.">
        <div className="fbpick2">
          <div className="fbpick2__col">
            <div className="fbpick2__head">
              <b>Question bank</b><small>{available.length} available</small>
            </div>
            <div className="fbpick2__tools">
              <div className="fbsearch fbsearch--wide">
                <Icon name="search" size={15} />
                <input value={search} placeholder="Search questions…" onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search questions" />
              </div>
              <select className="fbsel" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
                <option value="">All categories</option>
                {(categories || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="fbpick2__list">
              {groups.map(([name, rows]) => (
                <div key={name} className="fbpick2__group">
                  <div className="fbpick2__gh">
                    <span><Icon name={categoryIcon(name)} size={13} /> {name}</span>
                    <button type="button" onClick={() => add(rows.map((q) => q._id))}>Add all {rows.length}</button>
                  </div>
                  {rows.map((q) => (
                    <button key={q._id} type="button" className="fbpick2__q" onClick={() => add([q._id])}>
                      <span className="fbpick2__qt">
                        <b>{q.questionText}</b>
                        <small>{typeShort(q.questionType)}{q.includeInScore ? ' · scored' : ''}</small>
                      </span>
                      <span className="fbpick2__add"><Icon name="plus" size={14} /></span>
                    </button>
                  ))}
                </div>
              ))}
              {!groups.length && (
                <p className="fbmuted fbpick2__empty">
                  {(questions || []).length
                    ? (search || cat ? 'Nothing matches this search.' : 'Every active question is already in the template.')
                    : 'There are no active questions yet. Add some in the Question Bank first.'}
                </p>
              )}
            </div>
          </div>

          <div className="fbpick2__col">
            <div className="fbpick2__head">
              <b>In this template</b><small>{pickedRows.length} in order</small>
              {pickedRows.length ? (
                <button type="button" className="fbpick2__clear" onClick={() => set('questions', [])}>Clear</button>
              ) : null}
            </div>
            <ol className="fbpick2__list fbpick2__sel">
              {pickedRows.map((q, i) => (
                <li key={q._id}>
                  <span className="fbpick2__n">{i + 1}</span>
                  <span className="fbpick2__qt">
                    <b>{q.questionText}</b>
                    <small>
                      {catName.get(String(q.category)) ? <Tag tone="purple">{catName.get(String(q.category))}</Tag> : null}
                      <span>{typeShort(q.questionType)}</span>
                    </small>
                  </span>
                  <span className="fbopted__acts">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      <Icon name="arrowUp" size={13} />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === pickedRows.length - 1} aria-label="Move down">
                      <Icon name="arrowDown" size={13} />
                    </button>
                    <button type="button" className="is-danger" onClick={() => remove(String(q._id))} aria-label="Remove">
                      <Icon name="close" size={13} />
                    </button>
                  </span>
                </li>
              ))}
              {!pickedRows.length && (
                <li className="fbpick2__none">
                  <Icon name="clipboard" size={22} />
                  <span>Nothing yet. Click a question on the left to add it — it lands at the end.</span>
                </li>
              )}
            </ol>
          </div>
        </div>
      </FormSection>
    </FbModal>
  );
}

// ── Delete dialogs ───────────────────────────────────────────────────────────

/**
 * Nothing in this module cascades. A question that has ever been answered is
 * archived rather than deleted so historical feedback stays readable, and the
 * dialog now says which of the two is about to happen, because the list knows.
 */
export const DeleteQuestionDialog = ({ question, deleting, onClose, onConfirm }) => (
  <Confirm
    open={!!question}
    onClose={onClose}
    onConfirm={onConfirm}
    loading={deleting}
    confirmLabel={question?.answered ? 'Archive question' : 'Delete question'}
    title={question?.answered ? 'Archive this question?' : 'Delete this question?'}
    message={question
      ? (question.answered
        ? `“${question.questionText}” has been answered before, so it will be archived rather than deleted — past campaigns stay readable and it is no longer offered to new templates.`
        : `“${question.questionText}” will be removed from the bank. Campaigns that already copied it keep their own copy.`)
      : ''}
  />
);

export const DeleteCategoryDialog = ({ category, deleting, onClose, onConfirm }) => (
  <Confirm
    open={!!category}
    onClose={onClose}
    onConfirm={onConfirm}
    loading={deleting}
    confirmLabel="Delete category"
    title="Delete this category?"
    message={category
      ? `“${category.name}” groups ${category.questionCount || 0} question(s). A category still in use cannot be deleted — deactivate it instead, and existing results keep reporting under it.`
      : ''}
  />
);

export const DeleteTemplateDialog = ({ template, deleting, onClose, onConfirm }) => (
  <Confirm
    open={!!template}
    onClose={onClose}
    onConfirm={onConfirm}
    loading={deleting}
    confirmLabel="Delete template"
    title="Delete this template?"
    message={template
      ? `“${template.name}” will no longer be offered when creating a campaign. Campaigns already created from it are untouched — each one copied the questions when it was made.`
      : ''}
  />
);
