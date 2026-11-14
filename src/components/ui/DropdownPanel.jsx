import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A suggestion list anchored under a field, rendered into <body>.
 *
 * Portalled on purpose. `.modal-body` is a scroll container (`overflow-y: auto`),
 * and a scroll container clips absolutely positioned children — in a short modal
 * the list was cut off mid-row with nowhere to scroll to. Positioning from the
 * anchor's bounding rect instead escapes the clip entirely, and the z-index sits
 * above the modal overlay so it is never painted behind the dialog.
 *
 * Anything inside carries `data-dropdown-panel`, so a click-away handler can
 * tell "clicked the list" from "clicked outside" even though the list is no
 * longer a DOM descendant of the field.
 */
export default function DropdownPanel({ anchorRef, open, children, maxHeight = 260, minWidth = 0 }) {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    if (!open) { setRect(null); return; }

    const measure = () => {
      const el = anchorRef.current;
      if (el) setRect(el.getBoundingClientRect());
    };
    measure();

    // The anchor moves when the modal body scrolls or the window resizes.
    // Capture phase, so scrolling in any ancestor is caught too.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, anchorRef]);

  if (!open || !rect) return null;

  // Open upwards when the space below is too tight to be useful.
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const flip = spaceBelow < 160 && spaceAbove > spaceBelow;

  // At least `minWidth` wide (a narrow trigger — "All time" — must not squeeze
  // what is inside), never wider than the screen, and kept on screen: it opens
  // under the trigger, shifted left where it would run off the right edge.
  const vw = window.innerWidth;
  const width = Math.min(Math.max(rect.width, minWidth), vw - 16);
  const left = Math.max(8, Math.min(rect.left, vw - width - 8));

  return createPortal(
    <div
      data-dropdown-panel=""
      style={{
        position: 'fixed',
        left,
        width,
        zIndex: 1100,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        maxHeight: Math.max(120, Math.min(maxHeight, (flip ? spaceAbove : spaceBelow) - 12)),
        overflowY: 'auto',
        overflowX: 'hidden',
        ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** True when `target` sits inside `container` or inside any portalled panel. */
export const isInsideDropdown = (target, container) =>
  (container && container.contains(target)) || !!target?.closest?.('[data-dropdown-panel]');
