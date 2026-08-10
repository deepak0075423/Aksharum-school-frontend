import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge } from '../../../components/ui/index';

const empty = { name: '', description: '', basis: 'flat', frequency: 'monthly', amount: '', lateFeePerDay: '', siblingDiscountPct: '', zones: [] };
const newZone = () => ({ name: '', maxDistanceKm: '', amount: '' });

export default function TransportFeePlans() {
  const { data: plans, loading, refetch } = useFetch(api.getFeePlans);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setZone = (i, k, v) => setForm(f => ({ ...f, zones: f.zones.map((z, j) => j === i ? { ...z, [k]: v } : z) }));
  const zoned = ['distance', 'zone'].includes(form.basis);

  const open = (row) => {
    if (row) setEditId(row._id), setForm({ ...empty, ...row, zones: (row.zones || []).map(z => ({ ...newZone(), ...z })) });
    else setEditId(null), setForm(empty);
    setModal(true);
  };
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { const p = { ...form, amount: +form.amount || 0, lateFeePerDay: +form.lateFeePerDay || 0, siblingDiscountPct: +form.siblingDiscountPct || 0,
      zones: form.zones.filter(z => z.name).map(z => ({ ...z, maxDistanceKm: +z.maxDistanceKm || 0, amount: +z.amount || 0 })) };
      if (editId) await api.updateFeePlan(editId, p); else await api.createFeePlan(p);
      toast.success('Saved'); setModal(false); refetch();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { await api.deleteFeePlan(del._id); toast.success('Deleted'); setDel(null); refetch(); } catch (err) { toast.error(err.message); setDel(null); } };

  const columns = [
    { key: 'name', label: 'Plan', render: r => <div><strong>{r.name}</strong>{r.description && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.description}</div>}</div> },
    { key: 'basis', label: 'Basis', render: r => <Badge variant="info">{r.basis}</Badge> },
    { key: 'freq', label: 'Frequency', render: r => r.frequency },
    { key: 'amount', label: 'Amount', render: r => ['distance','zone'].includes(r.basis) ? <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{r.zones?.length || 0} bands</span> : `₹${(r.amount||0).toLocaleString()}` },
    { key: 'a', label: '', render: r => <div style={{ display: 'flex', gap: 6 }}>
      <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
      <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button></div> },
  ];

  return (
    <div className="page">
      <PageHeader title="Transport Fee Plans" subtitle="Flat, route, stop, distance & zone-based fee structures"
        action={<Button onClick={() => open()}>+ Add Plan</Button>} />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={plans} loading={loading} emptyIcon="🏷️" emptyTitle="No fee plans yet" />
      </div></div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Fee Plan' : 'Add Fee Plan'} maxWidth={640}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button form="fp-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="fp-form" onSubmit={save}>
          <div className="form-group"><label className="form-label required">Plan Name</label><input className="form-control" required value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Basis</label>
              <select className="form-control" value={form.basis} onChange={e => set('basis', e.target.value)}>{['flat','route','stop','distance','zone'].map(b => <option key={b} value={b}>{b}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Frequency</label>
              <select className="form-control" value={form.frequency} onChange={e => set('frequency', e.target.value)}>{['monthly','quarterly','yearly','one_time'].map(b => <option key={b} value={b}>{b}</option>)}</select></div>
          </div>
          {!zoned && <div className="form-group"><label className="form-label">Amount (₹)</label><input type="number" className="form-control" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>}
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Late Fee / day (₹)</label><input type="number" className="form-control" value={form.lateFeePerDay} onChange={e => set('lateFeePerDay', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Sibling Discount (%)</label><input type="number" className="form-control" value={form.siblingDiscountPct} onChange={e => set('siblingDiscountPct', e.target.value)} /></div>
          </div>
          {zoned && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 6px' }}>
              <div style={{ fontSize: '.85rem', fontWeight: 700 }}>Distance / Zone Bands</div>
              <Button size="sm" variant="secondary" type="button" onClick={() => setForm(f => ({ ...f, zones: [...f.zones, newZone()] }))}>+ Band</Button>
            </div>
            {form.zones.map((z, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 24px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input className="form-control" placeholder="Zone name" value={z.name} onChange={e => setZone(i, 'name', e.target.value)} style={{ padding: '6px 8px', fontSize: '.8rem' }} />
                <input className="form-control" placeholder="≤ km" value={z.maxDistanceKm} onChange={e => setZone(i, 'maxDistanceKm', e.target.value)} style={{ padding: '6px 8px', fontSize: '.8rem' }} />
                <input className="form-control" placeholder="₹ amount" value={z.amount} onChange={e => setZone(i, 'amount', e.target.value)} style={{ padding: '6px 8px', fontSize: '.8rem' }} />
                <button type="button" onClick={() => setForm(f => ({ ...f, zones: f.zones.filter((_, j) => j !== i) }))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger,#ef4444)' }}>✕</button>
              </div>
            ))}
            {form.zones.length === 0 && <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Add bands, e.g. “≤5km ₹800”, “≤10km ₹1200”. A student’s pickup-stop distance selects the band.</div>}
          </>}
        </form>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete plan" message={`Delete "${del?.name}"?`} />
    </div>
  );
}
