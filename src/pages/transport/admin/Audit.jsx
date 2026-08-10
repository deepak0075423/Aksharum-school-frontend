import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Badge, Pagination } from '../../../components/ui/index';

const COLOR = { create: 'success', update: 'info', delete: 'danger', payment: 'success', approve: 'success', reject: 'danger', generate: 'info' };

export default function TransportAudit() {
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [entity, setEntity] = useState('');

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try { const res = await api.getAudit({ page, limit: 30, entityType: entity }); const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total }); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [entity]);
  useEffect(() => { load(1); }, [entity]); // eslint-disable-line

  const columns = [
    { key: 'when', label: 'When', render: r => <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{new Date(r.createdAt).toLocaleString()}</span> },
    { key: 'user', label: 'By', render: r => <div>{r.user?.name || 'System'}<div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{r.role?.replace('_', ' ')}</div></div> },
    { key: 'action', label: 'Action', render: r => <Badge variant={COLOR[r.actionType?.split('_')[0]] || 'muted'}>{r.actionType}</Badge> },
    { key: 'entity', label: 'Entity', render: r => r.entityType },
    { key: 'desc', label: 'Description', render: r => <span style={{ fontSize: '.82rem' }}>{r.description}</span> },
  ];

  const entities = ['Vehicle','Staff','Route','Assignment','Trip','Fuel','Maintenance','Incident','Complaint','FeePlan','Invoice','Request','Settings'];
  return (
    <div className="page">
      <PageHeader title="Activity Log" subtitle="Immutable audit trail of every transport action" />
      <div style={{ marginBottom: 16 }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={entity} onChange={e => setEntity(e.target.value)}>
          <option value="">All entities</option>{entities.map(e => <option key={e} value={e}>{e}</option>)}</select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🧾" emptyTitle="No activity yet" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />
    </div>
  );
}
