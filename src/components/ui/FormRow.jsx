import React, { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Two form fields side by side, with their INPUTS on one line.
 *
 * In a narrow column (a phone) one label wraps — "Secondary Phone Number"
 * takes two lines beside a one-line "Mobile Number" — and in a plain grid its
 * input then sits lower than its neighbour's. Here every label in the row is
 * given the height of the tallest one, so the boxes always line up. Measuring
 * the labels (rather than stretching them with CSS) keeps the inputs aligned
 * even when an error or hint appears under just one of them.
 *
 * Each direct child is expected to be a `.form-group` whose label is a direct
 * `.form-label` child; anything else is simply left alone.
 */
export default function FormRow({ children, className = '' }) {
  const ref = useRef(null);

  const align = () => {
    const row = ref.current;
    if (!row) return;
    const cells = [...row.children]
      .map((g) => ({ g, l: g.querySelector(':scope > .form-label') }))
      .filter((c) => c.l);
    cells.forEach(({ l }) => { l.style.minHeight = ''; });
    // Fields on the same visual line are evened out together — a row holding
    // four fields (PIN · City / State · Country) is two lines, each its own.
    const lines = new Map();
    cells.forEach((c) => {
      const top = Math.round(c.g.getBoundingClientRect().top);
      lines.set(top, [...(lines.get(top) || []), c]);
    });
    lines.forEach((line) => {
      if (line.length < 2) return;
      const tallest = Math.max(...line.map(({ l }) => l.getBoundingClientRect().height));
      line.forEach(({ l }) => { l.style.minHeight = `${tallest}px`; });
    });
  };

  // After every render: a field shown or hidden, a label that changed.
  useLayoutEffect(align);

  // And whenever the row's width changes — that is what makes a label wrap.
  useEffect(() => {
    const row = ref.current;
    if (!row || typeof ResizeObserver === 'undefined') return undefined;
    let width = row.getBoundingClientRect().width;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (Math.abs(w - width) < 0.5) return;
      width = w;
      align();
    });
    ro.observe(row);
    return () => ro.disconnect();
  }, []);

  return <div ref={ref} className={`frow2${className ? ` ${className}` : ''}`}>{children}</div>;
}
