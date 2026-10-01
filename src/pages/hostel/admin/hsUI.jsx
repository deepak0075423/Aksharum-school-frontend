/**
 * The Hostel module's own UI kit (Sep 2026 redesign, to the user's mockups).
 *
 * The Dashboard is the first screen on it; the other twenty-four hostel screens
 * still draw with the older components/ui pieces and `../shared`, and move over
 * as their own mockups arrive. Nothing here reaches into another module's kit:
 * the Inventory and Transport kits were built the same way, one per module, so
 * a change for one set of mockups cannot quietly restyle another.
 *
 * Two things worth knowing before changing anything here:
 *
 *   · Glyphs. The mockups' tile and card icons are solid shapes with white
 *     detail, not the app's outline set, so the module draws its own. `Glyph`
 *     falls back to the shared registry for a name it does not have — the
 *     shared `Icon` renders NOTHING for an unknown name, which is how a button
 *     ends up an empty box.
 *   · Breakpoints are container queries on `.hs-page` (styles/hostel.css).
 *     Nothing here asks the viewport how wide it is.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon, { ICON_NAMES } from '../../../components/ui/icons';
import '../../../styles/hostel.css';

/* ── Numbers ─────────────────────────────────────────────────────────────── */

export const num = (v) => (Number.isFinite(+v) ? +v : 0);
export const count = (n) => num(n).toLocaleString('en-IN');
export const plural = (n, one, many) => `${count(n)} ${num(n) === 1 ? one : (many || `${one}s`)}`;

/** "₹ 12,500" — spaced, as the mockup prints it; crores are abbreviated. */
export function money(n) {
  const v = num(n);
  if (Math.abs(v) >= 1e7) return `₹ ${(v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
  return `₹ ${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** 25000 → "25K", 150000 → "1.5L" — for chart ticks, where there is no room. */
export function compact(n) {
  const v = num(n);
  const f = (x) => x.toLocaleString('en-IN', { maximumFractionDigits: 1 });
  if (Math.abs(v) >= 1e7) return `${f(v / 1e7)}Cr`;
  if (Math.abs(v) >= 1e5) return `${f(v / 1e5)}L`;
  if (Math.abs(v) >= 1e3) return `${f(v / 1e3)}K`;
  return f(v);
}

/**
 * Whole-number percentages that add up to exactly 100 (largest remainder).
 * Rounding each share on its own gives legends like 33% · 33% · 33%.
 */
export function shares(values) {
  const vals = values.map(num);
  const total = vals.reduce((s, v) => s + v, 0);
  if (!total) return vals.map(() => 0);
  const raw = vals.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((s, v) => s + v, 0);
  raw.map((r, i) => [r - Math.floor(r), i])
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (left > 0 && vals[i] > 0) { out[i] += 1; left -= 1; } });
  return out;
}

/** A share of a roll, never "0%" beside a figure that is not zero. */
export function pctOf(part, whole) {
  const p = num(part); const w = num(whole);
  if (!w || !p) return 0;
  return Math.min(100, Math.max(1, Math.round((p / w) * 100)));
}

/**
 * "2026-27" → "2026 - 2027", as the mockup writes a year. A school that named
 * its year something else keeps its own name.
 */
export function yearLabel(y) {
  const name = String(y?.yearName || '').trim();
  const m = name.match(/^(\d{4})\s*[-–/]\s*(\d{2}|\d{4})$/);
  if (!m) return name || '—';
  const end = m[2].length === 2 ? `${m[1].slice(0, 2)}${m[2]}` : m[2];
  return `${m[1]} - ${end}`;
}

