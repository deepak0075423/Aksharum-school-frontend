import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// How long the row stays flagged, and how long to keep waiting for it to exist.
const FLASH_MS = 4000;
const WAIT_MS  = 8000;

/**
 * Finds the record a notification was about and flags it.
 *
 * Following a notification usually lands on a list — the leave queue, the
 * regularization requests, the substitutions — where the row that prompted it
 * is one of twenty. The link carries `?focus=<id>`; this scrolls that row into
 * view and highlights it for a few seconds, so arriving actually answers the
 * question the notification raised.
 *
 * Rows announce themselves with `data-focus-id`; <Table> does it for every page
 * that uses it. The row usually does not exist yet when this runs — the list is
 * still fetching — so it keeps watching until it appears, and gives up quietly
 * after a few seconds when the record is on another page of a paginated list or
 * behind a filter. Mounted once in AppLayout; no page has to opt in.
 */
export default function useFocusHighlight() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const focusId = new URLSearchParams(location.search).get('focus');
    if (!focusId) return undefined;

    let done = false;
    const timers = [];

    const flash = (el) => {
      done = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('focus-flash');
      timers.push(setTimeout(() => el.classList.remove('focus-flash'), FLASH_MS));
      // Drop the parameter once it has been spent, so a refresh — or a click
      // back to this page — does not replay the highlight.
      const params = new URLSearchParams(location.search);
      params.delete('focus');
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    };

    const look = () => {
      if (done) return true;
      // `~=` matches one token of a space-separated list, so a row can answer to
      // more than one id — a payslip row to both itself and the payroll run it
      // came from, a result row to its exam. The notification names whichever
      // record it is about and the row still recognises itself.
      const el = document.querySelector(`[data-focus-id~="${CSS.escape(focusId)}"]`);
      if (el) { flash(el); return true; }
      return false;
    };

    if (look()) return () => timers.forEach(clearTimeout);

    // The list is still loading. Watch the tree rather than polling, so the row
    // is flagged the moment it renders.
    const observer = new MutationObserver(() => { if (look()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    timers.push(setTimeout(() => observer.disconnect(), WAIT_MS));

    return () => { observer.disconnect(); timers.forEach(clearTimeout); };
  }, [location.search, location.pathname, navigate]);
}
