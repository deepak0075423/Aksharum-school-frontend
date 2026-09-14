/**
 * Teacher → My Feedback.
 *
 * What a teacher sees about themselves: combined results only, and only once
 * the campaign's response floor has been reached. The server enforces the floor
 * on every figure — the total, each category, each question — so this page
 * renders whichever shape comes back and explains any gap in plain words rather
 * than leaving a blank where a number was expected.
 */
import React, { useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import {
  Bar, CatBars, Crumbs, EmptyState, Hero, Muted, NoteBar, Panel, Rating, Row,
  Stars, Stat, Stats, Tag, fmtDate, ratingWord,
} from '../admin/fbUI';
import { CampaignSelect, Countdown, LockedResults, Withheld } from '../shared/roleParts';

const TRAIL = [{ to: '/teacher/feedback/dashboard', label: 'My Feedback' }];

export default function TeacherFeedbackDashboard() {
  const [campaignId, setCampaignId] = useState('');
  const { data, loading, error } = useFetch(
    () => api.getTeacherDashboard(campaignId ? { campaignId } : {}),
    [campaignId],
  );

  if (loading) return <div className="fbpage"><div className="fbloading"><Spinner /></div></div>;
  if (error) {
    return (
      <div className="fbpage">
        <Crumbs trail={TRAIL} here="Results" />
        <NoteBar tone="red" icon="alert">{error}</NoteBar>
      </div>
    );
  }

  if (!data?.campaign) {
    return (
      <div className="fbpage">
        <Crumbs trail={TRAIL} here="Results" />
        <Hero icon="star" title="My Feedback" subtitle="What your students said about your teaching — combined and anonymous." />
        <div className="fbcard">
          <EmptyState icon="📋" title="No feedback to show yet"
            message="When your school runs a feedback campaign that includes you, your results appear here once enough students have answered." />
        </div>
      </div>
    );
  }

  const s = data.summary;
  const c = data.campaign;
  const prev = data.previous;
  const delta = s.averageRating != null && prev?.averageRating != null
    ? Number((s.averageRating - prev.averageRating).toFixed(1)) : null;
  const shownCats = (data.categories || []).filter((x) => x.average != null);
  const hiddenCats = (data.categories || []).filter((x) => x.average == null);

  return (
    <div className="fbpage">
      <Crumbs trail={TRAIL} here="Results" />

      <Hero icon="star" tone="purple" title="My Feedback"
        subtitle="What your students said about your teaching — combined and anonymous.">
        <CampaignSelect campaigns={data.campaigns} value={campaignId || c._id} onChange={setCampaignId} />
      </Hero>

      <div className="fbtagrow">
        <Tag tone={c.status === 'active' ? 'green' : 'blue'}>{c.status === 'active' ? 'Collecting' : 'Completed'}</Tag>
        <Tag tone="slate" icon="calendar">{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</Tag>
        {c.status === 'active' ? <Countdown endDate={c.endDate} /> : null}
        {c.isAnonymous ? <Tag tone="purple" icon="key">Anonymous</Tag> : null}
        <Tag tone="slate">Shown from {s.minimumResponses} responses</Tag>
      </div>

      {s.locked ? (
        <LockedResults responses={s.responses} minimum={s.minimumResponses} assigned={s.assigned}
          campaignOpen={c.status === 'active'} />
      ) : (
        <>
          <Stats>
            <Stat icon="star" tone="amber"
              value={s.averageRating == null ? '—' : <>{s.averageRating.toFixed(1)}<em>/ 5</em></>}
              label="Overall Rating" caption={ratingWord(s.averageRating) || 'No scored answers'}
              {...(delta == null ? {} : { delta: Math.abs(delta).toFixed(1), deltaDir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' })} />
            <Stat icon="chat" tone="blue" value={s.responses} label="Responses"
              caption={`from ${s.assigned} student${s.assigned === 1 ? '' : 's'} asked`} />
            <Stat icon="trending" tone="green" value={`${s.responseRate}%`} label="Response Rate"
              caption={s.responseRate >= 60 ? 'A solid sample' : 'A thin sample — read the rating with care'} />
            <Stat icon="layers" tone="purple" value={shownCats.length} label="Categories Rated"
              caption={hiddenCats.length ? `${hiddenCats.length} hidden — too few answers` : 'Every category has enough answers'} />
          </Stats>

          <Row split="2">
            <Panel icon="star" tone="amber" title="Overall"
              subtitle={prev ? `Compared with ${prev.name}` : 'Your first campaign with results'}>
              <div className="fbbigrate">
                <Rating value={s.averageRating} big sub={undefined} />
                <Stars value={Math.round(s.averageRating || 0)} size={24} />
                <Bar value={s.responseRate} width={200} />
                <Muted>
                  {delta == null
                    ? `Based on ${s.responses} responses.`
                    : delta === 0
                      ? `The same as ${prev.name}, on ${s.responses} responses.`
                      : `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta).toFixed(1)} since ${prev.name}, on ${s.responses} responses.`}
                </Muted>
              </div>
            </Panel>

            <Panel icon="layers" tone="purple" title="By Category" subtitle="Your average out of 5 for each theme">
              {shownCats.length
                ? <CatBars colored max={5} labelWidth={170}
                    data={shownCats.map((x) => ({ label: x.name, value: Number(x.average.toFixed(1)) }))} />
                : <Muted>No category has enough answers to show yet.</Muted>}
              {hiddenCats.length > 0 && (
                <p className="fbhiddennote">
                  <Icon name="key" size={12} /> Not shown: {hiddenCats.map((x) => x.name).join(', ')} — answered by fewer
                  than {s.minimumResponses} students.
                </p>
              )}
            </Panel>
          </Row>

          <Row split="2">
            <Panel icon="trophy" tone="green" title="Strengths" subtitle="Categories rated 4.0 and above">
              {data.strengths?.length
                ? <CatBars max={5} labelWidth={170} color="#22c55e"
                    data={data.strengths.map((x) => ({ label: x.name, value: Number(x.average.toFixed(1)) }))} />
                : <Muted>No category has reached 4.0 in this campaign yet.</Muted>}
            </Panel>
            <Panel icon="target" tone="amber" title="Where to Grow" subtitle="Your lowest-rated categories">
              {data.improvements?.length
                ? <CatBars max={5} labelWidth={170} color="#f59e0b"
                    data={data.improvements.map((x) => ({ label: x.name, value: Number(x.average.toFixed(1)) }))} />
                : <Muted>Every category is at 4.0 or above. Well done.</Muted>}
            </Panel>
          </Row>

          {!!data.questionBreakdown?.length && (
            <Panel icon="checkSquare" tone="indigo" title="Question by Question"
              subtitle="Your average for each rated question, in the order students saw them">
              <ol className="fbqlist">
                {data.questionBreakdown.map((q, i) => (
                  <li key={q.question}>
                    <span className="fbqlist__n">{i + 1}</span>
                    <span className="fbqlist__q">
                      <b>{q.question}</b>
                      {q.category ? <small>{q.category}</small> : null}
                    </span>
                    <span className="fbqlist__bar" aria-hidden>
                      <span style={{ width: q.average == null ? 0 : `${(q.average / 5) * 100}%` }} />
                    </span>
                    <span className="fbqlist__v">
                      {q.withheld
                        ? <Withheld reason="floor" responses={q.answers} minimum={s.minimumResponses} />
                        : <Rating value={q.average} sub={`${q.answers} answers`} />}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          {(data.options || []).length > 0 && (
            <Row split="2">
              {data.options.map((block) => (
                <Panel key={block.question} icon="list" tone="teal" title={block.question}
                  subtitle="What students picked, and how often">
                  <ul className="fbtally">
                    {block.options.map((o) => (
                      <li key={o.label}>
                        <span>{o.label}</span>
                        <Bar value={o.percent} width={140} tone="#14b8a6" />
                        <b>{o.count}</b>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ))}
            </Row>
          )}

          <Panel icon="chat" tone="blue" title="What Students Wrote"
            subtitle={data.settings?.canSeeComments ? 'In no particular order, never linked to a student' : 'Written comments'}>
            {!data.settings?.canSeeComments ? (
              <Muted>Your school shows teachers their scores but not written comments.</Muted>
            ) : data.comments?.length ? (
              <ul className="fbquotes">
                {data.comments.map((cm, i) => (
                  // Comments arrive deliberately unattributed — there is no id
                  // to key on, and giving them one would be a way back to a student.
                  // eslint-disable-next-line
                  <li key={i}>{cm.text}</li>
                ))}
              </ul>
            ) : <Muted>No written comments in this campaign.</Muted>}
          </Panel>
        </>
      )}

      <NoteBar tone="purple" icon="key">
        Every figure here is combined across your students and hidden until at least <b>{s.minimumResponses}</b> of
        them have answered — for the total, each category and each question. Nobody in the school can see who said what.
      </NoteBar>
    </div>
  );
}
