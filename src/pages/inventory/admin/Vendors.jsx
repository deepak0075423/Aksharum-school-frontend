import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge } from '../../../components/ui/index';

const empty = {
  name: '', gstNumber: '', pan: '', contactPerson: '', email: '', phone: '', address: '',
  bankDetails: { accountName: '', accountNumber: '', ifsc: '', bankName: '' },
};

const Stars = ({ rating }) => {
  const r = Math.round(rating || 0);
  return <span title={`${rating || 0} / 5`}>{'★'.repeat(r)}{'☆'.repeat(5 - r)}</span>;
};

export default function InventoryVendors() {
  const { data: vendors, loading, refetch } = useFetch(api.getVendors);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel]       = useState(null);

  const open = (row) => {
    if (row) { setEditId(row._id); setForm({ ...empty, ...row, bankDetails: { ...empty.bankDetails, ...(row.bankDetails || {}) } }); }
    else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) await api.updateVendor(editId, form);
      else await api.createVendor(form);
      toast.success(editId ? 'Vendor updated' : 'Vendor created');
      setModal(false); refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteVendor(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setB = (k, v) => setForm(f => ({ ...f, bankDetails: { ...f.bankDetails, [k]: v } }));

  const columns = [
    { key: 'name', label: 'Vendor', render: r => <div><strong>{r.name}</strong>{r.contactPerson && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.contactPerson}</div>}</div> },
    { key: 'gstNumber', label: 'GST', render: r => r.gstNumber || '—' },
    { key: 'phone', label: 'Contact', render: r => <div>{r.phone || '—'}{r.email && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.email}</div>}</div> },
    { key: 'orders', label: 'Orders', render: r => r.performance?.totalOrders || 0 },
    { key: 'rating', label: 'Rating', render: r => <span style={{ color: '#f59e0b' }}><Stars rating={r.performance?.rating} /></span> },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Vendors" subtitle="Suppliers & their delivery performance"
        action={<Button onClick={() => open()}>+ Add Vendor</Button>} />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={vendors} loading={loading} emptyIcon="🏭" emptyTitle="No vendors yet" />
      </div></div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Vendor' : 'Add Vendor'} maxWidth={640}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="vendor-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="vendor-form" onSubmit={save}>
          <div className="form-group">
            <label className="form-label required">Company Name</label>
            <input className="form-control" required value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">GST Number</label><input className="form-control" value={form.gstNumber} onChange={e => set('gstNumber', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">PAN</label><input className="form-control" value={form.pan} onChange={e => set('pan', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Contact Person</label><input className="form-control" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Email</label><input className="form-control" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Address</label><textarea className="form-control" rows={2} value={form.address} onChange={e => set('address', e.target.value)} /></div>
          <div style={{ fontSize: '.8rem', fontWeight: 600, margin: '8px 0', color: 'var(--text-muted)' }}>Bank Details</div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Account Name</label><input className="form-control" value={form.bankDetails.accountName} onChange={e => setB('accountName', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Account Number</label><input className="form-control" value={form.bankDetails.accountNumber} onChange={e => setB('accountNumber', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">IFSC</label><input className="form-control" value={form.bankDetails.ifsc} onChange={e => setB('ifsc', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Bank Name</label><input className="form-control" value={form.bankDetails.bankName} onChange={e => setB('bankName', e.target.value)} /></div>
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Delete vendor" message={`Delete "${del?.name}"?`} />
    </div>
  );
}
