/**
 * Student → re-read what I sent.
 *
 * Read-only and forever: locked feedback stays visible to its own author, it
 * just cannot be changed. This is the only screen anywhere that pairs a student
 * with their answers, and it is theirs alone — the server scopes it to the
 * signed-in student.
 */
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import { RATING_LABELS, EMOJI_SCALE } from '../shared/kit';
import { Avatar, Crumbs, NoteBar, Stars, Tag, fmtDate } from '../admin/fbUI';
import { categoryIcon } from '../admin/feedbackParts';

const TRAIL = [{ to: '/student/feedback', label: 'Teacher Feedback' }];

export default function SubmissionDetail() {
  const { id } = useParams();
  const { data, loading, error } = useFetch(() => api.getMySubmission(id), [id]);

  if (loading) return <div className="fbpage fbpage--narrow"><div className="fbloading"><Spinner /></div></div>;
  if (error) {
    return (
      <div className="fbpage fbpage--narrow">
        <Crumbs trail={TRAIL} here="My feedback" />
        <div className="fbcard">
          <div className="fbempty">
            <span aria-hidden>🔒</span>
            <h3>This feedback cannot be shown</h3>
            <p>{error}</p>
            <Link to="/student/feedback" className="fbtb fbtb--primary">Back to my feedback</Link>
          </div>
        </div>
      </div>
    );
  }

  const a = data.assignment;
  const answered = (data.answers || []).filter(
    (q) => q.ratingValue != null || q.textResponse || q.selectedOptions?.length,
  );
  const groups = new Map();
  for (const q of answered) {
    const k = q.categoryName || (['text', 'multiple_choice', 'checkbox'].includes(q.questionType) ? 'A little more' : 'General');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(q);
  }
  const place = [a.className, a.sectionName].filter(Boolean).join(' ');

  return (
    <div className="fbpage fbpage--narrow">
      <Crumbs trail={TRAIL} here={a.teacher?.name || 'My feedback'} />

      <section className="fbformhead">
        <Avatar name={a.teacher?.name} src={a.teacher?.photo} size={64} />
        <div className="fbformhead__id">
          <small>Your feedback to</small>
          <h1>{a.teacher?.name}</h1>
          <p>{[a.subject, place].filter(Boolean).join(' · ')}</p>
          <div className="fbtagrow">
            <Tag tone="green" icon="checkCircle">Sent {fmtDate(a.submittedAt)}</Tag>
            {data.campaign?.name ? <Tag tone="slate" icon="megaphone">{data.campaign.name}</Tag> : null}
            {data.campaign?.isAnonymous ? <Tag tone="purple" icon="key">Anonymous</Tag> : null}
          </div>
        </div>
        {a.overallRating != null && (
          <div className="fbformhead__score">
            <b>{Number(a.overallRating).toFixed(1)}</b>
            <Stars value={Math.round(a.overallRating)} size={16} />
            <small>your average</small>
          </div>
        )}
      </section>

      {[...groups.entries()].map(([name, qs]) => (
        <section key={name} className="fbqcard">
          <header>
            <span className="fbqcard__icon tint-purple"><Icon name={categoryIcon(name)} size={16} /></span>
            <b>{name}</b>
            <small>{qs.length} answer{qs.length === 1 ? '' : 's'}</small>
          </header>
          {qs.map((q) => (
            <div key={q._id} className="fbanswer">
              <span className="fbanswer__q">{q.questionText}</span>
              {q.ratingValue != null && q.questionType !== 'yes_no' && (
                <span className="fbanswer__rating">
                  <span className="fbanswer__dots" aria-label={`${q.ratingValue} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= q.ratingValue ? 'is-on' : ''} />)}
                  </span>
                  <b>{EMOJI_SCALE[q.ratingValue]} {q.ratingValue} · {RATING_LABELS[q.ratingValue]}</b>
                </span>
              )}
              {q.questionType === 'yes_no' && (
                <Tag tone={q.textResponse === 'yes' ? 'green' : 'slate'}>{q.textResponse === 'yes' ? 'Yes' : 'No'}</Tag>
              )}
              {!!q.selectedOptions?.length && (
                <span className="fbanswer__opts">
                  {q.selectedOptions.map((o) => <Tag key={o} tone="indigo">{o}</Tag>)}
                </span>
              )}
              {q.textResponse && q.questionType !== 'yes_no' && (
                <blockquote className="fbanswer__text">
                  {q.questionType !== 'text' ? <small>Other: </small> : null}{q.textResponse}
                </blockquote>
              )}
            </div>
          ))}
        </section>
      ))}

      <NoteBar tone="purple" icon="key" title="Only you can see this page.">
        Your feedback is locked and cannot be edited. Your teacher sees your answers only as part of results combined
        across many students, never on their own.
      </NoteBar>

      <div className="fbformbar fbformbar--static">
        <Link to="/student/feedback" className="fbtb"><Icon name="chevronLeft" size={14} /> Back to my feedback</Link>
      </div>
    </div>
  );
}
