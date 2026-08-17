import React, { useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Card, Spinner, Alert, Empty } from '../../../components/ui/index';
import { Panel, TrendLine, Grid } from '../../analytics/viz';
import { Score, LockedNotice } from '../shared/kit';

// Rating over successive campaigns (spec §15). One series, 0–5 scale, so the
// shared TrendLine is used unchanged — no second axis, no per-point labels.
export default function TeacherTrends() {
  const [filters, setFilters] = useState({ subject: '', section: '' });
  const { data, loading, error } = useFetch(
    () => api.getTeacherTrends(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))),
    [filters.subject, filters.section],
  );

  if (loading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;
  if (error)   return <div className="page"><Alert variant="danger">{error}</Alert></div>;

  if (data?.disabled) {
    return (
      <div className="page">
        <PageHeader title="Feedback Trends" />
        <Empty icon="🔒" title="Trends are turned off"
          message="Your school has disabled historical feedback trends for teachers." />
      </div>
    );
  }

  const points  = (data?.points || []).filter((p) => p.rating != null);
  const withheld = (data?.points || []).filter((p) => p.locked);

  return (
    <div className="page">
      <PageHeader
        title="Feedback Trends"
        subtitle="How your ratings have moved across campaigns"
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="form-control" style={{ maxWidth: 180 }} value={filters.subject}
              onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))}>
              <option value="">All subjects</option>
              {(data?.filters?.subjects || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: 180 }} value={filters.section}
              onChange={(e) => setFilters((f) => ({ ...f, section: e.target.value }))}>
              <option value="">All sections</option>
              {(data?.filters?.sections || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
        }
      />

      {!points.length ? (
        <Card>
          <Empty icon="📈" title="Not enough history yet"
            message="Trends appear once you have results from at least one completed campaign." />
        </Card>
      ) : (
        <>
          <Panel title="Overall rating by campaign" subtitle="Average rating out of 5">
            <TrendLine data={points.map((p) => ({ label: p.label, rating: p.rating }))}
              xKey="label" yKey="rating" unit="" name="Rating" domain={[0, 5]} />
            <table className="table" style={{ marginTop: 12 }}>
              <thead><tr><th>Campaign</th><th className="text-right">Rating</th><th className="text-right">Responses</th></tr></thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.campaignId}>
                    <td>{p.name}<div className="text-xs text-muted">{p.label}</div></td>
                    <td className="text-right"><Score value={p.rating} size="sm" showLabel={false} /></td>
                    <td className="text-right text-muted">{p.responses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {!!data.categories?.length && (
            <Grid min={320}>
              {data.categories.map((cat) => (
                <Panel key={cat._id} title={cat.name} subtitle="Average rating out of 5">
                  <TrendLine data={cat.points.map((p) => ({ label: p.label, rating: p.value }))}
                    xKey="label" yKey="rating" unit="" name={cat.name} domain={[0, 5]} height={170} />
                </Panel>
              ))}
            </Grid>
          )}
        </>
      )}

      {!!withheld.length && (
        <Card>
          <LockedNotice
            responses={withheld[0].responses}
            minimum={withheld[0].responses + 1}
            compact
          />
          <p className="text-xs text-muted" style={{ marginTop: 6 }}>
            {withheld.length} campaign{withheld.length === 1 ? '' : 's'} not shown — they have too few responses to display anonymously.
          </p>
        </Card>
      )}
    </div>
  );
}
