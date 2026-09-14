/**
 * Student → give feedback to one teacher.
 *
 * Nothing about the questionnaire is hardcoded: ratings (and yes/no) come first,
 * grouped by the category the campaign snapshot names; choice and written
 * questions come second. Adding a question in the admin bank changes this screen
 * with no code change.
 *
 * Two things a phone needs that the old form did not do: answers are kept as
 * they are given (a locked screen or a dropped connection used to throw them
 * away), and submitting one teacher offers the next one straight away instead
 * of dropping the student back at the list.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import { OptionChips, RATING_LABELS, RatingInput } from '../shared/kit';
import { Avatar, Crumbs, FbModal, NoteBar, Tag } from '../admin/fbUI';
import { Countdown } from '../shared/roleParts';
import { categoryIcon } from '../admin/feedbackParts';

const RATING_TYPES = ['rating_5', 'emoji_5'];
const STEP1_TYPES  = [...RATING_TYPES, 'yes_no'];
const TRAIL = [{ to: '/student/feedback', label: 'Teacher Feedback' }];

// Drafts live in this browser only. Wrapped, because storage can be blocked or
// full, and a feedback form must never fail because a convenience did.
const draftKey = (id) => `fb:draft:${id}`;
const readDraft = (id) => {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); } catch { return null; }
};
const writeDraft = (id, answers) => {
  try { localStorage.setItem(draftKey(id), JSON.stringify({ answers, at: Date.now() })); } catch { /* ignore */ }
};
const clearDraft = (id) => { try { localStorage.removeItem(draftKey(id)); } catch { /* ignore */ } };

const isAnswered = (q, a = {}) => {
  if (RATING_TYPES.includes(q.questionType)) return a.ratingValue != null;
  if (q.questionType === 'yes_no') return !!a.textResponse;
  if (q.questionType === 'text') return !!String(a.textResponse || '').trim();
  return (a.optionIds || []).length > 0;
};

