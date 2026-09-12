import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

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
 * still fetching — so it keeps watching until it appears. Mounted once in
 * AppLayout; no page has to opt in.
 *
 * When the row never arrives it says so. It used to give up in silence, which
 * made three quite different faults look identical from the outside: a
 * notification that never recorded which record it was about, a page whose rows
 * carry no `data-focus-id`, and a record sitting on page 4 behind a filter.
 * Only the third is the reader's to solve, and they can only solve it if they
 * are told. A notification that named no record never gets here at all — there
 * is no `?focus=` to act on — so this only fires when something was named and
 * could not be found.
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

    // Every row that can be flagged, and the ids it answers to. A row may answer
    // to more than one — a payslip row to both itself and the payroll run it
    // came from, a result row to its exam — so the attribute holds a
    // space-separated list and the notification names whichever record it is
    // about.
    const marked = () => [...document.querySelectorAll('[data-focus-id]')];

    const look = () => {
      if (done) return true;
      // Compared as plain strings rather than through an attribute selector.
      // `[data-focus-id~="…"]` needs the id escaped for CSS, and CSS.escape is
      // built for identifiers, not for the inside of a quoted string: on a UUID
      // beginning with a digit — better than half of them — it emits `\33 2761…`,
      // whose meaning then depends on the parser resolving that escape back
      // before the `~=` whitespace rule is applied. Nothing here needs to be a
      // selector, so none of that has to be got right.
      const el = marked().find((node) =>
        (node.getAttribute('data-focus-id') || '').split(/\s+/).includes(focusId));
      if (el) { flash(el); return true; }
      return false;
    };

    if (look()) return () => timers.forEach(clearTimeout);

    // The list is still loading. Watch the tree rather than polling, so the row
    // is flagged the moment it renders.
    const observer = new MutationObserver(() => { if (look()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    timers.push(setTimeout(() => {
      observer.disconnect();
      if (done) return;

      // Say what was actually on the page. Three faults look identical from the
      // outside — the notification recorded no record, the page marks no rows,
      // or the record is behind a filter — and only the last is the reader's to
      // solve. The console line carries the ids so a report of "it didn't
      // highlight" can be answered without guessing at it.
      const rows = marked();
      const ids  = rows.map((n) => n.getAttribute('data-focus-id'));
      console.warn(
        `[focus] no row for ${focusId} on ${location.pathname}. `
        + `${rows.length} row(s) on this page can be highlighted.`,
        ids.slice(0, 40),
      );
      toast(rows.length
        ? `This page is open, but the item that notification was about is not among the `
          + `${rows.length} shown — try clearing the filters or looking on another page.`
        : 'This page is open, but it cannot point at the individual item that '
          + 'notification was about.',
        { icon: 'ℹ️', duration: 6000 });
    }, WAIT_MS));

    return () => { observer.disconnect(); timers.forEach(clearTimeout); };
  }, [location.search, location.pathname, navigate]);
}
