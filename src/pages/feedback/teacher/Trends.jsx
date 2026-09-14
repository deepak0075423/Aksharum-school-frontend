/**
 * Teacher → Trends.
 *
 * How the teacher's own rating has moved, campaign by campaign — never against
 * a colleague. One filter at a time (a subject OR a section): the server refuses
 * two, because an intersection combined with the single views is how a small
 * group gets isolated. A withheld campaign says why, with the campaign's REAL
 * floor, not a guess.
 */
import React, { useMemo, useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { Spinner } from '../../../components/ui/index';
import {
  Crumbs, EmptyState, Hero, Muted, NoteBar, PALETTE, Panel, Rating, Row, StatVs, Stats,
  Table, Tag, TrendArea, fmtDate,
} from '../admin/fbUI';
import { Withheld } from '../shared/roleParts';

const TRAIL = [{ to: '/teacher/feedback/dashboard', label: 'My Feedback' }];

export default function TeacherTrends() {
  const [slice, setSlice] = useState('');   // "subject:<id>" | "section:<id>" | ""
  const params = useMemo(() => {
    if (!slice) return {};
    const [dim, id] = slice.split(':');
    return { [dim]: id };
  }, [slice]);

  const { data, loading, error } = useFetch(() => api.getTeacherTrends(params), [slice]);

  if (loading && !data) return <div className="fbpage"><div className="fbloading"><Spinner /></div></div>;

  if (data?.disabled) {
    return (
      <div className="fbpage">
        <Crumbs trail={TRAIL} here="Trends" />
        <Hero icon="trending" title="My Trends" subtitle="How your rating has moved over time." />
        <div className="fbcard">
          <EmptyState icon="🔒" title="Trends are turned off"
            message="Your school shows teachers each campaign’s results but not how they compare over time." />
        </div>
      </div>
    );
  }

  const points = data?.points || [];
  const rated = points.filter((p) => p.rating != null);
  const latest = rated[rated.length - 1];
  const before = rated[rated.length - 2];
  const delta = latest && before ? Number((latest.rating - before.rating).toFixed(1)) : null;
  const best = [...rated].sort((a, b) => b.rating - a.rating)[0];
  const latestRate = latest?.assigned ? Math.round((latest.responses / latest.assigned) * 100) : null;
  const sliceName = slice
    ? [...(data?.filters?.subjects || []), ...(data?.filters?.sections || [])].find((x) => slice.endsWith(x._id))?.name
    : null;

  return (
    <div className="fbpage">
      <Crumbs trail={TRAIL} here="Trends" />

      <Hero icon="trending" tone="purple" title="My Trends"
        subtitle="How your rating has moved from campaign to campaign — compared only with yourself.">
        <select className={`fbsel fbsel--hero${slice ? ' is-on' : ''}`} value={slice} aria-label="Show"
          onChange={(e) => setSlice(e.target.value)}>
          <option value="">Everything I teach</option>
          {!!data?.filters?.subjects?.length && (
            <optgroup label="One subject">
              {data.filters.subjects.map((x) => <option key={x._id} value={`subject:${x._id}`}>{x.name}</option>)}
            </optgroup>
          )}
          {!!data?.filters?.sections?.length && (
            <optgroup label="One section">
              {data.filters.sections.map((x) => <option key={x._id} value={`section:${x._id}`}>{x.name}</option>)}
            </optgroup>
          )}
        </select>
      </Hero>

      {error ? <NoteBar tone="red" icon="alert">{error}</NoteBar> : null}

      {sliceName ? (
        <div className="fbtagrow"><Tag tone="purple">Showing: {sliceName}</Tag></div>
      ) : null}

      {!points.length ? (
        <div className="fbcard">
          <EmptyState icon="📈" title="No history yet"
            message={slice
              ? 'You have no evaluations for this in any campaign you can see.'
              : 'Trends appear once you have been included in a feedback campaign.'} />
        </div>
      ) : (
        <>
          <Stats>
            <StatVs icon="star" tone="purple" label="Latest Rating"
              value={latest ? latest.rating.toFixed(1) : '—'} unit={latest ? '/ 5' : ''}
              delta={delta == null ? null : Math.abs(delta).toFixed(1)}
              deltaDir={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}
              vs={before ? `vs ${before.label}` : latest ? 'first rated campaign' : 'no rated campaign yet'} />
            <StatVs icon="trophy" tone="amber" label="Best Campaign"
              value={best ? best.rating.toFixed(1) : '—'} unit={best ? '/ 5' : ''}
              vs={best ? best.label : ''} delta={null} />
            <StatVs icon="chart" tone="green" label="Campaigns Rated"
              value={`${rated.length} of ${points.length}`} delta={null}
              vs={points.length - rated.length ? `${points.length - rated.length} withheld` : 'none withheld'} />
            <StatVs icon="users" tone="blue" label="Latest Response Rate"
              value={latestRate == null ? '—' : `${latestRate}%`} delta={null}
              vs={latest ? `${latest.responses} of ${latest.assigned} answered` : ''} />
          </Stats>

          <Panel icon="trending" tone="purple" title="Overall Rating" subtitle="Your average out of 5 in each campaign">
            {rated.length > 1
              ? <TrendArea labels domain={[1, 5]} data={rated.map((p) => ({ label: p.label, value: p.rating }))} />
              : <Muted>A trend needs at least two campaigns with results{rated.length === 1 ? ' — you have one so far' : ''}.</Muted>}
          </Panel>

          {(data.categories || []).some((c) => c.points.length > 1) && (
            <>
              <h3 className="fbsubhead">By category</h3>
              <Row split="3">
                {data.categories.filter((c) => c.points.length > 1).map((cat, i) => (
                  <Panel key={cat._id} title={cat.name} subtitle={`${cat.points.length} campaigns`}>
                    <TrendArea labels height={170} domain={[1, 5]}
                      color={PALETTE.series[i % PALETTE.series.length]}
                      data={cat.points.map((p) => ({ label: p.label, value: p.value }))} />
                  </Panel>
                ))}
              </Row>
            </>
          )}

          <div className="fbcard">
            <div className="fbtools">
              <div className="fbtools__title">
                <b>Campaign by campaign</b>
                <small>Newest first — every campaign that included you</small>
              </div>
            </div>
            <Table
              numbered={false}
              rows={[...points].reverse().map((p) => ({ ...p, _id: p.campaignId }))}
              columns={[
                {
                  key: 'name', label: 'Campaign',
                  render: (p) => (
                    <div className="fbstack">
                      <b>{p.name}</b>
                      <small>{[p.label !== p.name ? p.label : '', fmtDate(p.date)].filter(Boolean).join(' · ')}</small>
                    </div>
                  ),
                },
                {
                  key: 'status', label: 'Status',
                  render: (p) => <Tag tone={p.status === 'active' ? 'green' : 'blue'}>{p.status === 'active' ? 'Collecting' : 'Completed'}</Tag>,
                },
                { key: 'resp', label: 'Responses', render: (p) => `${p.responses} / ${p.assigned}` },
                {
                  key: 'rating', label: 'Rating',
                  render: (p) => (p.locked
                    ? <Withheld reason={p.reason} responses={p.responses} minimum={p.minimumResponses} />
                    : <Rating value={p.rating} sub={undefined} />),
                },
              ]}
            />
          </div>
        </>
      )}

      <NoteBar tone="purple" icon="key">
        A campaign is withheld when fewer students answered than its floor, or — when you look at one subject or
        section — when showing it would let a smaller group be worked out from your other results. You can look at
        one subject or one section at a time, never both together, for the same reason.
      </NoteBar>
    </div>
  );
}
