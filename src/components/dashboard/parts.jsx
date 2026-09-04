/**
 * The pieces every dashboard is built from.
 *
 * Extracted when the student dashboard needed the same panel, row and empty-note
 * shapes the admin one had grown — one definition beats two that drift. Anything
 * shaped by a single screen's data stays in that page's own parts file.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../ui/icons';

// ── Panel ────────────────────────────────────────────────────────────────────
export const Panel = ({ title, subtitle, action, children, className = '', bodyClass = '' }) => (
  <section className={`dpanel ${className}`}>
    {(title || action) && (
      <header className="dpanel__head">
        <div>
          {title && <h2 className="dpanel__title">{title}</h2>}
          {subtitle && <p className="dpanel__sub">{subtitle}</p>}
        </div>
        {action}
      </header>
    )}
    <div className={`dpanel__body ${bodyClass}`}>{children}</div>
  </section>
);

/** The "View All →" affordance a panel header carries. */
export const PanelLink = ({ to, children = 'View All' }) => (
  <Link to={to} className="dpanel__link">{children}</Link>
);

// ── Row link (queues, events, lists) ─────────────────────────────────────────
export const RowLink = ({ to, icon, tone = 'indigo', title, sub, right }) => (
  <Link to={to} className="drow">
    <span className={`drow__icon tint-${tone}`}><Icon name={icon} size={19} /></span>
    <span className="drow__text">
      <span className="drow__title">{title}</span>
      {sub && <span className="drow__sub">{sub}</span>}
    </span>
    {right || <Icon name="chevronRight" size={16} className="drow__chev" />}
  </Link>
);

// ── Empty note inside a panel ────────────────────────────────────────────────
export const Note = ({ icon = 'checkCircle', children }) => (
  <div className="dnote"><Icon name={icon} size={17} />{children}</div>
);
