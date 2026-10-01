import React from 'react';
import { useModules } from '../contexts/ModulesContext';
import { Forbidden } from '../pages/errors/ErrorPage';
import { Spinner } from './ui/index';

/**
 * "My Hostel" for a member of staff — only for the ones who live there.
 *
 * A school may run the Hostel module with not one teacher in residence, so the
 * module being on is not a reason to show a teacher this screen. The server
 * sends `hostelResident` in the module payload (services/hostelResident.js: a
 * bed that is theirs or held for them, or a hostel bill in their name), the
 * sidebar hides the entry on it, and this stops the URL being typed in.
 *
 * Fails closed, like TransportEnrolledGuard. The screen's endpoints are keyed
 * on the caller's own id, so a teacher who is not a resident would be shown
 * nothing by them either.
 */
export default function HostelResidentGuard({ children }) {
  const { modules, ready } = useModules();
  const allowed = ready && modules?.hostelResident === true;

  if (!ready) return <div className="loading-page"><Spinner /></div>;
  if (!allowed) return <Forbidden reason="not_enrolled" what="Hostel" />;
  return children;
}
