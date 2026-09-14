/**
 * Student → Teacher Feedback.
 *
 * What is still owed, what has been given, and what was missed — grouped by
 * campaign, because "3 of 8 done, closes in 4 days" is the sentence a student
 * acts on, and a flat grid of teacher cards never says it. Cards rather than a
 * table: this is the feedback screen most students will ever open, and most of
 * them open it on a phone.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import {
  Avatar, Crumbs, EmptyState, Hero, NoteBar, Segmented, Stat, Stats, Tag, fmtDate, toneAt,
} from '../admin/fbUI';
import { Countdown, ProgressSplit, closesIn } from '../shared/roleParts';

const TABS = [
  { value: 'todo',   label: 'To do' },
  { value: 'done',   label: 'Done' },
  { value: 'missed', label: 'Missed' },
];

export default function MyFeedback() {
  const [tab, setTab] = useState('todo');
  const pending   = useFetch(() => api.getPendingFeedback(), []);
  const completed = useFetch(() => api.getCompletedFeedback(), []);
  const missed    = useFetch(() => api.getMissedFeedback(), []);

  const todo = useMemo(() => pending.data || [], [pending.data]);
  const done = useMemo(() => completed.data || [], [completed.data]);
  const lost = useMemo(() => missed.data || [], [missed.data]);

  // One entry per campaign, carrying every card of the student's in it — so a
  // campaign's progress bar counts all three states, whichever tab is showing.
  const campaigns = useMemo(() => {
    const m = new Map();
    const add = (row, state) => {
      const c = row.campaign || {};
      const key = c._id || 'none';
      if (!m.has(key)) m.set(key, { ...c, _id: key, deadline: row.deadline, rows: [] });
      m.get(key).rows.push({ ...row, state });
    };
    todo.forEach((r) => add(r, 'todo'));
    done.forEach((r) => add(r, 'done'));
    lost.forEach((r) => add(r, 'missed'));
    return [...m.values()].map((c) => ({
      ...c,
      todo: c.rows.filter((r) => r.state === 'todo').length,
      done: c.rows.filter((r) => r.state === 'done').length,
      missed: c.rows.filter((r) => r.state === 'missed').length,
    }));
  }, [todo, done, lost]);

  const loading = pending.loading || completed.loading || missed.loading;
  const error = pending.error || completed.error || missed.error;

  const soonest = todo.map((r) => r.deadline).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0];
  const soon = closesIn(soonest);

  const visible = campaigns
    .filter((c) => c[tab] > 0)
    .sort((a, b) => (tab === 'todo'
      ? new Date(a.deadline || 0) - new Date(b.deadline || 0)
      : new Date(b.deadline || 0) - new Date(a.deadline || 0)));

  if (loading && !pending.data) return <div className="fbpage fbpage--narrow"><div className="fbloading"><Spinner /></div></div>;

  return (
    <div className="fbpage fbpage--narrow">
      <Crumbs here="Teacher Feedback" />

      <Hero icon="chat" tone="purple" title="Teacher Feedback"
        subtitle="Tell your teachers what is working and what could be better. Your answers are anonymous." />

      {error ? <NoteBar tone="red" icon="alert">{error}</NoteBar> : null}

      <Stats>
        <Stat icon="clipboard" tone="amber" value={todo.length} label="To Do"
          caption={todo.length ? 'Teachers waiting for your feedback' : 'Nothing waiting'}
          onClick={() => setTab('todo')} on={tab === 'todo' && todo.length > 0} />
        <Stat icon="checkCircle" tone="green" value={done.length} label="Done"
          caption="Thank you for sharing" onClick={() => setTab('done')} on={tab === 'done'} />
        <Stat icon="clock" tone="blue" value={soonest ? (soon.left <= 0 ? 'Today' : `${soon.left}d`) : '—'}
          label="Next Deadline" caption={soonest ? fmtDate(soonest) : 'No open feedback'} />
        <Stat icon="alert" tone="pink" value={lost.length} label="Missed"
          caption="Closed before you answered" onClick={() => setTab('missed')} on={tab === 'missed'} />
      </Stats>

      {tab === 'todo' && todo.some((r) => (closesIn(r.deadline).left ?? 9) <= 2) && (
        <NoteBar tone="amber" icon="bell">
          Some feedback closes within two days — once a campaign closes, it cannot be answered any more.
        </NoteBar>
      )}

      <div className="fbtabsrow">
        <Segmented value={tab} onChange={setTab}
          options={TABS.map((t) => ({
            value: t.value,
            label: `${t.label} (${t.value === 'todo' ? todo.length : t.value === 'done' ? done.length : lost.length})`,
          }))} />
      </div>

      {!visible.length ? (
        <div className="fbcard">
          {tab === 'todo' ? (
            <EmptyState icon="🎉" title="You are all caught up"
              message="There is no teacher feedback waiting for you. When your school opens a new campaign, it will appear here." />
          ) : tab === 'done' ? (
            <EmptyState icon="📝" title="Nothing submitted yet"
              message="Feedback you give appears here, and you can re-read it any time." />
          ) : (
            <EmptyState icon="✅" title="Nothing missed"
              message="You have answered every campaign before it closed." />
          )}
        </div>
      ) : (
        visible.map((c) => (
          <section key={c._id} className="fbcamp" data-focus-id={c._id}>
            <header className="fbcamp__head">
              <span className="fbcamp__icon tint-purple"><Icon name="megaphone" size={18} /></span>
              <div className="fbcamp__title">
                <b>{c.name || 'Feedback'}</b>
                <small>{[c.term, c.deadline ? `Closes ${fmtDate(c.deadline)}` : ''].filter(Boolean).join(' · ')}</small>
              </div>
              <span className="fbcamp__tags">
                {c.isAnonymous ? <Tag tone="purple" icon="key">Anonymous</Tag> : null}
                {tab === 'todo' ? <Countdown endDate={c.deadline} /> : null}
              </span>
            </header>
            <ProgressSplit done={c.done} missed={c.missed} todo={c.todo} />

            <div className="fbteachers">
              {c.rows.filter((r) => r.state === tab).map((r, i) => (
                <TeacherCard key={r._id} row={r} index={i} />
              ))}
            </div>
          </section>
        ))
      )}

      <NoteBar tone="purple" icon="key" title="Your answers are anonymous.">
        Teachers only ever see results combined across many students, and only once enough have answered. Nobody
        can see which answers are yours.
      </NoteBar>
    </div>
  );
}

function TeacherCard({ row, index }) {
  const place = [row.className, row.sectionName].filter(Boolean).join(' ');
  return (
    // A campaign notification names the campaign, not this assignment, so the
    // card answers to both — see hooks/useFocusHighlight.js.
    <article className={`fbtc fbtc--${row.state}`} data-focus-id={[row._id, row.campaign?._id].filter(Boolean).join(' ')}>
      <Avatar name={row.teacher?.name} src={row.teacher?.photo} size={46} tone={toneAt(index)} />
      <div className="fbtc__body">
        <b>{row.teacher?.name}</b>
        <small>{[row.subject || 'General', place].filter(Boolean).join(' · ')}</small>
        {row.state === 'done' && (
          <span className="fbtc__meta">
            <Icon name="checkCircle" size={13} /> Sent {fmtDate(row.submittedAt)}
            {row.overallRating != null ? <em>· you gave ★ {Number(row.overallRating).toFixed(1)}</em> : null}
          </span>
        )}
        {row.state === 'missed' && <span className="fbtc__meta is-missed">Closed before it was answered</span>}
      </div>
      {row.state === 'todo' && (
        <Link to={`/student/feedback/${row._id}`} className="fbtb fbtb--primary">
          Start <Icon name="arrowRight" size={14} />
        </Link>
      )}
      {row.state === 'done' && (
        <Link to={`/student/feedback/${row._id}/view`} className="fbtb">
          <Icon name="eye" size={14} /> View
        </Link>
      )}
    </article>
  );
}
