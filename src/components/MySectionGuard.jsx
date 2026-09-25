import React from 'react';
import { useModules } from '../contexts/ModulesContext';
import { Forbidden } from '../pages/errors/ErrorPage';
import { Spinner } from './ui/index';

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

  if (!ready) return <div className="loading-page"><Spinner /></div>;
  if (!allowed) return <Forbidden reason="class_teacher" what="My Section" />;
  return children;
}
