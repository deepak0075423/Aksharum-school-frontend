import React from 'react';
import { useModules, useGate } from '../contexts/ModulesContext';
import { Forbidden } from '../pages/errors/ErrorPage';
import { Spinner } from './ui/index';

/**
 * /teacher/my-section, for the teachers it belongs to.
 *
 * My Section is the page of a teacher attached to a section this year — its
 * class teacher, its vice class teacher, or a subject teacher in it. A teacher
 * attached to nothing does not get it: the sidebar and the dashboard hide the
 * link, and this stops the URL being typed in. The module payload's
 * `hasMySection` carries the rule (services/teacherOwnSections.js on the
 * server), and GET /teacher/my-section refuses the same people.
 *
 * Fails closed, unlike ModuleGuard: with no module map to read there is no
 * reason to believe the teacher has a section, and the server would refuse the
 * page's data anyway.
 *
 * But a "no" is confirmed with the server before it is shown (`useGate`). The
 * map in memory is from when the session started, and a teacher is usually
 * given their class or their subjects AFTER that — refusing on the old answer
 * told exactly the people the page is for that it was not theirs, until they
 * signed out and back in.
 *
 * And when the map could not be loaded at all there is no "no" to act on — only
 * a question nobody answered. The page is let through and its own endpoint
 * decides: it refuses a teacher who has no section with the same 403 page, and
 * serves one who has. A class teacher is not locked out of their class because
 * a different request failed.
 */
export default function MySectionGuard({ children }) {
  const { modules, ready, failed } = useModules();
  const allowed = ready && modules?.hasMySection === true;
  const { pending } = useGate(allowed, 'my-section');

  if (pending) return <div className="loading-page"><Spinner /></div>;
  if (allowed || failed) return children;
  return <Forbidden reason="class_teacher" what="My Section" />;
}
