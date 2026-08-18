import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
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
  if (user?.role !== 'teacher') return <Navigate to="/" replace />;

  // Permissions decide the answer — wait rather than guess.
  if (!ready) return <div className="loading-page"><Spinner /></div>;

  const moduleKey = moduleForAdminPath(pathname);
  if (moduleKey && isAdmin(moduleKey)) return children;

  return <Navigate to="/teacher/dashboard" replace />;
}
