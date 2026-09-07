import React from 'react';
import { Navigate } from 'react-router-dom';
import { useModules } from '../contexts/ModulesContext';
import { Spinner } from './ui/index';

/**
 * A route that only exists while its module does.
 *
 * The sidebar already hides a switched-off module, but hiding a link is not a
 * guard: typing the URL used to land straight on the screen. The server refuses
 * the data either way — this is what stops the empty, erroring page being drawn
 * around that refusal.
 *
 * `ready` is load-bearing. `isEnabled` fails open while the module map is
 * loading (a null map means "show everything"), so redirecting before it lands
 * would bounce people out of modules they do have.
 *
 * Sibling of AdminAreaGuard, which answers the different question of whether a
 * teacher may enter a module's ADMINISTRATIVE area.
 */
export default function ModuleGuard({ module, children, redirectTo = '/' }) {
  const { isEnabled, ready } = useModules();

  if (!ready) {
    return <div className="loading-page"><Spinner /></div>;
  }
  if (!isEnabled(module)) {
    return <Navigate to={redirectTo} replace />;
  }
  return children;
}
