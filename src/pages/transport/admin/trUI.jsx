/**
 * The Transport module's own UI kit (Sep 2026 redesign, to the user's sixteen
 * mockups).
 *
 * Every admin screen is built from the same seven pieces: a page head with
 * actions, a row of figure tiles whose footer carries a colour-coded
 * breakdown, a filter bar, a table inside a card, a pager, a rail of panels
 * that answer "what about the row I picked", and a strip of charts. The
 * mockups draw these slightly differently per screen — five tiles here and
 * four there, a legend row on some tiles and a delta on others — so the pieces
 * take props rather than one look being forced on sixteen screens.
 *
 * CSS lives in styles/transport.css under the `tr-` prefix. Nothing in this
 * file talks to the network.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Icon, { ICON_NAMES } from '../../../components/ui/icons';
import '../../../styles/transport.css';

/* ── Formatting ───────────────────────────────────────────────────────────── */

export const num = (v) => (Number.isFinite(+v) ? +v : 0);

/** Indian grouping. `space` puts a space after the symbol, as some mockups do. */
export function money(n, { sym = '₹', space = false, dec = 0 } = {}) {
  const v = num(n);
  const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${v < 0 ? '−' : ''}${sym}${space ? ' ' : ''}${s}`;
}
/** Axis money: ₹12.4L, ₹40K. */
export function compactMoney(n, sym = '₹') {
  const v = num(n);
  if (!v) return `${sym}0`;
  const a = Math.abs(v);
  if (a >= 1e7) return `${sym}${+(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${sym}${+(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sym}${+(v / 1e3).toFixed(1)}K`;
  return `${sym}${Math.round(v)}`;
}
export const compact = (n) => {
  const v = num(n);
  if (Math.abs(v) >= 1e5) return `${+(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `${+(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
};
export const count = (n) => num(n).toLocaleString('en-IN');

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYNAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const asDate = (d) => {
  if (!d) return null;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
};
/** "22 Sep 2026" */
export function fmtDate(d) {
  const x = asDate(d);
  return x ? `${String(x.getDate()).padStart(2, '0')} ${MON[x.getMonth()]} ${x.getFullYear()}` : '—';
}
/** "Mon, 22 Sep 2026" */
export function fmtDay(d) {
  const x = asDate(d);
  return x ? `${DAYNAME[x.getDay()]}, ${fmtDate(x)}` : '—';
}
/** "10:24 AM". `hhmm` accepts either a Date or a bare "07:15" from a timetable. */
export function fmtTime(d) {
  if (typeof d === 'string' && /^\d{1,2}:\d{2}$/.test(d.trim())) {
    // Carry the minutes rather than printing them raw: a timetable that stored
    // "14:63" is 03:03 PM, and printing "02:63 PM" is how it used to read.
    const [hh, mm] = d.trim().split(':').map(Number);
    const total = ((hh * 60 + mm) % 1440 + 1440) % 1440;
    const h = Math.floor(total / 60);
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${String(h % 12 || 12).padStart(2, '0')}:${String(total % 60).padStart(2, '0')} ${ap}`;
  }
  const x = asDate(d);
  if (!x) return '—';
  let h = x.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')} ${ap}`;
}
export function fmtDateTime(d) {
  const x = asDate(d);
  return x ? `${fmtDate(x)} ${fmtTime(x)}` : '—';
}
/** The YYYY-MM-DD an <input type=date> wants, in local time. */
export const isoDay = (d) => {
  const x = asDate(d);
  return x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` : '';
};
export function ago(d) {
  const x = asDate(d);
  if (!x) return '';
  const s = Math.max(0, (Date.now() - x.getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min${Math.floor(s / 60) === 1 ? '' : 's'} ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) === 1 ? '' : 's'} ago`;
  const days = Math.floor(s / 86400);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? '' : 's'} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) === 1 ? '' : 's'} ago`;
}
export const plural = (n, one, many) => `${count(n)} ${num(n) === 1 ? one : many || `${one}s`}`;
export const pct = (a, b) => (b ? Math.round((num(a) / num(b)) * 100) : 0);

export function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '—';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
const AV_TONES = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e', '#f43f5e', '#3b82f6', '#a855f7'];
export function avatarTone(key) {
  let h = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_TONES[h % AV_TONES.length];
}
/** Uploads are served at the backend root, but VITE_API_URL carries /api. */
export function fileUrl(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//.test(path)) return path;
  const base = String(import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
  return `${base}/${String(path).replace(/^\//, '')}`;
}

/* ── Vocabulary shared by several screens ─────────────────────────────────── */

/** status key → [tone, word]. One table so a word never differs by screen. */
export const STATUS = {
  active: ['green', 'Active'], inactive: ['slate', 'Inactive'], maintenance: ['amber', 'Maintenance'],
  retired: ['slate', 'Retired'], draft: ['slate', 'Draft'], on_leave: ['amber', 'On Leave'],
  document_expiring: ['red', 'Document Expiring'], suspended: ['amber', 'On Hold'], cancelled: ['red', 'Cancelled'],
  scheduled: ['slate', 'Scheduled'], in_progress: ['blue', 'In Progress'], started: ['blue', 'In Progress'],
  paused: ['amber', 'Paused'], completed: ['green', 'Completed'], delayed: ['red', 'Delayed'],
  on_route: ['green', 'On Route'], at_stop: ['blue', 'At Stop'], idle: ['amber', 'Idle'], offline: ['slate', 'Offline'],
  pending: ['amber', 'Pending'], approved: ['green', 'Approved'], rejected: ['red', 'Rejected'],
  open: ['red', 'Open'], assigned: ['blue', 'Assigned'], resolved: ['green', 'Resolved'], closed: ['slate', 'Closed'],
  reported: ['red', 'Open'], investigating: ['amber', 'Investigating'],
  paid: ['green', 'Paid'], partial: ['amber', 'Partial'], overdue: ['red', 'Overdue'],
  up_to_date: ['green', 'Up to Date'], due_soon: ['amber', 'Due Soon'], in_maintenance: ['slate', 'In Maintenance'],
  ok: ['green', 'Valid'], due: ['amber', 'Expiring'], expired: ['red', 'Expired'],
  verified: ['green', 'Verified'], missing: ['slate', 'Not on file'],
  running: ['blue', 'Running'], failed: ['red', 'Failed'],
};
export const statusWord = (k) => STATUS[k]?.[1] || String(k || '').replace(/_/g, ' ');
export const statusTone = (k) => STATUS[k]?.[0] || 'slate';

export const VEHICLE_TYPE = { bus: 'School Bus', mini_bus: 'Mini Bus', van: 'Van', car: 'Car', tempo: 'Tempo Traveller', other: 'Other', any: 'Bus / Van' };
export const FUEL_TYPE = { diesel: 'Diesel', petrol: 'Petrol', cng: 'CNG', electric: 'Electric', hybrid: 'Hybrid' };
export const SHIFT = { morning: 'Morning', evening: 'Afternoon', both: 'Both' };
export const FREQUENCY = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', one_time: 'One Time' };
export const PAY_MODE = { cash: 'Cash', cheque: 'Cheque', online: 'Online', upi: 'UPI', card: 'Card', bank_transfer: 'Bank Transfer' };
export const words = (v) => String(v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/* ── Glyphs ───────────────────────────────────────────────────────────────── */
// The mockups' tile and row icons are solid shapes with white detail, not the
// app's outline set, so the module draws its own. 24×24, currentColor.
const W = '#fff';
const GLYPHS = {
  bus: <><rect x="3.2" y="4" width="17.6" height="13.2" rx="3" fill="currentColor" /><path d="M5.6 7.4h12.8v4.2H5.6z" fill={W} opacity=".92" /><circle cx="7.4" cy="14.4" r="1.25" fill={W} /><circle cx="16.6" cy="14.4" r="1.25" fill={W} /><path d="M6.4 17.2v1.9a.9.9 0 0 1-.9.9h-.7a.9.9 0 0 1-.9-.9v-1.9zm13.7 0v1.9a.9.9 0 0 1-.9.9h-.7a.9.9 0 0 1-.9-.9v-1.9z" fill="currentColor" /></>,
  driver: <><circle cx="12" cy="7.4" r="3.6" fill="currentColor" /><path d="M4.4 20.4c0-3.9 3.4-6.8 7.6-6.8s7.6 2.9 7.6 6.8z" fill="currentColor" /><path d="M8.4 5.6h7.2l-.5-1.5a1.4 1.4 0 0 0-1.3-.9h-3.6a1.4 1.4 0 0 0-1.3.9z" fill="currentColor" opacity=".7" /></>,
  students: <><circle cx="8.4" cy="8.2" r="3.1" fill="currentColor" /><circle cx="16.2" cy="8.8" r="2.6" fill="currentColor" opacity=".8" /><path d="M2.5 19c0-3.3 2.6-5.9 5.9-5.9s5.9 2.6 5.9 5.9z" fill="currentColor" /><path d="M14.7 19c0-1.9-.6-3.6-1.7-4.8.9-.5 1.9-.8 3-.8 2.9 0 5.2 2.3 5.2 5.2v.4z" fill="currentColor" opacity=".8" /></>,
  route: <><path d="M12 2.5c-3.3 0-6 2.7-6 6 0 4.4 6 12 6 12s6-7.6 6-12c0-3.3-2.7-6-6-6z" fill="currentColor" /><circle cx="12" cy="8.5" r="2.4" fill={W} /></>,
  routes: <><circle cx="6" cy="6" r="3" fill="currentColor" /><circle cx="18" cy="18" r="3" fill="currentColor" /><path d="M6 9.4v3.4a3.4 3.4 0 0 0 3.4 3.4h5.2" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" /></>,
  rupee: <><circle cx="12" cy="12" r="9.6" fill="currentColor" /><path d="M9 7.6h6M9 10.4h6M13.3 7.6c1.2 0 2 .9 2 2.1s-.8 2.1-2 2.1H9.4l4.4 4.6" stroke={W} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  wallet: <><path d="M3.4 7.6a2.6 2.6 0 0 1 2.6-2.6h11.2a2.6 2.6 0 0 1 2.6 2.6v9.2a2.6 2.6 0 0 1-2.6 2.6H6a2.6 2.6 0 0 1-2.6-2.6z" fill="currentColor" /><circle cx="16.6" cy="12.2" r="1.5" fill={W} /></>,
  trips: <><rect x="3.4" y="4.6" width="17.2" height="16" rx="3" fill="currentColor" /><path d="M3.4 9.2h17.2" stroke={W} strokeWidth="1.6" /><path d="M8 3v3.4M16 3v3.4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" /><path d="m9.4 14.6 1.8 1.8 3.6-3.7" stroke={W} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  clock: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 6.8v5.4l3.4 2" stroke={W} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  play: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M10 8.4 16 12l-6 3.6z" fill={W} /></>,
  pause: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M10 8.4h1.7v7.2H10zm2.9 0h1.7v7.2h-1.7z" fill={W} /></>,
  check: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="m7.8 12.3 2.8 2.8 5.6-5.8" stroke={W} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  x: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="m8.8 8.8 6.4 6.4m0-6.4-6.4 6.4" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  alert: <><path d="M10.3 3.9a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z" fill="currentColor" /><path d="M12 9v4.4" stroke={W} strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="16.5" r="1.2" fill={W} /></>,
  bang: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 6.9v6.2" stroke={W} strokeWidth="2.4" strokeLinecap="round" /><circle cx="12" cy="16.4" r="1.3" fill={W} /></>,
  info: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><circle cx="12" cy="7.8" r="1.25" fill={W} /><path d="M12 10.8v6.2" stroke={W} strokeWidth="2.2" strokeLinecap="round" /></>,
  wrench: <><path d="M20.1 6.3a5.2 5.2 0 0 1-6.6 6.6L6.8 19.6a2.1 2.1 0 0 1-3-3l6.7-6.7a5.2 5.2 0 0 1 6.6-6.6l-3 3 .6 2.9 2.9.6z" fill="currentColor" /></>,
  fuel: <><path d="M4.4 4.6a2 2 0 0 1 2-2h5.4a2 2 0 0 1 2 2v16.8H4.4z" fill="currentColor" /><path d="M6.6 5.6h5v3.6h-5z" fill={W} /><path d="M15.6 7.2 18 9.5v7.2a1.6 1.6 0 0 0 3.2 0v-8L18.6 6" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" /></>,
  drop: <><path d="M12 2.6c3.4 4.1 5.8 7.2 5.8 10.2a5.8 5.8 0 0 1-11.6 0c0-3 2.4-6.1 5.8-10.2z" fill="currentColor" /></>,
  gauge: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 12 16 8.4" stroke={W} strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="12" r="1.6" fill={W} /></>,
  doc: <><path d="M6.4 3h7.1L19 8.4V19a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="currentColor" /><path d="M8.3 12.2h7.4M8.3 15.8h5" stroke={W} strokeWidth="1.8" strokeLinecap="round" /><path d="M13.4 3.2v4a1 1 0 0 0 1 1h4" fill="none" stroke={W} strokeWidth="1.2" opacity=".7" /></>,
  invoice: <><path d="M5 3.4h14v17.2l-2.3-1.4-2.4 1.4-2.3-1.4-2.4 1.4L7.3 19 5 20.6z" fill="currentColor" /><path d="M8.2 8.4h7.6M8.2 12h7.6M8.2 15.2h4.6" stroke={W} strokeWidth="1.6" strokeLinecap="round" /></>,
  request: <><rect x="3.4" y="4.4" width="17.2" height="15.2" rx="3" fill="currentColor" /><path d="m5.8 8 5.3 3.7a1.6 1.6 0 0 0 1.8 0L18.2 8" stroke={W} strokeWidth="1.8" fill="none" strokeLinecap="round" /></>,
  chart: <><rect x="3.2" y="3.4" width="17.6" height="17.2" rx="3.2" fill="currentColor" /><path d="M7.6 15.6v-3m4.4 3V9.4m4.4 6.2v-4.4" stroke={W} strokeWidth="2.1" strokeLinecap="round" /></>,
  trend: <><rect x="3.2" y="3.4" width="17.6" height="17.2" rx="3.2" fill="currentColor" /><path d="m7 14.6 3-3.2 2.4 2.2L17 9" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  settings: <><path d="M12 2.4a2 2 0 0 1 1.9 1.4l.3 1a7.7 7.7 0 0 1 1.5.9l1-.3a2 2 0 0 1 2.3.9l.6 1a2 2 0 0 1-.4 2.4l-.7.7a7.7 7.7 0 0 1 0 1.7l.7.7a2 2 0 0 1 .4 2.4l-.6 1a2 2 0 0 1-2.3.9l-1-.3a7.7 7.7 0 0 1-1.5.9l-.3 1A2 2 0 0 1 12 21.6h-1.1a2 2 0 0 1-1.9-1.4l-.3-1a7.7 7.7 0 0 1-1.5-.9l-1 .3a2 2 0 0 1-2.3-.9l-.6-1a2 2 0 0 1 .4-2.4l.7-.7a7.7 7.7 0 0 1 0-1.7l-.7-.7a2 2 0 0 1-.4-2.4l.6-1a2 2 0 0 1 2.3-.9l1 .3a7.7 7.7 0 0 1 1.5-.9l.3-1A2 2 0 0 1 10.9 2.4z" fill="currentColor" /><circle cx="11.5" cy="12" r="3.1" fill={W} /></>,
  shield: <><path d="M12 2.4 20 5.6v6c0 4.8-3.3 9-8 10.2-4.7-1.2-8-5.4-8-10.2v-6z" fill="currentColor" /><path d="m8.2 12 2.6 2.6 5-5.2" stroke={W} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  megaphone: <><path d="M3.4 10.2a2 2 0 0 1 2-2h2.3L16 4.2v15.6l-8.3-4H5.4a2 2 0 0 1-2-2z" fill="currentColor" /><path d="M18.4 8.6a4.6 4.6 0 0 1 0 6.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /><path d="M7.7 16.2v2.4a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-1.4z" fill="currentColor" /></>,
  star: <><path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" fill="currentColor" /></>,
  pin: <><path d="M12 2.4a6.4 6.4 0 0 0-6.4 6.4c0 4.7 6.4 12.8 6.4 12.8s6.4-8.1 6.4-12.8A6.4 6.4 0 0 0 12 2.4z" fill="currentColor" /><circle cx="12" cy="8.8" r="2.5" fill={W} /></>,
  sun: <><circle cx="12" cy="12" r="4.4" fill="currentColor" /><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" /></>,
  moon: <><path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.8 8.8 0 1 0 11 11z" fill="currentColor" /></>,
  satellite: <><circle cx="12" cy="12" r="3.2" fill="currentColor" /><path d="M6.6 6.6a7.6 7.6 0 0 0 0 10.8M17.4 6.6a7.6 7.6 0 0 1 0 10.8M4 4a11.3 11.3 0 0 0 0 16M20 4a11.3 11.3 0 0 1 0 16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" fill="none" /></>,
  building: <><path d="M4.4 20.6V6.4a2 2 0 0 1 1.3-1.9l6-2.1a1 1 0 0 1 1.3.9v3.2l4.7 1.6a2 2 0 0 1 1.4 1.9v10.6z" fill="currentColor" /><path d="M7.6 9.2h2v2h-2zm0 4h2v2h-2zm7 0h2v2h-2zm0-4h2v2h-2z" fill={W} /></>,
  people: <><circle cx="9" cy="8" r="3.4" fill="currentColor" /><path d="M2.8 19.6c0-3.4 2.8-6.2 6.2-6.2s6.2 2.8 6.2 6.2z" fill="currentColor" /><circle cx="17.4" cy="8.6" r="2.6" fill="currentColor" opacity=".72" /><path d="M16.6 13.6c2.7 0 4.6 1.9 4.6 4.6v1.4h-3.7c0-2.3-.7-4.3-2-5.8a5 5 0 0 1 1.1-.2z" fill="currentColor" opacity=".72" /></>,
  seat: <><path d="M6.4 3.4h4.2a3 3 0 0 1 3 3v6.4H6.4z" fill="currentColor" /><path d="M4.6 14.4h12.8a2 2 0 0 1 2 2v4.2H4.6z" fill="currentColor" opacity=".78" /></>,
  upload: <><path d="M12 3.2 17 8.4h-3.2v6.4h-3.6V8.4H7z" fill="currentColor" /><path d="M4.4 15.8v2.8a2 2 0 0 0 2 2h11.2a2 2 0 0 0 2-2v-2.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" fill="none" /></>,
  download: <><path d="M12 15.6 7 10.4h3.2V4h3.6v6.4H17z" fill="currentColor" /><path d="M4.4 15.8v2.8a2 2 0 0 0 2 2h11.2a2 2 0 0 0 2-2v-2.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" fill="none" /></>,
  bell: <><path d="M12 2.6a6.2 6.2 0 0 1 6.2 6.2v3.6l1.5 2.8a1 1 0 0 1-.9 1.5H5.2a1 1 0 0 1-.9-1.5l1.5-2.8V8.8A6.2 6.2 0 0 1 12 2.6z" fill="currentColor" /><path d="M9.6 18.4h4.8a2.4 2.4 0 0 1-4.8 0z" fill="currentColor" /></>,
  swap: <><path d="M7 4.4 3.4 8 7 11.6V9h11V7H7z" fill="currentColor" /><path d="M17 12.4 20.6 16 17 19.6V17H6v-2h11z" fill="currentColor" /></>,
  send: <><path d="M3 11.2 20.6 3.4 12.8 21l-2.3-7.3z" fill="currentColor" /><path d="m10.5 13.7 4.8-4.8" stroke={W} strokeWidth="1.5" strokeLinecap="round" /></>,
  phone: <><path d="M6.6 3.4c.9 0 1.6.6 1.8 1.4l.7 2.6a1.8 1.8 0 0 1-.5 1.8l-1.2 1.1a12 12 0 0 0 4.9 4.9l1.1-1.2a1.8 1.8 0 0 1 1.8-.5l2.6.7c.8.2 1.4 1 1.4 1.8v2.2a2 2 0 0 1-2.2 2C9.6 19.6 4.4 14.4 3.4 5.6a2 2 0 0 1 2-2.2z" fill="currentColor" /></>,
  eye: <><path d="M12 5.2c4.6 0 8.3 3 10 6.8-1.7 3.8-5.4 6.8-10 6.8S3.7 15.8 2 12c1.7-3.8 5.4-6.8 10-6.8z" fill="currentColor" /><circle cx="12" cy="12" r="2.9" fill={W} /></>,
  copy: <><rect x="8" y="3.4" width="12.6" height="14.2" rx="2.6" fill="currentColor" /><path d="M5.6 6.8H5a1.6 1.6 0 0 0-1.6 1.6v10.4A1.6 1.6 0 0 0 5 20.4h9.2a1.6 1.6 0 0 0 1.6-1.6v-.6" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" /></>,
  book: <><path d="M4.4 4.6a2 2 0 0 1 2-2h11.2a2 2 0 0 1 2 2v14.8a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2z" fill="currentColor" /><path d="M8 7.2h8M8 10.6h8M8 14h5" stroke={W} strokeWidth="1.7" strokeLinecap="round" /></>,
  grid: <><rect x="3.4" y="3.4" width="7.4" height="7.4" rx="2" fill="currentColor" /><rect x="13.2" y="3.4" width="7.4" height="7.4" rx="2" fill="currentColor" opacity=".72" /><rect x="3.4" y="13.2" width="7.4" height="7.4" rx="2" fill="currentColor" opacity=".72" /><rect x="13.2" y="13.2" width="7.4" height="7.4" rx="2" fill="currentColor" /></>,
  cake: <><path d="M4.4 20.6v-5a2 2 0 0 1 2-2h11.2a2 2 0 0 1 2 2v5z" fill="currentColor" /><path d="M7.4 13.2V9.6m4.6 3.6V9.6m4.6 3.6V9.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /><circle cx="7.4" cy="7.4" r="1.5" fill="currentColor" /><circle cx="12" cy="7.4" r="1.5" fill="currentColor" /><circle cx="16.6" cy="7.4" r="1.5" fill="currentColor" /></>,
};
/**
 * The app's outline icon where the shared registry has one, this module's own
 * solid glyph otherwise.
 *
 * The registry has no `play`, `route`, `rupee`, `driver`… and an unknown name
 * renders NOTHING rather than throwing, so a button asking for one came out as
 * an empty box. Every kit component that draws an icon goes through here.
 */
const REGISTRY = new Set(ICON_NAMES);
export const Ico = ({ name, size = 16, ...rest }) => (
  REGISTRY.has(name) ? <Icon name={name} size={size} {...rest} /> : <Glyph name={name} size={size} />
);

export function Glyph({ name, size = 22 }) {
  const g = GLYPHS[name];
  // The module's own set first, then the app registry, then a placeholder.
  // Without the middle step a Tile or Panel asking for "calendar" — which the
  // app has and this module does not — drew a grid square instead.
  if (!g) return <Icon name={REGISTRY.has(name) ? name : 'grid'} size={size} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{g}</svg>;
}
/** A tinted square (or circle) holding a glyph — the tile and row icon. */
export const Mark = ({ name, tone = 'indigo', size = 46, glyph = 20, round = false, className = '', style }) => (
  <span className={`tr-mark tr-t-${tone}${round ? ' tr-mark--round' : ''} ${className}`}
        style={{ width: size, height: size, ...style }}>
    <Glyph name={name} size={glyph} />
  </span>
);

/* ── Head ─────────────────────────────────────────────────────────────────── */

export const TrHead = ({ icon, iconTone = 'indigo', title, subtitle, children }) => (
  <div className="tr-head">
    <div className="tr-head__text">
      <div className="tr-head__title">
        {icon ? <Mark name={icon} tone={iconTone} size={42} glyph={22} /> : null}
        <h1>{title}</h1>
      </div>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="tr-head__acts">{children}</div> : null}
  </div>
);

/** The strip above the page head: the date/year chip, and anything beside it. */
export const TopBar = ({ children }) => <div className="tr-topbar">{children}</div>;

export const DayChip = ({ label, sub, value, onChange, type = 'date', options, icon = 'calendar' }) => (
  <div className="tr-daychip">
    <span className="tr-daychip__ico"><Ico name={icon} size={17} /></span>
    <span className="tr-daychip__lab">
      {sub ? <small>{sub}</small> : null}
      {options
        ? <select value={value} onChange={(e) => onChange?.(e.target.value)} aria-label={sub || label}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        : onChange
          ? <input type={type} className="tr-daychip__input" value={value || ''} onChange={(e) => onChange(e.target.value)}
                   style={{ border: 0, font: 'inherit', fontWeight: 600, color: 'inherit', padding: 0, background: 'transparent' }} />
          : <span>{label}</span>}
    </span>
  </div>
);

export const LiveChip = ({ label = 'Live Tracking' }) => (
  <span className="tr-livechip"><i className="tr-dot tr-dot--green" />{label}</span>
);

/* ── Buttons ──────────────────────────────────────────────────────────────── */

export const Btn = ({ kind = 'ghost', size, icon, iconRight, block, children, as: As = 'button', ...rest }) => (
  <As className={`tr-btn tr-btn--${kind}${size ? ` tr-btn--${size}` : ''}${block ? ' tr-btn--block' : ''}`}
      {...(As === 'button' ? { type: 'button' } : {})} {...rest}>
    {icon ? <Ico name={icon} size={16} /> : null}
    {children}
    {iconRight ? <Ico name={iconRight} size={16} /> : null}
  </As>
);
export const IconBtn = ({ icon, kind = '', label, size = 16, ...rest }) => (
  <button type="button" className={`tr-iconbtn${kind ? ` tr-iconbtn--${kind}` : ''}`} title={label} aria-label={label} {...rest}>
    <Ico name={icon} size={size} />
  </button>
);
export const LinkBtn = ({ children, to, ...rest }) => (
  to ? <Link className="tr-linkbtn" to={to} {...rest}>{children}<Icon name="chevronRight" size={14} /></Link>
     : <button type="button" className="tr-linkbtn" {...rest}>{children}</button>
);
/** The mockups' "New Request ▾" — an action with a menu hanging off it. */
export function SplitBtn({ label, icon = 'plus', onClick, items = [], kind = 'primary' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <span className="tr-split-btn" ref={ref} style={{ position: 'relative' }}>
      <Btn kind={kind} icon={icon} onClick={onClick}>{label}</Btn>
      <Btn kind={kind} onClick={() => setOpen((v) => !v)} aria-label="More actions" aria-expanded={open}>
        <Icon name="chevronDown" size={15} />
      </Btn>
      {open && items.length ? (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 210, zIndex: 40,
          background: '#fff', border: '1px solid var(--tr-line)', borderRadius: 11, boxShadow: 'var(--tr-shadow-2)', padding: 6,
        }}>
          {items.map((it) => (
            <button key={it.label} type="button" className="tr-qa-item"
                    onClick={() => { setOpen(false); it.onClick?.(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 10px',
                      border: 0, background: 'none', font: 'inherit', fontSize: '.83rem', fontWeight: 600,
                      color: 'var(--tr-ink-2)', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f7fb'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
              {it.icon ? <Ico name={it.icon} size={16} /> : null}{it.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/* ── Cards & panels ───────────────────────────────────────────────────────── */

export const Card = ({ children, className = '', ...rest }) => (
  <section className={`tr-card ${className}`} {...rest}>{children}</section>
);
export const CardHead = ({ title, sub, icon, iconTone = 'indigo', line, right, children }) => (
  <header className={`tr-card__head${line ? ' tr-card__head--line' : ''}`}>
    {icon ? <Mark name={icon} tone={iconTone} size={34} glyph={17} /> : null}
    <div className="tr-card__grow">
      <h3>{title}</h3>
      {sub ? <p>{sub}</p> : null}
    </div>
    {children}
    {right}
  </header>
);
export const CardBody = ({ flush, fill, children, style }) => (
  <div className={`tr-card__body${flush ? ' tr-card__body--flush' : ''}${fill ? ' tr-card__body--fill' : ''}`}
       style={style}>{children}</div>
);
export const Panel = ({ title, sub, icon, iconTone = 'indigo', right, flush, children, className = '' }) => (
  <section className={`tr-panel ${className}`}>
    {title ? (
      <header className="tr-panel__head">
        {icon ? <Mark name={icon} tone={iconTone} size={32} glyph={16} /> : null}
        <div className="tr-card__grow"><h4>{title}</h4>{sub ? <p style={{ margin: '3px 0 0', fontSize: '.76rem', color: 'var(--tr-muted)' }}>{sub}</p> : null}</div>
        {right}
      </header>
    ) : null}
    <div className={`tr-panel__body${flush ? ' tr-panel__body--flush' : ''}`}>{children}</div>
  </section>
);

/* ── Tiles ────────────────────────────────────────────────────────────────── */

export const Tiles = ({ cols, children }) => (
  <div className={`tr-tiles${cols ? ` tr-tiles--${cols}` : ''}`}>{children}</div>
);

/**
 * One figure tile.
 *
 * `legend` is the coloured breakdown under the figure ("10 Active · 1 In
 * Maintenance"); `delta` is the "+8% vs previous day" line; `bar` and `ring`
 * are the two progress treatments the mockups use. A tile draws whichever of
 * these it is given and nothing else, so the row stays even.
 */
export function Tile({ icon, tone = 'indigo', value, label, legend, delta, deltaNote, sub, bar, ring, to, onClick, children }) {
  const El = to ? Link : (onClick ? 'button' : 'div');
  const props = to ? { to } : (onClick ? { type: 'button', onClick } : {});
  return (
    <El className="tr-tile" {...props} style={onClick && !to ? { textAlign: 'left', font: 'inherit' } : undefined}>
      <div className="tr-tile__top">
        {icon ? <Mark name={icon} tone={tone} className="tr-tile__mark" size={46} glyph={21} /> : null}
        <div className="tr-tile__fig">
          <div className="tr-tile__value">{value}</div>
          <div className="tr-tile__label">{label}</div>
        </div>
        {ring != null ? <span className="tr-tile__ring"><Ring value={ring} /></span> : null}
        {to ? <span className="tr-tile__chev"><Icon name="chevronRight" size={16} /></span> : null}
      </div>
      {/* "vs. last period" on its own says nothing: the comparison is missing
          because there is no prior period to compare with. The note goes with
          its figure or not at all. */}
      {delta != null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Delta value={delta} />
          {deltaNote ? <span className="tr-tile__sub">{deltaNote}</span> : null}
        </div>
      ) : null}
      {bar != null ? <span className="tr-tile__bar"><i style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} /></span> : null}
      {legend?.length ? (
        <div className="tr-tile__legend">
          {legend.filter(Boolean).map((l) => (
            <span key={l.label}>
              {l.tone ? <i className={`tr-dot tr-dot--${l.tone}`} /> : null}
              <b>{l.value}</b>{l.label}
            </span>
          ))}
        </div>
      ) : null}
      {sub ? <div className="tr-tile__sub">{sub}</div> : null}
      {children}
    </El>
  );
}

/** "+8%" / "−20%", coloured by direction. `goodDown` for things you want less of. */
export function Delta({ value, suffix = '%', goodDown = false, note }) {
  if (value == null || Number.isNaN(+value)) return note ? <span className="tr-tile__sub">{note}</span> : null;
  const v = +value;
  const dir = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  const good = v === 0 ? 'flat' : (goodDown ? (v < 0 ? 'up' : 'down') : dir);
  return (
    <span className={`tr-tile__delta tr-tile__delta--${good}`}>
      {v !== 0 ? <Icon name={v > 0 ? 'arrowUp' : 'arrowDown'} size={13} /> : null}
      {v > 0 ? '+' : ''}{v}{suffix}
      {note ? <span style={{ color: 'var(--tr-muted)', fontWeight: 500, marginLeft: 2 }}>{note}</span> : null}
    </span>
  );
}

/** The small percentage ring the Live Map's "Students On Board" tile carries. */
export function Ring({ value = 0, size = 46, stroke = 5, color = '#22c55e', label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, num(value)));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: size * 0.28, fontWeight: 700, fill: 'var(--tr-ink)' }}>{label ?? `${v}%`}</text>
    </svg>
  );
}

/* ── Filters & fields ─────────────────────────────────────────────────────── */

export const Filters = ({ plain, children }) => (
  <div className={`tr-filters${plain ? ' tr-filters--plain' : ''}`}>{children}</div>
);
export const FilterEnd = ({ children }) => <div className="tr-filters__end">{children}</div>;

export function Search({ value, onChange, placeholder = 'Search…', grow = true, onEnter, style }) {
  return (
    <label className={`tr-search${grow ? ' tr-filters__grow' : ''}`} style={style}>
      <span className="tr-search__ico"><Icon name="search" size={16} /></span>
      <input value={value ?? ''} placeholder={placeholder}
             onChange={(e) => onChange?.(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(e.target.value); }} />
    </label>
  );
}
export function Select({ value, onChange, options = [], placeholder, width, style, ...rest }) {
  return (
    <span className="tr-select" style={{ width, ...style }}>
      <select value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} {...rest}>
        {placeholder != null ? <option value="">{placeholder}</option> : null}
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? words(o) : o.label;
          return <option key={String(v)} value={v}>{l}</option>;
        })}
      </select>
      <span className="tr-select__ico"><Icon name="chevronDown" size={15} /></span>
    </span>
  );
}
/**
 * One labelled control.
 *
 * `error` replaces the hint while it is set, because a field that has failed
 * has one thing to say and it is not the hint.
 */
export const Field = ({ label, hint, required, full, span2, span, error, children }) => (
  <label className={`tr-field${full ? ' tr-formgrid__full' : ''}${span2 ? ' tr-formgrid__span2' : ''}${span ? ` tr-sp${span}` : ''}`}>
    {label ? <span className="tr-field__label">{label}{required ? <em style={{ color: '#dc2626', fontStyle: 'normal' }}> *</em> : null}</span> : null}
    {children}
    {error ? <span className="tr-field__err">{error}</span>
      : hint ? <span className="tr-field__hint">{hint}</span> : null}
  </label>
);
export const Input = (props) => <input className="tr-input" {...props} />;
export const Textarea = (props) => <textarea className="tr-textarea" {...props} />;
export const FormGrid = ({ one, three, children }) => (
  <div className={`tr-formgrid${one ? ' tr-formgrid--1' : ''}${three ? ' tr-formgrid--3' : ''}`}>{children}</div>
);

/**
 * A named group of fields inside a dialog.
 *
 * Every Create/Edit dialog in this module is built from these: a vehicle form
 * with fourteen fields in one flat grid is a wall, and the groups are what make
 * it scannable. `n` prints the step number when a form reads as a sequence.
 */
export const FormSection = ({ title, sub, n, children }) => (
  <section className="tr-fsec">
    {title ? (
      <header className="tr-fsec__head">
        {n ? <span className="tr-fsec__num">{n}</span> : null}
        <h4>{title}</h4>
        {sub ? <p>{sub}</p> : null}
      </header>
    ) : null}
    {children}
  </section>
);

/**
 * Field-level validation for the dialogs.
 *
 * `rules` is { field: (value, form) => falsy | 'what is wrong' }. Nothing is
 * marked until a submit has been attempted — a form that turns red while you
 * are still filling in the first field is worse than no validation — and after
 * that each field re-checks as it changes, so a fixed field stops complaining
 * immediately.
 */
export function useValidate(rules) {
  const [errors, setErrors] = useState({});
  const tried = useRef(false);

  const check = useCallback((form) => {
    const found = {};
    for (const [key, rule] of Object.entries(rules || {})) {
      const msg = rule(form?.[key], form);
      if (msg) found[key] = msg;
    }
    return found;
  }, [rules]);

  /** Validate, and run `fn` only if it passes. Returns false when it did not. */
  const run = useCallback(async (form, fn) => {
    tried.current = true;
    const found = check(form);
    setErrors(found);
    if (Object.keys(found).length) return false;
    await fn();
    return true;
  }, [check]);

  /** Re-check after a change, but only once the person has tried to submit. */
  const revalidate = useCallback((form) => {
    if (tried.current) setErrors(check(form));
  }, [check]);

  const reset = useCallback(() => { tried.current = false; setErrors({}); }, []);

  return { errors, run, revalidate, reset, list: Object.values(errors) };
}

/* ── Tabs & switches ──────────────────────────────────────────────────────── */

export const Seg = ({ value, onChange, items = [], solid }) => (
  <div className={`tr-seg${solid ? ' tr-seg--solid' : ''}`} role="group">
    {items.map((it) => (
      <button key={it.value} type="button" aria-pressed={value === it.value} onClick={() => onChange?.(it.value)}>
        {it.icon ? <Ico name={it.icon} size={15} /> : null}{it.label}
      </button>
    ))}
  </div>
);
export const Pills = ({ value, onChange, items = [] }) => (
  <div className="tr-pills" role="group">
    {items.map((it) => (
      <button key={it.value} type="button" aria-pressed={value === it.value} onClick={() => onChange?.(it.value)}>
        {it.icon ? <Ico name={it.icon} size={15} /> : null}
        {it.label}
        {it.count != null ? <span className="tr-pills__count">{it.count}</span> : null}
      </button>
    ))}
  </div>
);
export const UTabs = ({ value, onChange, items = [] }) => (
  <div className="tr-utabs" role="tablist">
    {items.map((it) => (
      <button key={it.value} type="button" role="tab" aria-selected={value === it.value} onClick={() => onChange?.(it.value)}>
        {it.icon ? <Ico name={it.icon} size={15} /> : null}
        {it.label}
        {it.count != null ? <span className="tr-pills__count">{it.count}</span> : null}
      </button>
    ))}
  </div>
);
export const Toggle = ({ checked, onChange, disabled, label }) => (
  <button type="button" className="tr-toggle" role="switch" aria-checked={!!checked} aria-label={label}
          disabled={disabled} onClick={() => onChange?.(!checked)}><i /></button>
);
export const SwitchRow = ({ title, note, checked, onChange, disabled, children }) => (
  <div className="tr-switchrow">
    <div className="tr-switchrow__text"><b>{title}</b>{note ? <span>{note}</span> : null}</div>
    {children ?? <Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} />}
  </div>
);
export const Radio = ({ name, value, checked, onChange, label }) => (
  <label className="tr-radio">
    <input type="radio" name={name} value={value} checked={!!checked} onChange={() => onChange?.(value)} />
    {label}
  </label>
);
export const Check = ({ checked, onChange, label, indeterminate }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <label className="tr-check">
      <input ref={ref} type="checkbox" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} />
      {label}
    </label>
  );
};

