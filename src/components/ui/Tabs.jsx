/**
 * The app's tabs. All of them.
 *
 * Sixteen kits used to draw their own — `.doctabs`, `.lvtabs`, `.atn-tabs`,
 * `.fe-pills`, `.fe-utabs`, `.tt-tabs`, `.pr-tabs`, `.fbtabs`, `.sdtabs`,
 * `.modnav` and the original `.tabs` — each with its own padding, its own idea
 * of where the active marker goes and its own prop names (`tabs` or `items`,
 * `value` or `active`, `onChange` or `onPick`, `t.value` or `t.key`). Moving
 * between two screens of the same module could change what a tab looked like.
 *
 * One component now, with three looks that mean three different things:
 *
 *   line   switching between views of ONE screen (the default). Underlined,
 *          because the views are all of the thing named above them.
 *   pill   choosing a subset — a filter, a status, a section of a module.
 *          Filled, because the choice is the point.
 *   solid  a two-or-three-way switch inside a toolbar. Enclosed in a track, so
 *          it reads as one control rather than as navigation.
 *
 * Items may carry a `to`, and then the strip navigates instead of calling back:
 * the module rails are the same component as the in-page tabs, which is why
 * they finally look alike.
 */
import React, { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from './icons';

const keyOf   = (t, i) => t.key ?? t.value ?? t.to ?? t.id ?? String(i);
const labelOf = (t) => t.label ?? t.name ?? '';

/**
 * Keeps the active tab in view.
 *
 * A strip that scrolls (Fees has ten sections, Inventory twelve) opens at its
 * left edge, so on a narrow window the tab you are actually on can sit off
 * screen — the strip then looks like it has no selection at all.
 */
function useScrollActiveIntoView(ref, dep) {
  useEffect(() => {
    const el = ref.current?.querySelector('.uitab.is-on');
    if (!el || !ref.current) return;
    const strip = ref.current;
    if (strip.scrollWidth <= strip.clientWidth) return;
    const left = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: 'auto' });
  }, [ref, dep]);
}

/** The inside of one tab: an optional icon, the label, an optional count. */
const TabBody = ({ t }) => (
  <>
    {(t.icon || t.glyph) ? <Icon name={t.icon || t.glyph} size={16} aria-hidden /> : null}
    <span className="uitab__label">{labelOf(t)}</span>
    {t.count != null && t.count !== false
      ? <span className={`uitab__count${t.tone ? ` uitab__count--${t.tone}` : ''}`}>
          {typeof t.count === 'number' ? t.count.toLocaleString('en-IN') : t.count}
        </span>
      : null}
  </>
);

export default function Tabs({
  items, tabs,                       // either name; `tabs` is the older one
  value, active,                     // the selected key
  onChange, onPick,                  // the callback, under either name
  variant = 'line',                  // 'line' | 'pill' | 'solid'
  size,                              // 'sm' for a strip inside a card header
  align,                             // 'end' to push the strip right
  className = '',
  label = 'Sections',                // what a screen reader calls the strip
  children,                          // anything that rides on the same row
}) {
  const list    = items || tabs || [];
  const current = value !== undefined ? value : active;
  const pick    = onChange || onPick || (() => {});
  const ref     = useRef(null);
  const linked  = list.length > 0 && list.every(t => t.to);
  useScrollActiveIntoView(ref, current);

  const strip = (
    <div
      ref={ref}
      className={`uitabs uitabs--${variant}${size ? ` uitabs--${size}` : ''} ${className}`}
      role={linked ? undefined : 'tablist'}
      aria-label={label}
    >
      {list.map((t, i) => {
        const k  = keyOf(t, i);
        const on = !linked && String(current) === String(k);
        if (linked) {
          return (
            <NavLink key={k} to={t.to} end={t.end}
              className={({ isActive }) => `uitab${isActive ? ' is-on' : ''}${t.disabled ? ' is-off' : ''}`}>
              <TabBody t={t} />
            </NavLink>
          );
        }
        return (
          <button key={k} type="button" role="tab" aria-selected={on} disabled={t.disabled}
            className={`uitab${on ? ' is-on' : ''}${t.disabled ? ' is-off' : ''}`}
            onClick={() => pick(k, t)}>
            <TabBody t={t} />
          </button>
        );
      })}
    </div>
  );

  if (!children && !align) return strip;
  return (
    <div className={`uitabrow${align === 'end' ? ' uitabrow--end' : ''}`}>
      {strip}
      {children ? <div className="uitabrow__side">{children}</div> : null}
    </div>
  );
}

/** Route-driven tabs: the module rails, and any strip whose tabs are pages. */
export const LinkTabs = (props) => <Tabs variant="pill" label="Sections" {...props} />;
