/**
 * The class page's panels — shared by the student's My Class and the parent's
 * Class Info.
 *
 * A parent looking at a child should see what the child sees, so both pages are
 * built from these same pieces and differ only in whose class is on screen and
 * where the quick links point.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';

export const initials = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

/** "Class 1 — Section A", and something sensible when either half is missing. */
export const classTitle = (section, pendingClass) => {
  const cls = section?.class?.className
    || (section?.class?.classNumber != null ? `Class ${section.class.classNumber}` : '')
    || pendingClass?.className
    || (pendingClass?.classNumber != null ? `Class ${pendingClass.classNumber}` : '');
  if (!cls) return section?.sectionName ? `Section ${section.sectionName}` : 'My Class';
  return section?.sectionName ? `${cls} — Section ${section.sectionName}` : cls;
};

// ── Decoration ───────────────────────────────────────────────────────────────
/** The classroom in the page header. Ornament only — no data, no links. */
export const ClassArt = () => (
  <svg className="scls-art" viewBox="0 0 330 168" aria-hidden="true" focusable="false">
    {/* blackboard */}
    <rect x="86" y="14" width="150" height="96" rx="7" fill="#0f3d2e" />
    <rect x="92" y="20" width="138" height="84" rx="4" fill="none" stroke="#6ee7b7" strokeOpacity=".45" />
    <text x="103" y="42" fill="#ecfdf5" fontSize="12.5" fontWeight="600">Good</text>
    <text x="103" y="58" fill="#ecfdf5" fontSize="12.5" fontWeight="600">Students</text>
    <text x="103" y="74" fill="#ecfdf5" fontSize="12.5" fontWeight="600">Brighter</text>
    <text x="103" y="90" fill="#ecfdf5" fontSize="12.5" fontWeight="600">Tomorrows</text>
    <circle cx="205" cy="66" r="15" fill="none" stroke="#ecfdf5" strokeWidth="1.6" />
    <circle cx="200" cy="62" r="1.7" fill="#ecfdf5" />
    <circle cx="210" cy="62" r="1.7" fill="#ecfdf5" />
    <path d="M199 70a7 7 0 0 0 12 0" fill="none" stroke="#ecfdf5" strokeWidth="1.6" strokeLinecap="round" />

    {/* sticky note */}
    <g transform="rotate(-5 268 20)">
      <rect x="238" y="8" width="66" height="66" rx="3" fill="#fde68a" />
      <text x="246" y="26" fill="#78350f" fontSize="11" fontWeight="700">Small</text>
      <text x="246" y="39" fill="#78350f" fontSize="11" fontWeight="700">Steps</text>
      <text x="246" y="52" fill="#78350f" fontSize="11" fontWeight="700">Big</text>
      <text x="246" y="65" fill="#78350f" fontSize="11" fontWeight="700">Futures</text>
      <circle cx="292" cy="26" r="7" fill="#fbbf24" />
    </g>

    {/* plant */}
    <path d="M40 96c-13-2-19-12-17-25 12-1 19 8 17 25Z" fill="#34d399" />
    <path d="M42 96c11-4 15-14 11-26-11 2-16 12-11 26Z" fill="#10b981" />
    <path d="M41 96V72" stroke="#047857" strokeWidth="2" strokeLinecap="round" />
    <path d="M28 98h27l-4 26H32l-4-26Z" fill="#6366f1" />

    {/* desk + chair */}
    <rect x="150" y="118" width="96" height="7" rx="3.5" fill="#c7d2fe" />
    <rect x="160" y="125" width="6" height="26" rx="3" fill="#a5b4fc" />
    <rect x="230" y="125" width="6" height="26" rx="3" fill="#a5b4fc" />
    <rect x="196" y="92" width="34" height="30" rx="5" fill="#818cf8" />
    <rect x="200" y="122" width="5" height="24" rx="2.5" fill="#6366f1" />
    <rect x="221" y="122" width="5" height="24" rx="2.5" fill="#6366f1" />

    {/* books */}
    <rect x="252" y="104" width="34" height="6" rx="2" fill="#f472b6" />
    <rect x="255" y="97" width="28" height="6" rx="2" fill="#60a5fa" />
    <rect x="258" y="90" width="22" height="6" rx="2" fill="#fbbf24" />

    <rect x="12" y="150" width="306" height="4" rx="2" fill="currentColor" opacity=".12" />
  </svg>
);

// ── Header band ──────────────────────────────────────────────────────────────
export function ClassHero({ kicker, title, subtitle, tagline, quote }) {
  return (
    <header className="scls-hero">
      <div className="scls-hero__body">
        <span className="scls-hero__kicker">{kicker}</span>
        <h1>{title}</h1>
        {subtitle && <p className="scls-hero__year">{subtitle}</p>}
        {tagline && <p className="scls-hero__tag">{tagline}</p>}
      </div>
      <div className="scls-hero__art">
        <ClassArt />
        {quote && <blockquote className="scls-quote">{quote}</blockquote>}
      </div>
    </header>
  );
}

