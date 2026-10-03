import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getModules as getAdminModules }   from '../api/admin.api';
import { getModules as getTeacherModules } from '../api/teacher.api';
import { getModules as getStudentModules } from '../api/student.api';
import { getModules as getParentModules }  from '../api/parent.api';
import { connectSocket } from '../socket';

/**
 * The signed-in user's effective module access.
 *
 * GET /{role}/modules already returns EFFECTIVE access — the per-module boolean
 * is the school's flag AND the user's designation permission — so `isEnabled`
 * covers both layers of the hierarchy. `permissions` and `isAdmin` expose the
 * level itself, which is what promotes a teacher into a module's admin surface.
 *
 * Shared through context because both the sidebar and the route guards need
 * the same answer, and neither should fetch it for itself.
 *
 * A null map fails open, so NOT loading it is the same as enabling everything.
 * That makes the two rules below load-bearing rather than defensive:
 *   • refetch when the first-login gate lifts (see `firstLogin`), and
 *   • retry a failed fetch instead of leaving the session permanently open.
 *
 * ── It is not fetched once ──────────────────────────────────────────────────
 * It used to be: one fetch when the session started, kept until the page was
 * reloaded. But most of what the map says is decided by somebody else, later —
 * the office makes a teacher class teacher (My Section), enrols a child on a
 * bus (Transport), gives a member of staff a bed (My Hostel), grants a
 * designation, switches a module on. The server answered correctly from that
 * moment; the open session went on showing the old menu and its guards went on
 * refusing, and the 403 page told people to "sign out and back in". A teacher
 * who had just been given a class could not see My Section.
 *
 * So the answer is kept fresh, quietly — the screen never goes back to a
 * spinner for it, and nothing re-renders unless the answer actually changed:
 *   • the server says so: `access:changed` on the socket (services/accessChanged
 *     on the backend), which is immediate;
 *   • the tab or the window comes back to the front;
 *   • another page is opened;
 *   • a tab left open on one page, every few minutes;
 *   • and a guard that is about to refuse asks first (`useGate` below), so a
 *     "no" on screen is never an old one.
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

// How old the answer may be before each kind of look at the screen asks again.
// These only keep the MENU in step when the socket nudge is missed; a guard
// never refuses on an old answer whatever they are set to. Kept wide on
// purpose — with thousands of people signed in, every second shaved here is a
// request each of them makes for nothing.
const FRESH_ON_RETURN = 30 * 1000;        // back to the tab or the window
const FRESH_ON_MOVE   = 2 * 60 * 1000;    // another page opened
const FRESH_IDLE      = 10 * 60 * 1000;   // a tab left open on one page
const FRESH_FOR_GATE  = 3 * 1000;         // a guard about to refuse
const IDLE_TICK       = 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The payload is a small plain object; comparing its text is exact and cheap. */
const sameMap = (a, b) => a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));

