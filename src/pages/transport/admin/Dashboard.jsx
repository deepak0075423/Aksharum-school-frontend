import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getDashboard } from '../../../api/transport.api';
import { PageHeader, StatCard, Spinner, Badge } from '../../../components/ui/index';

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function TransportDashboard() {
  const { data, loading } = useFetch(getDashboard);
  if (loading) return <div className="loading-page"><Spinner /></div>;
  const d = data || {};
  const maxFuel = Math.max(1, ...(d.fuelTrend || []).map(t => t.value));
  const maxFee  = Math.max(1, ...(d.feeTrend || []).map(t => t.value));
  const maxRoute = Math.max(1, ...(d.routeUtilization || []).map(r => r.students));

  return (
    <div className="page">
      <PageHeader title="Transport Dashboard" subtitle="Fleet, routes, trips, safety & collection at a glance" />

      {/* Primary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 16 }}>
        <StatCard label="Total Vehicles" value={d.totalVehicles || 0} icon="🚌" color="blue" />
        <StatCard label="Active Drivers" value={`${d.activeDrivers || 0}/${d.totalDrivers || 0}`} icon="🧑‍✈️" color="purple" />
        <StatCard label="Students Transported" value={d.studentsTransported || 0} icon="🎒" color="green" />
        <StatCard label="Fleet Occupancy" value={`${d.occupancy || 0}%`} icon="📊" color="orange" />
      </div>

      {/* Operational mini-stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12, marginBottom: 20 }}>
        <MiniStat to="/admin/transport/trips" icon="📅" label="Today's Trips" value={d.todaysTrips || 0} />
        <MiniStat to="/admin/transport/live" icon="🛰️" label="Running Now" value={d.runningTrips || 0} tone={d.runningTrips ? 'good' : ''} />
        <MiniStat to="/admin/transport/trips" icon="⏱" label="Delayed Trips" value={d.delayedTrips || 0} tone={d.delayedTrips ? 'danger' : ''} />
        <MiniStat to="/admin/transport/live" icon="📡" label="GPS Online" value={d.gpsOnline || 0} />
        <MiniStat to="/admin/transport/vehicles" icon="🔧" label="In Maintenance" value={d.maintenanceVehicles || 0} tone={d.maintenanceVehicles ? 'warn' : ''} />
        <MiniStat to="/admin/transport/complaints" icon="📣" label="Open Complaints" value={d.openComplaints || 0} tone={d.openComplaints ? 'warn' : ''} />
        <MiniStat to="/admin/transport/incidents" icon="⚠️" label="Open Incidents" value={d.openIncidents || 0} tone={d.openIncidents ? 'danger' : ''} />
        <MiniStat to="/admin/transport/requests" icon="📨" label="Pending Requests" value={d.pendingRequests || 0} tone={d.pendingRequests ? 'warn' : ''} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        {/* Fee collection this month */}
        <div className="card"><div className="card-header"><h3 className="card-title">💰 Fee Collection (this month)</h3></div>
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Collected {fmt(d.feeCollectedMonth)}</span>
              <span style={{ color: 'var(--text-muted)' }}>Billed {fmt(d.feeBilledMonth)}</span>
            </div>
            <div style={{ height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${d.feeBilledMonth ? Math.min(100, (d.feeCollectedMonth / d.feeBilledMonth) * 100) : 0}%`, height: '100%', background: 'var(--success,#22c55e)' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: '.85rem' }}>
              <div><div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>Fuel cost</div><strong>{fmt(d.fuelCostMonth)}</strong></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>Maintenance</div><strong>{fmt(d.maintenanceCostMonth)}</strong></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>Fuel used</div><strong>{d.fuelLitresMonth || 0} L</strong></div>
            </div>
          </div>
        </div>

        {/* Fuel trend */}
        <ChartCard title="⛽ Fuel Cost — last 6 months" data={d.fuelTrend} max={maxFuel} fmt={fmt} />
        {/* Fee trend */}
        <ChartCard title="📈 Collection — last 6 months" data={d.feeTrend} max={maxFee} fmt={fmt} color="var(--success,#22c55e)" />

        {/* Route utilization */}
        <div className="card"><div className="card-header"><h3 className="card-title">🛣️ Route Utilization</h3></div>
          <div className="card-body">
            {(d.routeUtilization || []).length === 0 ? <Muted>No active assignments yet.</Muted> :
              d.routeUtilization.map(r => (
                <div key={r._id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 3 }}><span>{r.name}</span><span style={{ color: 'var(--text-muted)' }}>{r.students}</span></div>
                  <div style={{ height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(r.students / maxRoute) * 100}%`, height: '100%', background: 'var(--primary)' }} />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Upcoming renewals */}
        <div className="card"><div className="card-header"><h3 className="card-title">🔔 Upcoming Renewals {d.renewalCount ? <Badge variant="warning">{d.renewalCount}</Badge> : null}</h3></div>
          <div className="card-body">
            {(d.upcomingRenewals || []).length === 0 ? <Muted>All documents are up to date. 🎉</Muted> :
              d.upcomingRenewals.map((r, i) => {
                const days = Math.ceil((new Date(r.date) - Date.now()) / 864e5);
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                    <span>{r.kind === 'vehicle' ? '🚌' : '🧑‍✈️'} {r.name} — {r.doc}</span>
                    <Badge variant={days < 0 ? 'danger' : days <= 7 ? 'warning' : 'muted'}>{days < 0 ? 'Expired' : `${days}d`}</Badge>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card"><div className="card-header"><h3 className="card-title">🧾 Recent Activity</h3></div>
          <div className="card-body">
            {(d.recentActivities || []).length === 0 ? <Muted>No activity yet.</Muted> :
              d.recentActivities.map(a => (
                <div key={a._id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                  <div>{a.description}</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{a.user?.name || 'System'} · {new Date(a.createdAt).toLocaleString()}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const Muted = ({ children }) => <div style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{children}</div>;
function MiniStat({ to, icon, label, value, tone }) {
  const color = tone === 'danger' && value > 0 ? 'var(--danger,#ef4444)' : tone === 'warn' && value > 0 ? 'var(--warning,#f59e0b)' : tone === 'good' && value > 0 ? 'var(--success,#22c55e)' : 'inherit';
  return (
    <Link to={to} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', textDecoration: 'none', color: 'var(--text)', background: 'var(--bg-primary)' }}>
      <span style={{ fontSize: '1.3rem' }}>{icon}</span>
      <div><div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</div><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label}</div></div>
    </Link>
  );
}
function ChartCard({ title, data = [], max, fmt, color = 'var(--primary)' }) {
  return (
    <div className="card"><div className="card-header"><h3 className="card-title">{title}</h3></div>
      <div className="card-body">
        {data.length === 0 ? <Muted>No data yet.</Muted> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 130 }}>
            {data.map((t, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{t.value ? fmt(t.value) : ''}</div>
                <div title={fmt(t.value)} style={{ width: '65%', height: `${(t.value / max) * 100}%`, minHeight: 3, background: color, borderRadius: '4px 4px 0 0' }} />
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{t.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
