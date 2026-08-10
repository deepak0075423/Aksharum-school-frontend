import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Spinner, Badge, Empty, Card, Button, Modal } from '../../../components/ui/index';
import { useChildPicker } from './_shared';

const CATS = ['late_bus','driver_behavior','bus_condition','safety','delay','lost_item','other'];

export default function ParentDetails() {
  const { studentId, picker, loading: pl } = useChildPicker();
  const [info, setInfo] = useState(null);
  const [loading, setLoad] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'other', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setLoad(true);
    api.parentTransport({ studentId }).then(r => setInfo(r.data ?? r)).catch(e => toast.error(e.message)).finally(() => setLoad(false));
  }, [studentId]);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await api.parentCreateComplaint({ ...form, studentId, route: info?.route?._id });
      toast.success('Complaint submitted'); setModal(false); setForm({ subject: '', category: 'other', description: '' }); }
    catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const r = info?.route;
  return (
    <div className="page">
      <PageHeader title="My Transport" subtitle="Bus, driver, route & stops" action={picker} />
      {pl || loading ? <div className="loading-page"><Spinner /></div>
        : !info ? <Empty icon="🚌" title="No transport assigned" message="This child is not assigned to a bus. Raise a request from the Requests tab." />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, maxWidth: 920 }}>
            <Card title="🚌 Bus & Crew">
              <KV k="Route" v={`${r?.name} (${r?.routeCode})`} />
              <KV k="Bus" v={r?.vehicle?.vehicleNumber} />
              <KV k="Registration" v={r?.vehicle?.registrationNumber} />
              <KV k="Driver" v={r?.driver?.name} />
              <KV k="Driver phone" v={r?.driver?.phone ? <a href={`tel:${r.driver.phone}`} style={{ color: 'var(--primary)' }}>{r.driver.phone}</a> : '—'} />
              <KV k="Attendant" v={r?.attendant?.name || '—'} />
            </Card>
            <Card title="🎒 My Stops & Seat">
              <KV k="Pickup stop" v={info.pickupStopName || '—'} />
              <KV k="Drop stop" v={info.dropStopName || '—'} />
              <KV k="Seat" v={info.seatNumber || '—'} />
              <KV k="Shift" v={info.shift} />
              <KV k="Status" v={<Badge variant={info.status === 'active' ? 'success' : 'warning'}>{info.status}</Badge>} />
              {info.feePlan && <KV k="Fee plan" v={`${info.feePlan.name} · ₹${info.feePlan.amount}/${info.feePlan.frequency}`} />}
            </Card>
            <Card title="Need help?">
              <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Report an issue about the bus, driver or route.</p>
              <Button onClick={() => setModal(true)}>📣 Raise Complaint</Button>
            </Card>
          </div>
        )}

      <Modal open={modal} onClose={() => setModal(false)} title="Raise a Complaint" maxWidth={480}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button form="cmp-form" type="submit" loading={saving}>Submit</Button></>}>
        <form id="cmp-form" onSubmit={submit}>
          <div className="form-group"><label className="form-label required">Subject</label><input className="form-control" required value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Category</label>
            <select className="form-control" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{CATS.map(c => <option key={c} value={c}>{c.replace('_',' ')}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Description</label><textarea className="form-control" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        </form>
      </Modal>
    </div>
  );
}

const KV = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}>
    <span style={{ color: 'var(--text-muted)' }}>{k}</span><strong style={{ textAlign: 'right' }}>{v || '—'}</strong>
  </div>
);
