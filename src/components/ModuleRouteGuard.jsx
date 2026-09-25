/**
 * Every page belongs to a module, and a switched-off module has no pages.
 *
 * ModuleGuard, its sibling, gates ONE route at a time and was wired to exactly
 * one — /chat. Everywhere else, opening a page for a module the school does not
 * have simply drew the screen and let each of its requests 403 in turn: an
 * empty dashboard, a table stuck loading, and a stack of toasts. The page was
 * never the answer; it just never said so.
 *
 * The map of page → module is not written again here. navTree.js already
 * declares it for every entry in every role's rail, because the rail has to
 * hide the same things — so this reads the trees and cannot drift from them.
 *
 * It renders INSIDE AppLayout, so a refusal keeps the sidebar: being told no is
 * not a reason to lose your way back.
 */
import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useModules } from '../contexts/ModulesContext';
import { Forbidden } from '../pages/errors/ErrorPage';
import { Spinner } from './ui/index';
import { SUPER_ADMIN_NAV, ADMIN_NAV, TEACHER_NAV, STUDENT_NAV, PARENT_NAV } from './layout/navTree';
import { MODULES } from '../utils/modules';

const LABEL = Object.fromEntries(MODULES.map((m) => [m.key, m.label]));

/** Every { prefix, module } the rails declare, longest prefix first. */
function buildIndex() {
  const out = [];
  const walk = (rows) => (rows || []).forEach((r) => {
    if (r.module && (r.match || r.to)) out.push({ prefix: r.match || r.to, module: r.module });
    // A child inherits its parent's module unless it names its own.
    if (r.children) (r.children || []).forEach((c) => {
      if (c.to) out.push({ prefix: c.to, module: c.module || r.module });
    });
  });
  [SUPER_ADMIN_NAV, ADMIN_NAV, TEACHER_NAV, STUDENT_NAV, PARENT_NAV].forEach(walk);
  // Longest first, so /admin/transport wins over a shorter prefix that also matches.
  return out.filter((x) => x.module).sort((a, b) => b.prefix.length - a.prefix.length);
}

export function moduleForPath(pathname, index = buildIndex()) {
  const hit = index.find((x) => pathname === x.prefix || pathname.startsWith(`${x.prefix}/`));
  return hit ? hit.module : null;
}

export default function ModuleRouteGuard({ children }) {
  const { pathname } = useLocation();
  const { isEnabled, levelOf, modules, ready } = useModules();
  const index = useMemo(buildIndex, []);
  const key = useMemo(() => moduleForPath(pathname, index), [pathname, index]);

  // Not a module page — dashboards, profile, People, Academics, Settings.
  if (!key) return children;
  // `isEnabled` answers true for a map that has not landed, so waiting is the
  // only honest option: bouncing now would throw people out of modules they do
  // have. See ModulesContext for the fail-open and why it is deliberate.
  if (!ready) return <div className="loading-page"><Spinner /></div>;
  if (isEnabled(key)) return children;

  // Two refusals wear the same 403 and mean quite different things to the
  // reader: the SCHOOL does not have the module, or it does and their
  // designation does not reach it. Only the first is worth the admin's time.
  const schoolHasIt = modules?.schoolModules?.[key];
  return (
    <Forbidden reason={schoolHasIt ? 'designation' : 'module_disabled'}
               what={LABEL[key] || key}
               detail={schoolHasIt ? `your designation grants "${levelOf(key)}"` : undefined} />
  );
}
