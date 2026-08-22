import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
 *
 * A null map fails open, so NOT loading it is the same as enabling everything.
 * That makes the two rules below load-bearing rather than defensive:
 *   • refetch when the first-login gate lifts (see `firstLogin`), and
 *   • retry a failed fetch instead of leaving the session permanently open.
 */

const ModulesContext = createContext(null);

const FETCHER = {
  school_admin: getAdminModules,
  teacher:      getTeacherModules,
  student:      getStudentModules,
  parent:       getParentModules,
};

// Backoff for transient failures. A blip must not turn into a session that
// silently shows every module, so the fetch is given a few more chances.
const RETRY_DELAYS = [1000, 3000, 8000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const ModulesProvider = ({ children }) => {
  const { user } = useAuth();
  const [modules, setModules] = useState(null);
  const [ready,   setReady]   = useState(false);
  // Identifies the in-flight load, so a superseded one cannot land late and
  // overwrite the current user's access with the previous user's.
  const runRef = useRef(0);

  // What the fetch is keyed on. `isFirstLogin` is part of the identity because
  // /{role}/modules sits behind requirePasswordReset: while it is true the
  // request can only answer 403 PASSWORD_RESET_REQUIRED, and the moment the
  // password is set the same user has to be fetched again. Keying on the role
  // alone missed that transition — the role does not change across the reset,
  // so `modules` stayed null for the rest of the session and every module
  // showed up in the nav until the next full page load.
  const role       = user?.role;
  const userId     = user?._id || user?.id || '';
  const firstLogin = !!user?.isFirstLogin;

  const load = useCallback(async () => {
    const run = ++runRef.current;
    const current = () => run === runRef.current;

    const fetcher = FETCHER[role];
    // No role to fetch for, or the account still has to set its password — in
    // both cases there is nothing to ask the server for yet.
    if (!fetcher || firstLogin) { setModules(null); setReady(true); return; }

    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetcher();
        if (!current()) return;
        setModules(res?.data ?? res);
        setReady(true);
        return;
      } catch (err) {
        // 401/403 are answers, not blips: retrying cannot change them. Anything
        // else (network, timeout, a backend restart) is worth another attempt.
        const status = err?.status;
        const retryable = status !== 401 && status !== 403 && attempt < RETRY_DELAYS.length;
        if (!current()) return;
        if (!retryable) { setReady(true); return; }
        await sleep(RETRY_DELAYS[attempt]);
        if (!current()) return;
      }
    }
  }, [role, userId, firstLogin]);

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