/** 19/8/2026, 6:21:50 pm — the timestamp format of the old dashboard, kept. */
export const stamp = (d) => (d ? new Date(d).toLocaleString('en-IN') : '');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "29 Sep" — en-IN would say "29 Sept", beside a chart that says "Sep". */
export const shortDate = (d) => {
  const x = d ? new Date(d) : null;
  return x && !Number.isNaN(x.getTime()) ? `${x.getDate()} ${MON[x.getMonth()]}` : '';
};
export const words = (v) => String(v || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/* ── Glyphs ──────────────────────────────────────────────────────────────── */

const W = '#fff';
const GLYPHS = {
  // Total Hostels — a domed block, four windows, a bed over the door.
  hostel: <>
    <path d="M6.3 20.6 7 8.3C7.2 5.1 9.3 2.8 12 2.8s4.8 2.3 5 5.5l.7 12.3z" fill="currentColor" />
    <path d="M4.6 21h14.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="8.8" y="7.4" width="2.4" height="2.2" rx=".6" fill={W} />
    <rect x="12.8" y="7.4" width="2.4" height="2.2" rx=".6" fill={W} />
    <rect x="8.8" y="11.2" width="2.4" height="2.2" rx=".6" fill={W} />
    <rect x="12.8" y="11.2" width="2.4" height="2.2" rx=".6" fill={W} />
    <path d="M9.4 18.9v-2.7M9.4 17.7h5.2v1.2M10.9 16.8h1.7" stroke={W} strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // Buildings — a flat-roofed block with a doorway.
  building: <>
    <path d="M5.6 20.6V5.2a2 2 0 0 1 2-2h8.8a2 2 0 0 1 2 2v15.4h-4.1v-3.9H9.7v3.9z" fill="currentColor" />
    <path d="M3.8 20.8h16.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="8.4" y="6.6" width="2.6" height="2.4" rx=".6" fill={W} />
    <rect x="13" y="6.6" width="2.6" height="2.4" rx=".6" fill={W} />
    <rect x="8.4" y="11.2" width="2.6" height="2.4" rx=".6" fill={W} />
    <rect x="13" y="11.2" width="2.6" height="2.4" rx=".6" fill={W} />
  </>,
  // Floors — a stepped outline, one level above another.
  floors: <>
    <path d="M4.2 20.2v-5.8h3.4V9.8h3.2V4.2h2.4l.8 1.6 1.6-.5.5 2.2-1.1.9 1.3 1.3v3.2l1.9.8v6.5z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M2.8 20.4h18.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  // Rooms — a door in its frame.
  door: <>
    <rect x="5.6" y="2.8" width="12.8" height="18.4" rx="1.8" fill="currentColor" />
    <rect x="8" y="5.2" width="8" height="13.6" rx=".8" fill={W} fillOpacity=".28" />
    <circle cx="14.1" cy="12.4" r="1.05" fill={W} />
  </>,
  // Beds — headboard, mattress, pillow, footboard.
  bed: <>
    <path d="M3.4 5.4v14M20.6 10.8v8.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M3.4 15.6h17.2" stroke="currentColor" strokeWidth="2.4" />
    <rect x="4.6" y="11.4" width="15" height="3.4" rx="1" fill="currentColor" />
    <rect x="5.7" y="8.8" width="4.2" height="2.8" rx="1.2" fill="currentColor" fillOpacity=".45" />
  </>,
  checkCircle: <>
    <circle cx="12" cy="12" r="9.6" fill="currentColor" />
    <path d="m7.6 12.3 3 3 5.8-6" stroke={W} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  dot: <circle cx="12" cy="12" r="8.6" fill="currentColor" />,
  // The mockup's calendar: a heavy outline with its header band filled.
  calendar: <>
    <path d="M6.2 5.2h11.6a2.8 2.8 0 0 1 2.8 2.8v2.4H3.4V8a2.8 2.8 0 0 1 2.8-2.8z" fill="currentColor" />
    <rect x="4.5" y="5.2" width="15" height="15" rx="2.8" stroke="currentColor" strokeWidth="2.1" fill="none" />
    <path d="M8.2 3.2v4M15.8 3.2v4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  </>,
  pencilSquare: <>
    <path d="M11.4 4.6H7.2a2.6 2.6 0 0 0-2.6 2.6v9.6a2.6 2.6 0 0 0 2.6 2.6h9.6a2.6 2.6 0 0 0 2.6-2.6v-4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="M17.8 3.9a1.9 1.9 0 0 1 2.7 2.7l-7.3 7.3-3.6.9.9-3.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
  </>,
  xCircle: <>
    <circle cx="12" cy="12" r="9.6" fill="currentColor" />
    <path d="m8.7 8.7 6.6 6.6m0-6.6-6.6 6.6" stroke={W} strokeWidth="2.3" strokeLinecap="round" />
  </>,
  checkSquare: <>
    <rect x="3" y="3" width="18" height="18" rx="4.6" fill="currentColor" />
    <path d="m7.6 12.2 3 3 5.8-6" stroke={W} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  clockSolid: <>
    <circle cx="12" cy="12" r="9.6" fill="currentColor" />
    <path d="M12 7v5.4l3.3 2" stroke={W} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  rupee: <path d="M6.8 4.6h10.4M6.8 9h10.4M9.6 4.6c3.1 0 5 1.7 5 4.4s-1.9 4.4-5 4.4H7.4l7.6 6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  people: <>
    <circle cx="6.9" cy="8.4" r="3.1" fill="currentColor" />
    <path d="M2.2 19.4c0-3.1 2.1-5.3 4.7-5.3s4.7 2.2 4.7 5.3z" fill="currentColor" />
    <circle cx="17.1" cy="8.4" r="3.1" fill="currentColor" />
    <path d="M12.4 19.4c0-3.1 2.1-5.3 4.7-5.3s4.7 2.2 4.7 5.3z" fill="currentColor" />
  </>,
  alertTri: <>
    <path d="M10.3 3.9a2 2 0 0 1 3.4 0l7.8 13.4a2 2 0 0 1-1.7 3H4.2a2 2 0 0 1-1.7-3z" fill="currentColor" />
    <path d="M12 9.2v4.4" stroke={W} strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="16.8" r="1.25" fill={W} />
  </>,
  house: <>
    <path d="M12 3.4 2.6 11.2h2.6v8.6a1 1 0 0 0 1 1h4.2v-5.2h3.2v5.2h4.2a1 1 0 0 0 1-1v-8.6h2.6z" fill="currentColor" />
    <path d="M6.6 5.2h2.4v2.2L6.6 9.4z" fill="currentColor" />
  </>,
  // Currently outside — someone walking out. Drawn in its own colours, as the
  // mockup's is, so it ignores the tone's glyph colour.
  walker: <>
    <circle cx="12.8" cy="4.3" r="2.1" fill="#f6a50c" />
    <path d="M12.4 7.8 11.5 13" stroke="#f6a50c" strokeWidth="3.1" strokeLinecap="round" />
    <path d="M12.6 8.2l2.2 2.6 2.4 1.1M11.8 8.4 9.4 10.6 8.2 12.8" stroke="#f6a50c" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M11.5 13 9.6 17.1 8 20.4M11.5 13l2.5 3.4.8 4" stroke="#5c5655" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // On leave — a beach umbrella on an island.
  beach: <>
    <ellipse cx="12" cy="18.7" rx="8.4" ry="2.5" fill="#39b1f6" />
    <ellipse cx="12.6" cy="17.6" rx="4.4" ry="1.5" fill="#f7c66c" />
    <path d="M12.1 9.9 12.9 17.3" stroke="#8a5a3c" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M4.7 10.4C5.3 6.3 8.9 3.8 12.5 4.3s6.5 3.6 6.5 7.6c-2-.6-4.4-.7-7-.3-2.7.4-5.1 1-7.3-1.2z" fill="#fb7a14" />
    <path d="M12 4.5c-1.3 2-1.7 4.3-1.1 6.8" stroke="#fdc88a" strokeWidth="1" fill="none" />
  </>,
  // Total Billed — an office block, windows in a grid.
  office: <>
    <path d="M5.4 20.6V5a1.8 1.8 0 0 1 1.8-1.8h9.6A1.8 1.8 0 0 1 18.6 5v15.6h-4.2v-3.4H9.6v3.4z" fill="currentColor" />
    <path d="M3.6 20.8h16.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    {[6.2, 9.6, 13].map((y) => [8, 11.2, 14.4].map((x) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="1.7" height="2" rx=".4" fill={W} />
    )))}
  </>,
  // Total Collected — a receipt tag with the rupee on it.
  tag: <>
    <path d="M5 3.4h14a1 1 0 0 1 1 1v10.2a1.6 1.6 0 0 1-.6 1.2L12 21l-7.4-5.2a1.6 1.6 0 0 1-.6-1.2V4.4a1 1 0 0 1 1-1z" fill="currentColor" />
    <path d="M8.8 7.4h6.4M8.8 9.9h6.4M11.1 7.4c1.5 0 2.3.8 2.3 2s-.8 1.9-2.3 1.9H9.6l3.5 3" stroke={W} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // "N beds are available" — a vacancy timer.
  vacancy: <>
    <rect x="6.6" y="4.4" width="10.8" height="15.2" rx="3.6" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M10 2.6h4M10 21.4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 8.6v3.8h2.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  wrench: <path d="M20 6.4a5.2 5.2 0 0 1-6.6 6.5l-6.5 6.6a2.1 2.1 0 1 1-3-3l6.6-6.5A5.2 5.2 0 0 1 17 3.4l-3 3 .6 2.8 2.8.6z" fill="currentColor" />,

  /* ── The list screens' set (hsList.jsx) ─────────────────────────────────── */
  // A hostel as the list mockups draw it: a tower between two wings.
  tower: <>
    <path d="M8.1 3.4h7.8a1 1 0 0 1 1 1v15.4H7.1V4.4a1 1 0 0 1 1-1z" fill="currentColor" />
    <path d="M4.6 8.2h3v11.6H3.8V9a.8.8 0 0 1 .8-.8zM16.4 8.2h3a.8.8 0 0 1 .8.8v10.8h-3.8z" fill="currentColor" />
    <path d="M2.6 19.7h18.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    {[6, 10].map((y) => [9.2, 12.7].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="2.1" height="2.4" rx=".8" fill={W} />))}
    {[10.2, 13.2, 16.2].map((y) => [4.9, 17.7].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="1.4" height="1.7" rx=".5" fill={W} />))}
    <path d="M10.6 20.7v-3.3a1.4 1.4 0 0 1 2.8 0v3.3z" fill={W} />
  </>,
  // A made bed with someone in it.
  bedSolid: <>
    <rect x="2.4" y="5" width="2.7" height="14.6" rx="1.35" fill="currentColor" />
    <circle cx="8.2" cy="9.7" r="2.15" fill="currentColor" />
    <path d="M11.5 7.5h6.1a3.9 3.9 0 0 1 3.9 3.9v.9h-10z" fill="currentColor" />
    <path d="M2.4 13.2h17.8a1.3 1.3 0 0 1 1.3 1.3v3.9a1.2 1.2 0 0 1-2.4 0v-1.5H5.1v1.5" fill="currentColor" />
  </>,
  // A warning, in outline — for a button rather than a tile.
  warn: <>
    <path d="M10.4 4.2a1.85 1.85 0 0 1 3.2 0l7.4 12.8a1.85 1.85 0 0 1-1.6 2.8H4.6A1.85 1.85 0 0 1 3 17z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" fill="none" />
    <path d="M12 9.4v4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="12" cy="16.4" r="1.05" fill="currentColor" />
  </>,
  // A complaint — a speech bubble.
  chatSolid: <path d="M5.2 3.6h13.6a2.4 2.4 0 0 1 2.4 2.4v8.4a2.4 2.4 0 0 1-2.4 2.4h-6.6l-4.2 3.6a.6.6 0 0 1-1-.46V16.8H5.2a2.4 2.4 0 0 1-2.4-2.4V6a2.4 2.4 0 0 1 2.4-2.4z" fill="currentColor" />,
  // Reopened — two arrows chasing each other.
  cycle: <>
    <path d="M19.4 9.2A7.8 7.8 0 0 0 5.8 7.2M4.6 14.8a7.8 7.8 0 0 0 13.6 2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    <path d="M5.4 3.6v4h4M18.6 20.4v-4h-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // An asset — a box seen from a corner.
  cube: <>
    <path d="M12 2.6 20.4 7.2v9.6L12 21.4 3.6 16.8V7.2z" fill="currentColor" />
    <path d="M3.8 7.3 12 11.8l8.2-4.5M12 11.8v9.4" stroke={W} strokeWidth="1.5" strokeLinejoin="round" fill="none" opacity=".7" />
  </>,
  // Unassigned — a storage box with its lid.
  boxSolid: <>
    <rect x="2.8" y="4" width="18.4" height="5.2" rx="1.4" fill="currentColor" />
    <path d="M4.4 10.4h15.2v7.8a1.8 1.8 0 0 1-1.8 1.8H6.2a1.8 1.8 0 0 1-1.8-1.8z" fill="currentColor" />
    <path d="M9.6 13.6h4.8" stroke={W} strokeWidth="1.8" strokeLinecap="round" />
  </>,
  // Electrical — a bolt.
  bolt: <path d="M13.4 2.4 4.8 13.6h5.8l-1.4 8 8.8-11.6h-5.8z" fill="currentColor" />,
  // Plumbing — a drop.
  drop: <path d="M12 2.6c3.4 4.2 6.2 7.6 6.2 11.4a6.2 6.2 0 0 1-12.4 0c0-3.8 2.8-7.2 6.2-11.4z" fill="currentColor" />,
  // Furniture — a chair.
  chair: <>
    <path d="M6.4 3.4h11.2a1 1 0 0 1 1 1v7.2H5.4V4.4a1 1 0 0 1 1-1z" fill="currentColor" />
    <rect x="4" y="12.4" width="16" height="3.4" rx="1.2" fill="currentColor" />
    <path d="M6.2 15.8v5M17.8 15.8v5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </>,
  // Cleaning — a broom.
  broom: <>
    <path d="M18.6 3.4 11.8 10.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M9.6 8.8l5.6 5.6-2.4 4.8c-.8 1.6-2.8 2-4.2.6L4.2 15.4c-1.4-1.4-1-3.4.6-4.2z" fill="currentColor" />
  </>,
  // Internet — three arcs over a dot.
  wifi: <>
    <path d="M2.8 9.2a13.6 13.6 0 0 1 18.4 0M6 12.8a8.8 8.8 0 0 1 12 0M9.2 16.2a4.2 4.2 0 0 1 5.6 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    <circle cx="12" cy="19.4" r="1.5" fill="currentColor" />
  </>,
  // Total billed — a wallet, its clasp at the right.
  wallet: <>
    <path d="M4.4 5.4h12.8a1.8 1.8 0 0 1 1.8 1.8v1H6.2a1.8 1.8 0 0 1-1.8-1.8z" fill="currentColor" fillOpacity=".55" />
    <rect x="3.2" y="7.2" width="17.6" height="12.4" rx="2.2" fill="currentColor" />
    <circle cx="16.8" cy="13.4" r="1.5" fill={W} />
  </>,
  // Outstanding — an hourglass, sand in both bulbs.
  hourglass: <>
    <path d="M6 3.4h12M6 20.6h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M7.4 3.6v2.8c0 2 1.4 3.4 3.2 4.6l1.4 1 1.4-1c1.8-1.2 3.2-2.6 3.2-4.6V3.6zM7.4 20.4v-2.8c0-2 1.4-3.4 3.2-4.6l1.4-1 1.4 1c1.8 1.2 3.2 2.6 3.2 4.6v2.8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="currentColor" fillOpacity=".22" />
    <path d="M9.4 19.8c.4-1.6 1.4-2.4 2.6-2.4s2.2.8 2.6 2.4z" fill="currentColor" />
  </>,
  // Refunded — a disc with an arrow turning back.
  refund: <>
    <circle cx="12" cy="12" r="9.6" fill="currentColor" />
    <path d="M7 12h6.4a2.6 2.6 0 1 0-2.6-2.6" stroke={W} strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="m9.4 9.6-2.4 2.4 2.4 2.4" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // A mess — a fork and a knife.
  cutlery: <>
    <path d="M6 3v5.2M8.6 3v5.2M11.2 3v5.2M6 8.2a2.6 2.6 0 0 0 5.2 0M8.6 10.8V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="M18.4 21V3c-2.4.8-3.8 3.4-3.8 6.4 0 2.4 1.2 3.8 3.8 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity=".9" />
  </>,
  // Meals served — a cloche on its tray.
  cloche: <>
    <path d="M3.6 16.2a8.4 8.4 0 0 1 16.8 0z" fill="currentColor" />
    <circle cx="12" cy="6.3" r="1.5" fill="currentColor" />
    <rect x="2.2" y="17.4" width="19.6" height="2.6" rx="1.3" fill="currentColor" />
  </>,
  // Members — three of them.
  crowd: <>
    <circle cx="12" cy="7.4" r="3.3" fill="currentColor" />
    <path d="M6.2 19.4c0-3.4 2.5-5.7 5.8-5.7s5.8 2.3 5.8 5.7z" fill="currentColor" />
    <circle cx="4.9" cy="9.2" r="2.3" fill="currentColor" />
    <circle cx="19.1" cy="9.2" r="2.3" fill="currentColor" />
    <path d="M1.2 18.4c0-2.6 1.7-4.3 3.9-4.3.7 0 1.4.2 2 .5-1 1-1.6 2.3-1.7 3.8zM22.8 18.4c0-2.6-1.7-4.3-3.9-4.3-.7 0-1.4.2-2 .5 1 1 1.6 2.3 1.7 3.8z" fill="currentColor" />
  </>,
  // A warden — a shield with a tick.
  shieldSolid: <>
    <path d="M12 2.6 4.4 5.4v5.8c0 4.6 3 8.4 7.6 10.2 4.6-1.8 7.6-5.6 7.6-10.2V5.4z" fill="currentColor" />
    <path d="m8.6 11.8 2.4 2.4 4.4-4.6" stroke={W} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // Support staff — a hard hat.
  hardhat: <>
    <path d="M4.2 14.6a7.8 7.8 0 0 1 5.4-7.4V5.4a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v1.8a7.8 7.8 0 0 1 5.4 7.4z" fill="currentColor" />
    <rect x="2.6" y="14.6" width="18.8" height="4.2" rx="2.1" fill="currentColor" />
    <path d="M10.4 7.2v4M13.6 7.2v4" stroke={W} strokeWidth="1.3" strokeLinecap="round" opacity=".6" />
  </>,
  // Live Monitor — a screen on its stand.
  monitor: <>
    <rect x="3" y="4" width="18" height="12.4" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M9 20.4h6M12 16.6v3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </>,
  // Inside the hostel — a door, and an arrow going in.
  gateIn: <>
    <path d="M4.2 3.6h7.6a1.4 1.4 0 0 1 1.4 1.4v14a1.4 1.4 0 0 1-1.4 1.4H4.2z" fill="currentColor" />
    <circle cx="10.2" cy="12" r="1.1" fill={W} />
    <path d="M15.4 12h5.4M18.4 9.2l2.8 2.8-2.8 2.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // Currently out — someone walking, in the tile's own colour.
  walk: <>
    <circle cx="13" cy="4.4" r="2.2" fill="currentColor" />
    <path d="M12.4 8 11.4 13.4" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <path d="M12.6 8.4l2.4 2.8 2.6 1.2M11.8 8.6 9.2 10.8 8 13.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M11.4 13.4 9.4 17.4 7.8 20.8M11.4 13.4l2.6 3.4.8 4.2" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // An outpass in hand — a ticket with its notches.
  ticket: <>
    <path d="M3.2 7.4a1.6 1.6 0 0 1 1.6-1.6h14.4a1.6 1.6 0 0 1 1.6 1.6v2.2a2.4 2.4 0 0 0 0 4.8v2.2a1.6 1.6 0 0 1-1.6 1.6H4.8a1.6 1.6 0 0 1-1.6-1.6v-2.2a2.4 2.4 0 0 0 0-4.8z" fill="currentColor" />
    <path d="M8 10h8M8 14h5" stroke={W} strokeWidth="1.8" strokeLinecap="round" />
  </>,
  // Overdue — a clock face with an exclamation in it.
  alarm: <>
    <circle cx="12" cy="12" r="9.6" fill="currentColor" />
    <path d="M12 6.8v6" stroke={W} strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="12" cy="16.6" r="1.35" fill={W} />
  </>,
  // Revoke — an arrow turning back on itself.
  undo: <path d="M8.2 4.6 4 8.8l4.2 4.2M4.4 8.8h9.2a6 6 0 1 1-5.3 8.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  // Medical — a plain cross.
  cross: <path d="M9.4 3.2h5.2v6.2h6.2v5.2h-6.2v6.2H9.4v-6.2H3.2V9.4h6.2z" fill="currentColor" />,
  // Leave — a plane, banking.
  plane: <path d="M21.4 3.1c.5.5.4 1.7-.4 3.2l-3.2 3.5 1.7 9.3-1.9 1.5-3.6-7.3-3.4 3.3.3 3.3-1.4 1.2-1.9-3.8-3.8-1.9 1.2-1.4 3.3.3 3.3-3.4-7.3-3.6 1.5-1.9 9.3 1.7L18.2 3.5c1.5-.8 2.7-.9 3.2-.4z" fill="currentColor" />,
  // A pass — two tickets, side by side.
  passes: <>
    <path d="M4 5.2h5.6v13.6H4a.8.8 0 0 1-.8-.8V6a.8.8 0 0 1 .8-.8zM14.4 5.2H20a.8.8 0 0 1 .8.8v12a.8.8 0 0 1-.8.8h-5.6z" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="M6.4 9.2v5.6M17.6 9.2v5.6M11 4v16M13 4v16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  // Out and back — two arrows turning round.
  swap: <>
    <path d="M9 4.6 4.6 9 9 13.4M4.6 9h9.6a4.8 4.8 0 0 1 4.8 4.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="m15.6 15.2 3.4 3.4-3.4 3.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".55" />
  </>,
  // A QR code, for the gate pass.
  qr: <>
    <rect x="3.6" y="3.6" width="6.8" height="6.8" rx="1.2" stroke="currentColor" strokeWidth="2" fill="none" />
    <rect x="13.6" y="3.6" width="6.8" height="6.8" rx="1.2" stroke="currentColor" strokeWidth="2" fill="none" />
    <rect x="3.6" y="13.6" width="6.8" height="6.8" rx="1.2" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M13.6 13.6h3v3h-3zM18 18h2.4v2.4H18zM13.6 18.6h2.2v1.8h-2.2zM18.4 13.6h2v2.2h-2z" fill="currentColor" />
  </>,
  // On leave — a disc with a bar through it.
  minusCircle: <>
    <circle cx="12" cy="12" r="9.6" fill="currentColor" />
    <path d="M7.6 12h8.8" stroke={W} strokeWidth="2.4" strokeLinecap="round" />
  </>,
  // A conflict — a resident with a warning beside them.
  personAlert: <>
    <circle cx="9.6" cy="7.2" r="4" fill="currentColor" />
    <path d="M2.4 19.6c0-4 3.2-6.6 7.2-6.6 1.5 0 2.9.4 4 1l-3 5.4a1.6 1.6 0 0 0 .2 1.8H3.4a1 1 0 0 1-1-1z" fill="currentColor" />
    <path d="M16.5 13.2a1.3 1.3 0 0 1 2.3 0l3.5 6.3a1.3 1.3 0 0 1-1.1 1.9h-7.1a1.3 1.3 0 0 1-1.1-1.9z" fill="currentColor" />
    <path d="M17.65 15.8v2.3" stroke={W} strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="17.65" cy="19.7" r=".75" fill={W} />
  </>,
  // An application — a sheet with its corner folded and three lines of writing.
  doc: <>
    <path d="M6.6 2.8h7.2l4.6 4.6v11.8a2 2 0 0 1-2 2H6.6a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2z" fill="currentColor" />
    <path d="M13.6 2.9v3.3a1.4 1.4 0 0 0 1.4 1.4h3.3z" fill={W} fillOpacity=".55" />
    <path d="M8 11.4h8M8 14.4h8M8 17.4h5.2" stroke={W} strokeWidth="1.5" strokeLinecap="round" />
  </>,
  // A waiting list — three bullets, three lines.
  listSolid: <>
    <circle cx="4.6" cy="6.4" r="1.7" fill="currentColor" />
    <circle cx="4.6" cy="12" r="1.7" fill="currentColor" />
    <circle cx="4.6" cy="17.6" r="1.7" fill="currentColor" />
    <path d="M9.4 6.4h11M9.4 12h11M9.4 17.6h11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </>,
  // Fit View — the four corners of a frame.
  fit: <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" fill="none" />,
  // One resident.
  person: <>
    <circle cx="12" cy="7.4" r="4.2" fill="currentColor" />
    <path d="M3.8 20.2c0-4.2 3.6-7 8.2-7s8.2 2.8 8.2 7a1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1z" fill="currentColor" />
  </>,
  // Under repair — a wrench laid across a screwdriver.
  tools: <>
    <path d="M6.2 3.4 4 5.6l2.1 3 1.7.2 9.2 9.3a1.9 1.9 0 0 0 2.7-2.7l-9.3-9.2-.2-1.7z" fill="currentColor" />
    <path d="M20.6 5.3a4.3 4.3 0 0 1-5.7 5.5l-7.3 7.5a2 2 0 1 1-2.8-2.8l7.4-7.4a4.3 4.3 0 0 1 5.6-5.6l-2.7 2.7.5 2.3 2.3.5z" fill="currentColor" fillOpacity=".92" />
  </>,
  // Floors — three sheets, stacked.
  stack: <>
    <path d="M12 2.8 21.4 7.6 12 12.4 2.6 7.6z" fill="currentColor" />
    <path d="m4.5 11.3-1.9 1 9.4 4.8 9.4-4.8-1.9-1-7.5 3.8z" fill="currentColor" fillOpacity=".78" />
    <path d="m4.5 15.7-1.9 1 9.4 4.8 9.4-4.8-1.9-1-7.5 3.8z" fill="currentColor" fillOpacity=".55" />
  </>,
  // Two residents, one behind the other.
  group: <>
    <circle cx="9.5" cy="7.7" r="4" fill="currentColor" />
    <path d="M2.4 19.3c0-3.9 3.1-6.3 7.1-6.3s7.1 2.4 7.1 6.3a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1z" fill="currentColor" />
    <path d="M14.6 4.1c2 .2 3.4 1.7 3.4 3.6s-1.4 3.4-3.4 3.6c.8-1 1.2-2.2 1.2-3.6s-.4-2.6-1.2-3.6z" fill="currentColor" />
    <path d="M17.5 13.6c2.4.8 4.1 2.8 4.1 5.7a1 1 0 0 1-1 1h-2.3c.2-.3.3-.6.3-1 0-2.2-.4-4.1-1.1-5.7z" fill="currentColor" />
  </>,
  // An emergency — a beacon on its base, lit.
  siren: <>
    <path d="M6.4 16.4v-4.6a5.6 5.6 0 0 1 11.2 0v4.6z" fill="currentColor" />
    <rect x="4" y="17.2" width="16" height="3.6" rx="1.2" fill="currentColor" />
    <path d="M10.4 11.2a1.8 1.8 0 0 1 1.6-1.6" stroke={W} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    <path d="M12 1.8v1.8M4.1 5.1l1.3 1.3M19.9 5.1l-1.3 1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  // Discipline — a gavel over its block.
  gavel: <>
    <path d="m12.9 2.9 5.8 5.8-2.6 2.6-5.8-5.8z" fill="currentColor" />
    <path d="m9.2 6.8 5.6 5.6-1.3 1.3-5.6-5.6z" fill="currentColor" opacity=".55" />
    <path d="m11.8 11.8-6.9 6.9a1.4 1.4 0 0 1-2-2l6.9-6.9" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" fill="none" />
    <path d="M12.6 20.6h8.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </>,
  // The medical log — an ambulance, drawn in outline like the other buttons.
  ambulance: <>
    <path d="M2.8 7.2a1 1 0 0 1 1-1h9.6a1 1 0 0 1 1 1v9.4H2.8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    <path d="M14.4 9.4h3.4l3.4 3.6v3.6h-6.8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    <circle cx="7" cy="17.4" r="1.9" stroke="currentColor" strokeWidth="1.8" fill="#fff" />
    <circle cx="17.2" cy="17.4" r="1.9" stroke="currentColor" strokeWidth="1.8" fill="#fff" />
    <path d="M8.6 8.8v4.4M6.4 11h4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  /* ── Outline icons for the form fields and steppers (the forms' mockups draw
     every field icon as a thin outline, 1.8px on a 24 grid). ─────────────── */
  oTag: <>
    <path d="M3.5 12.2V4.6a1.1 1.1 0 0 1 1.1-1.1h7.6l8.3 8.3a1.1 1.1 0 0 1 0 1.6l-7.1 7.1a1.1 1.1 0 0 1-1.6 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
  </>,
  oBed: <>
    <path d="M3 6v13M3 16h18v3M21 16v-3.5a2.5 2.5 0 0 0-2.5-2.5H11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="7" cy="12.2" r="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
  </>,
  oDoor: <>
    <path d="M6 20.5V4.8a1.3 1.3 0 0 1 1.3-1.3h9.4A1.3 1.3 0 0 1 18 4.8v15.7M4 20.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="14.5" cy="12.5" r="1.1" fill="currentColor" />
  </>,
  oHash: <path d="M9.5 3.5 7.5 20.5M16.5 3.5l-2 17M4.5 8.5h16M3.5 15.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />,
  oMap: <path d="M9 4.5 3.5 6.6v13l5.5-2.1 6 2.1 5.5-2.1v-13L15 6.6zM9 4.5v13M15 6.6v13" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />,
  oCloud: <>
    <path d="M7.2 18.5H6.5a4 4 0 0 1-.6-7.96A6 6 0 0 1 17.6 9a4.5 4.5 0 0 1-.1 9h-.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M12 20.5v-8M9 15.3l3-3 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  oGender: <>
    <circle cx="12" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="M8.5 20.5v-5.2a3.5 3.5 0 0 1 7 0v5.2M12 14v6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
  </>,
  oExit: <>
    <path d="M13.5 4.5H6.8a1.3 1.3 0 0 0-1.3 1.3v12.4a1.3 1.3 0 0 0 1.3 1.3h6.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="M11 12h9.5M17 8.5l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  oBuilding: <>
    <path d="M5 20.5V4.8a1.3 1.3 0 0 1 1.3-1.3h7.4A1.3 1.3 0 0 1 15 4.8v15.7M15 9.5h3.7a1.3 1.3 0 0 1 1.3 1.3v9.7M3.5 20.5h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M8.5 7.5h3M8.5 11h3M8.5 14.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  oHeart: <path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />,
  oRows: <path d="M4 6h3M10.5 6H20M4 12h3M10.5 12H20M4 18h3M10.5 18H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  oGrid: <>
    {[5, 12, 19].flatMap((x) => [5, 12, 19].map((y) => <rect key={`${x}-${y}`} x={x - 2} y={y - 2} width="4" height="4" rx="1" fill="currentColor" />))}
  </>,
  oReceipt: <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3zM9 8h6M9 11.5h6M9 15h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  oWrench: <path d="M14.8 6.3a4 4 0 0 0 5.2 5.2l-8.4 8.4a2.1 2.1 0 0 1-3-3l8.4-8.4a4 4 0 0 1-2.2-2.2zM14.8 6.3 17.5 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  oCheckRound: <>
    <circle cx="12" cy="12" r="9" fill="currentColor" />
    <path d="m8 12.2 2.7 2.7L16.2 9.4" stroke={W} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // Print — a printer, in outline like the other head buttons.
  printer: <>
    <path d="M7 8.4V3.6h10v4.8" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" fill="none" />
    <path d="M7 17.2H4.6a1.4 1.4 0 0 1-1.4-1.4v-6a1.4 1.4 0 0 1 1.4-1.4h14.8a1.4 1.4 0 0 1 1.4 1.4v6a1.4 1.4 0 0 1-1.4 1.4H17" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" fill="none" />
    <path d="M7 13.8h10v6.6H7z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" fill="none" />
  </>,
  // Attach — a paperclip, drawn in outline like the buttons it sits in.
  paperclip: <path d="m20.2 11.4-7.9 7.9a5.2 5.2 0 0 1-7.4-7.4l8.2-8.2a3.5 3.5 0 0 1 4.9 4.9l-8.2 8.2a1.7 1.7 0 0 1-2.5-2.5l7.6-7.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  // Expiring — a calendar with its days marked.
  calendarSolid: <>
    <rect x="3.4" y="4.8" width="17.2" height="16" rx="3" fill="currentColor" />
    <path d="M8 2.8v4M16 2.8v4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <path d="M3.4 9.6h17.2" stroke={W} strokeWidth="1.4" />
    <path d="M7.4 13h1.4M11.3 13h1.4M15.2 13h1.4M7.4 16.6h1.4M11.3 16.6h1.4" stroke={W} strokeWidth="1.8" strokeLinecap="round" />
  </>,
  // A file, by what it holds: the page with its corner folded and a band of colour.
  filePdf: <>
    <path d="M6.4 2.6h7.6l4.6 4.6v12.2a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2V4.6a2 2 0 0 1 2-2z" fill="currentColor" />
    <path d="M14 2.7v3.4a1.2 1.2 0 0 0 1.2 1.2h3.3z" fill={W} fillOpacity=".55" />
    <path d="M8.2 16.8c1.6-1 2.8-3.4 3.2-5.6.2-1-1-1.2-1.1-.2-.2 1.6 1.8 4.2 4.8 4.8 1 .2 1.1-.9.1-1-2.2-.2-5.4 1-6.8 2.4-.5.5-.1 1 .4.6z" stroke={W} strokeWidth="1.1" strokeLinejoin="round" fill="none" />
  </>,
  fileImg: <>
    <path d="M6.4 2.6h7.6l4.6 4.6v12.2a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2V4.6a2 2 0 0 1 2-2z" fill="currentColor" />
    <path d="M14 2.7v3.4a1.2 1.2 0 0 0 1.2 1.2h3.3z" fill={W} fillOpacity=".55" />
    <path d="m7.4 17.6 2.8-3.6 2 2.4 1.4-1.6 2.6 2.8z" fill={W} />
    <circle cx="9.4" cy="11.4" r="1.2" fill={W} />
  </>,
};

