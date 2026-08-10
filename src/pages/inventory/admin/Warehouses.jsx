import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Confirm } from '../../../components/ui/index';

const empty = { name: '', campus: 'Main Campus', location: '', capacity: '' };

export default function InventoryWarehouses() {
  const { data: whs, loading, refetch } = useFetch(api.getWarehouses);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel]       = useState(null);

  const open = (row) => {
    if (row) { setEditId(row._id); setForm({ name: row.name, campus: row.campus || '', location: row.location || '', capacity: row.capacity || '' }); }
    else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, capacity: Number(form.capacity) || 0 };
      if (editId) await api.updateWarehouse(editId, payload);
      else await api.createWarehouse(payload);
      toast.success(editId ? 'Warehouse updated' : 'Warehouse created');
      setModal(false); refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteWarehouse(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const columns = [
    { key: 'name', label: 'Warehouse / Store', render: r => <strong>{r.name}</strong> },
    { key: 'campus', label: 'Campus' },
    { key: 'location', label: 'Location', render: r => r.location || '—' },
    { key: 'capacity', label: 'Capacity', render: r => r.capacity ? r.capacity.toLocaleString() : '—' },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Warehouses & Stores" subtitle="Storage locations across campuses"
        action={<Button onClick={() => open()}>+ Add Warehouse</Button>} />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={whs} loading={loading} emptyIcon="🏬" emptyTitle="No warehouses yet" />
      </div></div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Warehouse' : 'Add Warehouse'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="wh-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="wh-form" onSubmit={save}>
          <div className="form-group">
            <label className="form-label required">Name</label>
            <input className="form-control" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Main Store, Sports Store…" />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Campus</label><input className="form-control" required value={form.campus} onChange={e => set('campus', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Capacity</label><input type="number" className="form-control" value={form.capacity} onChange={e => set('capacity', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Location</label><input className="form-control" value={form.location} onChange={e => set('location', e.target.value)} /></div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Delete warehouse" message={`Delete "${del?.name}"?`} />
    </div>
  );
}
