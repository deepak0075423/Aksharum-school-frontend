import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useModules } from '../../contexts/ModulesContext';
import { Empty } from '../../components/ui/index';

// Shared pieces of the Employee Directory. Everything here is built from the
// existing design system — no new UI framework, no new colour scale.

/** The directory lives under /admin for administrators and /teacher for everyone else. */
export function useDirectoryBase() {
  const { user } = useAuth();
  const { isAdmin } = useModules();
  const admin = user?.role === 'school_admin' || isAdmin('employeeDirectory');
  return { base: admin ? '/admin/employee-directory' : '/teacher/employee-directory', isDirectoryAdmin: admin };
}

export const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const STATUS_TONE = { active: 'success', on_leave: 'warning', inactive: 'muted' };
export const STATUS_LABEL = { active: 'Active', on_leave: 'On Leave', inactive: 'Inactive' };
export const VERIFY_TONE = { verified: 'success', pending: 'warning', rejected: 'danger' };

export const uploadBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
export const fileUrl = (path) => (!path ? '' : /^https?:/.test(path) ? path : `${uploadBase}${path}`);

/** Initials avatar, falling back to the account photo when there is one. */
export function Avatar({ name, src, size = 40 }) {
  const initials = String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const style = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.38, fontWeight: 700, color: '#fff', background: 'var(--primary)',
    objectFit: 'cover', overflow: 'hidden',
  };
  // A page of cards is a page of photos; fetch them as they come into view and
  // decode off the main thread so the list stays responsive while it fills.
  if (src) {
    return (
      <img
        src={fileUrl(src)} alt={name} style={style}
        loading="lazy" decoding="async"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }
  return <div style={style} aria-hidden>{initials || '?'}</div>;
}

/** Skeleton block used while a panel is loading. */
export const Skeleton = ({ h = 14, w = '100%', r = 6, style }) => (
  <div style={{
    height: h, width: w, borderRadius: r, background: 'var(--bg)',
    animation: 'edPulse 1.4s ease-in-out infinite', ...style,
  }} />
);

