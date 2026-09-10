/**
 * The pieces of the library policy screens, and the one description of what the
 * policy contains.
 *
 * SECTIONS below is that description: which settings exist, what each one is
 * called, what it means in a sentence, and what unit it is in. Both screens are
 * built from it — the read view groups its rows by it and the editor lays out
 * its form by it — so a setting is described once and cannot end up worded one
 * way on the page and another way in the form.
 *
 * The bounds and the defaults are *not* here. They come down with the policy
 * (`limits`, `defaults`), because they are the server's rules: a form that
 * carried its own copy of "between 1 and 100" would go on saying that after the
 * day the server stopped agreeing.
 */
import React from 'react';
import Icon from '../../../components/ui/icons';

// ── What the policy holds ────────────────────────────────────────────────────

export const SECTIONS = [
  {
    id: 'limits',
    title: 'Borrowing Limits',
    blurb: 'How much a member may have out, and for how long.',
    icon: 'book', tone: 'indigo',
    fields: [
      { key: 'maxBooksPerUser', label: 'Max books per member', type: 'number',
        hint: 'How many books one person may have out at once.' },
      { key: 'issueDurationDays', label: 'Loan period', type: 'number', unit: 'days',
        hint: 'Default due date when the counter does not set one.' },
      { key: 'maxRenewals', label: 'Renewal limit', type: 'number', unit: 'times',
        hint: 'Times a loan may be extended before the book must come back.' },
    ],
  },
  {
    id: 'fines',
    title: 'Fine Rules',
    blurb: 'Late returns are charged by the day; loss and damage as a multiple of that rate.',
    icon: 'banknote', tone: 'green',
    fields: [
      { key: 'finePerDay', label: 'Fine per day', type: 'number', unit: '₹',
        hint: 'Charged for each day past the grace period.' },
      { key: 'gracePeriodDays', label: 'Grace period', type: 'number', unit: 'days',
        hint: 'Days after the due date before a fine starts.' },
      // Stored as a multiplier and spent as money. Showing the bare number is
      // what made a lost-book charge of 30 read as ₹30.
      { key: 'lostBookFineDays', label: 'Lost book charge', type: 'number', unit: 'days of fine',
        hint: 'Charged as this many days of fine, unless the counter enters the book’s actual price.' },
      { key: 'damagedBookFineDays', label: 'Damaged book charge', type: 'number', unit: 'days of fine',
        hint: 'Added on top of any late fine when a book comes back damaged.' },
    ],
  },
  {
    id: 'counter',
    title: 'Borrowing Rules',
    blurb: 'What the issue counter allows or blocks, and who is exempt.',
    icon: 'checkSquare', tone: 'purple',
    fields: [
      { key: 'allowMultipleCopiesPerUser', label: 'Allow two copies of one title per person', type: 'flag',
        hint: 'Off means a member must return their copy before taking another of the same book — the usual rule.' },
      { key: 'blockIssueOnPendingFine', label: 'Block borrowing while a fine is unpaid', type: 'flag',
        hint: 'A member with an outstanding fine cannot borrow or reserve until it is settled or waived.' },
      { key: 'blockIssueOnOverdue', label: 'Block borrowing while a book is overdue', type: 'flag',
        hint: 'A member holding an overdue book cannot take out another.' },
      { key: 'teacherFinesEnabled', label: 'Charge late fines to teachers', type: 'flag',
        hint: 'Off means teacher loans never accrue late fines. Lost and damaged books are still charged — that is compensation, not a penalty.' },
    ],
  },
  {
    id: 'reservations',
    title: 'Reservation Rules',
    blurb: 'How many titles a member may queue for, and how long a held copy waits.',
    icon: 'clock', tone: 'amber',
    fields: [
      { key: 'maxReservationsPerUser', label: 'Max reservations per member', type: 'number',
        hint: 'How many titles one person may be queued for at once.' },
      { key: 'reservationExpiryDays', label: 'Reservation hold period', type: 'number', unit: 'days',
        hint: 'How long a reserved book is held on the shelf before it passes to the next person in the queue.' },
    ],
  },
  {
    id: 'general',
    title: 'General Settings',
    blurb: 'Numbering the library issues on paper.',
    icon: 'settings', tone: 'blue',
    fields: [
      { key: 'receiptPrefix', label: 'Receipt prefix', type: 'text', maxLength: 8,
        hint: 'What a fine receipt number starts with — “LIB” gives LIB-000123. Letters, digits and dashes.' },
    ],
  },
];

export const FIELDS = SECTIONS.flatMap((s) => s.fields);
export const FIELD_KEYS = FIELDS.map((f) => f.key);
export const fieldOf = (key) => FIELDS.find((f) => f.key === key);

// ── Formatting ───────────────────────────────────────────────────────────────

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const fmtWhen = (d) => (d
  ? new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  : '');

/** A stored value, said with its unit — "1 day", "₹2", "30 days of fine". */
export const valueOf = (field, raw) => {
  if (field.type === 'flag') return raw ? 'On' : 'Off';
  if (raw === undefined || raw === null || raw === '') return '—';
  if (field.unit === '₹') return money(raw);
  if (!field.unit) return String(raw);
  // "1 days" is how a settings page tells you nobody read it.
  const unit = Number(raw) === 1 ? field.unit.replace(/^days\b/, 'day').replace(/^times$/, 'time') : field.unit;
  return `${raw} ${unit}`;
};