/* ── Table pieces ─────────────────────────────────────────────────────────── */

export const TableWrap = ({ children }) => <div className="tr-tablewrap">{children}</div>;
export const Cell2 = ({ top, sub, children }) => (
  <div className="tr-cell2"><b>{top}</b>{sub ? <span>{sub}</span> : null}{children}</div>
);
/**
 * A photo, or initials.
 *
 * `broken` is the important half: a student record can carry the filename of a
 * photo that is no longer on disk, and an <img> that 404s draws the browser's
 * torn-page icon in the middle of a table row. On the first error the photo is
 * abandoned and the initials take over, which is what the row wanted anyway.
 */
export const Avatar = ({ name, src, size = 'md', id }) => {
  const cls = size === 'sm' ? ' tr-avatar--sm' : size === 'lg' ? ' tr-avatar--lg' : size === 'xl' ? ' tr-avatar--xl' : '';
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const url = broken ? '' : fileUrl(src);
  return url
    ? <img className={`tr-avatar${cls}`} src={url} alt={name || ''} onError={() => setBroken(true)} />
    : <span className={`tr-avatar${cls}`} style={{ background: avatarTone(id || name) }}>{initials(name)}</span>;
};
export const Who = ({ name, sub, src, id, size, right }) => (
  <div className="tr-who">
    <Avatar name={name} src={src} id={id} size={size} />
    <div className="tr-cell2" style={{ minWidth: 0 }}><b>{name || '—'}</b>{sub ? <span>{sub}</span> : null}</div>
    {right}
  </div>
);
export const Thumb = ({ src, alt, icon = 'bus', lg }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const url = broken ? '' : fileUrl(src);
  return url
    ? <img className={`tr-thumb${lg ? ' tr-thumb--lg' : ''}`} src={url} alt={alt || ''} onError={() => setBroken(true)} />
    : <span className={`tr-thumb${lg ? ' tr-thumb--lg' : ''}`}><Glyph name={icon} size={lg ? 42 : 18} /></span>;
};
export const Badge = ({ tone = 'slate', square, children, dot }) => (
  <span className={`tr-badge tr-b-${tone}${square ? ' tr-badge--sq' : ''}`}>
    {dot ? <i className={`tr-dot tr-dot--${dot === true ? tone : dot}`} /> : null}{children}
  </span>
);
export const StatusBadge = ({ value, tone, label, square, dot }) => (
  <Badge tone={tone || statusTone(value)} square={square} dot={dot}>{label || statusWord(value)}</Badge>
);
export const Chip = ({ tone = 'slate', color, children, style }) => (
  color
    ? <span className="tr-tagchip" style={{ background: `${color}1f`, color, ...style }}>{children}</span>
    : <span className={`tr-tagchip tr-b-${tone}`} style={style}>{children}</span>
);
/** The R1/R2 badge — one colour per route, everywhere it appears. */
export const RouteBadge = ({ route, tag, color, sm }) => {
  const t = tag || route?.tag || '—';
  const c = color || route?.color || '#64748b';
  return <span className={`tr-rbadge${sm ? ' tr-rbadge--sm' : ''}`} style={{ background: c }}>{t}</span>;
};
export const Bar = ({ value, max = 100, color = 'var(--tr-primary)', lg }) => (
  <span className={`tr-bar${lg ? ' tr-bar--lg' : ''}`}>
    <i style={{ width: `${Math.min(100, Math.max(0, (num(value) / (num(max) || 1)) * 100))}%`, background: color }} />
  </span>
);
export const DateChip = ({ day, month, tone = 'indigo' }) => (
  <span className={`tr-datechip tr-t-${tone}`}><b>{day}</b><span>{month}</span></span>
);

