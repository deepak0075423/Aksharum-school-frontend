import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/feedback.api';
import {
  PageHeader, Table, Button, Modal, Badge, Pagination, Input, Select, Textarea, Confirm, Alert,
} from '../../../components/ui/index';

const TYPES = [
  { value: 'rating_5',        label: '1–5 Rating' },
  { value: 'emoji_5',         label: 'Emoji Rating (1–5)' },
  { value: 'yes_no',          label: 'Yes / No' },
  { value: 'multiple_choice', label: 'Multiple Choice (pick one)' },
  { value: 'checkbox',        label: 'Checkbox (pick many)' },
  { value: 'text',            label: 'Text' },
];
const NEEDS_OPTIONS = ['multiple_choice', 'checkbox'];

// The reusable question bank (spec §12). Questions are shared across campaigns;
// a campaign snapshots the ones it uses, so editing here never rewrites history.
export default function QuestionBank() {
  const [rows, setRows]   = useState([]);
  const [cats, setCats]   = useState([]);
  const [pg, setPg]       = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad]= useState(true);
  const [filters, setFilters] = useState({ category: '', questionType: '', search: '' });
  const [form, setForm]   = useState(null);
  const [del, setDel]     = useState(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const res = await api.getQuestions({ page, limit: 50, ...filters });
      const d = res.data ?? res;
      setRows(d.data || []);
      setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters.category, filters.questionType, filters.search]);

  const loadCats = useCallback(() => {
    api.getCategories({ status: 'active' }).then((r) => setCats(r.data ?? r)).catch(() => {});
  }, []);

  useEffect(() => { load(1); }, [load]);
  useEffect(() => { loadCats(); }, [loadCats]);

  const seed = async () => {
    setSeeding(true);
    try {
      const r = await api.seedDefaults();
      const d = r.data ?? r;
      toast.success(`Added ${d.categories} categories, ${d.questions} questions and ${d.templates} template(s)`);
      load(1); loadCats();
    } catch (err) { toast.error(err.message); } finally { setSeeding(false); }
  };

  const remove = async () => {
    try {
      const r = await api.deleteQuestion(del._id);
      const d = r.data ?? r;
      toast.success(d.archived ? 'Question archived (it is used by existing feedback)' : 'Question deleted');
      load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setDel(null); }
  };

  const columns = [
    {
      key: 'q', label: 'Question',
      render: (r) => (
        <div>
          <div style={{ fontSize: '.87rem' }}>{r.questionText}{r.isRequired && <span style={{ color: 'var(--danger)' }}> *</span>}</div>
          {r.helpText && <div className="text-xs text-muted">{r.helpText}</div>}
          {!!r.options?.length && (
            <div className="text-xs text-muted">{r.options.map((o) => o.optionText).join(' · ')}</div>
          )}
        </div>
      ),
    },
    { key: 'categoryName', label: 'Category', render: (r) => r.categoryName || <span className="text-muted">—</span> },
    { key: 'questionType', label: 'Type', render: (r) => <Badge variant="info">{TYPES.find((t) => t.value === r.questionType)?.label || r.questionType}</Badge> },
    { key: 'score', label: 'Scored', render: (r) => (r.includeInScore ? '✓' : '—') },
    { key: 'status', label: 'Status', render: (r) => <Badge variant={{ active: 'success', inactive: 'muted', archived: 'muted' }[r.status]}>{r.status}</Badge> },
    {
      key: 'a', label: '',
      render: (r) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => setForm(toForm(r))}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Question Bank"
        subtitle="Reusable questions shared across every campaign"
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="secondary" onClick={seed} loading={seeding}>Load defaults</Button>
            <Button onClick={() => setForm(blank())}>+ New Question</Button>
          </div>
        }
      />

      {!loading && !rows.length && !filters.search && !filters.category && (
        <Alert variant="info">
          The question bank is empty. "Load defaults" adds the standard 2-minute teacher evaluation —
          14 rating questions across 8 categories, plus likes / improvements and an optional comment.
        </Alert>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-control" style={{ maxWidth: 240 }} placeholder="Search questions…"
          value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        <select className="form-control" style={{ maxWidth: 200 }} value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 200 }} value={filters.questionType}
          onChange={(e) => setFilters((f) => ({ ...f, questionType: e.target.value }))}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="❓" emptyTitle="No questions" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      {form && <QuestionForm form={form} setForm={setForm} cats={cats} onSaved={() => { setForm(null); load(pg.page); }} />}

      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={remove}
        title="Delete question?"
        message="If this question has ever been answered it will be archived instead of deleted, so historical feedback stays intact."
      />
    </div>
  );
}

