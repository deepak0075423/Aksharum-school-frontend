import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Card, Spinner, Alert, Button, Table, Empty } from '../../../components/ui/index';
import { Score } from '../shared/kit';

const TYPES = [
  { value: 'teacher',       label: 'Teacher Feedback Report' },
  { value: 'campaign',      label: 'Campaign Report' },
  { value: 'class',         label: 'Class-wise Report' },
  { value: 'subject',       label: 'Subject-wise Report' },
  { value: 'department',    label: 'Department-wise Report' },
  { value: 'response_rate', label: 'Response Rate Report' },
  { value: 'trend',         label: 'Rating Trend Report' },
];

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

const EMPTY_FILTERS = {
  academicYear: '', campaign: '', teacher: '', subject: '', class: '', section: '', term: '',
  dateFrom: '', dateTo: '',
};

// One filter bar drives both the on-screen table and the export, so what you
// see is exactly what downloads. Exports carry the same privacy rules — a row
// below the response threshold exports as "Insufficient responses", not a number.
export default function Reports() {
  const [type, setType] = useState('teacher');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [exporting, setExporting] = useState('');
  const activeCount = Object.values(filters).filter(Boolean).length;

  const meta = useFetch(() => api.getMeta(), []);
  const campaigns = useFetch(() => api.getCampaigns({ limit: 100, includeArchived: true }), []);
  const { data, loading, error } = useFetch(
    () => api.getReport({ type, format: 'json', ...clean(filters) }),
    [type, ...Object.values(filters)],
  );

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const doExport = async (format) => {
    setExporting(format);
    try {
      await api.downloadReport({ type, format, ...clean(filters) });
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(''); }
  };

  const sections = (meta.data?.sections || []).filter((s) => !filters.class || String(s.class) === filters.class);

  const columns = (data?.columns || []).map((c) => ({
    key: c.key,
    label: c.label,
    render: (r) => {
      if (c.key === 'avgRating') {
        return r.avgRating == null
          ? <span className="text-muted text-xs">{r.note || '—'}</span>
          : <Score value={r.avgRating} size="sm" showLabel={false} />;
      }
      if (c.key === 'responseRate') return `${r[c.key]}%`;
      if (c.key === 'note') return r.note ? <span className="text-xs text-muted">🔒 {r.note}</span> : '';
      return r[c.key] ?? '—';
    },
  }));

  return (
    <div className="page">
      <PageHeader
        title="Feedback Reports"
        subtitle="Filter, review on screen, then export"
        action={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" onClick={() => doExport('xlsx')} loading={exporting === 'xlsx'}>Excel</Button>
            <Button variant="secondary" size="sm" onClick={() => doExport('csv')}  loading={exporting === 'csv'}>CSV</Button>
            <Button variant="secondary" size="sm" onClick={() => doExport('pdf')}  loading={exporting === 'pdf'}>PDF</Button>
          </div>
        }
      />

      <Card title="Report & filters">
        <div className="form-row form-row-3">
          <div className="form-group">
            <label className="form-label">Report</label>
            <select className="form-control" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Academic Year</label>
            <select className="form-control" value={filters.academicYear} onChange={(e) => set('academicYear', e.target.value)}>
              <option value="">All</option>
              {(meta.data?.academicYears || []).map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Campaign</label>
            <select className="form-control" value={filters.campaign} onChange={(e) => set('campaign', e.target.value)}>
              <option value="">All</option>
              {((campaigns.data?.data) || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row form-row-3">
          <div className="form-group">
            <label className="form-label">Teacher</label>
            <select className="form-control" value={filters.teacher} onChange={(e) => set('teacher', e.target.value)}>
              <option value="">All</option>
              {(meta.data?.teachers || []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Subject</label>
            <select className="form-control" value={filters.subject} onChange={(e) => set('subject', e.target.value)}>
              <option value="">All</option>
              {(meta.data?.subjects || []).map((s) => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Term</label>
            <input className="form-control" value={filters.term} placeholder="e.g. Term 1"
              onChange={(e) => set('term', e.target.value)} />
          </div>
        </div>

        <div className="form-row form-row-3">
          <div className="form-group">
            <label className="form-label">Class</label>
            <select className="form-control" value={filters.class}
              onChange={(e) => { set('class', e.target.value); set('section', ''); }}>
              <option value="">All</option>
              {(meta.data?.classes || []).map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Section</label>
            <select className="form-control" value={filters.section} onChange={(e) => set('section', e.target.value)}>
              <option value="">All</option>
              {sections.map((s) => <option key={s._id} value={s._id}>{s.sectionName}</option>)}
            </select>
          </div>
          <div className="form-row form-row-2" style={{ gap: 8 }}>
            <div className="form-group">
              <label className="form-label">From</label>
              <input className="form-control" type="date" value={filters.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">To</label>
              <input className="form-control" type="date" value={filters.dateTo} onChange={(e) => set('dateTo', e.target.value)} />
            </div>
          </div>
        </div>

        {/* The last grid row leaves a 34px gutter under it, so this sits flush
            without extra spacing of its own. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="text-xs text-muted">
            {activeCount ? `${activeCount} filter${activeCount === 1 ? '' : 's'} applied` : 'Showing everything'}
          </span>
          <Button variant="secondary" size="sm" disabled={!activeCount} onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        </div>
      </Card>

      <div style={{ height: 16 }} />

      {loading ? (
        <Card><div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div></Card>
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : (
        <Card title={data.title}
          action={<span className="text-xs text-muted">{data.rows.length} row(s) · {data.meta?.campaigns || 0} campaign(s)</span>}>
          {data.rows.length
            ? <Table columns={columns} data={data.rows} />
            : <Empty icon="📄" title="No data" message="No records match the selected filters." />}
          <p className="text-xs text-muted" style={{ marginTop: 12 }}>
            Rows marked 🔒 are withheld because too few students responded — the same rule applies to Excel, CSV and PDF exports.
            No export ever contains student identities.
          </p>
        </Card>
      )}
    </div>
  );
}