/* ── Pager ────────────────────────────────────────────────────────────────── */

export function Pager({ page = 1, pages = 1, total = 0, limit, onPage, onLimit, noun = 'records', limits = [5, 8, 10, 25, 50] }) {
  const from = total === 0 ? 0 : (page - 1) * (limit || 0) + 1;
  const to = Math.min(total, page * (limit || total));
  const list = useMemo(() => {
    const out = [];
    const push = (p) => { if (!out.includes(p) && p >= 1 && p <= pages) out.push(p); };
    push(1); push(2);
    for (let p = page - 1; p <= page + 1; p++) push(p);
    push(pages - 1); push(pages);
    return out.sort((a, b) => a - b);
  }, [page, pages]);
  return (
    <div className="tr-pager">
      <span>{limit ? `Showing ${from} to ${to} of ${count(total)} ${noun}` : `${count(total)} ${noun}`}</span>
      <div className="tr-pager__pages">
        <button type="button" disabled={page <= 1} onClick={() => onPage?.(page - 1)} aria-label="Previous page">
          <Icon name="chevronLeft" size={15} />
        </button>
        {list.map((p, i) => (
          <React.Fragment key={p}>
            {i > 0 && p - list[i - 1] > 1 ? <span style={{ padding: '0 2px', color: 'var(--tr-faint)' }}>…</span> : null}
            <button type="button" aria-current={p === page} onClick={() => onPage?.(p)}>{p}</button>
          </React.Fragment>
        ))}
        <button type="button" disabled={page >= pages} onClick={() => onPage?.(page + 1)} aria-label="Next page">
          <Icon name="chevronRight" size={15} />
        </button>
        {onLimit ? (
          <Select value={String(limit)} onChange={(v) => onLimit(+v)}
                  options={limits.map((n) => ({ value: String(n), label: `${n} per page` }))} width={130} />
        ) : null}
      </div>
    </div>
  );
}

