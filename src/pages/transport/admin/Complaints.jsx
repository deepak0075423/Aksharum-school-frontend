import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Badge, Pagination, Spinner } from '../../../components/ui/index';

const ST  = { open: 'warning', assigned: 'info', in_progress: 'info', resolved: 'success', closed: 'muted' };
const PRI = { low: 'muted', medium: 'info', high: 'warning', urgent: 'danger' };
const CATS = ['late_bus','driver_behavior','bus_condition','safety','delay','lost_item','overcrowding','other'];

export default function TransportComplaints() {
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try { const res = await api.getComplaints({ page, limit: 20, status }); const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total }); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [status]);
  useEffect(() => { load(1); }, [status]); // eslint-disable-line

  const openDetail = async (row) => { setDetail({ loading: true }); setNote('');
    try { const r = await api.getComplaint(row._id); setDetail(r.data ?? r); } catch (err) { toast.error(err.message); setDetail(null); } };
  const act = async (action) => {
    try { await api.actOnComplaint(detail._id, { action, note, resolution: action === 'resolve' ? note : undefined });
      toast.success(`Complaint ${action}`); const r = await api.getComplaint(detail._id); setDetail(r.data ?? r); setNote(''); load(pg.page); }
    catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'code', label: 'Complaint', render: r => <div><strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.subject}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.complaintCode} · {r.raisedBy?.name} ({r.raisedByRole})</div></div> },
    { key: 'cat', label: 'Category', render: r => <span style={{ fontSize: '.8rem' }}>{r.category?.replace('_', ' ')}</span> },
    { key: 'pri', label: 'Priority', render: r => <Badge variant={PRI[r.priority]}>{r.priority}</Badge> },
    { key: 'status', label: 'Status', render: r => <Badge variant={ST[r.status]}>{r.status?.replace('_', ' ')}</Badge> },
    { key: 'when', label: 'Raised', render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'a', label: '', render: r => <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>Open</Button> },
  ];

  const c = detail && !detail.loading ? detail : null;
  return (
    <div className="page">
      <PageHeader title="Complaint Management" subtitle="Triage & resolve transport complaints" />
      <div style={{ marginBottom: 16 }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>{Object.keys(ST).map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}</select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📣" emptyTitle="No complaints" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={!!detail} onClose={() => setDetail(null)} title={c?.subject || 'Complaint'} maxWidth={640}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : c && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <Badge variant="primary">{c.complaintCode}</Badge><Badge variant={ST[c.status]}>{c.status?.replace('_',' ')}</Badge>
              <Badge variant={PRI[c.priority]}>{c.priority}</Badge><Badge variant="muted">{c.category?.replace('_',' ')}</Badge>
            </div>
            <p style={{ fontSize: '.85rem' }}>{c.description || 'No description.'}</p>
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              By {c.raisedBy?.name} ({c.raisedByRole}){c.route ? ` · Route: ${c.route.name}` : ''}{c.assignedTo ? ` · Assigned: ${c.assignedTo.name}` : ''}
            </div>
            <div style={{ fontSize: '.8rem', fontWeight: 700, margin: '4px 0 6px' }}>Timeline</div>
            <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginBottom: 14 }}>
              {(c.timeline || []).map((tl, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 600, textTransform: 'capitalize' }}>{tl.action}</div>
                  {tl.note && <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{tl.note}</div>}
                  <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{tl.by?.name || ''} · {new Date(tl.at).toLocaleString()}</div>
                </div>
              ))}
            </div>
            {!['closed'].includes(c.status) && <>
              <textarea className="form-control" rows={2} placeholder="Add a note / resolution…" value={note} onChange={e => setNote(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button size="sm" variant="secondary" onClick={() => act('assign')}>Assign to me</Button>
                {c.status !== 'in_progress' && <Button size="sm" variant="secondary" onClick={() => act('progress')}>Mark In Progress</Button>}
                <Button size="sm" onClick={() => act('resolve')}>Resolve</Button>
                <Button size="sm" variant="secondary" onClick={() => act('comment')}>Comment</Button>
                {c.status === 'resolved' && <Button size="sm" variant="secondary" onClick={() => act('close')}>Close</Button>}
              </div>
            </>}
          </div>
        )}
      </Modal>
    </div>
  );
}
