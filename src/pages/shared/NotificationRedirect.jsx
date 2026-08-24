import React, { useEffect, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { resolveNotification } from '../../api/notifications.api';
import { rememberPendingNotification } from '../../utils/notificationLink';
import { Spinner, Alert } from '../../components/ui/index';

/**
 * /n/:receiptId — the one link that works from anywhere.
 *
 * Notification emails cannot know which screen the reader belongs on: the same
 * notification lives at a different path for a teacher, an admin and a parent,
 * and the sender does not know who opens the mail on what. So the mail links
 * here, and the server answers "for you, this goes to …" — marking the
 * notification read on the way through.
 *
 * Signed out, the target is parked and picked up again after sign-in, so the
 * link never dead-ends on a login screen.
 */
export default function NotificationRedirect() {
  const { receiptId }     = useParams();
  const { user, loading } = useAuth();
  const navigate          = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading || !user || !receiptId) return;
    let cancelled = false;
    (async () => {
      try {
        const res  = await resolveNotification(receiptId);
        const data = res?.data ?? res;
        if (cancelled) return;
        navigate(data?.link?.web || '/', { replace: true });
      } catch (err) {
        if (!cancelled) {
          // A receipt that is not this account's is indistinguishable from one
          // that never existed — say so plainly rather than guessing.
          setError(err.status === 404
            ? 'This notification is not available on this account. If you have more than one, sign in with the other.'
            : (err.message || 'Could not open this notification.'));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [loading, user, receiptId, navigate]);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  if (!user) {
    rememberPendingNotification(receiptId);
    return <Navigate to="/login" replace />;
  }

  if (error) {
    return (
      <div className="page" style={{ maxWidth: 520, margin: '64px auto' }}>
        <Alert variant="danger">{error}</Alert>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
          Go to my dashboard
        </button>
      </div>
    );
  }

  return <div className="loading-page"><Spinner /></div>;
}
