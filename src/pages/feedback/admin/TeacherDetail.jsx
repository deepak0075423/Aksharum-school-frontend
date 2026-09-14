/**
 * One teacher's feedback, in full — for an admin or a principal.
 *
 * Everything here obeys the same privacy floor as the teacher's own dashboard.
 * An administrator reading a comment still cannot tell who wrote it: comments
 * arrive unordered and unattributed, and below the floor the page shows nothing
 * at all rather than a rounded number that would let a small section be worked
 * out.
 */
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import {
  Bar, CatBars, Crumbs, EmptyState, Hero, Muted, NoteBar, PALETTE, Panel,
  Rating, Row, Stars, Stat, Stats, TrendArea, ratingWord,
} from './fbUI';
import { homeFor, useFeedbackBase } from './feedbackParts';

export default function TeacherDetail() {
  const { id } = useParams();
  const base = useFeedbackBase();
  const navigate = useNavigate();
  const [campaignId, setCampaignId] = useState('');

  const { data, loading, error } = useFetch(
    () => api.getTeacherAnalytics(id, campaignId ? { campaignId } : {}),
    [id, campaignId],
  );

  const trail = [
    { to: `${base}/overview`, label: 'Teacher Feedback' },
    { to: `${base}/insights`, label: 'Teacher Performance' },
  ];

  if (loading) return <div className="fbpage"><div className="fbloading"><Spinner /></div></div>;
  if (error) {
    return (
      <div className="fbpage">
        <Crumbs here="Teacher" trail={trail} home={homeFor(base)} />
        <NoteBar tone="red" icon="alert">{error}</NoteBar>
      </div>
    );
  }

  const s = data.summary;
  const t = data.teacher;
  const p = data.profile || {};
  const trend = (data.trend || []).filter((x) => x.rating != null);

  return (
    <div className="fbpage">
      <Crumbs here={t.name} trail={trail} home={homeFor(base)} />

      <Hero icon="teacher" tone="purple" title={t.name}
        subtitle={[p.designation || 'Teacher', p.department, p.employeeId, t.email]
          .filter(Boolean).join(' · ')}>
        <button type="button" className="fbtb" onClick={() => navigate(`${base}/insights`)}>
          <Icon name="chevronLeft" size={14} /> All teachers
        </button>
        {!!data.campaigns?.length && (
          <select className="fbsel" value={campaignId || data.campaign?._id || ''} aria-label="Campaign"
            style={{ minWidth: 200 }} onChange={(e) => setCampaignId(e.target.value)}>
            {data.campaigns.map((c) => (
              <option key={c._id} value={c._id}>{c.name}{c.term ? ` · ${c.term}` : ''}</option>
            ))}
          </select>
        )}
      </Hero>

      {!s ? (
        <div className="fbcard">
          <EmptyState icon="📣" title="No campaign has covered this teacher yet"
            message="Their results appear here once a feedback campaign has included them and students have answered." />
        </div>
      ) : s.locked ? (
        <>
          <Stats>
            <Stat icon="chat" tone="blue" value={s.responses} label="Responses So Far"
              caption={`${s.minimumResponses} needed before anything is shown`} />
            <Stat icon="student" tone="purple" value={s.assigned} label="Students Asked"
              caption="In this campaign" />
            <Stat icon="trending" tone="green" value={`${s.responseRate}%`} label="Response Rate"
              caption={s.responses < s.minimumResponses
                ? `${s.minimumResponses - s.responses} more to unlock`
                : ''} />
            <Stat icon="key" tone="pink" value={s.minimumResponses} label="Privacy Floor"
              caption="Set on the campaign" />
          </Stats>

          <div className="fbcard">
            <EmptyState icon="🔒" title="Results are withheld"
              message={s.responses === 0
                ? 'Nobody has answered about this teacher yet. Nothing is hidden — there is nothing there.'
                : `${s.responses} of ${s.minimumResponses} responses. An average built from so few students would let any one of them be worked out, so no figure, no category and no comment is shown until the floor is reached. This applies to the teacher, the principal and the admin alike.`} />
          </div>

          <NoteBar tone="purple" icon="key">
            The floor is set per campaign. Raising it protects students in small sections; lowering it can
            make a single student&rsquo;s answer identifiable.
          </NoteBar>
        </>
      ) : (
        <>
          <Stats>
            <Stat icon="star" tone="amber"
              value={s.averageRating == null ? '—' : <>{s.averageRating.toFixed(1)}<em>/ 5</em></>}
              label="Average Rating" caption={ratingWord(s.averageRating)} />
            <Stat icon="chat" tone="blue" value={s.responses} label="Responses"
              caption={`of ${s.assigned} students asked`} />
            <Stat icon="trending" tone="green" value={`${s.responseRate}%`} label="Response Rate"
              caption={s.responseRate >= 60 ? 'A solid sample' : 'A thin sample — read the rating carefully'} />
            <Stat icon="layers" tone="purple" value={data.categories?.length || 0} label="Categories Scored"
              caption="Themes this campaign asked about" />
          </Stats>

          <Row split="2">
            <Panel icon="star" tone="amber" title="Overall"
              subtitle={`Across ${s.responses} response${s.responses === 1 ? '' : 's'}`}>
              <div className="fbbigrate">
                <Rating value={s.averageRating} big sub={undefined} />
                <Stars value={Math.round(s.averageRating || 0)} size={22} />
                <Bar value={s.responseRate} width={180} />
                <Muted>
                  Read this beside the response rate. A rating is a conversation starter about one
                  campaign, not a verdict on a teacher.
                </Muted>
              </div>
            </Panel>

            <Panel icon="trending" tone="purple" title="Rating Trend"
              subtitle="This teacher's own average, campaign by campaign">
              {trend.length > 1
                ? <TrendArea labels domain={[1, 5]}
                    data={trend.map((x) => ({ label: x.label, value: x.rating }))} />
                : (
                  <Muted>
                    A trend compares this teacher against themselves, never against a colleague — and needs
                    at least two campaigns where they cleared the response floor. So far there
                    {trend.length === 1 ? ' is one.' : ' are none.'}
                  </Muted>
                )}
            </Panel>
          </Row>

          <Panel icon="layers" tone="indigo" title="Category Performance"
            subtitle="Average out of 5 for each theme the campaign asked about">
            {data.categories?.length
              ? (
                <CatBars colored max={5} labelWidth={190}
                  data={data.categories.map((c) => ({
                    label: c.name, value: c.average == null ? null : Number(c.average.toFixed(1)),
                  }))} />
              )
              : <Muted>No scored answers in this campaign.</Muted>}
          </Panel>

          <Row split="2">
            <Panel icon="trophy" tone="green" title="Strengths" subtitle="Categories at 4.0 and above">
              {data.strengths?.length
                ? (
                  <CatBars max={5} labelWidth={170} color="#22c55e"
                    data={data.strengths.map((c) => ({ label: c.name, value: Number(c.average.toFixed(1)) }))} />
                )
                : <Muted>No category reached 4.0 in this campaign.</Muted>}
            </Panel>
            <Panel icon="target" tone="amber" title="Improvement Areas"
              subtitle="The lowest-scoring categories">
              {data.improvements?.length
                ? (
                  <CatBars max={5} labelWidth={170} color="#f59e0b"
                    data={data.improvements.map((c) => ({ label: c.name, value: Number(c.average.toFixed(1)) }))} />
                )
                : <Muted>Every category is at 4.0 or above.</Muted>}
            </Panel>
          </Row>

          {(data.options || []).map((block) => (
            <Panel key={block.question} icon="list" tone="teal" title={block.question}
              subtitle="What students picked, and how often">
              <ul className="fbtally">
                {block.options.map((o) => (
                  <li key={o.label}>
                    <span>{o.label}</span>
                    <Bar value={o.percent} tone={PALETTE.accent} width={180} />
                    <b>{o.count}</b>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}

          <Panel icon="chat" tone="blue" title="Student Comments"
            subtitle="Anonymous, unordered and never linked back to anybody">
            {data.comments?.length ? (
              <ul className="fbquotes">
                {data.comments.map((c, i) => (
                  // Comments arrive deliberately unattributed — there is no id
                  // to key on, and giving them one would be a way back to a student.
                  // eslint-disable-next-line
                  <li key={i}>{c.text}</li>
                ))}
              </ul>
            ) : <Muted>No written comments in this campaign.</Muted>}
          </Panel>

          <NoteBar tone="purple" icon="key">
            These figures are shown because <b>{s.responses}</b> students answered, which clears this
            campaign&rsquo;s floor of <b>{s.minimumResponses}</b>. The comments above arrive in no particular
            order and carry nothing that identifies who wrote them — no admin screen anywhere joins a
            student to the content of their feedback.
          </NoteBar>
        </>
      )}
    </div>
  );
}

