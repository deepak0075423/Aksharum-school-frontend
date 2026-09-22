/**
 * The Payroll module's own UI kit (Sep 2026 redesign, to the user's mockups).
 *
 * Five admin screens share one vocabulary: a breadcrumb, a section bar holding
 * the module's tabs on the left and the academic-year picker plus the screen's
 * primary action on the right, a page head, a row of tinted figure tiles, a
 * filter card, a hand-written table in a card, a pager, and a right-hand rail
 * of "what about the thing I picked" / quick actions / help.
 *
 * Deliberately NOT the listParts frame the account screens use: these mockups
 * draw a different page — the tab strip sits inside the content column next to
 * the year picker, the tiles carry share bars and percentage pills, and four of
 * the five screens end in a rail listParts has no place for.
 *
 * CSS lives in styles/payroll.css under the `pr-` prefix. Nothing here talks to
 * the network.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import Icon from '../../../components/ui/icons';
import '../../../styles/payroll.css';

/* ── Formatting ───────────────────────────────────────────────────────────── */

const MON  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Indian grouping. `space` puts a space after the symbol, as some mockups do. */
export function money(n, { sym = '₹', space = false, dec = 0 } = {}) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${v < 0 ? '−' : ''}${sym}${space ? ' ' : ''}${s}`;
}

/** Axis money: ₹6L, ₹1.5L, ₹40K. */
export function compactMoney(n, sym = '₹') {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e7) return `${sym}${+(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `${sym}${+(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `${sym}${+(v / 1e3).toFixed(0)}K`;
  return `${sym}${v}`;
}

/** "08 Sep 2026". */
export function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${String(x.getDate()).padStart(2, '0')} ${MON[x.getMonth()]} ${x.getFullYear()}`;
}
/** "20 Sep 2026, 10:30 AM". */
export function fmtDateTime(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  let h = x.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${fmtDate(x)}, ${String(h).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')} ${ap}`;
}
/** A Date as the YYYY-MM-DD an <input type=date> wants, in local time. */
export const isoDay = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const plural = (n, one, many) => `${Number(n || 0).toLocaleString('en-IN')} ${n === 1 ? one : many || `${one}s`}`;

/** "in 5 days" / "2 days ago", for a due date. */
export function dueIn(d) {
  if (!d) return '';
  const day = 86400000;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const then = new Date(d); then.setHours(0, 0, 0, 0);
  const n = Math.round((then - now) / day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `in ${n} days` : `${Math.abs(n)} days ago`;
}

export function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '—';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** One tint per person, stable across renders. */
const AV_TONES = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#3b82f6', '#f43f5e', '#0ea5e9', '#a855f7', '#10b981'];
export function avatarTone(key) {
  let h = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_TONES[h % AV_TONES.length];
}

/* ── Vocabulary shared by the five screens ────────────────────────────────── */

/** A run's stage → how it is written and the tone it wears. Mirrors RUN_STAGE on the server. */
export const RUN_STATUS = {
  draft:     ['blue',   'In Progress'],
  reviewed:  ['amber',  'In Progress'],
  approved:  ['indigo', 'In Progress'],
  published: ['green',  'Completed'],
  failed:    ['red',    'Failed'],
  cancelled: ['slate',  'Cancelled'],
};
export const RUN_STEPS = ['Configure', 'Review', 'Process', 'Complete'];

export const ASSIGN_STATUS = {
  active:   ['green', 'Active'],
  pending:  ['amber', 'Pending'],
  inactive: ['red',   'Inactive'],
  ended:    ['slate', 'Ended'],
};

export const STRUCTURE_STATUS = {
  active:   ['green',  'Active'],
  inactive: ['slate',  'Inactive'],
  default:  ['indigo', 'Default'],
};

/** Structure types — one colour each, used for the badge on two screens. */
export const STRUCTURE_TYPE = {
  teaching:       ['purple', 'Teaching'],
  non_teaching:   ['blue',   'Non-Teaching'],
  administration: ['orange', 'Administration'],
  contract:       ['pink',   'Contract'],
  general:        ['slate',  'General'],
};

export const COMPONENT_TYPE = {
  earning:   ['green', 'Earning'],
  deduction: ['red',   'Deduction'],
  employer:  ['blue',  'Employer Cost'],
};
export const CALC_TYPE = {
  fixed:      'Fixed amount',
  percentage: 'Percentage',
  balance:    'Balance of CTC',
};
export const PAYMENT_MODE = { bank_transfer: 'Bank Transfer', cash: 'Cash', cheque: 'Cheque' };

/* ── Glyphs ───────────────────────────────────────────────────────────────── */
// The mockups' tile and row icons are solid shapes with white detail, not the
// app's outline set, so the module draws its own. 24×24, currentColor.

const W = '#fff';
const GLYPHS = {
  users: <><circle cx="8.6" cy="8.3" r="3.2" fill="currentColor" /><circle cx="16.2" cy="8.8" r="2.7" fill="currentColor" opacity=".85" /><path d="M2.6 19c0-3.4 2.7-6 6-6s6 2.6 6 6z" fill="currentColor" /><path d="M14.8 19c0-1.9-.6-3.6-1.7-4.9.9-.5 2-.8 3.1-.8 2.9 0 5.2 2.3 5.2 5.2v.5z" fill="currentColor" opacity=".85" /></>,
  user: <><circle cx="12" cy="8" r="3.6" fill="currentColor" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0z" fill="currentColor" /></>,
  docFill: <><path d="M6.5 3h7.2L19 8.3V19a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="currentColor" /><path d="M8.3 12.2h7.4M8.3 15.8h5" stroke={W} strokeWidth="1.8" strokeLinecap="round" /><path d="M13.6 3.2v4a1 1 0 0 0 1 1h4" fill="none" stroke={W} strokeWidth="1.2" opacity=".7" /></>,
  docCheck: <><path d="M6.5 3h7.2L19 8.3V19a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="currentColor" /><path d="m8.6 13.2 2.2 2.2 4.5-4.6" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  wallet: <><rect x="2.8" y="5.5" width="18.4" height="14" rx="2.6" fill="currentColor" /><rect x="13.6" y="10.3" width="7.6" height="4.6" rx="1.5" fill={W} opacity=".9" /><circle cx="16.2" cy="12.6" r=".95" fill="currentColor" /></>,
  rupee: <path d="M6.5 4.5h11M6.5 9h11M9.5 4.5c3.4 0 5.4 1.7 5.4 4.5s-2 4.5-5.4 4.5H7.3l7.9 7" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />,
  bars: <><rect x="3.5" y="12" width="3.6" height="7.5" rx="1.1" fill="currentColor" /><rect x="10.2" y="7.5" width="3.6" height="12" rx="1.1" fill="currentColor" /><rect x="16.9" y="10" width="3.6" height="9.5" rx="1.1" fill="currentColor" opacity=".8" /></>,
  chartUp: <><path d="M3 3.5v15.2c0 1 .8 1.8 1.8 1.8H21" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /><path d="m7 14.5 3.6-3.8 3 2.6L20 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M16.4 6.6H20v3.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></>,
  layers: <><path d="m12 3 9 4.7-9 4.7-9-4.7z" fill="currentColor" /><path d="m3 12.1 9 4.7 9-4.7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" /><path d="m3 16.2 9 4.7 9-4.7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="m7.8 12.3 2.8 2.8 5.6-5.8" stroke={W} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  xCircle: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="m8.8 8.8 6.4 6.4m0-6.4-6.4 6.4" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  clock: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 7v5.3l3.3 2" stroke={W} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  pause: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M10 8.5v7M14 8.5v7" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  ban: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.3" /><path d="m5.9 5.9 12.2 12.2" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></>,
  info: <><circle cx="12" cy="12" r="10" fill="currentColor" /><circle cx="12" cy="7.6" r="1.35" fill={W} /><path d="M12 10.8v6" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  bang: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 7v6" stroke={W} strokeWidth="2.4" strokeLinecap="round" /><circle cx="12" cy="16.4" r="1.3" fill={W} /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.6" fill="currentColor" /><path d="M3 9.4h18" stroke={W} strokeWidth="1.6" /><path d="M8 2.8v3.4M16 2.8v3.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><rect x="7" y="12.4" width="3.2" height="3" rx=".7" fill={W} /><rect x="13.8" y="12.4" width="3.2" height="3" rx=".7" fill={W} opacity=".7" /></>,
  play: <><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2.1" /><path d="M10 8.4 16 12l-6 3.6z" fill="currentColor" /></>,
  clipboard: <><rect x="4.5" y="4" width="15" height="17" rx="2.2" fill="currentColor" /><rect x="8.5" y="2.6" width="7" height="3.6" rx="1.2" fill="currentColor" stroke={W} strokeWidth="1.2" /><path d="m8.3 13.1 2.3 2.3 4.8-4.8" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  sitemap: <><rect x="9" y="2.6" width="6" height="5" rx="1.4" fill="currentColor" /><rect x="2.5" y="16.4" width="6" height="5" rx="1.4" fill="currentColor" opacity=".85" /><rect x="15.5" y="16.4" width="6" height="5" rx="1.4" fill="currentColor" opacity=".85" /><path d="M12 7.6v4.2M5.5 16.4v-2.6h13v2.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></>,
  gear: <><path d="M12 2.5l2 2.2 2.9-.6.9 2.8 2.8.9-.6 2.9 2.2 2-2.2 2 .6 2.9-2.8.9-.9 2.8-2.9-.6-2 2.2-2-2.2-2.9.6-.9-2.8-2.8-.9.6-2.9-2.2-2 2.2-2-.6-2.9 2.8-.9.9-2.8 2.9.6z" fill="currentColor" /><circle cx="12" cy="12" r="3.3" fill={W} /></>,
  download: <><path d="M12 3.5v11m0 0-4.3-4.3M12 14.5l4.3-4.3" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16.5v2.6c0 .8.7 1.4 1.4 1.4h13.2c.8 0 1.4-.6 1.4-1.4v-2.6" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></>,
  upload: <><path d="M12 15V4m0 0L7.7 8.3M12 4l4.3 4.3" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16.5v2.6c0 .8.7 1.4 1.4 1.4h13.2c.8 0 1.4-.6 1.4-1.4v-2.6" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></>,
  copy: <><rect x="8.5" y="3" width="12.5" height="15" rx="2.2" fill="currentColor" /><path d="M15.5 21H5.2A2.2 2.2 0 0 1 3 18.8V7.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></>,
  plusCircle: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 7.6v8.8M7.6 12h8.8" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" />,
  eye: <><path d="M1.8 12C4.2 7.6 7.8 5.4 12 5.4s7.8 2.2 10.2 6.6c-2.4 4.4-6 6.6-10.2 6.6S4.2 16.4 1.8 12z" fill="currentColor" /><circle cx="12" cy="12" r="3.6" fill={W} /><circle cx="12" cy="12" r="1.8" fill="currentColor" /></>,
  trash: <><path d="M4 6.5h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M9 6V4.6c0-.6.5-1.1 1.1-1.1h3.8c.6 0 1.1.5 1.1 1.1V6" fill="none" stroke="currentColor" strokeWidth="1.9" /><path d="M5.8 8.2h12.4l-.9 11a1.9 1.9 0 0 1-1.9 1.8H8.6a1.9 1.9 0 0 1-1.9-1.8z" fill="currentColor" /><path d="M10 11.2v6M14 11.2v6" stroke={W} strokeWidth="1.7" strokeLinecap="round" /></>,
  headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><rect x="2.4" y="13" width="4.6" height="7" rx="2.3" fill="currentColor" /><rect x="17" y="13" width="4.6" height="7" rx="2.3" fill="currentColor" /><path d="M19.3 20v.6a2.4 2.4 0 0 1-2.4 2.4H13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  bolt: <path d="M13.5 2.5 4.8 13.6h6.4l-1 7.9 8.9-11.3h-6.5z" fill="currentColor" />,
  bank: <><path d="M12 2.6 22 7.4v2.2H2V7.4z" fill="currentColor" /><path d="M5 11.6v6.2M9.6 11.6v6.2M14.4 11.6v6.2M19 11.6v6.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><rect x="2" y="19.2" width="20" height="2.4" rx="1.2" fill="currentColor" /></>,
  refresh: <><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M20.6 3.6v4.8h-4.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></>,
  grip: <><circle cx="9" cy="6" r="1.6" fill="currentColor" /><circle cx="15" cy="6" r="1.6" fill="currentColor" /><circle cx="9" cy="12" r="1.6" fill="currentColor" /><circle cx="15" cy="12" r="1.6" fill="currentColor" /><circle cx="9" cy="18" r="1.6" fill="currentColor" /><circle cx="15" cy="18" r="1.6" fill="currentColor" /></>,
  filePdf: <><path d="M6.5 3h7.2L19 8.3V19a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#dc2626" /><path d="M13.6 3.2v4a1 1 0 0 0 1 1h4" fill="none" stroke={W} strokeWidth="1.2" opacity=".8" /><text x="12" y="17.4" fontSize="6.2" fontWeight="700" fill={W} textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">PDF</text></>,
  fileSheet: <><path d="M6.5 3h7.2L19 8.3V19a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#16a34a" /><path d="M13.6 3.2v4a1 1 0 0 0 1 1h4" fill="none" stroke={W} strokeWidth="1.2" opacity=".8" /><text x="12" y="17.4" fontSize="5.6" fontWeight="700" fill={W} textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">XLS</text></>,
};

export function Glyph({ name, size = 24, style, className = '' }) {
  const g = GLYPHS[name];
  if (!g) return <Icon name={name} size={size} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className} style={style}>{g}</svg>;
}

/** A tinted rounded square holding a glyph — tiles, rows, panel heads. */
export const Mark = ({ glyph, tone = 'indigo', size = 52, glyphSize, round = false, className = '' }) => (
  <span className={`pr-mark pr-t-${tone}${round ? ' pr-mark--round' : ''} ${className}`} style={{ width: size, height: size }}>
    <Glyph name={glyph} size={glyphSize || Math.round(size * 0.46)} />
  </span>
);

/* ── The section bar ──────────────────────────────────────────────────────── */

/** The module's own tabs, drawn inside the page as the mockups do. */
export const PAYROLL_TABS = [
  { to: '/admin/payroll/dashboard',   label: 'Dashboard',   glyph: 'home' },
  { to: '/admin/payroll/runs',        label: 'Payroll Runs', glyph: 'play' },
  { to: '/admin/payroll/assignments', label: 'Assignments', glyph: 'docFill' },
  { to: '/admin/payroll/structures',  label: 'Structures',  glyph: 'sitemap' },
  { to: '/admin/payroll/adjustments', label: 'Adjustments', glyph: 'wallet' },
  { to: '/admin/payroll/reports',     label: 'Reports',     glyph: 'bars' },
  // Settings carries the audit log with it: both answer "what is this module
  // doing and who did it", and neither earns a tab of its own.
  { to: '/admin/payroll/settings',    label: 'Settings',    glyph: 'gear' },
];

/** The employee's two screens, in the same strip so the module reads as one. */
export const PAYROLL_MY_TABS = [
  { to: '/teacher/payroll/ctc',      label: 'My Salary',    glyph: 'wallet' },
  { to: '/teacher/payroll/payslips', label: 'Salary Slips', glyph: 'docFill' },
];

export const Crumbs = ({ trail }) => (
  <nav className="pr-crumbs" aria-label="Breadcrumb">
    {trail.map((t, i) => (
      <React.Fragment key={`${t.label}-${i}`}>
        {i > 0 && <Icon name="chevronRight" size={13} />}
        {t.to && i < trail.length - 1
          ? <Link to={t.to}>{t.label}</Link>
          : <span aria-current={i === trail.length - 1 ? 'page' : undefined}>{t.label}</span>}
      </React.Fragment>
    ))}
  </nav>
);

/**
 * Tabs on the left, the academic-year picker and the screen's primary action on
 * the right. Every payroll screen starts with this, so the tab strip, the year
 * and the main button are always in the same place.
 */
export function SectionBar({ tabs = PAYROLL_TABS, years = [], year, onYear, children, hideYear, yearLabel = 'Academic Year', yearOptions }) {
  const current = years.find(y => String(y._id) === String(year)) || years.find(y => y.status === 'active') || years[0];
  return (
    <div className="pr-bar">
      <nav className="pr-tabs" aria-label="Payroll sections">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `pr-tab${isActive ? ' is-on' : ''}`}>
            <Glyph name={t.glyph} size={16} />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="pr-bar__end">
        {!hideYear && yearOptions?.length > 0 && (
          <label className="pr-yearpick">
            <Mark glyph="calendar" tone="indigo" size={30} glyphSize={16} />
            <span className="pr-yearpick__txt">
              <small>{yearLabel}</small>
              <b>{year || yearOptions[0]}</b>
            </span>
            <Icon name="chevronDown" size={15} style={{ color: 'var(--pr-muted)' }} />
            <select value={year || yearOptions[0]} onChange={e => onYear?.(e.target.value)} aria-label={yearLabel}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}
        {!hideYear && !yearOptions && years.length > 0 && (
          <label className="pr-yearpick">
            <Mark glyph="calendar" tone="indigo" size={30} glyphSize={16} />
            <span className="pr-yearpick__txt">
              <small>{yearLabel}</small>
              <b>{current?.yearName || '—'}</b>
            </span>
            <Icon name="chevronDown" size={15} style={{ color: 'var(--pr-muted)' }} />
            <select value={current?._id || ''} onChange={e => onYear?.(e.target.value)} aria-label={yearLabel}>
              {years.map(y => <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (Active)' : ''}</option>)}
            </select>
          </label>
        )}
        {children}
      </div>
    </div>
  );
}

/* ── Page furniture ───────────────────────────────────────────────────────── */

export const PrHead = ({ title, subtitle, children }) => (
  <header className="pr-head">
    <div className="pr-head__text">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="pr-head__acts">{children}</div> : null}
  </header>
);

/** ‹ September 2026 / Current Month › — the dashboard's month stepper. */
export function MonthStepper({ month, year, onChange, isCurrent, max }) {
  const step = (delta) => {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    onChange(m, y);
  };
  const atMax = max && (year > max.year || (year === max.year && month >= max.month));
  return (
    <div className="pr-month">
      <Mark glyph="calendar" tone="indigo" size={34} glyphSize={18} />
      <span className="pr-month__txt">
        <b>{MONTHS[month - 1]} {year}</b>
        <small>{isCurrent ? 'Current Month' : 'Selected Month'}</small>
      </span>
      <button type="button" className="pr-month__nav" onClick={() => step(-1)} aria-label="Previous month">
        <Icon name="chevronLeft" size={16} />
      </button>
      <button type="button" className="pr-month__nav" onClick={() => step(1)} disabled={atMax} aria-label="Next month">
        <Icon name="chevronRight" size={16} />
      </button>
    </div>
  );
}

export const Btn = ({ variant = 'outline', icon, glyph, children, className = '', size, loading, ...rest }) => (
  <button type="button" className={`pr-btn pr-btn--${variant}${size ? ` pr-btn--${size}` : ''} ${className}`} disabled={loading || rest.disabled} {...rest}>
    {loading ? <Spinner /> : glyph ? <Glyph name={glyph} size={17} /> : icon ? <Icon name={icon} size={17} /> : null}
    {children}
  </button>
);

const Spinner = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite" />
    </path>
  </svg>
);
export { Spinner };

export const Card = ({ className = '', children, ...rest }) => <section className={`pr-card ${className}`} {...rest}>{children}</section>;

export const CardHead = ({ title, sub, glyph, tone = 'indigo', children }) => (
  <div className="pr-cardhead">
    <div className="pr-cardhead__t">
      {glyph ? <Mark glyph={glyph} tone={tone} size={30} glyphSize={16} /> : null}
      <div style={{ minWidth: 0 }}>
        <h3>{title}</h3>
        {sub ? <p>{sub}</p> : null}
      </div>
    </div>
    {children ? <div className="pr-cardhead__acts">{children}</div> : null}
  </div>
);

export const LinkBtn = ({ children = 'View all', onClick, to, arrow = true }) => (
  to
    ? <Link className="pr-link" to={to}>{children}{arrow ? <Icon name="arrowRight" size={15} /> : null}</Link>
    : <button type="button" className="pr-link" onClick={onClick}>{children}{arrow ? <Icon name="arrowRight" size={15} /> : null}</button>
);

/* ── Tiles ────────────────────────────────────────────────────────────────── */

export const Tiles = ({ n = 4, children }) => <div className={`pr-tiles pr-tiles--${n}`}>{children}</div>;

/**
 * One figure. `valueFirst` is the mockup-2 layout (figure, then label); the
 * default is label over value, as the dashboard and the reports screen draw it.
 */
export function Tile({ glyph, tone = 'indigo', label, value, small, valueFirst, caption, delta, share, badge, onClick, on }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`pr-tile${valueFirst ? ' pr-tile--vf' : ''}${onClick ? ' is-click' : ''}${on ? ' is-on' : ''}`}>
      <Mark glyph={glyph} tone={tone} size={52} />
      <div className="pr-tile__body">
        {valueFirst ? (
          <>
            <div className={`pr-tile__value${small ? ' pr-tile__value--sm' : ''}`}>{value}</div>
            <div className="pr-tile__label">{label}</div>
            {share ? (
              <>
                <div className="pr-tile__pct">{share.pct}%</div>
                <div className="pr-share"><span style={{ width: `${Math.min(100, Math.max(0, share.pct))}%`, background: share.color }} /></div>
              </>
            ) : caption ? <div className="pr-tile__cap">{caption}</div> : null}
          </>
        ) : (
          <>
            <div className="pr-tile__label">{label}</div>
            <div className="pr-tile__valrow">
              <span className={`pr-tile__value${small ? ' pr-tile__value--sm' : ''}`}>{value}</span>
              {delta ? <Delta {...delta} bare /> : null}
            </div>
            {(delta?.caption ?? caption) ? <div className="pr-tile__cap">{delta?.caption ?? caption}</div> : null}
          </>
        )}
      </div>
      {badge ? <span className={`pr-tile__badge pr-b-${badge.tone}`}>{badge.text}</span> : null}
    </Tag>
  );
}

