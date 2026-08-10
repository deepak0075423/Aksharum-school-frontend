import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge } from '../../../components/ui/index';

const empty = { name: '', parent: '', description: '' };

export default function InventoryCategories() {
  const { data: cats, loading, refetch } = useFetch(api.getCategories);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel]       = useState(null);

  const list = cats || [];
  const parents = list.filter(c => !c.parent);

  const open = (row) => {
    if (row) { setEditId(row._id); setForm({ name: row.name, parent: row.parent?._id || '', description: row.description || '' }); }
    else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, parent: form.parent || null };
      if (editId) await api.updateCategory(editId, payload);
      else await api.createCategory(payload);
      toast.success(editId ? 'Category updated' : 'Category created');
      setModal(false); refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteCategory(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const columns = [
    { key: 'name', label: 'Name', render: r => <strong>{r.name}</strong> },
    { key: 'parent', label: 'Type', render: r => r.parent ? <Badge variant="info">Sub of {r.parent.name}</Badge> : <Badge variant="primary">Category</Badge> },
    { key: 'description', label: 'Description', render: r => r.description || '—' },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Categories & Sub-Categories" subtitle="Classify inventory items"
        action={<Button onClick={() => open()}>+ Add Category</Button>} />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={list} loading={loading} emptyIcon="🗂" emptyTitle="No categories yet" />
      </div></div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Category' : 'Add Category'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="cat-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="cat-form" onSubmit={save}>
          <div className="form-group">
            <label className="form-label required">Name</label>
            <input className="form-control" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Parent Category (optional — makes this a sub-category)</label>
            <select className="form-control" value={form.parent} onChange={e => setForm(f => ({ ...f, parent: e.target.value }))}>
              <option value="">— None (top-level) —</option>
              {parents.filter(p => p._id !== editId).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Delete category" message={`Delete "${del?.name}"? This cannot be undone.`} />
    </div>
  );
}
