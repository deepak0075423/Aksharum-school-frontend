import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Card, Spinner, Alert, Empty, Table } from '../../../components/ui/index';
import { Panel, RankBars } from '../../analytics/viz';
import { Score } from '../shared/kit';
import { useFeedbackBase } from './Dashboard';

// Department roll-up (spec §17) — the drill-down path is School → Department →
// Teacher, so each row expands into the teachers it covers.
export default function Departments() {
  const base = useFeedbackBase();
  const [campaignId, setCampaignId] = useState('');
  const [open, setOpen] = useState(null);
  const { data, loading, error } = useFetch(
    () => api.getDashboard(campaignId ? { campaignId } : {}),
    [campaignId],
  );

  if (loading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;
  if (error)   return <div className="page"><Alert variant="danger">{error}</Alert></div>;
  if (!data?.departments?.length) {
    return (
      <div className="page">
        <PageHeader title="Department Performance" />
        <Empty icon="🏢" title="No department data"
          message="Assign departments on teacher profiles to see department-level results." />
      </div>
    );
  }

  const rated = data.departments.filter((d) => d.rating != null);
  const teachersOf = (dept) => data.teachers.filter((t) => (t.department || 'Unassigned') === dept);

  return (
    <div className="page">
      <PageHeader
        title="Department Performance"
        subtitle={`${data.departments.length} department(s) · ${data.campaign?.name || ''}`}
        action={
          <select className="form-control" style={{ maxWidth: 250 }}
            value={campaignId || data.campaign?._id || ''} onChange={(e) => setCampaignId(e.target.value)}>
            {data.campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}{c.term ? ` · ${c.term}` : ''}</option>)}
          </select>
        }
      />

      <Panel title="Average rating by department" subtitle="Out of 5, averaged across the department's teachers">
        {rated.length
          ? <RankBars data={rated.map((d) => ({ label: d.name, value: d.rating }))} labelKey="label" valueKey="value" unit="" max={5} />
          : <p className="text-sm text-muted">No department has enough responses yet.</p>}
      </Panel>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table
          columns={[
            {
              key: 'name', label: 'Department',
              render: (r) => (
                <button onClick={() => setOpen(open === r.name ? null : r.name)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0, color: 'var(--primary)' }}>
                  {open === r.name ? '▾ ' : '▸ '}{r.name}
                </button>
              ),
            },
            { key: 'teachers', label: 'Teachers' },
            { key: 'evaluated', label: 'With Results', render: (r) => `${r.evaluated} / ${r.teachers}` },
            { key: 'responses', label: 'Responses' },
            { key: 'responseRate', label: 'Response %', render: (r) => `${r.responseRate}%` },
            { key: 'rating', label: 'Avg Rating', render: (r) => <Score value={r.rating} size="sm" showLabel={false} /> },
          ]}
          data={data.departments}
          emptyIcon="🏢"
          emptyTitle="No departments"
        />
      </div></div>

      {open && (
        <Card title={`${open} — teachers`}>
          <Table
            columns={[
              { key: 'name', label: 'Teacher', render: (r) => <Link to={`${base}/teachers/${r._id}`}>{r.name}</Link> },
              { key: 'responses', label: 'Responses', render: (r) => `${r.responses} / ${r.assigned}` },
              { key: 'responseRate', label: 'Response %', render: (r) => `${r.responseRate}%` },
              {
                key: 'rating', label: 'Avg Rating',
                render: (r) => (r.locked
                  ? <span className="text-muted text-xs">🔒 Insufficient responses</span>
                  : <Score value={r.rating} size="sm" showLabel={false} />),
              },
            ]}
            data={teachersOf(open)}
            emptyIcon="👨‍🏫"
            emptyTitle="No teachers in this department"
          />
        </Card>
      )}
    </div>
  );
}
