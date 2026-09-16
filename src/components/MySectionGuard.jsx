import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useModules } from '../contexts/ModulesContext';
import { Spinner } from './ui/index';

export const MY_SECTION_DENIED = 'My Section is available to class teachers and vice class teachers only';

/**
 * /teacher/my-section, for the teachers it belongs to.
 *
 * My Section is the page of a class teacher or vice class teacher. A teacher who
 * only takes a subject in a class does not get it: the sidebar and the dashboard
 * hide the link, and this stops the URL being typed in. The module payload's
 * `hasMySection` carries the rule (services/teacherOwnSections.js on the
 * server), and GET /teacher/my-section refuses the same people.
 *
 * Fails closed, unlike ModuleGuard: with no module map to read there is no
 * reason to believe the teacher runs a class, and the server would refuse the
 * page's data anyway.
 */
export default function MySectionGuard({ children }) {
  const { modules, ready } = useModules();
  const allowed = ready && modules?.hasMySection === true;

  useEffect(() => {
    if (ready && !allowed) toast.error(MY_SECTION_DENIED, { id: 'my-section-denied' });
  }, [ready, allowed]);

  if (!ready) return <div className="loading-page"><Spinner /></div>;
  if (!allowed) return <Navigate to="/teacher/dashboard" replace />;
  return children;
}