/**
 * "↑ 12% vs last month". The arrow follows the change; the colour follows
 * whether that direction is good — deductions going up is not.
 */
/**
 * "↑ 12%". The arrow follows the change; the colour follows whether that
 * direction is good — deductions going up is not.
 *
 * `bare` omits the caption, because the tile prints it on its own line below
 * the figure the way the mockups draw it.
 */
export function Delta({ pct, upIsGood = true, caption = 'vs last month', bare }) {
  const cap = bare || !caption ? null : <div className="pr-delta__cap">{caption}</div>;
  if (pct === null || pct === undefined) {
    return (<><div className="pr-delta pr-delta--none">New</div>{cap}</>);
  }
  const up = pct > 0, flat = Math.abs(pct) < 0.05;
  const good = flat ? null : (up === upIsGood);
  return (
    <>
      <div className={`pr-delta${good === true ? ' is-good' : good === false ? ' is-bad' : ''}`}>
        {!flat ? <Icon name={up ? 'arrowUp' : 'arrowDown'} size={14} /> : null}
        {Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)) : +Math.abs(pct).toFixed(1)}%
      </div>
      {cap}
    </>
  );
}

/* ── Inputs ───────────────────────────────────────────────────────────────── */

export function Select({ value, onChange, options = [], all, className = '', disabled, ariaLabel }) {
  return (
    <div className={`pr-select ${className}`}>
      <select value={value ?? ''} onChange={e => onChange?.(e.target.value)} disabled={disabled} aria-label={ariaLabel}>
        {all ? <option value="">{all}</option> : null}
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      <Icon name="chevronDown" size={15} />
    </div>
  );
}

