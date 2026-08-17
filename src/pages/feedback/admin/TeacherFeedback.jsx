import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Card, Spinner, Alert, Empty, Table, Badge } from '../../../components/ui/index';
import { Score, LockedNotice } from '../shared/kit';
import { useFeedbackBase } from './Dashboard';

// The full teacher-performance table with sorting, search and department filter
// (spec §16). Shared by the admin and the principal — the base path is derived
// from the route so the drill-down links stay inside the caller's own section.
const SORTS = {
  rating:   (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
  name:     (a, b) => a.name.localeCompare(b.name),
  responses:(a, b) => b.responses - a.responses,
  rate:     (a, b) => b.responseRate - a.responseRate,
  trend:    (a, b) => (b.trend ?? -99) - (a.trend ?? -99),
};

export default function TeacherFeedback() {
  const base = useFeedbackBase();
  const [campaignId, setCampaignId] = useState('');
  const [search, setSearch] = useState('');
  const [dept, setDept]     = useState('');
  const [sort, setSort]     = useState('rating');

  const { data, loading, error } = useFetch(
    () => api.getDashboard(campaignId ? { campaignId } : {}),
    [campaignId],
  );

  const rows = useMemo(() => {
    let list = [...(data?.teachers || [])];
    if (search) list = list.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
    if (dept)   list = list.filter((t) => (t.department || 'Unassigned') === dept);
    return list.sort(SORTS[sort]);
  }, [data, search, dept, sort]);

  const departments = useMemo(
    () => [...new Set((data?.teachers || []).map((t) => t.department || 'Unassigned'))].sort(),
    [data],
  );

  if (loading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;
  if (error)   return <div className="page"><Alert variant="danger">{error}</Alert></div>;
  if (!data?.campaign) {
    return (
      <div className="page">
        <PageHeader title="Teacher Performance" />
        <Empty icon="👨‍🏫" title="No campaigns yet" message="Run a feedback campaign to see teacher results here." />
      </div>
    );
  }

  const min = data.campaign.minimumResponses || 5;

  return (
    <div className="page">
      <PageHeader
        title="Teacher Performance"
        subtitle={`${rows.length} teacher(s) · ${data.campaign.name}`}
        action={
          <select className="form-control" style={{ maxWidth: 250 }}
            value={campaignId || data.campaign._id} onChange={(e) => setCampaignId(e.target.value)}>
            {data.campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}{c.term ? ` · ${c.term}` : ''}</option>)}
          </select>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-control" style={{ maxWidth: 220 }} placeholder="Search teacher…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-control" style={{ maxWidth: 200 }} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 190 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="rating">Sort: rating</option>
          <option value="name">Sort: name</option>
          <option value="responses">Sort: responses</option>
          <option value="rate">Sort: response rate</option>
          <option value="trend">Sort: trend</option>
        </select>
      </div>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table
          columns={[
            {
              key: 'name', label: 'Teacher',
              render: (r) => (
                <Link to={`${base}/teachers/${r._id}`} style={{ fontWeight: 600 }}>
                  {r.name}
                  <div className="text-xs text-muted" style={{ fontWeight: 400 }}>{r.designation || 'Teacher'}</div>
                </Link>
              ),
            },
            { key: 'department', label: 'Department', render: (r) => r.department || <span className="text-muted">—</span> },
            { key: 'subjects', label: 'Subjects', render: (r) => <span className="text-sm">{r.subjects?.join(', ') || '—'}</span> },
            { key: 'responses', label: 'Responses', render: (r) => `${r.responses} / ${r.assigned}` },
            { key: 'responseRate', label: 'Response %', render: (r) => `${r.responseRate}%` },
            {
              key: 'rating', label: 'Avg Rating',
              render: (r) => (r.locked
                ? <LockedNotice responses={r.responses} minimum={min} compact />
                : <Score value={r.rating} size="sm" showLabel={false} />),
            },
            {
              key: 'trend', label: 'Trend',
              render: (r) => (r.trend == null
                ? <span className="text-muted">—</span>
                : <span style={{ color: r.trend >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {r.trend >= 0 ? '↑' : '↓'} {Math.abs(r.trend).toFixed(1)}
                  </span>),
            },
            {
              key: 'status', label: 'Status',
              render: (r) => (
                <Badge variant={{ good: 'success', average: 'warning', attention: 'danger', insufficient: 'muted' }[r.status]}>
                  {{ good: 'Good', average: 'Average', attention: 'Needs attention', insufficient: 'Insufficient' }[r.status]}
                </Badge>
              ),
            },
          ]}
          data={rows}
          emptyIcon="👨‍🏫"
          emptyTitle="No teachers match these filters"
        />
      </div></div>

      <Card>
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          Ratings are withheld for any teacher with fewer than {min} responses, so no individual student can be identified.
        </p>
      </Card>
    </div>
  );
}
