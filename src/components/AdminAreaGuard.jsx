import React from 'react';
import { useLocation } from 'react-router-dom';
import { Forbidden } from '../pages/errors/ErrorPage';
import { useAuth } from '../contexts/AuthContext';
import { useModules, useGate } from '../contexts/ModulesContext';
import { moduleForAdminPath } from '../utils/modules';
import { wardenMay } from '../utils/hostelDuty';
import { Spinner } from './ui/index';

/**
 * Gate for the /admin area, which is no longer school-admin-only.
 *
 * A school admin sees all of it. A teacher may enter exactly the module areas
 * their designation grants ADMIN access to (plus, for a teacher posted to a
 * hostel, that hostel's day-to-day screens) — the third layer of
 * School module enablement → Designation permission → User access — and nothing
 * else under /admin, so the People / Academics / Settings screens stay closed.
 *
 * The server enforces the same rule (middleware/moduleAccess.allowModuleAdmin);
 * this only keeps the UI from showing a page that would 403.
 */
export default function AdminAreaGuard({ children }) {
  const { user } = useAuth();
  const { ready, isAdmin, modules } = useModules();
  const { pathname } = useLocation();

  const isTeacher = user?.role === 'teacher';
  const moduleKey = moduleForAdminPath(pathname);
  // Whether a teacher's designation (or hostel posting) opens this address.
  const opens = !!moduleKey && (isAdmin(moduleKey) || (moduleKey === 'hostel' && !!modules?.hostelDuty && wardenMay(pathname)));
  // A refusal is confirmed with the server first: administrative access given
  // while the teacher was signed in is otherwise refused on the old answer.
  // Only a teacher's answer comes from the map, so only theirs is re-asked.
  const { pending } = useGate(!isTeacher || (ready && opens), isTeacher ? `admin:${pathname}` : '');

  if (user?.role === 'school_admin') return children;
  if (!isTeacher) return <Forbidden reason="role" what="the admin area" />;

  // Permissions decide the answer — wait rather than guess.
  if (pending) return <div className="loading-page"><Spinner /></div>;

  if (moduleKey && isAdmin(moduleKey)) return children;

  // A teacher posted to a hostel as its warden or staff runs its day-to-day
  // screens without administering the module (middleware/hostelDesk on the
  // server). Setup, fees, the mess, reports and settings stay closed.
  if (moduleKey === 'hostel' && modules?.hostelDuty) {
    return wardenMay(pathname) ? children
      : <Forbidden reason="admin_only" what="this part of the hostel" detail="it is managed by the hostel administrators" />;
  }

  // A teacher who reaches an admin URL either has no administrative access to
  // that module, or the URL is not part of any module's admin area at all.
  return moduleKey
    ? <Forbidden reason="admin_only" what={`the ${moduleKey} admin area`} />
    : <Forbidden reason="role" what="the admin area" detail="this address is not part of a module you administer" />;
}
