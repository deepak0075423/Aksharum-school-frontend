/**
 * The parent's child switch — one design on every parent page.
 *
 * A parent can have more than one child, and what the school has to say about
 * each is different: their class, their library, their holidays, the notices
 * about them. So those pages are told one child at a time, and they pick the
 * child with this — the same card with the same initial, name and class line
 * whether the page is Library, Class, Holidays or Notifications.
 *
 * The choice lives in the URL (`?child=`) rather than in component state, so
 * moving between pages or tabs keeps the same child on screen instead of
 * snapping back to the first one.
 */
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../ui/icons';

export const initials = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

/** "Class 1 — Section A", and something sensible when either half is missing. */
export const whereOf = (c) => [
  c?.className,
  c?.sectionName ? `Section ${c.sectionName}` : '',
].filter(Boolean).join(' — ') || 'No class yet';

/**
 * Picks the child on screen from `?child=`, falling back to the first. Returns
 * the selected child and a `pick(id)` that writes the choice back to the URL.
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

/**
 * @param children  [{ _id, name, className, sectionName }]
 * @param child     the selected one
 * @param onPick    (id) => void
 * @param label     what the switch chooses, for screen readers ("Whose library")
 * @param badge     optional (child) => node, drawn at the end of each card —
 *                  the library's outstanding fine, for instance
 */
export function ChildSwitch({ children, child, onPick, label = 'Choose a child', badge }) {
  if (!children.length) return null;

  /* One child needs no switch — the card just says whose page this is. */
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
    <nav className="scls-kids" role="tablist" aria-label={label}>
      {children.map((c) => {
        const on = String(c._id) === String(child?._id);
        return (
          <button key={c._id} type="button" role="tab" aria-selected={on}
            className={on ? 'is-on' : ''} onClick={() => onPick(c._id)}>
            <span className="scls-av scls-t--indigo">{initials(c.name)}</span>
            <span className="scls-kids__body">
              <strong>{c.name}</strong>
              <em>{whereOf(c)}</em>
            </span>
            {badge ? badge(c) : null}
          </button>
        );
      })}
    </nav>
  );
}
