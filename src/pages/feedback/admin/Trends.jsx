import React, { useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Card, Spinner, Alert, Empty, Table } from '../../../components/ui/index';
import { Panel, Grid, TrendLine, RankBars } from '../../analytics/viz';
import { Score } from '../shared/kit';

// School-level trends (spec §15/§17) driven by the trend report, so the numbers
// on this page and in an exported Rating Trend Report are the same numbers.
export default function FeedbackTrends() {
  const [filters, setFilters] = useState({ academicYear: '', subject: '', class: '' });
  const meta = useFetch(() => api.getMeta(), []);
  const { data, loading, error } = useFetch(
    () => api.getReport({ type: 'trend', format: 'json', ...clean(filters) }),
    [filters.academicYear, filters.subject, filters.class],
  );
  const dash = useFetch(() => api.getDashboard(), []);

  if (loading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;
  if (error)   return <div className="page"><Alert variant="danger">{error}</Alert></div>;

  const points = (data?.rows || []).filter((r) => r.avgRating != null);

  return (
    <div className="page">
      <PageHeader
        title="Feedback Trends"
        subtitle="How teaching quality has moved across campaigns"
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="form-control" style={{ maxWidth: 170 }} value={filters.academicYear}
              onChange={(e) => setFilters((f) => ({ ...f, academicYear: e.target.value }))}>
              <option value="">All years</option>
              {(meta.data?.academicYears || []).map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: 170 }} value={filters.subject}
              onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))}>
              <option value="">All subjects</option>
              {(meta.data?.subjects || []).map((s) => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: 150 }} value={filters.class}
              onChange={(e) => setFilters((f) => ({ ...f, class: e.target.value }))}>
              <option value="">All classes</option>
              {(meta.data?.classes || []).map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
            </select>
          </div>
        }
      />

      {!points.length ? (
        <Card><Empty icon="📈" title="No trend data yet"
          message="Trends appear once at least one campaign has collected responses." /></Card>
      ) : (
        <>
          <Panel title="Average rating by campaign" subtitle="Out of 5, across all evaluated teachers">
            <TrendLine data={points.map((r) => ({ label: r.term || r.campaign, rating: r.avgRating }))}
              xKey="label" yKey="rating" unit="" name="Rating" domain={[0, 5]} />
          </Panel>

          <Grid min={330}>
            <Panel title="Response rate by campaign" subtitle="Percentage of assigned students who responded">
              <RankBars data={points.map((r) => ({ label: r.term || r.campaign, value: r.responseRate }))}
                labelKey="label" valueKey="value" unit="%" max={100} />
            </Panel>
            <Panel title="Category performance (current campaign)">
              {dash.data?.categories?.length
                ? <RankBars data={dash.data.categories.map((c) => ({ label: c.name, value: c.average }))}
                    labelKey="label" valueKey="value" unit="" max={5} />
                : <p className="text-sm text-muted">No category scores yet.</p>}
            </Panel>
          </Grid>

          <Panel title="Campaign by campaign">
            <Table
              columns={[
                { key: 'campaign', label: 'Campaign' },
                { key: 'term', label: 'Term', render: (r) => r.term || '—' },
                { key: 'period', label: 'Period' },
                { key: 'responses', label: 'Responses' },
                { key: 'responseRate', label: 'Response %', render: (r) => `${r.responseRate}%` },
                { key: 'avgRating', label: 'Avg Rating', render: (r) => <Score value={r.avgRating} size="sm" showLabel={false} /> },
              ]}
              data={data.rows}
              emptyIcon="📈"
              emptyTitle="No campaigns"
            />
          </Panel>
        </>
      )}
    </div>
  );
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
