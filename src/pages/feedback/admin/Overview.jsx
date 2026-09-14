/**
 * Teacher Feedback → Dashboard.
 *
 * Five figures, three pictures, two lists — the mockup's shape, and the order
 * matters: how much came in, how it moved, what it says by theme and by band,
 * then the campaigns that produced it and the teachers it was about.
 *
 * The tiles are about the campaign named in the picker, not the school's whole
 * history, because the delta beside each one has to compare against something:
 * it is this campaign against the one before it. Total Campaigns is the one
 * exception and carries no delta — a count of drives has nothing to be up on.
 *
 * Shared by the school admin (/admin/feedback) and a principal
 * (/teacher/feedback-review); the server decides what either may see and `base`
 * only moves where the links point.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import {
  Blank, CatBars, Crumbs, Donut, EmptyState, Hero, Menu, MenuItem, Muted, Panel,
  PanelLink, Rating, Row, Stat, Stats, Stack, Table, TrendArea, Who, fmtDate,
} from './fbUI';
import { CampaignPill, useFeedbackBase } from './feedbackParts';

const TREND_RANGES = [
  { value: '6', label: 'Last 6' },
  { value: '4', label: 'Last 4' },
  { value: 'all', label: 'All' },
];

const BANDS = [
  { band: 5, label: '5 Stars', color: '#22c55e' },
  { band: 4, label: '4 Stars', color: '#4ade80' },
  { band: 3, label: '3 Stars', color: '#facc15' },
  { band: 2, label: '2 Stars', color: '#fb923c' },
  { band: 1, label: '1 Star',  color: '#ef4444' },
];

/** "↑ 0.3" / "↓ 4%" — null when there is nothing honest to compare against. */
const delta = (now, then, { pct = false, digits = 1 } = {}) => {
  if (now == null || then == null) return null;
  const d = now - then;
  if (Math.abs(d) < (pct ? 0.5 : 0.05)) return { text: '0', dir: 'flat' };
  return {
    text: pct ? `${Math.abs(Math.round(d))}%` : Math.abs(d).toFixed(digits),
    dir: d > 0 ? 'up' : 'down',
  };
};

