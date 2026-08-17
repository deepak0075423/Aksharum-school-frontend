import React, { useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Card, Spinner, Alert, Empty, StatCard } from '../../../components/ui/index';
import { Panel, Grid, RankBars } from '../../analytics/viz';
import { Score, Stars, CategoryScores, LockedNotice, CampaignBadge, fmtDate } from '../shared/kit';

// What a teacher sees about themselves (spec §14): aggregates only, and only
// once the campaign's minimum-response threshold has been met. The server
// enforces both — this page just renders whichever shape came back.
export default function TeacherFeedbackDashboard() {
  const [campaignId, setCampaignId] = useState('');
  const { data, loading, error } = useFetch(
    () => api.getTeacherDashboard(campaignId ? { campaignId } : {}),
    [campaignId],
  );

  if (loading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;
  if (error)   return <div className="page"><Alert variant="danger">{error}</Alert></div>;

  if (!data?.campaign) {
    return (
      <div className="page">
        <PageHeader title="My Feedback" subtitle="Aggregated student feedback about your teaching" />
        <Empty icon="📋" title="No feedback campaigns yet"
          message="Once your school runs a feedback campaign, your results will appear here." />
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="page">
      <PageHeader
        title="My Feedback"
        subtitle="Students answer anonymously — you see combined results only."
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <CampaignBadge status={data.campaign.status} />
        <span className="text-sm text-muted">
          {fmtDate(data.campaign.startDate)} – {fmtDate(data.campaign.endDate)}
        </span>
      </div>

      {s.locked ? (
        <Card>
          <LockedNotice responses={s.responses} minimum={s.minimumResponses} />
        </Card>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard icon="⭐" color="blue"   label="Overall Rating"
              value={s.averageRating == null ? '—' : `${s.averageRating.toFixed(1)} / 5.0`} />
            <StatCard icon="🗳" color="green"  label="Total Responses" value={s.responses} />
            <StatCard icon="📈" color="orange" label="Response Rate"   value={`${s.responseRate}%`} />
            <StatCard icon="🧑‍🎓" color="purple" label="Students Assigned" value={s.assigned} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
            <Score value={s.averageRating} size="lg" />
            <Stars value={Math.round(s.averageRating || 0)} size={20} />
          </div>

          <Grid min={320}>
            <Panel title="Category performance" subtitle="Average rating out of 5 per category">
              <CategoryScores categories={data.categories} />
            </Panel>

            <Panel title="Strengths & improvement areas"
              subtitle="Highest and lowest scoring categories in this campaign">
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <h4 style={{ fontSize: '.8rem', color: 'var(--success)', marginBottom: 6 }}>Strengths</h4>
                  {data.strengths?.length ? (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '.85rem' }}>
                      {data.strengths.map((c) => <li key={c._id}>{c.name} — {c.average.toFixed(1)}</li>)}
                    </ul>
                  ) : <p className="text-sm text-muted">No category is above 4.0 yet.</p>}
                </div>
                <div>
                  <h4 style={{ fontSize: '.8rem', color: 'var(--warning)', marginBottom: 6 }}>Improvement areas</h4>
                  {data.improvements?.length ? (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '.85rem' }}>
                      {data.improvements.map((c) => <li key={c._id}>{c.name} — {c.average.toFixed(1)}</li>)}
                    </ul>
                  ) : <p className="text-sm text-muted">Every category is at 4.0 or above.</p>}
                </div>
              </div>
            </Panel>
          </Grid>

          {!!data.questionBreakdown?.length && (
            <Panel title="Question by question" subtitle="Average rating out of 5 for each question asked">
              <RankBars data={data.questionBreakdown.map((q) => ({ label: q.question, value: q.average }))}
                labelKey="label" valueKey="value" unit="" max={5} />
              <table className="table" style={{ marginTop: 12 }}>
                <thead><tr><th>Question</th><th className="text-right">Average</th><th className="text-right">Answers</th></tr></thead>
                <tbody>
                  {data.questionBreakdown.map((q) => (
                    <tr key={q.question}>
                      <td style={{ fontSize: '.82rem' }}>{q.question}</td>
                      <td className="text-right"><Score value={q.average} size="sm" showLabel={false} /></td>
                      <td className="text-right text-muted">{q.answers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {!!data.options?.length && data.options.map((block) => (
            <Panel key={block.question} title={block.question} subtitle="What students picked most often">
              <ul style={{ display: 'grid', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
                {block.options.map((o) => (
                  <li key={o.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', marginBottom: 3 }}>
                      <span>{o.label}</span>
                      <strong>{o.count} <span className="text-muted">({o.percent}%)</span></strong>
                    </div>
                    <div style={{ background: '#eef2f7', borderRadius: 99, height: 7, overflow: 'hidden' }}>
                      <div style={{ width: `${o.percent}%`, height: '100%', background: 'var(--primary)', borderRadius: 99 }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}

          {data.settings?.canSeeComments && (
            <Panel title="Student comments" subtitle="Shown in random order and never linked to a student">
              {data.comments?.length ? (
                <ul style={{ display: 'grid', gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
                  {data.comments.map((c, i) => (
                    <li key={i} style={{
                      background: 'var(--bg)', borderRadius: 'var(--radius)',
                      padding: '10px 14px', fontSize: '.85rem', borderLeft: '3px solid var(--primary)',
                    }}>
                      {c.text}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">No written comments in this campaign.</p>}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