/* ── Facts, rows, notes ───────────────────────────────────────────────────── */

export const Facts = ({ one, children }) => <div className={`tr-facts${one ? ' tr-facts--1' : ''}`}>{children}</div>;
export const Fact = ({ icon, k, v }) => (
  <div className="tr-fact">
    {icon ? <span className="tr-fact__ico"><Ico name={icon} size={17} /></span> : null}
    <span className="tr-fact__text"><span className="tr-fact__k">{k}</span><span className="tr-fact__v">{v ?? '—'}</span></span>
  </div>
);
export const Rows = ({ children }) => <div className="tr-rows">{children}</div>;
export const Row = ({ icon, iconTone, avatar, title, sub, end, endSub, selected, onClick, to, children, badge }) => {
  const El = to ? Link : (onClick ? 'div' : 'div');
  return (
    <El className={`tr-row${onClick || to ? ' tr-row--pick' : ''}`} aria-selected={selected || undefined}
        onClick={onClick} to={to} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}>
      {icon ? <Mark name={icon} tone={iconTone || 'indigo'} size={34} glyph={17} /> : null}
      {avatar}
      <div className="tr-row__text"><b>{title}</b>{sub ? <span>{sub}</span> : null}</div>
      {children}
      {badge}
      {end != null || endSub ? <div className="tr-row__end">{end != null ? <b>{end}</b> : null}{endSub}</div> : null}
    </El>
  );
};
export const Note = ({ tone = 'info', icon, title, children }) => (
  <div className={`tr-note tr-note--${tone}`}>
    {icon !== null ? <Glyph name={icon || { good: 'check', info: 'info', warn: 'alert', bad: 'bang' }[tone]} size={18} /> : null}
    <div>{title ? <b>{title}</b> : null}{children}</div>
  </div>
);
export const QuickActions = ({ items = [] }) => (
  <div className="tr-qa">
    {items.filter(Boolean).map((it) => (
      it.to
        ? <Link key={it.label} to={it.to}><span className="tr-qa__ico"><Ico name={it.icon} size={17} /></span><span>{it.label}</span></Link>
        : <button key={it.label} type="button" onClick={it.onClick} disabled={it.disabled}>
            <span className="tr-qa__ico"><Ico name={it.icon} size={17} /></span><span>{it.label}</span>
          </button>
    ))}
  </div>
);
export const HelpCard = ({ title, children, action }) => (
  <div className="tr-help">
    <span style={{ color: '#6d28d9', display: 'inline-flex' }}><Icon name="sparkle" size={18} /></span>
    <div style={{ minWidth: 0 }}><b>{title}</b>{children}{action}</div>
  </div>
);