// ── The header ───────────────────────────────────────────────────────────────

/**
 * The policy hero. Same shape as the rest of the module's headers, drawn here
 * because the artwork is the module's — a shield over a book, not a stack.
 */
export const PolicyHero = ({ title, tagline, subtitle, quote }) => (
  <header className="libd-hero">
    <span className="libd-hero__mark"><Icon name="checkSquare" size={30} /></span>
    <div className="libd-hero__text">
      <h1>{title}</h1>
      {tagline ? <p className="libd-hero__tag">{tagline}</p> : null}
      <p>{subtitle}</p>
    </div>
    <RulesArt />
    <blockquote className="libd-hero__quote">
      <span aria-hidden>“</span>
      <p>{quote.text}</p>
      <cite>— {quote.by}</cite>
    </blockquote>
  </header>
);

/** An open rule book behind a shield, drawn rather than fetched. */
const RulesArt = () => (
  <svg className="libd-hero__art" viewBox="0 0 200 110" fill="none" aria-hidden focusable="false">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M38 84h124" opacity=".5" />
      <path d="M52 30h40a10 10 0 0 1 10 10v40a10 10 0 0 0-10-8H52z" />
      <path d="M152 30h-40a10 10 0 0 0-10 10v40a10 10 0 0 1 10-8h40z" />
      <path d="M60 44h26M60 56h22M118 44h26M118 56h22" opacity=".55" />
      <path d="M102 18l16 6v12c0 8-6 15-16 18-10-3-16-10-16-18V24z" opacity=".85" />
      <path d="M96 32l5 5 9-9" opacity=".85" />
      <path d="M28 40c2-2.6 4-2.6 6 0M166 34c2-2.6 4-2.6 6 0" opacity=".45" />
    </g>
  </svg>
);

/** A figure off the top of the policy — read-only, so not a link. */
export const PolicyTile = ({ icon, tone, value, label, caption }) => (
  <div className="libd-tile libpol-tile">
    <span className={`libd-tile__icon tint-${tone}`}><Icon name={icon} size={19} /></span>
    <span className="libd-tile__body">
      <span className="libd-tile__label">{label}</span>
      <span className="libd-tile__value">{value}</span>
      <span className="libd-tile__cap">{caption}</span>
    </span>
  </div>
);

// ── The rail ─────────────────────────────────────────────────────────────────

/**
 * The list of sections down the left. Each entry moves to its panel rather than
 * swapping the page: the policy is short enough to read in one pass, and a
 * librarian comparing the loan period against the fine rate should not have to
 * click between them.
 */
export const SectionRail = ({ title, items, active, onPick, children }) => (
  <nav className="card libpol-rail" aria-label={title}>
    <header className="libpol-rail__head">
      <span className="libpol-rail__mark tint-indigo"><Icon name="sliders" size={16} /></span>
      <h2>{title}</h2>
    </header>
    <ul>
      {items.map((s) => (
        <li key={s.id}>
          <button type="button"
            className={`libpol-rail__item${active === s.id ? ' is-on' : ''}`}
            aria-current={active === s.id ? 'true' : undefined}
            onClick={() => onPick(s.id)}>
            <span className={`libpol-rail__icon tint-${s.tone || 'indigo'}`}><Icon name={s.icon} size={15} /></span>
            <span className="libpol-rail__text">{s.title}</span>
            <Icon name="chevronRight" size={14} />
          </button>
        </li>
      ))}
    </ul>
    {children}
  </nav>
);

/** Who last moved the rules, and when. */
export const LastUpdated = ({ at, by, className = '' }) => (
  <div className={`libpol-stamp ${className}`.trim()}>
    <span className="libpol-stamp__icon"><Icon name="clock" size={15} /></span>
    <span>
      <b>Last updated</b>
      <small>{at ? fmtWhen(at) : 'Never changed'}</small>
      {by?.name ? <small>by {by.name}</small> : null}
    </span>
  </div>
);

// ── Panels ───────────────────────────────────────────────────────────────────

export const Panel = ({ id, icon, tone = 'indigo', title, blurb, action, children, innerRef }) => (
  <section className="card libpol-panel" id={id} ref={innerRef}>
    <header className="libpol-panel__head">
      <span className={`libpol-panel__icon tint-${tone}`}><Icon name={icon} size={18} /></span>
      <div>
        <h2>{title}</h2>
        {blurb ? <p>{blurb}</p> : null}
      </div>
      {action}
    </header>
    {children}
  </section>
);

/** One setting, as it reads when nobody is editing it. */
export const SettingRow = ({ field, policy }) => (
  <div className={`libpol-row${field.type === 'flag' ? ' is-flag' : ''}`}>
    <span className="libpol-row__label">
      {field.label}
      {field.type === 'flag' ? <small>{field.hint}</small> : null}
    </span>
    {field.type === 'flag'
      ? <span className={`libpol-switch is-${policy?.[field.key] ? 'on' : 'off'}`}>{policy?.[field.key] ? 'On' : 'Off'}</span>
      : <strong className="libpol-row__value">{valueOf(field, policy?.[field.key])}</strong>}
  </div>
);
