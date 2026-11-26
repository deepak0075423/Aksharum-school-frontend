/**
 * List or Card, for every library table (Nov 27 2026).
 *
 *   • A laptop offers both, as two icons at the end of the table's own row of
 *     controls, and every visit opens on List.
 *   • A phone shows cards only and offers no switch.
 *   • List never scrolls sideways: a table too wide for its box closes up and
 *     then turns into cards by itself (<PhoneCards fit>).
 *   • Whenever rows are cards — chosen, measured or on a phone — a page is a
 *     whole number of rows (hooks/useCardPaging), so `sizes` goes to the
 *     table's ListFooter and `pageOf(n)` rounds a fixed page size.
 *
 * Usage:
 *   const view = useLibView();
 *   <ViewToggle view={view} />                 at the end of the row
 *   <PhoneCards {...view.phc} title=… keep=…>   around the table
 *   <ListFooter sizes={view.sizes} … />
 */
import React, { useState } from 'react';
import Icon from '../../components/ui/icons';
import usePhone from '../../hooks/usePhone';
import useCardPaging, { cardPageSizes, nearestSize } from '../../hooks/useCardPaging';

export function useLibView() {
  const phone = usePhone();
  const [layout, setLayout] = useState('list');
  const [fitCards, setFitCards] = useState(false);
  const cards = phone || layout === 'card' || fitCards;
  const paging = useCardPaging({ cards });
  return {
    layout, setLayout, phone, cards,
    sizes: paging.sizes,
    /** A fixed page size (no size picker) rounded to whole rows of cards. */
    pageOf: (n) => (cards && paging.perRow ? nearestSize(cardPageSizes(paging.perRow), n) : n),
    /** Spread onto <PhoneCards>. */
    phc: {
      cards: !phone && layout === 'card',
      fit: true,
      onFit: setFitCards,
      onColumns: paging.onColumns,
    },
    /** For a hand-made card grid (Search Books): measure it with this ref. */
    gridRef: paging.gridRef,
  };
}

/** The two icons. Nothing on a phone — cards are all a phone gets. */
export function ViewToggle({ view, className = '' }) {
  if (view.phone) return null;
  const pick = (v) => () => view.setLayout(v);
  return (
    <div className={`libview ${className}`.trim()} role="group" aria-label="Layout">
      <button type="button" className={view.layout === 'list' ? 'is-on' : ''} aria-pressed={view.layout === 'list'}
        aria-label="List view" title="List view" onClick={pick('list')}>
        <Icon name="menu" size={16} />
      </button>
      <button type="button" className={view.layout === 'card' ? 'is-on' : ''} aria-pressed={view.layout === 'card'}
        aria-label="Card view" title="Card view" onClick={pick('card')}>
        <Icon name="grid" size={16} />
      </button>
    </div>
  );
}