/* ── Timeline & stops ─────────────────────────────────────────────────────── */

export const Timeline = ({ children }) => <div className="tr-timeline">{children}</div>;
export const TL = ({ time, title, sub, state }) => (
  <div className={`tr-tl${state ? ` tr-tl--${state}` : ''}`}>
    {time ? <div className="tr-tl__time">{time}</div> : null}
    <div className="tr-tl__title">{title}</div>
    {sub ? <div className="tr-tl__sub">{sub}</div> : null}
  </div>
);
export const Stops = ({ children }) => <div className="tr-stops">{children}</div>;
export const Stop = ({ index, name, sub, state = 'done', badge }) => (
  <div className={`tr-stop tr-stop--${state}`}>
    <div className="tr-stop__text"><b>{index != null ? `${index}. ` : ''}{name}</b>{sub ? <span>{sub}</span> : null}</div>
    {badge}
  </div>
);

/* ── Empty & loading ──────────────────────────────────────────────────────── */

export const Empty = ({ icon = 'bus', title = 'Nothing here yet', children, sm, action }) => (
  <div className={`tr-empty${sm ? ' tr-empty--sm' : ''}`}>
    <div className="tr-empty__ico"><Glyph name={icon} size={sm ? 26 : 34} /></div>
    <b>{title}</b>
    {children ? <p>{children}</p> : null}
    {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
  </div>
);
export const Loading = ({ tiles = 5, rows = 5 }) => (
  <div className="tr-loading">
    <div className="tr-skel" style={{ height: 34, width: 280 }} />
    <div className="tr-tiles">{Array.from({ length: tiles }, (_, i) => <div key={i} className="tr-skel" style={{ height: 104 }} />)}</div>
    <div className="tr-skel" style={{ height: 56 }} />
    <div className="tr-skel" style={{ height: rows * 46 + 44 }} />
  </div>
);

/* ── Modal, drawer, confirm ───────────────────────────────────────────────── */

export function Modal({ open, onClose, title, sub, icon, iconTone = 'indigo', wide, xl, slim, foot, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="tr-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`tr-modal${wide ? ' tr-modal--wide' : ''}${xl ? ' tr-modal--xl' : ''}${slim ? ' tr-modal--slim' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="tr-modal__head">
          {icon ? <Mark name={icon} tone={iconTone} size={40} glyph={20} /> : null}
          <div className="tr-card__grow"><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div>
          <IconBtn icon="close" kind="plain" label="Close" onClick={onClose} />
        </header>
        <div className="tr-modal__body">{children}</div>
        {foot ? <footer className="tr-modal__foot">{foot}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'primary', busy }) {
  return (
    <Modal open={open} onClose={onClose} title={title} slim
           icon={tone === 'danger' ? 'alert' : 'info'} iconTone={tone === 'danger' ? 'red' : 'indigo'}
           foot={<>
             <Btn onClick={onClose}>Cancel</Btn>
             <Btn kind={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
               {busy ? 'Working…' : confirmLabel}
             </Btn>
           </>}>
      <p style={{ margin: 0, fontSize: '.88rem', lineHeight: 1.55, color: 'var(--tr-ink-2)' }}>{message}</p>
    </Modal>
  );
}

/* ── Files ────────────────────────────────────────────────────────────────── */

export function saveFile(name, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** rows: array of objects; cols: [[key, Label], …]. Excel wants the BOM. */
export function toCsv(cols, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${[cols.map((c) => cell(c[1])).join(',')]
    .concat(rows.map((r) => cols.map((c) => cell(typeof c[2] === 'function' ? c[2](r) : r[c[0]])).join(','))).join('\n')}`;
}
/**
 * Parse a pasted or uploaded CSV into objects keyed by its header row.
 * Handles quoted fields and embedded commas — an address column is full of them.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const s = String(text || '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!clean.length) return { headers: [], rows: [] };
  const headers = clean[0].map((h) => String(h).trim());
  return {
    headers,
    rows: clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()]))),
  };
}
/** Open a server-rendered HTML document (a receipt, a report) in a new tab. */
export function openHtml(html, title = 'Document') {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.title = title;
  w.document.close();
  return true;
}

/* ── Hooks ────────────────────────────────────────────────────────────────── */

/** A value that settles after the user stops typing — for search boxes. */
export function useDebounced(value, ms = 320) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Load a board, and reload it when its query changes.
 *
 * Returns the raw payload plus `reload` so an action can refresh without a
 * remount. `deps` is compared as JSON, so passing a fresh object literal each
 * render does not loop.
 */
export function useBoard(loader, deps = [], { poll = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const key = JSON.stringify(deps);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // The guard against setting state after unmount has to be RE-ARMED on mount,
  // not only disarmed on unmount. The app runs in React.StrictMode, which in
  // development mounts, cleans up and mounts again: a ref that is only ever set
  // to false stays false for the rest of the component's life, so every
  // setData/setLoading below is skipped and the screen sits on its loading
  // skeleton for ever. It only bites in dev, which is why a production build
  // looked fine.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await loaderRef.current();
      const body = res?.data ?? res;
      if (alive.current) { setData(body); setError(''); }
    } catch (e) {
      if (alive.current) setError(e?.message || 'Could not load this screen');
    } finally {
      // `loading` must be cleared even if this call lost the race to an
      // unmount — a stale `true` is what leaves the skeleton on screen.
      if (alive.current && !quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [key, run]);          // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!poll) return undefined;
    const t = setInterval(() => run(true), poll * 1000);
    return () => clearInterval(t);
  }, [poll, run, key]);

  return { data, loading, error, reload: () => run(true), hardReload: () => run(false) };
}
