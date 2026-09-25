import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useModules } from '../contexts/ModulesContext';
import { Spinner } from './ui/index';

export const TRANSPORT_NOT_ENROLLED =
  'Transport is available to people enrolled in the school transport service';

const HOME = {
  student: '/student/dashboard',
  parent: '/parent/dashboard',
  teacher: '/teacher/dashboard',
};

/**
 * The rider-facing Transport screens, for the people who actually use the bus.
 *
 * Being able to reach the module is not the same as riding: a school may have
 * Transport switched on for everyone while only forty children are enrolled.
 * `transportEnrolled` in the module payload carries the rule
 * (services/transportEnrolment.js on the server, which admits an enrolled
 * student or teacher, a parent whose child is enrolled, and the crew), the
 * sidebar hides the entry, and this stops the URL being typed in.
 *
 * Fails closed like MySectionGuard: with no module map there is no reason to
 * believe anyone is enrolled, and the endpoints refuse the data regardless —
 * the guards on /transport/{student,parent,staff}/* enforce the same rule.
 */
export default function TransportEnrolledGuard({ children }) {
  const { modules, ready } = useModules();
  const { user } = useAuth();
  const allowed = ready && modules?.transportEnrolled === true;

  useEffect(() => {
    if (ready && !allowed) toast.error(TRANSPORT_NOT_ENROLLED, { id: 'transport-not-enrolled' });
  }, [ready, allowed]);

  if (!ready) return <div className="loading-page"><Spinner /></div>;
  if (!allowed) return <Navigate to={HOME[user?.role] || '/'} replace />;
  return children;
}
