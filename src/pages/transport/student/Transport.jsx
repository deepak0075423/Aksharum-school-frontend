import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Spinner, Badge, Empty, Card, Table } from '../../../components/ui/index';

const ATT = { pending: 'muted', boarded: 'success', dropped: 'info', absent: 'danger', no_show: 'danger' };
const ST  = { pending: 'warning', partial: 'info', paid: 'success', overdue: 'danger', cancelled: 'muted' };
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
const tm  = (v) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const TABS = ['My Transport', 'Track Bus', 'Attendance', 'Fees'];

export default function StudentTransport() {
  const [tab, setTab] = useState('My Transport');
  const [info, setInfo] = useState(undefined);
  const [track, setTrack] = useState(null);
  const [att, setAtt] = useState([]);
  const [inv, setInv] = useState([]);

  useEffect(() => { api.studentTransport().then(r => setInfo(r.data ?? r)).catch(e => { toast.error(e.message); setInfo(null); }); }, []);
  useEffect(() => {
    if (tab === 'Track Bus') api.studentTrack().then(r => setTrack(r.data ?? r)).catch(() => {});
    if (tab === 'Attendance') api.studentAttendance().then(r => setAtt(r.data ?? r)).catch(() => {});
    if (tab === 'Fees') api.studentInvoices().then(r => setInv(r.data ?? r)).catch(() => {});
  }, [tab]);

  if (info === undefined) return <div className="loading-page"><Spinner /></div>;
  const r = info?.route;

  return (
    <div className="page">
      <PageHeader title="My Transport" subtitle="Bus, route, live tracking, attendance & fees" />
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {!info ? <Empty icon="🚌" title="No transport assigned" message="You are not assigned to a school bus. Contact the transport office." /> : (
        <>
          {tab === 'My Transport' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, maxWidth: 720 }}>
              <Card title="🚌 My Bus">
                <KV k="Route" v={`${r?.name} (${r?.routeCode})`} /><KV k="Bus" v={r?.vehicle?.vehicleNumber} />
                <KV k="Driver" v={r?.driver?.name} /><KV k="Attendant" v={r?.attendant?.name || '—'} />
              </Card>
              <Card title="🎒 My Stops">
                <KV k="Pickup" v={info.pickupStopName || '—'} /><KV k="Drop" v={info.dropStopName || '—'} />
                <KV k="Seat" v={info.seatNumber || '—'} /><KV k="Status" v={<Badge variant={info.status === 'active' ? 'success' : 'warning'}>{info.status}</Badge>} />
              </Card>
            </div>
          )}

          {tab === 'Track Bus' && (
            !track || (!track.active && track.reason) ? <Empty icon="🛰️" title="No live trip" message="The bus trip has not started yet today." />
            : (
              <Card title="Live Trip">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <Badge variant={track.status === 'started' ? 'success' : 'info'}>{track.status}</Badge>
                  <Badge variant="info">{track.shift} · {track.direction}</Badge>
                  <Badge variant={ATT[track.myStatus] || 'muted'}>me: {track.myStatus}</Badge>
                  {track.delayMinutes > 0 && <Badge variant="danger">{track.delayMinutes}m late</Badge>}
                </div>
                {(track.stops || []).map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.status === 'reached' ? 'var(--success,#22c55e)' : 'var(--border)' }} />
                    <span style={{ flex: 1, fontSize: '.85rem' }}>{s.name}</span>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{s.reachedAt ? tm(s.reachedAt) : s.plannedTime}</span>
                  </div>
                ))}
              </Card>
            )
          )}

          {tab === 'Attendance' && (
            <div className="card"><div className="card-body" style={{ padding: 0 }}>
              <Table data={att} emptyIcon="✅" emptyTitle="No records" columns={[
                { key: 'date', label: 'Date', render: x => new Date(x.date).toLocaleDateString() },
                { key: 'shift', label: 'Trip', render: x => <Badge variant="info">{x.shift} · {x.direction}</Badge> },
                { key: 'board', label: 'Boarded', render: x => tm(x.boardTime) },
                { key: 'drop', label: 'Dropped', render: x => tm(x.dropTime) },
                { key: 'status', label: 'Status', render: x => <Badge variant={ATT[x.status] || 'muted'}>{x.status}</Badge> },
              ]} />
            </div></div>
          )}

          {tab === 'Fees' && (
            <div className="card"><div className="card-body" style={{ padding: 0 }}>
              <Table data={inv} emptyIcon="💳" emptyTitle="No invoices" columns={[
                { key: 'inv', label: 'Invoice', render: x => <div><strong>{x.invoiceNumber}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{x.period?.label}</div></div> },
                { key: 'net', label: 'Amount', render: x => fmt(x.netAmount) },
                { key: 'due', label: 'Due', render: x => fmt(Math.max(0, x.netAmount - x.paidAmount)) },
                { key: 'status', label: 'Status', render: x => <Badge variant={ST[x.status]}>{x.status}</Badge> },
              ]} />
            </div></div>
          )}
        </>
      )}
    </div>
  );
}

const KV = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}>
    <span style={{ color: 'var(--text-muted)' }}>{k}</span><strong style={{ textAlign: 'right' }}>{v || '—'}</strong>
  </div>
);
