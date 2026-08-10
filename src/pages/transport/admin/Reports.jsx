import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Button, Spinner, Badge } from '../../../components/ui/index';

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
const di = (v) => v ? new Date(v).toISOString().slice(0, 10) : '';

function toCSV(rows, cols) {
  const head = cols.map(c => c[1]).join(',');
  const body = rows.map(r => cols.map(c => JSON.stringify(c[2] ? c[2](r) : (r[c[0]] ?? ''))).join(',')).join('\n');
  return `${head}\n${body}`;
}
function download(name, csv) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function ReportCard({ title, rows, cols, filename }) {
  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="card-title">{title}</h3>
        {rows?.length > 0 && <Button size="sm" variant="secondary" onClick={() => download(filename, toCSV(rows, cols))}>⬇ CSV</Button>}
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        {(!rows || rows.length === 0) ? <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: '.85rem' }}>No data in range.</div> : (
          <table className="table" style={{ width: '100%' }}>
            <thead><tr>{cols.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(c => <td key={c[0]}>{c[2] ? c[2](r) : (r[c[0]] ?? '—')}</td>)}</tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function TransportReports() {
  const monthAgo = new Date(Date.now() - 60 * 864e5);
  const [from, setFrom] = useState(di(monthAgo));
  const [to, setTo] = useState(di(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoad] = useState(true);

  const load = async () => {
    setLoad(true);
    try { const res = await api.getReports({ from, to }); setData(res.data ?? res); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <div className="page">
      <PageHeader title="Transport Reports" subtitle="Fuel, maintenance, fee, occupancy & incident analytics" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}><label className="form-label">From</label><input type="date" className="form-control" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="form-group" style={{ margin: 0 }}><label className="form-label">To</label><input type="date" className="form-control" value={to} onChange={e => setTo(e.target.value)} /></div>
        <Button onClick={load}>Apply</Button>
      </div>
      {loading ? <div className="loading-page"><Spinner /></div> : data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 16 }}>
          <ReportCard title="⛽ Fuel by Vehicle" rows={data.fuel} filename="fuel-report.csv"
            cols={[['vehicle','Vehicle'],['litres','Litres'],['cost','Cost',r=>fmt(r.cost)],['avgMileage','Avg km/l']]} />
          <ReportCard title="🔧 Maintenance by Category" rows={data.maintenance} filename="maintenance-report.csv"
            cols={[['_id','Category',r=>String(r._id).replace('_',' ')],['count','Jobs'],['cost','Cost',r=>fmt(r.cost)]]} />
          <ReportCard title="💳 Fees by Status" rows={data.fees} filename="fee-report.csv"
            cols={[['_id','Status'],['count','Invoices'],['amount','Billed',r=>fmt(r.amount)],['paid','Collected',r=>fmt(r.paid)]]} />
          <ReportCard title="🚌 Vehicle Occupancy" rows={data.occupancy} filename="occupancy-report.csv"
            cols={[['vehicle','Vehicle'],['students','Students'],['capacity','Capacity'],['utilization','Utilization',r=><Badge variant={r.utilization>=90?'danger':r.utilization>=70?'warning':'success'}>{r.utilization}%</Badge>]]} />
          <ReportCard title="⚠️ Incidents by Type" rows={data.incidents} filename="incident-report.csv"
            cols={[['_id','Type'],['count','Count'],['repairCost','Repair Cost',r=>fmt(r.repairCost)]]} />
        </div>
      )}
    </div>
  );
}
