import React, { useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Card, Spinner, Alert, Empty, Table } from '../../../components/ui/index';
import { Grid, Panel } from '../../analytics/viz';
import { Score, LockedNotice } from '../shared/kit';

// Subject-wise and class-wise cut of the teacher's own results. Every slice
// carries the same minimum-response floor, so narrowing a cohort can never be
// used to isolate one respondent.
export default function TeacherBreakdown() {
  const [campaignId, setCampaignId] = useState('');
  const { data, loading, error } = useFetch(
    () => api.getTeacherBreakdown(campaignId ? { campaignId } : {}),
    [campaignId],
  );

  if (loading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;
  if (error)   return <div className="page"><Alert variant="danger">{error}</Alert></div>;
  if (!data?.campaign) {
    return (
      <div className="page">
        <PageHeader title="Where my feedback came from" />
        <Empty icon="📋" title="No feedback campaigns yet" />
      </div>
    );
  }

  const columns = (labelHead) => ([
    { key: 'name', label: labelHead },
    { key: 'responses', label: 'Responses', render: (r) => `${r.responses} / ${r.assigned}` },
    { key: 'responseRate', label: 'Response %', render: (r) => `${r.responseRate}%` },
    {
      key: 'rating',
      label: 'Avg Rating',
      render: (r) => (r.locked
        ? <LockedNotice responses={r.responses} minimum={data.campaign.minimumResponses || 5} compact />
        : <Score value={r.rating} size="sm" showLabel={false} />),
    },
  ]);

  return (
    <div className="page">
      <PageHeader
        title="Where my feedback came from"
        subtitle="Your results split by subject and by section"
        action={
          <select className="form-control" style={{ maxWidth: 260 }}
            value={campaignId || data.campaign._id}
            onChange={(e) => setCampaignId(e.target.value)}>
            {data.campaigns.map((c) => (
              <option key={c._id} value={c._id}>{c.name}{c.term ? ` · ${c.term}` : ''}</option>
            ))}
          </select>
        }
      />

      <Grid min={340}>
        <Panel title="By subject">
          <Table columns={columns('Subject')} data={data.bySubject} emptyIcon="📚" emptyTitle="No subject data" />
        </Panel>
        <Panel title="By class / section">
          <Table columns={columns('Section')} data={data.bySection} emptyIcon="🏛️" emptyTitle="No section data" />
        </Panel>
      </Grid>

      <Card>
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          Slices with fewer responses than the campaign threshold are hidden so individual students stay anonymous.
        </p>
      </Card>
    </div>
  );
}
