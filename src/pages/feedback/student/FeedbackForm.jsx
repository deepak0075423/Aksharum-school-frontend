import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Button, Card, Spinner, Alert, Badge, Modal } from '../../../components/ui/index';
import { RatingInput, OptionChips, Stepper, RATING_LABELS, fmtDate } from '../shared/kit';

// The 2-step student form (spec §7, §8).
//
// Nothing about the questionnaire is hardcoded here: step 1 renders every scored
// question the campaign snapshot returned, grouped by its category, and step 2
// renders the choice/text questions. Adding a question in the admin question
// bank changes this screen with no code change.
const RATING_TYPES = ['rating_5', 'emoji_5'];
const STEP2_TYPES  = ['checkbox', 'multiple_choice', 'text'];

export default function FeedbackForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(() => api.getFeedbackForm(id), [id]);

  const [step, setStep]       = useState(1);
  const [answers, setAnswers] = useState({});   // questionId → { ratingValue | textResponse | optionIds | otherText }
  const [errors, setErrors]   = useState({});
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving]   = useState(false);

  const questions = data?.questions || [];
  const step1 = useMemo(() => questions.filter((q) => RATING_TYPES.includes(q.questionType) || q.questionType === 'yes_no'), [questions]);
  const step2 = useMemo(() => questions.filter((q) => STEP2_TYPES.includes(q.questionType)), [questions]);
  const hasStep2 = step2.length > 0;
  const totalSteps = hasStep2 ? 2 : 1;

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

  // Client-side validation mirrors the server's rules so the student is told
  // what is missing before a round trip — the server still re-checks everything.
  const validate = (list) => {
    const next = {};
    for (const q of list) {
      if (!q.isRequired) continue;
      const a = answers[q._id] || {};
      if (RATING_TYPES.includes(q.questionType) && a.ratingValue == null) next[q._id] = 'Please choose a rating';
      else if (q.questionType === 'yes_no' && !a.textResponse) next[q._id] = 'Please answer';
      else if (q.questionType === 'text' && !String(a.textResponse || '').trim()) next[q._id] = 'Please answer';
      else if (['checkbox', 'multiple_choice'].includes(q.questionType) && !(a.optionIds || []).length) next[q._id] = 'Please choose at least one';
    }
    setErrors(next);
    if (Object.keys(next).length) {
      const first = document.querySelector(`[data-q="${Object.keys(next)[0]}"]`);
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return !Object.keys(next).length;
  };

  const goNext = () => { if (validate(step1)) { setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  const doSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
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
      };
      await api.submitFeedback(id, payload);
      toast.success('Feedback submitted. Thank you!');
      navigate('/student/feedback');
    } catch (err) {
      toast.error(err.message || 'Could not submit your feedback');
      setConfirm(false);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;
  if (error) {
    return (
      <div className="page page-sm">
        <Alert variant="danger">{error}</Alert>
        <Button variant="secondary" onClick={() => navigate('/student/feedback')} style={{ marginTop: 16 }}>Back to my feedback</Button>
      </div>
    );
  }

  const a = data.assignment;
  const answeredCount = step1.filter((q) => answers[q._id]?.ratingValue != null || answers[q._id]?.textResponse).length;

  return (
    <div className="page page-md">
      <PageHeader
        title={`Step ${step} of ${totalSteps}`}
        subtitle={step === 1 ? 'Teacher Rating' : 'Additional Feedback'}
        action={<Button variant="secondary" size="sm" onClick={() => navigate('/student/feedback')}>Cancel</Button>}
      />

      <Stepper step={step} steps={hasStep2 ? ['Teacher Rating', 'Additional Feedback'] : ['Teacher Rating']} />

      {/* Who is being evaluated — kept on screen through both steps */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{a.teacher?.name}</div>
            <div style={{ fontSize: '.84rem', color: 'var(--text-muted)' }}>
              {[a.subject, a.className && `Class ${a.className}`, a.sectionName && `Section ${a.sectionName}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {data.campaign?.isAnonymous && <Badge variant="info">Anonymous</Badge>}
            <Badge variant="muted">Closes {fmtDate(data.campaign?.endDate)}</Badge>
          </div>
        </div>
        {data.campaign?.instructions && (
          <p style={{ marginTop: 12, fontSize: '.82rem', color: 'var(--text-muted)' }}>{data.campaign.instructions}</p>
        )}
      </Card>

      {step === 1 ? (
        <>
          <div style={{ margin: '16px 0 10px', fontSize: '.78rem', color: 'var(--text-muted)' }}>
            {answeredCount} of {step1.length} answered · 1 = {RATING_LABELS[1]} … 5 = {RATING_LABELS[5]}
          </div>
          {groupByCategory(step1).map(([category, qs]) => (
            <Card key={category} title={category}>
              <div style={{ display: 'grid', gap: 20 }}>
                {qs.map((q) => (
                  <QuestionField key={q._id} q={q} value={answers[q._id]} error={errors[q._id]} set={set} toggleOption={toggleOption} />
                ))}
              </div>
            </Card>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={hasStep2 ? goNext : () => validate(step1) && setConfirm(true)}>
              {hasStep2 ? 'Continue →' : 'Submit Feedback'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div style={{ height: 16 }} />
          {step2.map((q) => (
            <Card key={q._id} title={q.questionText}>
              <QuestionField q={q} value={answers[q._id]} error={errors[q._id]} set={set} toggleOption={toggleOption} hideLabel />
            </Card>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>← Back &amp; edit</Button>
            <Button onClick={() => validate(step2) && setConfirm(true)}>Submit Feedback</Button>
          </div>
        </>
      )}

      <Modal
        open={confirm}
        onClose={() => !saving && setConfirm(false)}
        title="Submit feedback?"
        maxWidth={440}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)} disabled={saving}>Go back</Button>
            <Button onClick={doSubmit} loading={saving}>Yes, submit</Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>
          Are you sure you want to submit this feedback? You will not be able to edit it after submission.
        </p>
        {data.campaign?.isAnonymous && (
          <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', marginTop: 10 }}>
            Your name is never shown to the teacher — they only see combined results for the whole class.
          </p>
        )}
      </Modal>
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

function QuestionField({ q, value = {}, error, set, toggleOption, hideLabel }) {
  const isRating = RATING_TYPES.includes(q.questionType);

  return (
    <div data-q={q._id}>
      {!hideLabel && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: '.88rem', fontWeight: 500 }}>
            {q.questionText}
            {q.isRequired && <span style={{ color: 'var(--danger)' }}> *</span>}
          </label>
          {q.helpText && <div className="form-hint">{q.helpText}</div>}
        </div>
      )}
      {hideLabel && q.helpText && <div className="form-hint" style={{ marginBottom: 8 }}>{q.helpText}</div>}

      {isRating && (
        <RatingInput name={q.questionText} value={value.ratingValue ?? null} onChange={(v) => set(q._id, { ratingValue: v })} />
      )}

      {q.questionType === 'yes_no' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {['yes', 'no'].map((v) => (
            <button key={v} type="button"
              onClick={() => set(q._id, { textResponse: value.textResponse === v ? '' : v })}
              style={{
                cursor: 'pointer', minHeight: 44, padding: '8px 22px', borderRadius: 'var(--radius)',
                textTransform: 'capitalize', fontWeight: value.textResponse === v ? 600 : 400,
                border: `1.5px solid ${value.textResponse === v ? 'var(--primary)' : 'var(--border)'}`,
                background: value.textResponse === v ? 'rgba(79,70,229,.08)' : 'var(--bg-card)',
                color: value.textResponse === v ? 'var(--primary)' : 'var(--text)',
              }}>
              {v}
            </button>
          ))}
        </div>
      )}

      {['checkbox', 'multiple_choice'].includes(q.questionType) && (
        <>
          <OptionChips
            options={q.options || []}
            selected={value.optionIds || []}
            single={q.questionType === 'multiple_choice'}
            onToggle={(optId, single) => toggleOption(q._id, optId, single)}
          />
          {(q.options || []).some((o) => o.allowsFreeText && (value.optionIds || []).includes(o._id)) && (
            <input
              className="form-control"
              style={{ marginTop: 10 }}
              placeholder="Tell us more (optional)"
              maxLength={200}
              value={value.otherText || ''}
              onChange={(e) => set(q._id, { otherText: e.target.value })}
            />
          )}
        </>
      )}

      {q.questionType === 'text' && (
        <>
          <textarea
            className="form-control"
            rows={4}
            maxLength={q.maxLength || 1000}
            placeholder="Optional — share anything else you would like your teacher to know"
            value={value.textResponse || ''}
            onChange={(e) => set(q._id, { textResponse: e.target.value })}
          />
          <div className="text-right text-xs text-muted" style={{ marginTop: 4 }}>
            {(value.textResponse || '').length} / {q.maxLength || 1000}
          </div>
        </>
      )}

      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