export default function FeedbackDashboard() {
  const base = useFeedbackBase();
  const [campaignId, setCampaignId] = useState('');
  const [range, setRange] = useState('6');

  const { data, loading, error } = useFetch(
    () => api.getDashboard(campaignId ? { campaignId } : {}),
    [campaignId],
  );

  const teachers = useMemo(() => data?.teachers || [], [data]);
  const focus = data?.campaign || null;
  const min = focus?.minimumResponses || 5;

  // The campaign this page is about, and the one before it — the whole basis of
  // every delta on the row. `campaigns` arrives newest-first.
  const [now, prev] = useMemo(() => {
    const list = data?.campaigns || [];
    const i = list.findIndex((c) => c._id === focus?._id);
    return i < 0 ? [null, null] : [list[i], list[i + 1] || null];
  }, [data, focus]);

  const rated = useMemo(
    () => teachers.filter((t) => t.rating != null).sort((a, b) => b.rating - a.rating),
    [teachers],
  );

  const trendPoints = useMemo(() => {
    const all = data?.trend || [];
    return range === 'all' ? all : all.slice(-Number(range));
  }, [data, range]);

  const bands = useMemo(() => {
    const d = data?.ratingDistribution || {};
    return BANDS.map((b) => ({ label: b.label, value: d[b.band] || 0, color: b.color }));
  }, [data]);

  if (loading) return <div className="fbpage"><div className="fbloading"><Spinner /></div></div>;
  if (error) {
    return (
      <div className="fbpage">
        <Crumbs here="Dashboard" trail={[{ to: `${base}/overview`, label: 'Teacher Feedback' }]} home={homeFor(base)} />
        <div className="fbnote fbnote--red"><span className="fbnote__icon"><Icon name="alert" size={17} /></span><p>{error}</p></div>
      </div>
    );
  }

  const canManage = !!data.access?.canManage;

  if (!data.campaigns?.length) {
    return (
      <div className="fbpage">
        <Crumbs here="Dashboard" trail={[{ to: `${base}/overview`, label: 'Teacher Feedback' }]} home={homeFor(base)} />
        <Hero icon="chat" title="Teacher Feedback"
          subtitle="Understand, appreciate and support our teachers through constructive feedback." />
        <div className="fbcard">
          <EmptyState icon="📣" title="No feedback campaign has run yet"
            message={canManage
              ? 'A campaign is one evaluation drive — a set of questions, a window of dates, and the classes it goes to. Create one and this page fills in as students respond.'
              : 'Nothing has been collected yet. Results appear here once the school runs a campaign.'}
            action={canManage
              ? <Link to={`${base}/campaigns`} className="fbtb fbtb--primary"><Icon name="plus" size={15} /> Create Campaign</Link>
              : null} />
        </div>
      </div>
    );
  }

  const campaignCols = [
    {
      key: 'title', label: 'Title',
      render: (r) => (
        <Stack main={r.name} sub={r.term || 'General feedback'}
          to={canManage ? `${base}/campaigns/${r._id}` : undefined} />
      ),
    },
    { key: 'status', label: 'Status', render: (r) => <CampaignPill status={r.status} /> },
    { key: 'responses', label: 'Responses', render: (r) => r.submitted },
    { key: 'rating', label: 'Avg. Rating', render: (r) => <Rating value={r.avgRating} sub={undefined} /> },
    { key: 'created', label: 'Created On', render: (r) => <span className="fbdate">{fmtDate(r.startDate)}</span> },
    {
      key: 'a', className: 'fbtable__acts', label: 'Actions',
      render: (r) => (
        <Menu bare>
          {canManage && <MenuItem icon="eye" to={`${base}/campaigns/${r._id}`}>Open campaign</MenuItem>}
          <MenuItem icon="chart" onClick={() => setCampaignId(r._id)}>Show on this dashboard</MenuItem>
          <MenuItem icon="users" to={`${base}/insights`}>Teacher results</MenuItem>
        </Menu>
      ),
    },
  ];

  return (
    <div className="fbpage">
      <Crumbs here="Dashboard" trail={[{ to: `${base}/overview`, label: 'Teacher Feedback' }]} home={homeFor(base)} />

      <Hero icon="chat" tone="purple"
        title={data.access?.isPrincipal ? 'School Feedback Overview' : 'Feedback Dashboard'}
        subtitle="Campaign performance and teacher evaluation across the school.">
        <select className="fbsel" value={campaignId || focus?._id || ''} aria-label="Campaign"
          style={{ minWidth: 210 }} onChange={(e) => setCampaignId(e.target.value)}>
          {data.campaigns.map((c) => (
            <option key={c._id} value={c._id}>{c.name}{c.term ? ` · ${c.term}` : ''}</option>
          ))}
        </select>
        {canManage && (
          <Link to={`${base}/campaigns`} className="fbtb fbtb--primary">
            <Icon name="plus" size={15} /> Create Campaign
          </Link>
        )}
      </Hero>

      <Stats cols="5">
        <Stat icon="megaphone" tone="purple" value={data.cards.totalCampaigns} label="Total Campaigns"
          caption={`${data.cards.activeCampaigns} active campaign${data.cards.activeCampaigns === 1 ? '' : 's'}`} />

        <Stat icon="users" tone="green" value={data.cards.teachersEvaluated} label="Teachers Evaluated"
          caption={`out of ${teachers.length} teachers`} />

        <Stat icon="chat" tone="blue" value={now?.submitted ?? 0} label="Total Responses"
          caption={teachers.length
            ? `Average ${Math.round((now?.submitted || 0) / teachers.length)} per teacher`
            : 'Nothing collected yet'}
          {...pill(delta(now?.submitted, prev?.submitted, { pct: false, digits: 0 }))} />

        <Stat icon="star" tone="amber"
          value={now?.avgRating == null ? '—' : <>{now.avgRating.toFixed(1)}<em>/ 5</em></>}
          label="Overall Rating"
          caption={now?.avgRating == null ? 'Nothing scored yet' : `Based on ${now.submitted} responses`}
          {...pill(delta(now?.avgRating, prev?.avgRating))} />

        <Stat icon="trending" tone="pink" value={`${now?.responseRate ?? 0}%`} label="Response Rate"
          caption={`${now?.submitted ?? 0} of ${now?.assigned ?? 0} students asked`}
          {...pill(delta(now?.responseRate, prev?.responseRate, { pct: true }))} />
      </Stats>

      <Row split="3">
        <Panel icon="trending" tone="purple" title="Rating Trend"
          subtitle="Average rating across all campaigns"
          right={(
            <select className="fbsel" value={range} aria-label="Trend range"
              onChange={(e) => setRange(e.target.value)}>
              {TREND_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          )}>
          {trendPoints.length > 1
            ? <TrendArea data={trendPoints} xKey="label" yKey="rating" domain={[1, 5]} />
            : <Muted>
                A trend needs at least two campaigns with responses — there
                {trendPoints.length === 1 ? ' is one' : ' are none'} so far.
              </Muted>}
        </Panel>

        <Panel icon="layers" tone="blue" title="Category Performance"
          subtitle="Average rating per feedback category"
          right={<PanelLink to={`${base}/insights`} />}>
          {data.categories?.some((c) => c.average != null)
            ? (
              <CatBars colored max={5} labelWidth={158}
                data={data.categories.filter((c) => c.average != null)
                  .map((c) => ({ label: c.name, value: Number(c.average.toFixed(1)) }))} />
            )
            : <Muted>No scored answers in this campaign yet.</Muted>}
        </Panel>

        <Panel icon="chart" tone="pink" title="Response Distribution"
          subtitle="Distribution of feedback ratings">
          <Donut data={bands} centerLabel="Responses" />
        </Panel>
      </Row>

      <Row split="wide">
        <Panel icon="megaphone" tone="indigo" title="Recent Campaigns"
          subtitle="Every drive the school has run"
          right={canManage ? <PanelLink to={`${base}/campaigns`} /> : null}
          className="fbpanel--flush">
          <Table columns={campaignCols} rows={data.campaigns.slice(0, 5)} numbered={false}
            empty={<Blank>No campaigns yet.</Blank>} />
        </Panel>

        <Panel icon="trophy" tone="amber" title="Top Rated Teachers"
          subtitle={`Teachers past the ${min}-response floor`}
          right={<PanelLink to={`${base}/insights`} />}>
          {rated.length ? (
            <ol className="fbrank">
              {rated.slice(0, 5).map((t, i) => (
                <li key={t._id}>
                  <span className={`fbrank__n is-${i < 3 ? i + 1 : 'n'}`}>{i + 1}</span>
                  <span className="fbrank__who">
                    <Who name={t.name} to={`${base}/teachers/${t._id}`} size={34}
                      tone={['purple', 'blue', 'green', 'amber', 'pink'][i % 5]}
                      sub={t.subjects?.[0] || t.department || 'Teacher'} />
                  </span>
                  <span className="fbrank__end">
                    <Rating value={t.rating} sub={undefined} />
                    <small>{t.responses} response{t.responses === 1 ? '' : 's'}</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Muted>
              No teacher has reached {min} responses yet, so no rating can be shown. That is the privacy
              floor doing its job, not a gap in the data.
            </Muted>
          )}
        </Panel>
      </Row>

    </div>
  );
}

const homeFor = (base) => (base === '/admin/feedback' ? '/admin/dashboard' : '/teacher/dashboard');

/** Spreads a delta onto a <Stat>, or nothing at all when there is no comparison. */
const pill = (d) => (d ? { delta: d.text, deltaDir: d.dir } : {});
