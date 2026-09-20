/**
 * The Fees module's own UI kit (Sep 2026 redesign, to the user's mockups).
 *
 * Ten admin screens share one vocabulary: a page head with actions, a row of
 * tinted figure tiles, a filter card of labelled selects, pill tabs carrying
 * counts, a hand-written table in a card, a pager, and — on four screens — a
 * rail that answers "what about the row I picked". The mockups draw these
 * pieces slightly differently per screen (label-over-value tiles on some,
 * value-first on others; "₹12,000" here and "₹ 12,000" there), so the pieces
 * take a variant prop rather than one look being forced on all ten.
 *
 * CSS lives in styles/fees.css under the `fe-` prefix. Nothing here talks to
 * the network.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/ui/icons';
import '../../../styles/fees.css';

/* ── Formatting ───────────────────────────────────────────────────────────── */

/** Indian grouping. `space` puts a space after the symbol, as some mockups do. */
export function money(n, { sym = '₹', space = false, dec = 0 } = {}) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec || (Math.round(v) === v ? 0 : 2) });
  return `${v < 0 ? '−' : ''}${sym}${space ? ' ' : ''}${s}`;
}

/** Axis money: ₹6L, ₹1.5L, ₹40K. */
export function compactMoney(n, sym = '₹') {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e7) return `${sym}${+(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `${sym}${+(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `${sym}${+(v / 1e3).toFixed(1)}K`;
  return `${sym}${v}`;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "08 Sep 2026". */
export function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${String(x.getDate()).padStart(2, '0')} ${MON[x.getMonth()]} ${x.getFullYear()}`;
}
/** "08 Sep 2026, 10:24 AM". */
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
export function ago(d) {
  if (!d) return '';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) === 1 ? '' : 's'} ago`;
  const days = Math.floor(s / 86400);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? '' : 's'} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) === 1 ? '' : 's'} ago`;
}
export const plural = (n, one, many) => `${Number(n || 0).toLocaleString('en-IN')} ${n === 1 ? one : many || `${one}s`}`;

export function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '—';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/* ── Vocabulary shared by several screens ─────────────────────────────────── */

export const FREQUENCY = {
  recurring: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half-Yearly', yearly: 'Yearly', one_time: 'One Time',
};
export const FREQUENCY_OPTIONS = ['recurring', 'quarterly', 'half_yearly', 'yearly', 'one_time'].map(v => ({ value: v, label: FREQUENCY[v] }));

/** How each payment mode is written. `long` is the Payments screen's wording. */
export const MODE = {
  cash: 'Cash', card: 'Card', upi: 'Online (UPI)', bank_transfer: 'Net Banking', online: 'Online',
  cheque: 'Cheque', dd: 'Demand Draft',
};
export const MODE_LONG = { ...MODE, bank_transfer: 'Online (Net Banking)' };
export const COUNTER_MODES = ['cash', 'card', 'upi', 'bank_transfer', 'cheque', 'dd'];

export const ELIGIBILITY = {
  selected: 'Selected Students', all: 'All Students', siblings: 'Siblings', staff_children: 'Staff Children',
  female: 'Female Students', alumni_children: 'Alumni Children', new_admissions: 'New Admissions',
};
export const FINE_APPLIES = { all: 'All Students', classes: 'Selected Classes', transport: 'Transport Users', hostel: 'Hostel Students' };

/** Status → badge tone and word, one table for every screen. */
export const STATUS = {
  completed: ['green', 'Success'], pending: ['amber', 'Pending'], failed: ['red', 'Failed'], refunded: ['slate', 'Cancelled'],
  paid: ['green', 'Paid'], partial: ['amber', 'Partial'], none: ['slate', 'Not Charged'],
  active: ['green', 'Active'], inactive: ['red', 'Inactive'], upcoming: ['amber', 'Upcoming'], archived: ['slate', 'Archived'],
};
/** Student-fee "pending" is a debt, so it is red there, not the amber of a waiting payment. */
export const DUE_STATUS = { ...STATUS, pending: ['red', 'Pending'] };

/** One tint per person, stable across renders. */
const AV_TONES = ['#60a5fa', '#ec4899', '#6366f1', '#a855f7', '#14b8a6', '#f59e0b', '#6366f1', '#f43f5e', '#3b82f6', '#8b5cf6'];
export function avatarTone(key) {
  let h = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_TONES[h % AV_TONES.length];
}

/* ── Glyphs ───────────────────────────────────────────────────────────────── */
// The mockups' tile and row icons are solid shapes with white detail, not the
// app's outline set, so the module draws its own. 24×24, currentColor.

const W = '#fff';
const GLYPHS = {
  moneyBag: <><path d="M9 3.5h6l-1.4 2.6h-3.2z" fill="currentColor" /><path d="M8.6 7.2h6.8c2.8 2.3 5.1 5.6 5.1 8.7 0 3.1-2.6 4.6-8.5 4.6s-8.5-1.5-8.5-4.6c0-3.1 2.3-6.4 5.1-8.7z" fill="currentColor" /><path d="M13.6 11.1c-.4-.6-1-.9-1.7-.9-1 0-1.7.5-1.7 1.3 0 1.9 3.6 1 3.6 3 0 .8-.8 1.4-1.9 1.4-.8 0-1.5-.3-1.9-.9M12 9.2v1m0 6.2v1" stroke={W} strokeWidth="1.5" strokeLinecap="round" fill="none" /></>,
  alertTri: <><path d="M10.3 3.9a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z" fill="currentColor" /><path d="M12 9v4.5" stroke={W} strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="16.6" r="1.2" fill={W} /></>,
  users: <><circle cx="8.6" cy="8.3" r="3.2" fill="currentColor" /><circle cx="16.2" cy="8.8" r="2.7" fill="currentColor" opacity=".85" /><path d="M2.6 19c0-3.4 2.7-6 6-6s6 2.6 6 6z" fill="currentColor" /><path d="M14.8 19c0-1.9-.6-3.6-1.7-4.9.9-.5 2-.8 3.1-.8 2.9 0 5.2 2.3 5.2 5.2v.5z" fill="currentColor" opacity=".85" /></>,
  doc: <><path d="M6.5 3h7.2L19 8.3V19a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /><path d="M13.5 3.2v5h5M8.2 12.5h7.4M8.2 16h7.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" fill="none" /></>,
  docFill: <><path d="M6.5 3h7.2L19 8.3V19a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="currentColor" /><path d="M8.3 12.2h7.4M8.3 15.8h5" stroke={W} strokeWidth="1.8" strokeLinecap="round" /><path d="M13.6 3.2v4a1 1 0 0 0 1 1h4" fill="none" stroke={W} strokeWidth="1.2" opacity=".7" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="m7.8 12.3 2.8 2.8 5.6-5.8" stroke={W} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  clock: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 7v5.3l3.3 2" stroke={W} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  clockRing: <><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M12 7.4v4.8l3 1.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" /></>,
  xCircle: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="m8.8 8.8 6.4 6.4m0-6.4-6.4 6.4" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  bang: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 7v6" stroke={W} strokeWidth="2.4" strokeLinecap="round" /><circle cx="12" cy="16.4" r="1.3" fill={W} /></>,
  bangRing: <><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /><circle cx="12" cy="16.3" r="1.25" fill="currentColor" /></>,
  pause: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M10 8.5v7M14 8.5v7" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  rupee: <path d="M6.5 4.5h11M6.5 9h11M9.5 4.5c3.4 0 5.4 1.7 5.4 4.5s-2 4.5-5.4 4.5H7.3l7.9 7" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />,
  card: <><rect x="2.5" y="5" width="19" height="14" rx="2.6" fill="currentColor" /><path d="M2.5 9.3h19" stroke={W} strokeWidth="2.2" /><path d="M6 14.8h4" stroke={W} strokeWidth="1.8" strokeLinecap="round" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2" fill="currentColor" /><rect x="4.6" y="8" width="14.8" height="8" rx="1.2" fill="none" stroke={W} strokeWidth="1.2" /><circle cx="12" cy="12" r="2.4" fill={W} /></>,
  dots: <><circle cx="5.5" cy="12" r="2.2" fill="currentColor" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /><circle cx="18.5" cy="12" r="2.2" fill="currentColor" /></>,
  book: <><path d="M3 5.4c2.7-1 5.5-.8 8.2.8v13.3c-2.7-1.4-5.5-1.6-8.2-.7z" fill="currentColor" /><path d="M21 5.4c-2.7-1-5.5-.8-8.2.8v13.3c2.7-1.4 5.5-1.6 8.2-.7z" fill="currentColor" opacity=".78" /></>,
  layers: <><path d="m12 3 9 4.7-9 4.7-9-4.7z" fill="currentColor" /><path d="m3 12.1 9 4.7 9-4.7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" /><path d="m3 16.2 9 4.7 9-4.7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" /></>,
  trash: <><path d="M4 6.5h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M9 6V4.6c0-.6.5-1.1 1.1-1.1h3.8c.6 0 1.1.5 1.1 1.1V6" fill="none" stroke="currentColor" strokeWidth="1.9" /><path d="M5.8 8.2h12.4l-.9 11a1.9 1.9 0 0 1-1.9 1.8H8.6a1.9 1.9 0 0 1-1.9-1.8z" fill="currentColor" /><path d="M10 11.2v6M14 11.2v6" stroke={W} strokeWidth="1.7" strokeLinecap="round" /></>,
  grid: <><rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" /><rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".8" /><rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".8" /><rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" /></>,
  percent: <><path d="M18.5 5.5 5.5 18.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><circle cx="7.2" cy="7.2" r="2.6" fill="none" stroke="currentColor" strokeWidth="2.3" /><circle cx="16.8" cy="16.8" r="2.6" fill="none" stroke="currentColor" strokeWidth="2.3" /></>,
  eyeSlash: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M6.5 12c1.5-2.4 3.4-3.6 5.5-3.6s4 1.2 5.5 3.6c-1.5 2.4-3.4 3.6-5.5 3.6S8 14.4 6.5 12z" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill={W} /><path d="m5.6 5.6 12.8 12.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></>,
  bars: <><rect x="3.5" y="12" width="3.6" height="8" rx="1" fill="currentColor" /><rect x="8.8" y="7.5" width="3.6" height="12.5" rx="1" fill="currentColor" /><rect x="14.1" y="10" width="3.6" height="10" rx="1" fill="currentColor" /><path d="M3 3.5v17h18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  gradCap: <><path d="M1.8 9 12 4l10.2 5L12 14z" fill="currentColor" /><path d="M6.3 11.3v4.1c0 1.5 2.6 2.9 5.7 2.9s5.7-1.4 5.7-2.9v-4.1L12 14.2z" fill="currentColor" opacity=".85" /><path d="M21.2 9.5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  bus: <><rect x="4" y="3" width="16" height="15" rx="3" fill="currentColor" /><rect x="6" y="5.6" width="12" height="5.2" rx="1" fill={W} /><circle cx="8" cy="14.6" r="1.3" fill={W} /><circle cx="16" cy="14.6" r="1.3" fill={W} /><path d="M6.5 18v2.4M17.5 18v2.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></>,
  bed: <><path d="M2.5 6v13M2.5 15.2h19V19" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /><rect x="4.4" y="9.2" width="5" height="4.2" rx="1.6" fill="currentColor" /><path d="M10.6 9.2h7.6a3.3 3.3 0 0 1 3.3 3.3v1.4H10.6z" fill="currentColor" /></>,
  clipboard: <><rect x="4.5" y="4" width="15" height="17" rx="2.2" fill="currentColor" /><rect x="8.5" y="2.6" width="7" height="3.6" rx="1.2" fill="currentColor" stroke={W} strokeWidth="1.2" /><path d="m8.3 13.1 2.3 2.3 4.8-4.8" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  bookOpen: <><path d="M2.5 5.2c3-.9 6.1-.6 9.5 1v13.5c-3.4-1.6-6.5-1.9-9.5-1z" fill="currentColor" /><path d="M21.5 5.2c-3-.9-6.1-.6-9.5 1v13.5c3.4-1.6 6.5-1.9 9.5-1z" fill="currentColor" opacity=".75" /></>,
  flask: <><path d="M9.2 3h5.6M10 3v5.6L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 8.6V3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /><path d="M6.8 15.2h10.4l1.8 3.2a.9.9 0 0 1-.8 1.3H5.8a.9.9 0 0 1-.8-1.3z" fill="currentColor" /></>,
  monitor: <><rect x="2.5" y="3.5" width="19" height="13" rx="2.2" fill="currentColor" /><rect x="4.6" y="5.6" width="14.8" height="8.8" rx="1" fill={W} opacity=".35" /><path d="M8.5 20.5h7M12 16.5v4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" /></>,
  trophy: <><path d="M7 3.5h10v5.2a5 5 0 0 1-10 0z" fill="currentColor" /><path d="M7 5.2H4.2v1.6A3.2 3.2 0 0 0 7.4 10M17 5.2h2.8v1.6A3.2 3.2 0 0 1 16.6 10" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 13.7v3.3" stroke="currentColor" strokeWidth="2.2" /><rect x="7.8" y="17" width="8.4" height="3.6" rx="1" fill="currentColor" /></>,
  gear: <><path d="M12 2.5l2 2.2 2.9-.6.9 2.8 2.8.9-.6 2.9 2.2 2-2.2 2 .6 2.9-2.8.9-.9 2.8-2.9-.6-2 2.2-2-2.2-2.9.6-.9-2.8-2.8-.9.6-2.9-2.2-2 2.2-2-.6-2.9 2.8-.9.9-2.8 2.9.6z" fill="currentColor" /><circle cx="12" cy="12" r="3.3" fill={W} /></>,
  cutlery: <><path d="M6.5 3v7a2.4 2.4 0 0 0 4.8 0V3M8.9 3v18" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" /><path d="M17 21V3c-2.2 1.3-3.2 3.6-3.2 6.6V13H17" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.6" fill="currentColor" /><path d="M3 9.4h18" stroke={W} strokeWidth="1.6" /><path d="M8 2.8v3.4M16 2.8v3.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><rect x="7" y="12.4" width="3.2" height="3" rx=".7" fill={W} /><rect x="13.8" y="12.4" width="3.2" height="3" rx=".7" fill={W} opacity=".7" /></>,
  idCard: <><rect x="2.5" y="5" width="19" height="14" rx="2.4" fill="currentColor" /><circle cx="8.3" cy="11" r="2.1" fill={W} /><path d="M5.3 16.3c.5-1.6 1.6-2.4 3-2.4s2.5.8 3 2.4M13.5 10h5M13.5 13.6h3.6" stroke={W} strokeWidth="1.6" strokeLinecap="round" fill="none" /></>,
  heartHand: <><path d="M12 11.6 9.2 8.9a2 2 0 0 1 2.8-2.9 2 2 0 0 1 2.8 2.9z" fill="currentColor" /><path d="M2.5 14.5h3.2l3.6 1.6h4.4a1.6 1.6 0 0 1 0 3.2H9.5M13.7 17.6l5-2.6a1.6 1.6 0 0 1 2 2.4L15 21H7.4l-4.9-1.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></>,
  venus: <><circle cx="12" cy="9" r="5.3" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M12 14.3V21M9 18h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></>,
  shield: <><path d="M12 2.5 19.5 5.3V11c0 4.9-3.2 8.7-7.5 10.5C7.7 19.7 4.5 15.9 4.5 11V5.3z" fill="currentColor" /><path d="m8.8 11.9 2.2 2.2 4.3-4.4" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  briefcase: <><rect x="2.8" y="7" width="18.4" height="13" rx="2.3" fill="currentColor" /><path d="M8.6 7V5.2c0-.8.6-1.4 1.4-1.4h4c.8 0 1.4.6 1.4 1.4V7" fill="none" stroke="currentColor" strokeWidth="1.9" /><path d="M2.8 12.6h18.4M12 11.4v2.6" stroke={W} strokeWidth="1.6" strokeLinecap="round" /></>,
  plusCircle: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 7.6v8.8M7.6 12h8.8" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" />,
  bolt: <path d="M13.5 2.5 4.8 13.6h6.4l-1 7.9 8.9-11.3h-6.5z" fill="currentColor" />,
  download: <><path d="M12 3.5v11m0 0-4.3-4.3M12 14.5l4.3-4.3" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16.5v2.6c0 .8.7 1.4 1.4 1.4h13.2c.8 0 1.4-.6 1.4-1.4v-2.6" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></>,
  upload: <><path d="M12 15V4m0 0L7.7 8.3M12 4l4.3 4.3" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16.5v2.6c0 .8.7 1.4 1.4 1.4h13.2c.8 0 1.4-.6 1.4-1.4v-2.6" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></>,
  stop: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="m8.5 8.5 7 7" stroke={W} strokeWidth="2.4" strokeLinecap="round" /></>,
  info: <><circle cx="12" cy="12" r="10" fill="currentColor" /><circle cx="12" cy="7.6" r="1.35" fill={W} /><path d="M12 10.8v6" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  bulb: <><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="M12 5.8a4 4 0 0 0-2.4 7.2c.5.4.8 1 .8 1.6h3.2c0-.6.3-1.2.8-1.6A4 4 0 0 0 12 5.8zM10.5 17h3" fill={W} stroke={W} strokeWidth=".8" strokeLinecap="round" /></>,
  cloudCheck: <><path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.8a4.4 4.4 0 0 1-.6 8.7z" fill="currentColor" /><path d="m9.4 13.4 2 2 3.4-3.6" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z" fill="currentColor" /><path d="M10 20.3a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></>,
  receipt: <><path d="M5.5 2.8h13v18.4l-2.2-1.4-2.1 1.4-2.2-1.4-2.2 1.4-2.1-1.4-2.2 1.4z" fill="currentColor" /><path d="M8.5 8h7M8.5 11.6h7M8.5 15.2h4" stroke={W} strokeWidth="1.7" strokeLinecap="round" /></>,
  calculator: <><rect x="4.5" y="2.5" width="15" height="19" rx="2.4" fill="currentColor" /><rect x="7" y="5" width="10" height="4" rx=".8" fill={W} /><g fill={W}><circle cx="8.6" cy="12.4" r="1.1" /><circle cx="12" cy="12.4" r="1.1" /><circle cx="15.4" cy="12.4" r="1.1" /><circle cx="8.6" cy="15.6" r="1.1" /><circle cx="12" cy="15.6" r="1.1" /><circle cx="15.4" cy="15.6" r="1.1" /><circle cx="8.6" cy="18.8" r="1.1" /><circle cx="12" cy="18.8" r="1.1" /><circle cx="15.4" cy="18.8" r="1.1" /></g></>,
  eye: <><path d="M1.8 12C4.2 7.6 7.8 5.4 12 5.4s7.8 2.2 10.2 6.6c-2.4 4.4-6 6.6-10.2 6.6S4.2 16.4 1.8 12z" fill="currentColor" /><circle cx="12" cy="12" r="3.6" fill={W} /><circle cx="12" cy="12" r="1.8" fill="currentColor" /></>,
  wallet: <><rect x="2.8" y="5.5" width="18.4" height="14" rx="2.4" fill="currentColor" /><rect x="14" y="10.4" width="7.2" height="4.4" rx="1.4" fill={W} opacity=".9" /><circle cx="16.3" cy="12.6" r=".9" fill="currentColor" /></>,
};

export function Glyph({ name, size = 24, style, className = '' }) {
  const g = GLYPHS[name];
  if (!g) return <Icon name={name} size={size} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className} style={style}>{g}</svg>;
}

/** A tinted rounded square holding a glyph — tiles, rows, panel heads. */
export const Mark = ({ glyph, tone = 'indigo', size = 52, glyphSize, round = false }) => (
  <span className={`fe-mark fe-t-${tone}${round ? ' fe-mark--round' : ''}`} style={{ width: size, height: size }}>
    <Glyph name={glyph} size={glyphSize || Math.round(size * 0.46)} />
  </span>
);

/* ── Page furniture ───────────────────────────────────────────────────────── */

export const FeHead = ({ title, subtitle, children, aside }) => (
  <header className="fe-head">
    <div className="fe-head__text">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="fe-head__acts">{children}</div> : null}
    {aside}
  </header>
);

/** Buttons: primary (filled indigo), outline (white), soft (tinted), danger (red outline), link. */
export const Btn = ({ variant = 'outline', icon, glyph, children, className = '', size, ...rest }) => (
  <button type="button" className={`fe-btn fe-btn--${variant}${size ? ` fe-btn--${size}` : ''} ${className}`} {...rest}>
    {glyph ? <Glyph name={glyph} size={17} /> : icon ? <Icon name={icon} size={17} /> : null}
    {children}
  </button>
);

export const Card = ({ className = '', children, ...rest }) => <section className={`fe-card ${className}`} {...rest}>{children}</section>;

export const CardHead = ({ title, children, sub }) => (
  <div className="fe-cardhead">
    <div className="fe-cardhead__t"><h3>{title}</h3>{sub ? <span>{sub}</span> : null}</div>
    {children ? <div className="fe-cardhead__acts">{children}</div> : null}
  </div>
);

/** "View all →" */
export const LinkBtn = ({ children = 'View all', onClick, arrow = true }) => (
  <button type="button" className="fe-link" onClick={onClick}>
    {children}{arrow ? <Icon name="arrowRight" size={15} /> : null}
  </button>
);

/* ── Tiles ────────────────────────────────────────────────────────────────── */

/**
 * One figure. Two layouts the mockups use:
 *   label-over-value (default): label, big value, then a delta or share bar.
 *   valueFirst: big value, then label, then a small caption.
 * `badge` is the tinted percentage pill some screens put top-right.
 */
export function Tile({ glyph, tone, label, value, valueFirst, caption, delta, share, badge, onClick, on, small }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`fe-tile${valueFirst ? ' fe-tile--vf' : ''}${onClick ? ' is-click' : ''}${on ? ' is-on' : ''}${small ? ' fe-tile--sm' : ''}`}>
      <Mark glyph={glyph} tone={tone} size={small ? 46 : 54} />
      <div className="fe-tile__body">
        {valueFirst ? (
          <>
            <div className="fe-tile__value">{value}</div>
            <div className="fe-tile__label">{label}</div>
            {caption ? <div className="fe-tile__cap">{caption}</div> : null}
          </>
        ) : (
          <>
            <div className="fe-tile__label">{label}</div>
            <div className="fe-tile__value">{value}</div>
            {share ? (
              <>
                <div className="fe-tile__pct">{share.pct}%{share.text ? ` ${share.text}` : ''}</div>
                <div className="fe-share"><span style={{ width: `${Math.min(100, Math.max(0, share.pct))}%`, background: share.color }} /></div>
              </>
            ) : null}
            {delta ? <Delta {...delta} /> : null}
            {caption && !delta ? <div className="fe-tile__cap">{caption}</div> : null}
          </>
        )}
      </div>
      {badge ? <span className={`fe-tile__badge fe-b-${badge.tone}`}>{badge.text}</span> : null}
    </Tag>
  );
}

/**
 * "↑ 12%  vs last month". The arrow follows the direction of the change; the
 * colour follows whether that direction is good (dues going up is bad).
 * `plain` prints a bare number ("+2") the way the students tile does.
 */
export function Delta({ pct, plain, upIsGood = true, caption = 'vs last month', noSign }) {
  if (plain !== undefined) {
    return (<><div className="fe-delta fe-delta--plain">{plain > 0 ? `+${plain}` : plain}</div>{caption ? <div className="fe-delta__cap">{caption}</div> : null}</>);
  }
  if (pct === null || pct === undefined) {
    return (<><div className="fe-delta fe-delta--none">New</div>{caption ? <div className="fe-delta__cap">{caption}</div> : null}</>);
  }
  const up = pct > 0, flat = pct === 0;
  const good = flat ? null : (up === upIsGood);
  return (
    <>
      <div className={`fe-delta${good === true ? ' is-good' : good === false ? ' is-bad' : ''}`}>
        {!flat ? <Icon name={up ? 'arrowUp' : 'arrowDown'} size={15} strokeWidth={2.4} /> : null}
        {noSign ? '' : (up ? '+' : flat ? '' : '−')}{Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)) : +Math.abs(pct).toFixed(1)}%
      </div>
      {caption ? <div className="fe-delta__cap">{caption}</div> : null}
    </>
  );
}

export const Tiles = ({ n = 4, children }) => <div className={`fe-tiles fe-tiles--${n}`}>{children}</div>;

/* ── Controls ─────────────────────────────────────────────────────────────── */

/** A labelled native select. `options`: [{value,label}] or strings. */
export function Select({ label, value, onChange, options = [], all, icon, className = '', disabled, compact }) {
  const opts = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o));
  const control = (
    <span className={`fe-select${icon ? ' has-icon' : ''}${compact ? ' fe-select--compact' : ''}`}>
      {icon ? <Icon name={icon} size={17} /> : null}
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled}>
        {all !== undefined ? <option value="">{all}</option> : null}
        {opts.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <Icon name="chevronDown" size={16} />
    </span>
  );
  if (!label) return <div className={className}>{control}</div>;
  return (
    <label className={`fe-field ${className}`}>
      <span className="fe-field__label">{label}</span>
      {control}
    </label>
  );
}

export function Search({ value, onChange, placeholder = 'Search…', onEnter, className = '' }) {
  return (
    <span className={`fe-search ${className}`}>
      <Icon name="search" size={18} />
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }} />
    </span>
  );
}

/** The academic-year options every screen offers: "2026-27 (Active)". */
export const yearOptions = (years = []) => years.map(y => ({ value: y._id, label: `${y.yearName}${y.status === 'active' ? ' (Active)' : ''}` }));

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled}
      className={`fe-toggle${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

/** Pill tabs with a count badge each, the active one filled. */
export function PillTabs({ items, value, onChange, className = '' }) {
  return (
    <div className={`fe-pills ${className}`} role="tablist">
      {items.map(t => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key}
          className={`fe-pill${value === t.key ? ' is-on' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count !== undefined ? <span className={`fe-pill__n fe-b-${t.tone || 'slate'}`}>{Number(t.count).toLocaleString('en-IN')}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Underlined tabs (detail panels). */
export function UnderTabs({ items, value, onChange }) {
  return (
    <div className="fe-utabs" role="tablist">
      {items.map(t => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key}
          className={value === t.key ? 'is-on' : ''} onClick={() => onChange(t.key)}>{t.label}</button>
      ))}
    </div>
  );
}

/** Two-state view switch (List / Card, list / grid icons). */
export function ViewSwitch({ value, onChange, items }) {
  return (
    <div className="fe-vswitch">
      {items.map(i => (
        <button key={i.key} type="button" className={value === i.key ? 'is-on' : ''} onClick={() => onChange(i.key)}
          aria-label={i.label} title={i.label}>
          <Icon name={i.icon} size={17} />{i.text ? <span>{i.text}</span> : null}
        </button>
      ))}
    </div>
  );
}

export const Badge = ({ tone = 'slate', children }) => <span className={`fe-badge fe-b-${tone}`}>{children}</span>;
export const StatusBadge = ({ status, map = STATUS }) => {
  const [tone, text] = map[status] || ['slate', status || '—'];
  return <Badge tone={tone}>{text}</Badge>;
};

export const Avatar = ({ name, size = 34 }) => (
  <span className="fe-avatar" style={{ width: size, height: size, background: avatarTone(name), fontSize: size * 0.36 }}>{initials(name)}</span>
);

export const Who = ({ name, sub }) => (
  <span className="fe-who"><Avatar name={name} /><span><b>{name}</b>{sub ? <small>{sub}</small> : null}</span></span>
);

/** A square icon button (eye, pencil, copy). `bordered` draws the box the Structures screen shows. */
export const IconBtn = ({ icon, glyph, label, onClick, bordered, tone, disabled }) => (
  <button type="button" className={`fe-ibtn${bordered ? ' fe-ibtn--box' : ''}${tone ? ` fe-ibtn--${tone}` : ''}`}
    onClick={onClick} aria-label={label} title={label} disabled={disabled}>
    {glyph ? <Glyph name={glyph} size={17} /> : <Icon name={icon} size={18} />}
  </button>
);

export const Check = ({ checked, onChange, label, indeterminate }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="fe-check" checked={!!checked} aria-label={label} onChange={e => onChange(e.target.checked)} />;
};

/* ── Pager ────────────────────────────────────────────────────────────────── */

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out = [1];
  if (page <= 4) { out.push(2, 3, 4, 5, '…', pages); return out; }
  if (page >= pages - 3) { out.push('…', pages - 4, pages - 3, pages - 2, pages - 1, pages); return out; }
  out.push('…', page - 1, page, page + 1, '…', pages);
  return out;
}

/** "Showing 1 to 8 of 528 students · Rows per page [10] · ‹ 1 2 3 4 5 … 53 ›" */
export function Pager({ page, pages, total, limit, count, noun = 'records', onPage, onLimit, sizes = [10, 20, 50] }) {
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = total ? (page - 1) * limit + (count ?? Math.min(limit, total)) : 0;
  return (
    <div className="fe-pager">
      <span className="fe-pager__info">Showing {from} to {to} of {Number(total || 0).toLocaleString('en-IN')} {noun}</span>
      <div className="fe-pager__right">
        {onLimit ? (
          <label className="fe-pager__size">
            <span>Rows per page</span>
            <Select value={limit} onChange={v => onLimit(Number(v))} options={sizes.map(n => ({ value: n, label: String(n) }))} compact />
          </label>
        ) : null}
        <nav className="fe-pager__pages" aria-label="Pages">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Icon name="chevronLeft" size={17} /></button>
          {pageList(page, Math.max(1, pages || 1)).map((p, i) => (p === '…'
            ? <span key={`e${i}`} className="fe-pager__gap">…</span>
            : <button key={p} type="button" className={p === page ? 'is-on' : ''} onClick={() => onPage(p)}>{p}</button>))}
          <button type="button" disabled={page >= (pages || 1)} onClick={() => onPage(page + 1)} aria-label="Next page"><Icon name="chevronRight" size={17} /></button>
        </nav>
      </div>
    </div>
  );
}

/* ── Rails & panels ───────────────────────────────────────────────────────── */

/** The right-hand detail panel: mark, title, subtitle, status, tabs, body. */
export const Panel = ({ glyph, tone, title, subtitle, status, tabs, tab, onTab, children, className = '' }) => (
  <aside className={`fe-card fe-panel ${className}`}>
    <div className="fe-panel__head">
      <Mark glyph={glyph} tone={tone} size={52} />
      <div className="fe-panel__t"><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
      {status}
    </div>
    {tabs ? <UnderTabs items={tabs} value={tab} onChange={onTab} /> : null}
    <div className="fe-panel__body">{children}</div>
  </aside>
);

export const Facts = ({ children }) => <dl className="fe-facts">{children}</dl>;
export const Fact = ({ label, children, box }) => (
  <><dt>{label}</dt><dd className={box ? 'fe-facts__box' : ''}>{children}</dd></>
);

export const Note = ({ glyph = 'info', title, children, tone = 'blue', className = '' }) => (
  <div className={`fe-note fe-note--${tone} ${className}`}>
    <span className="fe-note__i"><Glyph name={glyph} size={title ? 34 : 24} /></span>
    <div>{title ? <strong>{title}</strong> : null}<div className="fe-note__b">{children}</div></div>
  </div>
);

export const Empty = ({ title = 'Nothing here yet', hint, children }) => (
  <div className="fe-empty">
    <Glyph name="docFill" size={34} />
    <strong>{title}</strong>
    {hint ? <p>{hint}</p> : null}
    {children}
  </div>
);

export const Loading = ({ rows = 5 }) => (
  <div className="fe-skel">{Array.from({ length: rows }, (_, i) => <span key={i} />)}</div>
);

/* ── Date range ───────────────────────────────────────────────────────────── */

/**
 * A button reading "01 Apr 2026 – 30 Sep 2026" that opens two date fields and
 * a few presets. Portalled so a card's overflow cannot clip it.
 */
export function DateRange({ from, to, onChange, presets = [], className = '', compact }) {
  const btn = useRef(null);
  const [rect, setRect] = useState(null);
  const [draft, setDraft] = useState({ from, to });
  useEffect(() => { setDraft({ from, to }); }, [from, to]);
  useEffect(() => {
    if (!rect) return undefined;
    const away = (e) => { if (!e.target.closest?.('.fe-drpop') && !btn.current?.contains(e.target)) setRect(null); };
    const esc = (e) => { if (e.key === 'Escape') setRect(null); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [rect]);
  const label = from || to ? `${from ? fmtDate(`${from}T00:00:00`) : '…'} – ${to ? fmtDate(`${to}T00:00:00`) : '…'}` : 'Any date';
  const apply = (v) => { onChange(v); setRect(null); };
  return (
    <>
      <button ref={btn} type="button" className={`fe-daterange${compact ? ' fe-daterange--compact' : ''} ${className}`}
        onClick={() => setRect(rect ? null : btn.current.getBoundingClientRect())}>
        <Icon name="calendar" size={compact ? 15 : 17} /><span>{label}</span>{compact ? <Icon name="chevronDown" size={15} /> : null}
      </button>
      {rect ? createPortal(
        <div className="fe-drpop" style={{ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 316)) }}>
          <div className="fe-drpop__row">
            <label>From<input type="date" value={draft.from || ''} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} /></label>
            <label>To<input type="date" value={draft.to || ''} min={draft.from || undefined} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} /></label>
          </div>
          {presets.length ? (
            <div className="fe-drpop__presets">
              {presets.map(p => <button key={p.label} type="button" onClick={() => apply({ from: p.from, to: p.to })}>{p.label}</button>)}
            </div>
          ) : null}
          <div className="fe-drpop__foot">
            <Btn variant="link" onClick={() => apply({ from: '', to: '' })}>Clear</Btn>
            <Btn variant="primary" size="sm" onClick={() => apply(draft)}>Apply</Btn>
          </div>
        </div>, document.body) : null}
    </>
  );
}

/**
 * One date, written the way the module writes dates ("01 Apr 2026") rather
 * than in the browser's locale format, opening the browser's own picker.
 */
export function DateInput({ value, onChange, min, max, placeholder = 'Choose a date' }) {
  const ref = useRef(null);
  return (
    <button type="button" className="fe-datef" onClick={() => { try { ref.current?.showPicker(); } catch { ref.current?.focus(); } }}>
      <Icon name="calendar" size={17} /><span className={value ? '' : 'fe-muted'}>{value ? fmtDate(`${value}T00:00:00`) : placeholder}</span>
      <input ref={ref} type="date" tabIndex={-1} value={value || ''} min={min} max={max} onChange={e => onChange(e.target.value)} />
    </button>
  );
}

/** Presets every range picker offers, relative to today and the academic year. */
export function rangePresets(year) {
  const now = new Date();
  const d = (y, m, day) => isoDay(new Date(y, m, day));
  const out = [
    { label: 'This month', from: d(now.getFullYear(), now.getMonth(), 1), to: isoDay(now) },
    { label: 'Last 3 months', from: d(now.getFullYear(), now.getMonth() - 2, 1), to: isoDay(now) },
    { label: 'Last 6 months', from: d(now.getFullYear(), now.getMonth() - 5, 1), to: isoDay(now) },
  ];
  if (year) out.push({ label: `Year ${year.yearName}`, from: isoDay(year.startDate), to: isoDay(year.endDate) });
  return out;
}

/* ── Files ────────────────────────────────────────────────────────────────── */

/** Save a Blob (or text) under a filename. */
export function saveFile(data, name, type = 'text/csv;charset=utf-8') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Rows → CSV with a header, quoting what needs it. */
export function toCsv(columns, rows) {
  const q = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(c => q(c.label)).join(','), ...rows.map(r => columns.map(c => q(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','))].join('\n');
}

/** Minimal CSV reader: quoted fields, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * Open HTML (a receipt) in a new tab. The tab is opened synchronously on the
 * click — before any await — so a popup blocker lets it through; the page is
 * written into it once the request returns.
 */
export function openHtmlWindow(load) {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:sans-serif;padding:24px;color:#64748b">Preparing…</p>');
  return Promise.resolve(load()).then((html) => {
    if (!w) return;
    w.document.open(); w.document.write(typeof html === 'string' ? html : String(html)); w.document.close();
  }).catch((e) => { if (w) w.close(); throw e; });
}