export default function FeedbackForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(() => api.getFeedbackForm(id), [id]);

  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);
  const [sent, setSent] = useState(null);   // { next } once submitted

  // Bring back anything started earlier, once the questions are known — a
  // draft answering a question the campaign no longer has is simply dropped.
  useEffect(() => {
    if (!data?.questions) return;
    setStep(1); setErrors({}); setSent(null); setConfirm(false);
    const draft = readDraft(id);
    if (!draft?.answers) { setAnswers({}); setRestored(false); return; }
    const ids = new Set(data.questions.map((q) => q._id));
    const kept = Object.fromEntries(Object.entries(draft.answers).filter(([k]) => ids.has(k)));
    setAnswers(kept);
    setRestored(Object.keys(kept).length > 0);
  }, [data, id]);

  useEffect(() => {
    if (!data?.questions || sent) return;
    if (Object.keys(answers).length) writeDraft(id, answers);
  }, [answers, data, id, sent]);

  const questions = useMemo(() => data?.questions || [], [data]);
  const step1 = useMemo(() => questions.filter((q) => STEP1_TYPES.includes(q.questionType)), [questions]);
  const step2 = useMemo(() => questions.filter((q) => !STEP1_TYPES.includes(q.questionType)), [questions]);
  const steps = [step1.length ? 'ratings' : null, step2.length ? 'more' : null].filter(Boolean);
  const current = steps[step - 1] === 'more' ? step2 : step1;
  const last = step >= steps.length;

  const set = (qid, patch) => {
    setAnswers((a) => ({ ...a, [qid]: { ...(a[qid] || {}), ...patch } }));
    setErrors((e) => (e[qid] ? { ...e, [qid]: undefined } : e));
  };
  const toggleOption = (qid, optId, single) => {
    setAnswers((a) => {
      const cur = a[qid]?.optionIds || [];
      const next = single
        ? (cur[0] === optId ? [] : [optId])
        : (cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId]);
      return { ...a, [qid]: { ...(a[qid] || {}), optionIds: next } };
    });
    setErrors((e) => (e[qid] ? { ...e, [qid]: undefined } : e));
  };

  // Mirrors the server's rules so the student hears what is missing before a
  // round trip — the server still re-checks everything.
  const validate = (list) => {
    const next = {};
    for (const q of list) {
      if (q.isRequired && !isAnswered(q, answers[q._id])) {
        next[q._id] = RATING_TYPES.includes(q.questionType) ? 'Please choose a rating'
          : ['checkbox', 'multiple_choice'].includes(q.questionType) ? 'Please choose at least one' : 'Please answer';
      }
    }
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) document.querySelector(`[data-q="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return !first;
  };

  const forward = () => {
    if (!validate(current)) return;
    if (last) { setConfirm(true); return; }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const doSubmit = async () => {
    setSaving(true);
    try {
      await api.submitFeedback(id, {
        answers: questions.map((q) => {
          const a = answers[q._id] || {};
          return {
            campaignQuestion: q._id,
            ratingValue: a.ratingValue ?? null,
            textResponse: a.textResponse ?? '',
            optionIds: a.optionIds || [],
            otherText: a.otherText || '',
          };
        }),
      });
      clearDraft(id);
      // Offer the next teacher in the same campaign, if there is one.
      let next = null;
      try {
        const res = await api.getPendingFeedback();
        const list = res.data ?? res;
        next = list.find((r) => r._id !== id && r.campaign?._id === data.campaign._id) || list.find((r) => r._id !== id) || null;
      } catch { /* the thank-you screen still works without it */ }
      setConfirm(false);
      setSent({ next });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast.error(err.message || 'Could not submit your feedback');
      setConfirm(false);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="fbpage fbpage--narrow"><div className="fbloading"><Spinner /></div></div>;
  if (error) {
    return (
      <div className="fbpage fbpage--narrow">
        <Crumbs trail={TRAIL} here="Give feedback" />
        <div className="fbcard">
          <div className="fbempty">
            <span aria-hidden>🔒</span>
            <h3>This feedback cannot be opened</h3>
            <p>{error}</p>
            <Link to="/student/feedback" className="fbtb fbtb--primary">Back to my feedback</Link>
          </div>
        </div>
      </div>
    );
  }

  const a = data.assignment;
  const c = data.campaign;
  const answeredAll = questions.filter((q) => isAnswered(q, answers[q._id])).length;
  const pct = questions.length ? Math.round((answeredAll / questions.length) * 100) : 0;
  const place = [a.className, a.sectionName].filter(Boolean).join(' ');

  if (sent) {
    return (
      <div className="fbpage fbpage--narrow">
        <Crumbs trail={TRAIL} here="Sent" />
        <section className="fbthanks">
          <span className="fbthanks__icon"><Icon name="checkCircle" size={40} /></span>
          <h1>Thank you!</h1>
          <p>Your feedback for <b>{a.teacher?.name}</b>{a.subject ? ` (${a.subject})` : ''} has been sent. It is locked now and
            cannot be changed — and it stays anonymous.</p>
          {sent.next ? (
            <div className="fbthanks__next">
              <small>Up next</small>
              <div className="fbthanks__who">
                <Avatar name={sent.next.teacher?.name} src={sent.next.teacher?.photo} size={44} />
                <span><b>{sent.next.teacher?.name}</b><em>{sent.next.subject || 'General'}</em></span>
              </div>
              <button type="button" className="fbtb fbtb--primary"
                onClick={() => navigate(`/student/feedback/${sent.next._id}`)}>
                Give feedback <Icon name="arrowRight" size={14} />
              </button>
            </div>
          ) : (
            <p className="fbthanks__done"><Icon name="sparkle" size={15} /> That was the last one — you are all caught up.</p>
          )}
          <Link to="/student/feedback" className="fbtb">Back to my feedback</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="fbpage fbpage--narrow fbform">
      <Crumbs trail={TRAIL} here={a.teacher?.name || 'Give feedback'} />

      <section className="fbformhead">
        <Avatar name={a.teacher?.name} src={a.teacher?.photo} size={64} />
        <div className="fbformhead__id">
          <small>Giving feedback to</small>
          <h1>{a.teacher?.name}</h1>
          <p>{[a.subject, place].filter(Boolean).join(' · ')}</p>
          <div className="fbtagrow">
            <Tag tone="slate" icon="megaphone">{c.name}</Tag>
            <Countdown endDate={c.endDate} />
            {c.isAnonymous ? <Tag tone="purple" icon="key">Anonymous</Tag> : null}
          </div>
        </div>
      </section>

      {c.instructions ? <NoteBar tone="blue" icon="info">{c.instructions}</NoteBar> : null}
      {restored ? (
        <NoteBar tone="green" icon="refresh"
          action={<button type="button" className="fbtb" onClick={() => { setAnswers({}); clearDraft(id); setRestored(false); }}>Start over</button>}>
          We kept the answers you started earlier — carry on where you left off.
        </NoteBar>
      ) : null}

      <div className="fbprogress">
        <div className="fbprogress__top">
          <b>{answeredAll} of {questions.length} answered</b>
          {steps.length > 1 && (
            <span className="fbprogress__steps">
              {steps.map((st, i) => (
                <span key={st} className={i + 1 === step ? 'is-on' : i + 1 < step ? 'is-done' : ''}>
                  {i + 1 < step ? <Icon name="checkCircle" size={13} /> : <em>{i + 1}</em>}
                  {st === 'ratings' ? 'Ratings' : 'A little more'}
                </span>
              ))}
            </span>
          )}
        </div>
        <span className="fbprogress__track" aria-hidden><span style={{ width: `${pct}%` }} /></span>
        {steps[step - 1] === 'ratings' && (
          <small>1 = {RATING_LABELS[1]} · 3 = {RATING_LABELS[3]} · 5 = {RATING_LABELS[5]}</small>
        )}
      </div>

      {steps[step - 1] === 'ratings'
        ? groupByCategory(step1).map(([category, qs]) => (
          <section key={category} className="fbqcard">
            <header>
              <span className="fbqcard__icon tint-purple"><Icon name={categoryIcon(category)} size={16} /></span>
              <b>{category}</b>
              <small>{qs.filter((q) => isAnswered(q, answers[q._id])).length} / {qs.length}</small>
            </header>
            {qs.map((q) => (
              <Question key={q._id} q={q} value={answers[q._id]} error={errors[q._id]}
                set={set} toggleOption={toggleOption} number={questions.indexOf(q) + 1} />
            ))}
          </section>
        ))
        : (
          <section className="fbqcard">
            <header>
              <span className="fbqcard__icon tint-blue"><Icon name="chat" size={16} /></span>
              <b>A little more</b>
              <small>Optional questions can be skipped</small>
            </header>
            {step2.map((q) => (
              <Question key={q._id} q={q} value={answers[q._id]} error={errors[q._id]}
                set={set} toggleOption={toggleOption} number={questions.indexOf(q) + 1} />
            ))}
          </section>
        )}

      <div className="fbformbar">
        <span className="fbformbar__save"><Icon name="checkCircle" size={14} /> Answers are kept as you go</span>
        {step > 1 ? (
          <button type="button" className="fbtb" onClick={() => { setStep((s) => s - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <Icon name="chevronLeft" size={14} /> Back
          </button>
        ) : (
          <Link to="/student/feedback" className="fbtb">Later</Link>
        )}
        <button type="button" className="fbtb fbtb--primary" onClick={forward}>
          {last ? <><Icon name="eye" size={14} /> Review &amp; send</> : <>Continue <Icon name="arrowRight" size={14} /></>}
        </button>
      </div>

      <FbModal open={confirm} onClose={() => !saving && setConfirm(false)} busy={saving} width={520} icon="checkCircle" tone="green"
        title="Send your feedback?"
        subtitle={`To ${a.teacher?.name}${a.subject ? ` for ${a.subject}` : ''}. Once sent it cannot be changed.`}
        footer={(
          <>
            <button type="button" className="fbtb" onClick={() => setConfirm(false)} disabled={saving}>Go back</button>
            <button type="button" className="fbtb fbtb--primary" onClick={doSubmit} disabled={saving}>
              <Icon name="checkCircle" size={15} /> {saving ? 'Sending…' : 'Yes, send it'}
            </button>
          </>
        )}>
        <ReviewSummary questions={questions} answers={answers} />
        <NoteBar tone="purple" icon="key">
          {c.isAnonymous
            ? 'Your name is never shown with your answers. Your teacher only sees results combined across many students.'
            : 'Your teacher sees results combined across many students, once enough have answered.'}
        </NoteBar>
      </FbModal>
    </div>
  );
}

function Question({ q, value = {}, error, set, toggleOption, number }) {
  return (
    <div className={`fbquestion${error ? ' has-error' : ''}${isAnswered(q, value) ? ' is-done' : ''}`} data-q={q._id}>
      <div className="fbquestion__label">
        <span className="fbquestion__n">{number}</span>
        <div>
          <b>{q.questionText}{q.isRequired ? <em>{' '}*</em> : <i> (optional)</i>}</b>
          {q.helpText ? <small>{q.helpText}</small> : null}
        </div>
      </div>

      {RATING_TYPES.includes(q.questionType) && (
        <RatingInput name={q.questionText} value={value.ratingValue ?? null}
          onChange={(v) => set(q._id, { ratingValue: v })} />
      )}

      {q.questionType === 'yes_no' && (
        <div className="fbprev__yn">
          {['yes', 'no'].map((v) => (
            <button key={v} type="button" className={value.textResponse === v ? 'is-on' : ''} aria-pressed={value.textResponse === v}
              onClick={() => set(q._id, { textResponse: value.textResponse === v ? '' : v })}>
              {v === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      )}

      {['checkbox', 'multiple_choice'].includes(q.questionType) && (
        <>
          <small className="fbquestion__hint">{q.questionType === 'checkbox' ? 'Choose any that apply' : 'Choose one'}</small>
          <OptionChips options={q.options || []} selected={value.optionIds || []}
            single={q.questionType === 'multiple_choice'} onToggle={(optId, single) => toggleOption(q._id, optId, single)} />
          {(q.options || []).some((o) => o.allowsFreeText && (value.optionIds || []).includes(o._id)) && (
            <input className="fbinput" style={{ marginTop: 10 }} placeholder="Tell us more (optional)" maxLength={200}
              value={value.otherText || ''} onChange={(e) => set(q._id, { otherText: e.target.value })} />
          )}
        </>
      )}

      {q.questionType === 'text' && (
        <>
          <textarea className="fbinput" rows={4} maxLength={q.maxLength || 1000}
            placeholder="Share anything you would like your teacher to know — kind and honest helps most."
            value={value.textResponse || ''} onChange={(e) => set(q._id, { textResponse: e.target.value })} />
          <div className="fbprev__count">{(value.textResponse || '').length} / {q.maxLength || 1000}</div>
        </>
      )}

      {error ? <span className="fbff__err"><Icon name="alert" size={12} /> {error}</span> : null}
    </div>
  );
}

/** What is about to be sent, in one glance: counts and the student's own average. */
function ReviewSummary({ questions, answers }) {
  const missing = questions.filter((q) => q.isRequired && !isAnswered(q, answers[q._id])).length;
  const ratings = questions.filter((q) => RATING_TYPES.includes(q.questionType) && answers[q._id]?.ratingValue != null)
    .map((q) => answers[q._id].ratingValue);
  const avg = ratings.length ? ratings.reduce((n, v) => n + v, 0) / ratings.length : null;
  const answered = questions.filter((q) => isAnswered(q, answers[q._id])).length;
  const wrote = questions.some((q) => q.questionType === 'text' && String(answers[q._id]?.textResponse || '').trim());
  return (
    <div className="fbreview">
      <div><b>{answered}</b><small>of {questions.length} answered</small></div>
      <div><b>{avg == null ? '—' : `★ ${avg.toFixed(1)}`}</b><small>your average rating</small></div>
      <div><b>{wrote ? 'Yes' : 'No'}</b><small>written comment</small></div>
      {missing ? <p className="fbwarn"><Icon name="alert" size={14} /> {missing} required question{missing === 1 ? ' is' : 's are'} still empty.</p> : null}
    </div>
  );
}

// Category headings come from the question snapshot, so a school that renames
// "Teaching Quality" sees the new name here without a deploy.
function groupByCategory(questions) {
  const map = new Map();
  for (const q of questions) {
    const key = q.categoryName || 'General';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(q);
  }
  return [...map.entries()];
}

