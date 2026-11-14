/**
 * Any table, as cards on a phone — so it never scrolls sideways.
 *
 * Desktop: the table untouched. Phone (≤640px, CSS in global.css under
 * "PhoneCards"): each row becomes a card — the `title` column as its heading,
 * `side` (usually Status) beside it, the `keep` columns as label/value lines,
 * and the row's actions cell (`.ltable__acts` / `.lvt-acts`) along the bottom,
 * whose eye opens the full record. Every other column is left to that eye.
 *
 * Labels are read from the table's own head (rowSpan / colSpan walked; a
 * heading's <small> sub-line ignored), so a table only names the columns it
 * wants on the card. The Leave module's PhoneTable is the same idea with its
 * own styling.
 */
import React, { useLayoutEffect, useRef } from 'react';

function columnLabels(thead) {
  const grid = [];
  [...(thead?.rows || [])].forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    for (const th of tr.cells) {
      while (grid[r][c] !== undefined) c += 1;
      const head = th.cloneNode(true);
      head.querySelectorAll('small, input').forEach((x) => x.remove());
      const text = (th.dataset.label || head.textContent || '').trim();
      for (let i = 0; i < (th.rowSpan || 1); i += 1) {
        grid[r + i] = grid[r + i] || [];
        for (let j = 0; j < (th.colSpan || 1); j += 1) grid[r + i][c + j] = text;
      }
      c += th.colSpan || 1;
    }
  });
  return grid[grid.length - 1] || [];
}

export default function PhoneCards({ title, side, keep = [], children, className = '' }) {
  const ref = useRef(null);
  const spec = `${title}|${side}|${keep.join('|')}`;
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const mark = () => {
      const table = root.querySelector('table');
      if (!table) return;
      const labels = columnLabels(table.tHead);
      for (const body of table.tBodies) {
        for (const tr of body.rows) {
          let c = 0;
          for (const td of tr.cells) {
            const label = labels[c] || '';
            if (td.dataset.label !== label) td.dataset.label = label;
            td.classList.toggle('phc-title', label === title);
            td.classList.toggle('phc-side', !!side && label === side);
            td.classList.toggle('phc-keep', keep.includes(label));
            c += td.colSpan || 1;
          }
        }
      }
    };
    mark();
    const watch = new MutationObserver(mark);
    watch.observe(root, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [spec]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className={`phc ${className}`.trim()}>{children}</div>;
}