export function Search({ value, onChange, placeholder = 'Search…', onEnter, className = '' }) {
  return (
    <div className={`pr-search ${className}`}>
      <Icon name="search" size={17} />
      <input value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onEnter?.(); }} />
    </div>
  );
}

export const Field = ({ label, required, hint, error, children, className = '' }) => (
  <div className={`pr-field ${className}`}>
    {label ? <label className={`pr-label${required ? ' pr-label--req' : ''}`}>{label}</label> : null}
    {children}
    {error ? <div className="pr-err">{error}</div> : hint ? <div className="pr-hint">{hint}</div> : null}
  </div>
);

export const Row = ({ n = 2, children, className = '' }) => <div className={`pr-row pr-row--${n} ${className}`}>{children}</div>;

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 999, border: 0, padding: 2, flexShrink: 0,
        background: checked ? 'var(--pr-primary)' : '#cbd5e1', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .5 : 1, transition: 'background .15s ease', display: 'inline-flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
      }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', display: 'block', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
    </button>
  );
}

export function Check({ checked, indeterminate, onChange, label }) {
  return (
    <button type="button" role="checkbox" aria-checked={indeterminate ? 'mixed' : !!checked} aria-label={label}
      className={`pr-check${checked ? ' is-on' : ''}${indeterminate ? ' is-part' : ''}`}
      onClick={() => onChange(!checked)}>
      {indeterminate ? <Icon name="minus" size={11} /> : checked ? <Icon name="check" size={12} /> : null}
    </button>
  );
}

