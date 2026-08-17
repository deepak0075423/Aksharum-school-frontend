import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/feedback.api';
import {
  PageHeader, Table, Button, Modal, Badge, Input, Textarea, Confirm, Alert, Spinner,
} from '../../../components/ui/index';

// Saved questionnaires. Creating a campaign from a template copies the question
// list onto the campaign, so editing a template never disturbs a running one.
export default function Templates() {
  const [rows, setRows]     = useState([]);
  const [questions, setQs]  = useState([]);
  const [loading, setLoad]  = useState(true);
  const [form, setForm]     = useState(null);
  const [del, setDel]       = useState(null);

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const [t, q] = await Promise.all([api.getTemplates(), api.getQuestions({ limit: 100, status: 'active' })]);
      setRows(t.data ?? t);
      setQs((q.data ?? q).data || []);
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (f) => {
    if (!f.name.trim()) return toast.error('Template name is required');
    if (!f.questions.length) return toast.error('Pick at least one question');
    try {
      const payload = { ...f, questions: f.questions.map((id) => ({ question: id })) };
      if (f._id) { await api.updateTemplate(f._id, payload); toast.success('Template updated'); }
      else       { await api.createTemplate(payload);        toast.success('Template created'); }
      setForm(null); load();
    } catch (err) { toast.error(err.message); }
  };

  const remove = async () => {
    try { await api.deleteTemplate(del._id); toast.success('Template deleted'); load(); }
    catch (err) { toast.error(err.message); } finally { setDel(null); }
  };

  return (
    <div className="page">
      <PageHeader
        title="Feedback Templates"
        subtitle="Save a question set once and reuse it for every campaign"
        action={<Button onClick={() => setForm({ name: '', description: '', instructions: '', questions: [] })}>+ New Template</Button>}
      />

      {!loading && !questions.length && (
        <Alert variant="warning">
          There are no active questions yet — add some in the Question Bank (or load the defaults) before building a template.
        </Alert>
      )}

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table
          columns={[
            {
              key: 'name', label: 'Template',
              render: (r) => (
                <div>
                  <strong>{r.name}</strong>{r.isDefault && <Badge variant="info"> default</Badge>}
                  {r.description && <div className="text-xs text-muted">{r.description}</div>}
                </div>
              ),
            },
            { key: 'questionCount', label: 'Questions' },
            { key: 'feedbackType', label: 'Type', render: (r) => (r.feedbackType === 'parent_teacher' ? 'Parent → Teacher' : 'Student → Teacher') },
            { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'active' ? 'success' : 'muted'}>{r.status}</Badge> },
            {
              key: 'a', label: '',
              render: (r) => (
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="secondary" onClick={() => setForm({
                    _id: r._id, name: r.name, description: r.description || '', instructions: r.instructions || '',
                    questions: (r.questions || []).map((q) => String(q.question)), status: r.status,
                  })}>Edit</Button>
                  {!r.isDefault && <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>}
                </div>
              ),
            },
          ]}
          data={rows}
          loading={loading}
          emptyIcon="🧩"
          emptyTitle="No templates"
        />
      </div></div>

      {form && (
        <Modal open onClose={() => setForm(null)} title={form._id ? 'Edit Template' : 'New Template'} maxWidth={640}
          footer={<>
            <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={() => save(form)}>Save</Button>
          </>}>
          <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Textarea label="Description" rows={2} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Textarea label="Default instructions for students" rows={2} value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })} />

          <div className="form-group">
            <label className="form-label required">
              Questions <span className="text-muted text-xs">({form.questions.length} selected)</span>
            </label>
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8 }}>
              {questions.map((q) => {
                const on = form.questions.includes(q._id);
                return (
                  <label key={q._id} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 4px',
                    borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: '.84rem',
                  }}>
                    <input type="checkbox" checked={on} style={{ marginTop: 4 }}
                      onChange={() => setForm({
                        ...form,
                        questions: on ? form.questions.filter((x) => x !== q._id) : [...form.questions, q._id],
                      })} />
                    <span>
                      {q.questionText}
                      <span className="text-xs text-muted"> · {q.categoryName || 'No category'} · {q.questionType.replace('_', ' ')}</span>
                    </span>
                  </label>
                );
              })}
              {!questions.length && <p className="text-sm text-muted">No active questions.</p>}
            </div>
            <div className="form-hint">Questions appear on the student form in the order shown here.</div>
          </div>
        </Modal>
      )}

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Delete template?" message="Campaigns already created from this template are not affected." />
    </div>
  );
}
