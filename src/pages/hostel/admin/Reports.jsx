import React, { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Button, Spinner, Empty, Badge, Card } from '../../../components/ui/index';
import { Filters, label, money, di } from '../shared';

const GROUPS = [
  { title: 'Occupancy', types: ['occupancy', 'room_occupancy', 'bed_availability', 'allocation'] },
  { title: 'Students', types: ['admissions', 'attendance', 'leave', 'outpass', 'late_return', 'movement'] },
  { title: 'Operations', types: ['visitors', 'mess', 'assets', 'maintenance', 'complaints'] },
  { title: 'Conduct', types: ['incidents', 'discipline', 'warden_activity'] },
  { title: 'Money', types: ['fees', 'outstanding_fees', 'revenue', 'expenses'] },
  { title: 'Summaries', types: ['monthly_summary', 'annual_summary'] },
];

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
const cell = (v) => {
  if (v == null || v === '') return '—';
  if (isDate(v)) return new Date(v).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};

/**
 * One screen for all 24 reports. The server returns {columns, rows, summary},
 * so adding a report type needs no frontend change — and the CSV export is the
 * same shape written out by the API.
 */
export default function Reports() {
  const [type, setType] = useState('occupancy');
  const [range, setRange] = useState({ from: '', to: '' });
  const [hostel, setHostel] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoad] = useState(false);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const r = await api.getReport({ type, from: range.from || undefined, to: range.to || undefined, hostel: hostel || undefined });
      setData(r.data ?? r);
    } catch (err) { toast.error(err.message); setData(null); } finally { setLoad(false); }
  }, [type, range, hostel]);
  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = await api.exportReport({ type, from: range.from || undefined, to: range.to || undefined, hostel: hostel || undefined });
      const blob = new Blob([typeof csv === 'string' ? csv : JSON.stringify(csv)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hostel-${type}-${di(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported');
    } catch (err) { toast.error(err.message); } finally { setExporting(false); }
  };

  const rows = (data?.rows || []).filter((r) => !search
    || Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="page">
      <PageHeader title="Hostel Reports" subtitle="Filter, print or export any view as CSV"
        action={<div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => window.print()}>🖨 Print</Button>
          <Button loading={exporting} onClick={exportCsv} disabled={!data?.rows?.length}>⬇ Export CSV</Button>
        </div>} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {GROUPS.map((g) => (
          <div key={g.title} style={{ minWidth: 160 }}>
            <div style={{ fontSize: '.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.04em', marginBottom: 5 }}>
              {g.title}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {g.types.map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`btn btn-sm ${type === t ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '.73rem', padding: '3px 9px' }}>
                  {label(t)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Filters>
        <select className="form-control" style={{ maxWidth: 200 }} value={hostel} onChange={(e) => setHostel(e.target.value)}>
          <option value="">All hostels</option>
          {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
        </select>
        <input className="form-control" style={{ maxWidth: 160 }} type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 160 }} type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 240 }} placeholder="🔍 Filter rows…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {(range.from || range.to || hostel) && (
          <Button size="sm" variant="secondary" onClick={() => { setRange({ from: '', to: '' }); setHostel(''); }}>Clear</Button>
        )}
      </Filters>

      {!!data?.summary && Object.keys(data.summary).length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {Object.entries(data.summary)
            .filter(([, v]) => typeof v !== 'object')
            .map(([k, v]) => (
              <div key={k} className="card" style={{ padding: '10px 14px', minWidth: 120 }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  {isDate(v) ? cell(v) : typeof v === 'number' && /amount|billed|collected|outstanding|cost|fine|total$/i.test(k) ? money(v) : cell(v)}
                </div>
                <div style={{ fontSize: '.71rem', color: 'var(--text-muted)' }}>{label(k)}</div>
              </div>
            ))}
        </div>
      )}

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 56 }}><Spinner /></div>
          : !rows.length ? <Empty icon="📈" title="Nothing to report" message="No rows match the current filters." />
          : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>{data.columns.map((c) => <th key={c}>{label(c)}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((r, i) => (
                    <tr key={i}>
                      {data.columns.map((c) => (
                        <td key={c} style={{ fontSize: '.82rem' }}>{cell(r[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div></div>

      {rows.length > 500 && (
        <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 10 }}>
          Showing the first 500 of {rows.length} rows — export to CSV for the full set.
        </div>
      )}
      {!!data?.summary?.byUser && (
        <Card title="By user">
          {Object.entries(data.summary.byUser).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '.84rem', borderBottom: '1px solid var(--border)' }}>
              <span>{k}</span><Badge variant="muted">{v}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
