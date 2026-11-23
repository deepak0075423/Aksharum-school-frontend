/**
 * How many rows a page holds, when the rows are drawn as cards (Nov 23 2026).
 *
 * A page of cards should end on a full row: with three cards across, 20 a page
 * left two cards alone on the last line. So in a card view the page sizes on
 * offer are multiples of the cards a row holds — 9 / 15 / 21 / 24 with three
 * across, 12 / 16 / 20 / 24 with four — and on a phone, one card a row, they
 * are 10 / 15 / 20 / 25. A table keeps the usual 5 / 10 / 15 / 20 / 25.
 *
 * When the choice on offer changes (the view is switched, the window is
 * resized), a page size that is no longer offered moves to the nearest one
 * that is — `useSnapLimit`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** A table's page sizes. */
export const LIST_SIZES = [5, 10, 15, 20, 25];
/** What a card view's sizes are rounded from — and a phone's own, one card a row. */
export const CARD_BASE = [10, 15, 20, 25];

/** Page sizes for a card grid `perRow` cards wide: each base size rounded to a whole number of rows. */
export function cardPageSizes(perRow, base = CARD_BASE) {
  const n = Math.max(1, Math.floor(Number(perRow) || 1));
  if (n === 1) return base;
  const out = [];
  for (const b of base) {
    const v = Math.max(n, Math.round(b / n) * n);
    if (!out.includes(v)) out.push(v);
  }
  while (out.length < base.length) out.push(out[out.length - 1] + n);
  return out;
}

/** The offered size closest to `value` (the larger one on a tie). */
export function nearestSize(sizes, value) {
  const v = Number(value) || 0;
  return sizes.reduce((best, s) => {
    const d = Math.abs(s - v);
    const b = Math.abs(best - v);
    return d < b || (d === b && s > best) ? s : best;
  }, sizes[0]);
}

/** How many tracks a CSS grid lays across — 1 for anything that is not a grid. */
export function gridColumns(el) {
  if (!el) return 1;
  const css = getComputedStyle(el);
  // Only a grid's tracks are resolved to pixels; anything else (a phone's
  // stacked cards are `display: block`) reports its template as written —
  // "repeat(auto-fill, minmax(290px, 1fr))" — which is no count of anything.
  if (!/grid/.test(css.display)) return 1;
  const t = css.gridTemplateColumns;
  if (!t || t === 'none' || /repeat\(/.test(t)) return 1;
  return t.trim().split(/\s+/).length || 1;
}

/** Move `limit` onto `sizes` when it is not one of them. */
export function useSnapLimit(sizes, limit, onLimit) {
  const set = useRef(onLimit);
  set.current = onLimit;
  const key = sizes ? sizes.join(',') : '';
  useEffect(() => {
    if (!sizes || !set.current || sizes.includes(Number(limit))) return;
    set.current(nearestSize(sizes, limit));
  }, [key, limit]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * For a page with a card view.
 *
 *   cards     whether the rows are being drawn as cards right now
 *   gridRef   a callback ref for the card grid itself (measured as it resizes)
 *   onColumns the same answer from something that measures for itself
 *             (PhoneCards' `onColumns`)
 *   sizes     the card sizes once a row has been measured; undefined while the
 *             rows are a table, so the footer keeps its own
 *
 * The measurement is kept while the grid is briefly gone (a spinner, an empty
 * filter) so the page size does not swing back and forth as it loads.
 */
export default function useCardPaging({ cards, base = CARD_BASE } = {}) {
  const [perRow, setPerRow] = useState(null);
  const ro = useRef(null);
  const gridRef = useCallback((el) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    const measure = () => setPerRow(gridColumns(el));
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      ro.current = new ResizeObserver(measure);
      ro.current.observe(el);
    }
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  const sizes = cards && perRow ? cardPageSizes(perRow, base) : undefined;
  return { perRow: cards ? perRow : null, sizes, gridRef, onColumns: setPerRow };
}