/* ── Pill tabs ────────────────────────────────────────────────────────────── */

export const PillTabs = ({ items, value, onChange }) => (
  <div className="pr-pills" role="tablist">
    {items.map(it => (
      <button key={it.value} type="button" role="tab" aria-selected={value === it.value}
        className={`pr-pill${value === it.value ? ' is-on' : ''}`} onClick={() => onChange(it.value)}>
        {it.label}
        {it.count !== undefined ? <span className="pr-pill__n">({it.count})</span> : null}
      </button>
    ))}
  </div>
);

/* ── Badges, avatars, cells ───────────────────────────────────────────────── */

export const Badge = ({ tone = 'slate', dot, children }) => (
  <span className={`pr-badge pr-b-${tone}`}>{dot ? <i className="pr-dot" /> : null}{children}</span>
);

export const StatusBadge = ({ status, map = RUN_STATUS, dot }) => {
  const [tone, label] = map[status] || ['slate', status || '—'];
  return <Badge tone={tone} dot={dot}>{label}</Badge>;
};

export const Avatar = ({ name, size = 36 }) => (
  <span className="pr-avatar" style={{ width: size, height: size, background: avatarTone(name), fontSize: size * 0.34 }}>
    {initials(name)}
  </span>
);

export const Who = ({ name, sub, size = 36 }) => (
  <div className="pr-who">
    <Avatar name={name} size={size} />
    <div className="pr-who__txt"><b>{name || '—'}</b>{sub ? <small>{sub}</small> : null}</div>
  </div>
);

