/**
 * The parent library's shared pieces.
 *
 * A parent can have more than one child and their borrowing is nothing alike,
 * so both tabs are told per child. The choice lives in the URL (`?child=`)
 * rather than in component state, so moving between Books and Fines keeps the
 * same child on screen instead of snapping back to the first one.
 */
import React from 'react';
import { ChildSwitch as SharedSwitch } from '../../../components/parent/ChildSwitch';

// The switch itself is shared by every parent page; the library only adds the
// fine badge to it.
export { initials, whereOf, useChild } from '../../../components/parent/ChildSwitch';

export function ChildSwitch(props) {
  return (
    <SharedSwitch {...props} label="Whose library"
      // Money owed follows the child, not the page — a parent should not have
      // to open each tab to find which one has a fine standing.
      badge={(c) => {
        const owed = c.stats?.finesOutstanding || 0;
        return owed > 0 ? <span className="libpl-owed">₹{Number(owed).toLocaleString('en-IN')}</span> : null;
      }} />
  );
}

export const NoChildren = () => (
  <div className="alert alert-info">
    No child is linked to this account yet, so there is no library activity to show.
    Ask the school office to link your children.
  </div>
);