export const ModulesProvider = ({ children }) => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [modules, setModules] = useState(null);
  // Which identity the current answer belongs to (see `ready` below).
  const [readyFor, setReadyFor] = useState(null);
  // Identifies the in-flight load, so a superseded one cannot land late and
  // overwrite the current user's access with the previous user's.
  const runRef = useRef(0);
  // The answer in force and when it was fetched, for the quiet re-asks: they
  // must not depend on a render having happened.
  const modulesRef = useRef(null);
  const fetchedAt  = useRef(0);
  const refreshing = useRef(null);      // the re-ask in flight, shared by everyone who wants one
  const loading    = useRef(false);     // the first ask for this identity is still out

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
  const identity   = `${role || ''}|${userId}|${firstLogin}`;

  // `ready` means "answered for THIS user", not "some load finished". It used to
  // be a flag the effect reset — but effects run after render, so on the render
  // where the signed-in user first arrives it still said true from the
  // signed-out pass while `modules` was null. A guard that fails closed
  // (MySectionGuard; AdminAreaGuard for a teacher) redirected on that one render
  // and bounced people out of pages they may open. Deriving it from the
  // identity makes that render not-ready.
  const ready = readyFor === identity;

  /** Put an answer in force. Leaves state alone when nothing in it changed. */
  const accept = useCallback((next) => {
    fetchedAt.current = Date.now();
    if (sameMap(modulesRef.current, next)) return modulesRef.current;
    modulesRef.current = next;
    setModules(next);
    return next;
  }, []);

  const load = useCallback(async () => {
    const run = ++runRef.current;
    const current = () => run === runRef.current;
    const settle = () => { loading.current = false; setReadyFor(identity); };
    loading.current = true;

    const fetcher = FETCHER[role];
    // No role to fetch for, or the account still has to set its password — in
    // both cases there is nothing to ask the server for yet.
    if (!fetcher || firstLogin) {
      modulesRef.current = null; fetchedAt.current = 0;
      setModules(null); settle();
      return;
    }

    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetcher();
        if (!current()) return;
        modulesRef.current = null;      // a new identity never keeps the last one's answer
        accept(res?.data ?? res);
        settle();
        return;
      } catch (err) {
        // 401/403 are answers, not blips: retrying cannot change them. Anything
        // else (network, timeout, a backend restart) is worth another attempt.
        const status = err?.status;
        const retryable = status !== 401 && status !== 403 && attempt < RETRY_DELAYS.length;
        if (!current()) return;
        if (!retryable) { settle(); return; }
        await sleep(RETRY_DELAYS[attempt]);
        if (!current()) return;
      }
    }
  }, [role, userId, firstLogin, identity, accept]);

  useEffect(() => { load(); }, [load]);

  /**
   * Ask again without taking the screen away.
   *
   * Resolves with the map now in force — the new one, or the one already held
   * when the answer is younger than `maxAge` or the request failed (a failed
   * re-ask never costs the session the answer it has). One request serves
   * every caller that asks while it is in flight.
   */
  const refresh = useCallback((maxAge = 0) => {
    const fetcher = FETCHER[role];
    if (!fetcher || firstLogin) return Promise.resolve(null);
    // The first ask is still out — it IS the fresh answer; a second one beside
    // it would only be the same request twice.
    if (loading.current) return Promise.resolve(modulesRef.current);
    // "Young enough" only counts for an age that makes sense: a clock set back
    // would otherwise make the answer look fresh until it caught up.
    const age = Date.now() - fetchedAt.current;
    if (maxAge > 0 && age >= 0 && age < maxAge) return Promise.resolve(modulesRef.current);
    if (refreshing.current) return refreshing.current;

    const run = runRef.current;
    const ask = (async () => {
      try {
        const res = await fetcher();
        if (run !== runRef.current) return modulesRef.current;      // someone else signed in meanwhile
        const next = accept(res?.data ?? res);
        setReadyFor(identity);      // the first load may have given up; this one answered
        return next;
      } catch {
        return modulesRef.current;
      } finally {
        refreshing.current = null;
      }
    })();
    refreshing.current = ask;
    return ask;
  }, [role, firstLogin, identity, accept]);

  // Back to the tab, back to the window, back online: the moments a change made
  // somewhere else is about to be looked for. And a slow tick for the tab that
  // is simply left open.
  useEffect(() => {
    if (!role || firstLogin) return undefined;
    const look = () => { if (!document.hidden) refresh(FRESH_ON_RETURN); };
    document.addEventListener('visibilitychange', look);
    window.addEventListener('focus', look);
    window.addEventListener('online', look);
    const tick = setInterval(() => { if (!document.hidden) refresh(FRESH_IDLE); }, IDLE_TICK);
    return () => {
      document.removeEventListener('visibilitychange', look);
      window.removeEventListener('focus', look);
      window.removeEventListener('online', look);
      clearInterval(tick);
    };
  }, [role, firstLogin, refresh]);

  // Opening another page.
  useEffect(() => { refresh(FRESH_ON_MOVE); }, [pathname, refresh]);

  // The server saying so. The event is only a nudge — what it changes is read
  // back from /modules like any other answer. A named handler, because the
  // header takes its own listeners off this same socket by event name.
  useEffect(() => {
    if (!role || firstLogin) return undefined;
    const sock = connectSocket();
    if (!sock) return undefined;
    const onChanged = () => { refresh(0); };
    sock.on('access:changed', onChanged);
    return () => { sock.off('access:changed', onChanged); };
  }, [identity, role, firstLogin, refresh]);

  /** A guard about to refuse: the freshest answer, without asking twice in a row. */
  const recheck   = useCallback(() => refresh(FRESH_FOR_GATE), [refresh]);
  // Answered, for someone there IS a map for, and there is none: the server
  // could not be asked. Not the same thing as being told no.
  const failed    = ready && !modules && !!FETCHER[role] && !firstLogin;

  // One object for as long as the answer is the same. This provider now
  // follows the address bar (to re-ask when a page is opened), and a new value
  // on every navigation would re-render everything that reads the map.
  const value = useMemo(() => {
    /** true when the user has at least normal access; fails open while loading. */
    const isEnabled = (key) => !key || !modules || modules[key] === true;
    /** true only when the user's designation grants administrative access. */
    const isAdmin   = (key) => !!modules?.moduleAdmin?.[key];
    /** 'admin' | 'user' | 'none' */
    const levelOf   = (key) => modules?.permissions?.[key] || (isEnabled(key) ? 'user' : 'none');
    return { modules, ready, failed, isEnabled, isAdmin, levelOf, reload: load, refresh, recheck };
  }, [modules, ready, failed, load, refresh, recheck]);

  return (
    <ModulesContext.Provider value={value}>
      {children}
    </ModulesContext.Provider>
  );
};

export const useModules = () => {
  const ctx = useContext(ModulesContext);
  if (!ctx) throw new Error('useModules must be used inside ModulesProvider');
  return ctx;
};

/**
 * For a guard that is about to refuse: ask the server first.
 *
 * The map is only as fresh as its last fetch, and what it holds changes while a
 * person is signed in. A guard that refuses on the old answer turns "the office
 * gave you a class a minute ago" into a 403 page. So a no is confirmed with the
 * server once per visit before it is shown. A yes is taken as it stands — the
 * page's own endpoints refuse whoever should not be there, and the map catches
 * up on its own.
 *
 *   const { pending } = useGate(allowed, 'my-section');
 *   if (pending)  return <Spinner />;
 *   if (!allowed) return <Forbidden … />;
 *
 * `subject` names what is being asked about, for a guard that outlives one page
 * (ModuleRouteGuard sits above every route): a refusal confirmed for one module
 * says nothing about the next.
 */
export function useGate(allowed, subject = '') {
  const { ready, recheck } = useModules();
  const [confirmed, setConfirmed] = useState(null);   // the subject a refusal was confirmed for

  useEffect(() => {
    if (!ready || allowed || confirmed === subject) return undefined;
    let live = true;
    recheck().finally(() => { if (live) setConfirmed(subject); });
    return () => { live = false; };
  }, [ready, allowed, confirmed, subject, recheck]);

  return { pending: !ready || (!allowed && confirmed !== subject) };
}