export const Cell2 = ({ top, bottom }) => (
  <div className="pr-cell2"><b>{top}</b>{bottom ? <small>{bottom}</small> : null}</div>
);

export const IconBtn = ({ icon, glyph, label, onClick, bordered, danger, disabled, title }) => (
  <button type="button" aria-label={label} title={title || label} onClick={onClick} disabled={disabled}
    className={`pr-iconbtn${bordered ? ' pr-iconbtn--bordered' : ''}${danger ? ' pr-iconbtn--danger' : ''}`}>
    {glyph ? <Glyph name={glyph} size={16} /> : <Icon name={icon} size={16} />}
  </button>
);

/** A "⋮" that opens a small menu, anchored to the button and closed on any outside click. */
export function RowMenu({ children, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', () => setOpen(false), true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setOpen(o => !o);
  };
  return (
    <span ref={ref} style={{ display: 'inline-flex' }}>
      <IconBtn icon="dotsV" label={label} onClick={toggle} />
      {open && pos && createPortal(
        <div role="menu" onClick={() => setOpen(false)}
          style={{
            position: 'fixed', top: pos.top, right: pos.right, zIndex: 1300, minWidth: 194,
            background: '#fff', border: '1px solid var(--pr-line)', borderRadius: 11,
            boxShadow: '0 12px 30px rgba(15,23,42,.16)', padding: 6,
          }}>
          {children}
        </div>, document.body)}
    </span>
  );
}

