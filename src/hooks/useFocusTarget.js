import { useCallback, useEffect, useState } from 'react';

/**
 * The record a paginated list was asked to show, and where it lives.
 *
 * A notification links to a list with `?focus=<id>`, but the record is often
 * not on page 1 — so the list opens, nothing is highlighted, and the person is
 * left paging around. Passing `focus` to the list API makes the server answer
 * with the page that actually holds it (see school-backend/utils/focusPage.js).
 *
 * Two details this exists to get right:
 *
 *  • The id is read ONCE, at mount. useFocusHighlight strips `?focus=` from the
 *    URL the moment it has flashed the row; a list that kept reading the URL
 *    would refetch at that instant and pull the highlighted row out from under
 *    itself.
 *  • It is dropped as soon as the person touches a filter or a page button.
 *    From then on the list is theirs, not the notification's.
 */
export default function useFocusTarget() {
  const [focusId, setFocusId] = useState(
    () => new URLSearchParams(window.location.search).get('focus') || null,
  );

  /** Wrap any filter/page setter so interacting with the list releases it. */
  const release = useCallback(() => setFocusId(null), []);

  return { focusId, release };
}

/**
 * Follow-up for a record the server could not place: it exists, but the
 * filters in force hide it. Clearing them is what the person meant by
 * following the notification.
 *
 * `focusFound === false` only ever comes back when a focus id was sent, so a
 * normal browse never triggers this.
 */
export function useFocusFilterReset(response, focusId, clearFilters) {
  useEffect(() => {
    if (!focusId || !response) return;
    if (response.focusFound === false) clearFilters();
  }, [response, focusId, clearFilters]);
}
