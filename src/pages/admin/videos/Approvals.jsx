import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/video.api';
import { Card, Table, Badge, Button, Select, Confirm } from '../../../components/ui/index';

// School Admin — approve / reject teacher-submitted YouTube & Vimeo videos.
export default function VideoApprovals() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [reject, setReject] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await api.approvalQueue({ status })).data); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const approve = async (id) => { try { await api.approveVideo(id); toast.success('Approved & published'); load(); } catch (e) { toast.error(e.message); } };
  const doReject = async () => {
    const reason = window.prompt('Reason for rejection (optional):') || '';
    try { await api.rejectVideo(reject, { reason }); toast.success('Rejected'); setReject(null); load(); } catch (e) { toast.error(e.message); }
  };

  const columns = [
    { key: 'title', label: 'Video', render: r => (
      <div><div style={{ fontWeight: 600 }}>{r.title}</div>
        <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-sm" style={{ color: 'var(--primary)' }}>{r.source} ↗</a></div>
    ) },
    { key: 'createdBy', label: 'Submitted by', render: r => r.createdBy?.name || '—' },
    { key: 'category', label: 'Category', render: r => <span className="text-sm">{(r.category || '').replace(/_/g, ' ')}</span> },
    { key: 'approvalStatus', label: 'Status', render: r => <Badge variant={r.approvalStatus === 'pending' ? 'warning' : r.approvalStatus === 'approved' ? 'success' : 'danger'}>{r.approvalStatus}</Badge> },
    { key: 'actions', label: '', render: r => r.approvalStatus === 'pending' ? (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button size="sm" variant="primary" onClick={() => approve(r._id)}>Approve</Button>
        <Button size="sm" variant="danger" onClick={() => setReject(r._id)}>Reject</Button>
      </div>
    ) : null },
  ];

  return (
    <div className="page">
      <Card title="🧑‍🏫 Teacher Video Approvals" action={
        <Select value={status} onChange={e => setStatus(e.target.value)} style={{ width: 160 }}>
          {['pending', 'approved', 'rejected'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </Select>
      }>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="✅" emptyTitle="Nothing in this queue" />
      </Card>
      <Confirm open={!!reject} onClose={() => setReject(null)} onConfirm={doReject} title="Reject video?" message="The teacher will be notified. You'll be asked for a reason." />
    </div>
  );
}
