/**
 * /applicant — where an applicant (guest) account lands from the app's own
 * sign-in page, the account switcher or a notification: their school's portal.
 */
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { portal as api } from '../../../api/admission.api';
import { useAuth } from '../../../contexts/AuthContext';
import ErrorPage from '../../errors/ErrorPage';

export default function ApplicantRedirect() {
  const { user, loading } = useAuth();
  const [to, setTo] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!user || user.role !== 'guest') return;
    api.me().then((r) => setTo(r.data?.portal?.slug ? `/${r.data.portal.slug}/dashboard` : '')).catch(() => setFailed(true));
  }, [user]);
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'guest') return <Navigate to="/" replace />;
  if (to) return <Navigate to={to} replace />;
  if (failed) return <ErrorPage code={403} reason="module_disabled" what="Online admissions" />;
  return null;
}
