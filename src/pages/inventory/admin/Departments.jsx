import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Confirm } from '../../../components/ui/index';

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
const empty = { name: '', financialYear: '', annualBudget: '', headName: '' };

export default function InventoryDepartments() {
  const { data: depts, loading, refetch } = useFetch(api.getDepartments);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel]       = useState(null);

  const open = (row) => {
    if (row) { setEditId(row._id); setForm({ name: row.name, financialYear: row.financialYear || '', annualBudget: row.annualBudget || '', headName: row.headName || '' }); }
    else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, annualBudget: Number(form.annualBudget) || 0 };
      if (editId) await api.updateDepartment(editId, payload);
      else await api.createDepartment(payload);
      toast.success(editId ? 'Department updated' : 'Department created');
      setModal(false); refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteDepartment(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const columns = [
    { key: 'name', label: 'Department', render: r => <div><strong>{r.name}</strong>{r.headName && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Head: {r.headName}</div>}</div> },
    { key: 'financialYear', label: 'FY', render: r => r.financialYear || '—' },
    { key: 'annualBudget', label: 'Budget', render: r => fmt(r.annualBudget) },
    { key: 'usedBudget', label: 'Used', render: r => fmt(r.usedBudget) },
    { key: 'remaining', label: 'Remaining', render: r => {
      const rem = (r.annualBudget || 0) - (r.usedBudget || 0);
      return <strong style={{ color: rem < 0 ? 'var(--danger,#ef4444)' : 'var(--success,#22c55e)' }}>{fmt(rem)}</strong>;
    }},
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Departments & Budgets" subtitle="Yearly budget control per department"
        action={<Button onClick={() => open()}>+ Add Department</Button>} />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={depts} loading={loading} emptyIcon="💼" emptyTitle="No departments yet" />
      </div></div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Department' : 'Add Department'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="dept-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="dept-form" onSubmit={save}>
          <div className="form-group">
            <label className="form-label required">Department Name</label>
            <input className="form-control" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Science Lab, Sports…" />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Financial Year</label><input className="form-control" value={form.financialYear} onChange={e => set('financialYear', e.target.value)} placeholder="2026-2027" /></div>
            <div className="form-group"><label className="form-label">Annual Budget (₹)</label><input type="number" className="form-control" value={form.annualBudget} onChange={e => set('annualBudget', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Department Head</label><input className="form-control" value={form.headName} onChange={e => set('headName', e.target.value)} /></div>
          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Used budget is managed automatically as purchase orders are placed.</div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Delete department" message={`Delete "${del?.name}"?`} />
    </div>
  );
}