export const MenuItem = ({ icon, glyph, danger, onClick, disabled, children }) => (
  <button type="button" role="menuitem" onClick={onClick} disabled={disabled}
    style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px',
      border: 0, background: 'none', font: 'inherit', fontSize: '.85rem', textAlign: 'left',
      borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
      color: danger ? '#dc2626' : 'var(--pr-ink-2)', opacity: disabled ? .45 : 1,
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = danger ? '#fef2f2' : '#f5f7fb'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
    {glyph ? <Glyph name={glyph} size={16} /> : icon ? <Icon name={icon} size={16} /> : null}
    {children}
  </button>
);

/* ── Table shell ──────────────────────────────────────────────────────────── */

export const TableWrap = ({ children }) => <div className="pr-tablewrap">{children}</div>;

export const SortTh = ({ label, field, sort, dir, onSort, align }) => (
  <th className={`pr-sortable${sort === field ? ' is-on' : ''}`} style={align === 'right' ? { textAlign: 'right' } : undefined}
    onClick={() => onSort(field)}>
    {label}<Icon name={sort === field && dir === 'asc' ? 'arrowUp' : 'arrowDown'} size={12} />
  </th>
);

/* ── Bulk selection ───────────────────────────────────────────────────────── */

/** Appears above a table once rows are ticked; `children` are the actions. */
export const BulkBar = ({ count, noun = 'selected', onClear, children }) => {
  if (!count) return null;
  return (
    <div className="pr-bulk">
      <Icon name="checkCircle" size={17} />
      {count} {noun}
      <div className="pr-bulk__acts">
        {children}
        <Btn size="sm" variant="ghost" onClick={onClear}>Clear</Btn>
      </div>
    </div>
  );
};

