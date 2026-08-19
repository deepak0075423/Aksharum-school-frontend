import React from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/hostel.api';
import { PageHeader, StatCard, Card, Spinner, Badge, Empty } from '../../../components/ui/index';

// One palette for the whole module, so a status means the same colour everywhere.
const C = { occupied: '#4f46e5', available: '#10b981', reserved: '#f59e0b', maintenance: '#ef4444', neutral: '#94a3b8' };
const PIE = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6'];

const Section = ({ title, action, children }) => (
  <div style={{ marginTop: 24 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
      <h3 style={{ fontSize: '.95rem', fontWeight: 700 }}>{title}</h3>
      {action}
    </div>
    {children}
  </div>
);

const Tile = ({ label, value, to, tone = 'muted' }) => {
  const body = (
    <div className="card" style={{ padding: '12px 14px', height: '100%' }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{value ?? 0}</div>
      <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
      {value > 0 && tone !== 'muted' && (
        <div style={{ marginTop: 6 }}><Badge variant={tone}>needs attention</Badge></div>
      )}
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link> : body;
};

export default function HostelDashboard() {
  const { data, loading, error } = useFetch(api.getDashboard, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>;
  if (error) return <div className="page"><Empty icon="⚠️" title="Could not load the dashboard" message={error} /></div>;

  const d = data || {};
  const ch = d.charts || {};
  const occupancyPercent = d.totalBeds ? Math.round((d.occupiedBeds / d.totalBeds) * 100) : 0;

  return (
    <div className="page">
      <PageHeader
        title="Hostel Dashboard"
        subtitle={`${d.totalHostels || 0} hostel(s) · ${d.totalBeds || 0} beds · ${occupancyPercent}% occupied`}
      />

      {/* Capacity at a glance */}
      <div className="stats-grid">
        <StatCard icon="🏨" color="purple" label="Hostels"        value={d.totalHostels} />
        <StatCard icon="🏗"  color="blue"   label="Buildings"      value={d.totalBuildings} />
        <StatCard icon="🪜"  color="teal"   label="Floors"         value={d.totalFloors} />
        <StatCard icon="🚪" color="blue"   label="Rooms"          value={d.totalRooms} />
        <StatCard icon="🛏"  color="purple" label="Total Beds"     value={d.totalBeds} />
        <StatCard icon="✅" color="green"  label="Occupied Beds"  value={d.occupiedBeds} />
        <StatCard icon="🟢" color="teal"   label="Available Beds" value={d.availableBeds} />
        <StatCard icon="🔖" color="orange" label="Reserved Beds"  value={d.reservedBeds} />
      </div>

      {/* Where the residents are right now */}
      <Section title="Residents right now"
        action={<Link to="/admin/hostel/movement" style={{ fontSize: '.8rem', color: 'var(--primary)', textDecoration: 'none' }}>Security board →</Link>}>
        <div className="stats-grid">
          <StatCard icon="🏠" color="green"  label="Inside the hostel" value={d.studentsStaying} />
          <StatCard icon="🚶" color="orange" label="Currently outside" value={d.studentsOutside} />
          <StatCard icon="🏖"  color="blue"   label="On leave"          value={d.studentsOnLeave} />
          <StatCard icon="👥" color="purple" label="Total residents"   value={d.totalResidents} />
        </div>
      </Section>

      {/* Today's roll call */}
      <Section title="Today's attendance"
        action={<Link to="/admin/hostel/attendance" style={{ fontSize: '.8rem', color: 'var(--primary)', textDecoration: 'none' }}>Take roll call →</Link>}>
        <div className="stats-grid">
          <StatCard icon="✅" color="green"  label="Present" value={d.attendanceToday?.present} />
          <StatCard icon="❌" color="red"    label="Absent"  value={d.attendanceToday?.absent} />
          <StatCard icon="⏰" color="orange" label="Late"    value={d.attendanceToday?.late} />
          <StatCard icon="📋" color="blue"   label="Marked"  value={d.attendanceToday?.marked} />
        </div>
      </Section>

      {/* Everything waiting on someone */}
      <Section title="Waiting for action">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <Tile label="Pending admissions"   value={d.pendingAdmissions}  to="/admin/hostel/admissions?status=pending_approval" tone="warning" />
          <Tile label="Waitlisted"           value={d.waitlisted}         to="/admin/hostel/admissions?status=waitlisted" />
          <Tile label="Awaiting allocation"  value={d.pendingAllocations} to="/admin/hostel/admissions?status=approved" tone="warning" />
          <Tile label="Pending leave"        value={d.pendingLeaves}      to="/admin/hostel/leave?status=pending" tone="warning" />
          <Tile label="Pending outpass"      value={d.pendingOutpasses}   to="/admin/hostel/outpass?status=pending" tone="warning" />
          <Tile label="Active outpass"       value={d.activeOutpasses}    to="/admin/hostel/outpass?status=active" />
          <Tile label="Overdue returns"      value={d.overdueOutpasses}   to="/admin/hostel/outpass?status=overdue" tone="danger" />
          <Tile label="Visitors today"       value={d.todayVisitors}      to="/admin/hostel/visitors" />
          <Tile label="Open complaints"      value={d.pendingComplaints}  to="/admin/hostel/complaints?status=open" tone="warning" />
          <Tile label="Open maintenance"     value={d.openMaintenance}    to="/admin/hostel/maintenance?status=open" tone="warning" />
          <Tile label="Outstanding fees"     value={d.outstandingFees}    to="/admin/hostel/fees?status=pending" tone="danger" />
        </div>
      </Section>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginTop: 24 }}>
        <Card title="Hostel occupancy">
          {ch.occupancy?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ch.occupancy}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="occupied"  name="Occupied"  stackId="a" fill={C.occupied} />
                <Bar dataKey="available" name="Available" stackId="a" fill={C.available} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty icon="🏨" title="No hostels yet" message="Create a hostel to see occupancy here." />}
        </Card>

        <Card title="Bed availability">
          {d.totalBeds ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={ch.bedAvailability} dataKey="value" nameKey="label" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {(ch.bedAvailability || []).map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty icon="🛏" title="No beds yet" message="Add rooms and beds to see availability." />}
        </Card>

        <Card title="Attendance — last 14 days">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={ch.attendanceTrend || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={10} interval={1} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="present" name="Present" stroke={C.available} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="absent"  name="Absent"  stroke={C.maintenance} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="late"    name="Late"    stroke={C.reserved} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Leave & outpass — last 14 days">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={(ch.leaveTrend || []).map((l, i) => ({
              label: l.label, leave: l.value, outpass: ch.outpassTrend?.[i]?.value || 0,
            }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={10} interval={1} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="leave"   name="Leave"   stroke={C.occupied} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="outpass" name="Outpass" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Complaints by status">
          {ch.complaintStatus?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={ch.complaintStatus} dataKey="value" nameKey="label" outerRadius={90}>
                  {ch.complaintStatus.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty icon="📣" title="No complaints" message="Nothing has been raised yet." />}
        </Card>

        <Card title="Maintenance by status">
          {ch.maintenanceStatus?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ch.maintenanceStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="label" fontSize={11} width={90} />
                <Tooltip />
                <Bar dataKey="value" name="Requests" fill={C.occupied} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty icon="🔧" title="No maintenance" message="No work orders yet." />}
        </Card>

        <Card title="Hostel fee collection — last 6 months">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ch.feeCollection || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="billed"    name="Billed"    fill={C.neutral} radius={[4, 4, 0, 0]} />
              <Bar dataKey="collected" name="Collected" fill={C.available} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Recent incidents & activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginTop: 16 }}>
        <Card title="Recent incidents">
          {d.recentIncidents?.length ? d.recentIncidents.map((i) => (
            <div key={i._id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.83rem', fontWeight: 600, textTransform: 'capitalize' }}>
                  {String(i.incidentType || '').replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i.student?.name || 'Unattributed'} · {i.hostel?.name || ''}
                </div>
              </div>
              <Badge variant={i.severity === 'critical' ? 'danger' : i.severity === 'high' ? 'warning' : 'muted'}>{i.severity}</Badge>
            </div>
          )) : <Empty icon="🕊" title="No incidents" message="Nothing reported recently." />}
        </Card>

        <Card title="Recent activity">
          {d.recentActivities?.length ? d.recentActivities.map((a) => (
            <div key={a._id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.82rem' }}>{a.description}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {a.userName || a.user?.name || 'System'} · {new Date(a.createdAt).toLocaleString('en-IN')}
              </div>
            </div>
          )) : <Empty icon="🧾" title="No activity yet" />}
        </Card>
      </div>
    </div>
  );
}
