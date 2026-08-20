import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { listReports, runReport, downloadFile } from '../../../api/library.api';
import { PageHeader, Button, Spinner, Empty, Alert } from '../../../components/ui/index';
import MemberPicker from '../../../components/library/MemberPicker';

// The reports screen builds itself from the server's own list, so adding a
// report on the backend does not need a matching edit here.
//
// Every report answers on one shape — an array of already-labelled rows — which
// is why one table renders all seven and the export is the same URL with
// format=xlsx.

const today = () => new Date().toISOString().slice(0, 10);
const monthsAgo = (n) => new Date(Date.now() - n * 30 * 86400000).toISOString().slice(0, 10);

const FILTER_LABEL = { from: 'From', to: 'To', since: 'Not borrowed since', userId: 'Member' };

export default function LibraryReports() {
  const [reports, setReports] = useState([]);
  const [active,  setActive]  = useState(null);
  const [filters, setFilters] = useState({});
  const [rows,    setRows]    = useState(null);
  const [extra,   setExtra]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    listReports()
      .then(res => {
        const list = res?.data || [];
        setReports(list);
        if (list.length) select(list[0]);
      })
      .catch(err => setError(err?.message || 'Could not load the report list'));
  }, []);

  const select = (r) => {
    setActive(r);
    setRows(null);
    setExtra(null);
    setError('');
    setFilters(
      r.filters.includes('since') ? { since: monthsAgo(12) }
      : r.filters.includes('from') ? { from: monthsAgo(6), to: today() }
      : {},
    );
  };

  const run = async (report = active, params = filters) => {
    if (!report) return;
    if (report.filters.includes('userId') && !params.userId) {
      setError('Pick a member first.');
      return;
    }
    // `max` on the input stops the picker, not a typed or pasted date.
    const future = ['from', 'to', 'since'].find(k => params[k] && params[k] > today());
    if (future) {
      setError(`${FILTER_LABEL[future] || future} cannot be in the future.`);
      return;
    }
    if (params.from && params.to && params.from > params.to) {
      setError('The start of the range is after its end.');
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await runReport(report.path, params);
      setRows(res?.data || []);
      const { success, data, ...rest } = res || {};
      setExtra(Object.keys(rest).length ? rest : null);
    } catch (err) {
      setError(err?.message || 'The report could not be run');
      setRows(null);
    } finally { setLoading(false); }
  };

  // Auto-run anything that needs no input; the rest wait for the librarian.
  useEffect(() => {
    if (active && active.filters.length === 0) run(active, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const download = () => {
    if (!active) return;
    toast.promise(
      downloadFile(active.path, { ...filters, format: 'xlsx' }, `${active.key}_${today()}.xlsx`),
      { loading: 'Building the spreadsheet…', success: 'Downloaded', error: (e) => e?.message || 'Export failed' },
    );
  };

  const columns = rows?.length ? Object.keys(rows[0]) : [];

  return (
    <div className="page">
      <PageHeader title="Reports" subtitle="What the library is asked for each term"
        action={rows?.length ? <Button variant="secondary" onClick={download}>Export to Excel</Button> : null} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {reports.map(r => (
          <button key={r.key} onClick={() => select(r)}
            className={`btn btn-${active?.key === r.key ? 'primary' : 'secondary'} btn-sm`}>
            {r.name}
          </button>
        ))}
      </div>

      {active?.filters.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            {/* The controls sit in their own grid and the button on its own row.
                Aligning a button against a member picker never worked: the
                picker grows a card once someone is chosen, so `align-items:end`
                left the button floating against a moving target. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '0 16px' }}>
              {active.filters.map(f => (
                f === 'userId' ? (
                  <MemberPicker key={f} value={filters.userId || ''}
                    onChange={(id) => setFilters(v => ({ ...v, userId: id }))} />
                ) : (
                  <div className="form-group" key={f}>
                    <label className="form-label">{FILTER_LABEL[f] || f}</label>
                    <input
                      type="date"
                      className="form-control"
                      value={filters[f] || ''}
                      /* These windows all look backwards — a report cannot cover
                         days that have not happened. */
                      max={today()}
                      min={f === 'to' ? (filters.from || undefined) : undefined}
                      onChange={e => setFilters(v => ({ ...v, [f]: e.target.value }))}
                    />
                    {f === 'since' && <div className="form-hint">Books with no loan on or after this date.</div>}
                  </div>
                )
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button onClick={() => run()} loading={loading}>Run report</Button>
              {rows?.length > 0 && (
                <span className="text-muted text-sm">
                  {rows.length} row{rows.length === 1 ? '' : 's'} from the last run
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <div style={{ marginBottom: 16 }}><Alert variant="danger">{error}</Alert></div>}

      {extra && <ReportSummary extra={extra} />}

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          ) : !rows ? (
            <Empty icon="📊" title="Choose a report" message="Pick one above and run it." />
          ) : rows.length === 0 ? (
            <Empty icon="✅" title="Nothing to show" message="No rows matched — which is usually good news." />
          ) : (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      {columns.map(c => (
                        <td key={c} style={typeof r[c] === 'number' ? { fontVariantNumeric: 'tabular-nums' } : undefined}>
                          {r[c] === '' || r[c] == null ? '—' : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {rows?.length > 0 && (
          <div className="card-footer">
            <span className="text-muted text-sm">{rows.length} row{rows.length === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Reports return their own headline numbers alongside the rows — a collection
// value, a fine breakdown, a member's outstanding balance. Render whatever came.
const ReportSummary = ({ extra }) => {
  const tiles = [];
  const push = (label, value) => tiles.push({ label, value });

  if (typeof extra.total === 'number') push('Rows', extra.total);
  if (typeof extra.value === 'number') push('Collection value', `₹${extra.value.toLocaleString('en-IN')}`);
  if (extra.since) push('Since', extra.since);
  if (extra.member) push('Member', extra.member.name);
  if (extra.summary) {
    for (const [k, v] of Object.entries(extra.summary)) {
      push(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
        typeof v === 'number' && /fine|pending|paid|waived/i.test(k) ? `₹${v.toLocaleString('en-IN')}` : v);
    }
  }
  if (!tiles.length) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
      {tiles.map(t => (
        <div className="card" key={t.label}>
          <div className="card-body" style={{ padding: '12px 16px' }}>
            <div className="text-muted text-sm">{t.label}</div>
            <strong style={{ fontSize: '1.15rem', fontVariantNumeric: 'tabular-nums' }}>{t.value}</strong>
          </div>
        </div>
      ))}
    </div>
  );
};
