/**
 * The app's detail drawer. One of them.
 *
 * A slide-over rather than a route: the admin filtered their way to this row,
 * and navigating away would throw that filtering away to show them one record.
 *
 * It lived in pages/admin/listParts.jsx, which is the frame for the three
 * account screens — but Academic Years already borrowed it from there, and the
 * Inventory module needs the same thing, so a drawer that three unrelated
 * areas render is not part of one page's kit any more. listParts re-exports
 * these names, so every existing import keeps working unchanged.
 *
 * Styles are `.ldrawer*` and `.lfield` in styles/global.css, shared with every
 * screen that uses it.
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './icons';

export function Drawer({ open, onClose, children, label = 'Details' }) {
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    // The list behind a slide-over must not scroll under it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="ldrawer__scrim" onClick={onClose} />
      <aside className="ldrawer" role="dialog" aria-modal="true" aria-label={label}>{children}</aside>
    </>,
    document.body,
  );
}

/**
 * The head: a 52px mark, the name, a line under it, and the tags that say what
 * state the record is in. `mark` takes anything — an avatar, a photo, a dated
 * leaf, a tinted glyph — because what identifies a record differs per screen.
 */
export const DrawerHead = ({ mark, name, sub, tags, onClose, children }) => (
  <div className="ldrawer__head">
    {mark}
    <div className="ldrawer__id">
      <h3>{name}</h3>
      {sub ? <p>{sub}</p> : null}
      {tags?.length || tags ? <div className="ldrawer__tags">{tags}</div> : null}
    </div>
    {children}
    {onClose ? (
      <button type="button" className="lact" onClick={onClose} aria-label="Close">
        <Icon name="close" size={16} />
      </button>
    ) : null}
  </div>
);

export const DrawerBody = ({ children }) => <div className="ldrawer__body">{children}</div>;

/** A titled group. The heading is small, spaced and upper-case by stylesheet. */
export const DrawerSection = ({ title, right, children }) => (
  <section className="ldrawer__sec">
    {(title || right) ? (
      <div className="ldrawer__sechead">
        {title ? <h4>{title}</h4> : null}
        {right}
      </div>
    ) : null}
    {children}
  </section>
);

/** One label / value row, divided from the next by a dashed rule. */
export const DrawerField = ({ label, children }) => (
  <div className="lfield"><dt>{label}</dt><dd>{children}</dd></div>
);

/** `fields` as [label, value] pairs; empty values are dropped. */
export const DrawerFields = ({ fields = [], children }) => {
  const rows = fields.filter(([, v]) => v !== null && v !== undefined && String(v).trim?.() !== '');
  if (!rows.length && !children) return null;
  return (
    <dl>
      {rows.map(([k, v]) => <DrawerField key={k} label={k}>{v}</DrawerField>)}
      {children}
    </dl>
  );
};

export const DrawerFoot = ({ children }) => <div className="ldrawer__foot">{children}</div>;
