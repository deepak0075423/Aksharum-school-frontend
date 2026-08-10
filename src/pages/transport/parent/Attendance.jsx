import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Badge } from '../../../components/ui/index';
import { useChildPicker } from './_shared';

const ATT = { pending: 'muted', boarded: 'success', dropped: 'info', absent: 'danger', no_show: 'danger' };
const tm = (v) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

export default function ParentAttendance() {
  const { studentId, picker } = useChildPicker();
  const [rows, setRows] = useState([]);
  const [loading, setLoad] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setLoad(true);
    api.parentAttendance({ studentId }).then(r => setRows(r.data ?? r)).catch(e => toast.error(e.message)).finally(() => setLoad(false));
  }, [studentId]);

  const columns = [
    { key: 'date', label: 'Date', render: r => new Date(r.date).toLocaleDateString() },
    { key: 'route', label: 'Route', render: r => r.route || '—' },
    { key: 'shift', label: 'Trip', render: r => <Badge variant="info">{r.shift} · {r.direction}</Badge> },
    { key: 'board', label: 'Boarded', render: r => tm(r.boardTime) },
    { key: 'drop', label: 'Dropped', render: r => tm(r.dropTime) },
    { key: 'status', label: 'Status', render: r => <Badge variant={ATT[r.status] || 'muted'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Bus Attendance History" subtitle="Boarding & drop timeline" action={picker} />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="✅" emptyTitle="No attendance records yet" />
      </div></div>
    </div>
  );
}
