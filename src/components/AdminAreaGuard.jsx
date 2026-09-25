import React from 'react';
import { useLocation } from 'react-router-dom';
import { Forbidden } from '../pages/errors/ErrorPage';
import { useAuth } from '../contexts/AuthContext';
import { useModules } from '../contexts/ModulesContext';
import { moduleForAdminPath } from '../utils/modules';
import { Spinner } from './ui/index';

/**
 * Gate for the /admin area, which is no longer school-admin-only.
 *
 * A school admin sees all of it. A teacher may enter exactly the module areas
 * their designation grants ADMIN access to — the third layer of
 * School module enablement → Designation permission → User access — and nothing
 * else under /admin, so the People / Academics / Settings screens stay closed.
 *
 * The server enforces the same rule (middleware/moduleAccess.allowModuleAdmin);
 * this only keeps the UI from showing a page that would 403.
 */
export default function AdminAreaGuard({ children }) {
  const { user } = useAuth();
  const { ready, isAdmin } = useModules();
  const { pathname } = useLocation();

  if (user?.role === 'school_admin') return children;
  if (user?.role !== 'teacher') return <Forbidden reason="role" what="the admin area" />;

  // Permissions decide the answer — wait rather than guess.
  if (!ready) return <div className="loading-page"><Spinner /></div>;

  const moduleKey = moduleForAdminPath(pathname);
  if (moduleKey && isAdmin(moduleKey)) return children;

  // A teacher who reaches an admin URL either has no administrative access to
  // that module, or the URL is not part of any module's admin area at all.
  return moduleKey
    ? <Forbidden reason="admin_only" what={`the ${moduleKey} admin area`} />
    : <Forbidden reason="role" what="the admin area" detail="this address is not part of a module you administer" />;
}
