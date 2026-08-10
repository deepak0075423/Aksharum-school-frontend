import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/video.api';
import { Card, Table, Badge, Button, Modal, Spinner, Confirm } from '../../../components/ui/index';

// Teacher — my video assignments + live completion progress.
const SV = { active: 'success', scheduled: 'warning', expired: 'muted', archived: 'muted' };

export default function TeacherAssignments() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [del, setDel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await api.teacherAssignments()).data); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    setDetail({ loading: true });
    try { setDetail((await api.teacherAssignmentProgress(id)).data); } catch (e) { toast.error(e.message); setDetail(null); }
  };
  const remove = async () => { try { await api.teacherDeleteAssignment(del); toast.success('Deleted'); setDel(null); load(); } catch (e) { toast.error(e.message); } };

  const columns = [
    { key: 'title', label: 'Assignment', render: r => <div><div style={{ fontWeight: 600 }}>{r.title}</div><span className="text-sm text-muted">{r.assignmentCode} · {r.contentType}</span></div> },
    { key: 'recipientCount', label: 'Students', render: r => r.recipientCount },
    { key: 'mandatory', label: 'Type', render: r => <Badge variant={r.mandatory ? 'danger' : 'info'}>{r.mandatory ? 'Mandatory' : 'Optional'}</Badge> },
    { key: 'status', label: 'Status', render: r => <Badge variant={SV[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r._id)}>Progress</Button>
        <Button size="sm" variant="ghost" onClick={() => setDel(r._id)}>🗑</Button>
      </div>
    ) },
  ];

  return (
    <div className="page">
      <Card title="📌 My Assignments"><Table columns={columns} data={rows} loading={loading} emptyIcon="📌" emptyTitle="No assignments yet" /></Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Assignment Progress" maxWidth={640}>
        {detail?.loading ? <div style={{ padding: 30, textAlign: 'center' }}><Spinner /></div> : detail && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14, textAlign: 'center' }}>
              {[['Recipients', detail.summary?.recipients], ['Started', detail.summary?.started], ['Completed', detail.summary?.completed], ['Avg %', `${detail.summary?.avgPercent || 0}%`]].map(([l, v]) => (
                <div key={l} style={{ padding: '10px 6px', background: 'var(--bg-muted,#f8fafc)', borderRadius: 8 }}><div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{v ?? 0}</div><div className="text-sm text-muted">{l}</div></div>
              ))}
            </div>
            <Table columns={[
              { key: 'student', label: 'Student', render: r => r.student?.name || '—' },
              { key: 'progressPercent', label: 'Progress', render: r => `${r.progressPercent || 0}%` },
              { key: 'completed', label: 'Done', render: r => r.completed ? <Badge variant="success">Yes</Badge> : <Badge variant="muted">No</Badge> },
            ]} data={detail.progress || []} emptyIcon="👀" emptyTitle="No student has started yet" />
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete assignment?" message="Students will no longer see this assignment." />
    </div>
  );
}
