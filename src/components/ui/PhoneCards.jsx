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
import { gridColumns } from '../../hooks/useCardPaging';

function columnLabels(thead) {
  const grid = [];
  [...(thead?.rows || [])].forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    for (const th of tr.cells) {
      while (grid[r][c] !== undefined) c += 1;
      const head = th.cloneNode(true);
      // A heading's sub-line, its tick box and its ⓘ hint (`.lhead__hint`, a
      // literal "i") are not part of its name.
      head.querySelectorAll('small, input, .lhead__hint').forEach((x) => x.remove());
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

const PHONE = '(max-width: 640px)';

/**
 * `fit`: never scroll sideways at any width (Nov 27 2026, the library). The
 * table is measured against its box whenever either changes size or the rows
 * change: if it does not fit, its cells close up (`data-tight`); if it still
 * does not fit, it is drawn as cards (`data-fitcards`, the Card view's look).
 * Attributes rather than classes, because React rewrites `className`. On a
 * phone the CSS above already draws cards, so nothing is measured there.
 */
function useFit(ref, on, onFit) {
  // `onFit(cards)`: told whenever the measured answer flips, so the page can
  // offer card page sizes while the table is being drawn as cards.
  const tell = useRef(onFit);
  tell.current = onFit;
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !on) return undefined;
    let busy = false;
    let last = null;
    const report = (cards) => { if (cards !== last) { last = cards; tell.current?.(cards); } };
    const fits = () => {
      const table = root.querySelector('table');
      const wrap = table?.parentElement;
      if (!table || !wrap) return true;
      // The box's own overflow — it counts the box's padding round the table
      // as well as the table itself.
      return wrap.scrollWidth <= wrap.clientWidth + 1 && table.scrollWidth <= wrap.clientWidth + 1;
    };
    const fit = () => {
      if (busy) return;
      busy = true;
      try {
        const phone = window.matchMedia?.(PHONE).matches;
        root.removeAttribute('data-tight');
        root.removeAttribute('data-fitcards');
        if (phone || fits()) { report(false); return; }
        root.setAttribute('data-tight', '');
        if (fits()) { report(false); return; }
        root.removeAttribute('data-tight');
        root.setAttribute('data-fitcards', '');
        report(true);
      } finally { busy = false; }
    };
    fit();
    // Rows arriving (a page, a filter) — not the attributes set above.
    const watch = new MutationObserver(fit);
    watch.observe(root, { childList: true, subtree: true });
    // The box changing width (window, sidebar). Its height changes when the
    // layout flips, which re-measures to the same answer.
    let lastWidth = root.clientWidth;
    const size = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (root.clientWidth !== lastWidth) { lastWidth = root.clientWidth; fit(); }
    }) : null;
    size?.observe(root);
    return () => {
      watch.disconnect(); size?.disconnect();
      // Switched off (the Card view chosen): leave nothing measured behind.
      root.removeAttribute('data-tight');
      root.removeAttribute('data-fitcards');
      tell.current?.(false);
    };
  }, [on]);   // eslint-disable-line react-hooks/exhaustive-deps
}

export default function PhoneCards({ title, side, keep = [], children, className = '', cards = false, onColumns, fit = false, onFit }) {
  const ref = useRef(null);
  useFit(ref, fit && !cards, onFit);
  const spec = `${title}|${side}|${keep.join('|')}`;
  // `onColumns(n)`: how many cards a row holds in the Card view, kept current
  // as the page resizes — so the page size can be a whole number of rows
  // (hooks/useCardPaging). Not reported while there are no rows to measure.
  const report = useRef(onColumns);
  report.current = onColumns;
  useLayoutEffect(() => {
    const root = ref.current;
    // Measured in the Card view, and wherever `fit` may turn the rows into
    // cards (a table reports 1, which no card size is built from).
    if (!root || !(cards || fit)) return undefined;
    const measure = () => {
      const body = root.querySelector('table > tbody');
      if (body && body.rows.length) report.current?.(gridColumns(body));
    };
    measure();
    const watch = new MutationObserver(measure);
    watch.observe(root, { childList: true, subtree: true });
    const size = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    size?.observe(root);
    return () => { watch.disconnect(); size?.disconnect(); };
  }, [cards, fit]);
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
            // A plain table's actions cell (no .ltable__acts) still goes at
            // the bottom of its card.
            td.classList.toggle('phc-acts', /^actions?$/i.test(label));
            // A line with nothing to say ("—") is left off the card.
            td.classList.toggle('phc-empty', /^[\s—–-]*$/.test(td.textContent || '') && !td.querySelector('input, button, img, svg'));
            c += td.colSpan || 1;
          }
        }
      }
    };
    mark();
    const watch = new MutationObserver(mark);
    // characterData too: a cell whose text changes in place (a dash becoming
    // an amount) is re-judged for `phc-empty`. mark() only touches classes and
    // data attributes, so it never wakes itself.
    watch.observe(root, { childList: true, subtree: true, characterData: true });
    return () => watch.disconnect();
  }, [spec]);   // eslint-disable-line react-hooks/exhaustive-deps
  // `cards`: the card layout at every width (a page's Card view), laid out
  // several across on a wide screen. Without it the cards are a phone-only view.
  return <div ref={ref} className={`phc${cards ? ' phc--cards' : ''} ${className}`.trim()}>{children}</div>;
}
