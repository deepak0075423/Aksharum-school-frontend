import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Button, Card, Spinner, Alert, Badge } from '../../../components/ui/index';
import { Score, Stars, fmtDate, RATING_LABELS } from '../shared/kit';

// A read-only replay of what this student submitted. Locked feedback stays
// visible to its own author forever — it just can no longer be changed.
export default function SubmissionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(() => api.getMySubmission(id), [id]);

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
  const answered = (data.answers || []).filter(
    (q) => q.ratingValue != null || q.textResponse || q.selectedOptions?.length,
  );

  return (
    <div className="page page-md">
      <PageHeader
        title="My Feedback"
        subtitle={`Submitted on ${fmtDate(a.submittedAt)} — this feedback is locked and cannot be edited.`}
        action={<Button variant="secondary" size="sm" onClick={() => navigate('/student/feedback')}>Back</Button>}
      />

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{a.teacher?.name}</div>
            <div style={{ fontSize: '.84rem', color: 'var(--text-muted)' }}>
              {[a.subject, a.className, a.sectionName].filter(Boolean).join(' · ')}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <Badge variant="success">Completed</Badge>
              {data.campaign?.isAnonymous && <Badge variant="info">Anonymous</Badge>}
            </div>
          </div>
          {a.overallRating != null && (
            <div style={{ textAlign: 'right' }}>
              <Score value={a.overallRating} size="lg" showLabel={false} />
              <div style={{ marginTop: 4 }}><Stars value={Math.round(a.overallRating)} /></div>
              <div className="text-xs text-muted">Your average rating</div>
            </div>
          )}
        </div>
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Your answers">
        <ul style={{ display: 'grid', gap: 16, listStyle: 'none', margin: 0, padding: 0 }}>
          {answered.map((q) => (
            <li key={q._id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div style={{ fontSize: '.85rem', marginBottom: 6 }}>
                {q.questionText}
                {q.categoryName && <span className="text-xs text-muted"> · {q.categoryName}</span>}
              </div>
              {q.ratingValue != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Stars value={q.ratingValue} />
                  <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                    {q.ratingValue} — {RATING_LABELS[q.ratingValue]}
                  </span>
                </div>
              )}
              {!!q.selectedOptions?.length && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {q.selectedOptions.map((o) => <Badge key={o} variant="primary">{o}</Badge>)}
                </div>
              )}
              {q.textResponse && q.ratingValue == null && (
                <p style={{ fontSize: '.85rem', whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{q.textResponse}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
