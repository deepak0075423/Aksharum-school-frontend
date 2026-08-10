import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFeeStructures, createFeeStructure, getFeeHeads } from '../../../api/fees.api';
import { getClassesWithSections } from '../../../api/admin.api';
import { PageHeader, Table, Button, Modal, Badge, Spinner } from '../../../components/ui/index';

const fmt = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

const classLabel = (c) => c?.className || (c?.classNumber ? `Class ${c.classNumber}` : null);

export default function FeeStructures() {
  const { data: structures, loading, refetch } = useFetch(getFeeStructures);
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);

  // form
  const [form, setForm] = useState({ name: '', level: 'class', classId: '', sectionId: '', dueDay: '' });
  const [items, setItems] = useState([]);           // [{ feeHead, name, amount }]
  const [classes, setClasses] = useState([]);
  const [heads,   setHeads]   = useState([]);

  useEffect(() => {
    if (!modal) return;
    getClassesWithSections().then(r => setClasses(r?.data || r || [])).catch(() => {});
    getFeeHeads().then(r => {
      const list = r?.data || r || [];
      setHeads(list);
    }).catch(() => {});
  }, [modal]);

  const selectedClass = classes.find(c => c._id === form.classId);
  const total = useMemo(() => items.reduce((s, i) => s + (Number(i.amount) || 0), 0), [items]);

  const openModal = () => {
    setForm({ name: '', level: 'class', classId: '', sectionId: '', dueDay: '' });
    setItems([]);
    setModal(true);
  };

  const toggleHead = (h) => {
    setItems(prev => prev.some(i => i.feeHead === h._id)
      ? prev.filter(i => i.feeHead !== h._id)
      : [...prev, { feeHead: h._id, name: h.name, amount: h.defaultAmount || 0 }]);
  };
  const setAmount = (id, val) => setItems(prev => prev.map(i => i.feeHead === id ? { ...i, amount: val } : i));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Structure name is required');
    if (form.level === 'class' && !form.classId)   return toast.error('Please select a class');
    if (form.level === 'section' && !form.sectionId) return toast.error('Please select a section');
    if (!items.length) return toast.error('Add at least one fee head');
    setSaving(true);
    try {
      await createFeeStructure({
        name: form.name.trim(),
        level: form.level,
        classId:   form.level === 'class'   ? form.classId   : null,
        sectionId: form.level === 'section' ? form.sectionId : null,
        dueDay: form.dueDay ? Number(form.dueDay) : null,
        items: items.map(i => ({ feeHead: i.feeHead, amount: Number(i.amount) || 0 })),
      });
      toast.success('Fee structure created');
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns = [
    { key: 'name',  label: 'Structure', render: r => (
      <div>
        <strong>{r.name}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r.level}-level</div>
      </div>
    ) },
    { key: 'class', label: 'Applies To', render: r =>
      r.level === 'section'
        ? (r.section?.sectionName ? `Section ${r.section.sectionName}` : '—')
        : (classLabel(r.class) || '—') },
    { key: 'academicYear', label: 'Academic Year', render: r => r.academicYear?.yearName || '—' },
    { key: 'totalAmount',  label: 'Total (₹)',     render: r => fmt(r.totalAmount) },
    { key: 'isActive',     label: 'Status',        render: r => <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Fee Structures" subtitle="Class-wise fee structures"
        action={<Button onClick={openModal}>+ Add Structure</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={structures} emptyIcon="🏗️" emptyTitle="No fee structures" />}
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Fee Structure"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="struct-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="struct-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label required">Name</label>
            <input className="form-control" required placeholder="e.g. Class 1 Annual Fees" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Level</label>
              <select className="form-control" value={form.level}
                onChange={e => setForm(f => ({ ...f, level: e.target.value, classId: '', sectionId: '' }))}>
                <option value="class">Whole Class</option>
                <option value="section">Specific Section</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Due Day (of month)</label>
              <input type="number" min="1" max="31" className="form-control" placeholder="e.g. 10" value={form.dueDay}
                onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))} />
            </div>
          </div>

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Class</label>
              <select className="form-control" value={form.classId}
                onChange={e => setForm(f => ({ ...f, classId: e.target.value, sectionId: '' }))}>
                <option value="">— Select class —</option>
                {classes.map(c => <option key={c._id} value={c._id}>{classLabel(c)}</option>)}
              </select>
            </div>
            {form.level === 'section' && (
              <div className="form-group">
                <label className="form-label required">Section</label>
                <select className="form-control" value={form.sectionId}
                  onChange={e => setForm(f => ({ ...f, sectionId: e.target.value }))} disabled={!form.classId}>
                  <option value="">— Select section —</option>
                  {(selectedClass?.sections || []).map(s => <option key={s._id} value={s._id}>{s.sectionName}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label required">Fee Heads</label>
            {heads.length === 0 ? (
              <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', margin: 0 }}>
                No fee heads yet. Create them in the <strong>Fee Heads</strong> tab first.
              </p>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, maxHeight: 240, overflowY: 'auto' }}>
                {heads.map(h => {
                  const sel = items.find(i => i.feeHead === h._id);
                  return (
                    <div key={h._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                      <input type="checkbox" checked={!!sel} onChange={() => toggleHead(h)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '.86rem' }}>{h.name}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{h.type}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--text-muted)' }}>₹</span>
                        <input type="number" min="0" className="form-control" style={{ width: 110, padding: '4px 8px' }}
                          value={sel ? sel.amount : (h.defaultAmount || 0)} disabled={!sel}
                          onChange={e => setAmount(h._id, e.target.value)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12,
            padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <strong>Total</strong>
            <strong style={{ fontSize: '1.05rem' }}>{fmt(total)}</strong>
          </div>
        </form>
      </Modal>
    </div>
  );
}
