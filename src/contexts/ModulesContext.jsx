import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getModules as getAdminModules }   from '../api/admin.api';
import { getModules as getTeacherModules } from '../api/teacher.api';
import { getModules as getStudentModules } from '../api/student.api';
import { getModules as getParentModules }  from '../api/parent.api';

/**
 * The signed-in user's effective module access, fetched once per session.
 *
 * GET /{role}/modules already returns EFFECTIVE access — the per-module boolean
 * is the school's flag AND the user's designation permission — so `isEnabled`
 * covers both layers of the hierarchy. `permissions` and `isAdmin` expose the
 * level itself, which is what promotes a teacher into a module's admin surface.
 *
 * Shared through context because both the sidebar and the /admin route guard
 * need the same answer, and neither should refetch it.
 */

const ModulesContext = createContext(null);

const FETCHER = {
  school_admin: getAdminModules,
  teacher:      getTeacherModules,
  student:      getStudentModules,
  parent:       getParentModules,
};

export const ModulesProvider = ({ children }) => {
  const { user } = useAuth();
  const [modules, setModules] = useState(null);
  const [ready,   setReady]   = useState(false);

  const load = useCallback(async () => {
    const fetcher = FETCHER[user?.role];
    if (!fetcher) { setModules(null); setReady(true); return; }
    try {
      const res = await fetcher();
      setModules(res?.data ?? res);
    } catch {
      /* leave modules null — callers fail open, as they did before this existed */
    } finally {
      setReady(true);
    }
  }, [user?.role]);

  useEffect(() => { setReady(false); load(); }, [load]);

  /** true when the user has at least normal access; fails open while loading. */
  const isEnabled = (key) => !key || !modules || modules[key] === true;
  /** true only when the user's designation grants administrative access. */
  const isAdmin   = (key) => !!modules?.moduleAdmin?.[key];
  /** 'admin' | 'user' | 'none' */
  const levelOf   = (key) => modules?.permissions?.[key] || (isEnabled(key) ? 'user' : 'none');

  return (
    <ModulesContext.Provider value={{ modules, ready, isEnabled, isAdmin, levelOf, reload: load }}>
      {children}
    </ModulesContext.Provider>
  );
};

export const useModules = () => {
  const ctx = useContext(ModulesContext);
  if (!ctx) throw new Error('useModules must be used inside ModulesProvider');
  return ctx;
};
