/**
 * The date-range FILTER. All of them (Nov 24 2026).
 *
 * The user's rule: "date range selection filter should look like the image
 * everywhere there is a from and to date selection — for filters only". The
 * image is the Aptitude Exams filter: one button in the filter row — a
 * calendar and "Select date range", or the range once one is set — opening a
 * small panel with From, To, and Clear / Done.
 *
 * Nine kits used to draw their own (two bare date boxes, a box with an arrow,
 * a chip with presets…); each kit's filter now renders this one, keeping its
 * own props, so no page had to change how it wires the dates.
 *
 * Each change applies as it is made — Done only closes the panel. Either end
 * may be left open. `presets` ({ label, from, to }) appear as chips under the
 * two dates (the kits that offered "This month" / "Last 3 months" keep them).
 *
 * The panel is portalled to <body> and placed against the button, so a card's
 * `overflow: hidden` cannot cut it off, and it sits above drawers and dialogs.
 *
 * Not for forms: a leave's or a holiday's own dates are two labelled fields
 * of the form, not a filter.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './icons';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PANEL_W = 240;

const parts = (key) => {
  const [y, m, d] = String(key || '').split('-');
  return m ? { y, m: Number(m), d: Number(d) } : null;
};
const say = (p, year) => `${p.d} ${MONTHS[p.m - 1]}${year ? ` ${p.y}` : ''}`;

/** "5 Nov – 12 Nov 2026", "From 5 Nov 2026", "Until 12 Nov 2026", or the placeholder. */
export function rangeLabel(from, to, placeholder = 'Select date range') {
  const a = parts(from);
  const b = parts(to);
  if (a && b) return a.y === b.y ? `${say(a)} – ${say(b, true)}` : `${say(a, true)} – ${say(b, true)}`;
  if (a) return `From ${say(a, true)}`;
  if (b) return `Until ${say(b, true)}`;
  return placeholder;
}

export default function DateRangeFilter({
  from = '', to = '', onChange,
  placeholder = 'Select date range',
  label = 'Date range',
  min, max,
  presets,
  className = '', style, disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);

  // Opens toward the room: a button in the right half of the screen lines the
  // panel's right edge up with its own (as the image draws it), one in the
  // left half its left edge — so it never spills over the sidebar. Kept on
  // screen at both sides.
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const rightHalf = r.left + r.width / 2 > window.innerWidth / 2;
    const want = rightHalf ? r.right - PANEL_W : r.left;
    const left = Math.max(8, Math.min(want, window.innerWidth - PANEL_W - 8));
    setPos({ left, top: r.bottom + 6 });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (btn.current?.contains(e.target) || pop.current?.contains(e.target)) return;
      setOpen(false);
    };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const set = !!(from || to);
  const text = rangeLabel(from, to, placeholder);
  const emit = (v) => onChange?.(v);

  return (
    <>
      <button ref={btn} type="button" disabled={disabled}
        className={`drf${set ? ' is-on' : ''}${className ? ` ${className}` : ''}`} style={style}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-haspopup="dialog" aria-label={`${label}: ${text}`} title={set ? text : undefined}>
        <Icon name="calendar" size={16} />
        <span className="drf__text">{text}</span>
      </button>
      {open && pos ? createPortal(
        <div ref={pop} className="drf-pop" role="dialog" aria-label={label}
          style={{ left: pos.left, top: pos.top, width: PANEL_W }}>
          <label className="drf-pop__field">
            <span>From</span>
            <input type="date" className="form-control" value={from || ''}
              min={min || undefined} max={to || max || undefined}
              onChange={(e) => emit({ from: e.target.value, to })} />
          </label>
          <label className="drf-pop__field">
            <span>To</span>
            <input type="date" className="form-control" value={to || ''}
              min={from || min || undefined} max={max || undefined}
              onChange={(e) => emit({ from, to: e.target.value })} />
          </label>
          {presets?.length ? (
            <div className="drf-pop__presets">
              {presets.map((p) => (
                <button key={p.label} type="button"
                  className={p.from === from && p.to === to ? 'is-on' : ''}
                  onClick={() => { emit({ from: p.from, to: p.to }); setOpen(false); }}>
                  {p.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="drf-pop__foot">
            <button type="button" className="btn btn-secondary btn-sm" disabled={!set}
              onClick={() => emit({ from: '', to: '' })}>Clear</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