export const SkeletonRows = ({ rows = 6, cols = 5 }) => (
  <div className="table-wrap">
    <style>{'@keyframes edPulse{0%,100%{opacity:1}50%{opacity:.45}}'}</style>
    <table className="table">
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((__, c) => (
              <td key={c}><Skeleton w={c === 0 ? '70%' : '55%'} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const SkeletonCards = ({ count = 6 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
    <style>{'@keyframes edPulse{0%,100%{opacity:1}50%{opacity:.45}}'}</style>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card"><div className="card-body">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Skeleton h={44} w={44} r={22} />
          <div style={{ flex: 1 }}>
            <Skeleton w="70%" />
            <Skeleton w="45%" style={{ marginTop: 8 }} />
          </div>
        </div>
        <Skeleton w="100%" style={{ marginTop: 14 }} />
        <Skeleton w="80%" style={{ marginTop: 8 }} />
      </div></div>
    ))}
  </div>
);

/**
 * A failed request must never look like an empty directory, and must never put
 * a backend error in front of a user.
 */
export function ErrorState({ error, onRetry, title = 'Could not load this' }) {
  const known = typeof error === 'string' ? error : error?.message;
  const safe = known && known.length < 160 ? known : 'Something went wrong while loading. Please try again.';
  return (
    <Empty
      icon="🔌"
      title={title}
      message={safe}
      action={onRetry && <button className="btn btn-primary" onClick={onRetry}>Try again</button>}
    />
  );
}

/** Label / value line used throughout the profile tabs. */
export const KV = ({ label, value, mono }) => (
  <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
    <span style={{ color: 'var(--text-muted)', fontSize: '.83rem', minWidth: 190, flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: '.88rem', fontWeight: 500, fontFamily: mono ? 'ui-monospace,SFMono-Regular,Menlo,monospace' : 'inherit', letterSpacing: mono ? '.04em' : 0, wordBreak: 'break-word' }}>
      {value === '' || value == null ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Not on file</span> : value}
    </span>
  </div>
);

export const Section = ({ title, subtitle, action, children }) => (
  <div className="card" style={{ marginBottom: 16 }}>
    <div className="card-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="text-muted text-sm" style={{ marginTop: 2 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
    <div className="card-body">{children}</div>
  </div>
);

/**
 * Shown in place of a tab the caller has no permission for. The data was never
 * sent to the browser — this only explains the gap.
 */
export const Restricted = ({ what = 'this information' }) => (
  <Empty
    icon="🔒"
    title="Restricted"
    message={`You do not have permission to view ${what}. Access is granted through your designation's module permissions.`}
  />
);

export const Meter = ({ value, tone }) => {
  const color = tone || (value >= 90 ? 'var(--success)' : value >= 60 ? 'var(--warning)' : 'var(--danger)');
  return (
    <div style={{ height: 8, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, value || 0))}%`, background: color, borderRadius: 999, transition: 'width .3s' }} />
    </div>
  );
};

export const Chips = ({ items, empty = '—', max }) => {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return <span className="text-muted">{empty}</span>;
  const shown = max ? list.slice(0, max) : list;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
      {shown.map((t, i) => <span key={i} className="badge badge-muted">{t}</span>)}
      {max && list.length > max && <span className="badge badge-muted">+{list.length - max}</span>}
    </span>
  );
};

// ── Icons ────────────────────────────────────────────────────────────────────
// Inline strokes rather than an icon package: the app has no icon dependency and
// these are the only glyphs the directory needs.
const svg = (d, size = 15, extra = null) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}{extra}
  </svg>
);

export const SearchIcon = ({ size = 15 }) => svg(
  <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>, size);

export const MailIcon = ({ size = 14 }) => svg(
  <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M3 6.5l9 6 9-6" /></>, size);

export const PhoneIcon = ({ size = 14 }) => svg(
  <path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 006.5 6.5L17 13l4 1.5v3a2 2 0 01-2.2 2A17 17 0 013.5 5.2 2 2 0 015.5 3z" />, size);

export const PinIcon = ({ size = 14 }) => svg(
  <><path d="M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>, size);

export const CalendarIcon = ({ size = 14 }) => svg(
  <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>, size);

export const UserIcon = ({ size = 14 }) => svg(
  <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0115 0" /></>, size);

export const BuildingIcon = ({ size = 14 }) => svg(
  <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M8 7h2M8 11h2M8 15h2M14 7h2M14 11h2M14 15h2" /></>, size);

export const BookIcon = ({ size = 14 }) => svg(
  <><path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z" /><path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5" /></>, size);

export const BadgeIcon = ({ size = 14 }) => svg(
  <><rect x="3.5" y="6" width="17" height="13" rx="2" /><path d="M9 3h6v3H9zM8 12h3M8 15.5h6" /></>, size);

export const ChevronIcon = ({ size = 16 }) => svg(<path d="M9 5l7 7-7 7" />, size);

/** One iconed fact on a directory card. Renders nothing when there is no value. */
export const Fact = ({ icon, children, wide, title }) => (
  <span className={`ed-fact${wide ? ' ed-fact--wide' : ''}`} title={title}>
    {icon}<span>{children}</span>
  </span>
);

/** Label-above-value field inside a profile block. */
export const Field = ({ icon, label, value, blank = 'Not on file', span2 }) => (
  <div className={`ed-field${span2 ? ' ed-field--span2' : ''}`}>
    {icon}
    <div style={{ minWidth: 0 }}>
      <div className="ed-field__k">{label}</div>
      <div className="ed-field__v">
        {value === '' || value == null ? <span className="ed-none">{blank}</span> : value}
      </div>
    </div>
  </div>
);

/** A titled block of fields inside a profile panel. */
export const Block = ({ icon, title, children }) => (
  <div className="ed-block">
    <div className="ed-block__title">{icon}{title}</div>
    {children}
  </div>
);

/**
 * A value the school has not recorded. Saying what is missing beats a column of
 * em-dashes — the table is mostly empty on a fresh school, and "—" everywhere
 * reads as broken rather than as "nobody has filled this in yet".
 */
export const Blank = ({ children = '—' }) => <span className="ed-none">{children}</span>;

/** Render `value`, or a muted note naming what is missing. */
export const OrBlank = ({ value, blank = '—' }) =>
  (value === '' || value == null || (Array.isArray(value) && !value.length)
    ? <Blank>{blank}</Blank>
    : value);