/**
 * A glyph from this module's solid set, else the shared outline registry's
 * icon of that name. Never renders an empty box.
 */
export function Glyph({ name, size = 22 }) {
  const g = GLYPHS[name];
  if (g) return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">{g}</svg>;
  if (ICON_NAMES.includes(name)) return <Icon name={name} size={size} aria-hidden />;
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">{GLYPHS.dot}</svg>;
}

/** The rounded tinted square behind an icon. */
export const Mark = ({ name, tone = 'indigo', size, glyph, round, className = '' }) => (
  <span
    className={`hs-mark hs-t-${tone}${round ? ' hs-mark--round' : ''} ${className}`}
    style={size ? { '--mark': `${size}px` } : undefined}
    aria-hidden
  >
    <Glyph name={name} size={glyph || (size ? Math.round(size * 0.5) : 22)} />
  </span>
);

/* ── Page head ───────────────────────────────────────────────────────────── */

export const PageHead = ({ title, subtitle, children }) => (
  <header className="hs-head">
    <div className="hs-head__text">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="hs-head__acts">{children}</div> : null}
  </header>
);

/**
 * The academic-year card. A native select lies over it, invisible, so it keeps
 * the keyboard, the screen reader and the phone's own picker.
 */
export function YearPicker({ years = [], value, onChange, label = 'Academic Year' }) {
  const current = years.find((y) => y._id === value) || null;
  const fixed = years.length < 2 || !onChange;
  return (
    <div className={`hs-year${fixed ? ' hs-year--static' : ''}`}>
      <span className="hs-year__ico"><Glyph name="calendar" size={21} /></span>
      <span className="hs-year__text">
        <small>{label}</small>
        <strong>{current ? yearLabel(current) : 'Not set'}</strong>
      </span>
      <Icon name="chevronDown" size={16} className="hs-year__chev" aria-hidden />
      {fixed ? null : (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {years.map((y) => (
            <option key={y._id} value={y._id}>
              {yearLabel(y)}{y.status === 'active' ? ' · Current' : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * "+ New ⌄" and its menu: groups of { label, icon, tone, onSelect }.
 * Arrow keys move, Escape closes and hands focus back to the button.
 */
export function NewMenu({ groups = [], label = 'New' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const btn = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    box.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
    };
  }, [open]);

  const onKey = (e) => {
    const items = [...(box.current?.querySelectorAll('[role="menuitem"]') || [])];
    const at = items.indexOf(document.activeElement);
    if (!open) {
      if (e.key === 'ArrowDown' && e.target === btn.current) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="hs-new" ref={box} onKeyDown={onKey}>
      <button
        ref={btn} type="button" className="hs-btn hs-btn--primary hs-btn--lg"
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="plus" size={18} aria-hidden />
        {label}
        <Icon name="chevronDown" size={16} className="hs-btn__chev" aria-hidden />
      </button>
      {open ? (
        <div className="hs-menu" role="menu" id={menuId} aria-label={`${label}…`}>
          {groups.map((g) => (
            <div className="hs-menu__group" key={g.label} role="group" aria-label={g.label}>
              <div className="hs-menu__label" aria-hidden>{g.label}</div>
              {g.items.map((it) => (
                <button
                  key={it.label} type="button" role="menuitem" className="hs-menu__item"
                  onClick={() => { setOpen(false); it.onSelect(); }}
                >
                  <Mark name={it.icon} tone={it.tone} glyph={17} />
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── Tiles ───────────────────────────────────────────────────────────────── */

const MaybeLink = ({ to, className, style, label, children }) => (to
  ? <Link to={to} className={className} style={style} aria-label={label}>{children}</Link>
  : <div className={className} style={style}>{children}</div>);

export const Tiles = ({ children }) => <div className="hs-tiles">{children}</div>;
export const Meters = ({ children }) => <div className="hs-meters">{children}</div>;

/**
 * A tinted figure tile. `grow` is its share of the row — the mockup's tiles
 * are not all one width — and `art` a drawing tucked into the right edge.
 */
export const StatTile = ({ tone, icon, value, label, art, to, grow }) => (
  <MaybeLink to={to} className={`hs-stat hs-s-${tone}`} style={grow ? { '--grow': grow } : undefined} label={to ? `${label}: ${count(value)}` : undefined}>
    <span className="hs-mark" aria-hidden><Glyph name={icon} size={34} /></span>
    <span className="hs-stat__text">
      <strong>{count(value)}</strong>
      <span>{label}</span>
    </span>
    {art ? <span className="hs-stat__art" aria-hidden>{art}</span> : null}
  </MaybeLink>
);

export const Bar = ({ pct, color }) => (
  <span className="hs-bar" role="presentation">
    <i style={{ '--pct': `${Math.max(0, Math.min(100, num(pct)))}%`, ...(color ? { '--bar': color } : null) }} />
  </span>
);

/** A figure, its label, and a meter with the share beside it. */
export const MeterTile = ({ tone, icon, value, label, pct, color, to, grow }) => (
  <MaybeLink to={to} className="hs-mtile" style={grow ? { '--grow': grow } : undefined} label={to ? `${label}: ${count(value)}, ${pct}%` : undefined}>
    <div className="hs-mtile__top">
      <Mark name={icon} tone={tone} glyph={32} />
      <span className="hs-fig"><strong>{count(value)}</strong><span>{label}</span></span>
    </div>
    <div className="hs-meter">
      <Bar pct={pct} color={color} />
      <span className="hs-pct">{num(pct)}%</span>
    </div>
  </MaybeLink>
);

/* ── Cards ───────────────────────────────────────────────────────────────── */

export const Card = ({ busy, className = '', children, label }) => (
  <section className={`hs-card${busy ? ' hs-card--busy' : ''} ${className}`} aria-busy={busy || undefined} aria-label={label}>
    {children}
  </section>
);

export const CardHead = ({ icon, tone = 'indigo', title, side, rule }) => (
  <div className={`hs-card__head${rule ? ' hs-card__head--rule' : ''}`}>
    <Mark name={icon} tone={tone} glyph={23} />
    <h3>{title}</h3>
    {side ? <div className="hs-card__side">{side}</div> : null}
  </div>
);

/** A select in a card head: [{ value, label }]. `width` as the mockup draws it. */
export const CardSelect = ({ value, onChange, options = [], label, width }) => (
  <span className="hs-select">
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} style={width ? { minWidth: width } : undefined}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <Icon name="chevronDown" size={14} aria-hidden />
  </span>
);

export const ViewAll = ({ to, children = 'View All' }) => (
  <Link className="hs-viewall" to={to}>{children}<Icon name="arrowRight" size={14} aria-hidden /></Link>
);

export const Legend = ({ rows }) => (
  <div className="hs-legend">
    {rows.map((r) => (
      <div className="hs-legend__row" key={r.label}>
        <i className="hs-legend__dot" style={{ '--dot': r.color }} />
        <span className="hs-legend__label">{r.label}</span>
        <span className="hs-legend__value">{count(r.value)}</span>
      </div>
    ))}
  </div>
);

export const Note = ({ icon, title, children }) => (
  <div className="hs-note">
    <Mark name={icon} glyph={24} />
    <div style={{ minWidth: 0 }}>
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
    </div>
  </div>
);

/** A figure beside its mark, as a row of a list — Student Residence. */
export const FigRow = ({ icon, tone, value, label, to }) => (
  <MaybeLink to={to} className="hs-rrow" label={to ? `${label}: ${count(value)}` : undefined}>
    <Mark name={icon} tone={tone} glyph={33} />
    <span className="hs-fig"><strong>{count(value)}</strong><span>{label}</span></span>
  </MaybeLink>
);

export const Mini = ({ icon, tone, value, label }) => (
  <div className="hs-mini">
    <Mark name={icon} tone={tone} glyph={25} />
    <span className="hs-fig"><strong>{value}</strong><span>{label}</span></span>
  </div>
);

export const Empty = ({ icon = 'dot', art, title, children, action }) => (
  <div className="hs-empty">
    <div className="hs-empty__art">{art || <Mark name={icon} tone="slate" size={44} glyph={22} />}</div>
    <h4>{title}</h4>
    {children ? <p>{children}</p> : null}
    {action}
  </div>
);

/* ── Loading and failure ─────────────────────────────────────────────────── */

const Sk = ({ h, style }) => <div className="hs-skel" style={{ height: h, ...style }} />;

/** The dashboard's own outline, in grey, while its one call is in flight. */
export const DashboardSkeleton = () => (
  <div aria-busy="true" aria-live="polite">
    <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Loading the dashboard…</span>
    <div className="hs-head">
      <div><Sk h={30} style={{ width: 240 }} /><Sk h={16} style={{ width: 420, marginTop: 10 }} /></div>
      <div className="hs-head__acts"><Sk h={48} style={{ width: 233 }} /><Sk h={44} style={{ width: 112 }} /></div>
    </div>
    <div className="hs-tiles" style={{ marginTop: 22 }}>{[270, 205, 213, 255, 258].map((g) => <Sk key={g} h={82} style={{ '--grow': g }} />)}</div>
    <div className="hs-meters" style={{ marginTop: 14 }}>{[293, 295, 296, 327].map((g) => <Sk key={g} h={92} style={{ '--grow': g }} />)}</div>
    <div className="hs-grid hs-grid--a" style={{ marginTop: 16 }}>{[1, 2, 3].map((k) => <Sk key={k} h={302} />)}</div>
    <div className="hs-grid hs-grid--b" style={{ marginTop: 16 }}>{[1, 2, 3].map((k) => <Sk key={k} h={190} />)}</div>
  </div>
);

export const LoadError = ({ error, onRetry }) => (
  <section className="hs-card" style={{ marginTop: 22, minHeight: 260 }}>
    <Empty
      art={<Mark name="alertTri" tone="red" size={48} glyph={24} />}
      title="The dashboard did not load"
      action={onRetry ? <button type="button" className="hs-btn hs-btn--primary" onClick={onRetry}><Icon name="refresh" size={16} aria-hidden />Try again</button> : null}
    >
      {error?.message || 'The server did not answer. Nothing has been changed.'}
    </Empty>
  </section>
);

/* ── Data ────────────────────────────────────────────────────────────────── */

/**
 * The one loader the screen uses. Keeps the previous answer on screen while
 * the next is fetched, and drops a reply that arrives after a newer request.
 * The `alive` flag is per effect run, so React.StrictMode's mount → unmount →
 * mount in development cannot leave the screen on its skeleton.
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
      .catch((e) => { if (alive && mine === seq.current) setError(e); })
      .finally(() => { if (alive && mine === seq.current) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}
