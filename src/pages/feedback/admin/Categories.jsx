import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/feedback.api';
import {
  PageHeader, Table, Button, Modal, Badge, Input, Textarea, Confirm, Alert,
} from '../../../components/ui/index';

// Configurable feedback categories (spec §13). A category referenced by
// historical feedback can never be deleted — the server steers to archiving.
export default function Categories() {
  const [rows, setRows]    = useState([]);
  const [loading, setLoad] = useState(true);
  const [form, setForm]    = useState(null);
  const [del, setDel]      = useState(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoad(true);
    try { setRows((await api.getCategories()).data ?? []); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seed = async () => {
    setSeeding(true);
    try {
      const d = (await api.seedDefaults()).data;
      toast.success(`Added ${d.categories} categories and ${d.questions} questions`);
      load();
    } catch (err) { toast.error(err.message); } finally { setSeeding(false); }
  };

  const save = async (f) => {
    try {
      if (f._id) { await api.updateCategory(f._id, f); toast.success('Category updated'); }
      else       { await api.createCategory(f);        toast.success('Category added'); }
      setForm(null); load();
    } catch (err) { toast.error(err.message); }
  };

  const toggle = async (r) => {
    try {
      await api.updateCategory(r._id, { status: r.status === 'active' ? 'inactive' : 'active' });
      load();
    } catch (err) { toast.error(err.message); }
  };

  const remove = async () => {
    try { await api.deleteCategory(del._id); toast.success('Category deleted'); load(); }
    catch (err) { toast.error(err.message); } finally { setDel(null); }
  };

  const columns = [
    {
      key: 'name', label: 'Category',
      render: (r) => (
        <div>
          <strong>{r.name}</strong>
          {r.description && <div className="text-xs text-muted">{r.description}</div>}
        </div>
      ),
    },
    { key: 'questionCount', label: 'Questions', render: (r) => r.questionCount || 0 },
    { key: 'displayOrder', label: 'Order' },
    {
      key: 'status', label: 'Status',
      render: (r) => <Badge variant={{ active: 'success', inactive: 'muted', archived: 'muted' }[r.status]}>{r.status}</Badge>,
    },
    {
      key: 'a', label: '',
      render: (r) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => setForm({ ...r })}>Edit</Button>
          <Button size="sm" variant="secondary" onClick={() => toggle(r)}>
            {r.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Feedback Categories"
        subtitle="Group questions so results can be reported per category"
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="secondary" onClick={seed} loading={seeding}>Load defaults</Button>
            <Button onClick={() => setForm({ name: '', description: '', displayOrder: rows.length })}>+ New Category</Button>
          </div>
        }
      />

      {!loading && !rows.length && (
        <Alert variant="info">
          No categories yet. "Load defaults" adds the eight standard ones: Teaching Quality, Subject Knowledge,
          Communication, Classroom Management, Student Engagement, Student Support, Assessment and Overall.
        </Alert>
      )}

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🗂" emptyTitle="No categories" />
      </div></div>

      {form && (
        <Modal open onClose={() => setForm(null)} title={form._id ? 'Edit Category' : 'New Category'} maxWidth={480}
          footer={<>
            <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={() => (form.name.trim() ? save(form) : toast.error('Category name is required'))}>Save</Button>
          </>}>
          <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Textarea label="Description" rows={2} value={form.description || ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Display order" type="number" value={form.displayOrder ?? 0}
            onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} />
        </Modal>
      )}

      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={remove}
        title="Delete category?"
        message="A category used by any question or by existing feedback cannot be deleted — archive it instead."
      />
    </div>
  );
}
