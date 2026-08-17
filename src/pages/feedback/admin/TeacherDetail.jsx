import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Card, Spinner, Alert, Button, StatCard, Badge } from '../../../components/ui/index';
import { Panel, Grid, TrendLine } from '../../analytics/viz';
import { Score, Stars, CategoryScores, LockedNotice } from '../shared/kit';
import { useFeedbackBase } from './Dashboard';

// Drill-down on one teacher, for admins and principals. Everything on this page
// obeys the same privacy floor as the teacher's own dashboard — an administrator
// reading a comment still cannot tell who wrote it.
export default function TeacherDetail() {
  const { id } = useParams();
  const base = useFeedbackBase();
  const [campaignId, setCampaignId] = useState('');
  const { data, loading, error } = useFetch(
    () => api.getTeacherAnalytics(id, campaignId ? { campaignId } : {}),
    [id, campaignId],
  );

  if (loading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;
  if (error)   return <div className="page"><Alert variant="danger">{error}</Alert></div>;

  const s = data.summary;
  const trend = (data.trend || []).filter((p) => p.rating != null);

  return (
    <div className="page">
      <PageHeader
        title={data.teacher.name}
        subtitle={[data.profile.designation || 'Teacher', data.profile.department, data.profile.employeeId].filter(Boolean).join(' · ')}
        action={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Link to={`${base}/teachers`}><Button variant="secondary" size="sm">← All teachers</Button></Link>
            {!!data.campaigns.length && (
              <select className="form-control" style={{ maxWidth: 240 }}
                value={campaignId || data.campaign?._id || ''} onChange={(e) => setCampaignId(e.target.value)}>
                {data.campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}{c.term ? ` · ${c.term}` : ''}</option>)}
              </select>
            )}
          </div>
        }
      />

      {!s ? (
        <Card><p className="text-muted">No feedback campaigns have run yet.</p></Card>
      ) : s.locked ? (
        <Card><LockedNotice responses={s.responses} minimum={s.minimumResponses} /></Card>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard icon="⭐" color="orange" label="Average Rating"
              value={s.averageRating == null ? '—' : `${s.averageRating.toFixed(1)} / 5.0`} />
            <StatCard icon="🗳" color="blue"   label="Responses"     value={s.responses} />
            <StatCard icon="📈" color="green"  label="Response Rate" value={`${s.responseRate}%`} />
            <StatCard icon="🧑‍🎓" color="purple" label="Assigned"      value={s.assigned} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <Score value={s.averageRating} size="lg" />
            <Stars value={Math.round(s.averageRating || 0)} size={20} />
            <Badge variant="muted">Min {s.minimumResponses} responses to display</Badge>
          </div>

          <Grid min={330}>
            <Panel title="Category performance" subtitle="Average rating out of 5">
              <CategoryScores categories={data.categories} />
            </Panel>

            <Panel title="Rating trend" subtitle="Average rating out of 5 across campaigns">
              {trend.length > 1
                ? <TrendLine data={trend} xKey="label" yKey="rating" unit="" name="Rating" domain={[0, 5]} />
                : <p className="text-sm text-muted">Not enough campaign history to draw a trend yet.</p>}
            </Panel>
          </Grid>

          <Grid min={330}>
            <Panel title="Strengths">
              {data.strengths?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: '.85rem' }}>
                  {data.strengths.map((c) => <li key={c._id}>{c.name} — {c.average.toFixed(1)}</li>)}
                </ul>
              ) : <p className="text-sm text-muted">No category is above 4.0.</p>}
            </Panel>
            <Panel title="Improvement areas">
              {data.improvements?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: '.85rem' }}>
                  {data.improvements.map((c) => <li key={c._id}>{c.name} — {c.average.toFixed(1)}</li>)}
                </ul>
              ) : <p className="text-sm text-muted">Every category is at 4.0 or above.</p>}
            </Panel>
          </Grid>

          {(data.options || []).map((block) => (
            <Panel key={block.question} title={block.question}>
              <ul style={{ display: 'grid', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
                {block.options.map((o) => (
                  <li key={o.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', marginBottom: 3 }}>
                      <span>{o.label}</span><strong>{o.count} <span className="text-muted">({o.percent}%)</span></strong>
                    </div>
                    <div style={{ background: '#eef2f7', borderRadius: 99, height: 7, overflow: 'hidden' }}>
                      <div style={{ width: `${o.percent}%`, height: '100%', background: 'var(--primary)', borderRadius: 99 }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}

          <Panel title="Student comments" subtitle="Anonymous and unordered — never linked back to a student">
            {data.comments?.length ? (
              <ul style={{ display: 'grid', gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
                {data.comments.map((c, i) => (
                  <li key={i} style={{
                    background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 14px',
                    fontSize: '.85rem', borderLeft: '3px solid var(--primary)',
                  }}>{c.text}</li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No written comments.</p>}
          </Panel>
        </>
      )}
    </div>
  );
}