/**
 * Run `fn` over every id and report what happened.
 *
 * There is no bulk endpoint behind these: each row is its own audited write,
 * and the server refuses individually (a published run cannot be deleted, an
 * assignment that has been paid cannot be removed). Reporting per row is
 * therefore the honest thing to do — "3 of 5 done" plus the first reason,
 * rather than a blanket success or a blanket failure.
 */
export async function runBulk(ids, fn) {
  const results = await Promise.allSettled(ids.map(fn));
  const failed = results.filter(r => r.status === 'rejected');
  return {
    ok: results.length - failed.length,
    failed: failed.length,
    reason: failed[0]?.reason?.message || '',
  };
}

/* ── Pager ────────────────────────────────────────────────────────────────── */

export function Pager({ page = 1, pages = 1, total = 0, limit = 10, noun = 'records', onPage, onLimit, sizes = [10, 20, 50] }) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const window2 = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let p = start; p <= Math.min(pages, start + 4); p++) window2.push(p);
  return (
    <div className="pr-pager">
      <span>Showing {from} to {to} of {total} {noun}</span>
      <div className="pr-pager__pages">
        <button type="button" className="pr-pg" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <Icon name="chevronLeft" size={14} />
        </button>
        {window2.map(p => (
          <button key={p} type="button" className={`pr-pg${p === page ? ' is-on' : ''}`} onClick={() => onPage(p)}>{p}</button>
        ))}
        <button type="button" className="pr-pg" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <Icon name="chevronRight" size={14} />
        </button>
        {onLimit ? (
          <Select value={String(limit)} onChange={v => onLimit(+v)} ariaLabel="Rows per page"
            options={sizes.map(s => ({ value: String(s), label: `${s} per page` }))} />
        ) : null}
      </div>
    </div>
  );
}

/* ── Rail pieces ──────────────────────────────────────────────────────────── */

export const Panel = ({ title, sub, glyph, tone, status, children, flush }) => (
  <section className="pr-panel">
    {(title || status) && (
      <div className="pr-panel__head">
        {glyph ? <Mark glyph={glyph} tone={tone || 'indigo'} size={32} glyphSize={17} /> : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{title}</h3>
          {sub ? <p>{sub}</p> : null}
        </div>
        {status}
      </div>
    )}
    {flush ? children : <div className="pr-panel__body">{children}</div>}
  </section>
);

export const Facts = ({ children }) => <div className="pr-facts">{children}</div>;
export const Fact = ({ label, glyph, children }) => (
  <div className="pr-fact">
    {glyph ? <Mark glyph={glyph} tone="slate" size={28} glyphSize={15} /> : null}
    <span className="pr-fact__k">{label}</span>
    <span className="pr-fact__v">{children}</span>
  </div>
);

/** 1 Configure — 2 Review — 3 Process — 4 Complete */
export const Steps = ({ step = 1, labels = RUN_STEPS }) => (
  <div className="pr-steps">
    {labels.map((l, i) => (
      <div key={l} className={`pr-step${i + 1 < step ? ' is-done' : ''}${i + 1 === step ? ' is-on' : ''}`}>
        <span className="pr-step__n">{i + 1 < step ? <Icon name="check" size={13} /> : i + 1}</span>
        <small>{l}</small>
      </div>
    ))}
  </div>
);

export const QuickActions = ({ title = 'Quick Actions', items = [] }) => (
  <Panel title={title} flush>
    <div className="pr-qa">
      {items.filter(Boolean).map(it => {
        const inner = (
          <>
            <Mark glyph={it.glyph} tone={it.tone || 'indigo'} size={34} glyphSize={17} />
            <span className="pr-qarow__t"><b>{it.label}</b>{it.hint ? <small>{it.hint}</small> : null}</span>
            <Icon name="chevronRight" size={16} />
          </>
        );
        return it.to
          ? <Link key={it.label} className="pr-qarow" to={it.to}>{inner}</Link>
          : <button key={it.label} type="button" className="pr-qarow" onClick={it.onClick} disabled={it.disabled}>{inner}</button>;
      })}
    </div>
  </Panel>
);

export const HelpCard = ({ title = 'Need Help?', text, action, onAction }) => (
  <div className="pr-help">
    <Mark glyph="headset" tone="purple" size={40} glyphSize={20} />
    <div className="pr-help__t"><b>{title}</b><small>{text}</small></div>
    {action ? <Btn size="sm" onClick={onAction}>{action}</Btn> : null}
  </div>
);

export const Note = ({ tone = 'blue', glyph = 'info', title, children, action }) => (
  <div className={`pr-note pr-note--${tone}`}>
    <Glyph name={glyph} size={19} />
    <p>{title ? <b>{title} </b> : null}{children}</p>
    {action}
  </div>
);

/* ── Empty & loading ──────────────────────────────────────────────────────── */

export const Empty = ({ glyph = 'docFill', tone = 'slate', title = 'Nothing here yet', hint, children }) => (
  <div className="pr-empty">
    <Mark glyph={glyph} tone={tone} size={58} className="pr-empty__mark" />
    <b>{title}</b>
    {hint ? <p>{hint}</p> : null}
    {children}
  </div>
);

export const Loading = ({ rows = 5 }) => (
  <div className="pr-skel" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => <i key={i} style={{ width: `${100 - (i % 3) * 14}%` }} />)}
  </div>
);

