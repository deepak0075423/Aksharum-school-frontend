import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Table, Button, Modal, Badge, Pagination, StatCard, Card, Empty, Spinner,
} from '../../../components/ui/index';
import { StatusBadge, Filters, label, dt } from '../shared';

/** The gate board (spec §20): who is in, who is out, who is late back. */
export default function Movement() {
  const [rows, setRows] = useState([]);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ direction: '', movementType: '', date: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ student: '', direction: 'out', movementType: 'gate', gate: '', remarks: '' });
  const [saving, setSaving] = useState(false);
  const [residents, setResidents] = useState([]);

  const { data: live, refetch: reloadLive, loading: liveLoading } = useFetch(api.getLiveMovement, []);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getMovements({ page, limit: 25, ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [filters]); // eslint-disable-line

  const open = async () => {
    setForm({ student: '', direction: 'out', movementType: 'gate', gate: '', remarks: '' });
    setModal(true);
    try {
      const r = await api.getAllocations({ status: 'active', limit: 300 });
      setResidents((r.data ?? r).data || []);
    } catch { setResidents([]); }
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.recordMovement(form);
      toast.success('Movement recorded');
      setModal(false); load(1); reloadLive();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const columns = [
    { key: 'at', label: 'When', render: (r) => dt(r.at) },
    { key: 'who', label: 'Who', render: (r) => (
      <div>
        <strong>{r.student?.name || r.personName || '—'}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.hostel?.name}</div>
      </div>
    ) },
    { key: 'dir', label: 'Direction', render: (r) => (
      <Badge variant={r.direction === 'out' ? 'warning' : 'success'}>{r.direction === 'out' ? '↗ Out' : '↙ In'}</Badge>
    ) },
    { key: 'type', label: 'Type', render: (r) => <Badge variant="muted">{label(r.movementType)}</Badge> },
    { key: 'gate', label: 'Gate', render: (r) => r.gate || '—' },
    { key: 'late', label: 'Late', render: (r) => r.isLate
      ? <Badge variant="danger">{r.lateMinutes ? `${r.lateMinutes} min` : 'after curfew'}</Badge>
      : <span className="text-muted">—</span> },
    { key: 'by', label: 'Recorded by', render: (r) => r.recordedBy?.name || '—' },
  ];

  return (
    <div className="page">
      <PageHeader title="Security & Student Movement" subtitle="Gate entries and exits, live presence and overdue returns"
        action={<Button onClick={open}>+ Record Movement</Button>} />

      {liveLoading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : (
        <div className="stats-grid">
          <StatCard icon="🏠" color="green"  label="Inside hostel"   value={live?.inside} />
          <StatCard icon="🚶" color="orange" label="Currently out"   value={live?.outside} />
          <StatCard icon="🏖"  color="blue"   label="On leave"        value={live?.onLeave} />
          <StatCard icon="🎫" color="purple" label="Active outpasses" value={live?.activeOutpasses?.length} />
          <StatCard icon="⏰" color="red"    label="Overdue"         value={live?.overdue?.length} />
        </div>
      )}

      {!!live?.overdue?.length && (
        <Card title={`⏰ Overdue returns (${live.overdue.length})`}>
          {live.overdue.map((o) => (
            <div key={o._id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <strong style={{ fontSize: '.86rem' }}>{o.student?.name}</strong>
                <div style={{ fontSize: '.73rem', color: 'var(--text-muted)' }}>{o.outpassNumber} · {o.purpose}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Badge variant="danger">expected {dt(o.expectedReturnAt)}</Badge>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div style={{ marginTop: 20 }}>
        <Filters>
          <select className="form-control" style={{ maxWidth: 150 }} value={filters.direction} onChange={(e) => setFilters((f) => ({ ...f, direction: e.target.value }))}>
            <option value="">Both directions</option>
            <option value="out">Out</option>
            <option value="in">In</option>
          </select>
          <select className="form-control" style={{ maxWidth: 170 }} value={filters.movementType} onChange={(e) => setFilters((f) => ({ ...f, movementType: e.target.value }))}>
            <option value="">All types</option>
            {['gate', 'outpass', 'leave', 'visitor', 'vehicle', 'medical', 'other'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
          <input className="form-control" style={{ maxWidth: 170 }} type="date" value={filters.date} onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))} />
        </Filters>

        <div className="card"><div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={rows} loading={loading} emptyIcon="🚦" emptyTitle="No movements recorded" />
        </div></div>
        <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} maxWidth={520} title="Record Gate Movement"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="mv-form" type="submit" loading={saving}>Record</Button></>}>
        <form id="mv-form" onSubmit={save}>
          <div className="form-group">
            <label className="form-label required">Student</label>
            <select className="form-control" required value={form.student} onChange={(e) => setForm((f) => ({ ...f, student: e.target.value }))}>
              <option value="">— select a resident —</option>
              {residents.map((a) => (
                <option key={a._id} value={a.student?._id || a.student}>{a.student?.name} · Room {a.room?.roomNumber}</option>
              ))}
            </select>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Direction</label>
              <select className="form-control" value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>
                <option value="out">Going out</option>
                <option value="in">Coming in</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.movementType} onChange={(e) => setForm((f) => ({ ...f, movementType: e.target.value }))}>
                {['gate', 'medical', 'other'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Gate</label>
              <input className="form-control" value={form.gate} onChange={(e) => setForm((f) => ({ ...f, gate: e.target.value }))} placeholder="Main Gate" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <input className="form-control" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
            <div className="form-hint">A movement after curfew is flagged automatically and the warden is alerted.</div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
