import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Pagination, Badge } from '../../../components/ui/index';

export default function InventoryAudit() {
  const [logs, setLogs] = useState([]);
  const [pageData, setPage] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.getAuditLog({ page, limit: 40 });
      const d = res.data ?? res;
      setLogs(d.logs || []);
      setPage({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const columns = [
    { key: 'timestamp', label: 'When', render: r => <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{new Date(r.timestamp).toLocaleString()}</span> },
    { key: 'user', label: 'User', render: r => r.user?.name || 'System' },
    { key: 'role', label: 'Role', render: r => r.role ? <Badge variant="muted">{r.role.replace('_', ' ')}</Badge> : '—' },
    { key: 'actionType', label: 'Action', render: r => <Badge variant="info">{r.actionType}</Badge> },
    { key: 'description', label: 'Details', render: r => r.description || '—' },
  ];

  return (
    <div className="page">
      <PageHeader title="Activity Log" subtitle="Immutable record of every inventory action" />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={logs} loading={loading} emptyIcon="🧾" emptyTitle="No activity yet" />
      </div></div>
      <Pagination page={pageData.page} pages={pageData.pages} total={pageData.total} onPage={p => load(p)} />
    </div>
  );
}