/* ── Modal & drawer ───────────────────────────────────────────────────────── */

export function Modal({ open, onClose, title, sub, glyph, tone, wide, children, footer, note }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="pr-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="pr-modal" style={wide ? { maxWidth: wide === true ? 880 : wide } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="pr-modal__head">
          {glyph ? <Mark glyph={glyph} tone={tone || 'indigo'} size={40} glyphSize={20} /> : null}
          <div>
            <h3>{title}</h3>
            {sub ? <p>{sub}</p> : null}
          </div>
          <IconBtn icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="pr-modal__body">{children}</div>
        {footer ? (
          <div className="pr-modal__foot">
            {note ? <span className="pr-modal__note">{note}</span> : null}
            {footer}
          </div>
        ) : null}
      </div>
    </div>, document.body);
}

export function Drawer({ open, onClose, title, sub, glyph, tone, status, children, footer, width }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="pr-scrim" style={{ padding: 0 }} onMouseDown={onClose} />
      <aside className="pr-drawer" style={width ? { width: `min(${width}px, 100vw)` } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="pr-drawer__head">
          {glyph ? <Mark glyph={glyph} tone={tone || 'indigo'} size={44} glyphSize={22} /> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700 }}>{title}</h3>
            {sub ? <p style={{ margin: '3px 0 0', fontSize: '.82rem', color: 'var(--pr-muted)' }}>{sub}</p> : null}
          </div>
          {status}
          <IconBtn icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="pr-drawer__body">{children}</div>
        {footer ? <div className="pr-drawer__foot">{footer}</div> : null}
      </aside>
    </>, document.body);
}

/* ── Salary ledger (earnings / deductions / net) ──────────────────────────── */

export const Ledger = ({ title, right = 'Amount', rows = [], total, tone }) => (
  <div className="pr-ledger">
    <div className="pr-ledger__head"><span>{title}</span><span>{right}</span></div>
    {rows.length === 0 ? (
      <div className="pr-ledger__row"><span style={{ color: 'var(--pr-faint)' }}>None</span><b>{money(0)}</b></div>
    ) : rows.map((r, i) => (
      <div className="pr-ledger__row" key={`${r.name}-${i}`}>
        <span>{r.name}{r.note ? <small>{r.note}</small> : null}</span>
        <b style={tone === 'red' ? { color: '#dc2626' } : undefined}>{money(r.amount, { dec: 0 })}</b>
      </div>
    ))}
    {total !== undefined ? (
      <div className="pr-ledger__row pr-ledger__row--total"><span>Total</span><b>{money(total)}</b></div>
    ) : null}
  </div>
);

export const NetBar = ({ label = 'Net Salary', value }) => (
  <div className="pr-ledger pr-ledger--net">
    <div className="pr-ledger__row"><span>{label}</span><b>{money(value)}</b></div>
  </div>
);

/* ── Files ────────────────────────────────────────────────────────────────── */

/** Save a Blob (or text) the browser already has, without a round trip. */
export function saveFile(data, name, type = 'text/csv;charset=utf-8') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Width of the element, following resizes, so text in an SVG is never scaled. */
export function useWidth(initial = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setW(Math.max(200, el.clientWidth || initial));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, w];
}