// ── The four figures ─────────────────────────────────────────────────────────
export function Figure({ icon, tone = 'violet', label, value, caption, fill }) {
  return (
    <div className={`scls-fig scls-t--${tone}`}>
      <span className="scls-ico scls-ico--lg"><Icon name={icon} size={24} /></span>
      <div className="scls-fig__body">
        <span className="scls-fig__label">{label}</span>
        <strong className="scls-fig__value">{value}</strong>
        {fill != null && (
          <span className="scls-bar">
            <i style={{ width: `${Math.max(2, Math.min(100, Math.round(fill * 100)))}%` }} />
          </span>
        )}
        {caption && <span className="scls-fig__cap">{caption}</span>}
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
export function Panel({ icon, tone = 'indigo', title, count, action, children, id, className = '' }) {
  return (
    <section className={`scls-card ${className}`} id={id}>
      <header className="scls-card__head">
        <h2>
          <span className={`scls-hicon scls-t--${tone}`}><Icon name={icon} size={19} /></span>
          {title}{count != null && ` (${count})`}
        </h2>
        {action}
      </header>
      <div className="scls-card__body">{children}</div>
    </section>
  );
}

export const ViewAll = ({ label = 'View All', onClick, to }) => (
  to
    ? <Link className="scls-more" to={to}>{label}<Icon name="arrowRight" size={15} /></Link>
    : <button type="button" className="scls-more" onClick={onClick}>{label}<Icon name="arrowRight" size={15} /></button>
);

export const InfoRow = ({ label, value }) => (
  <div className="scls-info">
    <span>{label}</span>
    <strong>{value == null || value === '' ? '—' : value}</strong>
  </div>
);

/** A teacher, with the role they hold for this class. */
export function PersonLine({ name, email, badge, tone = 'indigo' }) {
  if (!name) return null;
  return (
    <div className="scls-person">
      <span className={`scls-av scls-t--${tone}`}>{initials(name)}</span>
      <span className="scls-person__body">
        <strong>{name}</strong>
        {email && <em title={email}>{email}</em>}
      </span>
      {badge && <span className={`scls-badge scls-t--${tone}`}>{badge}</span>}
    </div>
  );
}

// ── Quick links ──────────────────────────────────────────────────────────────
/** `links` are `{ to, icon, label, tone }`; a link with no `to` is left out. */
export function QuickLinks({ links, announcements }) {
  const usable = links.filter((l) => l.to);
  if (!usable.length && !announcements) return null;
  return (
    <>
      <div className="scls-quick">
        {usable.map((l) => (
          <Link key={l.label} to={l.to} className={`scls-quick__item scls-t--${l.tone}`}>
            <Icon name={l.icon} size={18} />{l.label}
          </Link>
        ))}
      </div>
      {announcements && (
        <button type="button" className="scls-quick__wide scls-t--indigo" onClick={announcements}>
          <Icon name="megaphone" size={18} />Announcements
          <Icon name="chevronRight" size={16} className="scls-quick__chev" />
        </button>
      )}
    </>
  );
}

// ── Classmates ───────────────────────────────────────────────────────────────
export const MateChip = ({ mate, meLabel }) => (
  <span className={`scls-mate${mate.isMe ? ' is-me' : ''}`}>
    <span className={`scls-av ${mate.isMe ? 'scls-t--indigo' : 'scls-t--violet'}`}>{initials(mate.name)}</span>
    <span className="scls-mate__name">{mate.name}</span>
    {mate.isMe && meLabel && <span className="scls-badge scls-t--indigo">{meLabel}</span>}
    {mate.rollNumber ? <span className="scls-mate__roll">{mate.rollNumber}</span> : null}
  </span>
);

// ── Class updates ────────────────────────────────────────────────────────────
export function Updates({ announcements = [] }) {
  if (!announcements.length) {
    return (
      <div className="scls-empty">
        <span className="scls-empty__icon"><Icon name="files" size={26} /></span>
        <div>
          <strong>No announcements yet</strong>
          <p>You will see class announcements here.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="scls-updates">
      {announcements.map((a) => (
        <article key={a._id} className="scls-update">
          <span className="scls-ico scls-t--indigo"><Icon name="megaphone" size={18} /></span>
          <div className="scls-update__body">
            <strong>{a.title}</strong>
            <p>{a.message}</p>
          </div>
          {a.createdAt && (
            <time>{new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
          )}
        </article>
      ))}
    </div>
  );
}

// ── Nothing to show ──────────────────────────────────────────────────────────
/**
 * Being in a class but not yet in a section is a normal step, not a fault —
 * telling somebody there is no class when the school has already admitted the
 * student sends them to the office for nothing.
 */
export function NoSection({ pendingClass, subject = 'You', possessive = 'Your' }) {
  const pending = pendingClass?.className
    || (pendingClass?.classNumber != null ? `Class ${pendingClass.classNumber}` : '');
  return pending ? (
    <div className="alert alert-info">
      {subject} {subject === 'You' ? 'are' : 'is'} in <strong>{pending}</strong>. {possessive} section
      has not been decided yet — this page will fill in as soon as the school assigns one.
    </div>
  ) : (
    <div className="alert alert-warning">
      {subject} {subject === 'You' ? 'have' : 'has'} not been assigned to a class yet.
      Please contact the school office.
    </div>
  );
}
