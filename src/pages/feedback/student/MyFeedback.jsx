import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import { PageHeader, Button, Badge, Spinner, Empty, Alert } from '../../../components/ui/index';
import { Score, Stars, fmtDate, daysLeft } from '../shared/kit';

// Student landing page: what is still owed, and what has already been given.
// Deliberately card-based rather than a table — this is the one feedback screen
// most students will ever open, and most of them open it on a phone.
export default function MyFeedback() {
  const [tab, setTab] = useState('pending');
  const pending   = useFetch(() => api.getPendingFeedback(), []);
  const completed = useFetch(() => api.getCompletedFeedback(), []);

  const list    = tab === 'pending' ? pending : completed;
  const rows    = list.data || [];
  const overdue = (pending.data || []).filter((r) => (daysLeft(r.deadline) ?? 9) <= 2).length;

  return (
    <div className="page page-md">
      <PageHeader
        title="Teacher Feedback"
        subtitle="Your feedback is confidential and helps your teachers improve."
      />

      {overdue > 0 && tab === 'pending' && (
        <Alert variant="warning">
          {overdue === 1 ? 'One feedback closes' : `${overdue} feedback forms close`} within two days — please complete them soon.
        </Alert>
      )}

      <div className="tabs">
        <button className={`tab${tab === 'pending' ? ' active' : ''}`} onClick={() => setTab('pending')}>
          Pending {pending.data?.length ? `(${pending.data.length})` : ''}
        </button>
        <button className={`tab${tab === 'completed' ? ' active' : ''}`} onClick={() => setTab('completed')}>
          Completed {completed.data?.length ? `(${completed.data.length})` : ''}
        </button>
      </div>

      {list.loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : list.error ? (
        <Alert variant="danger">{list.error}</Alert>
      ) : !rows.length ? (
        tab === 'pending'
          ? <Empty icon="✅" title="No pending feedback"
              message="You have completed all available teacher feedback." />
          : <Empty icon="📝" title="No feedback submitted yet"
              message="Feedback you submit will be listed here." />
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {rows.map((r) => <FeedbackCard key={r._id} row={r} done={tab === 'completed'} />)}
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ row, done }) {
  const left = daysLeft(row.deadline);
  const urgent = !done && left != null && left <= 2;

  return (
    // A campaign notification names the campaign, not this assignment, so the
    // card answers to both — see hooks/useFocusHighlight.js.
    <div className="card" data-focus-id={[row._id, row.campaign?._id || row.campaign].filter(Boolean).join(' ')}>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
        <div>
          <div style={{ fontSize: '1.02rem', fontWeight: 700 }}>{row.subject || 'General'}</div>
          <div style={{ fontSize: '.88rem', color: 'var(--text)' }}>{row.teacher?.name}</div>
          <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
            {[row.className, row.sectionName].filter(Boolean).join(' · ') || row.campaign?.name}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge variant={done ? 'success' : 'warning'}>{done ? 'Completed' : 'Pending'}</Badge>
          {row.campaign?.isAnonymous && <Badge variant="info">Anonymous</Badge>}
        </div>

        {done ? (
          <>
            <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
              Submitted on {fmtDate(row.submittedAt)}
            </div>
            {row.overallRating != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Stars value={Math.round(row.overallRating)} />
                <Score value={row.overallRating} size="sm" showLabel={false} />
              </div>
            )}
            <Link to={`/student/feedback/${row._id}/view`} style={{ marginTop: 'auto' }}>
              <Button variant="secondary" size="sm" style={{ width: '100%' }}>View my feedback</Button>
            </Link>
          </>
        ) : (
          <>
            <div style={{ fontSize: '.76rem', color: urgent ? 'var(--danger)' : 'var(--text-muted)' }}>
              {left == null ? '' : left <= 0 ? 'Closes today' : `Closes in ${left} day${left === 1 ? '' : 's'} · ${fmtDate(row.deadline)}`}
            </div>
            <Link to={`/student/feedback/${row._id}`} style={{ marginTop: 'auto' }}>
              <Button size="sm" style={{ width: '100%' }}>Give Feedback</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
