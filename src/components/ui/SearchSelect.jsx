import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import DropdownPanel, { isInsideDropdown } from './DropdownPanel';

/**
 * A select box with a search field at the top of its list.
 *
 * Looks like a `select.form-control` while closed; opening it shows a search
 * box above the options and every keystroke narrows the list. Built for
 * pickers with many people in them (Assign Class Teacher / Vice Class Teacher),
 * where a native <select> means scrolling past every teacher in the school.
 *
 *   options    [{ value, label, sub?, search?, disabled? }] — `sub` is a muted
 *              second line and is searched too; `search` is more words the
 *              search matches without showing them (an email, an ID)
 *   renderOption  (row) => node — draws a row your own way (a person with
 *              their details); the closed box still shows `label`
 *   noneLabel  when given, a first row that clears the choice (value '')
 *
 * The list is portalled (DropdownPanel), so it is never clipped by a modal's
 * scrolling body. Keyboard: ↑/↓ move, Enter picks, Esc closes.
 */
export default function SearchSelect({
  value = '', onChange, options = [], placeholder = 'Select…', noneLabel,
  searchPlaceholder = 'Search…', error = false, id, disabled = false,
  emptyText = 'Nothing matches', renderOption, maxHeight = 320,
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi]       = useState(0);
  const boxRef    = useRef(null);
  const btnRef    = useRef(null);
  const searchRef = useRef(null);
  const listRef   = useRef(null);
  const autoId    = useId();
  const listId    = `${id || autoId}-list`;

  const picked = options.find((o) => String(o.value) === String(value));

  // The rows the list shows: the "none" row (only while nothing is typed —
  // searching for a person never means "nobody"), then whatever matches.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = !q ? options : options.filter((o) =>
      `${o.label} ${o.sub || ''} ${o.search || ''}`.toLowerCase().includes(q));
    return (noneLabel && !q ? [{ value: '', label: noneLabel, none: true }] : []).concat(hits);
  }, [options, query, noneLabel]);

  const firstEnabled = (from = 0, step = 1) => {
    for (let i = from; i >= 0 && i < rows.length; i += step) if (!rows[i].disabled) return i;
    return -1;
  };

  const show = () => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  // Opening highlights what is already chosen, so Enter keeps it.
  useEffect(() => {
    if (!open) return;
    const at = rows.findIndex((r) => String(r.value) === String(value) && !r.disabled);
    setHi(at >= 0 ? at : Math.max(0, firstEnabled()));
    // Focus after the portal has painted.
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A new search starts at the first row that can be picked.
  useEffect(() => { if (open) setHi(Math.max(0, firstEnabled())); /* eslint-disable-next-line */ }, [query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-row="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  // Clicking anywhere else closes it (the list lives in <body>, hence the helper).
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!isInsideDropdown(e.target, boxRef.current)) close(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const choose = (row) => {
    if (!row || row.disabled) return;
    onChange?.(row.value, row.none ? null : row);
    close();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const n = firstEnabled(hi + 1, 1);
      if (n >= 0) setHi(n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const n = firstEnabled(hi - 1, -1);
      if (n >= 0) setHi(n);
    } else if (e.key === 'Enter') {
      // Never submit the surrounding form from inside the list.
      e.preventDefault();
      choose(rows[hi]);
    } else if (e.key === 'Escape') {
      // Close the list, not the modal around it.
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      // Back to the box itself, so focus stays inside the dialog around it.
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="ssel" ref={boxRef}>
      <button
        type="button"
        id={id}
        ref={btnRef}
        className={`form-control ssel__btn${error ? ' error' : ''}${picked ? '' : ' ssel__btn--empty'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); show(); }
        }}
      >
        <span className="ssel__value">{picked ? picked.label : (noneLabel && value === '' ? noneLabel : placeholder)}</span>
      </button>

      <DropdownPanel anchorRef={btnRef} open={open} maxHeight={maxHeight}>
        <div className="ssel__search">
          <input
            ref={searchRef}
            type="search"
            className="form-control"
            placeholder={searchPlaceholder}
            value={query}
            aria-label={searchPlaceholder}
            aria-controls={listId}
            aria-activedescendant={rows[hi] ? `${listId}-${hi}` : undefined}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <div role="listbox" id={listId} ref={listRef}>
          {rows.length === 0 && <div className="ssel__empty">{emptyText}{query ? ` “${query.trim()}”` : ''}</div>}
          {rows.map((r, i) => {
            const on = String(r.value) === String(value) && (r.none ? value === '' : true);
            return (
              <div
                key={r.none ? '__none' : r.value}
                id={`${listId}-${i}`}
                data-row={i}
                role="option"
                aria-selected={on}
                aria-disabled={r.disabled || undefined}
                className={`ssel__opt${i === hi ? ' is-hi' : ''}${on ? ' is-on' : ''}${r.disabled ? ' is-off' : ''}${r.none ? ' ssel__opt--none' : ''}`}
                onMouseEnter={() => !r.disabled && setHi(i)}
                // mousedown, not click: the search box keeps focus until the pick lands.
                onMouseDown={(e) => { e.preventDefault(); choose(r); }}
              >
                {renderOption && !r.none ? renderOption(r) : (
                  <>
                    <span className="ssel__label">{r.label}</span>
                    {r.sub && <span className="ssel__sub">{r.sub}</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </DropdownPanel>
    </div>
  );
}