const blank = () => ({
  _id: null, questionText: '', category: '', questionType: 'rating_5',
  isRequired: true, includeInScore: true, helpText: '', maxLength: 1000,
  displayOrder: 0, status: 'active', options: [],
});

const toForm = (r) => ({
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
});

function QuestionForm({ form, setForm, cats, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const needsOptions = NEEDS_OPTIONS.includes(form.questionType);

  const setOption = (i, patch) => setForm((f) => ({
    ...f, options: f.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
  }));

  const save = async () => {
    const e = {};
    if (!form.questionText.trim()) e.questionText = 'Question text is required';
    if (needsOptions && form.options.filter((o) => o.optionText.trim()).length < 2) e.options = 'Add at least two options';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const payload = { ...form, options: form.options.filter((o) => o.optionText.trim()) };
      if (form._id) { await api.updateQuestion(form._id, payload); toast.success('Question updated'); }
      else          { await api.createQuestion(payload);           toast.success('Question added'); }
      onSaved();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={() => setForm(null)} title={form._id ? 'Edit Question' : 'New Question'} maxWidth={620}
      footer={<>
        <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
        <Button onClick={save} loading={saving}>Save</Button>
      </>}>
      <Textarea label="Question" required rows={2} value={form.questionText} error={errors.questionText}
        onChange={(e) => set('questionText', e.target.value)} placeholder="e.g. Explains concepts clearly" />

      <div className="form-row form-row-2">
        <Select label="Category" value={form.category} onChange={(e) => set('category', e.target.value)}>
          <option value="">No category</option>
          {cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </Select>
        <Select label="Question Type" value={form.questionType} onChange={(e) => {
          const t = e.target.value;
          set('questionType', t);
          set('includeInScore', !['text', 'checkbox', 'multiple_choice'].includes(t));
          if (NEEDS_OPTIONS.includes(t) && !form.options.length) set('options', [{ optionText: '' }, { optionText: '' }]);
        }}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </div>

      <Input label="Help text" value={form.helpText} onChange={(e) => set('helpText', e.target.value)}
        hint="Shown under the question on the student form" />

      {form.questionType === 'text' && (
        <Input label="Maximum characters" type="number" min={50} max={2000} value={form.maxLength}
          onChange={(e) => set('maxLength', e.target.value)} />
      )}

      {needsOptions && (
        <div className="form-group">
          <label className="form-label required">Options</label>
          {form.options.map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input className="form-control" value={o.optionText} placeholder={`Option ${i + 1}`}
                onChange={(e) => setOption(i, { optionText: e.target.value })} />
              <label className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={!!o.allowsFreeText} onChange={(e) => setOption(i, { allowsFreeText: e.target.checked })} />
                free text
              </label>
              <Button size="sm" variant="secondary" onClick={() => set('options', form.options.filter((_, idx) => idx !== i))}>✕</Button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => set('options', [...form.options, { optionText: '' }])}>+ Add option</Button>
          {errors.options && <div className="form-error">{errors.options}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem' }}>
          <input type="checkbox" checked={form.isRequired} onChange={(e) => set('isRequired', e.target.checked)} />
          Required
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem' }}>
          <input type="checkbox" checked={form.includeInScore} onChange={(e) => set('includeInScore', e.target.checked)} />
          Counts towards the rating
        </label>
        {form._id && (
          <Select label="" value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </Select>
        )}
      </div>
    </Modal>
  );
}
