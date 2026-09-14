/**
 * Parent → Teacher Feedback.
 *
 * Whether each child has given feedback to their teachers — which campaigns are
 * open, which teachers are still to do, and when the window closes — so a
 * parent can remind them in time. Never what the child said: the endpoint does
 * not read answers at all, and this page has nothing to render one with.
 *
 * One child at a time. A parent with several children picks one from the
 * switch; a parent with one child never sees a switch at all.
 */
import React, { useEffect, useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/parent.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import {
  Avatar, Crumbs, EmptyState, Hero, NoteBar, Stat, Stats, Tag, fmtDate, toneAt,
} from '../admin/fbUI';
import { Countdown, ProgressSplit, StatePill, closesIn } from '../shared/roleParts';

export default function ChildFeedback() {
  const { data, loading, error } = useFetch(() => api.getChildrenFeedback(), []);
  const children = data?.children || [];
  const [childId, setChildId] = useState('');

  // Start on the child with the most still to do — the list comes sorted that way.
  useEffect(() => {
    if (children.length && !children.some((c) => c._id === childId)) setChildId(children[0]._id);
  }, [children, childId]);

  if (loading) return <div className="fbpage fbpage--narrow"><div className="fbloading"><Spinner /></div></div>;

  const child = children.find((c) => c._id === childId) || children[0];

  return (
    <div className="fbpage fbpage--narrow">
      <Crumbs here="Teacher Feedback" />

      <Hero icon="chat" tone="purple" title="Teacher Feedback"
        subtitle="Whether your child has shared feedback with their teachers. You see their progress — never their answers." />

      {error ? <NoteBar tone="red" icon="alert">{error}</NoteBar> : null}

      {!error && !children.length ? (
        <div className="fbcard">
          <EmptyState icon="👪" title="No children linked to your account"
            message="Feedback progress appears here for each child linked to you. If a child is missing, please contact the school office." />
        </div>
      ) : null}

      {children.length > 1 && (
        <nav className="fbkids" role="tablist" aria-label="Child">
          {children.map((c, i) => (
            <button key={c._id} type="button" role="tab" aria-selected={c._id === child?._id}
              className={`fbkid${c._id === child?._id ? ' is-on' : ''}`} onClick={() => setChildId(c._id)}>
              <Avatar name={c.name} src={c.photo} size={38} tone={toneAt(i)} />
              <span><b>{c.name}</b><small>{c.className || 'Class not recorded'}</small></span>
              {c.summary.todo > 0 ? <em title="Still to do">{c.summary.todo}</em> : <Icon name="checkCircle" size={16} />}
            </button>
          ))}
        </nav>
      )}

      {child && (
        <>
          {children.length === 1 && (
            <div className="fbkidline">
              <Avatar name={child.name} src={child.photo} size={42} />
              <span><b>{child.name}</b><small>{child.className || 'Class not recorded'}</small></span>
            </div>
          )}

          <Stats>
            <Stat icon="megaphone" tone="purple" value={child.summary.openCampaigns} label="Open Now"
              caption={child.summary.openCampaigns === 1 ? 'Campaign collecting feedback' : 'Campaigns collecting feedback'} />
            <Stat icon="clipboard" tone="amber" value={child.summary.todo} label="Still To Do"
              caption={child.summary.todo ? 'Teachers waiting for feedback' : 'Nothing waiting'} />
            <Stat icon="checkCircle" tone="green" value={child.summary.done} label="Done"
              caption="Feedback already given" />
            <Stat icon="clock" tone="blue"
              value={child.summary.nextDeadline ? (closesIn(child.summary.nextDeadline).left <= 0 ? 'Today' : `${closesIn(child.summary.nextDeadline).left}d`) : '—'}
              label="Next Deadline"
              caption={child.summary.nextDeadline ? fmtDate(child.summary.nextDeadline) : 'Nothing open'} />
          </Stats>

          {child.summary.todo > 0 && (closesIn(child.summary.nextDeadline).left ?? 9) <= 3 && (
            <NoteBar tone="amber" icon="bell">
              <b>{child.name}</b> has {child.summary.todo} teacher feedback{child.summary.todo === 1 ? '' : 's'} to give,
              and the window {closesIn(child.summary.nextDeadline).text.toLowerCase()}. Once it closes it cannot be done.
            </NoteBar>
          )}

          {!child.campaigns.length ? (
            <div className="fbcard">
              <EmptyState icon="📭" title={`No feedback has been asked of ${child.name} yet`}
                message="When the school opens a teacher feedback campaign for their class, it appears here." />
            </div>
          ) : (
            child.campaigns.map((c) => (
              <section key={c._id} className="fbcamp">
                <header className="fbcamp__head">
                  <span className={`fbcamp__icon tint-${c.phase === 'open' ? 'green' : c.phase === 'upcoming' ? 'blue' : 'slate'}`}>
                    <Icon name="megaphone" size={18} />
                  </span>
                  <div className="fbcamp__title">
                    <b>{c.name}</b>
                    <small>{[c.term, `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}`].filter(Boolean).join(' · ')}</small>
                  </div>
                  <span className="fbcamp__tags">
                    {c.phase === 'open' ? <Countdown endDate={c.endDate} />
                      : c.phase === 'upcoming' ? <Tag tone="blue">Opens {fmtDate(c.startDate)}</Tag>
                      : <Tag tone="slate">Finished</Tag>}
                  </span>
                </header>

                <div className="fbcamp__summary">
                  <b>{c.done} of {c.total}</b> teacher{c.total === 1 ? '' : 's'} given feedback
                  {c.phase === 'finished' && c.missed === 0 ? <em><Icon name="sparkle" size={13} /> all done</em> : null}
                </div>
                <ProgressSplit done={c.done} missed={c.missed} todo={c.todo} upcoming={c.upcoming} />

                <ul className="fbparentlist">
                  {c.items.map((it) => (
                    <li key={it._id}>
                      <span className="fbparentlist__who">
                        <b>{it.subject || 'General'}</b>
                        <small>{it.teacher}</small>
                      </span>
                      <span className="fbparentlist__when">
                        {it.state === 'done' ? `on ${fmtDate(it.submittedAt)}` : ''}
                      </span>
                      <StatePill state={it.state} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      <NoteBar tone="purple" icon="key" title="Answers stay private — even from parents.">
        Children give feedback anonymously so they can be honest. You can see whether each teacher has been given
        feedback, but never what was said. To help, simply remind your child before the closing date.
      </NoteBar>
    </div>
  );
}
