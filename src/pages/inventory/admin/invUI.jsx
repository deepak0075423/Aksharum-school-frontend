/**
 * The Inventory module's own UI kit (Sep 2026 redesign, to the user's twelve
 * mockups).
 *
 * Twelve screens, seven shapes: a tinted hero banner, a row of figure tiles, a
 * strip of charts, a filter bar, a table in a card with a pager under it, a
 * rail that answers "what about the row I picked", and a modal for the forms.
 * The mockups draw these slightly differently per screen — six tiles here and
 * four there, a sparkline on one row of tiles and a delta chip on another, a
 * rail on five screens and none on the other seven — so the pieces take props
 * rather than one look being forced on twelve screens.
 *
 * Two things are worth knowing before changing anything here:
 *
 *   · `DataTable` is declarative on purpose. A screen describes its columns
 *     once and gets the sticky header, the sort arrows, the select column, the
 *     actions column AND the narrow-page card layout from that one definition.
 *     Hand-rolling a <table> in a screen loses the card layout silently, which
 *     is exactly how a module ends up unusable on a phone.
 *   · The breakpoints live in styles/inventory.css as CONTAINER queries on
 *     `.inv-page`. Nothing here should ask the viewport how wide it is.
 */
import React, {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Icon, { ICON_NAMES } from '../../../components/ui/icons';
import { Drawer, DrawerFoot } from '../../../components/ui/Drawer';
import '../../../styles/inventory.css';
import { newestYear } from '../../../utils/listOrder';

/* ── Numbers ─────────────────────────────────────────────────────────────── */

export const num = (v) => (Number.isFinite(+v) ? +v : 0);
export const count = (n) => num(n).toLocaleString('en-IN');

/** Indian grouping, with the minus rendered as a true minus sign. */
export function money(n, { sym = '₹', dec = 0, sign = false } = {}) {
  const v = num(n);
  const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const lead = v < 0 ? '−' : (sign && v > 0 ? '+' : '');
  return `${lead}${sym}${s}`;
}
/** Axis money: ₹12.4L, ₹40K — a tick label has no room for eight digits. */
export function compactMoney(n, sym = '₹') {
  const v = num(n);
  if (!v) return `${sym}0`;
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e7) return `${s}${sym}${+(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}${sym}${+(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${s}${sym}${+(a / 1e3).toFixed(1)}K`;
  return `${s}${sym}${Math.round(a)}`;
}
export const compact = (n) => {
  const v = num(n);
  const a = Math.abs(v);
  if (a >= 1e7) return `${+(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${+(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
};
export const pct = (a, b) => (num(b) ? Math.round((num(a) / num(b)) * 100) : 0);
export const plural = (n, one, many) => `${count(n)} ${num(n) === 1 ? one : (many || `${one}s`)}`;
export const words = (v) => String(v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/* ── Dates ───────────────────────────────────────────────────────────────── */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const asDate = (d) => {
  if (!d) return null;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
};
/** "24 Sep 2026" */
export function fmtDate(d, dash = '—') {
  const x = asDate(d);
  return x ? `${String(x.getDate()).padStart(2, '0')} ${MON[x.getMonth()]} ${x.getFullYear()}` : dash;
}
/** "Mon, 24 Sep 2026" */
export function fmtDay(d) {
  const x = asDate(d);
  return x ? `${DAY[x.getDay()]}, ${fmtDate(x)}` : '—';
}
/** "03:42 PM" */
export function fmtTime(d) {
  const x = asDate(d);
  if (!x) return '—';
  let h = x.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')} ${ap}`;
}
/** "15:42:18" — the Activity Log prints seconds, because an audit trail does. */
export function fmtClock(d) {
  const x = asDate(d);
  if (!x) return '';
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}:${String(x.getSeconds()).padStart(2, '0')}`;
}
export const fmtDateTime = (d) => (asDate(d) ? `${fmtDate(d)}, ${fmtTime(d)}` : '—');
/** The YYYY-MM-DD an <input type="date"> wants, in local time. */
export const isoDay = (d) => {
  const x = asDate(d);
  return x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` : '';
};
export function ago(d) {
  const x = asDate(d);
  if (!x) return '';
  const s = Math.max(0, (Date.now() - x.getTime()) / 1000);
  if (s < 45) return 'just now';
  const mins = Math.floor(s / 60);
  if (s < 3600) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(s / 3600);
  if (s < 86400) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(s / 86400);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? '' : 's'} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) === 1 ? '' : 's'} ago`;
}
/** Whole days from today, floored at the day boundary rather than at 24h. */
export function daysFromToday(d) {
  const x = asDate(d);
  if (!x) return null;
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(x); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

/* ── People and files ────────────────────────────────────────────────────── */

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
/** Uploads are served from the backend root, but VITE_API_URL carries /api. */
export function fileUrl(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path;
  const base = String(import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
  return `${base}/${String(path).replace(/^\//, '')}`;
}

/* ── Vocabulary ──────────────────────────────────────────────────────────── */
/*
   One table for every status word in the module, so "Low Stock" is the same
   two words and the same amber wherever it is drawn. key → [tone, label, icon].
*/
export const STATUS = {
  // stock
  in_stock: ['green', 'In Stock', 'checkCircle'],
  low_stock: ['amber', 'Low Stock', 'alert'],
  out_of_stock: ['red', 'Out of Stock', 'closeCircle'],
  under_repair: ['violet', 'Under Repair', 'wrench'],
  not_tracked: ['slate', 'Not Tracked', 'minus'],
  // requests
  pending: ['amber', 'Pending', 'clock'],
  approved: ['green', 'Approved', 'checkCircle'],
  rejected: ['red', 'Rejected', 'closeCircle'],
  converted: ['blue', 'Converted to PO', 'truck'],
  fulfilled_from_stock: ['teal', 'From Stock', 'package'],
  cancelled: ['red', 'Cancelled', 'closeCircle'],
  // purchase orders
  draft: ['slate', 'Draft', 'pencil'],
  pending_approval: ['amber', 'Pending Approval', 'clock'],
  in_transit: ['blue', 'In Transit', 'truck'],
  partially_received: ['teal', 'Partly Delivered', 'package'],
  delivered: ['green', 'Delivered', 'package'],
  // issue / return
  pending_return: ['amber', 'Pending Return', 'clock'],
  returned: ['green', 'Returned', 'checkCircle'],
  overdue: ['red', 'Overdue', 'alert'],
  consumed: ['slate', 'Consumed', 'minus'],
  issue: ['blue', 'Issue', 'arrowRight'],
  // conditions
  good: ['green', 'Good'],
  used: ['amber', 'Used'],
  partially_used: ['amber', 'Partially Used'],
  fair: ['amber', 'Fair'],
  poor: ['orange', 'Poor'],
  damaged: ['red', 'Damaged'],
  lost: ['red', 'Lost'],
  repair_needed: ['violet', 'Repair Needed'],
  // assets
  in_use: ['green', 'In Use', 'checkCircle'],
  in_store: ['slate', 'In Store', 'package'],
  under_maintenance: ['amber', 'Under Maintenance', 'wrench'],
  out_of_service: ['red', 'Out of Service', 'alert'],
  retired: ['slate', 'Retired', 'archive'],
  // masters
  active: ['green', 'Active'],
  inactive: ['red', 'Inactive'],
  preferred: ['violet', 'Preferred', 'star'],
  low_capacity: ['amber', 'Low Capacity'],
  closed: ['slate', 'Closed'],
  over_budget: ['red', 'Over Budget'],
  near_limit: ['amber', 'Near Limit'],
  // expiry
  expiring_soon: ['amber', 'Expiring Soon'],
  expiring_now: ['red', 'Expiring Now'],
  // activity verbs
  created: ['green', 'Created'],
  added: ['green', 'Added'],
  updated: ['amber', 'Updated'],
  deleted: ['red', 'Deleted'],
  issued: ['blue', 'Issued'],
  received: ['teal', 'Received'],
  transferred: ['indigo', 'Transferred'],
};
export const statusWord = (k) => STATUS[k]?.[1] ?? words(k);
export const statusTone = (k) => STATUS[k]?.[0] ?? 'slate';
export const statusIcon = (k) => STATUS[k]?.[2] ?? null;

/** The tint each module gets in the Activity Log's Module column. */
export const MODULE_TONE = {
  Items: 'indigo', Stock: 'blue', Request: 'amber', 'Purchase Order': 'violet',
  'Issue / Return': 'teal', Assets: 'pink', Vendor: 'orange', Categories: 'sky',
  Warehouses: 'green', Budget: 'rose', Inventory: 'slate',
};
export const USER_TYPE = { student: 'Student', teacher: 'Teacher', staff: 'Staff', department: 'Department', class: 'Class Group' };
export const WAREHOUSE_TYPE = { main: 'Main', department: 'Department', secondary: 'Secondary' };
export const BUDGET_SCOPE = { department: 'Department', category: 'Category', both: 'Department & Category' };

/* ── Glyphs ──────────────────────────────────────────────────────────────── */
/*
   The mockups' tile marks and category icons are solid shapes with white
   detail, not the app's outline set, so the module draws its own. 24×24, in
   currentColor. `Ico` prefers the shared registry — a toolbar icon should look
   like every other toolbar icon in the app — and falls back to a glyph here,
   because the shared `Icon` renders NOTHING for a name it does not know, which
   is how a button becomes an empty box.
*/
const W = '#fff';
const GLYPHS = {
  printer: <><rect x="6.2" y="2.8" width="11.6" height="5.4" rx="1.2" fill="currentColor" opacity=".72" /><rect x="2.8" y="8.2" width="18.4" height="8.4" rx="2.2" fill="currentColor" /><rect x="6.2" y="14.6" width="11.6" height="6.6" rx="1.4" fill="currentColor" opacity=".72" /><path d="M8.6 17.2h6.8M8.6 19.2h4.4" stroke={W} strokeWidth="1.4" strokeLinecap="round" /><circle cx="18" cy="11.2" r="1.1" fill={W} /></>,
  box: <><path d="M12 2.6 21 7v10l-9 4.4L3 17V7z" fill="currentColor" /><path d="m3 7 9 4.3L21 7" stroke={W} strokeWidth="1.5" fill="none" /><path d="M12 11.3v10.1" stroke={W} strokeWidth="1.5" /></>,
  boxes: <><rect x="2.6" y="9.4" width="9" height="9" rx="1.6" fill="currentColor" /><rect x="12.4" y="9.4" width="9" height="9" rx="1.6" fill="currentColor" opacity=".78" /><rect x="7.5" y="2.6" width="9" height="6.2" rx="1.6" fill="currentColor" opacity=".9" /><path d="M5.4 13.2h3.4M15.2 13.2h3.4M10.3 5.4h3.4" stroke={W} strokeWidth="1.5" strokeLinecap="round" /></>,
  package: <><path d="M12 2.6 21 7v10l-9 4.4L3 17V7z" fill="currentColor" /><path d="M7.5 4.8 16.5 9.3v3" stroke={W} strokeWidth="1.5" fill="none" strokeLinecap="round" /><path d="m3 7 9 4.3L21 7" stroke={W} strokeWidth="1.4" fill="none" /></>,
  rupee: <><circle cx="12" cy="12" r="9.6" fill="currentColor" /><path d="M8.8 7.4h6.4M8.8 10.1h6.4M13.2 7.4c1.3 0 2.2 1 2.2 2.3s-.9 2.3-2.2 2.3H9.2l4.6 4.7" stroke={W} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  coins: <><ellipse cx="12" cy="6.6" rx="7.6" ry="3.2" fill="currentColor" /><path d="M4.4 6.6v4c0 1.8 3.4 3.2 7.6 3.2s7.6-1.4 7.6-3.2v-4" fill="currentColor" opacity=".8" /><path d="M4.4 10.6v4c0 1.8 3.4 3.2 7.6 3.2s7.6-1.4 7.6-3.2v-4" fill="currentColor" opacity=".62" /></>,
  wallet: <><rect x="2.8" y="5.2" width="18.4" height="14" rx="3" fill="currentColor" /><path d="M2.8 9.6h18.4" stroke={W} strokeWidth="1.4" opacity=".55" /><circle cx="17" cy="13.4" r="1.7" fill={W} /></>,
  bank: <><path d="M12 2.6 22 8H2z" fill="currentColor" /><path d="M4.4 9.6h2.4v8H4.4zm6.4 0h2.4v8h-2.4zm6.4 0h2.4v8h-2.4z" fill="currentColor" /><rect x="2.4" y="18.4" width="19.2" height="2.8" rx="1" fill="currentColor" /></>,
  doc: <><path d="M6.2 2.6h7.2L19 8.3V19a2.4 2.4 0 0 1-2.4 2.4H6.2A2.4 2.4 0 0 1 3.8 19V5A2.4 2.4 0 0 1 6.2 2.6z" fill="currentColor" /><path d="M13.2 2.8v4.1a1 1 0 0 0 1 1h4.2" fill="none" stroke={W} strokeWidth="1.2" opacity=".65" /><path d="M7.6 12.4h7.2M7.6 15.8h4.8" stroke={W} strokeWidth="1.6" strokeLinecap="round" /></>,
  invoice: <><path d="M4.6 2.8h14.8v18.4l-2.5-1.5-2.4 1.5-2.5-1.5-2.4 1.5-2.5-1.5-2.5 1.5z" fill="currentColor" /><path d="M8 8h8M8 11.6h8M8 15.2h5" stroke={W} strokeWidth="1.5" strokeLinecap="round" /></>,
  request: <><rect x="3.2" y="2.8" width="17.6" height="18.4" rx="3" fill="currentColor" /><rect x="8" y="1.4" width="8" height="4" rx="1.6" fill="currentColor" /><rect x="8.6" y="2" width="6.8" height="2.8" rx="1" fill={W} /><path d="m8.2 12.4 2 2 4.6-4.8" stroke={W} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" /><path d="M8.2 17.2h7.6" stroke={W} strokeWidth="1.6" strokeLinecap="round" /></>,
  clipboard: <><rect x="3.4" y="3" width="17.2" height="18" rx="3" fill="currentColor" /><rect x="8.2" y="1.5" width="7.6" height="4" rx="1.6" fill="currentColor" /><rect x="8.8" y="2.1" width="6.4" height="2.8" rx="1" fill={W} /><path d="M7.8 10.4h8.4M7.8 14h5.6" stroke={W} strokeWidth="1.6" strokeLinecap="round" /></>,
  truck: <><path d="M2.6 6.6a2 2 0 0 1 2-2h8.2v10.8H2.6z" fill="currentColor" /><path d="M13.6 8.2h3.6l3.8 3.6v3.6h-7.4z" fill="currentColor" opacity=".82" /><circle cx="7" cy="17.4" r="2.2" fill="currentColor" /><circle cx="17" cy="17.4" r="2.2" fill="currentColor" /><circle cx="7" cy="17.4" r=".9" fill={W} /><circle cx="17" cy="17.4" r=".9" fill={W} /></>,
  send: <><path d="M21.4 2.8 2.9 10.4c-.9.4-.8 1.7.1 2l6.6 2.1 2.1 6.6c.3.9 1.6 1 2 .1z" fill="currentColor" /><path d="m21.4 2.8-11.8 11.7" stroke={W} strokeWidth="1.4" /></>,
  undo: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M8 11.6h5.6a2.9 2.9 0 1 1 0 5.8H10" stroke={W} strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="m10.6 8.6-3 3 3 3" stroke={W} strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  swap: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M7.4 10h8.2l-2.4-2.4M16.6 14H8.4l2.4 2.4" stroke={W} strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  alert: <><path d="M10.3 3.7a2 2 0 0 1 3.4 0l7.7 13.4a2 2 0 0 1-1.7 3H4.3a2 2 0 0 1-1.7-3z" fill="currentColor" /><path d="M12 9v4.6" stroke={W} strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="16.9" r="1.25" fill={W} /></>,
  bang: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 6.8v6.3" stroke={W} strokeWidth="2.3" strokeLinecap="round" /><circle cx="12" cy="16.5" r="1.3" fill={W} /></>,
  check: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="m7.7 12.2 2.9 2.9 5.7-5.9" stroke={W} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  x: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="m8.8 8.8 6.4 6.4m0-6.4-6.4 6.4" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  clock: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 6.7v5.5l3.5 2" stroke={W} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  hourglass: <><path d="M6 2.6h12v3.1c0 2.3-1.6 4.3-3.8 5.1v2.4c2.2.8 3.8 2.8 3.8 5.1v3.1H6v-3.1c0-2.3 1.6-4.3 3.8-5.1v-2.4C7.6 10 6 8 6 5.7z" fill="currentColor" /><path d="M9.2 18.4c.5-1.6 1.5-2.6 2.8-2.6s2.3 1 2.8 2.6z" fill={W} /></>,
  wrench: <><path d="M20 6.2a5.2 5.2 0 0 1-6.6 6.6l-6.6 6.7a2.1 2.1 0 1 1-3-3l6.7-6.6A5.2 5.2 0 0 1 17.1 3.2l-3 3 .6 2.9 2.9.6z" fill="currentColor" /></>,
  monitor: <><rect x="2.4" y="3.4" width="19.2" height="13" rx="2.4" fill="currentColor" /><rect x="4.6" y="5.6" width="14.8" height="8.6" rx="1.2" fill={W} opacity=".85" /><path d="M8.4 20.4h7.2M12 16.4v4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" /></>,
  laptop: <><rect x="4" y="4.4" width="16" height="11" rx="2" fill="currentColor" /><rect x="5.9" y="6.3" width="12.2" height="7.2" rx="1" fill={W} opacity=".85" /><path d="M2 17.4h20l-1.2 2.2H3.2z" fill="currentColor" /></>,
  factory: <><path d="M2.6 20.8V9.4l6 3.6V9.4l6 3.6V6.2l6.8-1.8v16.4z" fill="currentColor" /><path d="M5.6 15.6h2v2.6h-2zm5 0h2v2.6h-2zm5 0h2v2.6h-2z" fill={W} /></>,
  warehouse: <><path d="M2.6 9.6 12 4.2l9.4 5.4v11.2H2.6z" fill="currentColor" /><path d="M7 12.6h10v8.2H7z" fill={W} opacity=".9" /><path d="M7 15.6h10M7 18.2h10M12 12.6v8.2" stroke="currentColor" strokeWidth="1.2" opacity=".55" /></>,
  building: <><path d="M4.2 20.8V6.2a2 2 0 0 1 1.3-1.9l6-2.1a1 1 0 0 1 1.3.9v3.2l4.9 1.6a2 2 0 0 1 1.4 1.9v11z" fill="currentColor" /><path d="M7.4 9h2v2h-2zm0 4h2v2h-2zm7.2 0h2v2h-2zm0-4h2v2h-2z" fill={W} /></>,
  folder: <><path d="M2.6 6.6a2.4 2.4 0 0 1 2.4-2.4h3.8l2 2.4h8.6a2.4 2.4 0 0 1 2.4 2.4v8.8a2.4 2.4 0 0 1-2.4 2.4H5a2.4 2.4 0 0 1-2.4-2.4z" fill="currentColor" /><path d="M2.6 10.6h18.8" stroke={W} strokeWidth="1.3" opacity=".5" /></>,
  layers: <><path d="m12 2.6 9.2 4.8-9.2 4.8-9.2-4.8z" fill="currentColor" /><path d="m3.6 12 8.4 4.4 8.4-4.4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".72" /><path d="m3.6 16.4 8.4 4.4 8.4-4.4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".48" /></>,
  briefcase: <><rect x="2.6" y="6.6" width="18.8" height="13.2" rx="2.6" fill="currentColor" /><path d="M8.6 6.6V5.2a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2v1.4" stroke="currentColor" strokeWidth="2.1" fill="none" strokeLinecap="round" /><path d="M2.6 11.6h18.8" stroke={W} strokeWidth="1.4" opacity=".55" /><rect x="10.4" y="10.4" width="3.2" height="2.6" rx=".8" fill={W} /></>,
  chart: <><rect x="2.8" y="3" width="18.4" height="18" rx="3.2" fill="currentColor" /><path d="M7.6 16v-3.4m4.4 3.4V8.8m4.4 7.2v-5" stroke={W} strokeWidth="2.1" strokeLinecap="round" /></>,
  trend: <><rect x="2.8" y="3" width="18.4" height="18" rx="3.2" fill="currentColor" /><path d="m6.8 14.8 3.2-3.4 2.4 2.2 4.8-5" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  users: <><circle cx="9" cy="7.8" r="3.5" fill="currentColor" /><path d="M2.6 19.6c0-3.5 2.9-6.4 6.4-6.4s6.4 2.9 6.4 6.4z" fill="currentColor" /><circle cx="17.5" cy="8.6" r="2.7" fill="currentColor" opacity=".72" /><path d="M16.6 13.6c2.8 0 4.8 2 4.8 4.8v1.2h-3.8c0-2.4-.7-4.4-2.1-5.9a5 5 0 0 1 1.1-.1z" fill="currentColor" opacity=".72" /></>,
  user: <><circle cx="12" cy="7.6" r="3.9" fill="currentColor" /><path d="M4 20.6c0-4.1 3.6-7.2 8-7.2s8 3.1 8 7.2z" fill="currentColor" /></>,
  star: <><path d="m12 2.6 2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" fill="currentColor" /></>,
  flask: <><path d="M9.4 2.6h5.2v1.8h-1v4.3l4.8 8.6a2.6 2.6 0 0 1-2.3 3.9H7.9a2.6 2.6 0 0 1-2.3-3.9l4.8-8.6V4.4h-1z" fill="currentColor" /><path d="M8.2 14.6h7.6l1.9 3.4H6.3z" fill={W} opacity=".72" /></>,
  bulb: <><path d="M12 2.4a6.6 6.6 0 0 0-3.8 12v2.2h7.6v-2.2A6.6 6.6 0 0 0 12 2.4z" fill="currentColor" /><rect x="9" y="17.8" width="6" height="1.9" rx=".9" fill="currentColor" /><rect x="9.8" y="20.4" width="4.4" height="1.6" rx=".8" fill="currentColor" opacity=".7" /></>,
  book: <><path d="M3.4 4.6A2 2 0 0 1 5.4 2.6h13.2a2 2 0 0 1 2 2v14.8a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z" fill="currentColor" /><path d="M7.4 2.6v18.8" stroke={W} strokeWidth="1.4" opacity=".55" /><path d="M10.4 7.4h6.6M10.4 10.8h4.6" stroke={W} strokeWidth="1.5" strokeLinecap="round" /></>,
  pencil: <><path d="m14.9 3.7 5.4 5.4L9.4 20h-5.4v-5.4z" fill="currentColor" /><path d="m14.9 3.7 5.4 5.4 1.4-1.4a2 2 0 0 0 0-2.8l-2.6-2.6a2 2 0 0 0-2.8 0z" fill="currentColor" opacity=".72" /></>,
  broom: <><path d="M14.4 2.6 21 9.2l-3.4 3.4-6.6-6.6z" fill="currentColor" opacity=".78" /><path d="m10.6 6.8 6.6 6.6-2 2 .6 6.2-9.4-1.4-2.2-2.2 1.4-9.4 6.2.6z" fill="currentColor" /></>,
  medical: <><rect x="2.6" y="6.2" width="18.8" height="14" rx="3" fill="currentColor" /><path d="M8.6 6.2V5a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2v1.2" stroke="currentColor" strokeWidth="2.1" fill="none" strokeLinecap="round" /><path d="M10.6 10.6h2.8v2.4h2.4v2.8h-2.4v2.4h-2.8v-2.4H8.2v-2.8h2.4z" fill={W} /></>,
  shirt: <><path d="M8.6 2.6 12 5l3.4-2.4 5.6 3-2.2 4.6-2-1v11.2H6.2V9.2l-2 1L2 5.6z" fill="currentColor" /></>,
  ball: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 2.5v19M2.5 12h19M5.4 5.4a13 13 0 0 1 13.2 13.2M18.6 5.4A13 13 0 0 0 5.4 18.6" stroke={W} strokeWidth="1.3" fill="none" opacity=".75" /></>,
  bus: <><rect x="3.2" y="3.8" width="17.6" height="13.4" rx="3" fill="currentColor" /><path d="M5.6 7.2h12.8v4.3H5.6z" fill={W} opacity=".9" /><circle cx="7.4" cy="14.4" r="1.3" fill={W} /><circle cx="16.6" cy="14.4" r="1.3" fill={W} /><path d="M6.4 17.2v1.9a.9.9 0 0 1-.9.9h-.7a.9.9 0 0 1-.9-.9v-1.9zm13.7 0v1.9a.9.9 0 0 1-.9.9h-.7a.9.9 0 0 1-.9-.9v-1.9z" fill="currentColor" /></>,
  history: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 6.6V12l3.8 2.2" stroke={W} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" /><path d="M3.6 8.4h3.8v3.8" stroke="currentColor" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  download: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 7v7m0 0-3-3m3 3 3-3M7.8 17h8.4" stroke={W} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  gear: <><path d="M12 2.4a2 2 0 0 1 1.9 1.4l.3 1a7.6 7.6 0 0 1 1.5.9l1-.3a2 2 0 0 1 2.3.9l.6 1a2 2 0 0 1-.4 2.4l-.7.7a7.6 7.6 0 0 1 0 1.7l.7.7a2 2 0 0 1 .4 2.4l-.6 1a2 2 0 0 1-2.3.9l-1-.3a7.6 7.6 0 0 1-1.5.9l-.3 1a2 2 0 0 1-1.9 1.4h-1.1a2 2 0 0 1-1.9-1.4l-.3-1a7.6 7.6 0 0 1-1.5-.9l-1 .3a2 2 0 0 1-2.3-.9l-.6-1a2 2 0 0 1 .4-2.4l.7-.7a7.6 7.6 0 0 1 0-1.7l-.7-.7a2 2 0 0 1-.4-2.4l.6-1a2 2 0 0 1 2.3-.9l1 .3a7.6 7.6 0 0 1 1.5-.9l.3-1A2 2 0 0 1 10.9 2.4z" fill="currentColor" /><circle cx="11.5" cy="12" r="3.1" fill={W} /></>,
  shield: <><path d="M12 2.4 20 5.6v6c0 4.8-3.3 9-8 10.2-4.7-1.2-8-5.4-8-10.2v-6z" fill="currentColor" /><path d="m8.2 12 2.6 2.6 5-5.2" stroke={W} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  pin: <><path d="M12 2.4a6.4 6.4 0 0 0-6.4 6.4c0 4.7 6.4 12.8 6.4 12.8s6.4-8.1 6.4-12.8A6.4 6.4 0 0 0 12 2.4z" fill="currentColor" /><circle cx="12" cy="8.8" r="2.5" fill={W} /></>,
  cart: <><path d="M2.6 3.6h2.7l2.6 10.8h9.9l2.4-8H7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="19.2" r="1.9" fill="currentColor" /><circle cx="17.2" cy="19.2" r="1.9" fill="currentColor" /></>,
  plus: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M12 7.6v8.8M7.6 12h8.8" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  minus: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M7.6 12h8.8" stroke={W} strokeWidth="2.3" strokeLinecap="round" /></>,
  arrowRight: <><circle cx="12" cy="12" r="9.5" fill="currentColor" /><path d="M7.8 12h8m0 0-3.2-3.2M15.8 12l-3.2 3.2" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  archive: <><rect x="2.6" y="3.6" width="18.8" height="4.6" rx="1.6" fill="currentColor" /><path d="M4.4 9.4h15.2v8.4a2.6 2.6 0 0 1-2.6 2.6H7a2.6 2.6 0 0 1-2.6-2.6z" fill="currentColor" opacity=".82" /><path d="M9.6 13h4.8" stroke={W} strokeWidth="1.8" strokeLinecap="round" /></>,
};

/**
 * A glyph from this module's own solid set.
 *
 * A name it does not know falls through to the shared outline registry before
 * it falls back to the generic box — so an icon meant for a button that ends
 * up on a tile still shows the right thing rather than a crate.
 */
export function Glyph({ name, size = 22 }) {
  const g = GLYPHS[name];
  if (!g) {
    if (ICON_NAMES.includes(name)) return <Icon name={name} size={size} aria-hidden />;
    return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">{GLYPHS.box}</svg>;
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">{g}</svg>;
}
/**
 * The shared registry's outline icon where it has the name, this module's solid
 * glyph otherwise. Never renders an empty box.
 */
export const Ico = ({ name, size = 16, ...rest }) => (
  ICON_NAMES.includes(name)
    ? <Icon name={name} size={size} {...rest} />
    : <Glyph name={name} size={size} />
);

/** The rounded tinted square behind an icon, at the mockups' sizes. */
/**
 * The size comes through a custom property rather than a width/height pair, so
 * a container query can shrink a mark that a tile no longer has room for —
 * an inline width would beat any rule that tried.
 */
export const Mark = ({ name, tone = 'indigo', size = 46, glyph, round, className = '', style }) => (
  <span
    className={`inv-mark inv-t-${tone}${round ? ' inv-mark--round' : ''}${size <= 34 ? ' inv-mark--sm' : ''} ${className}`}
    style={{ '--mark': `${size}px`, ...style }}
    aria-hidden
  >
    <Glyph name={name} size={glyph || Math.round(size * 0.48)} />
  </span>
);

/* ── Hero banner ─────────────────────────────────────────────────────────── */

/**
 * The tinted introduction at the top of every screen.
 *
 *   kicker/title/subtitle — the words on the left
 *   art                   — the illustration key (see invArt.jsx); decoration,
 *                           hidden under 1000px because it is not information
 *   promises              — the ticked list on the right (Items … Activity Log)
 *   pill                  — the one-line reassurance instead of a list (Dashboard)
 *   children              — the actions
 */
export function Hero({
  icon = 'box', tone = 'indigo', kicker, title, subtitle,
  art, promises, pill, children,
}) {
  return (
    <section className="inv-hero">
      <Mark name={icon} tone={tone} size={56} glyph={26} className="inv-hero__mark" />
      <div className="inv-hero__text">
        {kicker ? <span className="inv-hero__kicker">{kicker}</span> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {art ? <div className="inv-hero__art">{art}</div> : null}
      {(promises?.length || pill || children) ? (
        <div className="inv-hero__side">
          {pill ? (
            <div className="inv-hero__pill">
              <Mark name={icon} tone={tone} size={38} glyph={19} />
              <span>{pill}</span>
            </div>
          ) : null}
          {promises?.length ? (
            <ul className="inv-hero__list">
              {promises.map((p) => (
                <li key={p}><Icon name="checkCircle" size={16} aria-hidden />{p}</li>
              ))}
            </ul>
          ) : null}
          {children ? <div className="inv-hero__acts">{children}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

/** The plain heading row, where a screen has no banner (Stock). */
export const PageHead = ({ icon = 'box', tone = 'indigo', title, subtitle, plain, children }) => (
  <div className={`inv-head${plain ? ' inv-head--plain' : ''}`}>
    <div className="inv-head__text">
      {plain ? null : <Mark name={icon} tone={tone} size={54} glyph={25} />}
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
    {children ? <div className="inv-head__acts">{children}</div> : null}
  </div>
);

export const TopBar = ({ children }) => <div className="inv-topbar">{children}</div>;

/** The academic-year chip at the right of the breadcrumb row. */
export const YearChip = ({ label = 'Academic Year', value, options = [], onChange }) => (
  <div className="inv-yearchip">
    <span className="inv-yearchip__ico"><Icon name="calendarDays" size={18} aria-hidden /></span>
    <span className="inv-yearchip__lab">
      <small>{label}</small>
      {options.length > 1 && onChange ? (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {options.map(o => <option key={o._id || o.value} value={o._id || o.value}>{o.name || o.label}</option>)}
        </select>
      ) : (
        <span>{options.find(o => (o._id || o.value) === value)?.name || options[0]?.name || '—'}</span>
      )}
    </span>
  </div>
);

/* ── Buttons ─────────────────────────────────────────────────────────────── */

export const Btn = ({ kind = 'ghost', size, icon, iconRight, block, children, as: As = 'button', ...rest }) => (
  <As
    className={`inv-btn inv-btn--${kind}${size ? ` inv-btn--${size}` : ''}${block ? ' inv-btn--block' : ''}`}
    {...(As === 'button' ? { type: rest.type || 'button' } : null)}
    {...rest}
  >
    {icon ? <Ico name={icon} size={size === 'xs' ? 13 : 16} aria-hidden /> : null}
    {children}
    {iconRight ? <Ico name={iconRight} size={size === 'xs' ? 13 : 16} aria-hidden /> : null}
  </As>
);

export const IconBtn = React.forwardRef(
  ({ icon, kind = '', label, size = 16, as: As = 'button', ...rest }, ref) => (
    <As
      ref={ref}
      className={`inv-ibtn${kind ? ` inv-ibtn--${kind}` : ''}`}
      {...(As === 'button' ? { type: 'button' } : null)}
      title={label} aria-label={label}
      {...rest}
    >
      <Ico name={icon} size={size} aria-hidden />
    </As>
  ),
);
IconBtn.displayName = 'IconBtn';

export const LinkBtn = ({ to, children, ...rest }) => <Btn as={Link} to={to} {...rest}>{children}</Btn>;

/** "View All →" */
export const ViewAll = ({ to, onClick, children = 'View All' }) => (
  to
    ? <Link className="inv-viewall" to={to}>{children}<Icon name="arrowRight" size={14} aria-hidden /></Link>
    : <button type="button" className="inv-viewall" onClick={onClick}>{children}<Icon name="arrowRight" size={14} aria-hidden /></button>
);

/* ── Menus ───────────────────────────────────────────────────────────────── */
/*
   Anchored to the button, drawn in a PORTAL at fixed coordinates. A menu
   rendered inside the cell it belongs to is clipped by the table's own
   horizontal scroll container — which is how a kebab menu ends up half
   visible, or invisible, on the last column of a wide table.
*/
function useAnchored(open, onClose) {
  const anchor = useRef(null);
  const menu = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) { setPos(null); return undefined; }

    /*
       Placed TWICE, and it has to be.

       The first pass runs before the menu is in the DOM, so there is nothing
       to measure and the height is a guess. When the menu opens upward —
       which it does on any row near the bottom of the window — that guess is
       what the top is computed from, and a three-item menu guessed at 220px
       floated about ninety pixels clear of the button it belongs to.

       So: place with the guess, render hidden, measure the real box on the
       next frame, place again, and only then show it.
    */
    let frame = 0;
    const place = (ready) => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const h = menu.current?.offsetHeight || 220;
      const w = menu.current?.offsetWidth || 208;
      const gap = 6;
      const room = window.innerHeight - a.bottom;
      // Below unless there is no room for it there and there IS room above.
      const up = room < h + gap + 8 && a.top > h + gap + 8;
      const top = Math.max(8, Math.min(
        up ? a.top - h - gap : a.bottom + gap,
        window.innerHeight - h - 8,
      ));
      const left = Math.min(Math.max(8, a.right - w), window.innerWidth - w - 8);
      setPos({ top, left, ready: !!ready });
    };

    place(false);
    frame = requestAnimationFrame(() => place(true));

    // Re-place rather than re-render on scroll: the anchor may be inside a
    // table that scrolls under the menu.
    const onMove = () => place(true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (menu.current?.contains(e.target) || anchor.current?.contains(e.target)) return;
      onClose();
    };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);

  return { anchor, menu, pos };
}

/**
 * items: [{ label, icon, onClick, danger, disabled, head, sep, to }]
 * `head` renders a small caption, `sep` a divider.
 */
export function Menu({ items = [], open, onClose, anchorRef, menuRef, pos }) {
  if (!open || !pos) return null;
  return createPortal(
    <div
      ref={menuRef}
      className="inv-menu"
      style={{
        position: 'fixed', top: pos.top, left: pos.left,
        visibility: pos.ready ? 'visible' : 'hidden',
      }}
      role="menu"
    >
      {items.filter(Boolean).map((it, i) => {
        if (it.sep) return <div key={`s${i}`} className="inv-menu__sep" />;
        if (it.head) return <div key={`h${i}`} className="inv-menu__head">{it.head}</div>;
        const body = (
          <>
            {it.icon ? <Ico name={it.icon} size={15} aria-hidden /> : null}
            {it.label}
          </>
        );
        if (it.to) {
          return (
            <Link key={it.label} to={it.to} role="menuitem" className="inv-menu__item" onClick={onClose}>
              {body}
            </Link>
          );
        }
        return (
          <button
            key={it.label} type="button" role="menuitem" disabled={it.disabled}
            className={`inv-menu__item${it.danger ? ' inv-menu__item--danger' : ''}`}
            onClick={() => { onClose(); it.onClick?.(); }}
          >
            {body}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** The kebab in an Actions cell, with its menu. */
export function KebabMenu({ items = [], label = 'More actions', icon = 'dotsV', kind = '' }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { anchor, menu, pos } = useAnchored(open, close);
  if (!items.filter(x => x && !x.sep && !x.head).length) return null;
  return (
    <>
      <IconBtn
        ref={anchor} icon={icon} kind={kind} label={label}
        aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      />
      <Menu items={items} open={open} onClose={close} menuRef={menu} pos={pos} />
    </>
  );
}

/** A button that opens a menu. Unlike KebabMenu it carries its own label. */
export function MenuBtn({ label, icon, kind = 'ghost', size, items = [], disabled }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { anchor, menu, pos } = useAnchored(open, close);
  return (
    <>
      <button
        ref={anchor} type="button" disabled={disabled}
        className={`inv-btn inv-btn--${kind}${size ? ` inv-btn--${size}` : ''}`}
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {icon ? <Ico name={icon} size={16} aria-hidden /> : null}
        {label}
        <Icon name="chevronDown" size={15} aria-hidden />
      </button>
      <Menu items={items} open={open} onClose={close} menuRef={menu} pos={pos} />
    </>
  );
}

/** A primary button whose chevron opens more ways to do the same job. */
export function SplitBtn({ label, icon = 'plus', onClick, items = [], kind = 'primary', disabled }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { anchor, menu, pos } = useAnchored(open, close);
  if (!items.length) return <Btn kind={kind} icon={icon} onClick={onClick} disabled={disabled}>{label}</Btn>;
  return (
    <span className="inv-split">
      <Btn kind={kind} icon={icon} onClick={onClick} disabled={disabled}>{label}</Btn>
      <button
        ref={anchor} type="button" disabled={disabled}
        className={`inv-btn inv-btn--${kind} inv-split__toggle`}
        aria-haspopup="menu" aria-expanded={open} aria-label={`More ${label} options`}
        onClick={() => setOpen(o => !o)}
      >
        <Icon name="chevronDown" size={15} aria-hidden />
      </button>
      <Menu items={items} open={open} onClose={close} menuRef={menu} pos={pos} />
    </span>
  );
}

/* ── Cards ───────────────────────────────────────────────────────────────── */

export const Card = ({ children, className = '', ...rest }) => (
  <section className={`inv-card ${className}`} {...rest}>{children}</section>
);
export const CardHead = ({ title, sub, icon, iconTone = 'indigo', right, plain, children }) => (
  <header className={`inv-card__head${plain ? ' inv-card__head--plain' : ''}`}>
    <div className="inv-card__title">
      {icon ? <Mark name={icon} tone={iconTone} size={32} glyph={17} /> : null}
      <div style={{ minWidth: 0 }}>
        <h3>{title}</h3>
        {sub ? <p>{sub}</p> : null}
      </div>
    </div>
    {right ? <div className="inv-card__right">{right}</div> : null}
    {children}
  </header>
);
export const CardBody = ({ flush, tight, children, style, className = '' }) => (
  <div className={`inv-card__body${flush ? ' inv-card__body--flush' : ''}${tight ? ' inv-card__body--tight' : ''} ${className}`} style={style}>
    {children}
  </div>
);
export const CardFoot = ({ children }) => <footer className="inv-card__foot">{children}</footer>;

/** The three-across chart strip. `cols` sets how many at full width. */
export const Strip = ({ cols = 3, variant, children }) => (
  <div className={`inv-strip${variant ? ` inv-strip--${variant}` : ''}`} style={{ '--inv-strip': cols }}>
    {children}
  </div>
);

/* ── Tiles ───────────────────────────────────────────────────────────────── */

export const Tiles = ({ cols = 4, children }) => (
  <div className="inv-tiles" style={{ '--inv-cols': cols }}>{children}</div>
);

/**
 * One figure tile.
 *
 *   value/label   — the figure and what it counts
 *   delta         — a month-on-month percentage; null renders nothing, which is
 *                   the honest answer when there is no previous month to
 *                   compare against
 *   note / foot   — the free text under the figure ("within 30 days")
 *   spark         — a series for the mini chart at the top right
 *   bar           — {value, max, color} for a tile that shows a proportion
 */
export function Tile({
  icon, tone = 'indigo', value, label, delta, deltaNote, deltaGoodDown,
  note, foot, spark, sparkKind = 'line', sparkTone, to, onClick, small, soft, children,
}) {
  const As = to ? Link : (onClick ? 'button' : 'div');
  const extra = to ? { to } : (onClick ? { type: 'button', onClick } : null);
  const hasSpark = spark?.length > 1 && spark.some(v => num(v) !== num(spark[0]));
  return (
    <As
      // `soft` tints the whole card in the tone, for a set of tiles where the
      // state each one reports IS the tile — four counts of the same thing in
      // four different conditions read faster in colour than in words.
      className={`inv-tile${to || onClick ? ' inv-tile--link' : ''}${hasSpark ? ' inv-tile--spark' : ''}${soft ? ` inv-tile--soft inv-tile--soft-${tone}` : ''}`}
      {...extra}
    >
      <div className="inv-tile__top">
        {icon ? <Mark name={icon} tone={tone} size={44} glyph={21} /> : null}
        <div className="inv-tile__body">
          <div className={`inv-tile__value${small ? ' inv-tile__value--sm' : ''}`}>{value}</div>
          <div className="inv-tile__label">{label}</div>
        </div>
      </div>
      {hasSpark ? (
        <span className="inv-tile__spark">
          <Spark data={spark} kind={sparkKind} tone={sparkTone || tone} />
        </span>
      ) : null}
      {(delta != null || note || foot) ? (
        <div className="inv-tile__foot inv-tile__foot--push">
          {delta != null ? <Delta value={delta} goodDown={deltaGoodDown} /> : null}
          {deltaNote ? <span className="inv-tile__note">{deltaNote}</span> : null}
          {note ? <span className="inv-tile__note">{note}</span> : null}
          {foot}
        </div>
      ) : null}
      {children}
    </As>
  );
}

/** "↑ +12%". `goodDown` flips the colour for a figure that should be falling. */
export function Delta({ value, suffix = '%', goodDown = false }) {
  const v = num(value);
  const up = v > 0;
  const flat = v === 0;
  const good = flat ? null : (goodDown ? !up : up);
  const cls = flat ? 'flat' : (good ? 'up' : 'down');
  return (
    <span className={`inv-delta inv-delta--${cls}`}>
      {flat ? null : <Icon name={up ? 'arrowUp' : 'arrowDown'} size={11} aria-hidden />}
      {up ? '+' : ''}{v}{suffix}
    </span>
  );
}
/** A plain "+2" chip, for a count that rose rather than a percentage. */
export const Added = ({ value, tone }) => {
  const v = num(value);
  if (!v) return null;
  return <span className={`inv-delta inv-delta--${tone || (v > 0 ? 'up' : 'down')}`}>{v > 0 ? '+' : ''}{count(v)}</span>;
};

/* ── Badges, chips, people ───────────────────────────────────────────────── */

export const Badge = ({ tone = 'slate', square, lg, icon, dot, children }) => (
  <span className={`inv-badge inv-b-${tone}${square ? ' inv-badge--square' : ''}${lg ? ' inv-badge--lg' : ''}`}>
    {dot ? <i className={`inv-dot inv-dot--${tone}`} /> : null}
    {icon ? <Ico name={icon} size={12} aria-hidden /> : null}
    {children}
  </span>
);
/** A badge that knows the module's vocabulary: tone, word and icon in one. */
export const StatusBadge = ({ value, label, tone, icon, square, lg, noIcon }) => (
  <Badge tone={tone || statusTone(value)} square={square} lg={lg} icon={noIcon ? null : (icon ?? statusIcon(value))}>
    {label ?? statusWord(value)}
  </Badge>
);
export const Chip = ({ tone, color, children, style }) => (
  <span className={`inv-chip${tone ? ` inv-b-${tone}` : ''}`} style={style}>
    {color ? <i className="inv-dot" style={{ background: color }} /> : null}
    {children}
  </span>
);

export const Avatar = ({ name, src, size = 'md', id, square }) => {
  const url = src ? fileUrl(src) : '';
  const cls = `inv-av${size !== 'md' ? ` inv-av--${size}` : ''}${square ? ' inv-av--square' : ''}`;
  return (
    <span className={cls} style={url ? undefined : { background: avatarTone(id || name) }} aria-hidden>
      {url ? <img src={url} alt="" loading="lazy" /> : initials(name)}
    </span>
  );
};
export const Who = ({ name, sub, src, id, size, right }) => (
  <span className="inv-who">
    <Avatar name={name} src={src} id={id} size={size} />
    <span className="inv-who__text">
      <span className="inv-who__name inv-trunc">{name}</span>
      {sub ? <span className="inv-who__sub inv-trunc">{sub}</span> : null}
    </span>
    {right}
  </span>
);

/** An item's picture, or its category's mark where there is no picture. */
export const Thumb = ({ src, alt = '', icon = 'box', tone = 'indigo', lg, xl }) => {
  const url = src ? fileUrl(src) : '';
  const cls = `inv-thumb${lg ? ' inv-thumb--lg' : ''}${xl ? ' inv-thumb--xl' : ''}`;
  if (url) return <span className={cls}><img src={url} alt={alt} loading="lazy" /></span>;
  return (
    <span className={`${cls} inv-t-${tone}`} aria-hidden>
      <Glyph name={icon} size={xl ? 30 : lg ? 25 : 18} />
    </span>
  );
};
/** The overlapping thumbs in a purchase order's Items cell. */
export const ThumbStack = ({ items = [], max = 3 }) => {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  if (!items.length) return <span className="inv-dim">—</span>;
  return (
    <span className="inv-stack">
      {shown.map((it, i) => (
        <span key={i} className={`inv-thumb inv-t-${it.tone || 'slate'}`} title={it.name}>
          {it.image ? <img src={fileUrl(it.image)} alt="" loading="lazy" /> : <Glyph name={it.icon || 'box'} size={15} />}
        </span>
      ))}
      {rest > 0 ? <span className="inv-stack__more">+{rest}</span> : null}
    </span>
  );
};

export const Cell2 = ({ top, sub, children }) => (
  <span className="inv-cell2">
    <span className="inv-cell2__top inv-trunc">{top}</span>
    {sub ? <span className="inv-cell2__sub inv-trunc">{sub}</span> : null}
    {children}
  </span>
);
/** A thumb (or mark) beside a two-line cell — the Item column, everywhere. */
export const ItemCell = ({ image, icon = 'box', tone = 'indigo', name, sub, lg }) => (
  <span className="inv-cellrow">
    <Thumb src={image} icon={icon} tone={tone} lg={lg} />
    <Cell2 top={name} sub={sub} />
  </span>
);

export const Bar = ({ value, max = 100, color, lg }) => (
  <span className={`inv-bar${lg ? ' inv-bar--lg' : ''}`}>
    <i style={{ width: `${Math.max(0, Math.min(100, (num(value) / (num(max) || 1)) * 100))}%`, background: color || 'var(--inv-primary)' }} />
  </span>
);
/** A bar with its percentage beside it — Usage, Current Usage, Utilisation. */
export const BarRow = ({ value, max = 100, color, showPct = true, suffix = '%', lg }) => {
  const p = Math.round((num(value) / (num(max) || 1)) * 100);
  const tone = color || (p >= 100 ? '#ef4444' : p >= 85 ? '#f59e0b' : p >= 60 ? '#22c55e' : '#3b82f6');
  return (
    <span className="inv-barrow">
      <Bar value={Math.min(num(value), num(max))} max={max} color={tone} lg={lg} />
      {showPct ? <span className="inv-barrow__pct">{p}{suffix}</span> : null}
    </span>
  );
};

/* ── Sparkline ───────────────────────────────────────────────────────────── */
/*
   The mini chart at the top right of a tile. It lives here rather than in
   invCharts.jsx because Tile draws it and invCharts imports from this file —
   the other direction would be a cycle.

   viewBox is 100×36 with preserveAspectRatio left at its default, so the shape
   scales evenly. Setting it to "none", as an earlier module did, makes one
   horizontal unit a percentage of the width and quietly distorts every mark.
*/
const SPARK_TONE = {
  indigo: '#6366f1', violet: '#8b5cf6', blue: '#3b82f6', sky: '#0ea5e9',
  green: '#22c55e', emerald: '#10b981', amber: '#f59e0b', orange: '#f97316',
  red: '#ef4444', rose: '#f43f5e', pink: '#ec4899', teal: '#14b8a6',
  slate: '#94a3b8', brown: '#b45309',
};
export function Spark({ data = [], kind = 'line', tone = 'indigo', height = 34, width = 62 }) {
  const vals = (Array.isArray(data) ? data : []).map(num);
  const gid = useId().replace(/:/g, '');
  // Nothing to show is better than a row of 2px stubs: a series that never
  // moves (or is all zeros) is not a trend, it is an empty chart pretending.
  if (vals.length < 2 || vals.every(v => v === vals[0])) return null;
  const color = SPARK_TONE[tone] || SPARK_TONE.indigo;
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  // Real pixel coordinates, not a 0–100 viewBox: the default
  // preserveAspectRatio would letterbox a 100×36 box into a 62×34 one and draw
  // the line a third of the width, centred. See the note in invCharts.jsx.
  const W = width; const H = height; const pad = 3;
  const x = (i) => (i / (vals.length - 1)) * W;
  const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);

  if (kind === 'bar') {
    const bw = Math.max(2, (W / vals.length) * 0.62);
    const gap = vals.length > 1 ? (W - bw * vals.length) / (vals.length - 1) : 0;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden focusable="false">
        {vals.map((v, i) => {
          const h = Math.max(2, ((v - min) / span) * (H - pad * 2));
          return (
            <rect key={i} x={i * (bw + gap)} y={H - pad - h} width={bw} height={h} rx="1.6"
              fill={color} opacity={0.38 + 0.62 * (i / (vals.length - 1))} />
          );
        })}
      </svg>
    );
  }
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="2.2" fill={color} />
    </svg>
  );
}

/* ── Filters and form controls ───────────────────────────────────────────── */

export const Filters = ({ plain, inner, children }) => (
  <div className={`inv-filters${plain ? ' inv-filters--plain' : ''}${inner ? ' inv-filters--inner' : ''}`}>{children}</div>
);
export const FilterEnd = ({ children }) => <div className="inv-filters__end">{children}</div>;

export const Field = ({ label, hint, info, error, required, grow, pick, span2, span3, className = '', children, htmlFor }) => (
  <div className={`inv-field${grow ? ' inv-field--grow' : ''}${pick ? ' inv-field--pick' : ''}${span2 ? ' inv-span2' : ''}${span3 ? ' inv-span3' : ''} ${className}`}>
    {label ? (
      <label className="inv-field__label" htmlFor={htmlFor}>
        {label}{required ? <span className="inv-req"> *</span> : null}
        {/* `info` is a note the field does not need room for — it sits on the
            label as a hoverable mark rather than a line under the control. */}
        {info ? <span className="inv-field__info" title={info} aria-label={info}><Ico name="info" size={13} /></span> : null}
      </label>
    ) : null}
    {children}
    {error ? <span className="inv-field__err">{error}</span> : hint ? <span className="inv-field__hint">{hint}</span> : null}
  </div>
);

export const Input = React.forwardRef((props, ref) => <input ref={ref} className="inv-input" {...props} />);
Input.displayName = 'Input';
export const Textarea = (props) => <textarea className="inv-textarea" {...props} />;

/**
 * A <select>. `options` may be strings, {value,label} or {_id,name} — the three
 * shapes the boards return — so a screen never has to remap a filter list.
 */
export function Select({ value, onChange, options = [], placeholder, ...rest }) {
  const norm = options.map(o => (
    typeof o === 'string' || typeof o === 'number'
      ? { value: String(o), label: String(o) }
      : { value: String(o.value ?? o._id ?? ''), label: o.label ?? o.name ?? String(o.value ?? o._id ?? '') }
  ));
  return (
    <select
      className="inv-select"
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      {...rest}
    >
      {placeholder != null ? <option value="">{placeholder}</option> : null}
      {norm.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Search({ value, onChange, placeholder = 'Search…', onEnter, ...rest }) {
  return (
    <div className="inv-search">
      <span className="inv-search__ico"><Icon name="search" size={16} aria-hidden /></span>
      <input
        className="inv-input" type="search" value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(value); }}
        {...rest}
      />
    </div>
  );
}

/**
 * The date-range control the mockups draw as one chip. Two native date inputs
 * behind it, plus the shortcuts a school actually uses.
 */
export function DateRange({ from, to, onChange, label = 'Date Range', placeholder = 'All dates' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const shift = (days) => {
    const t = new Date();
    const f = new Date(); f.setDate(f.getDate() - days);
    onChange?.({ from: isoDay(f), to: isoDay(t) });
    setOpen(false);
  };
  const thisMonth = () => {
    const t = new Date();
    onChange?.({ from: isoDay(new Date(t.getFullYear(), t.getMonth(), 1)), to: isoDay(t) });
    setOpen(false);
  };
  const shown = from || to
    ? `${from ? fmtDate(from) : 'Any'} – ${to ? fmtDate(to) : 'Today'}`
    : placeholder;

  return (
    <div className="inv-range" ref={box}>
      <button type="button" className="inv-range__btn" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={label}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <Icon name="calendar" size={16} aria-hidden />
          <span className="inv-trunc">{shown}</span>
        </span>
        <Icon name="chevronDown" size={15} aria-hidden />
      </button>
      {open ? (
        <div className="inv-range__pop">
          <div className="inv-range__grid">
            <Field label="From">
              <input className="inv-input" type="date" value={from || ''} max={to || undefined}
                onChange={(e) => onChange?.({ from: e.target.value, to })} />
            </Field>
            <Field label="To">
              <input className="inv-input" type="date" value={to || ''} min={from || undefined}
                onChange={(e) => onChange?.({ from, to: e.target.value })} />
            </Field>
          </div>
          <div className="inv-range__quick">
            <button type="button" onClick={() => shift(6)}>Last 7 days</button>
            <button type="button" onClick={() => shift(29)}>Last 30 days</button>
            <button type="button" onClick={thisMonth}>This month</button>
            <button type="button" onClick={() => { onChange?.({ from: '', to: '' }); setOpen(false); }}>Clear</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Check({ checked, onChange, label, indeterminate, disabled, ...rest }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <label className="inv-check">
      <input
        ref={ref} type="checkbox" checked={!!checked} disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        {...rest}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
export const Toggle = ({ checked, onChange, disabled, label }) => (
  <label className="inv-switch">
    <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
    <span className="inv-switch__track" />
    {label ? <span style={{ fontSize: '.85rem' }}>{label}</span> : null}
  </label>
);
export const Seg = ({ value, onChange, items = [] }) => (
  <div className="inv-seg" role="group">
    {items.map(it => (
      <button key={it.value} type="button" className={String(value) === String(it.value) ? 'is-on' : ''}
        onClick={() => onChange?.(it.value)}>
        {it.label}
      </button>
    ))}
  </div>
);

/** The underlined strip above a table: All Requests (8) | Pending (3) | … */
export const TabStrip = ({ value, onChange, items = [], label = 'Views', pill }) => (
  <div className={`inv-tabs${pill ? ' inv-tabs--pill' : ''}`} role="tablist" aria-label={label}>
    {items.map(it => (
      <button
        key={it.value} type="button" role="tab" aria-selected={String(value) === String(it.value)}
        className={String(value) === String(it.value) ? 'is-on' : ''}
        onClick={() => onChange?.(it.value)}
      >
        {it.icon ? <Ico name={it.icon} size={15} aria-hidden /> : null}
        {it.label}{it.count != null ? ` (${count(it.count)})` : ''}
      </button>
    ))}
  </div>
);
/** The rail's own tabs. */
export const RailTabs = ({ value, onChange, items = [] }) => (
  <div className="inv-rtabs" role="tablist">
    {items.map(it => (
      <button key={it.value} type="button" role="tab" aria-selected={String(value) === String(it.value)}
        className={String(value) === String(it.value) ? 'is-on' : ''}
        onClick={() => onChange?.(it.value)}>
        {it.label}{it.count != null ? ` (${count(it.count)})` : ''}
      </button>
    ))}
  </div>
);

/* ── The table ───────────────────────────────────────────────────────────── */

/** The two little triangles beside a sortable header; the live one is solid. */
const SortGlyph = ({ dir }) => (
  <span className="inv-sort__ico" aria-hidden>
    <svg width="9" height="12" viewBox="0 0 9 12" fill="none">
      <path d="M4.5 1 8 5H1z" fill="currentColor" opacity={dir === 'asc' ? 1 : dir ? 0.25 : 0.42} />
      <path d="M4.5 11 1 7h7z" fill="currentColor" opacity={dir === 'desc' ? 1 : dir ? 0.25 : 0.42} />
    </svg>
  </span>
);

/**
 * One declarative table for all twelve screens.
 *
 * columns: [{
 *   key,                 unique, and the sort key sent to the server
 *   label,               the header, and the label the card layout prints
 *   cell: (row) => node, defaults to row[key]
 *   sortable,            draws the sort control
 *   align: 'num'|'mid',  right- or centre-aligned
 *   primary,             the headline cell: spans the card on a narrow page
 *   width,               a fixed column width in px
 *   hideStack,           drop this cell from the card layout (a duplicate)
 *   secondary,           the first column to stand down when the table is
 *                        short of room: dropped outright while the detail rail
 *                        is open (the rail is showing that value anyway), and
 *                        hidden by a container query on a narrow page. It comes
 *                        back in the card layout, where there is room again.
 *   nowrap,
 * }]
 *
 * The card layout on a narrow page comes from `data-label` on every cell plus
 * the rules in inventory.css — which is why screens must not hand-roll a table.
 */
export function DataTable({
  columns = [],
  rows = [],
  rowKey = (r) => r._id,
  onRowClick,
  pickedId,
  marked,                  // Set | array of selected ids
  onMark,                  // (id, on) => void
  onMarkAll,               // (on) => void
  actions,                 // (row) => node, rendered in a pinned Actions column
  actionsLabel = 'Actions',
  empty,
  loading,
  sort, dir, onSort,
  className = '',
  stack = true,            // let rows become cards on a narrow page
  narrow = false,          // the rail is open beside this table
}) {
  const markSet = useMemo(
    () => (marked instanceof Set ? marked : new Set((marked || []).map(String))),
    [marked],
  );
  // With the rail open the table loses a third of its width. Rather than
  // letting six columns slide under the pinned Actions cell, the ones the rail
  // is already showing step aside.
  const cols = useMemo(
    () => (narrow ? columns.filter(c => !c.secondary) : columns),
    [columns, narrow],
  );
  const ids = rows.map(r => String(rowKey(r)));
  const allOn = ids.length > 0 && ids.every(i => markSet.has(i));
  const someOn = !allOn && ids.some(i => markSet.has(i));

  if (loading) return <SkeletonRows rows={6} />;
  if (!rows.length) return empty ?? <Empty />;

  const head = (c) => {
    if (!c.sortable || !onSort) return c.label;
    const on = sort === c.key;
    return (
      <button type="button" className={`inv-sort${on ? ' is-on' : ''}`} onClick={() => onSort(c.key)}
        aria-label={`Sort by ${c.label}`}>
        {c.label}
        <SortGlyph dir={on ? dir : null} />
      </button>
    );
  };

  return (
    <div className="inv-tablewrap">
      <table className={`inv-table${stack ? ' inv-table--stack' : ''} ${className}`}>
        <thead>
          <tr>
            {onMark ? (
              <th className="inv-table__sel" scope="col">
                <Check checked={allOn} indeterminate={someOn} onChange={(on) => onMarkAll?.(on)}
                  aria-label={allOn ? 'Clear selection' : 'Select every row on this page'} />
              </th>
            ) : null}
            {cols.map(c => (
              <th
                key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}
                className={[
                  c.align === 'num' ? 'inv-th--num' : c.align === 'mid' ? 'inv-th--mid' : '',
                  c.secondary ? 'inv-col--secondary' : '',
                ].filter(Boolean).join(' ')}
              >
                {head(c)}
              </th>
            ))}
            {actions ? <th className="inv-table__acts" scope="col">{actionsLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = String(rowKey(r));
            const cls = [
              pickedId != null && String(pickedId) === k ? 'is-picked' : '',
              markSet.has(k) ? 'is-marked' : '',
            ].filter(Boolean).join(' ');
            return (
              <tr
                key={k} className={cls}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {onMark ? (
                  <td className="inv-table__sel" data-label="Select">
                    <Check checked={markSet.has(k)} onChange={(on) => onMark(k, on)}
                      aria-label={`Select row ${k}`} />
                  </td>
                ) : null}
                {cols.map(c => (
                  <td
                    key={c.key} data-label={c.label}
                    className={[
                      c.align === 'num' ? 'inv-td--num' : c.align === 'mid' ? 'inv-td--mid' : '',
                      c.primary ? 'inv-td--primary' : '',
                      c.nowrap ? 'inv-td--tight' : '',
                      c.hideStack ? 'inv-td--hide-stack' : '',
                      c.secondary ? 'inv-col--secondary' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {c.cell ? c.cell(r) : (r[c.key] ?? <span className="inv-dim">—</span>)}
                  </td>
                ))}
                {actions ? (
                  <td className="inv-table__acts" data-label={actionsLabel}
                    onClick={(e) => e.stopPropagation()}>
                    <span className="inv-actrow">{actions(r)}</span>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The strip above a table: how many are selected, and what can be done. */
export const TableBar = ({ count: n, total, noun = 'items', children }) => (
  <div className="inv-tablebar">
    <span className="inv-tablebar__count">
      {n != null ? <>{count(n)} of {count(total)} {noun} selected</> : <>{count(total)} {noun}</>}
    </span>
    <div className="inv-tablebar__end">{children}</div>
  </div>
);

/* ── Pager ───────────────────────────────────────────────────────────────── */

/** 1 2 3 4 5 … 20, with the current page always inside the window. */
function pageWindow(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '…', pages];
  if (page >= pages - 3) return [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, '…', page - 1, page, page + 1, '…', pages];
}

export function Pager({
  page = 1, pages = 1, total = 0, limit = 10, onPage, onLimit,
  noun = 'records', limits = [8, 10, 25, 50, 100],
}) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const opts = [...new Set([...limits, limit])].sort((a, b) => a - b);
  return (
    <div className="inv-pager">
      <span className="inv-pager__count">Showing {count(from)}–{count(to)} of {count(total)} {noun}</span>
      <div className="inv-pager__end">
        {pages > 1 ? (
          <nav className="inv-pages" aria-label="Pagination">
            <button type="button" disabled={page <= 1} onClick={() => onPage?.(page - 1)} aria-label="Previous page">
              <Icon name="chevronLeft" size={15} aria-hidden />
            </button>
            {pageWindow(page, pages).map((p, i) => (
              p === '…'
                ? <span key={`g${i}`} className="inv-pages__gap">…</span>
                : (
                  <button key={p} type="button" className={p === page ? 'is-on' : ''}
                    aria-current={p === page ? 'page' : undefined} onClick={() => onPage?.(p)}>
                    {p}
                  </button>
                )
            ))}
            <button type="button" disabled={page >= pages} onClick={() => onPage?.(page + 1)} aria-label="Next page">
              <Icon name="chevronRight" size={15} aria-hidden />
            </button>
          </nav>
        ) : null}
        {onLimit ? (
          <select className="inv-select" value={limit} onChange={(e) => onLimit(Number(e.target.value))} aria-label="Rows per page">
            {opts.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        ) : null}
      </div>
    </div>
  );
}

/* ── Rail ────────────────────────────────────────────────────────────────── */

/**
 * The list, with the detail drawer over it.
 *
 * It used to be a column BESIDE the table, which meant the table lost a third
 * of its width whenever a row was picked and the whole thing changed shape at
 * three different page widths. It is now the app's own slide-over
 * (components/ui/Drawer.jsx, `.ldrawer` in global.css) — the same one Students,
 * Teachers, Admins and Academic Years use — so the table is always full width
 * and a detail panel looks the same wherever you meet one.
 */
export const SplitView = ({ rail, children }) => (
  <div className="inv-split-view">
    <div style={{ minWidth: 0 }}>{children}</div>
    {rail}
  </div>
);

/**
 * The detail drawer for a picked row.
 *
 * Props are unchanged from the column it replaced, so the screens did not have
 * to be rewritten: a mark, a name, a line under it, a status badge, optional
 * tabs, a body and a footer of actions.
 */
export function Rail({
  icon, iconTone = 'indigo', image, title, sub, badge, onClose,
  tabs, tab, onTab, actions, foot, children,
}) {
  return (
    <Drawer open onClose={onClose} label={typeof title === 'string' ? title : 'Details'}>
      <div className="ldrawer__head">
        {image !== undefined || icon ? (
          image ? <Thumb src={image} icon={icon} tone={iconTone} xl />
            : <Mark name={icon} tone={iconTone} size={52} glyph={25} />
        ) : null}
        <div className="ldrawer__id">
          <h3>{title}</h3>
          {sub ? <p>{sub}</p> : null}
          {badge ? <div className="ldrawer__tags">{badge}</div> : null}
        </div>
        <div className="inv-rail__acts">
          {actions}
          <button type="button" className="lact" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      {tabs?.length ? (
        <div className="inv-rail__tabs">
          <RailTabs value={tab} onChange={onTab} items={tabs} />
        </div>
      ) : null}

      <div className="ldrawer__body">{children}</div>
      {foot ? <DrawerFoot>{foot}</DrawerFoot> : null}
    </Drawer>
  );
}

/* ── Blocks and small lists ──────────────────────────────────────────────── */

export const Block = ({ title, right, children }) => (
  <section className="inv-block">
    {(title || right) ? (
      <div className="inv-block__head">
        {title ? <h4>{title}</h4> : null}
        {right}
      </div>
    ) : null}
    {children}
  </section>
);

export const Facts = ({ one, children }) => (
  <div className={`inv-facts${one ? ' inv-facts--1' : ''}`}>{children}</div>
);
export const Fact = ({ k, v }) => (
  <>
    <span className="inv-fact__k">{k}</span>
    <span className="inv-fact__v">{v ?? <span className="inv-dim">—</span>}</span>
  </>
);
export const Lines = ({ children }) => <div className="inv-lines">{children}</div>;
export const Line = ({ icon, children }) => (
  <div className="inv-line">
    {icon ? <Icon name={icon} size={15} aria-hidden /> : null}
    <span style={{ minWidth: 0 }}>{children}</span>
  </div>
);

export const Minis = ({ children }) => <div className="inv-minis">{children}</div>;
export const Mini = ({ icon, tone = 'indigo', value, label }) => (
  <div className="inv-mini">
    <Mark name={icon} tone={tone} size={32} glyph={16} />
    <span className="inv-mini__text">
      <span className="inv-mini__v inv-trunc">{value}</span>
      <span className="inv-mini__k inv-trunc">{label}</span>
    </span>
  </div>
);

export const Rows = ({ children }) => <div className="inv-rows">{children}</div>;
export const Row = ({ icon, iconTone = 'indigo', image, avatar, title, sub, end, endSub, onClick, to, children }) => {
  const As = to ? Link : (onClick ? 'button' : 'div');
  const extra = to ? { to } : (onClick ? { type: 'button', onClick } : null);
  return (
    <As className={`inv-row${to || onClick ? ' inv-row--link' : ''}`} {...extra}>
      {avatar ?? (image !== undefined || icon ? <Thumb src={image} icon={icon} tone={iconTone} /> : null)}
      <span className="inv-row__text">
        <span className="inv-row__title inv-trunc">{title}</span>
        {sub ? <span className="inv-row__sub inv-trunc">{sub}</span> : null}
      </span>
      {(end != null || endSub) ? (
        <span className="inv-row__end">
          {end != null ? <strong>{end}</strong> : null}
          {endSub}
        </span>
      ) : null}
      {children}
    </As>
  );
};

/** A row whose middle is a bar — Top Consumed Items. */
export const Meter = ({ icon = 'box', iconTone = 'indigo', image, name, value, max, color }) => (
  <div className="inv-meter">
    <Thumb src={image} icon={icon} tone={iconTone} />
    <span className="inv-meter__name inv-trunc">{name}</span>
    <Bar value={value} max={max} color={color} />
    <span className="inv-meter__value">{count(value)}</span>
  </div>
);

/* ── Notes, empties, loaders ─────────────────────────────────────────────── */

export const Note = ({ tone = 'info', icon, title, children }) => (
  <div className={`inv-note inv-note--${tone}`}>
    <Icon name={icon || (tone === 'danger' ? 'closeCircle' : tone === 'warn' ? 'alert' : tone === 'ok' ? 'checkCircle' : 'info')} size={17} aria-hidden />
    <span style={{ minWidth: 0 }}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </span>
  </div>
);

export const Empty = ({ icon = 'box', title = 'Nothing here yet', children, sm, action }) => (
  <div className={`inv-empty${sm ? ' inv-empty--sm' : ''}`}>
    <Mark name={icon} tone="slate" size={sm ? 44 : 56} glyph={sm ? 21 : 27} />
    <h4>{title}</h4>
    {children ? <p>{children}</p> : null}
    {action}
  </div>
);

export const SkeletonRows = ({ rows = 6 }) => (
  <div className="inv-skelrows" aria-hidden>
    {Array.from({ length: rows }, (_, i) => <div key={i} className="inv-skel inv-skel--row" />)}
  </div>
);
export const Loading = ({ tiles = 4, cards = 0, rows = 6 }) => (
  <div aria-busy="true" aria-live="polite">
    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Loading…</span>
    <div className="inv-skel" style={{ height: 118, borderRadius: 14 }} />
    {tiles ? (
      <div className="inv-tiles" style={{ '--inv-cols': tiles, marginTop: 16 }}>
        {Array.from({ length: tiles }, (_, i) => <div key={i} className="inv-skel inv-skel--tile" />)}
      </div>
    ) : null}
    {cards ? (
      <div className="inv-strip" style={{ '--inv-strip': cards, marginTop: 16 }}>
        {Array.from({ length: cards }, (_, i) => <div key={i} className="inv-skel inv-skel--card" />)}
      </div>
    ) : null}
    <div className="inv-card" style={{ marginTop: 16 }}><SkeletonRows rows={rows} /></div>
  </div>
);

/** What a screen shows when its one endpoint failed. */
export const LoadError = ({ error, onRetry }) => (
  <Card>
    <Empty icon="bang" title="That did not load">
      {error?.message || 'The server did not answer. Nothing has been changed.'}
      {onRetry ? <div style={{ marginTop: 14 }}><Btn kind="primary" icon="refresh" onClick={onRetry}>Try again</Btn></div> : null}
    </Empty>
  </Card>
);

/* ── Modal ───────────────────────────────────────────────────────────────── */

export function Modal({ open, onClose, title, sub, icon, iconTone = 'indigo', wide, xl, slim, foot, children }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', esc);
    // A dialog that leaves the page behind it scrolling is how a modal ends up
    // floating over content that has moved on underneath it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="inv-portal">
      <div className="inv-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
        <div
          className={`inv-modal${wide ? ' inv-modal--wide' : ''}${xl ? ' inv-modal--xl' : ''}${slim ? ' inv-modal--slim' : ''}`}
          role="dialog" aria-modal="true" aria-labelledby={titleId}
        >
          <header className="inv-modal__head">
            {icon ? <Mark name={icon} tone={iconTone} size={42} glyph={20} /> : null}
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <h3 id={titleId}>{title}</h3>
              {sub ? <p>{sub}</p> : null}
            </div>
            <IconBtn icon="close" kind="bare" label="Close" onClick={onClose} />
          </header>
          <div className="inv-modal__body">{children}</div>
          {foot ? <footer className="inv-modal__foot">{foot}</footer> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'primary', busy, icon }) {
  return (
    <Modal
      open={open} onClose={onClose} slim
      icon={icon || (tone === 'danger' ? 'bang' : 'check')}
      iconTone={tone === 'danger' ? 'red' : 'indigo'}
      title={title}
      foot={
        <>
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Btn>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--inv-ink-2)', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}

/* ── Form layout ─────────────────────────────────────────────────────────── */

export const FormGrid = ({ one, three, children }) => (
  <div className={`inv-formgrid${one ? ' inv-formgrid--1' : ''}${three ? ' inv-formgrid--3' : ''}`}>{children}</div>
);
export const FormSection = ({ title, sub, n, children }) => (
  <section className="inv-formsec">
    {(title || n) ? (
      <div className="inv-formsec__head">
        {n ? <span className="inv-formsec__n">{n}</span> : null}
        <div style={{ minWidth: 0 }}>
          <h4>{title}</h4>
          {sub ? <p>{sub}</p> : null}
        </div>
      </div>
    ) : null}
    {children}
  </section>
);

/** The icon picker on the category and budget forms. */
export const IconPicker = ({ value, onChange, options = Object.keys(GLYPHS) }) => (
  <div className="inv-iconpick" role="radiogroup" aria-label="Icon">
    {options.map(k => (
      <button key={k} type="button" role="radio" aria-checked={value === k} aria-label={k}
        className={value === k ? 'is-on' : ''} onClick={() => onChange?.(k)}>
        <Glyph name={k} size={20} />
      </button>
    ))}
  </div>
);
export const GLYPH_NAMES = Object.keys(GLYPHS);

/* ── Hooks ───────────────────────────────────────────────────────────────── */

export function useDebounced(value, ms = 320) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The one loader every screen uses.
 *
 * Keeps the previous page on screen while the next one is fetched, so changing
 * a filter does not blank the table and jump the page; drops a response that
 * arrives after a newer request, so a slow page 1 cannot overwrite a fast
 * page 2.
 */
export function useBoard(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    let alive = true;
    setLoading(true);
    Promise.resolve()
      .then(loader)
      .then((res) => {
        if (!alive || mine !== seq.current) return;
        setData(res?.data ?? res);
        setError(null);
      })
      .catch((e) => {
        if (!alive || mine !== seq.current) return;
        setError(e);
      })
      .finally(() => { if (alive && mine === seq.current) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce(n => n + 1), []);
  return { data, loading, error, reload, first: loading && !data };
}

/** Row selection, with "select every row on this page" and a hard reset. */
export function useMarks(rows, key = (r) => r._id) {
  const [marked, setMarked] = useState(() => new Set());
  const ids = useMemo(() => rows.map(r => String(key(r))), [rows, key]);
  const toggle = useCallback((id, on) => {
    setMarked(prev => {
      const next = new Set(prev);
      if (on) next.add(String(id)); else next.delete(String(id));
      return next;
    });
  }, []);
  const toggleAll = useCallback((on) => {
    setMarked(prev => {
      const next = new Set(prev);
      ids.forEach(i => (on ? next.add(i) : next.delete(i)));
      return next;
    });
  }, [ids]);
  const clear = useCallback(() => setMarked(new Set()), []);
  // Only the ids still on screen can be acted on.
  const visible = useMemo(() => ids.filter(i => marked.has(i)), [ids, marked]);
  return { marked, toggle, toggleAll, clear, selected: visible, count: visible.length };
}

/** Sorting state that resets to descending the first time a column is picked. */
export function useSort(initial = '', initialDir = 'asc') {
  const [sort, setSort] = useState(initial);
  const [dir, setDir] = useState(initialDir);
  const onSort = useCallback((key) => {
    setSort(prev => {
      if (prev === key) { setDir(d => (d === 'asc' ? 'desc' : 'asc')); return prev; }
      setDir('asc');
      return key;
    });
  }, []);
  return { sort, dir, onSort, setSort, setDir };
}

/* ── Files ───────────────────────────────────────────────────────────────── */

export function saveFile(name, content, type = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/**
 * Open a printable document in its own tab.
 *
 * The document comes back from the API as HTML and the request needs the auth
 * header, so it cannot simply be a link. The tab is opened first — synchronously,
 * inside the click — or the pop-up blocker eats it while the fetch is in flight.
 */
export function openHtmlWindow(load) {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:sans-serif;padding:24px;color:#64748b">Preparing…</p>');
  return Promise.resolve(load()).then((html) => {
    if (!w) return;
    w.document.open(); w.document.write(typeof html === 'string' ? html : String(html)); w.document.close();
  }).catch((e) => { if (w) w.close(); throw e; });
}
/** cols: [key, header, (row) => value]. Quotes anything that needs it. */
export function toCsv(cols, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map(c => cell(c[1])).join(',');
  const body = rows.map(r => cols.map(c => cell(c[2] ? c[2](r) : r[c[0]])).join(','));
  return [head, ...body].join('\n');
}

/* ── Shared option lists ─────────────────────────────────────────────────── */
/*
   Every form on every screen needs the same five lists — categories, stores,
   vendors, departments and the item master — and they change about once a
   week. They are fetched once per page load and shared, rather than each of
   twelve screens fetching its own copy on every mount.
*/
let metaCache = null;
let metaPromise = null;
const metaSubs = new Set();

export function invalidateMeta() {
  metaCache = null;
  metaPromise = null;
  metaSubs.forEach(fn => fn(null));
}

export function useInvMeta(fetcher) {
  const [meta, setMeta] = useState(metaCache);
  const [error, setError] = useState(null);

  useEffect(() => {
    metaSubs.add(setMeta);
    return () => { metaSubs.delete(setMeta); };
  }, []);

  useEffect(() => {
    if (metaCache || !fetcher) return;
    if (!metaPromise) {
      metaPromise = Promise.resolve()
        .then(fetcher)
        .then((r) => {
          metaCache = r?.data ?? r ?? {};
          metaSubs.forEach(fn => fn(metaCache));
          return metaCache;
        })
        .catch((e) => {
          // A failed meta fetch must not wedge the cache: the next screen to
          // mount should try again rather than inherit the failure.
          metaPromise = null;
          throw e;
        });
    }
    let alive = true;
    metaPromise.then((m) => { if (alive) setMeta(m); }).catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [fetcher]);

  return {
    meta: meta || {},
    error,
    // The year the school is actually in, which is what the chip names.
    activeYear: (meta?.years || []).find(y => y.status === 'active') || newestYear(meta?.years),
  };
}

/**
 * The breadcrumb-row chip every screen carries.
 *
 * The mockups put it at the far right of the breadcrumb row, which the LAYOUT
 * draws, not the page — so it is portalled into `.crumbs` rather than being a
 * row of its own under the tab strip. If the crumb is not there (a page deep
 * enough that the trail collapses), it falls back to its own row, so the chip
 * is never simply lost.
 *
 * Read-only on eleven of the twelve screens, deliberately: stock, vendors and
 * stores are not per-year, so a picker here would claim to filter something it
 * cannot. Budgets ARE per-year, and that screen has a real Academic Year
 * control in its own filter bar.
 */
export function YearBar({ year, children }) {
  const [host, setHost] = useState(null);

  useLayoutEffect(() => {
    const crumbs = document.querySelector('.crumbs');
    if (!crumbs) return undefined;
    const slot = document.createElement('div');
    slot.className = 'inv-crumbside';
    crumbs.appendChild(slot);
    setHost(slot);
    return () => { slot.remove(); setHost(null); };
  }, []);

  const chip = (
    <>
      {children}
      <YearChip options={year ? [{ _id: year._id, name: year.name }] : []} value={year?._id} />
    </>
  );
  if (host) return createPortal(chip, host);
  return <TopBar>{chip}</TopBar>;
}
