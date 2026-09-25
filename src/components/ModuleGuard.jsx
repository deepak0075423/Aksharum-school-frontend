import React from 'react';
import { useModules } from '../contexts/ModulesContext';
import { Spinner } from './ui/index';
import { Forbidden } from '../pages/errors/ErrorPage';

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
 *
 * It used to redirect to '/'. Being bounced to the dashboard says nothing about
 * WHY, so a switched-off module, a designation that does not grant one, and a
 * dead link were all the same non-event. It now says which.
 */
export default function ModuleGuard({ module, children, label }) {
  const { isEnabled, levelOf, modules, ready } = useModules();

  if (!ready) {
    return <div className="loading-page"><Spinner /></div>;
  }
  if (!isEnabled(module)) {
    // Two different refusals wear the same 403: the SCHOOL does not have the
    // module, or it does and this person's designation does not reach it.
    const schoolHasIt = modules?.schoolModules?.[module];
    return (
      <Forbidden reason={schoolHasIt ? 'designation' : 'module_disabled'}
                 what={label || module}
                 detail={schoolHasIt ? `your designation grants "${levelOf(module)}"` : undefined} />
    );
  }
  return children;
}
