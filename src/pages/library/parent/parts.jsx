/**
 * The parent library's shared pieces.
 *
 * A parent can have more than one child and their borrowing is nothing alike,
 * so both tabs are told per child. The choice lives in the URL (`?child=`)
 * rather than in component state, so moving between Books and Fines keeps the
 * same child on screen instead of snapping back to the first one.
 */
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../../components/ui/icons';

export const initials = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

/** "Class 1 — Section A", and something sensible when either half is missing. */
export const whereOf = (c) => [
  c?.className,
  c?.sectionName ? `Section ${c.sectionName}` : '',
].filter(Boolean).join(' — ') || 'No class yet';

/**
 * Picks the child on screen. Returns the selected child and the switch to
 * render above the page.
 */
export function useChild(children) {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('child') || '';

  const child = useMemo(
    () => children.find((c) => String(c._id) === wanted) || children[0] || null,
    [children, wanted],
  );

  const pick = (id) => {
    const next = new URLSearchParams(params);
    next.set('child', String(id));
    setParams(next, { replace: true });
  };

  return { child, pick };
}

export function ChildSwitch({ children, child, onPick }) {
  if (!children.length) return null;

  /* One child needs no switch; two or more do, because their loans differ. */
  if (children.length === 1) {
    return (
      <p className="scls-onekid">
        <Icon name="user" size={14} />
        {children[0].name}
        {children[0].className ? ` · ${whereOf(children[0])}` : ''}
      </p>
    );
  }

  return (
    <nav className="scls-kids" role="tablist" aria-label="Whose library">
      {children.map((c) => {
        const owed = c.stats?.finesOutstanding || 0;
        return (
          <button key={c._id} type="button" role="tab" aria-selected={c._id === child?._id}
            className={c._id === child?._id ? 'is-on' : ''} onClick={() => onPick(c._id)}>
            <span className="scls-av scls-t--indigo">{initials(c.name)}</span>
            <span className="scls-kids__body">
              <strong>{c.name}</strong>
              <em>{whereOf(c)}</em>
            </span>
            {/* Money owed follows the child, not the page — a parent should not
                have to open each tab to find which one has a fine standing. */}
            {owed > 0 && <span className="libpl-owed">₹{Number(owed).toLocaleString('en-IN')}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export const NoChildren = () => (
  <div className="alert alert-info">
    No child is linked to this account yet, so there is no library activity to show.
    Ask the school office to link your children.
  </div>
);
