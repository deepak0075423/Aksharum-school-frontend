import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Card, Spinner, Alert, Empty, StatCard, Badge, Table } from '../../../components/ui/index';
import { Panel, Grid, TrendLine, RankBars } from '../../analytics/viz';
import { Score, CategoryScores, LockedNotice, CampaignBadge, fmtDate } from '../shared/kit';

// Shared by the school admin (/admin/feedback) and the principal
// (/teacher/feedback-review). The payload is identical — the backend decides
// what the caller may see; the base path only changes where links point.
export const useFeedbackBase = () => {
  const { pathname } = useLocation();
  return pathname.startsWith('/teacher') ? '/teacher/feedback-review' : '/admin/feedback';
};

export default function FeedbackDashboard() {
  const base = useFeedbackBase();
  const [campaignId, setCampaignId] = useState('');
  const { data, loading, error } = useFetch(
    () => api.getDashboard(campaignId ? { campaignId } : {}),
    [campaignId],
  );

  if (loading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;
  if (error)   return <div className="page"><Alert variant="danger">{error}</Alert></div>;

  const c = data.cards;
  const isPrincipal = data.access?.isPrincipal;

  if (!data.campaigns?.length) {
    return (
      <div className="page">
        <PageHeader title="Feedback Dashboard" />
        <Empty
          icon="📋"
          title="No active feedback campaigns"
          message={data.access?.canManage
            ? 'Create a campaign to start collecting student feedback about teachers.'
            : 'Nothing has been collected yet.'}
          action={data.access?.canManage
            ? <Link to={`${base}/campaigns`}><button className="btn btn-primary">Create campaign</button></Link>
            : null}
        />
      </div>
    );
  }

  const teacherCols = [
    {
      key: 'name',
      label: 'Teacher',
      render: (r) => (
        <Link to={`${base}/teachers/${r._id}`} style={{ fontWeight: 600 }}>
          {r.name}
          <div className="text-xs text-muted" style={{ fontWeight: 400 }}>
            {[r.department, r.subjects?.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
          </div>
        </Link>
      ),
    },
    { key: 'responses', label: 'Responses', render: (r) => `${r.responses} / ${r.assigned}` },
    { key: 'responseRate', label: 'Response %', render: (r) => `${r.responseRate}%` },
    {
      key: 'rating',
      label: 'Avg Rating',
      render: (r) => (r.locked
        ? <LockedNotice responses={r.responses} minimum={data.campaign?.minimumResponses || 5} compact />
        : <Score value={r.rating} size="sm" showLabel={false} />),
    },
    {
      key: 'trend',
      label: 'Trend',
      render: (r) => (r.trend == null
        ? <span className="text-muted">—</span>
        : <span style={{ color: r.trend >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
            {r.trend >= 0 ? '↑' : '↓'} {Math.abs(r.trend).toFixed(1)}
          </span>),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <Badge variant={{ good: 'success', average: 'warning', attention: 'danger', insufficient: 'muted' }[r.status]}>
          {{ good: 'Good', average: 'Average', attention: 'Needs attention', insufficient: 'Insufficient' }[r.status]}
        </Badge>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title={isPrincipal ? 'School Feedback Overview' : 'Feedback Dashboard'}
        subtitle={isPrincipal
          ? 'School-wide teaching quality, by department and by teacher'
          : 'Campaign performance and teacher evaluation across the school'}
        action={
          <select className="form-control" style={{ maxWidth: 260 }}
            value={campaignId || data.campaign?._id || ''}
            onChange={(e) => setCampaignId(e.target.value)}>
            {data.campaigns.map((x) => (
              <option key={x._id} value={x._id}>{x.name}{x.term ? ` · ${x.term}` : ''}</option>
            ))}
          </select>
        }
      />

      <div className="stat-grid">
        <StatCard icon="📋" color="blue"   label="Total Campaigns"    value={c.totalCampaigns} />
        <StatCard icon="🟢" color="green"  label="Active Campaigns"   value={c.activeCampaigns} />
        <StatCard icon="👨‍🏫" color="purple" label="Teachers Evaluated" value={c.teachersEvaluated} />
        <StatCard icon="🗳" color="blue"   label="Total Responses"    value={c.totalResponses} />
        <StatCard icon="⏳" color="orange" label="Pending Responses"  value={c.pendingResponses} />
        <StatCard icon="📈" color="green"  label="Response Rate"      value={`${c.responseRate}%`} />
        <StatCard icon="⭐" color="orange" label="Overall Rating"
          value={c.averageRating == null ? '—' : `${c.averageRating.toFixed(1)} / 5.0`} />
      </div>

      <Grid min={330}>
        <Panel title="Rating trend" subtitle="Average rating out of 5 across campaigns">
          {data.trend?.length > 1
            ? <TrendLine data={data.trend} xKey="label" yKey="rating" unit="" name="Rating" domain={[0, 5]} />
            : <p className="text-sm text-muted">At least two completed campaigns are needed to draw a trend.</p>}
        </Panel>

        <Panel title="Category performance" subtitle="School-wide average per feedback category">
          <CategoryScores categories={data.categories} />
        </Panel>
      </Grid>

      {!!data.departments?.length && (
        <Panel title="Department performance" subtitle="Average rating out of 5 by department"
          right={<Link to={`${base}/departments`} className="text-sm">View all →</Link>}>
          <RankBars
            data={data.departments.filter((d) => d.rating != null).map((d) => ({ label: d.name, value: d.rating }))}
            labelKey="label" valueKey="value" unit="" max={5} />
        </Panel>
      )}

      <Panel
        title="Teacher performance"
        subtitle={`${data.teachers.length} teacher(s) in ${data.campaign?.name || 'this campaign'}`}
        right={<Link to={`${base}/teachers`} className="text-sm">Full table →</Link>}
      >
        <Table columns={teacherCols} data={data.teachers.slice(0, 10)} emptyIcon="👨‍🏫" emptyTitle="No teachers evaluated yet" />
      </Panel>

      <Panel title="Campaigns">
        <Table
          columns={[
            {
              key: 'name', label: 'Campaign',
              render: (r) => (data.access?.canManage
                ? <Link to={`${base}/campaigns/${r._id}`} style={{ fontWeight: 600 }}>{r.name}</Link>
                : <strong>{r.name}</strong>),
            },
            { key: 'term', label: 'Term', render: (r) => r.term || '—' },
            { key: 'status', label: 'Status', render: (r) => <CampaignBadge status={r.status} /> },
            { key: 'window', label: 'Window', render: (r) => `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}` },
            { key: 'submitted', label: 'Responses', render: (r) => `${r.submitted} / ${r.assigned}` },
            { key: 'responseRate', label: 'Response %', render: (r) => `${r.responseRate}%` },
            { key: 'avgRating', label: 'Avg Rating', render: (r) => <Score value={r.avgRating} size="sm" showLabel={false} /> },
          ]}
          data={data.campaigns}
          emptyIcon="📋"
          emptyTitle="No campaigns"
        />
      </Panel>
    </div>
  );
}
