/**
 * Teacher Feedback → Questions.
 *
 * One screen for the whole of "what gets asked": the reusable question bank,
 * the categories results are reported under, and the templates a campaign is
 * built from. Each view is its own shape — the bank and the categories are
 * registers, the templates are cards — so the hero, the tiles, the filter bar
 * and the closing pair all change with the view rather than being one shell
 * with three tables dropped into it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import {
  Acts, Crumbs, Dash, EmptyState, Foot, Hero, IconBtn, Menu, MenuItem, MenuSep,
  NoteBar, Pick, Search, SelectionBar, SortBy, Spacer, Stat, Stats, Table, Tag,
  TextBtn, TipCard, Toolbar, ViewToggle, fmtDate, toneAt, useSelection,
} from './fbUI';
import {
  OnOff, QUESTION_TYPES, STATUS_OPTIONS, categoryIcon, homeFor, minutesFor, typeShort, useFeedbackBase,
} from './feedbackParts';
import {
  CategoryForm, DeleteCategoryDialog, DeleteQuestionDialog, DeleteTemplateDialog,
  QuestionForm, TemplateForm, blankQuestion, toQuestionForm,
} from './questionParts';

const VIEWS = ['bank', 'categories', 'templates'];

const BANK_SORTS = [
  { value: 'newest',   label: 'Newest first' },
  { value: 'order',    label: 'Display order' },
  { value: 'text',     label: 'Question (A–Z)' },
  { value: 'category', label: 'Category' },
];
const CAT_SORTS = [
  { value: 'order', label: 'Order (Low to High)' },
  { value: 'text',  label: 'Name (A–Z)' },
  { value: 'used',  label: 'Most questions' },
];
const TPL_SORTS = [
  { value: 'newest', label: 'Recently created' },
  { value: 'text',   label: 'Name (A–Z)' },
  { value: 'size',   label: 'Most questions' },
];

const HERO = {
  bank: {
    icon: 'checkSquare', title: 'Question Bank',
    subtitle: 'Create and manage reusable questions for your feedback campaigns.',
    noun: 'question', nouns: 'questions', add: 'New Question',
  },
  categories: {
    icon: 'layers', title: 'Feedback Categories',
    subtitle: 'Group questions so results can be reported per category.',
    noun: 'category', nouns: 'categories', add: 'New Category',
  },
  templates: {
    icon: 'clipboard', title: 'Feedback Templates',
    subtitle: 'Create reusable question sets to save time and ensure consistency across campaigns.',
    noun: 'template', nouns: 'templates', add: 'New Template',
  },
};

export default function Questions() {
  const base = useFeedbackBase();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'bank';

  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [layout, setLayout] = useState('list');
  const [page, setPage] = useState(1);
  const limit = 10;

  const [qForm, setQForm] = useState(null);
  const [cForm, setCForm] = useState(null);
  const [tForm, setTForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [delQ, setDelQ] = useState(null);
  const [delC, setDelC] = useState(null);
  const [delT, setDelT] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  /**
   * Switch the list, and drop the filters that belonged to the old one — a type
   * filter of "Pick many" means nothing to a list of categories.
   *
   * The clearing happens here rather than in an effect on `view`, because an
   * effect fires AFTER the click that switched it: a category's question count
   * switches to the bank AND sets the category filter, and an effect would wipe
   * the filter that was the whole point of the click. `keep` says what survives.
   */
  const setView = (v, keep = {}) => {
    setParams(v === 'bank' ? {} : { view: v }, { replace: true });
    setPage(1);
    setSearch(''); setTerm(''); setType(''); setStatus('');
    setCat(keep.category || '');
    setSort(v === 'categories' ? 'order' : 'newest');
  };

  // All three lists load together and filter in the browser: the bank is a few
  // dozen rows, and the template picker must be able to see every active
  // question whatever the bank's own filters are set to.
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [q, c, t] = await Promise.all([
        api.getQuestions({ limit: 500 }), api.getCategories({}), api.getTemplates(),
      ]);
      setQuestions(((q.data ?? q).data) || []);
      setCategories((c.data ?? c) || []);
      setTemplates((t.data ?? t) || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setTimeout(() => { setTerm(search.trim().toLowerCase()); setPage(1); }, 250);
    return () => clearTimeout(id);
  }, [search]);

  const catAt = useMemo(
    () => new Map(categories.map((c, i) => [String(c._id), { name: c.name, i }])),
    [categories],
  );

  const counts = useMemo(() => ({
    questions: questions.length,
    qActive: questions.filter((q) => q.status === 'active').length,
    qInactive: questions.filter((q) => q.status !== 'active').length,
    categories: categories.length,
    cActive: categories.filter((c) => c.status === 'active').length,
    cInactive: categories.filter((c) => c.status !== 'active').length,
    catQuestions: categories.reduce((n, c) => n + (c.questionCount || 0), 0),
    templates: templates.length,
    tActive: templates.filter((t) => t.status === 'active').length,
    tInactive: templates.filter((t) => t.status !== 'active').length,
    reused: templates.reduce((n, t) => n + (t.timesUsed || 0), 0),
  }), [questions, categories, templates]);

  // ── Rows ───────────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    if (view === 'bank') {
      const out = questions.filter((q) => {
        if (status && q.status !== status) return false;
        if (type && q.questionType !== type) return false;
        if (cat && String(q.category || '') !== cat) return false;
        if (term && !`${q.questionText} ${q.helpText || ''}`.toLowerCase().includes(term)) return false;
        return true;
      });
      return out.sort((a, b) => {
        switch (sort) {
          case 'order':    return (a.displayOrder || 0) - (b.displayOrder || 0);
          case 'text':     return a.questionText.localeCompare(b.questionText);
          case 'category': return (catAt.get(String(a.category))?.name || 'zzz')
            .localeCompare(catAt.get(String(b.category))?.name || 'zzz');
          default:         return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        }
      });
    }
    if (view === 'categories') {
      const out = categories.filter((c) => {
        if (status && c.status !== status) return false;
        if (term && !`${c.name} ${c.description || ''}`.toLowerCase().includes(term)) return false;
        return true;
      });
      return out.sort((a, b) => {
        if (sort === 'text') return a.name.localeCompare(b.name);
        if (sort === 'used') return (b.questionCount || 0) - (a.questionCount || 0);
        return (a.displayOrder || 0) - (b.displayOrder || 0);
      });
    }
    const out = templates.filter((t) => {
      if (status && t.status !== status) return false;
      if (type && (t.feedbackType || 'student_teacher') !== type) return false;
      if (term && !`${t.name} ${t.description || ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
    return out.sort((a, b) => {
      if (sort === 'text') return a.name.localeCompare(b.name);
      if (sort === 'size') return (b.questionCount || 0) - (a.questionCount || 0);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [view, questions, categories, templates, status, type, cat, term, sort, catAt]);

  const pages = Math.max(1, Math.ceil(rows.length / limit));
  const start = (Math.min(page, pages) - 1) * limit;
  const shown = rows.slice(start, start + limit);
  const filtered = !!term || !!cat || !!type || !!status;
  const selection = useSelection(view === 'bank' ? shown : [], `${view}|${page}|${term}|${cat}|${type}|${status}|${sort}`);
  const clear = () => { setSearch(''); setTerm(''); setCat(''); setType(''); setStatus(''); setPage(1); };

  // ── Actions ────────────────────────────────────────────────────────────────
  const seed = async () => {
    setSeeding(true);
    try {
      const d = (await api.seedDefaults()).data;
      toast.success(`Added ${d.categories} categories, ${d.questions} questions and ${d.templates} template(s)`);
      load();
    } catch (e) { toast.error(e.message); } finally { setSeeding(false); }
  };

  const saveQuestion = async (payload) => {
    setSaving(true); setFormErr('');
    try {
      if (payload._id) { await api.updateQuestion(payload._id, payload); toast.success('Question saved'); }
      else             { await api.createQuestion(payload);              toast.success('Question added'); }
      setQForm(null); load();
    } catch (e) { setFormErr(e.message); } finally { setSaving(false); }
  };

  const saveCategory = async (f) => {
    if (!f.name.trim()) { setFormErr('A category needs a name.'); return; }
    setSaving(true); setFormErr('');
    try {
      if (f._id) { await api.updateCategory(f._id, f); toast.success('Category saved'); }
      else       { await api.createCategory(f);        toast.success('Category added'); }
      setCForm(null); load();
    } catch (e) { setFormErr(e.message); } finally { setSaving(false); }
  };

  const saveTemplate = async (f) => {
    if (!f.name.trim())      { setFormErr('A template needs a name.'); return; }
    if (!f.questions.length) { setFormErr('Pick at least one question.'); return; }
    setSaving(true); setFormErr('');
    try {
      const payload = { ...f, questions: f.questions.map((id) => ({ question: id })) };
      if (f._id) { await api.updateTemplate(f._id, payload); toast.success('Template saved'); }
      else       { await api.createTemplate(payload);        toast.success('Template created'); }
      setTForm(null); load();
    } catch (e) { setFormErr(e.message); } finally { setSaving(false); }
  };

  const toggle = async (row, kind) => {
    const next = row.status === 'active' ? 'inactive' : 'active';
    try {
      if (kind === 'question')      await api.updateQuestion(row._id, { status: next });
      else if (kind === 'category') await api.updateCategory(row._id, { status: next });
      else                          await api.updateTemplate(row._id, { status: next });
      toast.success(next === 'active' ? 'Activated' : 'Deactivated');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const duplicate = async (q) => {
    try {
      await api.createQuestion({
        ...toQuestionForm(q), _id: null,
        questionText: `${q.questionText} (copy)`, status: 'inactive',
      });
      toast.success('Copied — the new question starts inactive');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const removeQuestion = async () => {
    setDeleting(true);
    try {
      const d = (await api.deleteQuestion(delQ._id)).data;
      toast.success(d?.archived
        ? 'Archived — it has been answered before, so the history is kept'
        : 'Question deleted');
      setDelQ(null); load();
    } catch (e) { toast.error(e.message); } finally { setDeleting(false); }
  };
  const removeCategory = async () => {
    setDeleting(true);
    try { await api.deleteCategory(delC._id); toast.success('Category deleted'); setDelC(null); load(); }
    catch (e) { toast.error(e.message); } finally { setDeleting(false); }
  };
  const removeTemplate = async () => {
    setDeleting(true);
    try { await api.deleteTemplate(delT._id); toast.success('Template deleted'); setDelT(null); load(); }
    catch (e) { toast.error(e.message); } finally { setDeleting(false); }
  };

  const openNew = () => {
    setFormErr('');
    if (view === 'bank')            setQForm(blankQuestion());
    else if (view === 'categories') setCForm({ name: '', description: '', displayOrder: categories.length, status: 'active' });
    else                            setTForm({ name: '', description: '', instructions: '', questions: [] });
  };

  const pickStatus = (v) => { setStatus(status === v ? '' : v); setPage(1); };

  /** Activate or deactivate every ticked question — nothing it cannot see. */
  const bulkStatus = async (next) => {
    const ids = selection.ids;
    try {
      await Promise.all(ids.map((id) => api.updateQuestion(id, { status: next })));
      toast.success(`${ids.length} question${ids.length === 1 ? '' : 's'} ${next === 'active' ? 'activated' : 'deactivated'}`);
      selection.clear();
      load();
    } catch (e) { toast.error(e.message); }
  };

  // ── Columns ────────────────────────────────────────────────────────────────
  const bankCols = [
    {
      key: 'q', className: 'fbq', label: 'Question',
      render: (q) => (
        <div className="fbstack fbstack--plain">
          <b title={q.isRequired ? 'Required' : 'Optional'}>{q.questionText}</b>
          {q.helpText ? <small>{q.helpText}</small> : null}
          {q.options?.length ? <small>{q.options.map((o) => o.optionText).join(' · ')}</small> : null}
        </div>
      ),
    },
    {
      key: 'category', label: 'Category',
      render: (q) => {
        const hit = catAt.get(String(q.category));
        return hit ? <Tag tone={toneAt(hit.i)}>{hit.name}</Tag> : <Dash />;
      },
    },
    { key: 'type', label: 'Type', render: (q) => <Tag tone="blue">{typeShort(q.questionType)}</Tag> },
    {
      key: 'scored', label: 'Scored',
      render: (q) => (q.includeInScore
        ? <span className="fbtick" title="Counts towards the teacher's average">✓</span>
        : <span className="fbdash" title="Collected, but not part of any average">—</span>),
    },
    {
      key: 'status', label: 'Status',
      render: (q) => <OnOff on={q.status === 'active'} offWord={q.status === 'archived' ? 'Archived' : 'Inactive'} />,
    },
    {
      key: 'a', className: 'fbtable__acts', label: 'Actions',
      render: (q) => (
        <Acts>
          <IconBtn icon="pencil" label="Edit question"
            onClick={() => { setFormErr(''); setQForm(toQuestionForm(q)); }} />
          <IconBtn icon="files" label="Duplicate question" onClick={() => duplicate(q)} />
          <IconBtn icon="trash" label="Delete question" variant="danger" onClick={() => setDelQ(q)} />
          <Menu>
            <MenuItem icon={q.status === 'active' ? 'power' : 'checkCircle'} onClick={() => toggle(q, 'question')}>
              {q.status === 'active' ? 'Deactivate' : 'Activate'}
            </MenuItem>
            <MenuItem icon="clipboard" onClick={() => setView('templates')}>Add to a template</MenuItem>
          </Menu>
        </Acts>
      ),
    },
  ];

  const catCols = [
    {
      key: 'name', label: 'Category',
      render: (c) => {
        const i = categories.findIndex((x) => x._id === c._id);
        return (
          <span className="fbcatcell">
            <span className={`fbcatcell__i tint-${toneAt(i < 0 ? 0 : i)}`}><Icon name={categoryIcon(c.name)} size={17} /></span>
            <b>{c.name}</b>
          </span>
        );
      },
    },
    {
      key: 'desc', className: 'fbq', label: 'Description',
      render: (c) => (c.description ? <span className="fbdesc">{c.description}</span> : <Dash />),
    },
    {
      key: 'questions', label: 'Questions',
      render: (c) => (c.questionCount
        ? (
          <button type="button" className="fblinkbtn fblinkbtn--ink"
            title={`Show the ${c.questionCount} questions in ${c.name}`}
            onClick={() => setView('bank', { category: String(c._id) })}>
            {c.questionCount}
          </button>
        )
        : <Dash />),
    },
    { key: 'order', label: 'Order', render: (c) => <span className="fbord">{c.displayOrder ?? 0}</span> },
    { key: 'status', label: 'Status', render: (c) => <OnOff dot on={c.status === 'active'} /> },
    {
      key: 'a', className: 'fbtable__acts', label: 'Actions',
      render: (c) => (
        <Acts>
          <TextBtn icon="pencil" onClick={() => { setFormErr(''); setCForm({ ...c }); }}>Edit</TextBtn>
          <TextBtn icon={c.status === 'active' ? 'power' : 'checkCircle'} onClick={() => toggle(c, 'category')}>
            {c.status === 'active' ? 'Deactivate' : 'Activate'}
          </TextBtn>
          <Menu>
            <MenuItem icon="list" onClick={() => setView('bank', { category: String(c._id) })}>
              See its questions
            </MenuItem>
            <MenuSep />
            <MenuItem icon="trash" danger onClick={() => setDelC(c)}>Delete category</MenuItem>
          </Menu>
        </Acts>
      ),
    },
  ];

  const hero = HERO[view];

  if (loading && !questions.length && !categories.length) {
    return <div className="fbpage"><div className="fbloading"><Spinner /></div></div>;
  }

  return (
    <div className="fbpage">
      <Crumbs here={hero.title} trail={[{ to: `${base}/overview`, label: 'Teacher Feedback' }]}
        home={homeFor(base)} />

      <Hero icon={hero.icon} tone="purple" title={hero.title} subtitle={hero.subtitle}>
        <div className="fbvt" role="group" aria-label="What to manage">
          <button type="button" className={view === 'bank' ? 'is-on' : ''} onClick={() => setView('bank')}>
            <Icon name="checkSquare" size={15} /> Questions
          </button>
          <button type="button" className={view === 'categories' ? 'is-on' : ''} onClick={() => setView('categories')}>
            <Icon name="layers" size={15} /> Categories
          </button>
          <button type="button" className={view === 'templates' ? 'is-on' : ''} onClick={() => setView('templates')}>
            <Icon name="clipboard" size={15} /> Templates
          </button>
        </div>
        <button type="button" className="fbtb fbtb--primary" onClick={openNew}>
          <Icon name="plus" size={15} /> {hero.add}
        </button>
      </Hero>

      {error && <NoteBar tone="red" icon="alert">{error}</NoteBar>}

      {view === 'bank' && (
        <Stats>
          <Stat icon="fileDoc" tone="blue" value={counts.questions} label="Total Questions"
            caption="Across all categories" onClick={() => pickStatus('')} />
          <Stat icon="checkCircle" tone="green" value={counts.qActive} label="Active Questions"
            caption={counts.questions ? `${Math.round((counts.qActive / counts.questions) * 100)}% of total` : 'None yet'}
            onClick={() => pickStatus('active')} on={status === 'active'} />
          <Stat icon="clock" tone="purple" value={counts.qInactive} label="Inactive Questions"
            caption={counts.questions ? `${Math.round((counts.qInactive / counts.questions) * 100)}% of total` : 'None yet'}
            onClick={() => pickStatus('inactive')} on={status === 'inactive'} />
          <Stat icon="folder" tone="amber" value={counts.categories} label="Categories"
            caption="Organized by topic" onClick={() => setView('categories')} />
        </Stats>
      )}

      {view === 'categories' && (
        <Stats>
          <Stat icon="folder" tone="blue" value={counts.categories} label="Total Categories"
            caption="Organize your questions" onClick={() => pickStatus('')} />
          <Stat icon="checkCircle" tone="green" value={counts.cActive} label="Active Categories"
            caption={counts.categories ? `${Math.round((counts.cActive / counts.categories) * 100)}% of total` : 'None yet'}
            onClick={() => pickStatus('active')} on={status === 'active'} />
          <Stat icon="clock" tone="amber" value={counts.cInactive} label="Inactive Categories"
            caption={counts.categories ? `${Math.round((counts.cInactive / counts.categories) * 100)}% of total` : 'None yet'}
            onClick={() => pickStatus('inactive')} on={status === 'inactive'} />
          <Stat icon="chart" tone="purple" value={counts.catQuestions} label="Total Questions"
            caption="Across all categories" onClick={() => setView('bank')} />
        </Stats>
      )}

      {view === 'templates' && (
        <Stats>
          <Stat icon="clipboard" tone="purple" value={counts.templates}
            label={`Total Template${counts.templates === 1 ? '' : 's'}`}
            caption="Create and reuse templates" onClick={() => pickStatus('')} />
          <Stat icon="checkCircle" tone="green" value={counts.tActive}
            label={`Active Template${counts.tActive === 1 ? '' : 's'}`} caption="Currently available"
            onClick={() => pickStatus('active')} on={status === 'active'} />
          <Stat icon="package" tone="amber" value={counts.tInactive}
            label={`Inactive Template${counts.tInactive === 1 ? '' : 's'}`} caption="Not in use"
            onClick={() => pickStatus('inactive')} on={status === 'inactive'} />
          <Stat icon="repeat" tone="blue" value={counts.reused} label="Times Reused"
            caption="Across all campaigns" />
        </Stats>
      )}

      {!questions.length && !categories.length && !loading && (
        <NoteBar tone="blue" icon="info"
          action={(
            <button type="button" className="fbtb fbtb--primary" onClick={seed} disabled={seeding}>
              {seeding ? 'Adding…' : 'Load the standard set'}
            </button>
          )}>
          Nothing has been set up yet. The standard set is the two-minute teacher evaluation — eight
          categories, fourteen rating questions, a likes / improvements pair and an optional comment —
          which most schools then edit rather than write from scratch.
        </NoteBar>
      )}

      <div className="fbcard">
        <Toolbar>
          <Search value={search} onChange={setSearch} wide={view === 'templates'}
            placeholder={view === 'templates'
              ? 'Search template by name or description…'
              : `Search ${hero.nouns}…`} />

          {view === 'bank' && (
            <>
              <Pick value={cat} onChange={(v) => { setCat(v); setPage(1); }} all="All categories"
                label="Category" options={categories.map((c) => ({ value: c._id, label: c.name }))} />
              <Pick value={type} onChange={(v) => { setType(v); setPage(1); }} all="All types"
                label="Question type"
                options={QUESTION_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
            </>
          )}
          {view === 'templates' && (
            <Pick value={type} onChange={(v) => { setType(v); setPage(1); }} all="All types"
              label="Template type"
              options={[{ value: 'student_teacher', label: 'Student → Teacher' },
                        { value: 'parent_teacher', label: 'Parent → Teacher' }]} />
          )}

          <Pick value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            all={view === 'categories' ? 'All Statuses' : 'All statuses'} label="Status"
            options={STATUS_OPTIONS} />

          {view === 'bank' && (
            <button type="button" className="fbtb" onClick={seed} disabled={seeding}
              title="Adds the standard categories, questions and template. Nothing already here is overwritten.">
              <Icon name="download" size={14} /> {seeding ? 'Loading…' : 'Load defaults'}
            </button>
          )}

          <Spacer />

          <SortBy value={sort} onChange={(v) => { setSort(v); setPage(1); }}
            dflt={view === 'categories' ? 'order' : 'newest'}
            options={view === 'bank' ? BANK_SORTS : view === 'categories' ? CAT_SORTS : TPL_SORTS} />

          {view === 'templates' && (
            <ViewToggle value={layout} onChange={setLayout} options={[
              { value: 'list', label: 'List', icon: 'list' },
              { value: 'card', label: 'Card', icon: 'grid' },
            ]} />
          )}
        </Toolbar>

        {view === 'templates' ? (
          <div className="fbtplwrap">
            {shown.length ? (
              <div className={`fbtpls${layout === 'card' ? ' fbtpls--card' : ''}`}>
                {shown.map((t) => (
                  <TemplateCard key={t._id} tpl={t} base={base}
                    onEdit={() => {
                      setFormErr('');
                      setTForm({
                        _id: t._id, name: t.name, description: t.description || '',
                        instructions: t.instructions || '',
                        questions: (t.questions || []).map((q) => String(q.question)),
                        status: t.status,
                      });
                    }}
                    onToggle={() => toggle(t, 'template')}
                    onDelete={() => setDelT(t)} />
                ))}
              </div>
            ) : (
              <EmptyState icon={filtered ? '🔍' : '🧩'}
                title={filtered ? 'No templates match these filters' : 'No templates yet'}
                message={filtered
                  ? 'Try another search term, type or status.'
                  : 'A template is a saved question list. Build one and every campaign can start from it in a click.'}
                action={filtered
                  ? <button type="button" className="fbtb" onClick={clear}>Clear filters</button>
                  : <button type="button" className="fbtb fbtb--primary" onClick={openNew}>New Template</button>} />
            )}
          </div>
        ) : (
          <>
          {view === 'bank' && (
            <SelectionBar count={selection.ids.length} noun="question" onClear={selection.clear}>
              <button type="button" className="fbtb" onClick={() => bulkStatus('active')}>
                <Icon name="checkCircle" size={14} /> Activate
              </button>
              <button type="button" className="fbtb" onClick={() => bulkStatus('inactive')}>
                <Icon name="power" size={14} /> Deactivate
              </button>
            </SelectionBar>
          )}
          <Table
            columns={view === 'bank' ? bankCols : catCols}
            rows={shown}
            loading={loading}
            startIndex={start}
            selection={view === 'bank' ? selection : undefined}
            empty={(
              <EmptyState icon={filtered ? '🔍' : view === 'bank' ? '❓' : '🗂'}
                title={filtered ? `No ${hero.nouns} match these filters` : `No ${hero.nouns} yet`}
                message={filtered
                  ? 'Try another category, type, status or search term.'
                  : 'Load the standard set to start from the usual eight categories, or write your own.'}
                action={filtered
                  ? <button type="button" className="fbtb" onClick={clear}>Clear filters</button>
                  : (
                    <button type="button" className="fbtb fbtb--primary" onClick={openNew}>
                      Add the first {hero.noun}
                    </button>
                  )} />
            )}
          />
          </>
        )}

        <Foot page={Math.min(page, pages)} pages={pages} total={rows.length} limit={limit}
          count={shown.length} noun={hero.noun} plural={hero.nouns} onPage={setPage} />
      </div>

      {view === 'categories' && (
        <div className="fbgrid fbgrid--2">
          <TipCard icon="sparkle" tone="amber" title="Tip">
            Groups help you analyze feedback by topic and identify key strengths and improvement areas.
          </TipCard>
          <TipCard icon="settings" tone="purple" title="Manage Questions"
            action={(
              <button type="button" className="fbtb" onClick={() => setView('bank')}>
                Go to Question Bank <Icon name="arrowRight" size={14} />
              </button>
            )}>
            Add or edit questions in the Question Bank and assign them to the appropriate category.
          </TipCard>
        </div>
      )}

      {view === 'bank' && (
        <NoteBar tone="purple" icon="info">
          Only questions marked <b>Scored</b> produce a rating out of 5 — written answers and pick-lists are
          collected and reported, but never averaged. A question that has already been answered is archived
          rather than deleted, so past campaigns stay readable.
        </NoteBar>
      )}

      {view === 'templates' && (
        <NoteBar tone="purple" icon="sparkle"
          title="Use templates to quickly create consistent feedback campaigns."
          action={<TextBtn icon="megaphone" to={`${base}/campaigns`}>Start a campaign</TextBtn>}>
          You can build different templates for different classes, subjects or evaluation types. A campaign
          copies the questions when it is created, so editing a template never disturbs one already running.
        </NoteBar>
      )}

      <QuestionForm open={!!qForm} form={qForm} setForm={setQForm} categories={categories}
        saving={saving} error={formErr}
        onClose={() => { setQForm(null); setFormErr(''); }} onSave={saveQuestion} />
      <CategoryForm open={!!cForm} form={cForm} setForm={setCForm} categories={categories}
        saving={saving} error={formErr}
        onClose={() => { setCForm(null); setFormErr(''); }} onSave={saveCategory} />
      <TemplateForm open={!!tForm} form={tForm} setForm={setTForm}
        questions={questions.filter((q) => q.status === 'active')} categories={categories}
        saving={saving} error={formErr}
        onClose={() => { setTForm(null); setFormErr(''); }} onSave={saveTemplate} />

      <DeleteQuestionDialog question={delQ} deleting={deleting}
        onClose={() => setDelQ(null)} onConfirm={removeQuestion} />
      <DeleteCategoryDialog category={delC} deleting={deleting}
        onClose={() => setDelC(null)} onConfirm={removeCategory} />
      <DeleteTemplateDialog template={delT} deleting={deleting}
        onClose={() => setDelT(null)} onConfirm={removeTemplate} />
    </div>
  );
}

/** One saved question set: what it asks, how long it takes, and when it was used. */
const TemplateCard = ({ tpl, onEdit, onToggle, onDelete, base }) => {
  const n = tpl.questionCount ?? (tpl.questions?.length || 0);
  const mins = minutesFor(n);
  return (
    <article className="fbtpl">
      <span className="fbtpl__icon tint-purple"><Icon name="fileDoc" size={22} /></span>
      <div className="fbtpl__body">
        <h3>
          {tpl.name}
          {tpl.isDefault ? <span className="fbtpl__def">default</span> : null}
        </h3>
        {tpl.description ? <p>{tpl.description}</p> : null}
        <div className="fbtpl__chips">
          <span className="fbtpl__chip fbtpl__chip--primary">
            {tpl.feedbackType === 'parent_teacher' ? 'Parent → Teacher' : 'Student → Teacher'}
          </span>
          <span className="fbtpl__chip">{n} question{n === 1 ? '' : 's'}</span>
          <span className="fbtpl__chip">
            <Icon name="clock" size={13} /> ~ {mins} minute{mins === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      <div className="fbtpl__meta">
        <div>
          <label>Status</label>
          <span><OnOff on={tpl.status === 'active'} /></span>
        </div>
        <div>
          <label>Created on</label>
          <span>{fmtDate(tpl.createdAt) || <Dash />}</span>
        </div>
        <div>
          <label>Last used</label>
          <span>{tpl.lastUsedAt ? fmtDate(tpl.lastUsedAt) : <Dash />}</span>
        </div>
        <Menu>
          <MenuItem icon="pencil" onClick={onEdit}>Edit template</MenuItem>
          <MenuItem icon="megaphone" to={`${base}/campaigns`}>Start a campaign from it</MenuItem>
          {!tpl.isDefault && (
            <MenuItem icon={tpl.status === 'active' ? 'power' : 'checkCircle'} onClick={onToggle}>
              {tpl.status === 'active' ? 'Deactivate' : 'Activate'}
            </MenuItem>
          )}
          {!tpl.isDefault && <MenuSep />}
          {!tpl.isDefault && <MenuItem icon="trash" danger onClick={onDelete}>Delete template</MenuItem>}
        </Menu>
      </div>
    </article>
  );
};
