import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { listReports, getReport, downloadReport } from '../../api/employeeDirectory.api';
import { PageHeader, Empty, Spinner, Button } from '../../components/ui/index';
import { SkeletonRows, ErrorState } from './parts';

// Administrative reports. Every one of them is built from the same filtered
// employee set as the directory, and none carries Aadhaar, PAN, bank or salary
// columns — an export cannot leak what the profile screen masks.

export default function Reports() {
  const { data: catalogue, loading: catLoading, error: catError, refetch } = useFetch(listReports, []);
  const [active, setActive] = useState('directory');
  const [busy, setBusy] = useState('');

  const { data: report, loading, error } = useFetch(() => getReport(active), [active]);

  const grab = async (format) => {
    setBusy(format);
    try { await downloadReport(active, format); toast.success(`${format.toUpperCase()} downloaded`); }
    catch { toast.error('Export failed — please try again'); }
    finally { setBusy(''); }
  };

  const print = () => window.print();

  if (catLoading) return <div className="page"><PageHeader title="Reports" /><SkeletonRows rows={6} cols={4} /></div>;
  if (catError)   return <div className="page"><PageHeader title="Reports" /><ErrorState error={catError} onRetry={refetch} /></div>;

  const reports = catalogue?.reports || [];

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        subtitle="Built from your school's employee records"
        action={
          <div style={{ display: 'flex', gap: 8 }} className="no-print">
            <Button variant="secondary" loading={busy === 'csv'}  onClick={() => grab('csv')}>⬇ CSV</Button>
            <Button variant="secondary" loading={busy === 'xlsx'} onClick={() => grab('xlsx')}>⬇ Excel</Button>
            <Button variant="secondary" onClick={print}>🖨 Print</Button>
          </div>
        }
      />

      <div className="tabs no-print" style={{ flexWrap: 'wrap' }}>
        {reports.map((r) => (
          <button key={r.key} className={`tab${active === r.key ? ' active' : ''}`} onClick={() => setActive(r.key)}>{r.label}</button>
        ))}
      </div>

      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>}
      {error && <ErrorState error={error} title="Could not build this report" />}

      {!loading && !error && report && (
        <div className="card">
          <div className="card-header">
            <h2>{report.label}</h2>
            <span className="text-muted text-sm">{report.total} rows</span>
          </div>
          {report.rows.length === 0
            ? <div className="card-body"><Empty icon="📄" title="Nothing to report" message="No employee records match this report yet." /></div>
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr>{report.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {report.rows.map((row, i) => (
                      <tr key={i}>{row.map((cell, j) => <td key={j}>{cell === '' || cell == null ? <span className="text-muted">—</span> : String(cell)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      <style>{'@media print{.no-print,.sidebar,.header{display:none!important}.page{padding:0}}'}</style>
    </div>
  );
}
